// Live usage numbers for the public pages, straight from the database. Nothing estimated.
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { organisations, purchases, seals } from "@/db/schema";
import { fmt$ } from "@/lib/money/usdc";

export async function liveStats(db: Db) {
  const [p] = await db
    .select({
      decided: sql<number>`count(*)::int`,
      paid: sql<string>`coalesce(sum(${purchases.paidAmount}), 0)`,
      stopped: sql<string>`coalesce(sum(case when ${purchases.status} in ('declined','rejected') then coalesce(${purchases.quoteAmount}, 0) else 0 end), 0)`,
      saved: sql<string>`coalesce(sum(case when ${purchases.status} = 'reused' then coalesce(${purchases.quoteAmount}, 0) else 0 end), 0)`,
      // Only real transfers: sandbox payments are simulated ("0xsim…") and are never counted as proven on Base.
      onchain: sql<number>`count(*) filter (where ${purchases.onchainVerifiedAt} is not null and ${purchases.txHash} ~ '^0x[0-9a-fA-F]{64}$')::int`,
      stoppedCount: sql<number>`count(*) filter (where ${purchases.status} in ('declined','rejected'))::int`,
    })
    .from(purchases);
  const [o] = await db
    .select({
      sandboxes: sql<number>`count(*) filter (where ${organisations.id} like 'org_try_%')::int`,
      wallets: sql<number>`count(*) filter (where ${organisations.id} like 'org_w_%')::int`,
    })
    .from(organisations);
  const [s] = await db.select({ n: sql<number>`count(*)::int` }).from(seals);
  return {
    decided: p?.decided ?? 0,
    paid: fmt$(BigInt(p?.paid ?? 0)),
    stopped: fmt$(BigInt(p?.stopped ?? 0)),
    saved: fmt$(BigInt(p?.saved ?? 0)),
    onchain: p?.onchain ?? 0,
    stoppedCount: p?.stoppedCount ?? 0,
    sandboxes: o?.sandboxes ?? 0,
    wallets: o?.wallets ?? 0,
    seals: s?.n ?? 0,
  };
}
