import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { agents, organisations, policies, taskAgents, tasks, type PolicyRules } from "@/db/schema";
import { audit } from "@/lib/audit/log";
import { sha256 } from "@/lib/memory/reuse-key";
import { newId, PurchaseError } from "@/lib/purchase/pipeline";

export async function createOrg(db: Db, name: string, id = newId("org")) {
  const [o] = await db.insert(organisations).values({ id, name }).returning();
  return o;
}

/** Returns the plaintext key exactly once. Only its hash is stored. */
export async function createAgent(db: Db, orgId: string, name: string, description?: string, presetKey?: string) {
  const key = presetKey ?? `aer_${randomBytes(24).toString("base64url")}`;
  const id = newId("agt");
  const [a] = await db
    .insert(agents)
    .values({ id, orgId, name, description, apiKeyHash: sha256(key), apiKeyPrefix: key.slice(0, 10) })
    .returning();
  await audit(db, { orgId, actor: "user:operator", kind: "agent.created", subjectId: id, data: { name } });
  return { agent: a, apiKey: key };
}

export async function authenticateAgent(db: Db, bearer: string | null) {
  if (!bearer?.startsWith("aer_")) return null;
  const [a] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.apiKeyHash, sha256(bearer)), isNull(agents.revokedAt)));
  return a ?? null;
}

export async function revokeAgent(db: Db, agentId: string, by: string) {
  const [a] = await db.update(agents).set({ revokedAt: new Date() }).where(eq(agents.id, agentId)).returning();
  await audit(db, { orgId: a.orgId, actor: `user:${by}`, kind: "agent.revoked", subjectId: agentId, data: {} });
  return a;
}

export function validateRules(r: PolicyRules): PolicyRules {
  const atomic = /^\d+$/;
  if (!atomic.test(r.maxPerPurchase) || !atomic.test(r.approvalAbove)) throw new PurchaseError("INVALID_POLICY", "Amounts must be whole atomic units");
  if (!Number.isInteger(r.maxPurchasesPerHour) || r.maxPurchasesPerHour < 1 || r.maxPurchasesPerHour > 10_000)
    throw new PurchaseError("INVALID_POLICY", "maxPurchasesPerHour must be 1–10000");
  if (!Number.isInteger(r.reuseWindowSeconds) || r.reuseWindowSeconds < 0) throw new PurchaseError("INVALID_POLICY", "reuseWindowSeconds must be >= 0");
  const hosts = r.allowedProviders.map((h) => h.trim().toLowerCase()).filter(Boolean);
  for (const h of hosts)
    if (!/^(\*\.)?[a-z0-9.-]+(:\d+)?$/.test(h)) throw new PurchaseError("INVALID_POLICY", `Not a host name: ${h}`);
  if (r.expiresAt && Number.isNaN(Date.parse(r.expiresAt))) throw new PurchaseError("INVALID_POLICY", "expiresAt is not a date");
  const items = (r.allowedItems ?? []).map((i) => i.trim().toLowerCase().replace(/^https?:\/\//, "")).filter(Boolean);
  if (items.length > 100) throw new PurchaseError("INVALID_POLICY", "At most 100 items on a shopping list");
  for (const i of items) if (!/^[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/.test(i)) throw new PurchaseError("INVALID_POLICY", `Not a host/path item: ${i}`);
  return { ...r, allowedProviders: [...new Set(hosts)], allowedItems: [...new Set(items)] };
}

export async function createTask(
  db: Db,
  input: {
    orgId: string;
    title: string;
    purpose: string;
    expectedDeliverable?: string;
    budget: bigint;
    deadline?: Date | null;
    rules: PolicyRules;
    agentIds: string[];
    createdBy: string;
    parentTaskId?: string | null;
  },
) {
  const rules = validateRules(input.rules);
  if (input.budget <= 0n) throw new PurchaseError("INVALID_TASK", "Budget must be positive");
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const id = newId("tsk");
    const [task] = await t
      .insert(tasks)
      .values({
        id,
        orgId: input.orgId,
        title: input.title,
        purpose: input.purpose,
        expectedDeliverable: input.expectedDeliverable,
        budget: input.budget,
        deadline: input.deadline ?? null,
        parentTaskId: input.parentTaskId ?? null,
      })
      .returning();
    await t.insert(policies).values({ taskId: id, version: 1, rules, createdBy: input.createdBy, changeNote: "Initial mandate" });
    for (const agentId of input.agentIds) await t.insert(taskAgents).values({ taskId: id, agentId });
    await audit(t, {
      orgId: input.orgId,
      actor: `user:${input.createdBy}`,
      kind: "task.created",
      subjectId: id,
      data: { title: input.title, budget: input.budget, rules, agentIds: input.agentIds, parentTaskId: input.parentTaskId ?? null },
    });
    return task;
  });
}

/** Policies are immutable; a change creates the next version. */
export async function updatePolicy(db: Db, taskId: string, rules: PolicyRules, by: string, note: string) {
  const clean = validateRules(rules);
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [task] = await t.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    const version = task.currentPolicyVersion + 1;
    await t.insert(policies).values({ taskId, version, rules: clean, createdBy: by, changeNote: note });
    await t.update(tasks).set({ currentPolicyVersion: version }).where(eq(tasks.id, taskId));
    await audit(t, { orgId: task.orgId, actor: `user:${by}`, kind: "policy.updated", subjectId: taskId, data: { version, rules: clean, note } });
    return version;
  });
}

export async function setTaskStatus(db: Db, taskId: string, status: "active" | "paused" | "closed", by: string, outcomeNote?: string) {
  const [task] = await db
    .update(tasks)
    .set({ status, outcomeNote: outcomeNote ?? undefined, closedAt: status === "closed" ? new Date() : null })
    .where(eq(tasks.id, taskId))
    .returning();
  await audit(db, { orgId: task.orgId, actor: `user:${by}`, kind: `task.${status}`, subjectId: taskId, data: { outcomeNote } });
  return task;
}

export async function setBudget(db: Db, taskId: string, budget: bigint, by: string) {
  if (budget <= 0n) throw new PurchaseError("INVALID_TASK", "Budget must be positive");
  const [task] = await db.update(tasks).set({ budget }).where(eq(tasks.id, taskId)).returning();
  await audit(db, { orgId: task.orgId, actor: `user:${by}`, kind: "task.budget_changed", subjectId: taskId, data: { budget } });
  return task;
}


/**
 * Agents hiring agents. A task hands part of its job to a new agent: a sub-task with its own budget and rules, carved
 * out of the parent and never wider than it. The sub-task's spend counts against the parent (and every task above),
 * pausing the parent stops the sub-task, and the new agent's key only works for the sub-task.
 */
export async function hireAgent(
  db: Db,
  input: {
    parentTaskId: string;
    title: string;
    purpose: string;
    budget: bigint;
    agentName: string;
    providers?: string[];
    maxPerPurchase?: bigint;
    by: string;
  },
) {
  const [parent] = await db.select().from(tasks).where(eq(tasks.id, input.parentTaskId));
  if (!parent) throw new PurchaseError("NO_TASK", "No such task", 404);
  if (parent.status !== "active") throw new PurchaseError("TASK_NOT_ACTIVE", "A paused or closed task can't hire agents", 409);
  let depth = 0;
  for (let p: string | null = parent.parentTaskId; p && depth < 6; depth++) {
    const [x] = await db.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, p));
    p = x?.parentTaskId ?? null;
  }
  if (depth >= 3) throw new PurchaseError("TOO_DEEP", "Hired agents can hire at most three levels deep", 409);
  const left = parent.budget - parent.spent - parent.reserved;
  if (input.budget <= 0n) throw new PurchaseError("INVALID_TASK", "Give the hired agent a budget above $0", 400);
  if (input.budget > left) throw new PurchaseError("OVER_TASK_BUDGET", "The sub-task's budget can't be more than the parent has left", 409);
  const [pol] = await db.select().from(policies).where(and(eq(policies.taskId, parent.id), eq(policies.version, parent.currentPolicyVersion)));
  const pr = pol.rules;
  // Never wider than the parent: providers a subset, limits no higher, same expiry, same shopping list.
  const providers = (input.providers?.length ? input.providers : pr.allowedProviders).map((h) => h.trim().toLowerCase());
  const outside = providers.filter((h) => !pr.allowedProviders.map((x) => x.toLowerCase()).includes(h));
  if (outside.length) throw new PurchaseError("WIDER_THAN_PARENT", `The parent task can't buy from ${outside.join(", ")}, so neither can an agent it hires`, 409);
  const parentMax = BigInt(pr.maxPerPurchase);
  const maxPer = input.maxPerPurchase && input.maxPerPurchase < parentMax ? input.maxPerPurchase : parentMax;
  const rules: PolicyRules = {
    ...pr,
    allowedProviders: providers,
    maxPerPurchase: (maxPer < input.budget ? maxPer : input.budget).toString(),
    approvalAbove: (BigInt(pr.approvalAbove) < maxPer ? BigInt(pr.approvalAbove) : maxPer).toString(),
    payees: pr.payees ? Object.fromEntries(Object.entries(pr.payees).filter(([h]) => providers.includes(h))) : undefined,
    providerCaps: pr.providerCaps ? Object.fromEntries(Object.entries(pr.providerCaps).filter(([h]) => providers.includes(h))) : undefined,
  };
  const { agent, apiKey } = await createAgent(db, parent.orgId, input.agentName.slice(0, 60), `Hired by ${parent.title}`);
  const task = await createTask(db, {
    orgId: parent.orgId,
    title: input.title.slice(0, 120),
    purpose: input.purpose.slice(0, 500),
    budget: input.budget,
    rules,
    agentIds: [agent.id],
    createdBy: input.by,
    parentTaskId: parent.id,
  });
  return { task, agent, apiKey };
}
