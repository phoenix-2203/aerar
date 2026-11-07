// The Morning Seal: write the head of each workspace's hash-chained audit log to Base. After that, the whole log up to
// that entry is pinned: changing any earlier entry changes every hash after it, and the head no longer matches Base.
import { and, desc, eq, gt, like, or } from "drizzle-orm";
import { createWalletClient, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { Db } from "@/db";
import { auditEvents, seals } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { newId } from "@/lib/purchase/pipeline";
import { sealAbi } from "@/lib/vault/artifacts";
import { publicClient } from "@/lib/vault/chain";

export function sealAddress(): Hex | null {
  const a = process.env.SEAL_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Hex) : null;
}

export const workspaceKey = (orgId: string) => keccak256(toHex(`aerar-workspace:${orgId}`));

export type SealOutcome = { orgId: string; status: "sealed" | "unchanged" | "broken" | "empty" | "error"; seq?: number; txHash?: string; error?: string };

/** Seal one workspace: verify its chain, then write the head to Base (skipped if nothing changed since the last seal). */
export async function sealOrg(db: Db, orgId: string): Promise<SealOutcome> {
  const contract = sealAddress();
  const key = process.env.PAYER_PRIVATE_KEY;
  if (!contract || !key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return { orgId, status: "error", error: "SEAL_ADDRESS or PAYER_PRIVATE_KEY not set" };
  const chain = await verifyChain(db, orgId);
  if (!chain.ok) return { orgId, status: "broken", error: `Audit chain broken at entry ${chain.brokenAt}; not sealing a broken log` };
  const [head] = await db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId)).orderBy(desc(auditEvents.seq)).limit(1);
  if (!head) return { orgId, status: "empty" };
  const [last] = await db.select().from(seals).where(eq(seals.orgId, orgId)).orderBy(desc(seals.seq)).limit(1);
  if (last && last.seq >= head.seq) return { orgId, status: "unchanged", seq: last.seq };
  try {
    const account = privateKeyToAccount(key as Hex);
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL || undefined) });
    const hash = await wallet.writeContract({
      address: contract,
      abi: sealAbi,
      functionName: "seal",
      args: [workspaceKey(orgId), BigInt(head.seq), `0x${head.hash}` as Hex, chain.count],
    });
    const r = await publicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (r.status !== "success") return { orgId, status: "error", error: "Seal transaction reverted" };
    await db.insert(seals).values({ id: newId("sel"), orgId, seq: head.seq, head: head.hash, entries: chain.count, txHash: hash, contract, sealer: account.address });
    return { orgId, status: "sealed", seq: head.seq, txHash: hash };
  } catch (e) {
    return { orgId, status: "error", error: (e as Error).message.split("\n")[0] };
  }
}

/** Workspaces worth sealing: the public demo and wallet workspaces with new audit entries since their last seal. */
export async function sealDue(db: Db, operatorOrg: string): Promise<SealOutcome[]> {
  const orgs = await db
    .selectDistinct({ orgId: auditEvents.orgId })
    .from(auditEvents)
    .where(and(or(eq(auditEvents.orgId, operatorOrg), like(auditEvents.orgId, "org_w_%")), gt(auditEvents.seq, 0)));
  const out: SealOutcome[] = [];
  for (const { orgId } of orgs) out.push(await sealOrg(db, orgId)); // one at a time: one operator nonce
  return out;
}

/** The latest seal of a workspace, with the audit entry's current hash at that position (for checking against Base). */
export async function sealStatus(db: Db, orgId: string) {
  const [s] = await db.select().from(seals).where(eq(seals.orgId, orgId)).orderBy(desc(seals.seq)).limit(1);
  if (!s) return null;
  const chain = await verifyChain(db, orgId);
  const [entry] = await db.select({ hash: auditEvents.hash }).from(auditEvents).where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.seq, s.seq)));
  return {
    seq: s.seq,
    entries: s.entries,
    sealedAt: s.sealedAt.toISOString(),
    txHash: s.txHash,
    contract: s.contract,
    sealer: s.sealer,
    workspace: workspaceKey(orgId),
    /** What the log says today at the sealed position. Matches Base only if nothing was rewritten. */
    headNow: entry ? `0x${entry.hash}` : null,
    chainOk: chain.ok,
  };
}
