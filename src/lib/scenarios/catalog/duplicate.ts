// Problem 2: the same thing is paid for twice (two agents, retries, parallel races).
import { eq } from "drizzle-orm";
import { purchases } from "@/db/schema";
import { play, type Scenario } from "../stage";

const FX = "https://data.example.com/fx?base=USD";

export const duplicate: Scenario[] = [
  {
    id: "two-agents-same-report",
    problem: "duplicate",
    title: "Two agents buy the same report on the same night",
    story:
      "The researcher buys today's FX rates at 01:00. At 03:00 the analyst, working on the same project, asks for exactly the same data (written slightly differently).",
    expected: "Pay once, then serve the stored copy to the second agent for $0.",
    run: () =>
      play({ offers: { "/fx": { amount: 10_000n } } }, async (s, log, check) => {
        log("01:00 researcher: buy " + FX);
        const first = await s.buy("researcher", FX);
        log(first);
        log("03:00 analyst: buy https://DATA.example.com/fx?base=USD#latest (same data, different spelling)");
        const second = await s.buy("analyst", "https://DATA.example.com/fx?base=USD#latest");
        log(second);
        check.that(first.status === "delivered", "first purchase is paid and delivered");
        check.that(second.status === "reused" && second.reusedFromId === first.id, "second is served from the first");
        check.that(second.responseBody === first.responseBody, "both agents get the same content");
        check.that(s.rail.calls.pay.length === 1, "exactly one payment");
        return "$0.01 paid once, $0.01 avoided.";
      }),
  },
  {
    id: "retry-after-timeout",
    problem: "duplicate",
    title: "An agent retries after a timeout",
    story:
      "The agent's connection drops while a purchase is in flight, so it sends the identical request again with the same request ID, the way most HTTP clients retry.",
    expected: "Recognise the retry by its idempotency key and return the original purchase without paying again.",
    run: () =>
      play({ offers: { "/fx": { amount: 10_000n } } }, async (s, log, check) => {
        log("researcher: buy FX rates (request ID nightly-fx-0412)");
        const a = await s.buy("researcher", FX, { idempotencyKey: "nightly-fx-0412" });
        log(a);
        log("researcher (timeout, retrying): same request, same ID");
        const b = await s.buy("researcher", FX, { idempotencyKey: "nightly-fx-0412" });
        log(b.id === a.id ? `Returned the original purchase ${a.id}, no new payment` : b);
        check.that(b.id === a.id, "retry returns the same purchase");
        check.that(s.rail.calls.pay.length === 1, "exactly one payment");
        return "$0.01 paid once. Retries are safe.";
      }),
  },
  {
    id: "parallel-race",
    problem: "duplicate",
    title: "Ten copies of the same request arrive at once",
    story:
      "A buggy agent loop fires the same purchase ten times in parallel, the duplicate-settlement race researchers found in real x402 deployments.",
    expected: "Exactly one wins and pays; the other nine get that same purchase back.",
    run: () =>
      play({ offers: { "/fx": { amount: 10_000n } } }, async (s, log, check) => {
        log("researcher: 10 identical requests in parallel (same request ID)");
        const all = await Promise.all(
          Array.from({ length: 10 }, () => s.buy("researcher", FX, { idempotencyKey: "race-1" })),
        );
        const ids = new Set(all.map((p) => p.id));
        log(all[0]);
        log(`${all.length} responses, ${ids.size} purchase record, ${s.rail.calls.pay.length} payment`);
        check.that(ids.size === 1, "all ten responses are the same purchase");
        check.that(s.rail.calls.pay.length === 1, "exactly one payment");
        return "$0.01 paid once instead of $0.10.";
      }),
  },
  {
    id: "reuse-window-expires",
    problem: "duplicate",
    title: "Yesterday's data is not today's data",
    story:
      "The task only treats a purchase as fresh for one minute. The agent asks for the same rates again two minutes later, when they may have changed.",
    expected: "Buy again once the task's reuse window has passed, so agents never get stale data by accident.",
    run: () =>
      play({ offers: { "/fx": { amount: 10_000n } }, rules: { reuseWindowSeconds: 60 } }, async (s, log, check) => {
        log("researcher: buy FX rates");
        const a = await s.buy("researcher", FX);
        log(a);
        log("two minutes later, analyst: same request (reuse window is 60 seconds)");
        const later = new Date(Date.now() + 120_000);
        const b = await s.buy("analyst", FX, { now: later, purpose: "Fresh rates", idempotencyKey: "after-window" });
        log(b);
        check.that(b.status === "delivered", "bought again after the window");
        check.that(s.rail.calls.pay.length === 2, "two payments, by design");
        return "$0.02 paid on purpose: freshness is a rule the operator sets per task.";
      }),
  },
  {
    id: "memory-poisoned",
    problem: "duplicate",
    title: "A remembered result is altered",
    story:
      "The FX rates bought an hour ago are kept so other agents can reuse them for $0. Someone edits the stored copy to plant false numbers before the next agent asks.",
    expected:
      "Before reusing anything, Aerar checks it against the hash taken at delivery. The altered copy is never served; Aerar buys a fresh one under every rule and records what happened.",
    run: () =>
      play({ offers: { "/fx": { amount: 10_000n } } }, async (s, log, check) => {
        const a = await s.buy("researcher", FX);
        log(a);
        await s.db.update(purchases).set({ responseBody: '{"USD_EUR":"9.99","note":"planted"}' }).where(eq(purchases.id, a.id));
        log("The stored copy is edited to plant false rates");
        const b = await s.buy("analyst", FX, { purpose: "Rates for the memo" });
        log(b);
        check.that(b.status === "delivered" && b.reasonCodes.includes("MEMORY_ALTERED"), "the altered copy isn't served; a fresh one is bought");
        check.that(!b.responseBody?.includes("planted"), "the agent never sees the planted numbers");
        return "$0.02 paid instead of serving poisoned data for free. Reuse only ever serves what was delivered.";
      }),
  },
];
