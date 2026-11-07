// Read-only view of a wallet workspace for the /vault page. Not a server action: the page passes its own session.
import { and, desc, eq } from "drizzle-orm";
import { policies, purchases, tasks } from "@/db/schema";
import { explain, reasonKind } from "@/lib/copy/reasons";
import { fmt$ } from "@/lib/money/usdc";
import { getDbOnly } from "@/lib/server/context";
import { purchaseView } from "@/lib/server/http";
import type { WalletSession } from "./session";

/** Purchases and task for the signed-in wallet workspace. */
export async function walletActivity(s: WalletSession) {
  const db = await getDbOnly();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, s.taskId), eq(tasks.orgId, s.orgId)));
  if (!task) return null;
  const [policy] = await db.select().from(policies).where(and(eq(policies.taskId, task.id), eq(policies.version, task.currentPolicyVersion)));
  const rows = await db.select().from(purchases).where(eq(purchases.orgId, s.orgId)).orderBy(desc(purchases.createdAt)).limit(30);
  return {
    task: { id: task.id, budget: fmt$(task.budget), spent: fmt$(task.spent), approvalAbove: fmt$(BigInt(policy?.rules.approvalAbove ?? "0")), reuseWindowSeconds: policy?.rules.reuseWindowSeconds ?? 0 },
    purchases: rows.map((p) => {
      const v = purchaseView(p);
      return {
        id: v.id,
        status: v.status,
        url: v.url,
        purpose: v.purpose,
        amount: v.amountFormatted,
        paid: v.paidFormatted,
        txHash: v.txHash,
        error: p.status === "payment_failed" ? (p.error ?? null) : null,
        reasons: v.reasons.filter((r) => reasonKind(r.code) !== "pass").map((r) => ({ code: r.code, text: explain(r.code) })),
        at: v.createdAt.toISOString(),
      };
    }),
  };
}
