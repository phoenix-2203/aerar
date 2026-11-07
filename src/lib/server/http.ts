import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Purchase } from "@/lib/purchase/pipeline";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { blockingReasons, explain, reasonKind } from "@/lib/copy/reasons";
import { fmt$ } from "@/lib/money/usdc";

export { explain };

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
  // Message plus the underlying cause's code/message (e.g. a Postgres error), never query parameters.
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  console.error("[aerar] unhandled error:", e instanceof Error ? e.message.split("\nparams:")[0] : e, cause ? `| cause: ${cause.code ?? ""} ${cause.message ?? ""}` : "");
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

/** One sentence a person (or an LLM) can read. */
export function summarise(p: Purchase): string {
  const amount = p.quoteAmount != null ? fmt$(p.quoteAmount) : "an unknown amount";
  const why = blockingReasons(p.reasonCodes).map(explain).join("; ");
  switch (p.status) {
    case "delivered":
      return `Delivered. Paid ${fmt$(p.paidAmount)} to ${p.host}${p.txHash ? ` (tx ${p.txHash})` : ""}${p.onchainVerifiedAt ? ", transfer verified on Base Sepolia" : ", onchain check pending or failed"}.`;
    case "reused":
      return `Reused an identical purchase (${p.reusedFromId}) made earlier. Cost $0.00, avoided ${amount}.`;
    case "free":
      return `The provider didn't ask for payment. Nothing was paid.`;
    case "declined":
      return `Declined: ${why || p.error || "a rule check failed"}. Nothing was paid.`;
    case "awaiting_approval":
      return `Needs approval: ${p.reasonCodes.filter((c) => reasonKind(c) === "hold").map(explain).join("; ") || `${amount} is above the auto-approve limit, so a person decides`}. Nothing has been paid yet.`;
    case "rejected":
      return `Declined by a person. Nothing was paid.`;
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
