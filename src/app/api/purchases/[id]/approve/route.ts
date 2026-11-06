// A person approves a purchase that was above the auto-approve threshold. Hard rules are re-checked
// under the task's current policy, the price is re-quoted, and only then is anything paid.
import type { NextRequest } from "next/server";
import { approvePurchase } from "@/lib/purchase/pipeline";
import { requireOperator } from "@/lib/server/auth";
import { getContext, operatorOrgId } from "@/lib/server/context";
import { json, purchaseView, withErrors } from "@/lib/server/http";
import { requirePurchaseInOrg } from "@/lib/server/queries";

export const POST = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/approve">) => {
  const who = requireOperator(req);
  const { id } = await ctx.params;
  const c = await getContext();
  await requirePurchaseInOrg(c.db, operatorOrgId(), id);
  const p = await approvePurchase(c, id, who);
  return json({ purchase: purchaseView(p) });
});
