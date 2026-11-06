// Problem 6: spending gets out of hand (loops, exhausted budgets, parallel overspend, expired mandates).
import { eq } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { play, usd, type Scenario } from "../stage";

const HOST = "https://data.example.com";
const offers = (n: number, amount: bigint) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`/item-${i + 1}`, { amount }]));

export const runaway: Scenario[] = [
  {
    id: "looping-agent",
    problem: "runaway",
    title: "An agent gets stuck in a loop",
    story:
      "A bug makes the agent buy a new $0.01 page every few seconds, all night. Each purchase is tiny, so no single one looks wrong.",
    expected: "Cap purchases per agent per hour; stop the loop at the cap even though every item is cheap.",
    run: () =>
      play({ offers: offers(12, 10_000n), rules: { maxPurchasesPerHour: 5 } }, async (s, log, check) => {
        log("researcher: 12 different $0.01 purchases in a row (limit: 5 per hour)");
        const results = [];
        for (let i = 1; i <= 12; i++) results.push(await s.buy("researcher", `${HOST}/item-${i}`));
        const paid = results.filter((p) => p.status === "delivered").length;
        const limited = results.filter((p) => p.reasonCodes.includes("RATE_LIMITED")).length;
        log(`${paid} paid, then ${limited} declined: "Agent already made 5 purchases this hour"`);
        check.that(paid === 5, "exactly 5 paid");
        check.that(limited === 7, "the other 7 declined as rate-limited");
        return `${usd(50_000n)} spent instead of ${usd(120_000n)}, and the loop is visible in the morning report.`;
      }),
  },
  {
    id: "budget-runs-out",
    problem: "runaway",
    title: "The task's budget runs out",
    story: "A task has $0.05 for the night. The agent keeps buying $0.02 reports.",
    expected: "Pay until the budget can't cover the next price, then decline, never going over.",
    run: () =>
      play({ offers: offers(4, 20_000n), budget: 50_000n }, async (s, log, check) => {
        for (let i = 1; i <= 4; i++) log(await s.buy("researcher", `${HOST}/item-${i}`));
        const [t] = await s.db.select().from(tasks).where(eq(tasks.id, s.task.id));
        log(`Budget: ${usd(t.spent)} of ${usd(t.budget)} used, ${usd(t.budget - t.spent)} left`);
        check.that(t.spent === 40_000n, "spent $0.04 of $0.05");
        check.that(t.spent <= t.budget, "never over budget");
        return "Stopped at the budget, to the cent.";
      }),
  },
  {
    id: "parallel-overspend",
    problem: "runaway",
    title: "Many agents spend at the same moment",
    story:
      "Ten purchases of $0.01 hit a task with $0.05 left at the same instant, the classic race where each sees enough money and all of them pay.",
    expected: "Lock the budget while reserving, so at most $0.05 is ever committed.",
    run: () =>
      play({ offers: offers(10, 10_000n), budget: 50_000n }, async (s, log, check) => {
        log("10 purchases of $0.01 at the same instant, $0.05 budget");
        const results = await Promise.all(
          Array.from({ length: 10 }, (_, i) => s.buy(i % 2 ? "analyst" : "researcher", `${HOST}/item-${i + 1}`)),
        );
        const paid = results.filter((p) => p.status === "delivered").length;
        const [t] = await s.db.select().from(tasks).where(eq(tasks.id, s.task.id));
        log(`${paid} paid, ${results.length - paid} declined for budget; spent ${usd(t.spent)} of ${usd(t.budget)}`);
        check.that(paid === 5, "exactly 5 paid");
        check.that(t.spent === 50_000n, "spent exactly the budget, not more");
        return "No race can overspend a task.";
      }),
  },
  {
    id: "mandate-expired",
    problem: "runaway",
    title: "Last night's permission is used this morning",
    story: "The operator allowed spending only until 06:00. At 09:00 an agent that kept running tries to buy more.",
    expected: "Permissions expire on time; anything after the deadline is declined.",
    run: () =>
      play({ offers: { "/a": { amount: 10_000n } }, rules: { expiresAt: new Date(Date.now() - 3 * 3600_000).toISOString() } }, async (s, log, check) => {
        log("09:00 researcher: buy /a (the task's rules expired at 06:00)");
        const p = await s.buy("researcher", `${HOST}/a`);
        log(p);
        check.that(p.status === "declined" && p.reasonCodes.includes("MANDATE_EXPIRED"), "declined: permission expired");
        check.that(s.rail.calls.quote.length === 0, "the provider is never contacted");
        return "$0.00 paid. The night shift ends when you said it would.";
      }),
  },
];
