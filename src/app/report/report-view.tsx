// The morning report, shared by the operator page (/report) and the public read-only demo (/demo).
// Order: one-sentence lead, four tiles, approvals inbox, purchases (filterable, each opens the drawer),
// why things were declined, providers and agents, task budgets.
import { Inbox, ListFilter, Moon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApprovalCard } from "@/components/approval-card";
import { BudgetMeter } from "@/components/budget-meter";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { dateTime, shortDate, time } from "@/lib/format";
import { lead, type morningReport, type windowFor } from "@/lib/server/report";

export type Report = Awaited<ReturnType<typeof morningReport>>;
type Window = ReturnType<typeof windowFor>;

export const PERIODS = [
  { key: "night", label: "Last night", lead: "Overnight" },
  { key: "24h", label: "24 hours", lead: "In the last 24 hours" },
  { key: "7d", label: "7 days", lead: "In the last 7 days" },
];

/** Status filters use the four outcome words. */
export const STATUS_FILTERS = [
  { key: "paid", label: "Paid", statuses: ["delivered", "free"] },
  { key: "reused", label: "Reused", statuses: ["reused"] },
  { key: "needs-approval", label: "Needs approval", statuses: ["awaiting_approval"] },
  { key: "declined", label: "Declined", statuses: ["declined", "rejected", "payment_failed", "unknown", "expired"] },
];

/** Operator mode can approve and open tasks; public mode is read-only and never links to login-only pages. */
export interface ViewMode {
  readOnly: boolean;
  basePath: "/report" | "/demo";
  defaultPeriod: string;
}

export interface ReportQuery {
  period?: string;
  status?: string;
  task?: string;
}

/** Build a link to this report keeping the current query, with some values changed (undefined removes them). */
export function reportHref(mode: ViewMode, q: ReportQuery & { purchase?: string }, change: Partial<ReportQuery & { purchase?: string }> = {}) {
  const merged = { ...q, ...change };
  const sp = new URLSearchParams();
  if (merged.period && merged.period !== mode.defaultPeriod) sp.set("period", merged.period);
  if (merged.status) sp.set("status", merged.status);
  if (merged.task) sp.set("task", merged.task);
  if (merged.purchase) sp.set("purchase", merged.purchase);
  const s = sp.toString();
  return s ? `${mode.basePath}?${s}` : mode.basePath;
}

export function ReportView({ r, w, mode, q }: { r: Report; w: Window; mode: ViewMode; q: ReportQuery }) {
  const t = r.totals;
  const period = PERIODS.find((p) => p.key === w.key) ?? PERIODS[0];
  const filter = STATUS_FILTERS.find((f) => f.key === q.status);
  const rows = r.timeline.filter((p) => (!filter || filter.statuses.includes(p.status)) && (!q.task || p.taskId === q.task));
  const multiDay = w.until.getTime() - w.since.getTime() > 36 * 3600_000;
  const taskTitle = q.task ? r.tasks.find((x) => x.id === q.task)?.title : undefined;

  return (
    <div className="space-y-8">
      {/* Lead */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[13px] text-text-2">
            Morning report · {dateTime(w.since)} → {dateTime(w.until)}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold leading-8 tracking-tight sm:text-[28px] sm:leading-9">{lead(t, period.lead)}</h1>
          {r.headline.length > 1 && <p className="mt-2 text-sm text-text-2">{r.headline.slice(1).join(" ")}</p>}
        </div>
        <nav className="flex shrink-0 self-start rounded-lg border border-border bg-surface p-0.5 text-sm lg:self-auto" aria-label="Period">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={reportHref(mode, q, { period: p.key })}
              aria-current={w.key === p.key ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 ${w.key === p.key ? "bg-surface-2 font-medium text-text" : "text-text-2 hover:text-text"}`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="success" label="Paid" value={t.formatted.spent} note={t.delivered ? `${t.delivered} purchases · ${t.verified} checked onchain` : "nothing paid"} />
        <StatTile tone="info" label="Saved by reuse" value={t.formatted.saved} note={`${t.reused} served from memory`} />
        <StatTile tone="danger" label="Declined" value={t.refused} note={t.refused === 0 ? "nothing declined" : t.blocked > 0n ? `${t.formatted.blocked} in quotes stopped` : "stopped before paying"} />
        <StatTile tone="warning" label="Needs approval" value={t.waiting} note={t.waiting ? (mode.readOnly ? "waiting for the operator" : "waiting for you, below") : "nothing waiting"} />
      </div>

      {/* Approvals inbox */}
      <section id="approvals" className="scroll-mt-20" aria-labelledby="approvals-h">
        <h2 id="approvals-h" className="flex items-center gap-2 text-base font-semibold">
          Needs approval
          {r.waiting.length > 0 && <span className="tabular rounded-full bg-warning-tint px-2 text-xs font-semibold text-warning">{r.waiting.length}</span>}
        </h2>
        <div className="mt-3 space-y-3">
          {r.waiting.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border">
              <EmptyState icon={<Inbox className="size-5" aria-hidden />} title="Nothing needs you">
                Purchases above a task&apos;s auto-approve limit wait here, unpaid, until a person approves or declines them.
              </EmptyState>
            </div>
          ) : (
            r.waiting.map((p) => (
              <ApprovalCard
                key={p.id}
                readOnly={mode.readOnly}
                item={{ id: p.id, amountFormatted: p.amountFormatted, host: p.host, agentName: p.agentName, taskTitle: p.taskTitle, purpose: p.purpose, detailsHref: reportHref(mode, q, { purchase: p.id }) }}
              />
            ))
          )}
        </div>
      </section>

      {/* Purchases */}
      <Card title={`Purchases${taskTitle ? ` for ${taskTitle}` : ""}`} aside={`${rows.length} of ${r.timeline.length}`} bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5 sm:px-5">
          <ListFilter className="mr-1 size-4 text-text-2" aria-hidden />
          <FilterLink href={reportHref(mode, q, { status: undefined })} active={!q.status}>
            All
          </FilterLink>
          {STATUS_FILTERS.map((f) => (
            <FilterLink key={f.key} href={reportHref(mode, q, { status: f.key })} active={q.status === f.key}>
              {f.label}
            </FilterLink>
          ))}
          {r.tasks.length > 1 && (
            <span className="ml-auto flex flex-wrap gap-1.5">
              {r.tasks.map((x) => (
                <FilterLink key={x.id} href={reportHref(mode, q, { task: q.task === x.id ? undefined : x.id })} active={q.task === x.id}>
                  {x.title}
                </FilterLink>
              ))}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Moon className="size-5" aria-hidden />} title={r.timeline.length ? "No purchases match this filter" : "A quiet shift"}>
            {r.timeline.length ? (
              <Link href={reportHref(mode, q, { status: undefined, task: undefined })} className="text-info hover:underline">
                Show all purchases
              </Link>
            ) : (
              <>
                No agent tried to buy anything in this period. Try{" "}
                <Link href={reportHref(mode, q, { period: "7d" })} className="text-info hover:underline">
                  the last 7 days
                </Link>{" "}
                or{" "}
                <Link href="/scenarios" className="text-info hover:underline">
                  the attack lab
                </Link>
                .
              </>
            )}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={reportHref(mode, q, { purchase: p.id })}
                  scroll={false}
                  className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:px-5"
                >
                  <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                    <StatusChip status={p.status} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      <span className="font-medium">{p.agentName}</span>
                      <span className="text-text-2"> · </span>
                      <span className="font-mono text-[13px]">{p.host}</span>
                    </span>
                    <span className="block truncate text-[13px] text-text-2">&ldquo;{p.purpose}&rdquo;</span>
                  </span>
                  <span className="text-right">
                    <span className={`tabular block text-sm font-medium ${p.status === "reused" ? "text-text-2 line-through" : ""}`}>{p.amountFormatted ?? "—"}</span>
                    <span className="tabular block text-xs text-text-2">{multiDay ? `${shortDate(p.createdAt)} ${time(p.createdAt)}` : time(p.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Why, providers, agents */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Why purchases were declined">
          {r.reasons.length === 0 ? (
            <p className="text-sm text-text-2">Nothing was declined.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {r.reasons.map((x) => (
                <li key={x.code} className="flex items-start justify-between gap-3">
                  <span className="first-letter:uppercase">{x.explanation}</span>
                  <span className="tabular shrink-0 text-text-2">×{x.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Providers">
          <Rows rows={r.providers.map((p) => ({ k: p.host, mono: true, v: p.paidFormatted, sub: `${plural(p.purchases, "request")} · ${p.reused} reused · ${p.refused} declined` }))} empty="No providers contacted." />
        </Card>
        <Card title="Agents">
          <Rows rows={r.agents.map((a) => ({ k: a.name, v: a.paidFormatted, sub: `${plural(a.purchases, "request")} · ${a.refused} declined` }))} empty="No agent activity." />
        </Card>
      </div>

      {/* Tasks */}
      <section id="tasks" className="scroll-mt-20" aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="text-base font-semibold">
          Task budgets
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {r.tasks.map((task) => (
            <TaskBox key={task.id} id={task.id} mode={mode}>
              <div className="mb-3 min-w-0">
                <div className="truncate font-medium">{task.title}</div>
                <div className="text-xs text-text-2">
                  <span className="capitalize">{task.status}</span> · {plural(task.counts.total, "purchase")} · {task.avoidedByReuseFormatted} saved by reuse
                </div>
              </div>
              <BudgetMeter budget={task.money.budget} spent={task.money.spent} reserved={task.money.reserved} formatted={task.money.formatted} compact />
            </TaskBox>
          ))}
          {r.tasks.length === 0 && <p className="text-sm text-text-2">No tasks yet.</p>}
        </div>
      </section>
    </div>
  );
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function TaskBox({ id, mode, children }: { id: string; mode: ViewMode; children: ReactNode }) {
  const cls = "block rounded-xl border border-border bg-surface p-4 shadow-card";
  if (mode.readOnly) return <div className={cls}>{children}</div>;
  return (
    <Link href={`/tasks/${id}`} className={`${cls} transition-colors hover:border-border-strong`}>
      {children}
    </Link>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-2.5 py-1 text-xs transition-colors ${active ? "bg-text text-bg" : "bg-surface-2 text-text-2 hover:text-text"}`}
    >
      {children}
    </Link>
  );
}

function Rows({ rows, empty }: { rows: { k: string; v: string; sub: string; mono?: boolean }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-text-2">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((x) => (
        <li key={x.k}>
          <div className="flex justify-between gap-3 text-sm">
            <span className={`truncate ${x.mono ? "font-mono text-[13px]" : ""}`}>{x.k}</span>
            <span className="tabular shrink-0">{x.v}</span>
          </div>
          <div className="text-xs text-text-2">{x.sub}</div>
        </li>
      ))}
    </ul>
  );
}
