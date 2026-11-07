import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, decodeEventLog, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { VaultRefused, vaultSigner } from "@/lib/vault/chain";
import type { CapturedResponse, HttpRequestSpec, OnchainCheck, PaymentRail, PayResult, Quote, QuoteResult } from "./rail";

export const BASE_SEPOLIA = "eip155:84532";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TIMEOUT_MS = 30_000;
const MAX_BODY = 512 * 1024;

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

async function capture(res: Response): Promise<CapturedResponse> {
  const buf = new Uint8Array(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    body: buf.byteLength > MAX_BODY ? buf.slice(0, MAX_BODY) : buf,
  };
}

function toRequest(req: HttpRequestSpec, extra: Record<string, string> = {}): Request {
  return new Request(req.url, {
    method: req.method,
    body: req.body ?? undefined,
    headers: { ...(req.body ? { "content-type": "application/json" } : {}), ...req.headers, ...extra },
    redirect: "error", // a redirect could move the purchase to a host the policy never saw
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** x402 v2 answers a rejected payment with a fresh 402 whose `error` says why (e.g. insufficient_funds). */
function rejectionReason(http: x402HTTPClient, res: Response, captured: CapturedResponse): string | null {
  if (res.status !== 402) return null;
  try {
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(captured.body));
    } catch {
      body = undefined;
    }
    const pr = http.getPaymentRequiredResponse((n) => res.headers.get(n), body);
    return pr.error ? `Provider rejected the payment: ${pr.error}` : null;
  } catch {
    return null;
  }
}

export function toQuote(r: PaymentRequirements, raw: PaymentRequired): Quote {
  return { scheme: r.scheme, network: r.network, asset: r.asset, amount: BigInt(r.amount), payTo: r.payTo, raw };
}

/**
 * x402 on Base Sepolia. The private key lives only on the server; agents never see it.
 * Refuses to run against anything but Base Sepolia — there is no mainnet switch in this build.
 */
export function createX402Rail(opts: { privateKey: Hex; rpcUrl?: string; fetch?: typeof fetch; vault?: { address: Hex; mandateId: Hex } }): PaymentRail {
  const f = opts.fetch ?? fetch;
  const account = privateKeyToAccount(opts.privateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(opts.rpcUrl) });
  if (baseSepolia.id !== 84532) throw new Error("Aerar only settles on Base Sepolia in this build");
  // With a Vault, the money comes from the user's own contract and every payment must pass its on-chain mandate.
  const payer = opts.vault ? opts.vault.address : account.address;
  const signer = opts.vault
    ? toClientEvmSigner(vaultSigner(opts.vault.address, opts.vault.mandateId) as unknown as Parameters<typeof toClientEvmSigner>[0], publicClient)
    : toClientEvmSigner(account, publicClient);

  return {
    id: "x402",
    network: BASE_SEPOLIA,
    asset: BASE_SEPOLIA_USDC,
    scheme: "exact",
    payerAddress: payer,

    async quote(req: HttpRequestSpec): Promise<QuoteResult> {
      const res = await f(toRequest(req));
      if (res.status !== 402) return { kind: "free", response: await capture(res) };
      let body: unknown;
      try {
        const t = await res.text();
        body = t ? JSON.parse(t) : undefined;
      } catch {
        body = undefined;
      }
      const http = new x402HTTPClient(new x402Client());
      const pr = http.getPaymentRequiredResponse((n) => res.headers.get(n), body);
      return { kind: "payment_required", quotes: pr.accepts.map((a) => toQuote(a, pr)) };
    },

    async pay(req: HttpRequestSpec, quote: Quote): Promise<PayResult> {
      const pr = quote.raw as PaymentRequired;
      // Bind the payment to exactly the requirement the policy approved. If the provider's offer list
      // doesn't contain it any more, refuse rather than let the SDK pick another option.
      const chosen = pr.accepts.find(
        (a) =>
          a.scheme === quote.scheme &&
          a.network === quote.network &&
          a.asset.toLowerCase() === quote.asset.toLowerCase() &&
          a.payTo.toLowerCase() === quote.payTo.toLowerCase() &&
          BigInt(a.amount) === quote.amount,
      );
      if (!chosen) return { kind: "not_settled", reason: "APPROVED_QUOTE_NOT_OFFERED", response: { status: 0, contentType: null, body: new Uint8Array() } };
      const client = new x402Client().register(BASE_SEPOLIA, new ExactEvmScheme(signer));
      const http = new x402HTTPClient(client);
      let payload: Awaited<ReturnType<typeof client.createPaymentPayload>>;
      try {
        payload = await client.createPaymentPayload({ ...pr, accepts: [chosen] });
      } catch (e) {
        if (e instanceof VaultRefused) return { kind: "not_settled", reason: e.message, response: { status: 0, contentType: null, body: new Uint8Array() } };
        throw e;
      }
      const headers = http.encodePaymentSignatureHeader(payload);
      let res: Response;
      try {
        res = await f(toRequest(req, headers));
      } catch (e) {
        return { kind: "unknown", reason: `Request failed after payment was signed: ${(e as Error).message}` };
      }
      const response = await capture(res);
      let settle: ReturnType<x402HTTPClient["getPaymentSettleResponse"]> | null = null;
      try {
        settle = http.getPaymentSettleResponse((n) => res.headers.get(n));
      } catch {
        settle = null;
      }
      if (res.ok && settle?.success && settle.transaction)
        return {
          kind: "settled",
          response,
          txHash: settle.transaction,
          payer: settle.payer ?? null,
          amount: settle.amount ? BigInt(settle.amount) : null,
        };
      if (res.ok && !settle)
        return { kind: "unknown", reason: "Provider returned 2xx without a settlement receipt" };
      return {
        kind: "not_settled",
        response,
        reason: settle?.errorReason ?? rejectionReason(http, res, response) ?? `Provider responded ${res.status}`,
      };
    },

    async verifyOnchain(txHash: string, expect: { payTo: string; amount: bigint }): Promise<OnchainCheck> {
      const checkedAt = new Date().toISOString();
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 45_000 });
        if (receipt.status !== "success") return { ok: false, checkedAt, reason: "Transaction reverted" };
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase()) continue;
          try {
            const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
            const { from, to, value } = ev.args;
            if (
              from.toLowerCase() === payer.toLowerCase() &&
              to.toLowerCase() === expect.payTo.toLowerCase() &&
              value === expect.amount
            )
              return { ok: true, checkedAt, blockNumber: receipt.blockNumber.toString(), from, to, amount: value.toString() };
          } catch {
            /* not a Transfer */
          }
        }
        return { ok: false, checkedAt, reason: opts.vault ? "No matching USDC transfer from the Vault to the payee in this transaction" : "No matching USDC transfer from Aerar's wallet to the payee in this transaction" };
      } catch (e) {
        return { ok: false, checkedAt, reason: `Could not read transaction: ${(e as Error).message}` };
      }
    },
  };
}
