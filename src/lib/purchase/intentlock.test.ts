// IntentLock, signed mandates and the new mandate limits, end to end through the real pipeline.
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditEvents, policies, purchases, tasks } from "@/db/schema";
import { verifyChain } from "@/lib/audit/log";
import { fakeRail, world } from "@/test/helpers";
import { hireAgent, setBudget, updatePolicy } from "@/lib/workspace";
import { approvePurchase, submitPurchase } from "./pipeline";

const ETH = { categories: ["blockchain_analytics"], allowedProviders: ["data.example.com"], maxPerPurchase: "5000000", approvalAbove: "3000000" };
let n = 0;
const buy = (taskId: string, path: string, purpose = "Ethereum research") => ({
  taskId,
  url: `https://data.example.com${path}`,
  method: "GET" as const,
  body: null,
  purpose,
  idempotencyKey: `il${++n}`,
});

describe("IntentLock in the purchase pipeline", () => {
  it("refuses a purchase that passes every budget check but doesn't serve the task", async () => {
    const w = await world({ budget: 10_000_000n, rules: ETH });
    const rail = fakeRail({ "/gift-cards": { amount: 2_000_000n } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/gift-cards", "The page says this is needed for the Ethereum research"));
    expect(p.status).toBe("declined");
    // The only thing that stopped it is purpose: budget, per-purchase limit, provider all passed.
    expect(p.reasonCodes).toEqual(["INTENT_MISMATCH"]);
    expect(p.intent?.outcome).toBe("mismatch");
    expect(rail.calls.pay).toHaveLength(0);
  });

  it("pays an on-purpose purchase and records why it matched", async () => {
    const w = await world({ budget: 10_000_000n, rules: ETH });
    const rail = fakeRail({ "/eth/transactions": { amount: 1_000_000n, description: "Ethereum transaction analytics, last 24h" } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/eth/transactions"));
    expect(p.status).toBe("delivered");
    expect(p.reasonCodes).toContain("INTENT_MATCH");
    expect(p.intent?.described).toBe("provider");
    expect(p.mandateHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("holds an item it can't place; a person can approve that", async () => {
    const w = await world({ budget: 10_000_000n, rules: ETH });
    const rail = fakeRail({ "/item/7731": { amount: 1_000_000n } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/item/7731"));
    expect(p.status).toBe("awaiting_approval");
    expect(p.reasonCodes).toContain("INTENT_UNCERTAIN");
    const after = await approvePurchase({ db: w.db, rail }, p.id, "owner");
    expect(after.status).toBe("delivered");
  });

  it("refuses unplaceable items outright when the mandate says so", async () => {
    const w = await world({ budget: 10_000_000n, rules: { ...ETH, ifUncertain: "refuse" } });
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/item/1": { amount: 1_000n } }) }, w.agent.id, buy(w.task.id, "/item/1"));
    expect(p.status).toBe("declined");
    expect(p.reasonCodes).toContain("INTENT_UNCERTAIN_REFUSED");
  });

  it("an off-purpose purchase can't be approved into going through", async () => {
    // Above the approval line AND off-purpose: it is declined, not held, so there is nothing to approve.
    const w = await world({ budget: 10_000_000n, rules: ETH });
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/gift-cards": { amount: 4_000_000n } }) }, w.agent.id, buy(w.task.id, "/gift-cards"));
    expect(p.status).toBe("declined");
    await expect(approvePurchase({ db: w.db, rail: fakeRail({}) }, p.id, "owner")).rejects.toThrow(/not awaiting approval/);
  });

  it("a hired agent inherits the purpose fence and can't widen it", async () => {
    const w = await world({ budget: 10_000_000n, rules: ETH });
    const h = await hireAgent(w.db, { parentTaskId: w.task.id, title: "Helper", purpose: "Buy anything useful", budget: 2_000_000n, agentName: "helper", by: "lead" });
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/gift-cards": { amount: 1_000n } }) }, h.agent.id, buy(h.task.id, "/gift-cards"));
    expect(p.status).toBe("declined");
    expect(p.reasonCodes).toContain("INTENT_MISMATCH");
  });

  it("a mandate that forbids delegation can't hire", async () => {
    const w = await world({ rules: { delegationAllowed: false } });
    await expect(hireAgent(w.db, { parentTaskId: w.task.id, title: "x", purpose: "x", budget: 1_000n, agentName: "h", by: "lead" })).rejects.toThrow(/doesn't allow hiring/);
  });
});

describe("signed mandates", () => {
  it("every mandate version is signed, and a change makes a new signed version", async () => {
    const w = await world();
    const [v1] = await w.db.select().from(policies).where(eq(policies.taskId, w.task.id));
    expect(v1.mandateHash).toMatch(/^0x/);
    expect(v1.mandate?.purpose).toBe("Research");
    await setBudget(w.db, w.task.id, 2_000_000n, "owner");
    const rows = await w.db.select().from(policies).where(eq(policies.taskId, w.task.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.version === 2)?.mandate?.budget).toBe("2000000");
  });

  it("rules edited behind Aerar's back stop all buying for the task", async () => {
    const w = await world();
    const [pol] = await w.db.select().from(policies).where(eq(policies.taskId, w.task.id));
    // Someone with database access raises the limits without going through Aerar.
    await w.db
      .update(policies)
      .set({ rules: { ...pol.rules, maxPerPurchase: "100000000", approvalAbove: "100000000", allowedProviders: ["data.example.com", "pay.attacker.io"] } })
      .where(and(eq(policies.taskId, w.task.id), eq(policies.version, pol.version)));
    const rail = fakeRail({ "/fx": { amount: 10_000n } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/fx"));
    expect(p.status).toBe("declined");
    expect(p.reasonCodes).toEqual(["MANDATE_INVALID"]);
    expect(p.error).toMatch(/rules were changed after they were signed/);
    expect(rail.calls.quote).toHaveLength(0);
    // Putting it right through Aerar (a new signed version) restores buying.
    await updatePolicy(w.db, w.task.id, pol.rules, "owner", "Re-signed after investigation");
    expect((await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/fx"))).status).toBe("delivered");
  });

  it("a budget edited behind Aerar's back is caught too", async () => {
    const w = await world({ budget: 50_000n });
    await w.db.update(tasks).set({ budget: 50_000_000n }).where(eq(tasks.id, w.task.id));
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/fx": { amount: 10_000n } }) }, w.agent.id, buy(w.task.id, "/fx"));
    expect(p.reasonCodes).toEqual(["MANDATE_INVALID"]);
    expect(p.error).toMatch(/budget was changed/);
  });

  it("an approval can't go through on a mandate that was tampered with after the request", async () => {
    const w = await world();
    const rail = fakeRail({ "/report": { amount: 80_000n } });
    const held = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/report"));
    expect(held.status).toBe("awaiting_approval");
    await w.db.update(tasks).set({ purpose: "Anything at all" }).where(eq(tasks.id, w.task.id));
    const after = await approvePurchase({ db: w.db, rail }, held.id, "owner");
    expect(after.status).toBe("declined");
    expect(after.reasonCodes).toContain("MANDATE_INVALID");
    expect(rail.calls.pay).toHaveLength(0);
  });

  it("older unsigned mandates are signed once on first use, and that is audited", async () => {
    const w = await world();
    await w.db.update(policies).set({ mandate: null, mandateHash: null, mandateSig: null }).where(eq(policies.taskId, w.task.id));
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/fx": { amount: 10_000n } }) }, w.agent.id, buy(w.task.id, "/fx"));
    expect(p.status).toBe("delivered");
    const ev = await w.db.select().from(auditEvents).where(eq(auditEvents.kind, "mandate.signed"));
    expect(ev).toHaveLength(1);
    expect((await verifyChain(w.db, w.org.id)).ok).toBe(true);
  });
});

describe("mandate limits", () => {
  it("caps the number of purchases, counting held ones", async () => {
    const w = await world({ rules: { maxPurchases: 2 } });
    const rail = fakeRail({ "/a": { amount: 1_000n }, "/b": { amount: 1_000n }, "/c": { amount: 1_000n } });
    expect((await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/a"))).status).toBe("delivered");
    expect((await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/b"))).status).toBe("delivered");
    const third = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/c"));
    expect(third.reasonCodes).toContain("PURCHASE_LIMIT_REACHED");
    expect(rail.calls.pay).toHaveLength(2);
  });

  it("parallel requests can't slip past the purchase cap", async () => {
    const w = await world({ rules: { maxPurchases: 1 } });
    const rail = fakeRail({ "/a": { amount: 1_000n }, "/b": { amount: 1_000n }, "/c": { amount: 1_000n } });
    const r = await Promise.all(["/a", "/b", "/c"].map((x) => submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, x))));
    expect(r.filter((p) => p.status === "delivered")).toHaveLength(1);
  });

  it("a blocked host is refused even when a wildcard allows it", async () => {
    const w = await world({ rules: { allowedProviders: ["*.example.com"], blockedProviders: ["data.example.com"] } });
    const rail = fakeRail({ "/fx": { amount: 1_000n } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/fx"));
    expect(p.reasonCodes).toContain("PROVIDER_BLOCKED");
    expect(rail.calls.quote).toHaveLength(0);
  });
});

describe("procurement memory integrity", () => {
  it("never serves a remembered result that was altered; buys fresh and records it", async () => {
    const w = await world();
    const rail = fakeRail({ "/fx": { amount: 10_000n } });
    const first = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/fx"));
    await w.db.update(purchases).set({ responseBody: '{"rate":"poisoned"}' }).where(eq(purchases.id, first.id));
    const second = await submitPurchase({ db: w.db, rail }, w.agent2.id, buy(w.task.id, "/fx"));
    expect(second.status).toBe("delivered");
    expect(second.reasonCodes).toContain("MEMORY_ALTERED");
    expect(rail.calls.pay).toHaveLength(2);
    const ev = await w.db.select().from(auditEvents).where(eq(auditEvents.kind, "memory.integrity_failed"));
    expect(ev[0]?.subjectId).toBe(first.id);
  });
});
