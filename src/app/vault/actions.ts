"use server";
// Wallet workspace actions. Wallet transactions (create, fund, set limits, pause, revoke, withdraw) are signed in the
// visitor's own wallet in the browser; these actions only sign in, run the agent, and read state.
import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { getAddress, type Hex } from "viem";
import { approvePurchase, PurchaseError, rejectPurchase, submitPurchase } from "@/lib/purchase/pipeline";
import { requirePurchaseInOrg } from "@/lib/server/queries";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { getDbOnly } from "@/lib/server/context";
import { demoPayTo } from "@/lib/demo/x402-server";
import { mandateIdFor, readVault, simulateAuthorize, vaultOf, VAULT_REFUSALS, type VaultState } from "@/lib/vault/chain";
import {
  checkSignIn,
  decodeWalletSession,
  demoHost,
  encodeWalletSession,
  openWalletWorkspace,
  signInMessage,
  WALLET_COOKIE,
  WALLET_TTL_SECONDS,
  walletContext,
  type WalletSession,
} from "@/lib/wallet/session";

export type VaultResult = { error?: string; done?: string; ids?: string[]; code?: string } | undefined;

/** A payee nobody listed: what a hijacked agent or a compromised Aerar would try to pay. */
const ATTACKER = "0xbad00000000000000000000000000000000bad00" as Hex;

async function session(): Promise<WalletSession | null> {
  return decodeWalletSession((await cookies()).get(WALLET_COOKIE)?.value);
}

async function limited(): Promise<string | null> {
  const r = publicLimits().tryActions.check(clientIp(await headers()));
  return r.ok ? null : `That's a lot of clicks. Try again in ${r.retryAfter} seconds.`;
}

const msg = (e: unknown) => (e instanceof PurchaseError ? e.message : e instanceof Error ? e.message.split("\n")[0] : "Something went wrong. Try again.");

export async function getSignInMessage(address: string): Promise<string> {
  return signInMessage(getAddress(address));
}

export async function signIn(message: string, signature: Hex): Promise<VaultResult> {
  const r = publicLimits().trySandboxes.check(clientIp(await headers()));
  if (!r.ok) return { error: `Too many sign-ins. Try again in ${Math.ceil(r.retryAfter / 60)} minutes.` };
  const owner = await checkSignIn(message, signature);
  if (!owner) return { error: "That signature didn't check out, or the message expired. Try again." };
  try {
    const s = await openWalletWorkspace(await getDbOnly(), owner);
    (await cookies()).set(WALLET_COOKIE, encodeWalletSession(s), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: WALLET_TTL_SECONDS,
    });
    refresh();
    return { done: "Signed in" };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(WALLET_COOKIE);
  refresh();
}

export interface VaultView {
  owner: Hex;
  vault: VaultState | null;
  payTo: Hex;
  error?: string;
}

/** On-chain state of the signed-in wallet's Vault (read fresh from Base Sepolia). */
export async function vaultState(): Promise<VaultView | null> {
  const s = await session();
  if (!s) return null;
  const payTo = demoPayTo();
  try {
    const v = await vaultOf(s.owner);
    return { owner: s.owner, payTo, vault: v ? await readVault(v, mandateIdFor(s.taskId), [payTo, ATTACKER]) : null };
  } catch (e) {
    return { owner: s.owner, payTo, vault: null, error: `Couldn't read Base Sepolia: ${msg(e)}` };
  }
}

const ITEMS: Record<string, { path: string; purpose: string }> = {
  report: { path: "/api/demo/report?topic=AI+agents", purpose: "Market report on AI agents for the overnight memo" },
  premium: { path: "/api/demo/premium?topic=AI+agents", purpose: "Premium report with deeper numbers for the memo" },
};

/** The agent buys from the real x402 demo shop; the money comes from the visitor's Vault. */
export async function vaultBuy(item: string): Promise<VaultResult> {
  const s = await session();
  if (!s) return { error: "Sign in with your wallet first." };
  const lim = await limited();
  if (lim) return { error: lim };
  const it =
    item === "fresh"
      ? { path: `/api/demo/report?topic=Overnight+update+${new Date().toISOString().slice(0, 16)}`, purpose: "This hour's market update (new data, can't be reused)" }
      : ITEMS[item];
  if (!it) return { error: "Pick something to buy." };
  try {
    const ctx = await walletContext(s.orgId);
    const p = await submitPurchase(ctx, s.agentId, {
      taskId: s.taskId,
      url: `${process.env.AERAR_ALLOW_INSECURE_HTTP === "1" ? "http" : "https"}://${demoHost()}${it.path}`,
      method: "GET",
      body: null,
      purpose: it.purpose,
      idempotencyKey: `vault-${randomBytes(8).toString("hex")}`,
    });
    refresh();
    return { done: p.status, ids: [p.id] };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function vaultDecide(id: string, kind: "approve" | "reject"): Promise<VaultResult> {
  const s = await session();
  if (!s) return { error: "Sign in with your wallet first." };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const ctx = await walletContext(s.orgId);
    await requirePurchaseInOrg(ctx.db, s.orgId, id);
    if (kind === "approve") await approvePurchase(ctx, id, s.owner);
    else await rejectPurchase(ctx, id, s.owner, "Declined by the owner");
    refresh();
    return { done: kind === "approve" ? "Approved" : "Declined", ids: [id] };
  } catch (e) {
    return { error: msg(e) };
  }
}

/**
 * "Pretend Aerar was hacked": ask the Vault, as Aerar's real operator key, to approve a payment Aerar's own rules
 * would never allow. Dry-run against the live contract, so nothing is sent and no gas is spent.
 */
export async function attackOwnVault(kind: "attacker" | "too-big"): Promise<VaultResult> {
  const s = await session();
  if (!s) return { error: "Sign in with your wallet first." };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const v = await vaultOf(s.owner);
    if (!v) return { error: "Create your Vault first." };
    const r =
      kind === "attacker"
        ? await simulateAuthorize(v, mandateIdFor(s.taskId), ATTACKER, 400_000n)
        : await simulateAuthorize(v, mandateIdFor(s.taskId), demoPayTo(), 50_000_000n);
    if (r.ok) return { error: "The Vault would have allowed it. Check your limits.", code: "ALLOWED" };
    return { done: VAULT_REFUSALS[r.code] ?? r.code, code: r.code };
  } catch (e) {
    return { error: msg(e) };
  }
}
