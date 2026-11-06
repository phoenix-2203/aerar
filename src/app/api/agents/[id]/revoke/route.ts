import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { agents } from "@/db/schema";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { requireOperator } from "@/lib/server/auth";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";
import { revokeAgent } from "@/lib/workspace";

export const POST = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/agents/[id]/revoke">) => {
  const who = requireOperator(req);
  const { id } = await ctx.params;
  const db = await getDbOnly();
  const [a] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, operatorOrgId())));
  if (!a) throw new PurchaseError("NOT_FOUND", "No such agent", 404);
  if (a.revokedAt) return json({ agent: { id: a.id, name: a.name, revokedAt: a.revokedAt } });
  const r = await revokeAgent(db, id, who);
  return json({ agent: { id: r.id, name: r.name, revokedAt: r.revokedAt } });
});
