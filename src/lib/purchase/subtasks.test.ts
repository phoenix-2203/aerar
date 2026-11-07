import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { tasks } from "@/db/schema";
import { fakeRail, world } from "@/test/helpers";
import { hireAgent, setTaskStatus } from "@/lib/workspace";
import { submitPurchase } from "./pipeline";

let n = 0;
const buy = (taskId: string, path = "/fx") => ({ taskId, url: `https://data.example.com${path}`, method: "GET" as const, body: null, purpose: "data", idempotencyKey: `s${++n}` });
const row = async (w: Awaited<ReturnType<typeof world>>, id: string) => (await w.db.select().from(tasks).where(eq(tasks.id, id)))[0];

describe("agents hiring agents", () => {
  it("a hired agent's spend counts against the task that hired it", async () => {
    const w = await world({ budget: 100_000n });
    const h = await hireAgent(w.db, { parentTaskId: w.task.id, title: "Competitor scan", purpose: "scan", budget: 30_000n, agentName: "helper", by: "lead" });
    const rail = fakeRail({ "/fx": { amount: 10_000n } });
    const p = await submitPurchase({ db: w.db, rail }, h.agent.id, buy(h.task.id));
    expect(p.status).toBe("delivered");
    expect(p.reasonCodes).toContain("WITHIN_PARENT_BUDGET");
    expect((await row(w, h.task.id)).spent).toBe(10_000n);
    expect((await row(w, w.task.id)).spent).toBe(10_000n);
  });

  it("pausing the lead task stops every agent it hired", async () => {
    const w = await world();
    const h = await hireAgent(w.db, { parentTaskId: w.task.id, title: "Helper", purpose: "x", budget: 30_000n, agentName: "helper", by: "lead" });
    await setTaskStatus(w.db, w.task.id, "paused", "lead");
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/fx": { amount: 1_000n } }) }, h.agent.id, buy(h.task.id));
    expect(p.status).toBe("declined");
    expect(p.reasonCodes).toContain("PARENT_TASK_NOT_ACTIVE");
  });

  it("can't spend past what the lead task has left, even inside its own budget", async () => {
    const w = await world({ budget: 50_000n });
    const h = await hireAgent(w.db, { parentTaskId: w.task.id, title: "Helper", purpose: "x", budget: 50_000n, agentName: "helper", by: "lead" });
    const rail = fakeRail({ "/fx": { amount: 40_000n }, "/b": { amount: 40_000n } });
    await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/fx")); // the lead spends $0.04 itself
    const p = await submitPurchase({ db: w.db, rail }, h.agent.id, buy(h.task.id, "/b"));
    expect(p.status).toBe("declined");
    expect(p.reasonCodes).toContain("PARENT_BUDGET_EXCEEDED");
  });

  it("is never wider than the task that hired it", async () => {
    const w = await world();
    await expect(hireAgent(w.db, { parentTaskId: w.task.id, title: "x", purpose: "x", budget: 10_000n, agentName: "h", providers: ["evil.example"], by: "lead" })).rejects.toThrow(/can't buy from/);
    await expect(hireAgent(w.db, { parentTaskId: w.task.id, title: "x", purpose: "x", budget: 10_000_000n, agentName: "h", by: "lead" })).rejects.toThrow(/budget/);
  });

  it("caps spend per provider", async () => {
    const w = await world({ budget: 1_000_000n, rules: { approvalAbove: "1000000", maxPerPurchase: "1000000", providerCaps: { "data.example.com": "25000" } } });
    const rail = fakeRail({ "/a": { amount: 10_000n }, "/b": { amount: 10_000n }, "/c": { amount: 10_000n } });
    expect((await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/a"))).status).toBe("delivered");
    expect((await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/b"))).status).toBe("delivered");
    const third = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/c"));
    expect(third.status).toBe("declined");
    expect(third.reasonCodes).toContain("PROVIDER_CAP_REACHED");
  });
});
