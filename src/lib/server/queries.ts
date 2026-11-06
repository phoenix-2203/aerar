// Read models for the operator API and dashboard.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { agents, policies, purchases, taskAgents, tasks } from "@/db/schema";
import { fmt$ } from "@/lib/money/usdc";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { purchaseView } from "./http";

export function taskMoney(t: typeof tasks.$inferSelect) {
  const remaining = t.budget - t.reserved - t.spent;
  return {
    budget: t.budget,
    reserved: t.reserved,
    spent: t.spent,
    remaining,
    formatted: { budget: fmt$(t.budget), reserved: fmt$(t.reserved), spent: fmt$(t.spent), remaining: fmt$(remaining) },
  };
}

export async function listTasks(db: Db, orgId: string) {
  const rows = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(desc(tasks.createdAt));
  const ps = rows.length ? await db.select().from(purchases).where(inArray(purchases.taskId, rows.map((t) => t.id))) : [];
  return rows.map((t) => {
    const mine = ps.filter((p) => p.taskId === t.id);
    const avoided = mine.filter((p) => p.status === "reused").reduce((s, p) => s + (p.quoteAmount ?? 0n), 0n);
    return {
      ...t,
      money: taskMoney(t),
      counts: {
        total: mine.length,
        delivered: mine.filter((p) => p.status === "delivered").length,
        reused: mine.filter((p) => p.status === "reused").length,
        declined: mine.filter((p) => p.status === "declined").length,
        awaitingApproval: mine.filter((p) => p.status === "awaiting_approval").length,
      },
      avoidedByReuse: avoided,
      avoidedByReuseFormatted: fmt$(avoided),
    };
  });
}

export async function getTaskDetail(db: Db, orgId: string, taskId: string) {
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));
  if (!t) throw new PurchaseError("NOT_FOUND", "No such task", 404);
  const versions = await db.select().from(policies).where(eq(policies.taskId, t.id)).orderBy(desc(policies.version));
  const ps = await db.select().from(purchases).where(eq(purchases.taskId, t.id)).orderBy(desc(purchases.createdAt));
  const assigned = await db
    .select({ id: agents.id, name: agents.name, revokedAt: agents.revokedAt })
    .from(taskAgents)
    .innerJoin(agents, eq(agents.id, taskAgents.agentId))
    .where(eq(taskAgents.taskId, t.id));
  return {
    task: t,
    money: taskMoney(t),
    policy: versions.find((v) => v.version === t.currentPolicyVersion) ?? null,
    policyHistory: versions,
    agents: assigned,
    purchases: ps.map((p) => purchaseView(p)),
  };
}

export async function requirePurchaseInOrg(db: Db, orgId: string, id: string) {
  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.orgId, orgId)));
  if (!p) throw new PurchaseError("NOT_FOUND", "No such purchase", 404);
  return p;
}
