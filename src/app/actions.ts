"use server";
// Operator actions from the dashboard. Each one checks the session itself; the proxy is only a convenience.
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { agents, tasks } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { approvePurchase, PurchaseError, rejectPurchase } from "@/lib/purchase/pipeline";
import { revokeAgent, setTaskStatus } from "@/lib/workspace";
import { checkPassword, issueSession, loginThrottle, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/server/auth";
import { getContext, getDbOnly, operatorOrgId } from "@/lib/server/context";
import { summarise } from "@/lib/server/http";
import { requirePurchaseInOrg } from "@/lib/server/queries";
import { fmt$ } from "@/lib/money/usdc";
import { isOperator } from "@/lib/server/session";

export type ActionState = { error?: string; done?: string } | undefined;

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/report";
};

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    const throttle = loginThrottle(ip);
    if (!checkPassword(form.get("password"))) {
      throttle.fail();
      return { error: "That password isn't right." };
    }
    throttle.ok();
  } catch (e) {
    if (e instanceof PurchaseError) return { error: e.code === "AUTH_NOT_CONFIGURED" ? "Login isn't configured on this server yet (OPERATOR_PASSWORD and SESSION_SECRET)." : e.message };
    throw e;
  }
  (await cookies()).set(SESSION_COOKIE, issueSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

async function decide(kind: "approve" | "reject", id: string): Promise<ActionState> {
  if (!(await isOperator())) return { error: "Your session ended. Log in again." };
  try {
    if (kind === "approve") {
      const ctx = await getContext();
      await requirePurchaseInOrg(ctx.db, operatorOrgId(), id);
      const p = await approvePurchase(ctx, id, "operator");
      refresh();
      return p.status === "delivered"
        ? { done: `Approved. Paid ${fmt$(p.paidAmount)}${p.onchainVerifiedAt ? ", transfer checked onchain" : ""}.` }
        : { error: `Approved, but not paid: ${summarise(p)}` };
    }
    const db = await getDbOnly();
    await requirePurchaseInOrg(db, operatorOrgId(), id);
    await rejectPurchase({ db }, id, "operator");
    refresh();
    return { done: "Declined. Nothing was paid." };
  } catch (e) {
    if (e instanceof PurchaseError) return { error: e.message };
    console.error("[aerar] decision failed:", e instanceof Error ? e.message : e);
    return { error: "Something went wrong. Nothing was paid." };
  }
}

export async function approve(id: string): Promise<ActionState> {
  return decide("approve", id);
}

export async function reject(id: string): Promise<ActionState> {
  return decide("reject", id);
}

/** Pause or resume a task: while paused, every purchase for it is declined. */
export async function setTaskActive(taskId: string, active: boolean): Promise<ActionState> {
  if (!(await isOperator())) return { error: "Your session ended. Sign in again." };
  const db = await getDbOnly();
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, operatorOrgId())));
  if (!t) return { error: "No such task." };
  if (t.status === "closed") return { error: "This task is closed." };
  await setTaskStatus(db, taskId, active ? "active" : "paused", "operator");
  refresh();
  return { done: active ? "Task resumed. Agents can buy again within its rules." : "Task paused. Every purchase for it is declined until you resume it." };
}

/** Revoke an agent's key. It stays off: there is no un-revoke; create a new agent instead. */
export async function revokeAgentKey(agentId: string): Promise<ActionState> {
  if (!(await isOperator())) return { error: "Your session ended. Sign in again." };
  const db = await getDbOnly();
  const [a] = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.orgId, operatorOrgId())));
  if (!a) return { error: "No such agent." };
  if (a.revokedAt) return { done: "This key was already revoked." };
  await revokeAgent(db, agentId, "operator");
  refresh();
  return { done: `${a.name}'s key is revoked. It stays off; any further request is declined.` };
}

/** Recompute the audit chain now. */
export async function verifyAuditChain(): Promise<{ ok: boolean; count: number; brokenAt: number | null; at: string } | { error: string }> {
  if (!(await isOperator())) return { error: "Your session ended. Sign in again." };
  const r = await verifyChain(await getDbOnly(), operatorOrgId());
  return { ...r, at: new Date().toISOString() };
}
