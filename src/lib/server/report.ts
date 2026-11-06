// The morning report: everything agents did with money in a time window, in numbers and plain words.
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { agents, purchases, tasks, type PurchaseStatus } from "@/db/schema";
import { fmt$ } from "@/lib/money/usdc";
import { explain } from "@/lib/copy/reasons";
import { purchaseView } from "./http";
import { listTasks } from "./queries";

export interface ReportWindow {
  since: Date;
  until: Date;
}

/** "Last night": 18:00 UTC yesterday to now, or the last `hours` hours. */
export function windowFor(period: string | undefined, now = new Date()): ReportWindow & { label: string; key: string } {
  const hours = period === "7d" ? 168 : period === "24h" ? 24 : null;
  if (hours) return { since: new Date(now.getTime() - hours * 3600_000), until: now, label: hours === 24 ? "Last 24 hours" : "Last 7 days", key: period! };
  const since = new Date(now);
  since.setUTCHours(18, 0, 0, 0);
  if (since > now) since.setUTCDate(since.getUTCDate() - 1);
  return { since, until: now, label: "Since 18:00 UTC", key: "night" };
}

export interface Totals {
  purchases: number;
  delivered: number;
  reused: number;
  refused: number;
  failed: number;
  waiting: number;
  spent: bigint;
  saved: bigint;
  blocked: bigint;
  verified: number;
  formatted: { spent: string; saved: string; blocked: string };
}

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

export async function morningReport(db: Db, orgId: string, w: ReportWindow) {
  const rows = await db
    .select({ p: purchases, agentName: agents.name, taskTitle: tasks.title })
    .from(purchases)
    .innerJoin(agents, eq(agents.id, purchases.agentId))
    .innerJoin(tasks, eq(tasks.id, purchases.taskId))
    .where(and(eq(purchases.orgId, orgId), gte(purchases.createdAt, w.since), lt(purchases.createdAt, w.until)))
    .orderBy(desc(purchases.createdAt));

  const waitingRows = await db
    .select({ p: purchases, agentName: agents.name, taskTitle: tasks.title })
    .from(purchases)
    .innerJoin(agents, eq(agents.id, purchases.agentId))
    .innerJoin(tasks, eq(tasks.id, purchases.taskId))
    .where(and(eq(purchases.orgId, orgId), eq(purchases.status, "awaiting_approval")))
    .orderBy(desc(purchases.createdAt));

  const ps = rows.map((r) => r.p);
  const by = (s: PurchaseStatus) => ps.filter((p) => p.status === s);
  const delivered = by("delivered");
  const reused = by("reused");
  const refused = ps.filter((p) => p.status === "declined" || p.status === "rejected");
  const failed = ps.filter((p) => p.status === "payment_failed" || p.status === "unknown");

  const spent = sum(ps.map((p) => p.paidAmount));
  const saved = sum(reused.map((p) => p.quoteAmount ?? 0n));
  const blocked = sum(refused.map((p) => p.quoteAmount ?? 0n));
  const verified = delivered.filter((p) => p.onchainVerifiedAt).length;

  const reasonCounts = new Map<string, number>();
  for (const p of [...refused, ...failed])
    for (const c of p.reasonCodes.length ? p.reasonCodes : [p.status.toUpperCase()]) reasonCounts.set(c, (reasonCounts.get(c) ?? 0) + 1);
  const reasons = [...reasonCounts].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count, explanation: explain(code) }));

  const providerMap = new Map<string, { host: string; purchases: number; paid: bigint; reused: number; refused: number }>();
  for (const p of ps) {
    const e = providerMap.get(p.host) ?? { host: p.host, purchases: 0, paid: 0n, reused: 0, refused: 0 };
    e.purchases += 1;
    e.paid += p.paidAmount;
    if (p.status === "reused") e.reused += 1;
    if (p.status === "declined" || p.status === "rejected") e.refused += 1;
    providerMap.set(p.host, e);
  }
  const providers = [...providerMap.values()].sort((a, b) => (b.paid > a.paid ? 1 : b.paid < a.paid ? -1 : b.purchases - a.purchases));

  const agentMap = new Map<string, { id: string; name: string; purchases: number; paid: bigint; refused: number }>();
  for (const r of rows) {
    const e = agentMap.get(r.p.agentId) ?? { id: r.p.agentId, name: r.agentName, purchases: 0, paid: 0n, refused: 0 };
    e.purchases += 1;
    e.paid += r.p.paidAmount;
    if (r.p.status === "declined" || r.p.status === "rejected") e.refused += 1;
    agentMap.set(r.p.agentId, e);
  }

  const view = (r: (typeof rows)[number]) => ({ ...purchaseView(r.p), agentName: r.agentName, taskTitle: r.taskTitle });

  const totals: Totals = {
    purchases: ps.length,
    delivered: delivered.length,
    reused: reused.length,
    refused: refused.length,
    failed: failed.length,
    waiting: waitingRows.length,
    spent,
    saved,
    blocked,
    verified,
    formatted: { spent: fmt$(spent), saved: fmt$(saved), blocked: fmt$(blocked) },
  };

  return {
    window: w,
    totals,
    headline: headline(totals, reasons),
    reasons,
    providers: providers.map((p) => ({ ...p, paidFormatted: fmt$(p.paid) })),
    agents: [...agentMap.values()].map((a) => ({ ...a, paidFormatted: fmt$(a.paid) })),
    waiting: waitingRows.map(view),
    timeline: rows.map(view),
    tasks: await listTasks(db, orgId),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A few plain sentences, built from the numbers only (no AI), so they're always accurate. */
export function headline(t: Totals, reasons: { code: string; count: number; explanation: string }[]): string[] {
  if (t.purchases === 0 && t.waiting === 0) return ["A quiet shift: your agents didn't try to buy anything."];
  const out: string[] = [];
  if (t.purchases > 0) {
    let s = `Your agents made ${plural(t.purchases, "purchase request")} and Aerar paid ${t.formatted.spent}`;
    if (t.delivered > 0) s += ` for ${plural(t.delivered, "delivery", "deliveries")}`;
    if (t.delivered > 0) s += t.verified === t.delivered ? `, every transfer checked onchain` : `, ${t.verified} of ${t.delivered} transfers checked onchain so far`;
    out.push(s + ".");
  }
  if (t.reused > 0) out.push(`${plural(t.reused, "request")} matched something already bought, so ${t.formatted.saved} wasn't spent twice.`);
  if (t.refused > 0) {
    const top = reasons[0];
    out.push(`${plural(t.refused, "purchase")} ${t.refused === 1 ? "was" : "were"} refused${t.blocked > 0n ? ` (${t.formatted.blocked} in quotes)` : ""}${top ? `; most often because ${top.explanation}` : ""}.`);
  }
  if (t.failed > 0) out.push(`${plural(t.failed, "payment")} didn't go through and ${t.failed === 1 ? "needs" : "need"} a look.`);
  if (t.waiting > 0) out.push(`${plural(t.waiting, "purchase")} ${t.waiting === 1 ? "is" : "are"} waiting for you to approve or reject.`);
  return out;
}
