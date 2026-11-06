import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ReportSkeleton } from "@/components/skeleton";
import { auditEvents } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { dateTime } from "@/lib/format";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { operatorOrLogin } from "@/lib/server/session";
import { VerifyChain } from "./verify-button";

export const metadata: Metadata = { title: "Audit log", description: "Tamper-evident record of every decision, payment and change." };

export default function AuditPage() {
  return (
    <AppShell active="/audit">
      <Suspense fallback={<ReportSkeleton />}>
        <Audit />
      </Suspense>
    </AppShell>
  );
}

/** "purchase.awaiting_approval" -> "Purchase needs approval", in the shared words. */
function label(kind: string) {
  const map: Record<string, string> = {
    "purchase.delivered": "Purchase paid",
    "purchase.reused": "Purchase reused",
    "purchase.awaiting_approval": "Purchase needs approval",
    "purchase.declined": "Purchase declined",
    "purchase.rejected": "Purchase declined by a person",
    "purchase.reserved": "Budget reserved",
    "purchase.payment_failed": "Payment not made",
    "purchase.unknown": "Payment outcome unknown",
    "purchase.free": "Free resource",
    "purchase.provider_unreachable": "Provider unreachable",
  };
  return map[kind] ?? kind.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Audit log</h1>
        <p className="mt-1.5 text-sm text-text-2">
          A tamper-evident record of every decision, payment and change, written in the same transaction as the change itself. Each entry carries the
          hash of the one before it, so editing or deleting history breaks the chain at that exact entry.
        </p>
      </div>

      <VerifyChain initial={chain} />

      <Card title="Entries" aside={`newest first · ${events.length} of ${chain.count}`} bodyClassName="p-0">
        {events.length === 0 ? (
          <EmptyState title="No entries yet">Entries appear as soon as an agent asks to buy something or a rule changes.</EmptyState>
        ) : (
          <ol className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.seq} className="grid gap-1 px-4 py-3 sm:grid-cols-[4rem_1fr_auto] sm:gap-4 sm:px-5">
                <span className="tabular font-mono text-xs text-text-2">#{e.seq}</span>
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{label(e.kind)}</span>
                    {e.subjectId && <span className="ml-2 font-mono text-xs text-text-2">{e.subjectId}</span>}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-text-2" title={`${e.prevHash} → ${e.hash}`}>
                    {e.prevHash.slice(0, 12)}… <span aria-hidden>→</span>
                    <span className="sr-only">then</span> <span className="text-text">{e.hash.slice(0, 12)}…</span>
                  </p>
                </div>
                <div className="text-xs text-text-2 sm:text-right">
                  <div>{e.actor.replace(/^user:/, "").replace(/^agent:/, "agent ")}</div>
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
