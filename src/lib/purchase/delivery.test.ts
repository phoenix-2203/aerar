import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { providers, purchases } from "@/db/schema";
import { fakeRail, resp, world } from "@/test/helpers";
import { clearProviderHold } from "@/lib/workspace";
import { scoreProviders } from "@/lib/providers/score";
import { checkDelivery } from "./delivery";
import { submitPurchase } from "./pipeline";

const enc = new TextEncoder();
const r = (body: string, contentType = "application/json") => ({ body: enc.encode(body), contentType });
let n = 0;
const buy = (taskId: string, path: string) => ({ taskId, url: `https://data.example.com${path}`, method: "GET" as const, body: null, purpose: "data", idempotencyKey: `d${++n}` });

describe("checkDelivery", () => {
  it("passes real data and catches empty, broken and error-shaped results", () => {
    expect(checkDelivery(r('{"rate":1.08}')).ok).toBe(true);
    expect(checkDelivery(r("plain text report", "text/plain")).ok).toBe(true);
    expect(checkDelivery(r("")).code).toBe("EMPTY_DELIVERY");
    expect(checkDelivery(r("   ")).code).toBe("EMPTY_DELIVERY");
    expect(checkDelivery(r("{}")).code).toBe("EMPTY_DELIVERY");
    expect(checkDelivery(r("[]")).code).toBe("EMPTY_DELIVERY");
    expect(checkDelivery(r('{"rate": 1.0')).code).toBe("MALFORMED_DELIVERY");
    expect(checkDelivery(r('{"error":"internal","status":500}')).code).toBe("ERROR_DELIVERED");
    // A payload that merely has an "error" field among real data is fine.
    expect(checkDelivery(r('{"error":null,"rows":[1,2]}')).ok).toBe(true);
  });
});

describe("paid but not delivered", () => {
  it("marks the purchase, never reuses it, scores the shop down and puts it on hold until a person clears it", async () => {
    const w = await world();
    let junk = true;
    const rail = fakeRail({ "/a": { amount: 10_000n }, "/b": { amount: 10_000n } }, {
      payResult: (q) => ({ kind: "settled", response: junk ? resp("") : resp('{"ok":1}'), txHash: "0xt", payer: null, amount: q.amount }),
    });
    const a = await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/a"));
    expect(a.status).toBe("disputed");
    expect(a.reasonCodes).toEqual(expect.arrayContaining(["NOT_DELIVERED", "EMPTY_DELIVERY"]));
    expect(a.paidAmount).toBe(10_000n); // the money moved; Aerar doesn't pretend otherwise
    const [p] = await w.db.select().from(providers).where(eq(providers.host, "data.example.com"));
    expect(p.heldAt).not.toBeNull();

    // Same request again: not served from memory, and the shop isn't even contacted.
    const quotesBefore = rail.calls.quote.length;
    const again = await submitPurchase({ db: w.db, rail }, w.agent2.id, buy(w.task.id, "/a"));
    expect(again.reasonCodes).toContain("PROVIDER_ON_HOLD");
    expect(rail.calls.quote).toHaveLength(quotesBefore);

    const rows = await w.db.select().from(purchases);
    expect(scoreProviders(rows).find((s) => s.host === "data.example.com")?.failed).toBe(1);

    junk = false;
    await clearProviderHold(w.db, w.org.id, "data.example.com", "owner");
    expect((await submitPurchase({ db: w.db, rail }, w.agent.id, buy(w.task.id, "/b"))).status).toBe("delivered");
  });
});
