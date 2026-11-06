"use server";
// Operator actions from the dashboard. Each one checks the session itself; the proxy is only a convenience.
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { approvePurchase, PurchaseError, rejectPurchase } from "@/lib/purchase/pipeline";
import { checkPassword, issueSession, loginThrottle, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/server/auth";
import { getContext, getDbOnly, operatorOrgId } from "@/lib/server/context";
import { requirePurchaseInOrg } from "@/lib/server/queries";
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
      return p.status === "delivered" ? { done: "Approved and paid." } : { done: `Approved, but it ended as "${p.status.replace(/_/g, " ")}".` };
    }
    const db = await getDbOnly();
    await requirePurchaseInOrg(db, operatorOrgId(), id);
    await rejectPurchase({ db }, id, "operator");
    refresh();
    return { done: "Rejected. Nothing was paid." };
  } catch (e) {
    if (e instanceof PurchaseError) return { error: e.message };
    console.error("[aerar] decision failed:", e instanceof Error ? e.message : e);
    return { error: "Something went wrong. Nothing was paid." };
  }
}

export async function approve(id: string, _prev: ActionState): Promise<ActionState> {
  return decide("approve", id);
}

export async function reject(id: string, _prev: ActionState): Promise<ActionState> {
  return decide("reject", id);
}
