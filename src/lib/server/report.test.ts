import { describe, expect, it } from "vitest";
import { submitPurchase, type PurchaseRequest } from "@/lib/purchase/pipeline";
import { fakeRail, world } from "@/test/helpers";
import { headline, morningReport, windowFor } from "./report";

let n = 0;
const req = (taskId: string, url: string, over: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  taskId,
  url,
  method: "GET",
  purpose: "tonight's brief",
  idempotencyKey: `r${++n}`,
  ...over,
});

const wide = () => ({ since: new Date(Date.now() - 3600_000), until: new Date(Date.now() + 3600_000) });

describe("morning report", () => {
  it("adds up a night: paid, reused, refused, waiting, by provider and agent", async () => {
    const w = await world();
    const rail = fakeRail({ "/fx": { amount: 10_000n }, "/big": { amount: 60_000n } });
    const ctx = { db: w.db, rail };
    await submitPurchase(ctx, w.agent.id, req(w.task.id, "https://data.example.com/fx?base=USD"));
    await submitPurchase(ctx, w.agent2.id, req(w.task.id, "https://data.example.com/fx?base=USD")); // reused
    await submitPurchase(ctx, w.agent.id, req(w.task.id, "https://evil.example.net/fx")); // not allowed
    await submitPurchase(ctx, w.agent2.id, req(w.task.id, "https://data.example.com/big")); // above approval line

    const r = await morningReport(w.db, w.org.id, wide());
    expect(r.totals).toMatchObject({ purchases: 4, delivered: 1, reused: 1, refused: 1, waiting: 1, spent: 10_000n, saved: 10_000n, verified: 1 });
    expect(r.totals.formatted.saved).toBe("$0.01");
    expect(r.reasons[0].code).toBe("PROVIDER_NOT_ALLOWED");
    expect(r.waiting).toHaveLength(1);
    expect(r.waiting[0].agentName).toBe("analyst");
    expect(r.timeline).toHaveLength(4);
    expect(r.timeline[0].taskTitle).toBe("Competitor report");
    expect(r.providers[0]).toMatchObject({ host: "data.example.com", purchases: 3, paid: 10_000n, reused: 1 });
    expect(r.agents.find((a) => a.name === "researcher")).toMatchObject({ purchases: 2, paid: 10_000n, refused: 1 });
    expect(r.headline.join(" ")).toMatch(/paid \$0\.01 for 1 delivery, every transfer checked onchain/);
    expect(r.headline.join(" ")).toMatch(/wasn't spent twice/);
    expect(r.headline.join(" ")).toMatch(/waiting for you/);
  });

  it("only counts purchases inside the window, but always shows what's waiting", async () => {
    const w = await world();
    const ctx = { db: w.db, rail: fakeRail({ "/big": { amount: 60_000n } }) };
    await submitPurchase(ctx, w.agent.id, req(w.task.id, "https://data.example.com/big"));
    const future = { since: new Date(Date.now() + 3600_000), until: new Date(Date.now() + 7200_000) };
    const r = await morningReport(w.db, w.org.id, future);
    expect(r.totals.purchases).toBe(0);
    expect(r.waiting).toHaveLength(1);
    expect(r.headline).toEqual(["1 purchase is waiting for you to approve or reject."]);
  });

  it("says so when nothing happened", () => {
    const zero = { purchases: 0, delivered: 0, reused: 0, refused: 0, failed: 0, waiting: 0, spent: 0n, saved: 0n, blocked: 0n, verified: 0, formatted: { spent: "$0.00", saved: "$0.00", blocked: "$0.00" } };
    expect(headline(zero, [])[0]).toMatch(/quiet shift/);
  });

  it("defaults to the night since 18:00 UTC", () => {
    const morning = new Date("2026-11-07T07:30:00Z");
    expect(windowFor(undefined, morning).since.toISOString()).toBe("2026-11-06T18:00:00.000Z");
    const evening = new Date("2026-11-07T20:00:00Z");
    expect(windowFor(undefined, evening).since.toISOString()).toBe("2026-11-07T18:00:00.000Z");
    expect(windowFor("24h", morning).since.toISOString()).toBe("2026-11-06T07:30:00.000Z");
  });
});
