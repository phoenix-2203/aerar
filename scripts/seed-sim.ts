// LOCAL DEVELOPMENT ONLY: fill the embedded database with one simulated night (the same plan as `npm run night-shift`)
// so the operator dashboard has something to show without spending testnet USDC. Simulated providers; the
// transaction hashes are placeholders and are labelled as simulated in the purchase purpose.
// Refuses to run against Postgres (DATABASE_URL), so it can never touch a real ledger.
//
//   npm run seed && npm run seed:sim
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, migrateDatabase } from "@/db";
import { agents, taskAgents, tasks } from "@/db/schema";
import { submitPurchase, type Purchase } from "@/lib/purchase/pipeline";
import { NIGHT } from "@/lib/scenarios/night";
import { fakeRail } from "@/lib/sim";
import { createAgent } from "@/lib/workspace";

async function main() {
  if (process.env.DATABASE_URL) {
    console.error("seed:sim only runs against the local embedded database. Unset DATABASE_URL.");
    process.exit(1);
  }
  await migrateDatabase();
  const db = await getDb();
  const orgId = process.env.AERAR_ORG_ID || "org_demo";
  const [task] = await db.select().from(tasks).where(and(eq(tasks.orgId, orgId), eq(tasks.title, "Market research sprint")));
  if (!task) throw new Error("Run `npm run seed` first.");
  const host = (process.env.DEMO_PROVIDER_HOST ?? "localhost:3000").trim().toLowerCase();

  // Two agents on the task, like the scripted night.
  const names = { researcher: "night-researcher", analyst: "night-analyst" } as const;
  const ids: Record<string, string> = {};
  for (const [role, name] of Object.entries(names)) {
    let [a] = await db.select().from(agents).where(and(eq(agents.orgId, orgId), eq(agents.name, name)));
    if (!a) a = (await createAgent(db, orgId, name, "Simulated overnight agent")).agent;
    ids[role] = a.id;
    await db.insert(taskAgents).values({ taskId: task.id, agentId: a.id }).onConflictDoNothing();
  }

  const base = `https://${host}`;
  const offers: Parameters<typeof fakeRail>[0] = {};
  for (const a of NIGHT) offers[(a.host ?? base) + a.path] = { amount: a.price, ...(a.path === "/rates" ? { payTo: "0x2222222222222222222222222222222222222222" } : {}) };
  const rail = fakeRail(offers);
  const ctx = { db, rail, allowInsecureHttp: true };

  let held: Purchase | null = null;
  const run = Date.now().toString(36);
  for (const [i, a] of NIGHT.entries()) {
    const url = (a.host ?? base) + a.path;
    const p = await submitPurchase(ctx, ids[a.agent], { taskId: task.id, url, method: "GET", purpose: `${a.says} [simulated]`, idempotencyKey: `sim-${run}-${i}` });
    if (p.status === "awaiting_approval" && !held) held = p;
    console.log(`${a.time} ${a.agent.padEnd(10)} ${p.status}`);
  }
  // Leave one approval waiting so the inbox has something; approve none.
  console.log(held ? `Waiting for approval: ${held.id}` : "Nothing waiting.");
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
