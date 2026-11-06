import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, dateTime, Shell, Stat, StatusPill, time, TxLink } from "@/components/ui";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { morningReport, windowFor } from "@/lib/server/report";
import { operatorOrLogin } from "@/lib/server/session";
import { DecisionButtons } from "./decision-buttons";

export const metadata: Metadata = { title: "Morning report" };

const PERIODS = [
  { key: "night", label: "Last night" },
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "7 days" },
];

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <Shell active="/report">
      <Suspense fallback={<p className="text-muted">Reading the night&apos;s ledger…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

type Report = Awaited<ReturnType<typeof morningReport>>;

async function Report({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : undefined;
  await operatorOrLogin(`/report${period ? `?period=${period}` : ""}`);
  const w = windowFor(period);
  const r = await morningReport(await getDbOnly(), operatorOrgId(), w);
  const t = r.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-lamp">{w.label}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Morning report</h1>
          <p className="mt-1 text-sm text-muted">
            {dateTime(w.since)} → {dateTime(w.until)}
          </p>
        </div>
        <nav className="flex rounded-lg border border-line bg-panel p-1 text-sm" aria-label="Period">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "night" ? "/report" : `/report?period=${p.key}`}
              className={`rounded-md px-3 py-1.5 ${w.key === p.key ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <Card className="border-lamp/30 bg-gradient-to-br from-panel to-night">
        <ul className="space-y-2 text-[15px] leading-relaxed">
          {r.headline.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lamp" />
              {s}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="paid" label="Paid" value={t.formatted.spent} note={`${t.delivered} delivered · ${t.verified} verified onchain`} />
        <Stat tone="saved" label="Not spent twice" value={t.formatted.saved} note={`${t.reused} reused from memory`} />
        <Stat tone="refused" label="Refused" value={t.refused} note={t.blocked > 0n ? `${t.formatted.blocked} in quotes stopped` : "before anything was paid"} />
        <Stat tone="wait" label="Waiting for you" value={t.waiting} note={t.waiting ? "approve or reject below" : "nothing pending"} />
      </div>

      {r.waiting.length > 0 && (
        <Card title="Waiting for approval" aside="Approving re-checks the rules and re-quotes the price first">
          <ul className="divide-y divide-line">
            {r.waiting.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="num font-medium">{p.amountFormatted}</span>
                    <span className="text-muted">from</span>
                    <span className="truncate font-mono text-sm">{p.host}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {p.agentName} for <Link className="text-text hover:underline" href={`/tasks/${p.taskId}`}>{p.taskTitle}</Link>: “{p.purpose}”
                  </p>
                </div>
                <DecisionButtons id={p.id} amount={p.amountFormatted} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="What happened" aside={`${r.timeline.length} requests`} className="lg:col-span-2">
          <Timeline items={r.timeline} />
        </Card>
        <div className="space-y-6">
          <Card title="Why things were refused">
            {r.reasons.length === 0 ? (
              <p className="text-sm text-muted">Nothing was refused.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {r.reasons.map((x) => (
                  <li key={x.code} className="flex items-start justify-between gap-3">
                    <span className="first-letter:uppercase">{x.explanation}</span>
                    <span className="num shrink-0 text-muted">×{x.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Providers">
            <Rows rows={r.providers.map((p) => ({ k: p.host, mono: true, v: p.paidFormatted, sub: `${p.purchases} req · ${p.reused} reused · ${p.refused} refused` }))} empty="No providers contacted." />
          </Card>
          <Card title="Agents">
            <Rows rows={r.agents.map((a) => ({ k: a.name, v: a.paidFormatted, sub: `${a.purchases} req · ${a.refused} refused` }))} empty="No agent activity." />
          </Card>
        </div>
      </div>

      <Card title="Tasks" aside="Budgets across all time">
        <div className="grid gap-4 md:grid-cols-2">
          {r.tasks.map((task) => (
            <TaskBudget key={task.id} task={task} />
          ))}
          {r.tasks.length === 0 && <p className="text-sm text-muted">No tasks yet. Run <code>npm run seed</code>.</p>}
        </div>
      </Card>
    </div>
  );
}

function Timeline({ items }: { items: Report["timeline"] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No purchase requests in this period.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((p) => (
        <li key={p.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-night bg-faint" />
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="num text-xs text-muted">{time(p.createdAt)}</span>
            <StatusPill status={p.status} />
            <span className="text-sm">
              <span className="font-medium">{p.agentName}</span>
              <span className="text-muted"> · </span>
              <span className="font-mono text-xs">{p.host}</span>
            </span>
            {p.amountFormatted && <span className="num ml-auto text-sm">{p.status === "reused" ? <s className="text-muted">{p.amountFormatted}</s> : p.amountFormatted}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">{p.summary.replace(/ \(tx 0x[0-9a-fA-F]+\)/, "")}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-faint">
            <span>
              for <Link className="hover:text-text" href={`/tasks/${p.taskId}`}>{p.taskTitle}</Link> · policy v{p.policyVersion}
            </span>
            <TxLink hash={p.txHash} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Rows({ rows, empty }: { rows: { k: string; v: string; sub: string; mono?: boolean }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((x) => (
        <li key={x.k}>
          <div className="flex justify-between gap-3 text-sm">
            <span className={`truncate ${x.mono ? "font-mono text-xs leading-5" : ""}`}>{x.k}</span>
            <span className="num shrink-0">{x.v}</span>
          </div>
          <div className="text-xs text-faint">{x.sub}</div>
        </li>
      ))}
    </ul>
  );
}

function TaskBudget({ task }: { task: Report["tasks"][number] }) {
  const m = task.money;
  const pct = (x: bigint) => (m.budget > 0n ? Number((x * 10000n) / m.budget) / 100 : 0);
  return (
    <Link href={`/tasks/${task.id}`} className="block rounded-xl border border-line bg-night/60 p-4 transition hover:border-lamp/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{task.title}</div>
          <div className="text-xs text-muted capitalize">{task.status}</div>
        </div>
        <div className="num text-right text-sm">
          {m.formatted.remaining} <span className="text-muted">left of {m.formatted.budget}</span>
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-panel-2" role="img" aria-label={`${m.formatted.spent} spent, ${m.formatted.reserved} reserved`}>
        <div className="bg-paid" style={{ width: `${pct(m.spent)}%` }} />
        <div className="bg-wait" style={{ width: `${pct(m.reserved)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>{m.formatted.spent} spent</span>
        {m.reserved > 0n && <span>{m.formatted.reserved} reserved</span>}
        <span className="text-saved">{task.avoidedByReuseFormatted} saved by reuse</span>
      </div>
    </Link>
  );
}
