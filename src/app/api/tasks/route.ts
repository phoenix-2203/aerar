import type { NextRequest } from "next/server";
import { requireOperator } from "@/lib/server/auth";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";
import { listTasks } from "@/lib/server/queries";

export const GET = withErrors(async (req: NextRequest) => {
  requireOperator(req);
  return json({ tasks: await listTasks(await getDbOnly(), operatorOrgId()) });
});
