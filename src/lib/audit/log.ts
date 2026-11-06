import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { canonicalJson } from "@/lib/memory/reuse-key";
import { auditEvents } from "@/db/schema";

const GENESIS = "0".repeat(64);

function jsonSafe(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}

function digest(prev: string, orgId: string, actor: string, kind: string, subjectId: string | null, data: unknown) {
  return createHash("sha256")
    // Postgres jsonb reorders object keys, so hash a canonical (sorted-key) form.
    .update(canonicalJson([prev, orgId, actor, kind, subjectId, data]))
    .digest("hex");
}

/** Append one event. Call inside the same transaction as the change it records. */
export async function audit(
  tx: Db,
  e: { orgId: string; actor: string; kind: string; subjectId?: string | null; data?: unknown },
) {
  const data = jsonSafe(e.data ?? {});
  const [last] = await tx
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, e.orgId))
    .orderBy(desc(auditEvents.seq))
    .limit(1)
    .for("update");
  const prevHash = last?.hash ?? GENESIS;
  const hash = digest(prevHash, e.orgId, e.actor, e.kind, e.subjectId ?? null, data);
  await tx.insert(auditEvents).values({
    orgId: e.orgId,
    actor: e.actor,
    kind: e.kind,
    subjectId: e.subjectId ?? null,
    data,
    prevHash,
    hash,
  });
  return hash;
}

/** Recompute the chain. Returns the first broken sequence number, or null if intact. */
export async function verifyChain(db: Db, orgId: string): Promise<{ ok: boolean; count: number; brokenAt: number | null }> {
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId)).orderBy(asc(auditEvents.seq));
  let prev = GENESIS;
  for (const r of rows) {
    const expect = digest(prev, r.orgId, r.actor, r.kind, r.subjectId, r.data);
    if (r.prevHash !== prev || r.hash !== expect) return { ok: false, count: rows.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}
