"use client";
// A printed receipt slip that checks itself: hash, signer, and the transfer on Base. With `cheat`, three lines become
// editable; change one and watch the stamp flip, because the edit no longer matches what Aerar signed.
import { CheckCircle2, ExternalLink, Loader2, PencilLine, RotateCcw, ScrollText, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { explain, reasonKind, statusCopy } from "@/lib/copy/reasons";
import { checkChain, checkHash, checkSigner, isRealTx, loadReceipt, shortAddr, usd, verdictOf, type Check, type Receipt } from "@/lib/receipts/client";

export function useReceiptChecks(signer: string | null) {
  const [checks, setChecks] = useState<Check[]>([]);
  const run = useCallback(
    async (r: Receipt, opts: { skipChain?: boolean; keepChain?: Check } = {}) => {
      setChecks([
        { key: "hash", label: "Nobody changed it", state: "wait", detail: "" },
        { key: "signer", label: "Aerar signed it", state: "wait", detail: "" },
        opts.keepChain ?? { key: "chain", label: "The money really moved", state: "wait", detail: "" },
      ]);
      const [h, s] = await Promise.all([checkHash(r), checkSigner(r, signer)]);
      setChecks((c) => [h, s, c[2]]);
      if (opts.keepChain) return;
      const ch = opts.skipChain ? ({ key: "chain", label: "The money really moved", state: "skip", detail: "" } as Check) : await checkChain(r);
      setChecks([h, s, ch]);
    },
    [signer],
  );
  return { checks, run, verdict: verdictOf(checks) };
}

export function CheckList({ checks, compact = false }: { checks: Check[]; compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-1.5" : "space-y-2"} aria-live="polite">
      {checks.map((c) => (
        <li key={c.key} className={`flex gap-3 ${compact ? "" : "animate-arrive rounded-xl border border-border bg-surface p-4"}`}>
          {c.state === "wait" ? (
            <Loader2 className="mt-0.5 size-4.5 shrink-0 animate-spin text-text-3" aria-hidden />
          ) : c.state === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 animate-pop text-success" aria-hidden />
          ) : c.state === "bad" ? (
            <XCircle className="mt-0.5 size-4.5 shrink-0 animate-pop text-danger" aria-hidden />
          ) : (
            <span className="mt-1 block size-3.5 shrink-0 rounded-full border-2 border-dashed border-border-strong" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">{c.label}</p>
            {!compact || c.state === "bad" ? (
              <p className="text-[12.5px] text-text-2 [overflow-wrap:anywhere]">{c.state === "wait" ? "Checking…" : c.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type Editable = "paid" | "payTo" | "status";

/** Apply cheat edits to a copy of the receipt (dollar amount → atomic units). */
export function withEdits(r: Receipt, e: Partial<Record<Editable, string>>): Receipt {
  const c: Receipt = JSON.parse(JSON.stringify(r));
  if (e.paid !== undefined) {
    const n = Number(e.paid.replace(/[$,\s]/g, ""));
    c.body.purchase.paid.amount = Number.isFinite(n) ? Math.round(n * 1e6).toString() : e.paid;
  }
  if (e.payTo !== undefined) c.body.purchase.quote.payTo = e.payTo.trim();
  if (e.status !== undefined) c.body.purchase.status = e.status.trim().toLowerCase();
  return c;
}

export function ReceiptPaper({
  r,
  verdict,
  cheat = false,
  edits = {},
  onEdit,
}: {
  r: Receipt;
  verdict: "ok" | "bad" | "wait";
  cheat?: boolean;
  edits?: Partial<Record<Editable, string>>;
  onEdit?: (k: Editable, v: string) => void;
}) {
  const p = r.body.purchase;
  const s = statusCopy(p.status);
  const why = p.reasonCodes.filter((c) => reasonKind(c) !== "pass");
  const line = (k: string, v: React.ReactNode, edited = false) => (
    <div className={`flex items-center justify-between gap-4 py-1 ${edited ? "-mx-2 rounded bg-danger-tint px-2 text-danger" : ""}`}>
      <span className={edited ? "text-danger" : "text-text-3"}>{k}</span>
      <span className="text-right [overflow-wrap:anywhere]">{v}</span>
    </div>
  );
  const field = (k: Editable, value: string, label: string) =>
    cheat ? (
      <input
        aria-label={`Edit ${label}`}
        value={edits[k] ?? value}
        onChange={(e) => onEdit?.(k, e.target.value)}
        className="cheat-field w-[150px] rounded border border-dashed border-border-strong bg-transparent px-1.5 py-0.5 text-right font-mono text-[12px] outline-none focus:border-accent"
      />
    ) : (
      value
    );
  return (
    <article className="receipt-paper relative p-6 font-mono text-[12px] leading-5" aria-label="Receipt">
      <p className="text-center text-[13px] font-semibold tracking-[0.2em]">AERAR · RECEIPT</p>
      <p className="mt-1 text-center text-text-3">{new Date(r.body.issuedAt).toUTCString()}</p>
      <div className="grid h-14 place-items-center">
        {verdict !== "wait" && (
          <span key={verdict} className={`stamp ${verdict === "ok" ? "stamp-ok" : "stamp-bad"}`} role="status">
            {verdict === "ok" ? "VERIFIED" : "NOT VALID"}
          </span>
        )}
      </div>
      <hr className="receipt-rule" />
      {line("Purchase", p.id)}
      {line("Task", p.task.title)}
      {line("Agent", p.agent.name)}
      {line("Bought", `${p.request.method} ${p.request.host}${new URL(p.request.url).pathname}`)}
      <hr className="receipt-rule" />
      {line("Outcome", field("status", s.label.toUpperCase(), "outcome"), edits.status !== undefined)}
      {why.map((c) => (
        <p key={c} className="py-0.5 text-text-2">
          · {explain(c)}
        </p>
      ))}
      {line("Rules", `v${p.rules.version} · ${p.rules.sha256?.slice(0, 12) ?? "—"}…`)}
      {p.approvedBy && line("Approved by", p.approvedBy)}
      <hr className="receipt-rule" />
      {line("Quoted", usd(p.quote.amount))}
      {line("Paid", field("paid", usd(p.paid.amount), "paid amount"), edits.paid !== undefined)}
      {line("Payee", field("payTo", cheat ? (p.quote.payTo ?? "") : shortAddr(p.quote.payTo), "payee"), edits.payTo !== undefined)}
      {isRealTx(p.paid.txHash) && (
        <a href={`https://sepolia.basescan.org/tx/${p.paid.txHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-info hover:underline">
          View on BaseScan <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
      <hr className="receipt-rule" />
      {line("Audit entry", r.body.audit.lastEventSeq != null ? `#${r.body.audit.lastEventSeq} · ${r.body.audit.lastEventHash?.slice(0, 10)}…` : "—")}
      {line("Receipt hash", `${r.sha256.slice(0, 12)}…`)}
      <p className="mt-4 text-center text-text-3">Issued by {r.body.issuer.replace(/^https?:\/\//, "")}</p>
    </article>
  );
}

export function EmptyPaper({ text = "The receipt will print here." }: { text?: string }) {
  return (
    <div className="receipt-paper grid min-h-80 place-items-center p-8 text-center">
      <div>
        <ScrollText className="mx-auto size-6 text-text-3" aria-hidden />
        <p className="mt-2 text-sm text-text-2">{text}</p>
      </div>
    </div>
  );
}

/** The cheat controls shown above an editable paper. */
export function CheatBar({ on, edited, onToggle, onReset }: { on: boolean; edited: boolean; onToggle: () => void; onReset: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <button
        onClick={onToggle}
        aria-pressed={on}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition active:scale-[0.98] ${on ? "border-danger/50 bg-danger-tint text-danger" : "border-border bg-surface hover:border-border-strong"}`}
      >
        <PencilLine className="size-4" aria-hidden />
        {on ? "Cheating: edit the dashed lines" : "Try to cheat"}
      </button>
      {edited && (
        <button onClick={onReset} className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2 hover:text-text">
          <RotateCcw className="size-3.5" aria-hidden /> Put it back
        </button>
      )}
    </div>
  );
}

/** A receipt in a dialog, for rows in the sandbox and the Vault page. Loads, checks, and links to the full page. */
export function ReceiptDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<Receipt | null>(null);
  const [signer, setSigner] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { checks, run, verdict } = useReceiptChecks(signer);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    loadReceipt(id).then((d) => {
      if (!live) return;
      if ("error" in d) setErr(d.error);
      else {
        setSigner(d.signer);
        setR(d.receipt);
      }
    });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    if (r) void run(r);
  }, [r, run]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="receipt-dialog m-auto w-[min(440px,calc(100vw-24px))] bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      aria-label="Receipt"
    >
      <div className="relative">
        <button onClick={() => ref.current?.close()} className="absolute -top-10 right-0 grid size-8 place-items-center rounded-full bg-surface text-text-2 shadow-card hover:text-text" aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>
        {err ? (
          <div className="rounded-2xl bg-surface p-6 text-sm text-danger">{err}</div>
        ) : r ? (
          <div className="animate-arrive">
            <ReceiptPaper r={r} verdict={verdict} />
            <div className="mt-3 rounded-xl bg-surface p-4 shadow-card">
              <CheckList checks={checks} compact />
              <a href={`/verify?id=${id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-info hover:underline">
                Open it on its own page, and try to cheat <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </div>
        ) : (
          <EmptyPaper text="Printing…" />
        )}
      </div>
    </dialog>
  );
}

/** "Receipt" button that prints the slip in a dialog. */
export function ReceiptButton({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <ReceiptDialog id={id} onClose={() => setOpen(false)} />}
    </>
  );
}
