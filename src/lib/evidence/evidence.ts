// The evidence package for one purchase: everything that explains it, in one document, with each claim labelled by
// how strongly it can be checked. Nothing here is asserted more strongly than it is:
//
//   signed     signed by Aerar's published key; anyone can check it offline (receipt, mandate)
//   base       checked against Base itself (the USDC transfer; the audit head in a Morning Seal)
//   database   recomputed from Aerar's own records (delivery hash, audit chain); trust Aerar's database for these
//   simulated  sandbox purchases: no chain to check, said so plainly
//   none       nothing to check (e.g. a declined purchase has no payment)
import { createHash } from "node:crypto";
import { and, asc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db";
import { agents, auditEvents, policies, purchases, seals, tasks } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { canonicalJson } from "@/lib/canonical";
import { explain, reasonKind, statusCopy } from "@/lib/copy/reasons";
import { categoryLabel } from "@/lib/intent/intentlock";
import { mandateHashOf } from "@/lib/mandate/mandate";
import { fmt$ } from "@/lib/money/usdc";
import { encodeReceipt, receiptFor, receiptSignerAddress, recoverHashSigner } from "@/lib/receipts/receipt";
import type { Hex } from "viem";

export type Level = "signed" | "base" | "database" | "simulated" | "none";

export interface EvidenceCheck {
  claim: string;
  level: Level;
  ok: boolean | null; // null = not applicable
  detail: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function buildEvidence(db: Db, orgId: string, purchaseId: string, issuer: string) {
  const [row] = await db
    .select({ p: purchases, agentName: agents.name, task: tasks })
    .from(purchases)
    .innerJoin(agents, eq(agents.id, purchases.agentId))
    .innerJoin(tasks, eq(tasks.id, purchases.taskId))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.orgId, orgId)));
  if (!row) return null;
  const { p, task } = row;
  const [pol] = await db.select().from(policies).where(and(eq(policies.taskId, p.taskId), eq(policies.version, p.policyVersion)));
  const events = await db.select().from(auditEvents).where(eq(auditEvents.subjectId, p.id)).orderBy(asc(auditEvents.seq));
  const chain = await verifyChain(db, orgId);
  const lastSeq = events.at(-1)?.seq ?? null;
  const [seal] = lastSeq != null ? await db.select().from(seals).where(and(eq(seals.orgId, orgId), gte(seals.seq, lastSeq))).orderBy(asc(seals.seq)).limit(1) : [];
  const receipt = await receiptFor(db, orgId, p.id, issuer);
  const simulated = !!p.txHash?.startsWith("0xsim");
  const checks: EvidenceCheck[] = [];

  // Mandate: the version this purchase was decided under, checked against its signature (not against today's rules).
  let mandateOk: boolean | null = null;
  if (pol?.mandate && pol.mandateHash && pol.mandateSig) {
    const signer = await recoverHashSigner(pol.mandateHash as Hex, pol.mandateSig as Hex);
    mandateOk =
      mandateHashOf(pol.mandate) === pol.mandateHash &&
      !!signer &&
      signer.toLowerCase() === receiptSignerAddress().toLowerCase() &&
      canonicalJson(JSON.parse(JSON.stringify(pol.rules))) === canonicalJson(pol.mandate.rules) &&
      (!p.mandateHash || p.mandateHash === pol.mandateHash);
    checks.push({
      claim: `Decided under mandate v${pol.version}, exactly as signed`,
      level: "signed",
      ok: mandateOk,
      detail: mandateOk ? `sha256 ${pol.mandateHash.slice(0, 18)}…, signed by ${receiptSignerAddress()}` : "The stored mandate doesn't match its signature or the purchase's recorded mandate hash.",
    });
  } else checks.push({ claim: "Decided under a signed mandate", level: "none", ok: null, detail: "This purchase predates signed mandates." });

  if (receipt)
    checks.push({ claim: "The decision record is signed by Aerar", level: "signed", ok: true, detail: `Receipt sha256 ${receipt.sha256.slice(0, 18)}…; check it at ${issuer}/verify` });

  const paid = p.status === "delivered" && !!p.txHash;
  if (!paid) checks.push({ claim: "Payment", level: "none", ok: null, detail: p.status === "reused" ? "Reused from memory: nothing was paid." : "Nothing was paid." });
  else if (simulated) checks.push({ claim: "Payment", level: "simulated", ok: null, detail: "Sandbox purchase: the shop and the payment are simulated, so there is no chain to check." });
  else
    checks.push({
      claim: `USDC transfer of ${fmt$(p.paidAmount)} to ${p.quotePayTo} on Base`,
      level: "base",
      ok: !!p.onchainVerifiedAt,
      detail: p.onchainVerifiedAt ? `Transaction ${p.txHash}: the Transfer event was read from Base and matched payee and amount.` : `Not confirmed on Base yet (${(p.onchainCheck as { reason?: string } | null)?.reason ?? "no check recorded"}).`,
    });

  if (p.responseHash && p.responseBody != null)
    checks.push({
      claim: "The delivered data is unchanged since delivery",
      level: "database",
      ok: sha(p.responseBody) === p.responseHash,
      detail: `sha256 ${p.responseHash.slice(0, 16)}… recomputed from the stored copy.`,
    });

  checks.push({
    claim: "The audit trail for this workspace is unbroken",
    level: "database",
    ok: chain.ok,
    detail: chain.ok ? `${chain.count} entries, each hashing the one before.` : `Broken at entry #${chain.brokenAt}.`,
  });
  if (seal)
    checks.push({
      claim: "These audit entries were sealed on Base",
      level: "base",
      ok: true,
      detail: `Morning Seal up to entry #${seal.seq}, transaction ${seal.txHash}. Check it on the Verify page.`,
    });

  const intent = p.intent;
  return {
    v: 1,
    kind: "aerar.evidence-package",
    issuer,
    generatedAt: new Date().toISOString(),
    purchase: {
      id: p.id,
      status: p.status,
      statusLabel: statusCopy(p.status).label,
      task: { id: task.id, title: task.title },
      agent: { id: p.agentId, name: row.agentName },
      request: { method: p.method, url: p.url, host: p.host, purpose: p.purpose, note: "The agent's stated purpose is recorded, but never used to decide." },
      createdAt: p.createdAt.toISOString(),
    },
    mandate: pol
      ? {
          version: pol.version,
          sha256: pol.mandateHash,
          signature: pol.mandateSig,
          signer: receiptSignerAddress(),
          purpose: pol.mandate?.purpose ?? task.purpose,
          budget: pol.mandate?.budget ?? null,
          categories: (pol.rules.categories ?? []).map((c) => ({ id: c, label: categoryLabel(c) })),
          ifUncertain: pol.rules.ifUncertain ?? "hold",
          changeNote: pol.changeNote,
          verified: mandateOk,
        }
      : null,
    decision: {
      outcome: statusCopy(p.status).meaning,
      reasons: p.reasonCodes.map((code) => ({ code, kind: reasonKind(code), text: explain(code) })),
      detail: p.error,
      intentLock: intent
        ? {
            outcome: intent.outcome,
            explanation: intent.explanation,
            item: intent.itemCategories.map(categoryLabel),
            task: intent.taskCategories.map(categoryLabel),
            judgedFrom: intent.described === "provider" ? "the URL and the provider's own description" : "the URL (the provider gave no description)",
            matchedTerms: intent.evidence,
          }
        : null,
      decidedAt: p.decidedAt?.toISOString() ?? null,
    },
    quote: p.quoteAmount != null ? { amount: fmt$(p.quoteAmount), atomic: p.quoteAmount.toString(), payTo: p.quotePayTo, asset: p.quoteAsset, network: p.quoteNetwork, scheme: p.quoteScheme } : null,
    approval: p.approvedBy ? { by: p.approvedBy, boundTo: "this purchase id, at exactly this quote; a changed price or payee voids it" } : null,
    payment: paid ? { amount: fmt$(p.paidAmount), txHash: p.txHash, payer: p.payer, simulated, onchainVerifiedAt: p.onchainVerifiedAt?.toISOString() ?? null } : null,
    delivery: p.responseHash ? { status: p.responseStatus, sha256: p.responseHash, bytes: p.responseBytes, reusedFrom: p.reusedFromId } : null,
    audit: events.map((e) => ({ seq: e.seq, kind: e.kind, actor: e.actor, at: e.at.toISOString(), hash: e.hash })),
    receipt: receipt ? { sha256: receipt.sha256, signer: receipt.signer, encoded: encodeReceipt(receipt) } : null,
    checks,
  };
}

export type EvidencePackage = NonNullable<Awaited<ReturnType<typeof buildEvidence>>>;
