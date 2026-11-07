// Agent API: would IntentLock let this item through for my task? A dry run on the URL; nothing is bought or reserved.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { intentCheck, pickTask } from "@/lib/procurement/agent-queries";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

const Body = z.object({ url: z.string().url().max(2048), taskId: z.string().min(1).max(64).optional() });

export const POST = withErrors(async (req: NextRequest) => {
  const db = await getDbOnly();
  const agent = await requireAgent(db, req);
  const { url, taskId } = Body.parse(await req.json());
  return json({ intent: await intentCheck(db, await pickTask(db, agent, taskId), url) });
});
