"use server";
// Decide a held purchase from a signed link posted to the team's Slack / Discord / Telegram.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { purchases } from "@/db/schema";
import { readApprovalToken } from "@/lib/notify/notify";
import { approvePurchase, PurchaseError, rejectPurchase } from "@/lib/purchase/pipeline";
import { getDbOnly } from "@/lib/server/context";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { agentContext } from "@/lib/try/sandbox";

export async function decideByLink(token: string, kind: "approve" | "reject"): Promise<{ error?: string; done?: string }> {
  const r = publicLimits().tryActions.check(clientIp(await headers()));
  if (!r.ok) return { error: `Too many clicks. Try again in ${r.retryAfter} seconds.` };
  const t = readApprovalToken(token);
  if ("error" in t) return { error: t.error };
  try {
    const db = await getDbOnly();
    const [p] = await db.select().from(purchases).where(eq(purchases.id, t.purchaseId));
    if (!p) return { error: "That purchase doesn't exist any more." };
    const ctx = await agentContext(p.orgId);
    if (kind === "approve") await approvePurchase(ctx, p.id, "a teammate (chat link)");
    else await rejectPurchase(ctx, p.id, "a teammate (chat link)", "Declined from a chat link");
    refresh();
    return { done: kind === "approve" ? "Approved" : "Declined" };
  } catch (e) {
    return { error: e instanceof PurchaseError ? e.message : "Something went wrong. Try again." };
  }
}
