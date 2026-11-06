// Per-process wiring for route handlers: database + payment rail. Tests swap this out with setTestContext.
import { getDb } from "@/db";
import { PurchaseError, type Ctx } from "@/lib/purchase/pipeline";
import type { PaymentRail } from "@/lib/x402/rail";
import { createX402Rail } from "@/lib/x402/x402-rail";

const g = globalThis as unknown as { __aerarRail?: PaymentRail; __aerarTestCtx?: Ctx | null };

/** Built once per process. The private key is read here and never returned, logged or put in an error. */
function rail(): PaymentRail {
  if (!g.__aerarRail) {
    const key = process.env.PAYER_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
      throw new PurchaseError("PAYMENTS_NOT_CONFIGURED", "This deployment has no payer wallet configured", 503);
    g.__aerarRail = createX402Rail({ privateKey: key as `0x${string}`, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || undefined });
  }
  return g.__aerarRail;
}

export async function getContext(): Promise<Ctx> {
  if (g.__aerarTestCtx) return g.__aerarTestCtx;
  return { db: await getDb(), rail: rail(), allowInsecureHttp: process.env.AERAR_ALLOW_INSECURE_HTTP === "1" };
}

/** Database only, for routes that never pay (dashboards, audit). Works even without a payer wallet. */
export async function getDbOnly() {
  if (g.__aerarTestCtx) return g.__aerarTestCtx.db;
  return getDb();
}

export function setTestContext(ctx: Ctx | null) {
  g.__aerarTestCtx = ctx;
}

/** The single workspace the operator password unlocks. */
export function operatorOrgId(): string {
  return process.env.AERAR_ORG_ID || "org_demo";
}
