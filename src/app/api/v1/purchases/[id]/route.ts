// Agent API: read back a purchase (e.g. after a person approved it overnight). Own organisation only.
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { purchases } from "@/db/schema";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { json, purchaseView, withErrors } from "@/lib/server/http";

export const GET = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/v1/purchases/[id]">) => {
  const db = await getDbOnly();
  const agent = await requireAgent(db, req);
  const { id } = await ctx.params;
  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.orgId, agent.orgId)));
  if (!p) throw new PurchaseError("NOT_FOUND", "No such purchase", 404);
  return json({ purchase: purchaseView(p, { includeBody: true }) });
});
