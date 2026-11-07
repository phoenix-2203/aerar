// Live escrow demo on Base Sepolia, from the server (uses the operator key in .env; nothing is printed but results).
// Buys two items from the demo shop's escrow route with the demo agent:
//   1. a report that is delivered  -> Aerar confirms, the escrow pays the shop at once
//   2. a brief that sends nothing  -> Aerar's delivery check fails, the escrow refunds the payment
// then clears the shop hold the refund caused, so the rest of the live demo keeps working.
// Usage (on the VPS, in /opt/aerar):  sudo -u aerar npm run escrow:demo
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, migrateDatabase } from "@/db";
import { agents, tasks } from "@/db/schema";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { clearProviderHold } from "@/lib/workspace";
import { createX402Rail } from "@/lib/x402/x402-rail";
import { publicUrl } from "@/lib/server/http";

async function main() {
  const key = process.env.PAYER_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("PAYER_PRIVATE_KEY is missing");
  if (!process.env.DEMO_ESCROW_ADDRESS) throw new Error("DEMO_ESCROW_ADDRESS is missing: run deploy/vps/setup-escrow.sh first");
  await migrateDatabase();
  const db = await getDb();
  const org = process.env.AERAR_ORG_ID || "org_demo";
  const [task] = await db.select().from(tasks).where(and(eq(tasks.orgId, org), eq(tasks.title, "Market research sprint")));
  const [agent] = await db.select().from(agents).where(and(eq(agents.orgId, org), eq(agents.name, "night-researcher")));
  if (!task || !agent) throw new Error("The seeded demo task or agent is missing (npm run seed)");
  const rail = createX402Rail({ privateKey: key as `0x${string}`, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || undefined });
  const base = publicUrl();
  const host = new URL(base).host;
  const scan = (tx?: string | null) => (tx ? `https://sepolia.basescan.org/tx/${tx}` : "-");
  const stamp = Date.now();
  for (const [label, path] of [
    ["Delivered (released to the shop)", "/api/demo/escrow-report?topic=AI%20agents"],
    ["Sends nothing (refunded)", "/api/demo/escrow-brief"],
  ] as const) {
    await clearProviderHold(db, org, host, "escrow-demo").catch(() => {});
    const p = await submitPurchase({ db, rail, allowInsecureHttp: process.env.AERAR_ALLOW_INSECURE_HTTP === "1" }, agent.id, { taskId: task.id, url: `${base}${path}`, method: "GET", body: null, purpose: "Weekly market research", idempotencyKey: `escrow-demo-${stamp}-${path}` });
    console.log(`\n${label}: ${p.status} (${p.id})`);
    console.log(`  paid      ${scan(p.txHash)}`);
    if (p.refundTx) console.log(`  refunded  ${scan(p.refundTx)}  (${Number(p.refundedAmount) / 1e6} USDC back)`);
    if (p.escrow) console.log(`  escrow    https://sepolia.basescan.org/address/${p.escrow}`);
    if (p.error) console.log(`  note      ${p.error}`);
    console.log(`  evidence  ${base}/verify?id=${p.id}`);
  }
  await clearProviderHold(db, org, host, "escrow-demo").catch(() => {});
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
