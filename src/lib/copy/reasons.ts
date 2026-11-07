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

  // Memory.
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
  payment_failed: { label: "Not paid", tone: "danger", meaning: "Payment didn't go through; budget released" },
  unknown: { label: "Unconfirmed", tone: "warning", meaning: "Payment outcome unknown; budget held until reconciled" },
  expired: { label: "Expired", tone: "neutral", meaning: "The approval window passed; nothing paid" },
};

export function statusCopy(status: string): StatusCopy {
  return STATUS[status] ?? { label: status, tone: "neutral", meaning: status };
}
