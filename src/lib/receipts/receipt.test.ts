import { beforeAll, describe, expect, it } from "vitest";
import { fakeRail, world } from "@/test/helpers";
import { submitPurchase } from "@/lib/purchase/pipeline";
import { checkReceipt, decodeReceipt, encodeReceipt, receiptFor, receiptSignerAddress } from "./receipt";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0123";
});

async function paidReceipt() {
  const w = await world();
  const rail = fakeRail({ "/fx": { amount: 10_000n } });
  const p = await submitPurchase({ db: w.db, rail }, w.agent.id, {
    taskId: w.task.id,
    url: "https://data.example.com/fx",
    method: "GET",
    body: null,
    purpose: "FX rates for the report",
    idempotencyKey: "r1",
  });
  const r = await receiptFor(w.db, w.org.id, p.id, "https://aerar.test");
  return { w, p, r: r! };
}

describe("signed receipts", () => {
  it("signs a purchase so anyone can check it with the public key", async () => {
    const { p, r } = await paidReceipt();
    expect(r.body.purchase.id).toBe(p.id);
    expect(r.body.purchase.paid.amount).toBe("10000");
    expect(r.body.purchase.rules.sha256).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.body.audit.lastEventHash).toBeTruthy();
    const c = await checkReceipt(r, receiptSignerAddress());
    expect(c).toMatchObject({ hashMatches: true, signatureValid: true, signerIsAerar: true });
  });

  it("survives encoding to one pasteable string", async () => {
    const { r } = await paidReceipt();
    const text = encodeReceipt(r);
    expect(text.startsWith("aerar-receipt:v1:")).toBe(true);
    const back = decodeReceipt(text)!;
    expect((await checkReceipt(back, receiptSignerAddress())).signerIsAerar).toBe(true);
  });

  it("catches an edited amount or payee", async () => {
    const { r } = await paidReceipt();
    const edited = structuredClone(r);
    edited.body.purchase.paid.amount = "1";
    expect((await checkReceipt(edited, receiptSignerAddress())).hashMatches).toBe(false);
    const payee = structuredClone(r);
    payee.body.purchase.quote.payTo = "0x000000000000000000000000000000000000dEaD";
    expect((await checkReceipt(payee, receiptSignerAddress())).hashMatches).toBe(false);
  });

  it("rejects a receipt re-signed by someone else", async () => {
    const { r } = await paidReceipt();
    const c = await checkReceipt(r, "0x000000000000000000000000000000000000bEEF");
    expect(c.signatureValid).toBe(true);
    expect(c.signerIsAerar).toBe(false);
  });

  it("won't issue a receipt for another org's purchase", async () => {
    const { w, p } = await paidReceipt();
    expect(await receiptFor(w.db, "org_someone_else", p.id, "x")).toBeNull();
  });
});
