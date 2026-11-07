// The deterministic rules engine. Pure function: same inputs, same decision. No I/O, no AI.
// Everything the agent says (purpose, URL text) is data here; only the provider's real quote and
// the stored policy decide the outcome.
import type { PolicyRules, TaskStatus } from "@/db/schema";
import { fmt$ } from "@/lib/money/usdc";
import { evaluateIntent, type IntentResult } from "@/lib/intent/intentlock";

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
  /** The full URL being bought (normalised). Used by the shopping list. */
  url?: string;
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
  /** Parent tasks, nearest first, when this is a sub-task given to a hired agent. Their status and budget apply too. */
  parents?: ParentTask[];
  /** Already reserved or paid to this provider on this task (for per-provider caps). */
  providerSpent?: bigint;
  /** What this organisation last paid for the same item (host + path), if ever. Price memory. */
  lastPaidPrice?: bigint | null;
  /** The provider's own description of the item, from its 402 quote. IntentLock reads it with the URL. */
  providerDescription?: string | null;
  /** Purchases this task has already made or has waiting (not declined ones), for the mandate's purchase cap. */
  taskPurchaseCount?: number;
}

/** Default: a person decides if an item costs more than 50% above what was last paid for it. */
export const DEFAULT_PRICE_JUMP_PCT = 50;

export interface ParentTask {
  id: string;
  title: string;
  status: TaskStatus;
  budget: bigint;
  reserved: bigint;
  spent: bigint;
}

export interface PolicyResult {
  decision: Decision;
  reasonCodes: string[];
  /** Human-readable one-liners, same order as the failing codes. */
  explanations: string[];
  remainingAfter: bigint;
  /** What IntentLock concluded (absent when the input had no URL). */
  intent?: IntentResult;
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

export type AccessInput = Pick<PolicyInput, "now" | "task" | "policy" | "agent" | "host" | "parents" | "taskPurchaseCount">;

/** Is this URL on the task's shopping list? "host/path" prefixes; an empty or absent list means no list. */
export function onShoppingList(url: string | undefined, items: string[] | undefined): boolean {
  const list = (items ?? []).map((i) => i.trim().toLowerCase().replace(/^https?:\/\//, "")).filter(Boolean);
  if (!list.length) return true;
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const target = `${u.host}${u.pathname}`.toLowerCase();
  return list.some((item) => target === item || target.startsWith(item.endsWith("/") ? item : `${item}/`) || target === item.replace(/\/$/, ""));
}

/**
 * Checks that don't depend on a price: who is asking, for which task, from which host.
 * Run before Aerar contacts the provider at all, so a disallowed host is never even called.
 */
export function accessChecks(input: AccessInput): { declines: [string, string][]; passes: string[] } {
  const { task, policy, agent } = input;
  const rules = policy.rules;
  const declines: [string, string][] = [];
  const passes: string[] = [];
  if (agent.revoked) declines.push(["AGENT_REVOKED", "This agent's key has been revoked."]);
  if (!agent.assignedToTask) declines.push(["AGENT_NOT_ASSIGNED", "This agent is not assigned to the task."]);
  if (task.status !== "active") declines.push(["TASK_NOT_ACTIVE", `The task is ${task.status}.`]);
  else passes.push("TASK_ACTIVE");
  // Pausing a lead task stops every agent it hired, all the way down.
  const stopped = (input.parents ?? []).find((p) => p.status !== "active");
  if (stopped) declines.push(["PARENT_TASK_NOT_ACTIVE", `The task that hired this agent ("${stopped.title}") is ${stopped.status}.`]);
  if (task.deadline && input.now > task.deadline) declines.push(["TASK_DEADLINE_PASSED", "The task deadline has passed."]);
  if (rules.expiresAt && input.now > new Date(rules.expiresAt))
    declines.push(["MANDATE_EXPIRED", `Policy v${policy.version} expired at ${rules.expiresAt}.`]);
  if (rules.blockedProviders?.length && hostAllowed(input.host, rules.blockedProviders))
    declines.push(["PROVIDER_BLOCKED", `${input.host} is on this task's blocked list.`]);
  else if (!hostAllowed(input.host, rules.allowedProviders))
    declines.push(["PROVIDER_NOT_ALLOWED", `${input.host} is not on this task's provider list.`]);
  else passes.push("PROVIDER_ALLOWED");
  if (rules.maxPurchases != null && (input.taskPurchaseCount ?? 0) >= rules.maxPurchases)
    declines.push(["PURCHASE_LIMIT_REACHED", `This task may make ${rules.maxPurchases} purchases and has made ${input.taskPurchaseCount}.`]);
  return { declines, passes };
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const { task, policy, quote, rails } = input;
  const rules = policy.rules;
  const { declines, passes } = accessChecks(input);
  const needsApproval: [string, string][] = [];

  // Where the money goes
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
  // A hired agent's spend counts against every task above it.
  if (input.parents?.length) {
    const short = input.parents.find((p) => p.budget - p.reserved - p.spent < quote.amount);
    if (short) declines.push(["PARENT_BUDGET_EXCEEDED", `Not enough left on "${short.title}", the task that hired this agent.`]);
    else passes.push("WITHIN_PARENT_BUDGET");
  }
  const cap = rules.providerCaps?.[input.host.toLowerCase()];
  if (cap != null) {
    if ((input.providerSpent ?? 0n) + quote.amount > BigInt(cap)) declines.push(["PROVIDER_CAP_REACHED", `This task's cap for ${input.host} would be exceeded.`]);
    else passes.push("WITHIN_PROVIDER_CAP");
  }
  if (input.agentPurchasesLastHour >= rules.maxPurchasesPerHour)
    declines.push(["RATE_LIMITED", `Agent already made ${input.agentPurchasesLastHour} purchases this hour.`]);

  // IntentLock: does this item serve what the task was authorised for? Judged from the item (URL + the provider's own
  // description), never from the agent's stated reason. Off-purpose is a decline a person can't approve; unclear holds.
  const intent = input.url ? evaluateIntent({ taskCategories: rules.categories, url: input.url, providerDescription: input.providerDescription }) : undefined;
  if (intent?.outcome === "mismatch") declines.push(["INTENT_MISMATCH", intent.explanation]);
  else if (intent?.outcome === "uncertain") {
    if (rules.ifUncertain === "refuse") declines.push(["INTENT_UNCERTAIN_REFUSED", intent.explanation]);
    else needsApproval.push(["INTENT_UNCERTAIN", intent.explanation]);
  } else if (intent?.outcome === "match") passes.push("INTENT_MATCH");

  // Human in the loop
  if (rules.allowedItems?.length) {
    if (onShoppingList(input.url, rules.allowedItems)) passes.push("ON_SHOPPING_LIST");
    else needsApproval.push(["NOT_ON_SHOPPING_LIST", "This item isn't on the task's shopping list."]);
  }
  // Price memory: the same item suddenly costing a lot more is how a compromised or greedy provider shows up.
  const jump = rules.priceJumpPct ?? DEFAULT_PRICE_JUMP_PCT;
  if (input.lastPaidPrice && input.lastPaidPrice > 0n && jump > 0) {
    if (quote.amount * 100n > input.lastPaidPrice * BigInt(100 + jump))
      needsApproval.push(["PRICE_JUMPED", `This item cost ${fmt$(input.lastPaidPrice)} last time; now ${fmt$(quote.amount)}.`]);
    else passes.push("PRICE_AS_USUAL");
  }
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
      intent,
    };
  if (needsApproval.length)
    return {
      decision: "needs_approval",
      reasonCodes: [...passes, ...needsApproval.map((d) => d[0])],
      explanations: needsApproval.map((d) => d[1]),
      remainingAfter,
      intent,
    };
  return { decision: "approve", reasonCodes: passes, explanations: [], remainingAfter, intent };
}
