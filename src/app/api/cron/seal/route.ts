// Morning Seal trigger. Call it once a morning (cron on the VPS):
//   curl -s -H "authorization: Bearer $CRON_SECRET" https://aerar.duckdns.org/api/cron/seal
import { timingSafeEqual } from "node:crypto";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";
import { sealDue } from "@/lib/seal/seal";

export const GET = withErrors(async (req: Request) => {
  const want = process.env.CRON_SECRET ?? "";
  const got = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return json({ error: "UNAUTHORIZED", message: "Set CRON_SECRET (16+ characters) and send it as a Bearer token" }, 401);
  return json({ results: await sealDue(await getDbOnly(), operatorOrgId()) });
});
