// Agent API: compare providers for a kind of item, from the organisation's own ledger only (?kind=market data).
import type { NextRequest } from "next/server";
import { compareProviders } from "@/lib/procurement/agent-queries";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { requireAgent } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

export const GET = withErrors(async (req: NextRequest) => {
  const db = await getDbOnly();
  const agent = await requireAgent(db, req);
  const kind = (req.nextUrl.searchParams.get("kind") ?? "").trim().slice(0, 200);
  if (kind.length < 2) throw new PurchaseError("INVALID_REQUEST", "Pass ?kind=, e.g. ?kind=market%20data");
  return json(await compareProviders(db, agent.orgId, kind));
});
