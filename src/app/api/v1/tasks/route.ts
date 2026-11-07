// Agent API: the tasks this agent may buy for, each with its signed mandate (purpose, IntentLock categories, limits,
// budget left, and whether the stored rules still match the signature). Read-only.
import type { NextRequest } from "next/server";
import { agentTasks, mandateView } from "@/lib/procurement/agent-queries";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

export const GET = withErrors(async (req: NextRequest) => {
  const db = await getDbOnly();
  const agent = await requireAgent(db, req);
  const tasks = await Promise.all((await agentTasks(db, agent)).map((t) => mandateView(db, t)));
  return json({ tasks });
});
