// Signed purchase receipts. A receipt is the decision record for one purchase (what was asked, the provider's real
// quote, the rules version and every reason, what was paid and where), in canonical JSON, signed by Aerar's
// published receipt key (EIP-191 over the receipt's SHA-256). Anyone can verify it offline: recompute the hash,
// recover the signer, compare with the published address, then look the transfer up on Base.
import { createHash, createHmac } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { keccak256, recoverMessageAddress, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Db } from "@/db";
import { agents, auditEvents, policies, purchases, tasks } from "@/db/schema";
import { canonicalJson } from "@/lib/canonical";

export const RECEIPT_PREFIX = "aerar-receipt:v1:";

export interface ReceiptBody {
  v: 1;
  kind: "aerar.purchase-receipt";
  issuer: string; // the deployment, e.g. https://aerar.duckdns.org
  purchase: {
    id: string;
    org: string;
    task: { id: string; title: string };
    agent: { id: string; name: string };
    request: { method: string; url: string; host: string; purposeSha256: string };
    status: string;
    reasonCodes: string[];
    rules: { version: number; sha256: string | null };
    /** The signed mandate this purchase was decided under, and what IntentLock concluded. Absent on older receipts. */
    mandate?: { sha256: string | null };
    intent?: { outcome: string; item: string[]; task: string[] } | null;
    quote: { amount: string | null; payTo: string | null; asset: string | null; network: string | null; scheme: string | null };
    paid: { amount: string | null; txHash: string | null; payer: string | null; onchainVerified: boolean };
    /** Present when the payment went into a shop's escrow and came back (not delivered). */
    refund?: { amount: string; txHash: string | null; escrow: string | null };
    delivery: { status: number | null; sha256: string | null; bytes: number | null };
    reusedFrom: string | null;
    approvedBy: string | null;
    decidedAt: string | null;
    deliveredAt: string | null;
  };
  audit: { lastEventSeq: number | null; lastEventHash: string | null };
  issuedAt: string;
}

export interface SignedReceipt {
  body: ReceiptBody;
  sha256: Hex;
  signer: Hex;
  signature: Hex;
}

const sha256hex = (s: string) => `0x${createHash("sha256").update(s).digest("hex")}` as Hex;

/**
 * The receipt key: RECEIPT_SIGNER_KEY if set, otherwise derived from SESSION_SECRET (stable per deployment, never
 * leaves the server). It signs receipts only; it holds no funds and can't pay anything.
 */
function signerKey(): Hex {
  const k = process.env.RECEIPT_SIGNER_KEY;
  if (k && /^0x[0-9a-fA-F]{64}$/.test(k)) return k as Hex;
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Receipts need RECEIPT_SIGNER_KEY or SESSION_SECRET");
  return keccak256(toBytes(`0x${createHmac("sha256", s).update("aerar-receipt-signer-v1").digest("hex")}`));
}

export function receiptSignerAddress(): Hex {
  return privateKeyToAccount(signerKey()).address;
}

/** Sign a 32-byte hash with Aerar's published key (EIP-191). Used for receipts and task mandates. */
export async function signHash(hash: Hex): Promise<{ signer: Hex; signature: Hex }> {
  const account = privateKeyToAccount(signerKey());
  return { signer: account.address, signature: await account.signMessage({ message: { raw: hash } }) };
}

/** Who signed this hash, or null if the signature is malformed. */
export async function recoverHashSigner(hash: Hex, signature: Hex): Promise<Hex | null> {
  try {
    return await recoverMessageAddress({ message: { raw: hash }, signature });
  } catch {
    return null;
  }
}

export async function signReceipt(body: ReceiptBody): Promise<SignedReceipt> {
  const hash = sha256hex(canonicalJson(body));
  const account = privateKeyToAccount(signerKey());
  const signature = await account.signMessage({ message: { raw: hash } });
  return { body, sha256: hash, signer: account.address, signature };
}

/** One copy-pasteable string: prefix + base64url(canonical JSON of the signed receipt). */
export function encodeReceipt(r: SignedReceipt): string {
  return RECEIPT_PREFIX + Buffer.from(canonicalJson(r)).toString("base64url");
}

export function decodeReceipt(text: string): SignedReceipt | null {
  const t = text.trim();
  try {
    if (t.startsWith(RECEIPT_PREFIX)) return JSON.parse(Buffer.from(t.slice(RECEIPT_PREFIX.length), "base64url").toString()) as SignedReceipt;
    return JSON.parse(t) as SignedReceipt;
  } catch {
    return null;
  }
}

export interface ReceiptCheck {
  hashMatches: boolean;
  recovered: Hex | null;
  signatureValid: boolean;
  signerIsAerar: boolean;
}

/** Offline check: the body hashes to `sha256`, and the signature over it recovers to `expectedSigner`. */
export async function checkReceipt(r: SignedReceipt, expectedSigner: string): Promise<ReceiptCheck> {
  const hashMatches = sha256hex(canonicalJson(r.body)) === r.sha256;
  let recovered: Hex | null = null;
  try {
    recovered = await recoverMessageAddress({ message: { raw: r.sha256 }, signature: r.signature });
  } catch {
    recovered = null;
  }
  const signatureValid = !!recovered && recovered.toLowerCase() === r.signer.toLowerCase();
  return { hashMatches, recovered, signatureValid, signerIsAerar: signatureValid && recovered!.toLowerCase() === expectedSigner.toLowerCase() };
}

/** Build and sign the receipt for one purchase in an org. Null if there is no such purchase. */
export async function receiptFor(db: Db, orgId: string, purchaseId: string, issuer: string): Promise<SignedReceipt | null> {
  const [row] = await db
    .select({ p: purchases, agentName: agents.name, taskTitle: tasks.title })
    .from(purchases)
    .innerJoin(agents, eq(agents.id, purchases.agentId))
    .innerJoin(tasks, eq(tasks.id, purchases.taskId))
    .where(eq(purchases.id, purchaseId));
  if (!row || row.p.orgId !== orgId) return null;
  const p = row.p;
  const allPolicies = await db.select().from(policies).where(eq(policies.taskId, p.taskId));
  const rules = allPolicies.find((x) => x.version === p.policyVersion)?.rules ?? null;
  const [last] = await db.select().from(auditEvents).where(eq(auditEvents.subjectId, p.id)).orderBy(desc(auditEvents.seq)).limit(1);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const body: ReceiptBody = {
    v: 1,
    kind: "aerar.purchase-receipt",
    issuer,
    purchase: {
      id: p.id,
      org: p.orgId,
      task: { id: p.taskId, title: row.taskTitle },
      agent: { id: p.agentId, name: row.agentName },
      request: { method: p.method, url: p.url, host: p.host, purposeSha256: sha256hex(p.purpose) },
      status: p.status,
      reasonCodes: p.reasonCodes,
      rules: { version: p.policyVersion, sha256: rules ? sha256hex(canonicalJson(rules)) : null },
      mandate: { sha256: p.mandateHash ?? null },
      intent: p.intent ? { outcome: p.intent.outcome, item: p.intent.itemCategories, task: p.intent.taskCategories } : null,
      quote: {
        amount: p.quoteAmount?.toString() ?? null,
        payTo: p.quotePayTo ?? null,
        asset: p.quoteAsset ?? null,
        network: p.quoteNetwork ?? null,
        scheme: p.quoteScheme ?? null,
      },
      // What moved in the payment transaction (a refund comes back in a separate one, below).
      paid: { amount: ((p.paidAmount ?? 0n) + (p.refundedAmount ?? 0n)).toString(), txHash: p.txHash ?? null, payer: p.payer ?? null, onchainVerified: !!p.onchainVerifiedAt },
      ...(p.status === "refunded" ? { refund: { amount: (p.refundedAmount ?? 0n).toString(), txHash: p.refundTx ?? null, escrow: p.escrow ?? null } } : {}),
      delivery: { status: p.responseStatus ?? null, sha256: p.responseHash ? `0x${p.responseHash}` : null, bytes: p.responseBytes ?? null },
      reusedFrom: p.reusedFromId ?? null,
      approvedBy: p.approvedBy ?? null,
      decidedAt: iso(p.decidedAt),
      deliveredAt: iso(p.deliveredAt),
    },
    audit: { lastEventSeq: last?.seq ?? null, lastEventHash: last?.hash ?? null },
    issuedAt: new Date().toISOString(),
  };
  return signReceipt(body);
}
