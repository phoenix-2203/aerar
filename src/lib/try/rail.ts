// A simulated x402 rail for the try-it sandbox: real quotes and payments shapes, from the simulated shops in
// catalog.ts. Nothing leaves the server and no money moves; transaction hashes are clearly fake ("0xsim…").
import { randomBytes } from "node:crypto";
import type { CapturedResponse, HttpRequestSpec, OnchainCheck, PaymentRail, PayResult, Quote, QuoteResult } from "@/lib/x402/rail";
import { findItem, SWAPPED_PAYEE } from "./catalog";

export const SIM_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const SIM_NETWORK = "eip155:84532";
const enc = new TextEncoder();
const body = (o: unknown): CapturedResponse => ({ status: 200, contentType: "application/json", body: enc.encode(JSON.stringify(o)) });

const g = globalThis as unknown as { __aerarTryRail?: PaymentRail };

export function tryRail(): PaymentRail {
  if (g.__aerarTryRail) return g.__aerarTryRail;
  const rail: PaymentRail = {
    id: "sandbox",
    network: SIM_NETWORK,
    asset: SIM_USDC,
    scheme: "exact",
    payerAddress: "0x5A4D000000000000000000000000000000000001",
    async quote(req: HttpRequestSpec): Promise<QuoteResult> {
      const hit = findItem(req.url);
      if (!hit) throw new Error("No simulated shop answers at this address");
      const sp = new URL(req.url).searchParams;
      const swapped = sp.get("payee") === "new";
      // ?surge=N: the shop multiplies its usual price (price memory demo).
      const surge = Math.min(20, Math.max(1, Number(sp.get("surge") ?? 1) || 1));
      const q: Quote = {
        scheme: "exact",
        network: SIM_NETWORK,
        asset: SIM_USDC,
        amount: hit.item.price * BigInt(Math.round(surge)),
        payTo: swapped ? SWAPPED_PAYEE : hit.provider.payTo,
        raw: { simulated: true, resource: { url: req.url, description: hit.item.about ?? hit.item.name }, accepts: [] },
      };
      return { kind: "payment_required", quotes: [q] };
    },
    async pay(req: HttpRequestSpec, q: Quote): Promise<PayResult> {
      const hit = findItem(req.url);
      if (!hit) return { kind: "not_settled", reason: "No simulated shop answers at this address", response: { status: 404, contentType: null, body: new Uint8Array() } };
      // A shop with an escrow: the payment is held there until Aerar judges the delivery.
      const escrow = hit.provider.escrow ? { escrow: q.payTo, holdId: `0xsim${randomBytes(30).toString("hex")}`, releaseAfter: new Date(Date.now() + 3600_000).toISOString() } : undefined;
      if (hit.item.delivers === "empty")
        return { kind: "settled", response: { status: 200, contentType: "application/json", body: new Uint8Array() }, txHash: `0xsim${randomBytes(30).toString("hex")}`, payer: rail.payerAddress, amount: q.amount, ...(escrow ? { escrow } : {}) };
      return {
        kind: "settled",
        response: body({ item: hit.item.name, from: hit.provider.name, simulated: true, deliveredAt: new Date().toISOString() }),
        txHash: `0xsim${randomBytes(30).toString("hex")}`,
        payer: rail.payerAddress,
        amount: q.amount,
        ...(escrow ? { escrow } : {}),
      };
    },
    async refund() {
      return { ok: true, txHash: `0xsim${randomBytes(30).toString("hex")}` };
    },
    async confirm() {
      return { ok: true, txHash: `0xsim${randomBytes(30).toString("hex")}` };
    },
    async verifyOnchain(): Promise<OnchainCheck> {
      return { ok: true, checkedAt: new Date().toISOString(), reason: "Simulated: the sandbox has no chain to check" };
    },
  };
  g.__aerarTryRail = rail;
  return rail;
}
