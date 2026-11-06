// The deterministic rules engine. Pure function: same inputs, same decision. No I/O, no AI.
// Everything the agent says (purpose, URL text) is data here; only the provider's real quote and
// the stored policy decide the outcome.
import type { PolicyRules, TaskStatus } from "@/db/schema";

export type Decision = "approve" | "needs_approval" | "decline";

export interface PolicyInput {
  now: Date;
  task: {
    status: TaskStatus;
    budget: bigint;
    reserved: bigint;
    spent: bigint;
    deadline: Date | null;
  };
  policy: { version: number; rules: PolicyRules };
  agent: { revoked: boolean; assignedToTask: boolean };
  host: string;
  quote: {
    scheme: string;
    network: string;
    asset: string;
    amount: bigint;
    payTo: string;
  };
  /** Payee recorded the first time we paid this host, if any. */
  knownPayTo: string | null;
  /** Purchases this agent made (any status that reached payment) in the last hour. */
  agentPurchasesLastHour: number;
  /** What this deployment can settle on. */
  rails: { network: string; asset: string; scheme: string };
}

export interface PolicyResult {
  decision: Decision;
  reasonCodes: string[];
  /** Human-readable one-liners, same order as the failing codes. */
  explanations: string[];
  remainingAfter: bigint;
}

export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (!r) return false;
    if (r.startsWith("*.")) return h.endsWith(r.slice(1)) && h.length > r.length - 1;
    return h === r;
  });
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const { task, policy, agent, quote, rails } = input;
  const rules = policy.rules;
  const declines: [string, string][] = [];
  const passes: string[] = [];
  const needsApproval: [string, string][] = [];

  // Who and when
  if (agent.revoked) declines.push(["AGENT_REVOKED", "This agent's key has been revoked."]);
  if (!agent.assignedToTask) declines.push(["AGENT_NOT_ASSIGNED", "This agent is not assigned to the task."]);
  if (task.status !== "active") declines.push(["TASK_NOT_ACTIVE", `The task is ${task.status}.`]);
  else passes.push("TASK_ACTIVE");
  if (task.deadline && input.now > task.deadline) declines.push(["TASK_DEADLINE_PASSED", "The task deadline has passed."]);
  if (rules.expiresAt && input.now > new Date(rules.expiresAt))
    declines.push(["MANDATE_EXPIRED", `Policy v${policy.version} expired at ${rules.expiresAt}.`]);

  // Where the money goes
  if (!hostAllowed(input.host, rules.allowedProviders))
    declines.push(["PROVIDER_NOT_ALLOWED", `${input.host} is not on this task's provider list.`]);
  else passes.push("PROVIDER_ALLOWED");
  if (quote.network !== rails.network)
    declines.push(["NETWORK_NOT_ALLOWED", `Quote is on ${quote.network}; only ${rails.network} is allowed.`]);
  if (quote.asset.toLowerCase() !== rails.asset.toLowerCase())
    declines.push(["ASSET_NOT_ALLOWED", `Quote asks for token ${quote.asset}; only USDC (${rails.asset}) is allowed.`]);
  if (quote.scheme !== rails.scheme)
    declines.push(["SCHEME_NOT_SUPPORTED", `Payment scheme "${quote.scheme}" is not supported.`]);
  if (!/^0x[0-9a-fA-F]{40}$/.test(quote.payTo)) declines.push(["INVALID_PAYEE", "The quoted payee is not a valid address."]);
  else if (input.knownPayTo && input.knownPayTo.toLowerCase() !== quote.payTo.toLowerCase())
    declines.push([
      "PAYEE_CHANGED",
      `${input.host} used to be paid at ${input.knownPayTo}; this quote pays ${quote.payTo}.`,
    ]);

  // How much
  if (quote.amount <= 0n) declines.push(["INVALID_AMOUNT", "Quoted amount must be positive."]);
  const maxPer = BigInt(rules.maxPerPurchase);
  if (quote.amount > maxPer) declines.push(["OVER_PER_PURCHASE_LIMIT", "Price is above the per-purchase limit."]);
  else passes.push("WITHIN_PER_PURCHASE_LIMIT");
  const available = task.budget - task.reserved - task.spent;
  if (quote.amount > available) declines.push(["OVER_TASK_BUDGET", "Not enough budget left on the task."]);
  else passes.push("WITHIN_TASK_BUDGET");
  if (input.agentPurchasesLastHour >= rules.maxPurchasesPerHour)
    declines.push(["RATE_LIMITED", `Agent already made ${input.agentPurchasesLastHour} purchases this hour.`]);

  // Human in the loop
  if (quote.amount > BigInt(rules.approvalAbove))
    needsApproval.push(["ABOVE_APPROVAL_THRESHOLD", "Price is above the auto-approve threshold."]);
  else passes.push("BELOW_APPROVAL_THRESHOLD");

  const remainingAfter = available - quote.amount;
  if (declines.length)
    return {
      decision: "decline",
      reasonCodes: declines.map((d) => d[0]),
      explanations: declines.map((d) => d[1]),
      remainingAfter: available,
    };
  if (needsApproval.length)
    return {
      decision: "needs_approval",
      reasonCodes: [...passes, ...needsApproval.map((d) => d[0])],
      explanations: needsApproval.map((d) => d[1]),
      remainingAfter,
    };
  return { decision: "approve", reasonCodes: passes, explanations: [], remainingAfter };
}
