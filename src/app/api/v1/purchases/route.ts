// Agent API: ask Aerar to buy something for a task. Aerar quotes, decides, pays (or doesn't), and returns the record.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { agentContext } from "@/lib/try/sandbox";
import { json, purchaseView, withErrors } from "@/lib/server/http";

const PurchaseBody = z.object({
  taskId: z.string().min(1).max(64),
  url: z.string().min(1).max(2048),
  method: z.enum(["GET", "POST"]).default("GET"),
  // Agents may send the provider request body as a JSON object or a string.
  body: z
    .union([z.string().max(64 * 1024), z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .nullish()
    .transform((b) => (b == null ? null : typeof b === "string" ? b : JSON.stringify(b))),
  purpose: z.string().trim().min(1).max(1000),
  idempotencyKey: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/, "letters, numbers and . _ : - only"),
});

export const POST = withErrors(async (req: NextRequest) => {
  const agent = await requireAgent(await getDbOnly(), req);
  // Sandbox agents (try-it page) pay simulated shops; everyone else the real x402 rail.
  const ctx = await agentContext(agent.orgId);
  const input = PurchaseBody.parse(await req.json());
  const p = await submitPurchase(ctx, agent.id, input);
  const status = p.status === "awaiting_approval" ? 202 : 200;
  return json({ purchase: purchaseView(p, { includeBody: true }) }, status);
});
