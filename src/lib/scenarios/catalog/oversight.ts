// Problem 5: people don't trust agents with money yet (approvals, rejections, kill switches).
import { approvePurchase, rejectPurchase } from "@/lib/purchase/pipeline";
import { authenticateAgent, revokeAgent, setBudget, setTaskStatus } from "@/lib/workspace";
import { play, type Scenario } from "../stage";

const HOST = "https://data.example.com";

export const oversight: Scenario[] = [
  {
    id: "approve-expensive",
    problem: "oversight",
    title: "An expensive purchase waits for a person",
    story:
      "At 02:00 the agent wants a $0.08 premium report. The task pays automatically only up to $0.05, so the decision waits for the operator, who approves it at 08:00.",
    expected: "Hold it without paying, show it in the approval queue, and pay the exact quote once approved.",
    run: () =>
      play({ offers: { "/premium": { amount: 80_000n } } }, async (s, log, check) => {
        log("02:00 researcher: buy /premium ($0.08)");
        const held = await s.buy("researcher", `${HOST}/premium`, { purpose: "Deep dive for the client memo" });
        log(held);
        const paidWhileWaiting = s.rail.calls.pay.length;
        log("08:00 operator reads the morning report and clicks Approve $0.08");
        const done = await approvePurchase(s.ctx, held.id, "operator");
        log(done);
        check.that(held.status === "awaiting_approval", "held for approval");
        check.that(paidWhileWaiting === 0, "nothing paid while waiting");
        check.that(done.status === "delivered" && done.approvedBy === "operator", "paid after approval, approver recorded");
        return "$0.08 paid, with a person's name on the decision.";
      }),
  },
  {
    id: "reject-expensive",
    problem: "oversight",
    title: "The operator says no",
    story: "The agent asks for a $0.09 report the operator thinks isn't worth it.",
    expected: "A rejection pays nothing and is recorded with who rejected it.",
    run: () =>
      play({ offers: { "/premium": { amount: 90_000n } } }, async (s, log, check) => {
        const held = await s.buy("researcher", `${HOST}/premium`);
        log(held);
        log("operator: Decline (\"we already have this from last week\")");
        const r = await rejectPurchase(s.ctx, held.id, "operator", "We already have this from last week");
        log(r);
        check.that(r.status === "rejected" && r.approvedBy === "operator", "rejected, by whom recorded");
        check.that(s.rail.calls.pay.length === 0, "no money moves");
        return "$0.00 paid. The agent is told no, with the reason.";
      }),
  },
  {
    id: "approval-cant-override-rules",
    problem: "oversight",
    title: "Approving can't break the budget",
    story:
      "A $0.08 purchase waits for approval. Meanwhile the operator cuts the task's budget to $0.05. Later someone clicks Approve on the old request.",
    expected: "Approval runs under the current rules; a hard limit still wins, so it's declined.",
    run: () =>
      play({ offers: { "/premium": { amount: 80_000n } } }, async (s, log, check) => {
        const held = await s.buy("researcher", `${HOST}/premium`);
        log(held);
        await setBudget(s.db, s.task.id, 50_000n, "operator");
        log("operator: task budget cut to $0.05");
        log("someone: Approve on the old $0.08 request");
        const r = await approvePurchase(s.ctx, held.id, "operator");
        log(r);
        check.that(r.status === "declined" && r.reasonCodes.includes("OVER_TASK_BUDGET"), "declined: over the new budget");
        check.that(s.rail.calls.pay.length === 0, "no money moves");
        return "$0.00 paid. A click can't override a limit.";
      }),
  },
  {
    id: "revoke-agent",
    problem: "oversight",
    title: "Pull an agent's key in the middle of the night",
    story: "The operator sees an agent behaving oddly and revokes its key from the dashboard.",
    expected: "The key stops working at once and any further request from that agent is declined.",
    run: () =>
      play({ offers: { "/a": { amount: 10_000n }, "/b": { amount: 10_000n } } }, async (s, log, check) => {
        log(await s.buy("researcher", `${HOST}/a`));
        await revokeAgent(s.db, s.agentIds.researcher, "operator");
        log("operator: revoke the researcher's key");
        const keyWorks = !!(await authenticateAgent(s.db, s.apiKey));
        log(keyWorks ? "Key still accepted (BAD)" : "The key is no longer accepted by the API");
        const p = await s.buy("researcher", `${HOST}/b`);
        log(p);
        check.that(!keyWorks, "revoked key no longer authenticates");
        check.that(p.status === "declined" && p.reasonCodes.includes("AGENT_REVOKED"), "further purchases declined");
        return "One click stops an agent's spending.";
      }),
  },
  {
    id: "pause-task",
    problem: "oversight",
    title: "Pause a whole job",
    story: "The client puts the project on hold, so the operator pauses the task. Agents are still running.",
    expected: "Every purchase for a paused task is declined until it's resumed.",
    run: () =>
      play({ offers: { "/a": { amount: 10_000n } } }, async (s, log, check) => {
        await setTaskStatus(s.db, s.task.id, "paused", "operator");
        log("operator: pause the task");
        const p = await s.buy("analyst", `${HOST}/a`);
        log(p);
        await setTaskStatus(s.db, s.task.id, "active", "operator");
        log("operator: resume the task");
        const q = await s.buy("analyst", `${HOST}/a`);
        log(q);
        check.that(p.status === "declined" && p.reasonCodes.includes("TASK_NOT_ACTIVE"), "declined while paused");
        check.that(q.status === "delivered", "works again after resuming");
        return "Spending follows the job's status.";
      }),
  },
];
