import { desc, eq, lt, and } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { auditEvents } from "@/db/schema";
import { requireOperator } from "@/lib/server/auth";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

export const GET = withErrors(async (req: NextRequest) => {
  requireOperator(req);
  const db = await getDbOnly();
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 100, 1), 500);
  const before = Number(req.nextUrl.searchParams.get("before")) || null;
  const where = before ? and(eq(auditEvents.orgId, operatorOrgId()), lt(auditEvents.seq, before)) : eq(auditEvents.orgId, operatorOrgId());
  const events = await db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.seq)).limit(limit);
  return json({ events, nextBefore: events.length === limit ? events[events.length - 1].seq : null });
});
