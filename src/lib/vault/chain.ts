// Aerar Vault on Base Sepolia: a user-owned USDC contract that only pays inside the limits its owner set on-chain.
// This module reads Vault state and builds the operator-side signer that x402 uses to pay from a Vault.
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { factoryAbi, vaultAbi } from "./artifacts";

export const ZERO = "0x0000000000000000000000000000000000000000" as const;
/** 32 bytes handed to x402 as the "signature". Never 65 bytes, so nothing mistakes it for an ECDSA signature; the
 *  Vault's isValidSignature ignores it and approves only digests it authorized itself. */
export const VAULT_SIGNATURE = keccak256(toHex("aerar-vault-v1"));

export function factoryAddress(): Hex | null {
  const a = process.env.VAULT_FACTORY_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Hex) : null;
}

/** One mandate per Aerar task. */
export const mandateIdFor = (taskId: string) => keccak256(toHex(`aerar-task:${taskId}`));

const g = globalThis as unknown as { __aerarVaultPublic?: PublicClient };
export function publicClient(): PublicClient {
  g.__aerarVaultPublic ??= createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL || undefined) }) as PublicClient;
  return g.__aerarVaultPublic;
}

function operatorKey(): Hex {
  const k = process.env.PAYER_PRIVATE_KEY;
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("This deployment has no operator wallet configured");
  return k as Hex;
}

/** Aerar's operator address: the only account a Vault lets call `authorize`. */
export function operatorAddress(): Hex {
  return privateKeyToAccount(operatorKey()).address;
}

export async function vaultOf(owner: Hex): Promise<Hex | null> {
  const f = factoryAddress();
  if (!f) return null;
  const v = (await publicClient().readContract({ address: f, abi: factoryAbi, functionName: "vaultOf", args: [owner] })) as Hex;
  return v === ZERO ? null : v;
}

export interface VaultState {
  address: Hex;
  owner: Hex;
  operator: Hex;
  operatorIsAerar: boolean;
  paused: boolean;
  balance: string;
  mandate: {
    id: Hex;
    active: boolean;
    maxPerPayment: string;
    periodLimit: string;
    period: number;
    expiresAt: number;
    spentTotal: string;
    leftInPeriod: string;
    payees: Record<string, boolean>;
  };
}

export async function readVault(vault: Hex, mandateId: Hex, payees: Hex[]): Promise<VaultState> {
  const c = publicClient();
  const read = <T>(functionName: string, args: unknown[] = []) =>
    c.readContract({ address: vault, abi: vaultAbi, functionName, args } as never) as Promise<T>;
  const [owner, operator, paused, m, rem, ...allowed] = await Promise.all([
    read<Hex>("owner"),
    read<Hex>("operator"),
    read<boolean>("paused"),
    read<readonly [bigint, bigint, bigint, bigint, bigint, boolean, bigint, bigint]>("mandates", [mandateId]),
    read<readonly [bigint, bigint]>("remaining", [mandateId]),
    ...payees.map((p) => read<boolean>("payeeAllowed", [mandateId, p])),
  ]);
  const [maxPerPayment, periodLimit, period, expiresAt, , active, , spentTotal] = m;
  return {
    address: vault,
    owner,
    operator,
    operatorIsAerar: operator.toLowerCase() === operatorAddress().toLowerCase(),
    paused,
    balance: rem[1].toString(),
    mandate: {
      id: mandateId,
      active,
      maxPerPayment: maxPerPayment.toString(),
      periodLimit: periodLimit.toString(),
      period: Number(period),
      expiresAt: Number(expiresAt),
      spentTotal: spentTotal.toString(),
      leftInPeriod: rem[0].toString(),
      payees: Object.fromEntries(payees.map((p, i) => [p.toLowerCase(), allowed[i] as boolean])),
    },
  };
}

/** The contract's own refusal, by error name ("PayeeNotAllowed"), or null if it wasn't a Vault revert. */
export function vaultRevert(e: unknown): string | null {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? "reverted";
  }
  return null;
}

export const VAULT_REFUSALS: Record<string, string> = {
  PayeeNotAllowed: "the Vault only pays the payees its owner listed",
  OverPerPaymentLimit: "over the Vault's per-payment limit",
  OverPeriodLimit: "over the Vault's daily limit",
  NoMandate: "the owner hasn't set limits for this task, or revoked them",
  MandateExpired: "the owner's mandate for this task has expired",
  VaultPaused: "the owner paused the Vault",
  NotOperator: "only Aerar's operator key may ask the Vault to pay",
  BadValidity: "the payment's validity window is too long",
  AlreadyApproved: "this exact payment was already approved",
};

export class VaultRefused extends Error {
  constructor(public readonly code: string) {
    super(`The Vault refused on-chain: ${VAULT_REFUSALS[code] ?? code}`);
  }
}

/**
 * Dry-run an `authorize` as Aerar's operator, against the live contract, without sending anything. Shows what the
 * chain itself would do if Aerar's server (or an attacker holding its key) asked for this payment.
 */
export async function simulateAuthorize(vault: Hex, mandateId: Hex, to: Hex, value: bigint): Promise<{ ok: true } | { ok: false; code: string }> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  try {
    await publicClient().simulateContract({
      account: operatorAddress(),
      address: vault,
      abi: vaultAbi,
      functionName: "authorize",
      args: [mandateId, to, value, 0n, now + 300n, keccak256(toHex(`sim-${now}-${Math.random()}`))],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: vaultRevert(e) ?? "reverted" };
  }
}

type TypedData = { message: Record<string, unknown> };

/**
 * An x402 client signer whose address is the Vault. "Signing" the EIP-3009 authorization means asking the Vault,
 * on-chain, to approve exactly that transfer; the Vault checks its mandate and records the spend. If the Vault says
 * no, nothing is approved and the payment can't settle.
 */
export function vaultSigner(vault: Hex, mandateId: Hex) {
  const account = privateKeyToAccount(operatorKey());
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL || undefined) });
  const pub = publicClient();
  return {
    address: vault,
    async signTypedData({ message }: TypedData): Promise<Hex> {
      const m = message as { from: Hex; to: Hex; value: bigint | string; validAfter: bigint | string; validBefore: bigint | string; nonce: Hex };
      if (m.from.toLowerCase() !== vault.toLowerCase()) throw new Error("Authorization is not from this Vault");
      try {
        const { request } = await pub.simulateContract({
          account,
          address: vault,
          abi: vaultAbi,
          functionName: "authorize",
          args: [mandateId, m.to, BigInt(m.value), BigInt(m.validAfter), BigInt(m.validBefore), m.nonce],
        });
        const hash = await wallet.writeContract(request);
        const r = await pub.waitForTransactionReceipt({ hash, timeout: 45_000 });
        if (r.status !== "success") throw new VaultRefused("reverted");
      } catch (e) {
        if (e instanceof VaultRefused) throw e;
        const code = vaultRevert(e);
        if (code) throw new VaultRefused(code);
        throw e;
      }
      return VAULT_SIGNATURE;
    },
  };
}
