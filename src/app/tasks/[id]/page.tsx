import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, dateTime, Shell, StatusPill, TxLink } from "@/components/ui";
import { fmt$ } from "@/lib/money/usdc";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { getTaskDetail } from "@/lib/server/queries";
import { operatorOrLogin } from "@/lib/server/session";
import { DecisionButtons } from "@/app/report/decision-buttons";

export const metadata: Metadata = { title: "Task" };

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Shell>
      <Suspense fallback={<p className="text-muted">Loading task…</p>}>
        <Task params={params} />
      </Suspense>
    </Shell>
  );
}

async function Task({ params }: { params: PageProps<"/tasks/[id]">["params"] }) {
  const { id } = await params;
  await operatorOrLogin(`/tasks/${id}`);
  let d;
  try {
    d = await getTaskDetail(await getDbOnly(), operatorOrgId(), id);
  } catch (e) {
    if (e instanceof PurchaseError && e.httpStatus === 404) notFound();
    throw e;
  }
  const { task, money, policy, policyHistory, agents, purchases } = d;
  const rules = policy?.rules;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/report" className="text-sm text-muted hover:text-text">← Morning report</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{task.title}</h1>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs capitalize text-muted">{task.status}</span>
        </div>
        <p className="mt-1 max-w-2xl text-muted">{task.purpose}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Budget", money.formatted.budget],
          ["Spent", money.formatted.spent],
          ["Reserved", money.formatted.reserved],
          ["Left", money.formatted.remaining],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-panel/80 p-4">
            <div className="text-xs uppercase tracking-wider text-muted">{k}</div>
            <div className="num mt-1.5 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Purchases" aside={`${purchases.length} total`} className="lg:col-span-2">
          {purchases.length === 0 ? (
            <p className="text-sm text-muted">No purchases yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {purchases.map((p) => (
                <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StatusPill status={p.status} />
                    <span className="font-mono text-xs">{p.host}</span>
                    <span className="num ml-auto text-sm">{p.amountFormatted}</span>
                  </div>
                  <p className="mt-1 text-sm">“{p.purpose}”</p>
                  <p className="mt-0.5 text-sm text-muted">{p.summary.replace(/ \(tx 0x[0-9a-fA-F]+\)/, "")}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-faint">
                    <span>{dateTime(p.createdAt)}</span>
                    <span>policy v{p.policyVersion}</span>
                    {p.responseHash && <span className="font-mono" title="SHA-256 of the response">resp {p.responseHash.slice(0, 10)}…</span>}
                    <TxLink hash={p.txHash} />
                  </div>
                  {p.status === "awaiting_approval" && (
                    <div className="mt-2">
                      <DecisionButtons id={p.id} amount={p.amountFormatted} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Rules" aside={policy ? `version ${policy.version}` : undefined}>
            {rules ? (
              <dl className="space-y-2.5 text-sm">
                <Rule k="Allowed providers" v={rules.allowedProviders.length ? rules.allowedProviders.join(", ") : "none"} mono />
                <Rule k="Max per purchase" v={fmt$(BigInt(rules.maxPerPurchase))} />
                <Rule k="Needs approval above" v={fmt$(BigInt(rules.approvalAbove))} />
                <Rule k="Per agent per hour" v={`${rules.maxPurchasesPerHour} purchases`} />
                <Rule k="Reuse identical purchases for" v={rules.reuseWindowSeconds ? `${Math.round(rules.reuseWindowSeconds / 60)} min` : "never"} />
                <Rule k="Expires" v={rules.expiresAt ? dateTime(rules.expiresAt) : "never"} />
              </dl>
            ) : (
              <p className="text-sm text-muted">No policy.</p>
            )}
            {policyHistory.length > 1 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-muted">
                {policyHistory.map((v) => (
                  <li key={v.version}>
                    v{v.version} · {dateTime(v.createdAt)} · {v.changeNote ?? "created"}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Agents on this task">
            <ul className="space-y-2 text-sm">
              {agents.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span>{a.name}</span>
                  <span className={a.revokedAt ? "text-refused" : "text-paid"}>{a.revokedAt ? "revoked" : "active"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Rule({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${mono ? "break-all font-mono text-xs leading-5" : "num"}`}>{v}</dd>
    </div>
  );
}
