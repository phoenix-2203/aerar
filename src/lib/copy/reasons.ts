// Every word Aerar uses for an outcome or a reason, in one place. The dashboard, the public pages, the agent
// API and MCP all read from here, so the wording can't drift. Copy rules: docs/design-brief.md ("Words").

/** How a reason code reads in a decision: a check that passed, one that held it for a person, or one that stopped it. */
export type ReasonKind = "pass" | "hold" | "fail" | "info";

interface Reason {
  kind: ReasonKind;
  /** One plain sentence, lower-case start so it can follow "Declined: ". */
  text: string;
}

export const REASONS: Record<string, Reason> = {
  // Access: checked before the provider is contacted at all.
  TASK_ACTIVE: { kind: "pass", text: "the task is active" },
  TASK_NOT_ACTIVE: { kind: "fail", text: "the task isn't active (paused or closed)" },
  TASK_DEADLINE_PASSED: { kind: "fail", text: "the task's deadline has passed" },
  MANDATE_EXPIRED: { kind: "fail", text: "the task's spending permission has expired" },
  AGENT_REVOKED: { kind: "fail", text: "this agent's key was revoked" },
  AGENT_NOT_ASSIGNED: { kind: "fail", text: "this agent isn't assigned to the task" },
  PROVIDER_ALLOWED: { kind: "pass", text: "the provider is on the task's allowed list" },
  PROVIDER_NOT_ALLOWED: { kind: "fail", text: "the provider isn't on the task's allowed list" },

  PROVIDER_BLOCKED: { kind: "fail", text: "the provider is on the task's blocked list" },
  PURCHASE_LIMIT_REACHED: { kind: "fail", text: "the task has made all the purchases its mandate allows" },
  MANDATE_INVALID: { kind: "fail", text: "the task's rules don't match the mandate that was signed, so nothing is bought until a person signs them again" },

  // IntentLock: does the item serve what the task is for?
  INTENT_MATCH: { kind: "pass", text: "the item fits what the task is for" },
  INTENT_MISMATCH: { kind: "fail", text: "the item doesn't serve what this task is for, even though the budget would allow it" },
  INTENT_UNCERTAIN: { kind: "hold", text: "Aerar can't tell what the item is, so a person decides whether it serves the task" },
  INTENT_UNCERTAIN_REFUSED: { kind: "fail", text: "Aerar can't tell what the item is, and this task refuses anything it can't place" },

  // Memory.
  MEMORY_ALTERED: { kind: "info", text: "a remembered copy had been altered since delivery, so it wasn't reused" },
  REUSED_EARLIER_PURCHASE: { kind: "info", text: "an identical purchase was already made, so its result was reused" },

  // Quote.
  NO_PAYMENT_REQUESTED: { kind: "info", text: "the provider didn't ask for payment" },
  PROVIDER_UNREACHABLE: { kind: "fail", text: "the provider couldn't be reached" },
  NO_USABLE_QUOTE: { kind: "fail", text: "the provider offered no payment option Aerar can use" },
  NETWORK_NOT_ALLOWED: { kind: "fail", text: "the provider wants payment on a network other than Base" },
  ASSET_NOT_ALLOWED: { kind: "fail", text: "the provider wants a token other than USDC" },
  SCHEME_NOT_SUPPORTED: { kind: "fail", text: "the provider's payment method isn't supported" },
  INVALID_PAYEE: { kind: "fail", text: "the provider's payment address is invalid" },
  PAYEE_CHANGED: { kind: "fail", text: "the provider's payment address changed since it was last paid" },
  INVALID_AMOUNT: { kind: "fail", text: "the quoted amount is invalid" },

  // Policy.
  WITHIN_PER_PURCHASE_LIMIT: { kind: "pass", text: "the price is within the per-purchase limit" },
  OVER_PER_PURCHASE_LIMIT: { kind: "fail", text: "the price is above the per-purchase limit" },
  WITHIN_TASK_BUDGET: { kind: "pass", text: "the task has enough budget left" },
  OVER_TASK_BUDGET: { kind: "fail", text: "the task doesn't have enough budget left" },
  RATE_LIMITED: { kind: "fail", text: "the agent hit its hourly purchase limit" },
  BELOW_APPROVAL_THRESHOLD: { kind: "pass", text: "the price is below the auto-approve limit" },
  ABOVE_APPROVAL_THRESHOLD: { kind: "hold", text: "the price is above the auto-approve limit, so a person decides" },
  ON_SHOPPING_LIST: { kind: "pass", text: "the item is on the task's shopping list" },
  NOT_ON_SHOPPING_LIST: { kind: "hold", text: "the item isn't on the task's shopping list, so a person decides" },
  APPROVED_BY_HUMAN: { kind: "pass", text: "a person approved it" },

  // Payment.
  QUOTE_CHANGED: { kind: "fail", text: "the provider's price or payment address changed before payment, so nothing was paid" },
  PAYMENT_NOT_SETTLED: { kind: "fail", text: "the provider didn't deliver, so the payment didn't settle" },
  PARENT_TASK_NOT_ACTIVE: { kind: "fail", text: "the task that hired this agent is paused, so it is too" },
  PARENT_BUDGET_EXCEEDED: { kind: "fail", text: "the task that hired this agent doesn't have enough budget left" },
  WITHIN_PARENT_BUDGET: { kind: "pass", text: "every task above it has budget left" },
  PROVIDER_CAP_REACHED: { kind: "fail", text: "this task's spending cap for that provider would be exceeded" },
  WITHIN_PROVIDER_CAP: { kind: "pass", text: "within the task's cap for this provider" },
  PRICE_JUMPED: { kind: "hold", text: "this item costs a lot more than the last time it was bought" },
  PRICE_AS_USUAL: { kind: "pass", text: "the price is in line with what was paid before" },
  NOT_DELIVERED: { kind: "fail", text: "the shop was paid but didn't deliver a usable result" },
  EMPTY_DELIVERY: { kind: "fail", text: "the shop sent back nothing for the payment" },
  REFUNDED: { kind: "fail", text: "the payment was held in the shop's escrow and sent back to the payer" },
  REFUND_FAILED: { kind: "fail", text: "the shop's escrow didn't send the payment back" },
  MALFORMED_DELIVERY: { kind: "fail", text: "the shop's paid result was broken (not valid JSON)" },
  ERROR_DELIVERED: { kind: "fail", text: "the shop returned an error message as the paid result" },
  PROVIDER_ON_HOLD: { kind: "fail", text: "this shop is on hold after taking a payment without delivering; a person has to clear it first" },
  VAULT_REFUSED: { kind: "fail", text: "the owner's Vault refused it on-chain: it's outside the limits the owner signed" },
};

export function explain(code: string): string {
  return REASONS[code]?.text ?? code.toLowerCase().replace(/_/g, " ");
}

export function reasonKind(code: string): ReasonKind {
  return REASONS[code]?.kind ?? "info";
}

/** Reasons that explain why something did not go through (for "Declined: …"). */
export function blockingReasons(codes: string[]): string[] {
  return codes.filter((c) => reasonKind(c) === "fail");
}

/** Sentence-case a reason for display on its own. */
export function sentence(code: string): string {
  const t = explain(code);
  return t.charAt(0).toUpperCase() + t.slice(1) + ".";
}

// ---- Statuses: one verb per outcome.

export type Tone = "success" | "info" | "warning" | "danger" | "neutral";

export interface StatusCopy {
  /** The chip label. */
  label: string;
  tone: Tone;
  /** Short description for tooltips and screen readers. */
  meaning: string;
}

export const STATUS: Record<string, StatusCopy> = {
  delivered: { label: "Paid", tone: "success", meaning: "Paid the provider's quote and received the result" },
  reused: { label: "Reused", tone: "info", meaning: "Served from an identical earlier purchase for $0" },
  free: { label: "Free", tone: "info", meaning: "The provider didn't ask for payment" },
  awaiting_approval: { label: "Needs approval", tone: "warning", meaning: "Held for a person; nothing paid yet" },
  declined: { label: "Declined", tone: "danger", meaning: "Stopped by the task's rules; nothing paid" },
  rejected: { label: "Declined", tone: "danger", meaning: "Declined by a person; nothing paid" },
  reserved: { label: "Paying", tone: "neutral", meaning: "Budget reserved; payment in progress" },
  paying: { label: "Paying", tone: "neutral", meaning: "Payment in progress" },
  disputed: { label: "Paid, not delivered", tone: "danger", meaning: "Paid on-chain, but the result failed the delivery check; the shop is on hold" },
  refunded: { label: "Refunded", tone: "warning", meaning: "Not delivered: the payment was held in the shop's escrow and sent back; the shop is on hold" },
  payment_failed: { label: "Not paid", tone: "danger", meaning: "Payment didn't go through; budget released" },
  unknown: { label: "Unconfirmed", tone: "warning", meaning: "Payment outcome unknown; budget held until reconciled" },
  expired: { label: "Expired", tone: "neutral", meaning: "The approval window passed; nothing paid" },
};

export function statusCopy(status: string): StatusCopy {
  return STATUS[status] ?? { label: status, tone: "neutral", meaning: status };
}
