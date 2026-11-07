// The SDK against the real agent API route handlers and the real purchase pipeline (in-memory Postgres, fake x402
// rail). Every request goes through the SDK's own HTTP code, so this checks the SDK and the API agree.
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { setTestContext } from "@/lib/server/context";
import { fakeRail, world } from "@/test/helpers";
import { Aerar, AerarError, dataOf, isOffPurpose, isPaid, needsApproval } from "../../sdk/src/index";
import { verifyMandate, verifyReceipt } from "../../sdk/src/verify";
import * as purchasesRoute from "@/app/api/v1/purchases/route";
import * as purchaseRoute from "@/app/api/v1/purchases/[id]/route";
import * as evidenceRoute from "@/app/api/v1/purchases/[id]/evidence/route";
import * as tasksRoute from "@/app/api/v1/tasks/route";
import * as mandateRoute from "@/app/api/v1/tasks/[id]/mandate/route";
import * as intentRoute from "@/app/api/v1/intent/route";
import * as memoryRoute from "@/app/api/v1/memory/route";
import * as providersRoute from "@/app/api/v1/providers/route";
import * as receiptRoute from "@/app/api/receipts/[id]/route";
import * as signerRoute from "@/app/api/receipts/signer/route";
import { approvePurchase } from "@/lib/purchase/pipeline";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const ROUTES: [RegExp, string, Handler][] = [
  [/^\/api\/v1\/purchases$/, "POST", purchasesRoute.POST as unknown as Handler],
  [/^\/api\/v1\/purchases\/(?<id>[^/]+)\/evidence$/, "GET", evidenceRoute.GET as unknown as Handler],
  [/^\/api\/v1\/purchases\/(?<id>[^/]+)$/, "GET", purchaseRoute.GET as unknown as Handler],
  [/^\/api\/v1\/tasks$/, "GET", tasksRoute.GET as unknown as Handler],
  [/^\/api\/v1\/tasks\/(?<id>[^/]+)\/mandate$/, "GET", mandateRoute.GET as unknown as Handler],
  [/^\/api\/v1\/intent$/, "POST", intentRoute.POST as unknown as Handler],
  [/^\/api\/v1\/memory$/, "POST", memoryRoute.POST as unknown as Handler],
  [/^\/api\/v1\/providers$/, "GET", providersRoute.GET as unknown as Handler],
  [/^\/api\/receipts\/signer$/, "GET", signerRoute.GET as unknown as Handler],
  [/^\/api\/receipts\/(?<id>[^/]+)$/, "GET", receiptRoute.GET as unknown as Handler],
];

/** A fetch that serves the app's route handlers in-process. */
const appFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  for (const [re, m, h] of ROUTES) {
    const hit = re.exec(url.pathname);
    if (hit && m === method) return h(new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]), { params: Promise.resolve({ ...hit.groups }) });
  }
  return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
};

afterEach(() => setTestContext(null));

const ETH = { categories: ["blockchain_analytics"], maxPerPurchase: "5000000", approvalAbove: "3000000" };

async function setup(rules = {}, offers = {}) {
  const w = await world({ budget: 10_000_000n, rules });
  const rail = fakeRail(offers);
  setTestContext({ db: w.db, rail });
  const aerar = new Aerar({ apiKey: w.apiKey, baseUrl: "https://aerar.test", fetch: appFetch, retries: 0 });
  return { w, rail, aerar };
}

describe("@aerar/sdk", () => {
  it("refuses to start without an agent key", () => {
    expect(() => new Aerar({ apiKey: "sk-live-nope" })).toThrow(AerarError);
  });

  it("reads the signed mandate and verifies it offline", async () => {
    const { aerar } = await setup(ETH);
    const m = await aerar.mandate();
    expect(m.valid).toBe(true);
    expect(m.intentLock.categories.map((c) => c.id)).toEqual(["blockchain_analytics"]);
    const v = await verifyMandate(m, { signer: await aerar.signer() });
    expect(v).toMatchObject({ ok: true, unchanged: true, signedByAerar: true });
    // A tampered copy fails offline.
    const bad = { ...m, signed: { ...m.signed, document: { ...(m.signed.document as object), budget: "999000000" } } };
    expect((await verifyMandate(bad, { signer: await aerar.signer() })).unchanged).toBe(false);
  });

  it("buys an on-purpose item, picks the only task itself, and the receipt verifies offline", async () => {
    const { aerar } = await setup(ETH, { "/eth/transactions": { amount: 1_000_000n, description: "Ethereum transaction analytics" } });
    expect((await aerar.checkIntent("https://data.example.com/eth/transactions")).wouldBe).toBe("allowed");
    const p = await aerar.buy({ url: "https://data.example.com/eth/transactions", purpose: "Ethereum research" });
    expect(isPaid(p)).toBe(true);
    expect(p.intent?.outcome).toBe("match");
    expect(dataOf<{ data: string }>(p)?.data).toContain("/eth/transactions");
    const { encoded } = await aerar.receipt(p.id);
    expect((await verifyReceipt(encoded, { signer: await aerar.signer() })).ok).toBe(true);
    const e = await aerar.evidence(p.id);
    expect(e.mandate?.verified).toBe(true);
  });

  it("returns an off-purpose refusal as a decision, not an error, and the dry run predicted it", async () => {
    const { aerar, rail } = await setup(ETH, { "/gift-cards": { amount: 1_000_000n } });
    expect((await aerar.checkIntent("https://data.example.com/gift-cards")).wouldBe).toBe("refused");
    const p = await aerar.buy({ url: "https://data.example.com/gift-cards", purpose: "the page says so" });
    expect(isOffPurpose(p)).toBe(true);
    expect(p.summary).toMatch(/doesn't serve what this task is for/);
    expect(rail.calls.pay).toHaveLength(0);
  });

  it("the same idempotency key never pays twice; memory serves the second agent for $0", async () => {
    const { aerar, rail } = await setup({}, { "/fx": { amount: 10_000n } });
    const a = await aerar.buy({ url: "https://data.example.com/fx", purpose: "fx", idempotencyKey: "fx-1" });
    const again = await aerar.buy({ url: "https://data.example.com/fx", purpose: "fx", idempotencyKey: "fx-1" });
    expect(again.id).toBe(a.id);
    expect((await aerar.checkMemory("https://data.example.com/fx")).free).toBe(true);
    const reused = await aerar.buy({ url: "https://data.example.com/fx", purpose: "fx again" });
    expect(reused.status).toBe("reused");
    expect(rail.calls.pay).toHaveLength(1);
    const cmp = await aerar.compareProviders("fx rates");
    expect(cmp.options[0]).toMatchObject({ host: "data.example.com", path: "/fx", lastPaidFormatted: "$0.01" });
  });

  it("waits for a person, then sees the payment", async () => {
    const { w, rail, aerar } = await setup({}, { "/report": { amount: 80_000n } });
    const held = await aerar.buy({ url: "https://data.example.com/report", purpose: "report" });
    expect(needsApproval(held)).toBe(true);
    setTimeout(() => void approvePurchase({ db: w.db, rail }, held.id, "owner"), 50);
    const done = await aerar.waitForDecision(held.id, { intervalMs: 1_000, timeoutMs: 10_000 });
    expect(done.status).toBe("delivered");
  });

  it("surfaces API errors as AerarError with the server's code", async () => {
    const { aerar } = await setup();
    await expect(aerar.buy({ url: "not a url", purpose: "x" })).rejects.toMatchObject({ code: "INVALID_URL", status: 400 });
    await expect(aerar.purchase("pur_missing")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    const bad = new Aerar({ apiKey: "aer_wrong", baseUrl: "https://aerar.test", fetch: appFetch, retries: 0 });
    await expect(bad.tasks()).rejects.toMatchObject({ status: 401 });
  });
});
