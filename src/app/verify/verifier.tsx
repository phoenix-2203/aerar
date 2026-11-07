"use client";
// Verifies a receipt in the browser, without trusting Aerar's server for the result: recompute the SHA-256 of the
// canonical receipt, recover the signer from the signature, compare with the published key, then look the USDC
// transfer up on Base Sepolia through a public RPC.
import { CheckCircle2, ExternalLink, Loader2, ScrollText, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { decodeEventLog, parseAbi, recoverMessageAddress, type Hex } from "viem";
import { canonicalJson } from "@/lib/canonical";
import { explain, reasonKind, statusCopy } from "@/lib/copy/reasons";

const PREFIX = "aerar-receipt:v1:";
const RPC = "https://sepolia.base.org";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

type Receipt = {
  body: {
    issuer: string;
    issuedAt: string;
    purchase: {
      id: string;
      task: { title: string };
      agent: { name: string };
      request: { method: string; url: string; host: string; purposeSha256: string };
      status: string;
      reasonCodes: string[];
      rules: { version: number; sha256: string | null };
      quote: { amount: string | null; payTo: string | null; network: string | null };
      paid: { amount: string | null; txHash: string | null; payer: string | null; onchainVerified: boolean };
      delivery: { sha256: string | null; bytes: number | null };
      decidedAt: string | null;
      approvedBy: string | null;
    };
    audit: { lastEventSeq: number | null; lastEventHash: string | null };
  };
  sha256: Hex;
  signer: Hex;
  signature: Hex;
};

type Check = { label: string; state: "ok" | "bad" | "skip" | "wait"; detail: string };

function decode(text: string): Receipt | null {
  const t = text.trim();
  try {
    if (t.startsWith(PREFIX)) {
      const b64 = t.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    }
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function sha256(s: string): Promise<Hex> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return `0x${[...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

const usd = (a: string | null) => {
  if (a == null) return "—";
  const n = Number(a);
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : n % 100 === 0 ? 4 : 6)}`;
};

async function onchain(r: Receipt): Promise<Check> {
  const tx = r.body.purchase.paid.txHash;
  if (!tx) return { label: "Payment on Base", state: "skip", detail: "Nothing was paid, so there is no transfer to check." };
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return { label: "Payment on Base", state: "skip", detail: "Simulated payment (sandbox or demo data): there is no chain to check." };
  try {
    const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }) });
    const rec = (await res.json()).result as { status: string; logs: { address: string; data: Hex; topics: [Hex, ...Hex[]] }[] } | null;
    if (!rec) return { label: "Payment on Base", state: "bad", detail: "Base Sepolia doesn't know this transaction." };
    if (rec.status !== "0x1") return { label: "Payment on Base", state: "bad", detail: "The transaction reverted." };
    const payTo = (r.body.purchase.quote.payTo ?? "").toLowerCase();
    const amount = BigInt(r.body.purchase.paid.amount ?? "0");
    for (const log of rec.logs) {
      if (log.address.toLowerCase() !== USDC) continue;
      try {
        const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
        if (ev.args.to.toLowerCase() === payTo && ev.args.value === amount)
          return { label: "Payment on Base", state: "ok", detail: `${usd(amount.toString())} USDC moved to ${payTo.slice(0, 8)}…${payTo.slice(-4)}, as the receipt says.` };
      } catch {
        /* not a Transfer */
      }
    }
    return { label: "Payment on Base", state: "bad", detail: "The transaction has no USDC transfer matching the receipt's payee and amount." };
  } catch {
    return { label: "Payment on Base", state: "skip", detail: "Couldn't reach a Base Sepolia RPC from this browser. Use the BaseScan link instead." };
  }
}

export function Verifier({ initialId }: { initialId?: string }) {
  const [text, setText] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [signer, setSigner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/receipts/signer")
      .then((r) => r.json())
      .then((d) => setSigner(d.signer))
      .catch(() => setSigner(null));
  }, []);

  const verify = useCallback(
    async (r: Receipt) => {
      setReceipt(r);
      setErr(null);
      const base: Check[] = [
        { label: "Receipt unchanged", state: "wait", detail: "" },
        { label: "Signed by Aerar", state: "wait", detail: "" },
        { label: "Payment on Base", state: "wait", detail: "" },
      ];
      setChecks(base);
      const h = await sha256(canonicalJson(r.body));
      const c1: Check = h === r.sha256 ? { label: "Receipt unchanged", state: "ok", detail: `SHA-256 ${h.slice(0, 14)}… matches the signed hash.` } : { label: "Receipt unchanged", state: "bad", detail: "The contents don't match the signed hash: it was edited." };
      let c2: Check;
      try {
        const rec = await recoverMessageAddress({ message: { raw: r.sha256 }, signature: r.signature });
        const pub = (signer ?? "").toLowerCase();
        c2 =
          rec.toLowerCase() === pub
            ? { label: "Signed by Aerar", state: "ok", detail: `Signature recovers to Aerar's published receipt key ${rec.slice(0, 8)}…${rec.slice(-4)}.` }
            : { label: "Signed by Aerar", state: "bad", detail: `Signature recovers to ${rec.slice(0, 8)}…${rec.slice(-4)}, not Aerar's published key.` };
      } catch {
        c2 = { label: "Signed by Aerar", state: "bad", detail: "The signature is malformed." };
      }
      setChecks([c1, c2, base[2]]);
      setChecks([c1, c2, await onchain(r)]);
    },
    [signer],
  );

  useEffect(() => {
    if (!initialId || !signer) return;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/receipts/${encodeURIComponent(initialId)}`, { credentials: "same-origin" });
        const d = await res.json();
        if (!res.ok) setErr(d.message ?? "Couldn't load that receipt.");
        else {
          setText(d.encoded);
          await verify(d.receipt);
        }
      } finally {
        setBusy(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [initialId, signer, verify]);

  const allOk = checks.length > 0 && checks.every((c) => c.state === "ok" || c.state === "skip") && checks.some((c) => c.state === "ok");
  const anyBad = checks.some((c) => c.state === "bad");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <form
          className="rounded-2xl border border-border bg-surface p-5 shadow-card"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = decode(text);
            if (!r?.body || !r.signature) return setErr("That doesn't look like an Aerar receipt.");
            setBusy(true);
            await verify(r);
            setBusy(false);
          }}
        >
          <label htmlFor="receipt" className="text-sm font-medium">
            Paste a receipt
          </label>
          <textarea
            id="receipt"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="aerar-receipt:v1:…  or the receipt JSON"
            className="mt-2 w-full resize-y rounded-lg border border-border bg-bg/40 p-3 font-mono text-[12px] leading-5 outline-none focus:border-border-strong"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-text-3">Checked in your browser. Aerar&apos;s server only supplies its public key.</p>
            <button disabled={busy || !text.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition active:scale-[0.98] disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Verify
            </button>
          </div>
          {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        </form>

        {checks.length > 0 && (
          <ol className="space-y-2" aria-live="polite">
            {checks.map((c) => (
              <li key={c.label} className="flex animate-arrive gap-3 rounded-xl border border-border bg-surface p-4">
                {c.state === "wait" ? (
                  <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-text-3" aria-hidden />
                ) : c.state === "ok" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 animate-pop text-success" aria-hidden />
                ) : c.state === "bad" ? (
                  <XCircle className="mt-0.5 size-5 shrink-0 animate-pop text-danger" aria-hidden />
                ) : (
                  <span className="mt-1 block size-4 shrink-0 rounded-full border-2 border-dashed border-border-strong" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-[13px] text-text-2 [overflow-wrap:anywhere]">{c.state === "wait" ? "Checking…" : c.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-text-3">
          Aerar&apos;s receipt key: <span className="font-mono">{signer ?? "…"}</span> (also at <span className="font-mono">/api/receipts/signer</span>). It
          only signs receipts and holds no funds.
        </p>
      </div>

      {receipt ? <Paper r={receipt} verdict={anyBad ? "bad" : allOk ? "ok" : "wait"} /> : <EmptyPaper />}
    </div>
  );
}

function EmptyPaper() {
  return (
    <div className="receipt-paper grid min-h-80 place-items-center p-8 text-center">
      <div>
        <ScrollText className="mx-auto size-6 text-text-3" aria-hidden />
        <p className="mt-2 text-sm text-text-2">The receipt will print here.</p>
      </div>
    </div>
  );
}

function Paper({ r, verdict }: { r: Receipt; verdict: "ok" | "bad" | "wait" }) {
  const p = r.body.purchase;
  const s = statusCopy(p.status);
  const why = p.reasonCodes.filter((c) => reasonKind(c) !== "pass");
  const line = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-text-3">{k}</span>
      <span className="text-right [overflow-wrap:anywhere]">{v}</span>
    </div>
  );
  return (
    <article className="receipt-paper relative animate-arrive p-6 font-mono text-[12px] leading-5" aria-label="Receipt">
      <p className="text-center text-[13px] font-semibold tracking-[0.2em]">AERAR · RECEIPT</p>
      <p className="mt-1 text-center text-text-3">{new Date(r.body.issuedAt).toUTCString()}</p>
      <div className="grid h-14 place-items-center">
        {verdict !== "wait" && (
          <span className={`stamp ${verdict === "ok" ? "stamp-ok" : "stamp-bad"}`} role="status">
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
      {line("Outcome", <b>{s.label.toUpperCase()}</b>)}
      {why.map((c) => (
        <p key={c} className="py-0.5 text-text-2">
          · {explain(c)}
        </p>
      ))}
      {line("Rules", `v${p.rules.version} · ${p.rules.sha256?.slice(0, 12) ?? "—"}…`)}
      {p.approvedBy && line("Approved by", p.approvedBy)}
      <hr className="receipt-rule" />
      {line("Quoted", usd(p.quote.amount))}
      {line("Paid", usd(p.paid.amount))}
      {line("Payee", p.quote.payTo ? `${p.quote.payTo.slice(0, 8)}…${p.quote.payTo.slice(-4)}` : "—")}
      {p.paid.txHash && /^0x[0-9a-fA-F]{64}$/.test(p.paid.txHash) && (
        <a href={`https://sepolia.basescan.org/tx/${p.paid.txHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-info hover:underline">
          View on BaseScan <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
      <hr className="receipt-rule" />
      {line("Audit entry", p && r.body.audit.lastEventSeq != null ? `#${r.body.audit.lastEventSeq} · ${r.body.audit.lastEventHash?.slice(0, 10)}…` : "—")}
      {line("Receipt hash", `${r.sha256.slice(0, 12)}…`)}
      <p className="mt-4 text-center text-text-3">Issued by {r.body.issuer.replace(/^https?:\/\//, "")}</p>
    </article>
  );
}
