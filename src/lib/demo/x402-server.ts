// The demo *provider* side: an x402 resource server inside this app, so judges have something real to buy.
// It is a separate role from Aerar (the buyer). It only needs a payee address, never a private key.
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";
import { BASE_SEPOLIA, BASE_SEPOLIA_USDC } from "@/lib/x402/x402-rail";

type Handler = (req: NextRequest) => Promise<NextResponse>;

const g = globalThis as unknown as { __aerarDemoServer?: x402ResourceServer };

function resourceServer(): x402ResourceServer {
  if (!g.__aerarDemoServer) {
    const facilitator = new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator" });
    g.__aerarDemoServer = new x402ResourceServer(facilitator).register(BASE_SEPOLIA, new ExactEvmScheme());
  }
  return g.__aerarDemoServer;
}

export function demoPayTo(): `0x${string}` {
  const a = process.env.DEMO_PAYTO_ADDRESS;
  if (!a || !/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error("DEMO_PAYTO_ADDRESS is not set to a valid address");
  return a as `0x${string}`;
}

/**
 * Wrap a handler so it costs `priceUsdc` (e.g. "0.10") on Base Sepolia, exact scheme, USDC.
 * Built lazily on first request so a missing env var fails that request, not the build.
 * withX402 settles only after the handler returns < 400, so a bad request is never charged.
 */
export function paidDemoRoute(priceUsdc: string, description: string, handler: Handler): Handler {
  let wrapped: Handler | null = null;
  return async (req) => {
    try {
      wrapped ??= withX402(
        handler,
        {
          accepts: [
            {
              scheme: "exact",
              price: { amount: toAtomic(priceUsdc), asset: BASE_SEPOLIA_USDC, extra: { name: "USDC", version: "2" } },
              network: BASE_SEPOLIA,
              payTo: demoPayTo(),
            },
          ],
          description,
          mimeType: "application/json",
        },
        resourceServer(),
      ) as Handler;
    } catch (e) {
      return NextResponse.json({ error: "DEMO_PROVIDER_MISCONFIGURED", message: (e as Error).message }, { status: 503 });
    }
    return wrapped(req);
  };
}

function toAtomic(usdc: string): string {
  const [w, f = ""] = usdc.split(".");
  return (BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, "0").slice(0, 6))).toString();
}
