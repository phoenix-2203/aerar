import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, dateTime, Shell } from "@/components/ui";
import { auditEvents } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { operatorOrLogin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <Shell active="/audit">
      <Suspense fallback={<p className="text-muted">Checking the chain…</p>}>
        <Audit />
      </Suspense>
    </Shell>
  );
}

async function Audit() {
  await operatorOrLogin("/audit");
  const db = await getDbOnly();
  const orgId = operatorOrgId();
  const [chain, events] = await Promise.all([
    verifyChain(db, orgId),
    db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId)).orderBy(desc(auditEvents.seq)).limit(200),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Every decision, payment and change is written here in the same transaction as the change itself. Each entry carries the hash of the one before it, so editing or deleting history breaks the chain.
        </p>
      </div>

      <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-5 ${chain.ok ? "border-paid/40 bg-paid-soft" : "border-refused/50 bg-refused-soft"}`}>
        <span className={`text-2xl ${chain.ok ? "text-paid" : "text-refused"}`} aria-hidden>
          {chain.ok ? "✓" : "✗"}
        </span>
        <div>
          <div className="font-medium">{chain.ok ? "Chain intact" : `Chain broken at entry #${chain.brokenAt}`}</div>
          <div className="text-sm text-muted">
            Recomputed all {chain.count} entries just now{chain.ok ? "; every hash matches." : "; history was changed after it was written."}
          </div>
        </div>
      </div>

      <Card title="Entries" aside={`newest first · showing ${events.length} of ${chain.count}`}>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No entries yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.seq} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[4rem_1fr_auto] sm:gap-4">
                <span className="num font-mono text-xs text-faint">#{e.seq}</span>
                <div className="min-w-0">
                  <div className="text-sm">
                    <span className="font-medium">{e.kind.replace(/[._]/g, " ")}</span>
                    {e.subjectId && <span className="ml-2 font-mono text-xs text-muted">{e.subjectId}</span>}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-faint" title={e.hash}>
                    {e.prevHash.slice(0, 10)}… → {e.hash.slice(0, 10)}…
                  </div>
                </div>
                <div className="text-xs text-muted sm:text-right">
                  <div>{e.actor}</div>
                  <div>{dateTime(e.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
