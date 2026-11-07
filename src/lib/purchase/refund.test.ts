import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { tasks } from "@/db/schema";
import { fakeRail, world } from "@/test/helpers";
import { submitPurchase } from "./pipeline";

let n = 0;
const buy = (taskId: string, path: string) => ({ taskId, url: `https://data.example.com${path}`, method: "GET" as const, body: null, purpose: "data", idempotencyKey: `r${++n}` });

describe("refunds through a shop's escrow", () => {
  it("refunds a failed delivery, gives the budget back and still puts the shop on hold", async () => {
    const w = await world();
    const rail = fakeRail({ "/a": { amount: 20_000n, escrow: true, delivers: "empty" } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/a"));
    expect(p.status).toBe("refunded");
    expect(p.reasonCodes).toEqual(expect.arrayContaining(["NOT_DELIVERED", "EMPTY_DELIVERY", "REFUNDED"]));
    expect(p.paidAmount).toBe(0n);
    expect(p.refundedAmount).toBe(20_000n);
    expect(p.refundTx).toBe("0xrefund1");
    const [t] = await w.db.select().from(tasks).where(eq(tasks.id, w.task.id));
    expect(t.spent).toBe(0n);
    expect(t.reserved).toBe(0n);
    expect(rail.calls.refund[0].reason).toMatch(/EMPTY_DELIVERY/);
  });

  it("if the escrow won't refund, the purchase stays 'paid, not delivered' and says so", async () => {
    const w = await world();
    const rail = fakeRail({ "/a": { amount: 20_000n, escrow: true, delivers: "empty" } });
    rail.refund = async () => ({ ok: false, reason: "window closed" });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/a"));
    expect(p.status).toBe("disputed");
    expect(p.reasonCodes).toContain("REFUND_FAILED");
    expect(p.paidAmount).toBe(20_000n);
    expect(p.error).toMatch(/Refund failed: window closed/);
  });

  it("a shop without an escrow can't be refunded, as before", async () => {
    const w = await world();
    const rail = fakeRail({ "/a": { amount: 20_000n, delivers: "empty" } });
    const p = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/a"));
    expect(p.status).toBe("disputed");
    expect(rail.calls.refund.length).toBe(0);
  });
});
