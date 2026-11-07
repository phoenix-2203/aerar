// Provider reliability, from the organisation's own ledger: how often a provider delivered when paid, and how often it
// misbehaved (failed after payment, changed its price between quote and payment, or swapped its payee). No outside data.
import type { Purchase } from "@/lib/purchase/pipeline";

export interface ProviderScore {
  host: string;
  /** 0-100, or null when there's not enough history to say. */
  score: number | null;
  label: "reliable" | "watch" | "risky" | "new";
  delivered: number;
  failed: number;
  priceChanged: number;
  payeeChanged: number;
  priceJumped: number;
}

type Row = Pick<Purchase, "host" | "status" | "reasonCodes">;

export function scoreProviders(rows: Row[]): ProviderScore[] {
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(r.host, [...(by.get(r.host) ?? []), r]);
  return [...by].map(([host, rs]) => {
    const has = (c: string) => rs.filter((r) => r.reasonCodes.includes(c)).length;
    const delivered = rs.filter((r) => r.status === "delivered").length;
    const failed = rs.filter((r) => r.status === "payment_failed" || r.status === "unknown" || r.status === "disputed").length - has("VAULT_REFUSED");
    const priceChanged = has("QUOTE_CHANGED");
    const payeeChanged = has("PAYEE_CHANGED");
    const priceJumped = has("PRICE_JUMPED");
    // Bad events weigh more than one good delivery: a swapped payee is the worst sign.
    const bad = Math.max(0, failed) + priceChanged + priceJumped + 3 * payeeChanged;
    const seen = delivered + bad;
    const score = seen < 2 ? null : Math.round((100 * delivered) / seen);
    const label = score == null ? "new" : score >= 90 ? "reliable" : score >= 70 ? "watch" : "risky";
    return { host, score, label, delivered, failed: Math.max(0, failed), priceChanged, payeeChanged, priceJumped };
  });
}
