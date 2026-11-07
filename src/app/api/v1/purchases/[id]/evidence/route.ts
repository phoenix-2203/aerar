// The evidence package for one purchase: mandate, IntentLock decision, quote, approval, payment, delivery, audit
// entries, the signed receipt, and a list of checks each labelled by how it can be verified.
// Who can fetch it: the agent's own workspace (Bearer key), a try-it visitor's sandbox, a wallet workspace's members,
// or anyone for the public demo workspace.
import type { NextRequest } from "next/server";
import { authenticateAgent } from "@/lib/workspace";
import { buildEvidence } from "@/lib/evidence/evidence";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, publicUrl, withErrors } from "@/lib/server/http";
import { decodeSession, TRY_COOKIE } from "@/lib/try/sandbox";
import { decodeWalletSession, WALLET_COOKIE } from "@/lib/wallet/session";

export const GET = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/v1/purchases/[id]/evidence">) => {
  const { id } = await ctx.params;
  const db = await getDbOnly();
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
  const agent = bearer ? await authenticateAgent(db, bearer) : null;
  const orgs = [
    agent?.orgId,
    decodeSession(req.cookies.get(TRY_COOKIE)?.value)?.orgId,
    decodeWalletSession(req.cookies.get(WALLET_COOKIE)?.value)?.orgId,
    operatorOrgId(),
  ].filter(Boolean) as string[];
  for (const org of orgs) {
    const e = await buildEvidence(db, org, id, publicUrl());
    if (e) return json({ evidence: e });
  }
  return json({ error: "NOT_FOUND", message: "No purchase you can see with that id" }, 404);
});
