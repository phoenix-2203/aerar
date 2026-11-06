import type { NextRequest } from "next/server";
import { z } from "zod";
import { rejectPurchase } from "@/lib/purchase/pipeline";
import { requireOperator } from "@/lib/server/auth";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, purchaseView, withErrors } from "@/lib/server/http";
import { requirePurchaseInOrg } from "@/lib/server/queries";

const Body = z.object({ note: z.string().trim().max(500).optional() }).default({});

export const POST = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/purchases/[id]/reject">) => {
  const who = requireOperator(req);
  const { id } = await ctx.params;
  const text = await req.text();
  const { note } = Body.parse(text ? JSON.parse(text) : {});
  const db = await getDbOnly();
  await requirePurchaseInOrg(db, operatorOrgId(), id);
  // rejectPurchase never touches the payment rail.
  const p = await rejectPurchase({ db }, id, who, note);
  return json({ purchase: purchaseView(p) });
});
