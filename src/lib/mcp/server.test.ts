// The MCP server end to end over an in-memory transport: the tools an agent sees, and that procurement help tools
// are read-only while buy_resource still enforces everything.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { fakeRail, world } from "@/test/helpers";
import { buildEvidence } from "@/lib/evidence/evidence";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { buildMcpServer } from "./server";

async function connect(w: Awaited<ReturnType<typeof world>>, rail = fakeRail({})) {
  const server = buildMcpServer({ db: w.db, rail }, w.agent);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return r.content.map((c) => c.text).join("\n");
  };
  return { client, call };
}

const ETH = { categories: ["blockchain_analytics"], maxPerPurchase: "5000000", approvalAbove: "3000000" };

describe("MCP procurement tools", () => {
  it("lists the procurement tools next to buy_resource", async () => {
    const w = await world();
    const { client } = await connect(w);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["buy_resource", "get_mandate", "check_intent", "check_memory", "compare_providers", "get_evidence"]));
  });

  it("get_mandate shows the signed purpose and categories; check_intent warns before buying", async () => {
    const w = await world({ rules: ETH });
    const { call } = await connect(w);
    const m = await call("get_mandate");
    expect(m).toMatch(/signature valid/);
    expect(m).toMatch(/Blockchain analytics/);
    expect(await call("check_intent", { url: "https://data.example.com/gift-cards" })).toMatch(/Would be refused/);
    expect(await call("check_intent", { url: "https://data.example.com/eth/transactions" })).toMatch(/Fits the task/);
  });

  it("check_memory and compare_providers answer from the ledger and say when there's nothing", async () => {
    const w = await world();
    const rail = fakeRail({ "/fx-rates": { amount: 10_000n } });
    const { call } = await connect(w, rail);
    expect(await call("compare_providers", { kind: "fx rates" })).toMatch(/nothing to compare/);
    expect(await call("check_memory", { url: "https://data.example.com/fx-rates" })).toMatch(/Not in memory/);
    await submitPurchase({ db: w.db, rail }, w.agent.id, { taskId: w.task.id, url: "https://data.example.com/fx-rates", method: "GET", purpose: "fx", idempotencyKey: "m1" });
    expect(await call("check_memory", { url: "https://data.example.com/fx-rates" })).toMatch(/served for \$0/);
    expect(await call("compare_providers", { kind: "fx rates" })).toMatch(/data\.example\.com\/fx-rates: last paid \$0\.01/);
  });

  it("buy_resource enforces IntentLock whether or not the agent checked first", async () => {
    const w = await world({ rules: ETH });
    const rail = fakeRail({ "/gift-cards": { amount: 1_000n } });
    const { call } = await connect(w, rail);
    const out = await call("buy_resource", { url: "https://data.example.com/gift-cards", purpose: "needed" });
    expect(out).toMatch(/INTENT_MISMATCH/);
    expect(rail.calls.pay).toHaveLength(0);
  });
});

describe("evidence package", () => {
  it("labels each claim by how it can be checked", async () => {
    const w = await world({ rules: ETH });
    const rail = fakeRail({ "/eth/tx": { amount: 1_000_000n, description: "Ethereum transactions" } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, { taskId: w.task.id, url: "https://data.example.com/eth/tx", method: "GET", purpose: "eth", idempotencyKey: "e1" });
    const e = await buildEvidence(w.db, w.org.id, p.id, "https://aerar.test");
    expect(e?.mandate?.verified).toBe(true);
    expect(e?.decision.intentLock?.outcome).toBe("match");
    const levels = Object.fromEntries(e!.checks.map((c) => [c.level, c.ok]));
    expect(levels).toMatchObject({ signed: true, base: true, database: true });
    expect(e?.receipt?.encoded).toMatch(/^aerar-receipt:v1:/);
    // Another workspace can't read it.
    expect(await buildEvidence(w.db, "org_other", p.id, "x")).toBeNull();
  });
});
