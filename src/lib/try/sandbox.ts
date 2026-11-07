// The try-it sandbox: every visitor gets a private workspace (its own org, task, rules and agent) that buys from
// simulated shops. It lives in the same database as everything else but under an "org_try_" id, so it never mixes
// with the operator's ledger, and the agent API/MCP route it to the simulated rail (see agentContext).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { agents, policies, purchases, tasks, type PolicyRules } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { fmt$ } from "@/lib/money/usdc";
import { PurchaseError, type Ctx } from "@/lib/purchase/pipeline";
import { getContext, getDbOnly } from "@/lib/server/context";
import { createAgent, createOrg, createTask } from "@/lib/workspace";
import { TRY_PROVIDERS } from "./catalog";
import { tryRail } from "./rail";
import { isWalletOrg, walletContext } from "@/lib/wallet/session";

export const TRY_COOKIE = "aerar_try";
export const TRY_TTL_SECONDS = 24 * 3600;
export const isTryOrg = (orgId: string) => orgId.startsWith("org_try_");

export const DEFAULT_TRY_RULES: PolicyRules = {
  allowedProviders: TRY_PROVIDERS.filter((p) => !p.attacker).map((p) => p.host),
  maxPerPurchase: "1000000", // $1.00
  approvalAbove: "250000", // $0.25
  maxPurchasesPerHour: 30,
  reuseWindowSeconds: 3600,
  expiresAt: null,
  allowedItems: [],
};
export const DEFAULT_TRY_BUDGET = 2_000_000n; // $2.00

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new PurchaseError("AUTH_NOT_CONFIGURED", "SESSION_SECRET must be set (32+ characters)", 503);
  return s;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`try:${payload}`).digest("base64url");

export interface TrySession {
  orgId: string;
  taskId: string;
  agentId: string;
  apiKey: string;
}

/** Cookie value: base64url(JSON).signature. The key never leaves the visitor's own browser cookie and this page. */
export function encodeSession(s: TrySession): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): TrySession | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as TrySession;
    return isTryOrg(s.orgId) ? s : null;
  } catch {
    return null;
  }
}

/** A fresh private workspace: org, one agent (key returned once), one task with default rules. */
export async function createTrySandbox(db: Db): Promise<TrySession> {
  const org = await createOrg(db, "Try-it sandbox", `org_try_${randomBytes(9).toString("base64url")}`);
  const { agent, apiKey } = await createAgent(db, org.id, "my-agent", "Your sandbox agent");
  const task = await createTask(db, {
    orgId: org.id,
    title: "Your research task",
    purpose: "Overnight market research: buy reports and data, reuse what's already bought, ask before anything big.",
    expectedDeliverable: "A short market memo",
    budget: DEFAULT_TRY_BUDGET,
    rules: DEFAULT_TRY_RULES,
    agentIds: [agent.id],
    createdBy: "visitor",
  });
  return { orgId: org.id, taskId: task.id, agentId: agent.id, apiKey };
}

/** The pipeline context for a sandbox: the shared database, the simulated rail. */
export async function tryContext(): Promise<Ctx> {
  return { db: await getDbOnly(), rail: tryRail() };
}

/** Agents in a sandbox org pay simulated shops; everyone else gets the real rail. */
export async function agentContext(orgId: string): Promise<Ctx> {
  if (isTryOrg(orgId)) return tryContext();
  if (isWalletOrg(orgId)) return walletContext(orgId);
  return getContext();
}

/** Everything the /try page shows for one sandbox. */
export async function loadTryState(db: Db, s: TrySession) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, s.taskId), eq(tasks.orgId, s.orgId)));
  if (!task) return null;
  const [policy] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.taskId, task.id), eq(policies.version, task.currentPolicyVersion)));
  const [agent] = await db.select().from(agents).where(eq(agents.id, s.agentId));
  const rows = await db.select().from(purchases).where(eq(purchases.orgId, s.orgId)).orderBy(desc(purchases.createdAt)).limit(50);
  const chain = await verifyChain(db, s.orgId);
  const sum = (st: string[]) => rows.filter((p) => st.includes(p.status));
  const saved = sum(["reused"]).reduce((n, p) => n + (p.quoteAmount ?? 0n), 0n);
  return {
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      budget: task.budget.toString(),
      spent: task.spent.toString(),
      reserved: task.reserved.toString(),
      budgetFormatted: fmt$(task.budget),
      spentFormatted: fmt$(task.spent),
      leftFormatted: fmt$(task.budget - task.spent - task.reserved),
      policyVersion: task.currentPolicyVersion,
    },
    rules: policy.rules,
    agent: { id: agent.id, name: agent.name, revoked: !!agent.revokedAt, keyPrefix: agent.apiKeyPrefix },
    totals: {
      paid: fmt$(task.spent),
      paidCount: sum(["delivered"]).length,
      saved: fmt$(saved),
      reusedCount: sum(["reused"]).length,
      declined: sum(["declined", "rejected", "payment_failed"]).length,
      waiting: sum(["awaiting_approval"]).length,
    },
    chain,
    purchases: rows.map((p) => ({
      id: p.id,
      status: p.status,
      url: p.url,
      host: p.host,
      purpose: p.purpose,
      reasonCodes: p.reasonCodes,
      amountFormatted: p.quoteAmount != null ? fmt$(p.quoteAmount) : null,
      paidFormatted: p.paidAmount != null ? fmt$(p.paidAmount) : null,
      txHash: p.txHash,
      reusedFromId: p.reusedFromId,
      approvedBy: p.approvedBy,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}
export type TryState = NonNullable<Awaited<ReturnType<typeof loadTryState>>>;
