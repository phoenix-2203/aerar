// Offline verification: check what Aerar signed without trusting Aerar's server. Needs `viem` (peer dependency).
//
//   import { verifyReceipt, verifyMandate, checkTransferOnBase } from "@aerar/sdk/verify";
//   const r = await verifyReceipt(encoded, { signer: AERAR_SIGNER });   // pin the signer; don't fetch it each time
//   r.ok  // the receipt is unchanged and signed by that key
import { decodeEventLog, parseAbi, recoverMessageAddress, type Hex } from "viem";
import type { Mandate, SignedReceipt } from "./types.js";

export const RECEIPT_PREFIX = "aerar-receipt:v1:";
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const BASE_SEPOLIA_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** Canonical JSON: keys sorted at every level, no whitespace. Byte-for-byte what Aerar hashes. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export async function sha256Hex(s: string): Promise<Hex> {
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return `0x${[...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/** Accepts the encoded "aerar-receipt:v1:…" string, its JSON, or the object. */
export function decodeReceipt(input: string | SignedReceipt): SignedReceipt | null {
  if (typeof input !== "string") return input;
  const t = input.trim();
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

async function recover(hash: string, signature: string): Promise<string | null> {
  try {
    return await recoverMessageAddress({ message: { raw: hash as Hex }, signature: signature as Hex });
  } catch {
    return null;
  }
}

export interface SignatureCheck {
  /** All of the below. */
  ok: boolean;
  /** The contents hash to the hash that was signed: nothing was edited. */
  unchanged: boolean;
  /** The address the signature recovers to. */
  recovered: string | null;
  /** That address is the signer you pinned. */
  signedByAerar: boolean;
}

/** A receipt is unchanged and signed by `signer` (Aerar's published address; pin it, e.g. from GET /api/receipts/signer once). */
export async function verifyReceipt(input: string | SignedReceipt, opts: { signer: string }): Promise<SignatureCheck & { receipt: SignedReceipt | null }> {
  const r = decodeReceipt(input);
  if (!r) return { ok: false, unchanged: false, recovered: null, signedByAerar: false, receipt: null };
  const unchanged = (await sha256Hex(canonicalJson(r.body))) === r.sha256;
  const recovered = await recover(r.sha256, r.signature);
  const signedByAerar = !!recovered && recovered.toLowerCase() === opts.signer.toLowerCase();
  return { ok: unchanged && signedByAerar, unchanged, recovered, signedByAerar, receipt: r };
}

/** A task's mandate (from aerar.mandate()) is exactly the document Aerar signed, and signed by `signer`. */
export async function verifyMandate(m: Pick<Mandate, "signed" | "valid">, opts: { signer: string }): Promise<SignatureCheck & { serverSaysValid: boolean }> {
  const { sha256, signature, document } = m.signed;
  if (!sha256 || !signature || !document) return { ok: false, unchanged: false, recovered: null, signedByAerar: false, serverSaysValid: m.valid };
  const unchanged = (await sha256Hex(canonicalJson(document))) === sha256;
  const recovered = await recover(sha256, signature);
  const signedByAerar = !!recovered && recovered.toLowerCase() === opts.signer.toLowerCase();
  return { ok: unchanged && signedByAerar && m.valid, unchanged, recovered, signedByAerar, serverSaysValid: m.valid };
}

export type TransferCheck =
  | { state: "ok"; detail: string }
  | { state: "mismatch" | "missing" | "reverted"; detail: string }
  | { state: "skip"; detail: string };

/**
 * Look the receipt's USDC transfer up on Base Sepolia yourself: the transaction exists, succeeded, and moved the receipt's
 * amount to the receipt's payee. Sandbox receipts ("0xsim…") have no chain to check and return "skip".
 */
export async function checkTransferOnBase(input: string | SignedReceipt, opts: { rpcUrl?: string; usdc?: string; fetch?: typeof fetch } = {}): Promise<TransferCheck> {
  const r = decodeReceipt(input);
  const tx = r?.body.purchase.paid.txHash;
  if (!r || !tx) return { state: "skip", detail: "Nothing was paid, so there's no transfer to check." };
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return { state: "skip", detail: "Simulated payment (sandbox): there's no chain to check." };
  const f = opts.fetch ?? globalThis.fetch;
  const res = await f(opts.rpcUrl ?? BASE_SEPOLIA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }),
    signal: AbortSignal.timeout(10_000),
  });
  const rec = (await res.json()).result as { status: string; logs: { address: string; data: Hex; topics: [Hex, ...Hex[]] }[] } | null;
  if (!rec) return { state: "missing", detail: "The chain doesn't know this transaction." };
  if (rec.status !== "0x1") return { state: "reverted", detail: "The transaction reverted." };
  const usdc = (opts.usdc ?? BASE_SEPOLIA_USDC).toLowerCase();
  const payTo = (r.body.purchase.quote.payTo ?? "").toLowerCase();
  const amount = BigInt(/^\d+$/.test(r.body.purchase.paid.amount ?? "") ? r.body.purchase.paid.amount! : "0");
  for (const log of rec.logs) {
    if (log.address.toLowerCase() !== usdc) continue;
    try {
      const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
      if (ev.args.to.toLowerCase() === payTo && ev.args.value === amount) return { state: "ok", detail: `${amount} atomic USDC went to ${payTo}, as the receipt says.` };
    } catch {
      /* not a Transfer */
    }
  }
  return { state: "mismatch", detail: "The transaction has no USDC transfer matching the receipt's payee and amount." };
}
