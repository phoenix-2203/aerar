// Security center data, computed from the ledger only. Every event is a purchase Aerar actually stopped or held; every
// signal states the evidence it is based on. No scores are invented: a signal appears only when its basis is met.
import { categoryLabel } from "@/lib/intent/intentlock";

type Row = {
  id: string;
  agentId: string;
  status: string;
  host: string;
  url: string;
  reasonCodes: string[];
  createdAt: Date;
  approvedBy?: string | null;
  intent?: { outcome: string; itemCategories: string[] } | null;
};

export type SecurityKind = "undelivered" | "on_hold" | "off_purpose" | "unplaced" | "untrusted_shop" | "payee_swap" | "quote_changed" | "price_jump" | "mandate" | "memory" | "limits" | "revoked";

const KINDS: { kind: SecurityKind; codes: string[]; label: string }[] = [
  { kind: "mandate", codes: ["MANDATE_INVALID"], label: "Rules changed outside Aerar" },
  { kind: "undelivered", codes: ["NOT_DELIVERED"], label: "Paid, not delivered" },
  { kind: "on_hold", codes: ["PROVIDER_ON_HOLD"], label: "Shop on hold" },
  { kind: "off_purpose", codes: ["INTENT_MISMATCH", "INTENT_UNCERTAIN_REFUSED"], label: "Off-purpose purchase" },
  { kind: "payee_swap", codes: ["PAYEE_CHANGED"], label: "Shop's wallet changed" },
  { kind: "untrusted_shop", codes: ["PROVIDER_NOT_ALLOWED", "PROVIDER_BLOCKED"], label: "Shop not trusted" },
  { kind: "quote_changed", codes: ["QUOTE_CHANGED"], label: "Price changed before paying" },
  { kind: "memory", codes: ["MEMORY_ALTERED"], label: "Remembered data altered" },
  { kind: "revoked", codes: ["AGENT_REVOKED", "TASK_NOT_ACTIVE", "PARENT_TASK_NOT_ACTIVE"], label: "Stopped agent tried to buy" },
  { kind: "price_jump", codes: ["PRICE_JUMPED"], label: "Price jumped" },
  { kind: "unplaced", codes: ["INTENT_UNCERTAIN"], label: "Item Aerar can't place" },
  { kind: "limits", codes: ["OVER_TASK_BUDGET", "OVER_PER_PURCHASE_LIMIT", "RATE_LIMITED", "PURCHASE_LIMIT_REACHED", "PROVIDER_CAP_REACHED", "PARENT_BUDGET_EXCEEDED", "MANDATE_EXPIRED"], label: "Limit reached" },
];

export interface SecurityEvent {
  id: string;
  kind: SecurityKind;
  label: string;
  agentId: string;
  host: string;
  at: string;
  outcome: "stopped" | "held" | "approved" | "lost" | "noted";
}

export interface Signal {
  level: "high" | "watch";
  text: string;
  /** The evidence the signal rests on, in words. */
  basis: string;
}

export function securityView(rows: Row[], names: Record<string, string>, now = new Date()) {
  const events: SecurityEvent[] = [];
  for (const r of rows) {
    const k = KINDS.find((x) => x.codes.some((c) => r.reasonCodes.includes(c)));
    if (!k) continue;
    const outcome =
      r.status === "awaiting_approval"
        ? "held"
        : r.status === "declined" || r.status === "payment_failed" || r.status === "rejected"
          ? "stopped"
          : r.status === "disputed"
            ? "lost"
          : r.approvedBy
            ? "approved"
            : "noted";
    events.push({ id: r.id, kind: k.kind, label: k.label, agentId: r.agentId, host: r.host, at: r.createdAt.toISOString(), outcome });
  }

  const signals: Signal[] = [];
  const hourAgo = now.getTime() - 3600_000;
  const recent = events.filter((e) => Date.parse(e.at) >= hourAgo && e.outcome === "stopped");
  const byAgent = new Map<string, SecurityEvent[]>();
  for (const e of recent) byAgent.set(e.agentId, [...(byAgent.get(e.agentId) ?? []), e]);
  for (const [agentId, es] of byAgent) {
    const off = es.filter((e) => e.kind === "off_purpose" || e.kind === "untrusted_shop").length;
    if (off >= 2)
      signals.push({
        level: "high",
        text: `${names[agentId] ?? "An agent"} keeps trying to buy things outside its task (${off} in the last hour). It may be following injected instructions.`,
        basis: `${off} refusals for off-purpose items or untrusted shops by this agent in 60 minutes.`,
      });
    else if (es.length >= 3)
      signals.push({ level: "watch", text: `${names[agentId] ?? "An agent"} had ${es.length} purchases refused in the last hour.`, basis: `${es.length} refusals in 60 minutes.` });
  }
  if (events.some((e) => e.kind === "mandate"))
    signals.push({ level: "high", text: "A task's rules were changed outside Aerar. Buying for it is stopped until a person signs them again.", basis: "Stored rules no longer match the signed mandate." });
  for (const host of new Set(events.filter((e) => e.kind === "undelivered").map((e) => e.host)))
    signals.push({ level: "high", text: `${host} took a payment and sent back nothing usable. It's on hold: nothing more is bought from it until you clear it.`, basis: "The paid result failed Aerar's delivery check (empty, broken, or an error message)." });
  if (events.some((e) => e.kind === "memory"))
    signals.push({ level: "high", text: "A remembered result was altered after delivery. It was not reused.", basis: "A stored copy's sha256 no longer matches the hash taken at delivery." });
  for (const host of new Set(events.filter((e) => e.kind === "payee_swap").map((e) => e.host)))
    signals.push({ level: "high", text: `${host} asked to be paid at a new wallet. Treat it as compromised until its owner confirms.`, basis: "Its quote named a payee different from the one it was paid at before." });
  const offCats = new Map<string, number>();
  for (const r of rows) if (r.intent?.outcome === "mismatch") for (const c of r.intent.itemCategories) offCats.set(c, (offCats.get(c) ?? 0) + 1);
  const top = [...offCats].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2)
    signals.push({ level: "watch", text: `Agents were steered towards ${categoryLabel(top[0])} ${top[1]} times.`, basis: "IntentLock refusals, grouped by what the item was." });

  const counts = Object.fromEntries(KINDS.map((k) => [k.kind, events.filter((e) => e.kind === k.kind).length])) as Record<SecurityKind, number>;
  return { events: events.slice(0, 30), signals, counts, stopped: events.filter((e) => e.outcome === "stopped").length, held: events.filter((e) => e.outcome === "held").length };
}
export type SecurityView = ReturnType<typeof securityView>;
