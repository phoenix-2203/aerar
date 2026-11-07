// Problem 6: spending gets out of hand (loops, exhausted budgets, parallel overspend, expired mandates).
import { eq } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { hireAgent, setTaskStatus } from "@/lib/workspace";
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
  {
    id: "hired-agent-overspend",
    problem: "runaway",
    title: "An agent hires another agent, and together they overspend",
    story:
      "The lead agent has a $0.10 task. It hires a helper and gives it $0.05. The lead then spends $0.08 itself, and the helper, still inside its own $0.05, tries to spend $0.04.",
    expected: "A hired agent's spend counts against the task that hired it. The helper is refused because the lead's task has only $0.02 left.",
    run: () =>
      play({ budget: 100_000n, offers: { "/lead": { amount: 80_000n }, "/helper": { amount: 40_000n } }, rules: { approvalAbove: "100000" } }, async (s, log, check) => {
        const h = await hireAgent(s.db, { parentTaskId: s.task.id, title: "Helper", purpose: "help", budget: 50_000n, agentName: "helper", by: "researcher" });
        log("researcher hires a helper with a $0.05 budget, carved from its $0.10 task");
        const lead = await s.buy("researcher", `${HOST}/lead`);
        log(lead);
        const helper = await submitPurchase(s.ctx, h.agent.id, { taskId: h.task.id, url: `${HOST}/helper`, method: "GET", body: null, purpose: "helping", idempotencyKey: "helper-1" });
        log(helper);
        check.that(lead.status === "delivered", "the lead's own purchase is paid");
        check.that(helper.status === "declined", "the helper is refused");
        check.that(helper.reasonCodes.includes("PARENT_BUDGET_EXCEEDED"), "reason: the lead's task doesn't have enough left");
        return `${usd(80_000n)} spent of the $0.10 task. The pair can never spend more than the task that hired them.`;
      }),
  },
  {
    id: "stop-the-boss-stops-the-team",
    problem: "runaway",
    title: "You pause an agent, but the agents it hired keep buying",
    story: "Something looks off at 2 a.m., so you pause the lead agent's task. It had hired a helper that is still running.",
    expected: "Pausing a task stops every agent it hired, all the way down.",
    run: () =>
      play({ offers: { "/helper": { amount: 10_000n } } }, async (s, log, check) => {
        const h = await hireAgent(s.db, { parentTaskId: s.task.id, title: "Helper", purpose: "help", budget: 50_000n, agentName: "helper", by: "researcher" });
        log("researcher has hired a helper");
        await setTaskStatus(s.db, s.task.id, "paused", "you");
        log("You pause the researcher's task");
        const helper = await submitPurchase(s.ctx, h.agent.id, { taskId: h.task.id, url: `${HOST}/helper`, method: "GET", body: null, purpose: "still going", idempotencyKey: "helper-2" });
        log(helper);
        check.that(helper.status === "declined", "the helper is stopped");
        check.that(helper.reasonCodes.includes("PARENT_TASK_NOT_ACTIVE"), "reason: the task that hired it is paused");
        return "$0.00 spent after the pause. One switch stops the whole team.";
      }),
  },
  {
    id: "purchase-cap",
    problem: "runaway",
    title: "A cheap loop that never trips the budget",
    story: "The mandate says three purchases is enough for this job. The agent keeps buying $0.001 items: far too cheap to worry the budget, but it never stops.",
    expected: "The signed mandate's purchase cap stops it at three, whatever each one costs.",
    run: () =>
      play({ offers: offers(6, 1_000n), rules: { maxPurchases: 3 } }, async (s, log, check) => {
        const out = [];
        for (let i = 1; i <= 6; i++) out.push(await s.buy("researcher", `${HOST}/item-${i}`));
        out.forEach((p) => log(p));
        check.that(out.filter((p) => p.status === "delivered").length === 3, "three purchases are paid");
        check.that(out.slice(3).every((p) => p.reasonCodes.includes("PURCHASE_LIMIT_REACHED")), "the rest are refused: the purchase cap is reached");
        return `${usd(await s.spent())} paid for three items, then the loop was cut off.`;
      }),
  },
];
