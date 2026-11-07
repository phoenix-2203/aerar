"use client";
// The evidence package for one purchase, in a dialog: what was decided and why (IntentLock included), the signed
// mandate it was decided under, and each claim labelled by how it can be checked. Fetched from the same endpoint
// agents and auditors use, so what a person sees here is exactly what the API returns.
import { CheckCircle2, Circle, Crosshair, Download, FileCheck2, Loader2, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EvidencePackage, Level } from "@/lib/evidence/evidence";

const LEVEL: Record<Level, { label: string; cls: string; title: string }> = {
  signed: { label: "Signed", cls: "bg-accent-tint text-accent", title: "Signed with Aerar's published key; anyone can check it offline." },
  base: { label: "On Base", cls: "bg-success-tint text-success", title: "Checked against the Base blockchain itself." },
  database: { label: "Aerar records", cls: "bg-surface-2 text-text-2", title: "Recomputed from Aerar's own database." },
  simulated: { label: "Simulated", cls: "bg-warning-tint text-warning", title: "Sandbox: there is no chain to check." },
  none: { label: "n/a", cls: "bg-surface-2 text-text-3", title: "Nothing to check." },
};

const INTENT_TONE: Record<string, string> = { match: "text-success", mismatch: "text-danger", uncertain: "text-warning", off: "text-text-3" };

export function EvidenceButton({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <EvidenceDialog id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

function EvidenceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [e, setE] = useState<EvidencePackage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    fetch(`/api/v1/purchases/${encodeURIComponent(id)}/evidence`, { credentials: "same-origin" })
      .then(async (r) => {
        const d = await r.json();
        if (!live) return;
        if (!r.ok) setErr(d.message ?? "Couldn't load the evidence.");
        else setE(d.evidence);
      })
      .catch(() => live && setErr("Couldn't load the evidence."));
    return () => {
      live = false;
    };
  }, [id]);

  const download = () => {
    if (!e) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `aerar-evidence-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(ev) => ev.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(560px,calc(100vw-24px))] rounded-2xl border border-border bg-surface p-0 text-text shadow-lift backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      aria-label="Evidence"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <FileCheck2 className="size-4 text-accent" aria-hidden /> Evidence
        </h2>
        <button onClick={() => ref.current?.close()} className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5 text-[13.5px]">
        {err ? (
          <p className="text-danger">{err}</p>
        ) : !e ? (
          <p className="flex items-center gap-2 text-text-3">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Gathering the evidence…
          </p>
        ) : (
          <>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-3">{e.purchase.statusLabel}</p>
              <p className="mt-1 break-all font-mono text-[12.5px]">{e.purchase.request.url}</p>
              <p className="mt-1 text-text-2">
                Agent said: &ldquo;{e.purchase.request.purpose}&rdquo; <span className="text-text-3">(recorded, never used to decide)</span>
              </p>
            </div>

            {e.decision.intentLock && (
              <div className="rounded-xl border border-border bg-bg/40 p-3.5">
                <p className="flex items-center gap-2 font-medium">
                  <Crosshair className={`size-4 ${INTENT_TONE[e.decision.intentLock.outcome]}`} aria-hidden /> IntentLock:{" "}
                  <span className={INTENT_TONE[e.decision.intentLock.outcome]}>{e.decision.intentLock.outcome}</span>
                </p>
                <p className="mt-1 text-text-2">{e.decision.intentLock.explanation}</p>
                <p className="mt-1 text-[12px] text-text-3">Judged from {e.decision.intentLock.judgedFrom}.</p>
              </div>
            )}

            {e.decision.reasons.length > 0 && (
              <ul className="space-y-1">
                {e.decision.reasons.map((r) => (
                  <li key={r.code} className="flex gap-2">
                    {r.kind === "pass" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    ) : r.kind === "fail" ? (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    ) : (
                      <Circle className={`mt-0.5 size-4 shrink-0 ${r.kind === "hold" ? "text-warning" : "text-text-3"}`} aria-hidden />
                    )}
                    <span className={r.kind === "pass" ? "text-text-2" : ""}>{r.text.charAt(0).toUpperCase() + r.text.slice(1)}</span>
                  </li>
                ))}
              </ul>
            )}

            {e.mandate && (
              <div className="rounded-xl border border-dashed border-border-strong p-3.5">
                <p className="font-medium">
                  Mandate v{e.mandate.version}{" "}
                  {e.mandate.verified ? <span className="text-success">· matches its signature</span> : e.mandate.verified === false ? <span className="text-danger">· does NOT match its signature</span> : null}
                </p>
                <p className="mt-1 text-text-2">&ldquo;{e.mandate.purpose}&rdquo;</p>
                {e.mandate.categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.mandate.categories.map((c) => (
                      <span key={c.id} className="rounded-full bg-accent-tint px-2 py-0.5 text-[11.5px] text-accent">
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {e.mandate.sha256 && <p className="mt-2 break-all font-mono text-[11px] text-text-3">sha256 {e.mandate.sha256}</p>}
              </div>
            )}

            <div>
              <p className="font-medium">What can be checked, and how</p>
              <ul className="mt-2 space-y-2">
                {e.checks.map((c, i) => (
                  <li key={i} className="flex gap-2.5">
                    {c.ok == null ? <Circle className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden /> : c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.claim}</span>
                        <span title={LEVEL[c.level].title} className={`rounded px-1.5 py-px font-mono text-[10.5px] ${LEVEL[c.level].cls}`}>
                          {LEVEL[c.level].label}
                        </span>
                      </span>
                      <span className="block break-words text-[12.5px] text-text-3">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <a href={`/verify?id=${encodeURIComponent(id)}`} className="text-[12.5px] font-medium text-info hover:underline">
                Check the signed receipt yourself →
              </a>
              <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] hover:border-border-strong">
                <Download className="size-3.5" aria-hidden /> Download JSON
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
