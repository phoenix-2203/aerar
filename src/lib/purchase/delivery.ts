// Delivery checks: after a payment settles, did the shop actually deliver something? x402 "exact" payments can't be
// refunded, so Aerar can't get the money back, but it can refuse to call junk "delivered": the purchase is marked
// "paid, not delivered", it is never reused, it counts against the shop's reliability, and the shop is put on hold
// until a person clears it, so the same loss can't happen twice.
import type { CapturedResponse } from "@/lib/x402/rail";

export interface DeliveryCheck {
  ok: boolean;
  /** EMPTY_DELIVERY | MALFORMED_DELIVERY | ERROR_DELIVERED, or null when ok. */
  code: string | null;
  detail: string;
}

const ERROR_KEYS = new Set(["error", "errors", "message", "code", "status", "detail", "details", "statuscode"]);

export function checkDelivery(r: Pick<CapturedResponse, "body" | "contentType">): DeliveryCheck {
  const text = new TextDecoder().decode(r.body);
  if (!text.trim()) return { ok: false, code: "EMPTY_DELIVERY", detail: "The shop took the payment and sent back nothing." };
  const looksJson = /json/i.test(r.contentType ?? "") || /^[[{]/.test(text.trim());
  if (!looksJson) return { ok: true, code: null, detail: `${r.body.byteLength} bytes delivered.` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "MALFORMED_DELIVERY", detail: "The shop's paid result isn't valid JSON, though it said it was." };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const keys = Object.keys(parsed as object).map((k) => k.toLowerCase());
    if (keys.length && keys.every((k) => ERROR_KEYS.has(k)) && (keys.includes("error") || keys.includes("errors")))
      return { ok: false, code: "ERROR_DELIVERED", detail: "The shop returned an error message as the paid result." };
    if (!keys.length) return { ok: false, code: "EMPTY_DELIVERY", detail: "The shop's paid result is an empty object." };
  }
  if (Array.isArray(parsed) && parsed.length === 0) return { ok: false, code: "EMPTY_DELIVERY", detail: "The shop's paid result is an empty list." };
  return { ok: true, code: null, detail: `${r.body.byteLength} bytes of valid JSON delivered.` };
}
