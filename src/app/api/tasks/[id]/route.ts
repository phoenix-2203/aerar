import type { NextRequest } from "next/server";
import { requireOperator } from "@/lib/server/auth";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";
import { getTaskDetail } from "@/lib/server/queries";

export const GET = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) => {
  requireOperator(req);
  const { id } = await ctx.params;
  return json(await getTaskDetail(await getDbOnly(), operatorOrgId(), id));
});
