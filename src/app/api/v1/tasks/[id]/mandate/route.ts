// Agent API: one task's signed mandate, including the signed document, its sha256 and Aerar's signature, so a client
// can check it offline (the SDK's verifyMandate). Read-only.
import type { NextRequest } from "next/server";
import { mandateView, pickTask } from "@/lib/procurement/agent-queries";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

export const GET = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/v1/tasks/[id]/mandate">) => {
  const db = await getDbOnly();
  const agent = await requireAgent(db, req);
  const { id } = await ctx.params;
  return json({ mandate: await mandateView(db, await pickTask(db, agent, id)) });
});
