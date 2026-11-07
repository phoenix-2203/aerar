// The purchase pipeline as seven visible steps, derived from what a purchase already stores (status, reason codes,
// tx hash, onchain check). Pure function: the UI draws it, nothing new is stored, no decision logic lives here.
import { explain, reasonKind } from "./reasons";

export type StepId = "access" | "memory" | "quote" | "policy" | "reserve" | "pay" | "onchain";
export type StepState = "passed" | "failed" | "held" | "skipped" | "pending";

export interface Step {
  id: StepId;
  title: string;
  state: StepState;
  detail: string;
}

/** What each step does, in plain words (also used on the landing page). */
export const STEP_INFO: Record<StepId, { title: string; does: string }> = {
  access: { title: "Access", does: "Is this agent on the task, is the task live, is the provider allowed? If not, the provider is never contacted." },
  memory: { title: "Memory", does: "Did any agent buy this exact thing recently? Then serve that result for $0." },
  quote: { title: "Quote", does: "Ask the provider for its real x402 price, payee, token and network." },
  policy: { title: "Rules", does: "Check the real quote against the task's versioned rules. Big purchases wait for a person." },
  reserve: { title: "Reserve", does: "Hold the amount on the task's budget under a lock, so parallel agents can't overspend." },
  pay: { title: "Pay", does: "Re-quote, then pay exactly the approved amount in USDC on Base. A changed price pays nothing." },
  onchain: { title: "Prove", does: "Check the USDC transfer on Base matches the quote, and write it to the hash-chained log." },
};

export const STEP_ORDER: StepId[] = ["access", "memory", "quote", "policy", "reserve", "pay", "onchain"];

const ACCESS = new Set(["TASK_NOT_ACTIVE", "PARENT_TASK_NOT_ACTIVE", "TASK_DEADLINE_PASSED", "MANDATE_EXPIRED", "AGENT_REVOKED", "AGENT_NOT_ASSIGNED", "PROVIDER_NOT_ALLOWED", "PROVIDER_BLOCKED", "PROVIDER_ON_HOLD", "MANDATE_INVALID", "PURCHASE_LIMIT_REACHED"]);
const QUOTE = new Set(["PROVIDER_UNREACHABLE", "NO_USABLE_QUOTE"]);
const PAYMENT = new Set(["QUOTE_CHANGED", "PAYMENT_NOT_SETTLED", "VAULT_REFUSED"]);
const DELIVERY = new Set(["NOT_DELIVERED", "EMPTY_DELIVERY", "MALFORMED_DELIVERY", "ERROR_DELIVERED", "REFUNDED", "REFUND_FAILED"]);

export interface PurchaseLike {
  status: string;
  reasonCodes: string[];
  quoteAmountFormatted?: string | null;
  paidFormatted?: string | null;
  txHash?: string | null;
  onchainVerifiedAt?: Date | string | null;
  onchainCheck?: unknown;
  reusedFromId?: string | null;
  approvedBy?: string | null;
}

export function purchaseSteps(p: PurchaseLike): Step[] {
  const codes = p.reasonCodes;
  const fails = (set: Set<string>) => codes.filter((c) => set.has(c));
  const policyFails = codes.filter((c) => reasonKind(c) === "fail" && !ACCESS.has(c) && !QUOTE.has(c) && !PAYMENT.has(c) && !DELIVERY.has(c));
  const steps: Step[] = [];
  let stopped = false;
  const add = (id: StepId, state: StepState, detail: string) => {
    steps.push({ id, title: STEP_INFO[id].title, state: stopped ? "skipped" : state, detail: stopped ? "Not reached." : detail });
    if (state === "failed" || state === "held") stopped = true;
  };
  const price = p.quoteAmountFormatted ?? "the quote";

  // 1. Access
  const access = fails(ACCESS);
  if (access.length) add("access", "failed", cap(access.map(explain).join("; ")) + ". The provider was never contacted.");
  else add("access", "passed", "Agent, task and provider all allowed.");

  // 2. Memory
  if (p.status === "reused") {
    add("memory", "passed", `Identical purchase found${p.reusedFromId ? ` (${p.reusedFromId})` : ""}. Served for $0; nothing else to do.`);
    for (const id of ["quote", "policy", "reserve", "pay", "onchain"] as StepId[])
      steps.push({ id, title: STEP_INFO[id].title, state: "skipped", detail: "Not needed: reused." });
    return steps;
  }
  add("memory", "passed", "Nothing identical bought recently, so this is a new purchase.");

  // 3. Quote
  const quote = fails(QUOTE);
  if (quote.length) add("quote", "failed", cap(quote.map(explain).join("; ")) + ".");
  else if (p.status === "free") {
    add("quote", "passed", "The provider didn't ask for payment.");
    for (const id of ["policy", "reserve", "pay", "onchain"] as StepId[]) steps.push({ id, title: STEP_INFO[id].title, state: "skipped", detail: "Not needed: free." });
    return steps;
  } else add("quote", "passed", `Provider quoted ${price}.`);

  // 4. Rules (policy, with the human in the loop)
  if (policyFails.length) add("policy", "failed", cap(policyFails.map(explain).join("; ")) + ".");
  else if (p.status === "rejected") add("policy", "failed", "Held for a person, who declined it.");
  else if (p.status === "awaiting_approval")
    add(
      "policy",
      "held",
      codes.includes("ABOVE_APPROVAL_THRESHOLD")
        ? `${price} is above the auto-approve limit. Waiting for a person.`
        : codes.includes("PRICE_JUMPED")
          ? `${price} is much more than this item cost last time. Waiting for a person.`
          : codes.includes("NOT_ON_SHOPPING_LIST")
            ? "This item isn't on the task's shopping list. Waiting for a person."
            : "Waiting for a person.",
    );
  else if (codes.includes("APPROVED_BY_HUMAN")) add("policy", "passed", `Held for a person; approved by ${p.approvedBy ?? "a person"}.`);
  else add("policy", "passed", "Within every rule on the task.");

  // 5. Reserve
  add("reserve", "passed", `${price} held on the task's budget.`);

  // 6. Pay
  const pay = fails(PAYMENT);
  if (pay.length) add("pay", "failed", cap(pay.map(explain).join("; ")) + ". Budget released.");
  else if (p.status === "unknown") add("pay", "pending", "Outcome unknown; the amount stays held until reconciled.");
  else if (p.status === "reserved" || p.status === "paying") add("pay", "pending", "Payment in progress.");
  else add("pay", "passed", p.txHash?.startsWith("0xsim") ? `Paid ${p.paidFormatted ?? price} (simulated test USDC).` : `Paid ${p.paidFormatted ?? price} in USDC on Base Sepolia.`);

  // 7. Prove
  const check = p.onchainCheck as { ok?: boolean; reason?: string } | null | undefined;
  if (p.status === "refunded")
    add("onchain", "failed", `Paid into the shop's escrow, but ${codes.filter((c) => DELIVERY.has(c) && !["NOT_DELIVERED", "REFUNDED"].includes(c)).map(explain).join("; ") || "the result failed the delivery check"}. Refunded in full; the shop is on hold.`);
  else if (p.status === "disputed")
    add("onchain", "failed", `Paid, but ${codes.filter((c) => DELIVERY.has(c) && c !== "NOT_DELIVERED").map(explain).join("; ") || "the result failed the delivery check"}. ${codes.includes("REFUND_FAILED") ? "The escrow refund failed" : "This shop doesn't use an escrow, so it can't be refunded"}; the shop is on hold.`);
  else if (p.status !== "delivered") add("onchain", "skipped", "Nothing to prove.");
  else if (p.txHash?.startsWith("0xsim")) add("onchain", "passed", "Simulated transfer in the sandbox: nothing on a chain to check.");
  else if (p.onchainVerifiedAt) add("onchain", "passed", "Transfer found on Base and matches the quote.");
  else if (check && check.ok === false) add("onchain", "failed", `Transfer doesn't match: ${check.reason ?? "check failed"}.`);
  else add("onchain", "pending", "Checking the transfer on Base…");

  return steps;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
