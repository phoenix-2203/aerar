// A signed receipt for one purchase. Who can fetch it:
//  - an agent (Bearer key) for purchases in its own workspace,
//  - a try-it visitor for purchases in their own sandbox,
//  - anyone for the demo workspace, whose purchases are already public on /demo.
import type { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/workspace";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";
import { encodeReceipt, receiptFor } from "@/lib/receipts/receipt";
import { decodeSession, TRY_COOKIE } from "@/lib/try/sandbox";

const ISSUER = process.env.AERAR_PUBLIC_URL || "https://aerar.duckdns.org";

export const GET = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/receipts/[id]">) => {
  const { id } = await ctx.params;
  const db = await getDbOnly();
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
  const agent = bearer ? await authenticateAgent(db, bearer) : null;
  const sandbox = decodeSession(req.cookies.get(TRY_COOKIE)?.value);
  const orgs = [agent?.orgId, sandbox?.orgId, operatorOrgId()].filter(Boolean) as string[];
  for (const org of orgs) {
    const r = await receiptFor(db, org, id, ISSUER);
    if (r) return json({ receipt: r, encoded: encodeReceipt(r) });
  }
  return json({ error: "NOT_FOUND", message: "No receipt you can see with that id" }, 404);
});
