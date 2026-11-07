// A real receipt to try the verifier on: the latest paid purchase in the public demo workspace.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { purchases } from "@/db/schema";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";

export const GET = withErrors(async () => {
  const db = await getDbOnly();
  const [p] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.orgId, operatorOrgId()), eq(purchases.status, "delivered"), isNotNull(purchases.txHash)))
    .orderBy(desc(purchases.createdAt))
    .limit(1);
  return json(p ? { id: p.id } : { id: null });
});
