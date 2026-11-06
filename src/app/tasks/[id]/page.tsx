import { ArrowLeft, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { BudgetMeter } from "@/components/budget-meter";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { RuleSentences } from "@/components/rule-sentence";
import { ReportSkeleton } from "@/components/skeleton";
import { StatusChip } from "@/components/status-chip";
import type { PolicyRules } from "@/db/schema";
import { dateTime } from "@/lib/format";
import { fmt$ } from "@/lib/money/usdc";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { getPurchaseDetail, getTaskDetail } from "@/lib/server/queries";
import { operatorOrLogin } from "@/lib/server/session";
import { PurchaseDrawer } from "../../report/purchase-drawer";
import { PauseToggle, RevokeKey } from "./controls";

export const metadata: Metadata = { title: "Task", description: "A task's budget, rules, rule history, agents and purchases." };

export default function TaskPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  return (
    <AppShell active="/tasks">
      <Suspense fallback={<ReportSkeleton />}>
        <Task params={params} searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Task({ params, searchParams }: { params: PageProps<"/tasks/[id]">["params"]; searchParams: PageProps<"/tasks/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = await searchParams;
  const purchase = typeof sp.purchase === "string" ? sp.purchase : undefined;
  await operatorOrLogin(`/tasks/${id}${purchase ? `?purchase=${purchase}` : ""}`);
  const db = await getDbOnly();
  let d;
  try {
    d = await getTaskDetail(db, operatorOrgId(), id);
  } catch (e) {
    if (e instanceof PurchaseError && e.httpStatus === 404) notFound();
    throw e;
  }
  const { task, money, policy, policyHistory, agents, purchases } = d;
  const detail = purchase ? await getPurchaseDetail(db, operatorOrgId(), purchase) : null;
  const here = `/tasks/${task.id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/report#tasks" className="inline-flex items-center gap-1 text-[13px] text-text-2 hover:text-text">
          <ArrowLeft className="size-3.5" aria-hidden /> Morning report
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{task.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${task.status === "active" ? "bg-success-tint text-success" : "bg-warning-tint text-warning"}`}>{task.status}</span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-text-2">{task.purpose}</p>
            {task.expectedDeliverable && <p className="mt-1 text-[13px] text-text-2">Deliverable: {task.expectedDeliverable}</p>}
          </div>
          {task.status !== "closed" && <PauseToggle taskId={task.id} paused={task.status === "paused"} />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Budget" className="lg:col-span-2">
          <BudgetMeter budget={money.budget} spent={money.spent} reserved={money.reserved} formatted={money.formatted} />
          <dl className="tabular mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Paid", purchases.filter((p) => p.status === "delivered").length],
              ["Reused", purchases.filter((p) => p.status === "reused").length],
              ["Declined", purchases.filter((p) => ["declined", "rejected", "payment_failed"].includes(p.status)).length],
              ["Needs approval", purchases.filter((p) => p.status === "awaiting_approval").length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
                <dt className="text-xs text-text-2">{k}</dt>
                <dd className="text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Agents on this task">
          {agents.length === 0 ? (
            <p className="text-sm text-text-2">No agents assigned.</p>
          ) : (
            <ul className="space-y-3">
              {agents.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{a.name}</span>{" "}
                    <span className={`text-xs ${a.revokedAt ? "text-danger" : "text-success"}`}>{a.revokedAt ? `revoked ${dateTime(a.revokedAt)}` : "active"}</span>
                  </span>
                  {!a.revokedAt && <RevokeKey agentId={a.id} name={a.name} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Rules" className="lg:col-span-2">
          {policy ? <RuleSentences rules={policy.rules} version={policy.version} /> : <p className="text-sm text-text-2">No rules yet.</p>}
        </Card>
        <Card title="Rule history" aside={`${policyHistory.length} version${policyHistory.length === 1 ? "" : "s"}`}>
          <PolicyDiff history={policyHistory} />
        </Card>
      </div>

      <Card title="Purchases" aside={`${purchases.length} total`} bodyClassName="p-0">
        {purchases.length === 0 ? (
          <EmptyState title="No purchases yet">Agents on this task haven&apos;t asked to buy anything.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {purchases.map((p) => (
              <li key={p.id}>
                <Link href={`${here}?purchase=${p.id}`} scroll={false} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-surface-2/60 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:px-5">
                  <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                    <StatusChip status={p.status} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px]">{p.host}</span>
                    <span className="block truncate text-[13px] text-text-2">&ldquo;{p.purpose}&rdquo;</span>
                  </span>
                  <span className="text-right">
                    <span className={`tabular block text-sm font-medium ${p.status === "reused" ? "text-text-2 line-through" : ""}`}>{p.amountFormatted ?? "—"}</span>
                    <span className="block text-xs text-text-2">{dateTime(p.createdAt)} · v{p.policyVersion}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {purchase && <PurchaseDrawer detail={detail} closeHref={here} />}
    </div>
  );
}

const FIELDS: { key: keyof PolicyRules; label: string; show: (v: PolicyRules[keyof PolicyRules]) => string }[] = [
  { key: "approvalAbove", label: "Pay automatically up to", show: (v) => fmt$(BigInt(v as string)) },
  { key: "maxPerPurchase", label: "Never more than", show: (v) => fmt$(BigInt(v as string)) },
  { key: "allowedProviders", label: "Allowed providers", show: (v) => ((v as string[]).length ? (v as string[]).join(", ") : "none") },
  { key: "maxPurchasesPerHour", label: "Purchases per agent per hour", show: (v) => String(v) },
  { key: "reuseWindowSeconds", label: "Reuse window", show: (v) => (v ? `${Math.round((v as number) / 60)} min` : "never") },
  { key: "expiresAt", label: "Permission ends", show: (v) => (v ? dateTime(v as string) : "never") },
];

/** What changed between rule versions, newest first. Versions are never edited in place. */
function PolicyDiff({ history }: { history: { version: number; rules: PolicyRules; createdAt: Date; changeNote: string | null; createdBy: string }[] }) {
  const asc = [...history].sort((a, b) => a.version - b.version);
  if (asc.length <= 1)
    return (
      <p className="flex gap-2 text-sm text-text-2">
        <History className="mt-0.5 size-4 shrink-0" aria-hidden />
        The rules haven&apos;t changed since the task was created. Every change creates a new version; old versions are kept.
      </p>
    );
  return (
    <ol className="space-y-4">
      {asc
        .slice(1)
        .map((v, i) => {
          const prev = asc[i];
          const changes = FIELDS.filter((f) => JSON.stringify(prev.rules[f.key]) !== JSON.stringify(v.rules[f.key]));
          return (
            <li key={v.version}>
              <p className="text-xs text-text-2">
                v{prev.version} → <span className="font-medium text-text">v{v.version}</span> · {dateTime(v.createdAt)}
                {v.changeNote ? ` · ${v.changeNote}` : ""}
              </p>
              <ul className="mt-1.5 space-y-1 text-[13px]">
                {changes.map((f) => (
                  <li key={f.key}>
                    {f.label}: <span className="text-danger line-through">{f.show(prev.rules[f.key])}</span> → <span className="font-medium text-success">{f.show(v.rules[f.key])}</span>
                  </li>
                ))}
                {changes.length === 0 && <li className="text-text-2">No rule values changed.</li>}
              </ul>
            </li>
          );
        })
        .reverse()}
    </ol>
  );
}
