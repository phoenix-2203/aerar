// Idempotent demo seed: one org, one agent, one active task. Safe to run repeatedly.
// The agent's API key is printed only when the agent is first created; it is never stored in plaintext.
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, migrateDatabase } from "@/db";
import { agents, organisations, taskAgents, tasks } from "@/db/schema";
import { parseUsdc } from "@/lib/money/usdc";
import { createAgent, createOrg, createTask } from "@/lib/workspace";

async function main() {
  const ORG_ID = "org_demo";
  const AGENT_NAME = "night-researcher";
  const TASK_TITLE = "Market research sprint";
  const host = (process.env.DEMO_PROVIDER_HOST ?? "localhost:3000").trim().toLowerCase();

  await migrateDatabase();
  const db = await getDb();

  const [org] = await db.select().from(organisations).where(eq(organisations.id, ORG_ID));
  if (!org) await createOrg(db, "Demo workspace", ORG_ID);
  console.log(`Org: ${ORG_ID} ${org ? "(exists)" : "(created)"}`);

  let [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, ORG_ID), eq(agents.name, AGENT_NAME)));
  if (!agent) {
    const created = await createAgent(db, ORG_ID, AGENT_NAME, "Overnight research agent (demo)");
    agent = created.agent;
    console.log(`Agent: ${agent.id} (created)`);
    console.log(`\n  API key (shown once, store it now): ${created.apiKey}\n`);
  } else {
    console.log(`Agent: ${agent.id} (exists; key prefix ${agent.apiKeyPrefix}…, full key was shown when it was created)`);
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.orgId, ORG_ID), eq(tasks.title, TASK_TITLE)));
  if (!task) {
    const t = await createTask(db, {
      orgId: ORG_ID,
      title: TASK_TITLE,
      purpose: "Overnight market research: buy topic reports, reuse what we already have, flag anything expensive.",
      expectedDeliverable: "A short market brief per topic",
      budget: parseUsdc("5"),
      rules: {
        allowedProviders: [host],
        maxPerPurchase: parseUsdc("1").toString(),
        approvalAbove: parseUsdc("0.25").toString(),
        maxPurchasesPerHour: 20,
        reuseWindowSeconds: 3600,
        expiresAt: null,
      },
      agentIds: [agent.id],
      createdBy: "seed",
    });
    console.log(`Task: ${t.id} "${TASK_TITLE}" (created; allowed provider ${host})`);
  } else {
    const [link] = await db
      .select()
      .from(taskAgents)
      .where(and(eq(taskAgents.taskId, task.id), eq(taskAgents.agentId, agent.id)));
    if (!link) await db.insert(taskAgents).values({ taskId: task.id, agentId: agent.id });
    console.log(`Task: ${task.id} "${TASK_TITLE}" (exists)`);
  }

  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
