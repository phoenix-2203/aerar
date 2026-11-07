// Browser-side receipt checks. Nothing here trusts Aerar's server: it recomputes the SHA-256 of the canonical receipt,
// recovers the signer from the signature, and looks the USDC transfer up on Base Sepolia through a public RPC.
import { decodeEventLog, parseAbi, recoverMessageAddress, type Hex } from "viem";
import { canonicalJson } from "@/lib/canonical";

export const RECEIPT_PREFIX = "aerar-receipt:v1:";
const RPC = "https://sepolia.base.org";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export type Receipt = {
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

export type CheckState = "ok" | "bad" | "skip" | "wait";
export type Check = { key: "hash" | "signer" | "chain"; label: string; state: CheckState; detail: string };

export function decodeReceiptText(text: string): Receipt | null {
  const t = text.trim();
  try {
    if (t.startsWith(RECEIPT_PREFIX)) {
      const b64 = t.slice(RECEIPT_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
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

export const usd = (a: string | null) => {
  if (a == null) return "—";
  const n = Number(a);
  if (!Number.isFinite(n)) return a;
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : n % 100 === 0 ? 4 : 6)}`;
};
export const shortAddr = (a: string | null) => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : "—");
export const isRealTx = (tx: string | null) => !!tx && /^0x[0-9a-fA-F]{64}$/.test(tx);

export async function checkHash(r: Receipt): Promise<Check> {
  const h = await sha256(canonicalJson(r.body));
  return h === r.sha256
    ? { key: "hash", label: "Nobody changed it", state: "ok", detail: `The receipt hashes to ${h.slice(0, 14)}…, exactly what Aerar signed.` }
    : { key: "hash", label: "Nobody changed it", state: "bad", detail: "It was edited: the contents no longer match the hash Aerar signed." };
}

export async function checkSigner(r: Receipt, signer: string | null): Promise<Check> {
  try {
    const rec = await recoverMessageAddress({ message: { raw: r.sha256 }, signature: r.signature });
    return rec.toLowerCase() === (signer ?? "").toLowerCase()
      ? { key: "signer", label: "Aerar signed it", state: "ok", detail: `The signature recovers to Aerar's published receipt key ${shortAddr(rec)}.` }
      : { key: "signer", label: "Aerar signed it", state: "bad", detail: `The signature recovers to ${shortAddr(rec)}, not Aerar's published key.` };
  } catch {
    return { key: "signer", label: "Aerar signed it", state: "bad", detail: "The signature is malformed." };
  }
}

export async function checkChain(r: Receipt): Promise<Check> {
  const label = "The money really moved";
  const tx = r.body.purchase.paid.txHash;
  if (!tx) return { key: "chain", label, state: "skip", detail: "Nothing was paid, so there's no transfer to check." };
  if (!isRealTx(tx)) return { key: "chain", label, state: "skip", detail: "Simulated payment (sandbox or demo data): there's no chain to check." };
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }),
      signal: AbortSignal.timeout(10_000),
    });
    const rec = (await res.json()).result as { status: string; logs: { address: string; data: Hex; topics: [Hex, ...Hex[]] }[] } | null;
    if (!rec) return { key: "chain", label, state: "bad", detail: "Base Sepolia doesn't know this transaction." };
    if (rec.status !== "0x1") return { key: "chain", label, state: "bad", detail: "The transaction reverted." };
    const payTo = (r.body.purchase.quote.payTo ?? "").toLowerCase();
    const amount = BigInt(/^\d+$/.test(r.body.purchase.paid.amount ?? "") ? r.body.purchase.paid.amount! : "0");
    for (const log of rec.logs) {
      if (log.address.toLowerCase() !== USDC) continue;
      try {
        const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
        if (ev.args.to.toLowerCase() === payTo && ev.args.value === amount)
          return { key: "chain", label, state: "ok", detail: `${usd(amount.toString())} USDC went to ${shortAddr(payTo)} on Base, as the receipt says.` };
      } catch {
        /* not a Transfer */
      }
    }
    return { key: "chain", label, state: "bad", detail: "The transaction has no USDC transfer matching this receipt's payee and amount." };
  } catch {
    return { key: "chain", label, state: "skip", detail: "Couldn't reach Base from this browser. Use the BaseScan link instead." };
  }
}

export type Verdict = "ok" | "bad" | "wait";
export function verdictOf(checks: Check[]): Verdict {
  if (checks.some((c) => c.state === "bad")) return "bad";
  if (checks.length === 3 && checks.every((c) => c.state === "ok" || c.state === "skip") && checks.some((c) => c.state === "ok")) return "ok";
  return "wait";
}

/** Signer key and receipt, fetched together. */
export async function loadReceipt(id: string): Promise<{ receipt: Receipt; encoded: string; signer: string | null } | { error: string }> {
  const [s, r] = await Promise.all([
    fetch("/api/receipts/signer").then((x) => x.json()).catch(() => ({ signer: null })),
    fetch(`/api/receipts/${encodeURIComponent(id)}`, { credentials: "same-origin" }).then(async (x) => ({ ok: x.ok, d: await x.json() })),
  ]);
  if (!r.ok) return { error: r.d.message ?? "Couldn't load that receipt." };
  return { receipt: r.d.receipt, encoded: r.d.encoded, signer: s.signer ?? null };
}
