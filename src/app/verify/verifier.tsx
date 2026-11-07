"use client";
// The public verifier. Load a receipt (by id, by pasting, or the sample), watch three checks run in your own browser,
// then try to cheat: edit the amount, the payee or the outcome and see the stamp flip.
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheatBar, CheckList, EmptyPaper, ReceiptPaper, useReceiptChecks, withEdits, type Editable } from "@/components/receipt-slip";
import { decodeReceiptText, loadReceipt, type Check, type Receipt } from "@/lib/receipts/client";

export function Verifier({ initialId }: { initialId?: string }) {
  const [text, setText] = useState("");
  const [original, setOriginal] = useState<Receipt | null>(null);
  const [signer, setSigner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cheat, setCheat] = useState(false);
  const [edits, setEdits] = useState<Partial<Record<Editable, string>>>({});
  const chain = useRef<Check | null>(null);
  const { checks, run, verdict } = useReceiptChecks(signer);

  const load = useCallback(async (id: string) => {
    setBusy(true);
    setErr(null);
    const d = await loadReceipt(id);
    setBusy(false);
    if ("error" in d) return setErr(d.error);
    setSigner(d.signer);
    setText(d.encoded);
    setEdits({});
    setCheat(false);
    chain.current = null;
    setOriginal(d.receipt);
  }, []);

  useEffect(() => {
    if (!initialId) {
      fetch("/api/receipts/signer")
        .then((r) => r.json())
        .then((d) => setSigner(d.signer))
        .catch(() => setSigner(null));
      return;
    }
    const t = setTimeout(() => load(initialId), 0);
    return () => clearTimeout(t);
  }, [initialId, load]);

  // Full check once per loaded receipt; while cheating, only the hash and signer re-run (the chain doesn't change).
  useEffect(() => {
    if (!original || !signer) return;
    const edited = Object.keys(edits).length > 0;
    const r = edited ? withEdits(original, edits) : original;
    const t = setTimeout(() => void run(r, edited && chain.current ? { keepChain: chain.current } : {}), edited ? 120 : 0);
    return () => clearTimeout(t);
  }, [original, signer, edits, run]);
  useEffect(() => {
    const c = checks.find((x) => x.key === "chain");
    if (c && c.state !== "wait" && !chain.current) chain.current = c;
  }, [checks]);

  const sample = async () => {
    setBusy(true);
    const d = await fetch("/api/receipts/sample")
      .then((r) => r.json())
      .catch(() => null);
    if (d?.id) await load(d.id);
    else {
      setBusy(false);
      setErr("No sample receipt is available right now.");
    }
  };

  const edited = Object.keys(edits).length > 0;
  const shown = original ? (edited ? withEdits(original, edits) : original) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
      <div className="min-w-0 space-y-5">
        {original ? (
          <>
            <CheckList checks={checks} />
            <div className={`rounded-2xl border p-5 transition-colors ${cheat ? "border-danger/40 bg-danger-tint/40" : "border-dashed border-border-strong"}`}>
              <p className="text-[15px] font-semibold">{cheat ? (edited ? (verdict === "bad" ? "Caught." : "Checking…") : "Go on, change something.") : "Think a receipt could be faked?"}</p>
              <p className="mt-1 text-[13.5px] leading-6 text-text-2">
                {cheat
                  ? edited
                    ? "The receipt no longer hashes to what Aerar signed, so the first check fails. To make it pass you'd need Aerar's receipt key, and even then the third check compares it with what really happened on Base."
                    : "The amount, the payee and the outcome are editable on the receipt. Change one: make it look like less was paid, or that someone else was paid."
                  : "Press “Try to cheat” above the receipt and edit it. Anyone holding a receipt can run these checks, without trusting Aerar's server."}
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <p className="text-[15px] font-semibold">See it on a real receipt</p>
            <p className="mt-1 text-[13.5px] text-text-2">A real purchase from the live demo, paid in test USDC on Base Sepolia.</p>
            <button onClick={sample} disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition active:scale-[0.98] disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              Load a real receipt
            </button>
          </div>
        )}

        <details className="group rounded-2xl border border-border bg-surface p-5 shadow-card" open={!original && !initialId}>
          <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
            Have a receipt? Paste it <span className="text-text-3 group-open:hidden">↓</span>
          </summary>
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const r = decodeReceiptText(text);
              if (!r?.body || !r.signature) return setErr("That doesn't look like an Aerar receipt.");
              setErr(null);
              setEdits({});
              chain.current = null;
              setOriginal(r);
            }}
          >
            <label htmlFor="receipt" className="sr-only">
              Receipt
            </label>
            <textarea
              id="receipt"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="aerar-receipt:v1:…  or the receipt JSON"
              className="w-full resize-y rounded-lg border border-border bg-bg/40 p-3 font-mono text-[12px] leading-5 outline-none focus:border-border-strong"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-3">Checked in your browser. Aerar&apos;s server only supplies its public key.</p>
              <button disabled={!text.trim()} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:border-border-strong disabled:opacity-50">
                Check it
              </button>
            </div>
          </form>
        </details>
        {err && <p className="text-sm text-danger">{err}</p>}
        <p className="text-xs text-text-3">
          Aerar&apos;s receipt key: <span className="font-mono">{signer ?? "…"}</span> (also at <span className="font-mono">/api/receipts/signer</span>). It only signs
          receipts and holds no funds.
        </p>
      </div>

      <div className="min-w-0">
        {shown ? (
          <>
            <CheatBar on={cheat} edited={edited} onToggle={() => setCheat(!cheat)} onReset={() => setEdits({})} />
            <ReceiptPaper r={shown} verdict={verdict} cheat={cheat} edits={edits} onEdit={(k, v) => setEdits((e) => ({ ...e, [k]: v }))} />
          </>
        ) : (
          <EmptyPaper text={busy ? "Printing…" : undefined} />
        )}
      </div>
    </div>
  );
}
