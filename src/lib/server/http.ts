import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Purchase } from "@/lib/purchase/pipeline";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { fmt$ } from "@/lib/money/usdc";

/** JSON with every bigint turned into a decimal string (atomic USDC units). */
export function json(data: unknown, init?: number | ResponseInit) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const opts = typeof init === "number" ? { status: init } : init;
  return new NextResponse(body, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers ?? {}) } });
}

export function errorResponse(e: unknown) {
  if (e instanceof PurchaseError) return json({ error: e.code, message: e.message }, e.httpStatus);
  if (e instanceof ZodError)
    return json({ error: "INVALID_REQUEST", message: "Request body failed validation", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  if (e instanceof SyntaxError) return json({ error: "INVALID_JSON", message: "Body is not valid JSON" }, 400);
  // Unexpected: log server-side, say nothing specific to the caller.
  console.error("[aerar] unhandled error:", e instanceof Error ? e.message : e);
  return json({ error: "INTERNAL", message: "Something went wrong" }, 500);
}

export function withErrors<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      // Let Next.js handle its own control-flow signals (dynamic bail-out during prerender, redirects, notFound).
      unstable_rethrow(e);
      return errorResponse(e);
    }
  };
}

const PLAIN: Record<string, string> = {
  TASK_NOT_ACTIVE: "the task isn't active",
  TASK_DEADLINE_PASSED: "the task deadline has passed",
  MANDATE_EXPIRED: "the task's spending policy has expired",
  AGENT_REVOKED: "this agent's key was revoked",
  AGENT_NOT_ASSIGNED: "this agent isn't assigned to the task",
  PROVIDER_NOT_ALLOWED: "the provider isn't on the task's allowed list",
  NETWORK_NOT_ALLOWED: "the provider wants payment on a network other than Base Sepolia",
  ASSET_NOT_ALLOWED: "the provider wants a token other than USDC",
  SCHEME_NOT_SUPPORTED: "the provider's payment scheme isn't supported",
  INVALID_PAYEE: "the provider's payee address is invalid",
  PAYEE_CHANGED: "the provider's payee address changed since we last paid it",
  INVALID_AMOUNT: "the quoted amount is invalid",
  OVER_PER_PURCHASE_LIMIT: "the price is above the per-purchase limit",
  OVER_TASK_BUDGET: "there isn't enough budget left on the task",
  RATE_LIMITED: "the agent hit its hourly purchase limit",
  ABOVE_APPROVAL_THRESHOLD: "the price is above the auto-approve threshold",
  NO_USABLE_QUOTE: "the provider offered no usable payment option",
  PROVIDER_UNREACHABLE: "the provider couldn't be reached",
  QUOTE_CHANGED: "the provider's price or payee changed before payment, so nothing was paid",
  PAYMENT_NOT_SETTLED: "the provider didn't settle the payment",
};

export function explain(code: string) {
  return PLAIN[code] ?? code.toLowerCase().replace(/_/g, " ");
}

const NEGATIVE = new Set(Object.keys(PLAIN).filter((k) => k !== "ABOVE_APPROVAL_THRESHOLD"));

/** One sentence a person (or an LLM) can read. */
export function summarise(p: Purchase): string {
  const amount = p.quoteAmount != null ? fmt$(p.quoteAmount) : "an unknown amount";
  const why = p.reasonCodes.filter((c) => NEGATIVE.has(c)).map(explain).join("; ");
  switch (p.status) {
    case "delivered":
      return `Delivered. Paid ${fmt$(p.paidAmount)} to ${p.host}${p.txHash ? ` (tx ${p.txHash})` : ""}${p.onchainVerifiedAt ? ", transfer verified on Base Sepolia" : ", onchain check pending or failed"}.`;
    case "reused":
      return `Reused an identical purchase (${p.reusedFromId}) made earlier. Cost $0.00, avoided ${amount}.`;
    case "free":
      return `The provider didn't ask for payment. Nothing was paid.`;
    case "declined":
      return `Declined. Nothing was paid: ${why || p.error || "policy check failed"}.`;
    case "awaiting_approval":
      return `Waiting for a person to approve ${amount} because ${explain("ABOVE_APPROVAL_THRESHOLD")}. Nothing has been paid yet.`;
    case "rejected":
      return `A person rejected this purchase. Nothing was paid.`;
    case "reserved":
    case "paying":
      return `${amount} is reserved and payment is in progress.`;
    case "payment_failed":
      return `Payment did not go through, nothing was charged and the budget was released: ${why || p.error}.`;
    case "unknown":
      return `Payment outcome is unknown (${p.error}). ${amount} stays reserved until it is reconciled.`;
    case "expired":
      return `The approval window expired. Nothing was paid.`;
  }
}

/** Purchase as returned to agents/operators. Bigints become strings via json(). */
export function purchaseView(p: Purchase, opts: { includeBody?: boolean } = {}) {
  const { quoteRaw: _raw, responseBody, requestBody: _rb, ...rest } = p;
  return {
    ...rest,
    summary: summarise(p),
    amountFormatted: p.quoteAmount != null ? fmt$(p.quoteAmount) : null,
    paidFormatted: fmt$(p.paidAmount),
    reasons: p.reasonCodes.map((code) => ({ code, explanation: explain(code) })),
    ...(opts.includeBody ? { responseBody } : {}),
  };
}
