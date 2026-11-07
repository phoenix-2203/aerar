import { beforeAll, describe, expect, it } from "vitest";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { testDb } from "@/lib/sim";
import { findItem } from "./catalog";
import { tryRail } from "./rail";
import { createTrySandbox, decodeSession, encodeSession, isTryOrg } from "./sandbox";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
});

describe("try-it sandbox", () => {
  it("signs the visitor's session and rejects tampering", () => {
    const s = { orgId: "org_try_abc", taskId: "tsk_1", agentId: "agt_1", apiKey: "aer_x" };
    const t = encodeSession(s);
    expect(decodeSession(t)).toEqual(s);
    expect(decodeSession(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    const forged = encodeSession({ ...s, orgId: "org_demo" });
    expect(decodeSession(forged)).toBeNull(); // only sandbox orgs are accepted
  });

  it("creates a private workspace whose agent pays simulated shops under the default rules", async () => {
    const db = await testDb();
    const s = await createTrySandbox(db);
    expect(isTryOrg(s.orgId)).toBe(true);
    const ctx = { db, rail: tryRail() };
    const buy = (url: string) => submitPurchase(ctx, s.agentId, { taskId: s.taskId, url, method: "GET", body: null, purpose: "test", idempotencyKey: `k-${Math.random()}` });
    expect((await buy("https://api.marketdata.dev/fx-rates")).status).toBe("delivered");
    expect((await buy("https://api.marketdata.dev/fx-rates")).status).toBe("reused");
    expect((await buy("https://pay.attacker.io/full-dataset")).status).toBe("declined");
    expect((await buy("https://reports.acme.dev/deep-report")).status).toBe("awaiting_approval");
    expect((await buy("https://api.marketdata.dev/interest-rates")).status).toBe("delivered");
    const swapped = await buy("https://api.marketdata.dev/interest-rates?payee=new");
    expect(swapped.status).toBe("declined");
    expect(swapped.reasonCodes).toContain("PAYEE_CHANGED");
    expect(findItem("https://nowhere.example/x")).toBeNull();
  });
});
