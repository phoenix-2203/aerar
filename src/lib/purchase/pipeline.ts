// The purchase lifecycle. Every money-moving step is plain code; the agent's words never change a decision.
//
//   access checks (no network call to a disallowed host)
//   -> procurement memory (identical earlier purchase still fresh? serve it for $0)
//   -> quote (the provider's real 402 price, payee, token, network)
//   -> policy (decline | needs a human | approve)
//   -> reserve budget (row lock on the task; re-check under the lock)
//   -> pay exactly the approved quote, re-quoting first so a changed price is caught
//   -> record delivery evidence, settle budget, verify the USDC transfer on Base
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  agents,
  policies,
  providers,
  purchases,
  taskAgents,
  tasks,
  type PolicyRules,
  type PurchaseStatus,
} from "@/db/schema";
import { audit } from "@/lib/audit/log";
import { reuseKey, sha256, normaliseUrl, canonicalBody } from "@/lib/memory/reuse-key";
import { accessChecks, evaluatePolicy, type PolicyInput, type PolicyResult } from "@/lib/policy/engine";
import { quoteDescription } from "@/lib/intent/intentlock";
import { buildMandate, signMandate, verifyMandate, type MandateCheck } from "@/lib/mandate/mandate";
import type { IntentRecord } from "@/db/schema";
import { checkDelivery } from "./delivery";
import type { CapturedResponse, PaymentRail, Quote } from "@/lib/x402/rail";

export type Purchase = typeof purchases.$inferSelect;
export const MAX_STORED_BODY = 256 * 1024;
const COUNTS_TOWARD_RATE: PurchaseStatus[] = ["awaiting_approval", "reserved", "paying", "delivered", "disputed", "payment_failed", "unknown"];

export interface PurchaseRequest {
  taskId: string;
  url: string;
  method: "GET" | "POST";
  body?: string | null;
  purpose: string;
  idempotencyKey: string;
}

export interface Ctx {
  db: Db;
  rail: PaymentRail;
  now?: () => Date;
  /** Allow http:// URLs (local development only). */
  allowInsecureHttp?: boolean;
}

export class PurchaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 400,
  ) {
    super(message);
  }
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
const decoder = new TextDecoder();

function evidenceFields(r: CapturedResponse) {
  const stored = r.body.byteLength <= MAX_STORED_BODY;
  return {
    responseStatus: r.status,
    responseContentType: r.contentType,
    responseHash: sha256(r.body),
    responseBytes: r.body.byteLength,
    responseBody: stored ? decoder.decode(r.body) : null,
  };
}

async function loadPolicy(db: Db, taskId: string, version: number) {
  const [p] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.taskId, taskId), eq(policies.version, version)));
  if (!p) throw new PurchaseError("POLICY_MISSING", `Task ${taskId} has no policy v${version}`, 500);
  return p;
}

/**
 * The task's current mandate, checked against its signature before anything is decided. Rows written before mandates
 * were signed (older deployments) are signed once, on first use, and that is recorded in the audit log.
 */
export async function loadMandate(db: Db, task: typeof tasks.$inferSelect): Promise<{ policy: typeof policies.$inferSelect; check: MandateCheck }> {
  let policy = await loadPolicy(db, task.id, task.currentPolicyVersion);
  if (!policy.mandate) {
    const signed = await signMandate(buildMandate(task, policy.version, policy.rules, "system:backfill"));
    const [row] = await db
      .update(policies)
      .set(signed)
      .where(and(eq(policies.taskId, task.id), eq(policies.version, policy.version), sql`${policies.mandate} is null`))
      .returning();
    if (row) {
      await audit(db, { orgId: task.orgId, actor: "system", kind: "mandate.signed", subjectId: task.id, data: { version: policy.version, mandateHash: signed.mandateHash, backfill: true } });
      policy = row;
    } else policy = await loadPolicy(db, task.id, task.currentPolicyVersion);
  }
  return { policy, check: await verifyMandate(policy, task) };
}

const COUNTS_TOWARD_CAP: PurchaseStatus[] = ["awaiting_approval", "reserved", "paying", "delivered", "disputed", "unknown"];

/** Purchases a task has made or has waiting, for the mandate's purchase cap. */
async function taskPurchaseCount(db: Db, taskId: string, excludeId?: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(and(eq(purchases.taskId, taskId), inArray(purchases.status, COUNTS_TOWARD_CAP), excludeId ? sql`${purchases.id} <> ${excludeId}` : undefined));
  return r?.n ?? 0;
}

function intentRecord(v: PolicyResult): { intent: IntentRecord } | Record<string, never> {
  if (!v.intent) return {};
  const { outcome, taskCategories, itemCategories, evidence, described, explanation } = v.intent;
  return { intent: { outcome, taskCategories, itemCategories, evidence, described, explanation } };
}

async function agentRateCount(db: Db, agentId: string, now: Date) {
  const since = new Date(now.getTime() - 3600_000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchases)
    .where(and(eq(purchases.agentId, agentId), gte(purchases.createdAt, since), inArray(purchases.status, COUNTS_TOWARD_RATE)));
  return r?.n ?? 0;
}

/** Parent tasks of a sub-task, nearest first (at most 5 levels). */
async function parentsOf(db: Db, task: { parentTaskId: string | null }, lock = false): Promise<(typeof tasks.$inferSelect)[]> {
  const out: (typeof tasks.$inferSelect)[] = [];
  let next = task.parentTaskId;
  while (next && out.length < 5) {
    const q = db.select().from(tasks).where(eq(tasks.id, next));
    const [t] = lock ? await q.for("update") : await q;
    if (!t) break;
    out.push(t);
    next = t.parentTaskId;
  }
  return out;
}
const asParents = (ps: (typeof tasks.$inferSelect)[]) =>
  ps.map((t) => ({ id: t.id, title: t.title, status: t.status, budget: t.budget, reserved: t.reserved, spent: t.spent }));

/** Reserved or paid to one provider on one task (for per-provider caps). */
async function spentWithProvider(db: Db, taskId: string, host: string): Promise<bigint> {
  const [r] = await db
    .select({ n: sql<string>`coalesce(sum(coalesce(${purchases.paidAmount}, ${purchases.reservedAmount}, 0)), 0)` })
    .from(purchases)
    .where(and(eq(purchases.taskId, taskId), eq(purchases.host, host), inArray(purchases.status, ["reserved", "paying", "delivered", "disputed", "unknown"])));
  return BigInt(r?.n ?? 0);
}

/** Apply the same change to every parent's running totals, so a hired agent's spend counts up the chain. */
async function rollUp(t: Db, taskId: string, set: (tbl: typeof tasks) => Record<string, unknown>) {
  const [task] = await t.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, taskId));
  for (const parent of await parentsOf(t, task ?? { parentTaskId: null }, true)) await t.update(tasks).set(set(tasks)).where(eq(tasks.id, parent.id));
}

/** What this organisation last paid for the same item (host + path), for price memory. */
async function lastPaidFor(db: Db, orgId: string, url: string): Promise<bigint | null> {
  const u = new URL(url);
  const rows = await db
    .select({ url: purchases.url, paid: purchases.paidAmount })
    .from(purchases)
    .where(and(eq(purchases.orgId, orgId), eq(purchases.host, u.host), eq(purchases.status, "delivered")))
    .orderBy(desc(purchases.createdAt))
    .limit(50);
  const hit = rows.find((r) => new URL(r.url).pathname === u.pathname && r.paid > 0n);
  return hit?.paid ?? null;
}

/** Why a provider is on hold (it took a payment without delivering), or null. */
async function heldReason(db: Db, orgId: string, host: string): Promise<string | null> {
  const p = await provider(db, orgId, host);
  return p?.heldAt ? (p.heldReason ?? "it took a payment without delivering") : null;
}

async function provider(db: Db, orgId: string, host: string) {
  const [p] = await db
    .select()
    .from(providers)
    .where(and(eq(providers.orgId, orgId), eq(providers.host, host)));
  return p ?? null;
}

/** Pick the provider offer this deployment can settle. Falls back to the first offer so the decline says why. */
function pickQuote(quotes: Quote[], rail: PaymentRail): Quote | null {
  return (
    quotes.find(
      (q) => q.network === rail.network && q.scheme === rail.scheme && q.asset.toLowerCase() === rail.asset.toLowerCase(),
    ) ??
    quotes[0] ??
    null
  );
}

export async function submitPurchase(ctx: Ctx, agentId: string, req: PurchaseRequest): Promise<Purchase> {
  const { db } = ctx;
  const now = ctx.now?.() ?? new Date();

  // ---- validate the request itself
  let url: URL;
  try {
    url = normaliseUrl(req.url);
  } catch {
    throw new PurchaseError("INVALID_URL", "url is not a valid absolute URL");
  }
  if (url.protocol !== "https:" && !(ctx.allowInsecureHttp && url.protocol === "http:"))
    throw new PurchaseError("INSECURE_URL", "Only https:// URLs can be purchased");
  if (url.username || url.password) throw new PurchaseError("INVALID_URL", "Credentials in URLs are not allowed");
  const body = req.method === "POST" ? (canonicalBody(req.body) ?? null) : null;

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new PurchaseError("UNKNOWN_AGENT", "Unknown agent", 401);

  // ---- idempotency: same agent + key returns the original purchase, never a second payment
  const key = reuseKey(req.method, url.toString(), body);
  const existing = await findByIdempotencyKey(db, agentId, req.idempotencyKey);
  if (existing) return sameRequestOrConflict(existing, key, req.taskId);

  try {
    return await submitNew(ctx, agent, req, url, body, key, now);
  } catch (e) {
    // Two concurrent requests with the same key can both pass the check above. The unique index lets
    // exactly one insert win; the loser returns the winner's row (or a conflict if it differs).
    if (!isUniqueViolation(e, "purchases_idem")) throw e;
    const winner = await findByIdempotencyKey(db, agentId, req.idempotencyKey);
    if (!winner) throw e;
    return sameRequestOrConflict(winner, key, req.taskId);
  }
}

async function findByIdempotencyKey(db: Db, agentId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.agentId, agentId), eq(purchases.idempotencyKey, idempotencyKey)));
  return row ?? null;
}

function sameRequestOrConflict(existing: Purchase, key: string, taskId: string): Purchase {
  if (existing.reuseKey !== key || existing.taskId !== taskId)
    throw new PurchaseError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request", 409);
  return existing;
}

/** Postgres unique_violation (23505), unwrapping Drizzle's error wrapper. */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  for (let err: unknown = e, i = 0; err && i < 4; err = (err as { cause?: unknown }).cause, i++) {
    const x = err as { code?: string; constraint?: string; message?: string };
    if (x.code === "23505") return !constraint || x.constraint === constraint || !!x.message?.includes(constraint);
  }
  return false;
}

async function submitNew(
  ctx: Ctx,
  agent: typeof agents.$inferSelect,
  req: PurchaseRequest,
  url: URL,
  body: string | null,
  key: string,
  now: Date,
): Promise<Purchase> {
  const { db, rail } = ctx;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, req.taskId));
  if (!task || task.orgId !== agent.orgId) throw new PurchaseError("UNKNOWN_TASK", "Unknown task", 404);
  const [assignment] = await db
    .select()
    .from(taskAgents)
    .where(and(eq(taskAgents.taskId, task.id), eq(taskAgents.agentId, agent.id)));
  const { policy, check: mandate } = await loadMandate(db, task);

  const base = {
    id: newId("pur"),
    orgId: agent.orgId,
    taskId: task.id,
    agentId: agent.id,
    idempotencyKey: req.idempotencyKey,
    method: req.method,
    url: url.toString(),
    host: url.host,
    requestBody: body,
    requestBodyHash: body ? sha256(body) : null,
    purpose: req.purpose.slice(0, 1000),
    reuseKey: key,
    policyVersion: policy.version,
    mandateHash: policy.mandateHash,
  };
  // ---- 0. the mandate must be exactly what was signed; otherwise nothing is bought for this task
  if (!mandate.ok)
    return record(
      db,
      { ...base, status: "declined", reasonCodes: ["MANDATE_INVALID"], decidedAt: now, error: mandate.problems.join(" ") },
      "purchase.declined",
      `agent:${agent.id}`,
      { security: "mandate_invalid", problems: mandate.problems },
    );
  const parents = asParents(await parentsOf(db, task));
  const accessInput = {
    now,
    parents,
    task: { status: task.status, budget: task.budget, reserved: task.reserved, spent: task.spent, deadline: task.deadline },
    policy: { version: policy.version, rules: policy.rules },
    agent: { revoked: !!agent.revokedAt, assignedToTask: !!assignment },
    host: url.host,
    url: url.toString(),
    taskPurchaseCount: await taskPurchaseCount(db, task.id),
    providerHeld: await heldReason(db, agent.orgId, url.host),
  };

  // ---- 1. access checks before touching the provider
  const access = accessChecks(accessInput);
  if (access.declines.length)
    return record(db, { ...base, status: "declined", reasonCodes: access.declines.map((d) => d[0]), decidedAt: now, error: access.declines.map((d) => d[1]).join(" ") }, "purchase.declined", `agent:${agent.id}`);

  // ---- 2. procurement memory
  const { hit: reused, altered } = await findReusable(db, agent.orgId, key, policy.rules, now);
  if (altered)
    await audit(db, { orgId: agent.orgId, actor: "system", kind: "memory.integrity_failed", subjectId: altered, data: { reuseKey: key, note: "Stored result no longer matches the hash recorded at delivery; not reused." } });
  const memoryNote = altered ? ["MEMORY_ALTERED"] : [];
  if (reused)
    return record(
      db,
      {
        ...base,
        status: "reused",
        reasonCodes: [...access.passes, "REUSED_EARLIER_PURCHASE"],
        reusedFromId: reused.id,
        quoteAmount: reused.paidAmount,
        responseStatus: reused.responseStatus,
        responseContentType: reused.responseContentType,
        responseHash: reused.responseHash,
        responseBytes: reused.responseBytes,
        responseBody: reused.responseBody,
        decidedAt: now,
        deliveredAt: now,
      },
      "purchase.reused",
      `agent:${agent.id}`,
      { reusedFrom: reused.id, avoided: reused.paidAmount },
    );

  // ---- 3. quote
  const spec = { method: req.method, url: url.toString(), body };
  let q;
  try {
    q = await rail.quote(spec);
  } catch (e) {
    return record(db, { ...base, status: "payment_failed", reasonCodes: ["PROVIDER_UNREACHABLE"], error: (e as Error).message, decidedAt: now }, "purchase.provider_unreachable", `agent:${agent.id}`);
  }
  if (q.kind === "free")
    return record(db, { ...base, status: "free", reasonCodes: [...access.passes, "NO_PAYMENT_REQUESTED"], decidedAt: now, deliveredAt: now, ...evidenceFields(q.response) }, "purchase.free", `agent:${agent.id}`);
  const quote = pickQuote(q.quotes, rail);
  if (!quote)
    return record(db, { ...base, status: "declined", reasonCodes: ["NO_USABLE_QUOTE"], decidedAt: now, error: "Provider offered no payment options" }, "purchase.declined", `agent:${agent.id}`);
  const quoteFields: Partial<NewPurchase> = {
    quoteAmount: quote.amount,
    quotePayTo: quote.payTo,
    quoteAsset: quote.asset,
    quoteNetwork: quote.network,
    quoteScheme: quote.scheme,
    quoteRaw: quote.raw,
  };

  // ---- 4. policy on the real quote
  const prov = await provider(db, agent.orgId, url.host);
  const input: PolicyInput = {
    ...accessInput,
    quote,
    knownPayTo: prov?.knownPayTo ?? null,
    agentPurchasesLastHour: await agentRateCount(db, agent.id, now),
    providerSpent: await spentWithProvider(db, task.id, url.host),
    lastPaidPrice: await lastPaidFor(db, agent.orgId, url.toString()),
    providerDescription: quoteDescription(quote.raw),
    rails: { network: rail.network, asset: rail.asset, scheme: rail.scheme },
  };
  const verdict = evaluatePolicy(input);
  Object.assign(quoteFields, intentRecord(verdict));
  const intentAudit = verdict.intent ? { intent: verdict.intent.outcome, itemCategories: verdict.intent.itemCategories } : {};
  if (verdict.decision === "decline")
    return record(
      db,
      { ...base, ...quoteFields, status: "declined", reasonCodes: [...verdict.reasonCodes, ...memoryNote], error: verdict.explanations.join(" "), decidedAt: now },
      "purchase.declined",
      `agent:${agent.id}`,
      intentAudit,
    );
  if (verdict.decision === "needs_approval") {
    const held = await record(
      db,
      { ...base, ...quoteFields, status: "awaiting_approval", reasonCodes: [...verdict.reasonCodes, ...memoryNote], decidedAt: now },
      "purchase.awaiting_approval",
      `agent:${agent.id}`,
      intentAudit,
    );
    // Tell the people who decide, where they are (Slack / Discord / Telegram). Fire and forget.
    void import("@/lib/notify/notify").then((n) => n.notifyApproval(db, held));
    return held;
  }

  // ---- 5. reserve under a row lock, re-checking with fresh totals
  const reserved = await reserve(ctx, base, quoteFields, quote, input, `agent:${agent.id}`, [...verdict.reasonCodes, ...memoryNote]);
  if (reserved.status !== "reserved") return reserved;
  return execute(ctx, reserved.id);
}

async function findReusable(db: Db, orgId: string, key: string, rules: PolicyRules, now: Date): Promise<{ hit: Purchase | null; altered: string | null }> {
  if (!rules.reuseWindowSeconds) return { hit: null, altered: null };
  const since = new Date(now.getTime() - rules.reuseWindowSeconds * 1000);
  const [hit] = await db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.orgId, orgId),
        eq(purchases.reuseKey, key),
        eq(purchases.status, "delivered"),
        gte(purchases.deliveredAt, since),
      ),
    )
    .orderBy(desc(purchases.deliveredAt))
    .limit(1);
  // Only reuse something we actually kept and that was a successful response.
  if (!hit || hit.responseBody == null || !hit.responseStatus || hit.responseStatus >= 300) return { hit: null, altered: null };
  // ...and that is still byte-for-byte what was delivered. A stored result that no longer matches the hash taken at
  // delivery is never served; Aerar buys a fresh copy (under every rule) and records the mismatch.
  if (hit.responseHash && sha256(hit.responseBody) !== hit.responseHash) return { hit: null, altered: hit.id };
  return { hit, altered: null };
}

type NewPurchase = typeof purchases.$inferInsert;

async function record(db: Db, row: NewPurchase, kind: string, actor: string, extra: Record<string, unknown> = {}): Promise<Purchase> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [p] = await t.insert(purchases).values(row).returning();
    await audit(t, {
      orgId: row.orgId,
      actor,
      kind,
      subjectId: p.id,
      data: { taskId: row.taskId, url: row.url, status: row.status, reasonCodes: row.reasonCodes, quoteAmount: row.quoteAmount, ...extra },
    });
    return p;
  });
}

async function reserve(
  ctx: Ctx,
  base: Omit<NewPurchase, "status">,
  quoteFields: Partial<NewPurchase>,
  quote: Quote,
  input: PolicyInput,
  actor: string,
  reasonCodes: string[],
  approvedBy?: string,
): Promise<Purchase> {
  const now = ctx.now?.() ?? new Date();
  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [task] = await t.select().from(tasks).where(eq(tasks.id, base.taskId)).for("update");
    const fresh = evaluatePolicy({
      ...input,
      task: { status: task.status, budget: task.budget, reserved: task.reserved, spent: task.spent, deadline: task.deadline },
      parents: asParents(await parentsOf(t, task, true)),
      // Recount under the task lock so parallel requests can't slip past the mandate's purchase cap.
      taskPurchaseCount: await taskPurchaseCount(t, task.id, approvedBy ? base.id : undefined),
    });
    const ok = fresh.decision === "approve" || (approvedBy && fresh.decision === "needs_approval");
    const row: NewPurchase = ok
      ? { ...base, ...quoteFields, status: "reserved", reasonCodes, reservedAmount: quote.amount, approvedBy, decidedAt: now, updatedAt: now }
      : { ...base, ...quoteFields, status: "declined", reasonCodes: fresh.reasonCodes, error: fresh.explanations.join(" "), decidedAt: now, updatedAt: now };
    let p: Purchase;
    if (approvedBy) {
      [p] = await t.update(purchases).set(row).where(eq(purchases.id, base.id!)).returning();
    } else {
      [p] = await t.insert(purchases).values(row).returning();
    }
    if (ok) {
      await t.update(tasks).set({ reserved: sql`${tasks.reserved} + ${quote.amount}` }).where(eq(tasks.id, task.id));
      await rollUp(t, task.id, (x) => ({ reserved: sql`${x.reserved} + ${quote.amount}` }));
    }
    await audit(t, {
      orgId: base.orgId,
      actor,
      kind: ok ? "purchase.reserved" : "purchase.declined",
      subjectId: p.id,
      data: { taskId: base.taskId, amount: quote.amount, payTo: quote.payTo, reasonCodes: row.reasonCodes, policyVersion: base.policyVersion },
    });
    return p;
  });
}

/** Pay a reserved purchase. Re-quotes first: if the provider's price or payee moved, nothing is paid. */
export async function execute(ctx: Ctx, purchaseId: string): Promise<Purchase> {
  const { db, rail } = ctx;
  const [p] = await db.select().from(purchases).where(eq(purchases.id, purchaseId));
  if (!p || p.status !== "reserved") throw new PurchaseError("NOT_RESERVED", "Purchase is not reserved", 409);
  const spec = { method: p.method, url: p.url, body: p.requestBody };
  const approved: Quote = {
    scheme: p.quoteScheme!,
    network: p.quoteNetwork!,
    asset: p.quoteAsset!,
    amount: p.quoteAmount!,
    payTo: p.quotePayTo!,
    raw: p.quoteRaw,
  };

  // Claim the row so two executors can't both pay it.
  const claimed = await db
    .update(purchases)
    .set({ status: "paying", updatedAt: new Date() })
    .where(and(eq(purchases.id, p.id), eq(purchases.status, "reserved")))
    .returning();
  if (!claimed.length) throw new PurchaseError("NOT_RESERVED", "Purchase is already being paid", 409);

  let fresh: Quote | null = null;
  try {
    const q = await rail.quote(spec);
    if (q.kind === "payment_required")
      fresh =
        q.quotes.find(
          (x) =>
            x.scheme === approved.scheme &&
            x.network === approved.network &&
            x.asset.toLowerCase() === approved.asset.toLowerCase() &&
            x.payTo.toLowerCase() === approved.payTo.toLowerCase() &&
            x.amount === approved.amount,
        ) ?? null;
  } catch {
    fresh = null;
  }
  if (!fresh) return release(ctx, p, "payment_failed", "QUOTE_CHANGED", "Provider's price or payee changed since approval; nothing was paid.");

  const result = await rail.pay(spec, fresh).catch((e) => ({ kind: "unknown" as const, reason: (e as Error).message }));
  const now = new Date();

  if (result.kind === "not_settled")
    return release(ctx, p, "payment_failed", result.reason.startsWith("The Vault refused") ? "VAULT_REFUSED" : "PAYMENT_NOT_SETTLED", result.reason, result.response.status ? evidenceFields(result.response) : {});

  if (result.kind === "unknown") {
    const [u] = await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      const r = await t.update(purchases).set({ status: "unknown", error: result.reason, updatedAt: now }).where(eq(purchases.id, p.id)).returning();
      await audit(t, { orgId: p.orgId, actor: "system", kind: "purchase.unknown", subjectId: p.id, data: { reason: result.reason } });
      return r;
    });
    return u;
  }

  const paid = result.amount ?? p.reservedAmount;
  // The money has moved either way. Junk doesn't count as delivered: it's never reused and the shop goes on hold.
  const dc = checkDelivery(result.response);
  const delivered = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    // Lock order everywhere: task row first, then the purchase row. reserve() does the same; the opposite order
    // deadlocks on Postgres when a duplicate request is reserving while this one settles.
    await t.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, p.taskId)).for("update");
    const [row] = await t
      .update(purchases)
      .set({
        status: dc.ok ? "delivered" : "disputed",
        ...(dc.ok ? {} : { reasonCodes: [...p.reasonCodes, "NOT_DELIVERED", dc.code!], error: dc.detail }),
        paidAmount: paid,
        txHash: result.txHash,
        payer: result.payer ?? rail.payerAddress,
        paidAt: now,
        deliveredAt: now,
        updatedAt: now,
        ...evidenceFields(result.response),
      })
      .where(eq(purchases.id, p.id))
      .returning();
    await t
      .update(tasks)
      .set({ reserved: sql`${tasks.reserved} - ${p.reservedAmount}`, spent: sql`${tasks.spent} + ${paid}` })
      .where(eq(tasks.id, p.taskId));
    await rollUp(t, p.taskId, (x) => ({ reserved: sql`${x.reserved} - ${p.reservedAmount}`, spent: sql`${x.spent} + ${paid}` }));
    const prov = await provider(t, p.orgId, p.host);
    const hold = dc.ok ? {} : { heldAt: now, heldReason: `${dc.detail} (purchase ${p.id})` };
    if (!prov) await t.insert(providers).values({ id: newId("prv"), orgId: p.orgId, host: p.host, knownPayTo: approved.payTo, ...hold });
    else if (!prov.knownPayTo || !dc.ok) await t.update(providers).set({ knownPayTo: prov.knownPayTo ?? approved.payTo, ...hold }).where(eq(providers.id, prov.id));
    await audit(t, {
      orgId: p.orgId,
      actor: "system",
      kind: dc.ok ? "purchase.delivered" : "purchase.disputed",
      subjectId: p.id,
      data: { txHash: result.txHash, paid, responseHash: row.responseHash, responseStatus: row.responseStatus, ...(dc.ok ? {} : { deliveryCheck: dc.code, providerOnHold: p.host }) },
    });
    return row;
  });

  void import("@/lib/notify/notify").then((n) => n.notifyBudget(db, p.taskId));
  const check = await rail.verifyOnchain(result.txHash, { payTo: approved.payTo, amount: paid });
  const [final] = await db
    .update(purchases)
    .set({ onchainCheck: check, onchainVerifiedAt: check.ok ? new Date(check.checkedAt) : null, updatedAt: new Date() })
    .where(eq(purchases.id, delivered.id))
    .returning();
  return final;
}

async function release(ctx: Ctx, p: Purchase, status: PurchaseStatus, code: string, reason: string, extra: Partial<NewPurchase> = {}) {
  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await t.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, p.taskId)).for("update"); // task first (see execute)
    const [row] = await t
      .update(purchases)
      .set({ status, reasonCodes: [...p.reasonCodes, code], error: reason, updatedAt: new Date(), ...extra })
      .where(eq(purchases.id, p.id))
      .returning();
    await t.update(tasks).set({ reserved: sql`${tasks.reserved} - ${p.reservedAmount}` }).where(eq(tasks.id, p.taskId));
    await rollUp(t, p.taskId, (x) => ({ reserved: sql`${x.reserved} - ${p.reservedAmount}` }));
    await audit(t, { orgId: p.orgId, actor: "system", kind: `purchase.${status}`, subjectId: p.id, data: { code, reason, released: p.reservedAmount } });
    return row;
  });
}

/** A human approves a purchase that was over the auto-approve threshold. Hard rules still apply. */
export async function approvePurchase(ctx: Ctx, purchaseId: string, approver: string): Promise<Purchase> {
  const { db, rail } = ctx;
  const now = ctx.now?.() ?? new Date();
  const [p] = await db.select().from(purchases).where(eq(purchases.id, purchaseId));
  if (!p || p.status !== "awaiting_approval") throw new PurchaseError("NOT_AWAITING_APPROVAL", "Purchase is not awaiting approval", 409);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, p.taskId));
  const [agent] = await db.select().from(agents).where(eq(agents.id, p.agentId));
  const [assignment] = await db
    .select()
    .from(taskAgents)
    .where(and(eq(taskAgents.taskId, p.taskId), eq(taskAgents.agentId, p.agentId)));
  // Approval runs under the task's *current* mandate, not the one the request was made under, and only if it is intact.
  const { policy, check } = await loadMandate(db, task);
  if (!check.ok) {
    const [row] = await db
      .update(purchases)
      .set({ status: "declined", reasonCodes: [...p.reasonCodes, "MANDATE_INVALID"], error: check.problems.join(" "), updatedAt: new Date() })
      .where(and(eq(purchases.id, p.id), eq(purchases.status, "awaiting_approval")))
      .returning();
    await audit(db, { orgId: p.orgId, actor: `user:${approver}`, kind: "purchase.declined", subjectId: p.id, data: { security: "mandate_invalid", problems: check.problems } });
    return row ?? p;
  }
  const quote: Quote = { scheme: p.quoteScheme!, network: p.quoteNetwork!, asset: p.quoteAsset!, amount: p.quoteAmount!, payTo: p.quotePayTo!, raw: p.quoteRaw };
  const prov = await provider(db, p.orgId, p.host);
  const input: PolicyInput = {
    now,
    task: { status: task.status, budget: task.budget, reserved: task.reserved, spent: task.spent, deadline: task.deadline },
    policy: { version: policy.version, rules: policy.rules },
    agent: { revoked: !!agent.revokedAt, assignedToTask: !!assignment },
    host: p.host,
    url: p.url,
    quote,
    knownPayTo: prov?.knownPayTo ?? null,
    agentPurchasesLastHour: 0, // already counted when the request was made
    parents: asParents(await parentsOf(db, task)),
    providerSpent: await spentWithProvider(db, task.id, p.host),
    lastPaidPrice: await lastPaidFor(db, p.orgId, p.url),
    providerDescription: quoteDescription(p.quoteRaw),
    taskPurchaseCount: await taskPurchaseCount(db, task.id, p.id),
    providerHeld: await heldReason(db, p.orgId, p.host),
    rails: { network: rail.network, asset: rail.asset, scheme: rail.scheme },
  };
  const r = await reserve(
    ctx,
    { ...p, policyVersion: policy.version, mandateHash: policy.mandateHash } as NewPurchase,
    {},
    quote,
    input,
    `user:${approver}`,
    [...p.reasonCodes, "APPROVED_BY_HUMAN"],
    approver,
  );
  if (r.status !== "reserved") return r;
  return execute(ctx, r.id);
}

export async function rejectPurchase(ctx: Pick<Ctx, "db">, purchaseId: string, by: string, note?: string): Promise<Purchase> {
  return ctx.db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await t
      .update(purchases)
      .set({ status: "rejected", approvedBy: by, error: note ?? "Rejected by a person", updatedAt: new Date() })
      .where(and(eq(purchases.id, purchaseId), eq(purchases.status, "awaiting_approval")))
      .returning();
    if (!row) throw new PurchaseError("NOT_AWAITING_APPROVAL", "Purchase is not awaiting approval", 409);
    await audit(t, { orgId: row.orgId, actor: `user:${by}`, kind: "purchase.rejected", subjectId: row.id, data: { note } });
    return row;
  });
}
