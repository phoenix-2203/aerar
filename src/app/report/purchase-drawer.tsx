// Purchase details, opened from any row via ?purchase=<id>. Server-rendered content inside the client Drawer.
import { splitPurpose } from "@/components/purchase-row";
import { CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { Hash } from "@/components/hash";
import { PurchaseTimeline } from "@/components/purchase-timeline";
import { StatusChip } from "@/components/status-chip";
import { reasonKind, sentence } from "@/lib/copy/reasons";
import { fmt$ } from "@/lib/money/usdc";
import type { getPurchaseDetail } from "@/lib/server/queries";
import { dateTime } from "@/lib/format";

type Detail = NonNullable<Awaited<ReturnType<typeof getPurchaseDetail>>>;

const KIND = {
  pass: { icon: CheckCircle2, cls: "text-success" },
  fail: { icon: XCircle, cls: "text-danger" },
  hold: { icon: Clock, cls: "text-warning" },
  info: { icon: Info, cls: "text-info" },
};

export function PurchaseDrawer({ detail, closeHref }: { detail: Detail | null; closeHref: string }) {
  if (!detail)
    return (
      <Drawer title="Purchase not found" closeHref={closeHref}>
        <p className="text-sm text-text-2">This purchase doesn&apos;t exist in this workspace, or the link is incomplete.</p>
      </Drawer>
    );
  const p = detail.purchase;
  const onchain = p.onchainCheck as { ok?: boolean; amount?: string; blockNumber?: string; reason?: string } | null;
  const body = typeof p.responseBody === "string" ? p.responseBody : null;

  return (
    <Drawer title={`Purchase ${p.id}`} closeHref={closeHref}>
      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={p.status} />
            <span className="text-xs text-text-2">{dateTime(p.createdAt)}</span>
          </div>
          <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{p.amountFormatted ?? "No price"}</p>
          <p className="mt-0.5 break-all font-mono text-[13px] text-text-2">
            {p.method} {p.url}
          </p>
          <p className="mt-3 text-sm">{p.summary.replace(/ \(tx 0x[0-9a-fA-F]+\)/, "")}</p>
        </div>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-2">Who asked, and why</h3>
          <p className="mt-2 text-sm">
            <span className="font-medium">{p.agentName}</span> <span className="text-text-2">for</span> {p.taskTitle}
          </p>
          <blockquote className="mt-1.5 border-l-2 border-border-strong pl-3 text-sm text-text-2">&ldquo;{splitPurpose(p.purpose).text}&rdquo;</blockquote>
          <p className="mt-1.5 text-xs text-text-2">The agent&apos;s words are recorded, never used to decide.</p>
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-2">Every step</h3>
          <div className="mt-3">
            <PurchaseTimeline
              purchase={{ ...p, quoteAmountFormatted: p.amountFormatted, paidFormatted: p.paidFormatted, onchainVerifiedAt: p.onchainVerifiedAt }}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-2">What decided it · rules version {p.policyVersion}</h3>
          <ul className="mt-2 space-y-1.5">
            {p.reasonCodes.map((code) => {
              const k = KIND[reasonKind(code)];
              const Icon = k.icon;
              return (
                <li key={code} className="flex gap-2 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${k.cls}`} aria-hidden />
                  <span>{sentence(code)}</span>
                </li>
              );
            })}
            {p.reasonCodes.length === 0 && <li className="text-sm text-text-2">No rule codes were recorded.</li>}
          </ul>
          {detail.rules && (
            <p className="mt-2 text-xs text-text-2">
              Limits then: pay automatically up to {fmt$(BigInt(detail.rules.approvalAbove))}, never more than {fmt$(BigInt(detail.rules.maxPerPurchase))} per purchase,{" "}
              {detail.rules.maxPurchasesPerHour} purchases per agent per hour.
            </p>
          )}
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-2">Money</h3>
          <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-sm">
            <Amount label="Quoted" value={p.amountFormatted ?? "—"} />
            <Amount label="Paid" value={p.paidFormatted} />
            <Amount label="Seen onchain" value={onchain?.amount ? fmt$(BigInt(onchain.amount)) : onchain?.ok === false ? "Mismatch" : "—"} bad={onchain?.ok === false} />
          </dl>
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-2">Proof</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <Row k="Paid to (payee)">
              <Hash value={p.quotePayTo} kind="address" label="payee address" />
            </Row>
            <Row k="Paid from (Aerar's wallet)">
              <Hash value={p.payer} kind="address" label="payer address" />
            </Row>
            <Row k="Transaction">
              <Hash value={p.txHash} kind="tx" label="transaction hash" />
            </Row>
            <Row k="Block">{onchain?.blockNumber ? <span className="tabular font-mono text-xs">{onchain.blockNumber}</span> : <span className="text-text-2">—</span>}</Row>
            <Row k="Response fingerprint (SHA-256)">
              <Hash value={p.responseHash} label="response hash" head={10} tail={6} />
            </Row>
            {p.reusedFromId && (
              <Row k="Reused from">
                <a href={`?purchase=${p.reusedFromId}`} className="font-mono text-xs text-info hover:underline">
                  {p.reusedFromId}
                </a>
              </Row>
            )}
          </dl>
        </section>

        {body && (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-2">
              What was delivered {p.responseStatus ? `· HTTP ${p.responseStatus}` : ""} {p.responseBytes ? `· ${p.responseBytes} bytes` : ""}
            </h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-5 text-text-2">
              {pretty(body).slice(0, 2000)}
            </pre>
          </section>
        )}
      </div>
    </Drawer>
  );
}

function pretty(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function Amount({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className={`font-semibold ${bad ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
      <dt className="text-text-2">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
