// Signed task mandates. A mandate is what a person authorised: the task's purpose, budget and rules, at one version.
// Every version is signed with Aerar's published key (EIP-191 over the sha256 of its canonical JSON) when it is
// created, and every purchase is decided only after the stored rules are checked against that signature. Anything
// that changes a mandate without going through Aerar (a hand-edited database row, a bug that writes rules, an agent
// that found a way to write) shows up as a mismatch and stops buying for that task.
//
// What this does and doesn't guarantee: it detects changes made outside Aerar's signer. Someone holding the signing key
// (the server itself) can sign a new mandate; that is why every new version is also an append-only audit event, sealed
// to Base each morning, so a quietly re-signed mandate still leaves a trace.
import { createHash } from "node:crypto";
import type { Hex } from "viem";
import type { MandateDoc, PolicyRules } from "@/db/schema";
import { canonicalJson } from "@/lib/canonical";
import { receiptSignerAddress, recoverHashSigner, signHash } from "@/lib/receipts/receipt";

export const mandateHashOf = (doc: MandateDoc): Hex => `0x${createHash("sha256").update(canonicalJson(doc)).digest("hex")}` as Hex;

/** jsonb drops undefined keys; normalise first so the signed bytes and the stored bytes are the same. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface MandateSubject {
  id: string;
  orgId: string;
  parentTaskId: string | null;
  purpose: string;
  budget: bigint;
}

export function buildMandate(task: MandateSubject, version: number, rules: PolicyRules, issuedBy: string, at = new Date()): MandateDoc {
  return plain({
    v: 1 as const,
    kind: "aerar.task-mandate" as const,
    task: { id: task.id, org: task.orgId, parent: task.parentTaskId ?? null },
    version,
    purpose: task.purpose,
    budget: task.budget.toString(),
    rules,
    issuedBy,
    issuedAt: at.toISOString(),
  });
}

export async function signMandate(doc: MandateDoc): Promise<{ mandate: MandateDoc; mandateHash: Hex; mandateSig: Hex }> {
  const mandateHash = mandateHashOf(doc);
  const { signature } = await signHash(mandateHash);
  return { mandate: doc, mandateHash, mandateSig: signature };
}

export interface MandateCheck {
  ok: boolean;
  /** Plain sentences, empty when ok. */
  problems: string[];
  hash: string | null;
  signer: string | null;
}

/**
 * Check a stored policy row against its signed mandate and the live task. Fails closed: an unsigned row, a bad
 * signature, rules or purpose or budget that differ from what was signed, or a version that isn't the task's current
 * one are all problems.
 */
export async function verifyMandate(
  row: { version: number; rules: PolicyRules; mandate: MandateDoc | null; mandateHash: string | null; mandateSig: string | null },
  task: MandateSubject & { currentPolicyVersion: number },
): Promise<MandateCheck> {
  const problems: string[] = [];
  const m = row.mandate;
  if (!m || !row.mandateHash || !row.mandateSig) return { ok: false, problems: ["This mandate version was never signed."], hash: null, signer: null };
  const hash = mandateHashOf(m);
  if (hash !== row.mandateHash) problems.push("The stored mandate doesn't match its recorded hash.");
  const signer = await recoverHashSigner(row.mandateHash as Hex, row.mandateSig as Hex);
  if (!signer || signer.toLowerCase() !== receiptSignerAddress().toLowerCase()) problems.push("The mandate's signature isn't Aerar's.");
  if (canonicalJson(plain(row.rules)) !== canonicalJson(m.rules)) problems.push("The task's rules were changed after they were signed.");
  if (m.purpose !== task.purpose) problems.push("The task's purpose was changed after it was signed.");
  if (m.budget !== task.budget.toString()) problems.push("The task's budget was changed after it was signed.");
  if (m.task.id !== task.id || m.task.org !== task.orgId || (m.task.parent ?? null) !== (task.parentTaskId ?? null))
    problems.push("The mandate belongs to a different task.");
  if (m.version !== row.version) problems.push("The mandate's version doesn't match the rules it is stored with.");
  if (row.version !== task.currentPolicyVersion) problems.push(`Mandate v${row.version} is stale; the task is on v${task.currentPolicyVersion}.`);
  return { ok: problems.length === 0, problems, hash: row.mandateHash, signer };
}
