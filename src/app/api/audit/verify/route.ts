import type { NextRequest } from "next/server";
import { verifyChain } from "@/lib/audit/log";
import { requireOperator } from "@/lib/server/auth";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

export const GET = withErrors(async (req: NextRequest) => {
  requireOperator(req);
  return json(await verifyChain(await getDbOnly(), operatorOrgId()));
});
