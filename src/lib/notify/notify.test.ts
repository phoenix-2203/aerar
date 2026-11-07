import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { approvalToken, maskNotifyUrl, notifyApproval, notifyKind, readApprovalToken } from "./notify";
import { organisations } from "@/db/schema";
import { fakeRail, world } from "@/test/helpers";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { eq } from "drizzle-orm";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0123";
});
afterEach(() => vi.unstubAllGlobals());

describe("approval links", () => {
  it("only accept Slack, Discord and Telegram URLs", () => {
    expect(notifyKind("https://hooks.slack.com/services/T/B/x")).toBe("slack");
    expect(notifyKind("https://discord.com/api/webhooks/1/abc")).toBe("discord");
    expect(notifyKind("https://api.telegram.org/bot123:abc/sendMessage?chat_id=42")).toBe("telegram");
    expect(notifyKind("https://api.telegram.org/bot123:abc/sendMessage")).toBeNull();
    expect(notifyKind("http://hooks.slack.com/services/x")).toBeNull();
    expect(notifyKind("https://169.254.169.254/latest")).toBeNull();
    expect(notifyKind("https://evil.example/api/webhooks/1")).toBeNull();
    expect(maskNotifyUrl("https://discord.com/api/webhooks/1/abcdef123456")).toBe("Discord · …123456");
  });

  it("sign one purchase, expire, and reject tampering", () => {
    const t = approvalToken("pur_abc", 1_000);
    expect(readApprovalToken(t, 2_000)).toEqual({ purchaseId: "pur_abc" });
    expect(readApprovalToken(t, 1_000 + 25 * 3600_000)).toHaveProperty("error");
    expect(readApprovalToken(t.replace("pur_abc", "pur_xyz"), 2_000)).toHaveProperty("error");
    expect(readApprovalToken("garbage", 2_000)).toHaveProperty("error");
  });

  it("posts a held purchase to the workspace's channel with a review link", async () => {
    const w = await world({ rules: { approvalAbove: "1" } });
    await w.db.update(organisations).set({ notifyUrl: "https://discord.com/api/webhooks/1/abc" }).where(eq(organisations.id, w.org.id));
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response(null, { status: 204 });
    });
    const p = await submitPurchase({ db: w.db, rail: fakeRail({ "/fx": { amount: 80_000n } }) }, w.agent.id, {
      taskId: w.task.id,
      url: "https://data.example.com/fx",
      method: "GET",
      body: null,
      purpose: "FX",
      idempotencyKey: "n1",
    });
    expect(p.status).toBe("awaiting_approval");
    await notifyApproval(w.db, p); // the pipeline also fires one in the background; call directly to await it
    const mine = calls.filter((c) => c.url.startsWith("https://discord.com/"));
    expect(mine.length).toBeGreaterThan(0);
    const body = JSON.parse(mine.at(-1)!.body);
    expect(body.embeds[0].title).toContain("$0.08");
    expect(body.embeds[0].description).toMatch(/\/approve\/pur_/);
  });

  it("never throws when the channel is down", async () => {
    const w = await world({ rules: { approvalAbove: "1" } });
    await w.db.update(organisations).set({ notifyUrl: "https://hooks.slack.com/services/x" }).where(eq(organisations.id, w.org.id));
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    const [row] = await w.db.select().from(organisations).where(eq(organisations.id, w.org.id));
    expect(row.notifyUrl).toBeTruthy();
    await expect(notifyApproval(w.db, { orgId: w.org.id, id: "pur_x", url: "https://a.b/c", host: "a.b", purpose: "x", reasonCodes: [], quoteAmount: 1n } as never)).resolves.toBeUndefined();
  });
});
