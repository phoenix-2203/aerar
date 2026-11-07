// Agent API: is an identical, still-fresh, untampered copy of this request already in procurement memory? Read-only.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { memoryCheck, pickTask } from "@/lib/procurement/agent-queries";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

const Body = z.object({
  url: z.string().url().max(2048),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z
    .union([z.string().max(64 * 1024), z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .nullish()
    .transform((b) => (b == null ? null : typeof b === "string" ? b : JSON.stringify(b))),
  taskId: z.string().min(1).max(64).optional(),
});

export const POST = withErrors(async (req: NextRequest) => {
  const db = await getDbOnly();
  const agent = await requireAgent(db, req);
  const b = Body.parse(await req.json());
  return json({ memory: await memoryCheck(db, agent.orgId, await pickTask(db, agent, b.taskId), b) });
});
