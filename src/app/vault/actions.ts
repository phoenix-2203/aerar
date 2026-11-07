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
import { and, eq } from "drizzle-orm";
import { orgMembers, policies, tasks, type MemberRole } from "@/db/schema";
import { updatePolicy } from "@/lib/workspace";
import { fmt$ } from "@/lib/money/usdc";
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
  membershipsOf,
  openAsMember,
  ownerOfOrg,
  stillMember,
  walletContext,
  walletOrgId,
  type WalletSession,
} from "@/lib/wallet/session";

export type VaultResult = { error?: string; done?: string; ids?: string[]; code?: string } | undefined;

/** A payee nobody listed: what a hijacked agent or a compromised Aerar would try to pay. */
const ATTACKER = "0xbad00000000000000000000000000000000bad00" as Hex;

async function session(): Promise<WalletSession | null> {
  return decodeWalletSession((await cookies()).get(WALLET_COOKIE)?.value);
}

/** The session, if the signed-in wallet still holds one of these roles in its current workspace. */
async function as(roles: MemberRole[]): Promise<WalletSession | null> {
  const s = await session();
  if (!s) return null;
  return (await stillMember(await getDbOnly(), s, roles)) ? s : null;
}
const OWNER_ONLY = "Only the workspace owner can do that.";

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

export interface ProviderView {
  host: string;
  payTo: Hex;
  demo: boolean;
}

export interface VaultView {
  owner: Hex;
  vault: VaultState | null;
  payTo: Hex;
  providers: ProviderView[];
  error?: string;
}

async function currentRules(s: WalletSession) {
  const db = await getDbOnly();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, s.taskId), eq(tasks.orgId, s.orgId)));
  if (!task) throw new PurchaseError("NO_TASK", "Your workspace has no task", 409);
  const [pol] = await db.select().from(policies).where(and(eq(policies.taskId, task.id), eq(policies.version, task.currentPolicyVersion)));
  return { db, task, rules: pol.rules };
}

/** Providers this workspace trusts: the demo shop, plus every host the owner added (with its payee address). */
async function trustedProviders(s: WalletSession): Promise<ProviderView[]> {
  const { rules } = await currentRules(s);
  const demo: ProviderView = { host: demoHost(), payTo: demoPayTo(), demo: true };
  const extra = Object.entries(rules.payees ?? {})
    .filter(([h]) => h !== demo.host && rules.allowedProviders.includes(h))
    .map(([host, payTo]) => ({ host, payTo: getAddress(payTo), demo: false }));
  return rules.allowedProviders.includes(demo.host) ? [demo, ...extra] : extra;
}

/** On-chain state of the signed-in wallet's Vault (read fresh from Base Sepolia). */
export async function vaultState(): Promise<VaultView | null> {
  const s = await session();
  if (!s) return null;
  const payTo = demoPayTo();
  let providers: ProviderView[] = [];
  try {
    providers = await trustedProviders(s);
    const v = await vaultOf(ownerOfOrg(s.orgId));
    return { owner: ownerOfOrg(s.orgId), payTo, providers, vault: v ? await readVault(v, mandateIdFor(s.taskId), [...new Set([payTo, ...providers.map((p) => p.payTo), ATTACKER])]) : null };
  } catch (e) {
    return { owner: ownerOfOrg(s.orgId), payTo, providers, vault: null, error: `Couldn't read Base Sepolia: ${msg(e)}` };
  }
}

const ITEMS: Record<string, { path: string; purpose: string }> = {
  report: { path: "/api/demo/report?topic=AI+agents", purpose: "Market report on AI agents for the overnight memo" },
  premium: { path: "/api/demo/premium?topic=AI+agents", purpose: "Premium report with deeper numbers for the memo" },
};

/** The agent buys from the real x402 demo shop; the money comes from the visitor's Vault. */
export async function vaultBuy(item: string): Promise<VaultResult> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
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
  const s = await as(["owner", "approver"]);
  if (!s) return { error: "Only the owner or an approver can decide." };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const ctx = await walletContext(s.orgId);
    await requirePurchaseInOrg(ctx.db, s.orgId, id);
    if (kind === "approve") await approvePurchase(ctx, id, s.owner);
    else await rejectPurchase(ctx, id, s.owner, s.role === "owner" ? "Declined by the owner" : "Declined by an approver");
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
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const v = await vaultOf(ownerOfOrg(s.orgId));
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

// ------------------------------------------------------------------ trusted providers

const hostOf = (u: URL) => u.host.toLowerCase();

/** Ask an x402 resource for its price and payee, without paying. */
export async function inspectProvider(url: string): Promise<{ error?: string; host?: string; payTo?: Hex; price?: string; url?: string }> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  const lim = await limited();
  if (lim) return { error: lim };
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { error: "That isn't a URL." };
  }
  if (u.protocol !== "https:" && process.env.AERAR_ALLOW_INSECURE_HTTP !== "1") return { error: "Use an https:// URL." };
  try {
    const ctx = await walletContext(s.orgId);
    const q = await ctx.rail.quote({ url: u.toString(), method: "GET", headers: {}, body: null });
    if (q.kind === "free") return { error: "That URL didn't ask for payment, so there's nothing for the Vault to pay." };
    const usdc = q.quotes.find((x) => x.network === "eip155:84532" && x.asset.toLowerCase() === "0x036cbd53842c5426634e7929541ec2318f3dcf7e");
    if (!usdc) return { error: "That provider doesn't accept USDC on Base Sepolia." };
    return { host: hostOf(u), payTo: getAddress(usdc.payTo), price: fmt$(usdc.amount), url: u.toString() };
  } catch (e) {
    return { error: `Couldn't get a quote: ${msg(e)}` };
  }
}

/** After the owner allowed the payee in their Vault (wallet transaction), allow the host in the task's rules too. */
export async function trustProvider(host: string, payTo: string): Promise<VaultResult> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  try {
    const { db, task, rules } = await currentRules(s);
    const h = host.trim().toLowerCase();
    await updatePolicy(
      db,
      task.id,
      { ...rules, allowedProviders: [...new Set([...rules.allowedProviders, h])], payees: { ...(rules.payees ?? {}), [h]: getAddress(payTo) } },
      s.owner,
      `Trusted ${h}`,
    );
    refresh();
    return { done: `${h} is trusted.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function untrustProvider(host: string): Promise<VaultResult> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  try {
    const { db, task, rules } = await currentRules(s);
    const h = host.trim().toLowerCase();
    const payees = { ...(rules.payees ?? {}) };
    delete payees[h];
    await updatePolicy(db, task.id, { ...rules, allowedProviders: rules.allowedProviders.filter((x) => x !== h), payees }, s.owner, `Stopped trusting ${h}`);
    refresh();
    return { done: `${h} removed.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** The agent buys any URL; Aerar's rules and the Vault decide. */
export async function vaultBuyUrl(url: string, purpose: string): Promise<VaultResult> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const ctx = await walletContext(s.orgId);
    const p = await submitPurchase(ctx, s.agentId, {
      taskId: s.taskId,
      url: url.trim(),
      method: "GET",
      body: null,
      purpose: purpose.trim() || "Requested from the Vault page",
      idempotencyKey: `vault-${randomBytes(8).toString("hex")}`,
    });
    refresh();
    return { done: p.status, ids: [p.id] };
  } catch (e) {
    return { error: msg(e) };
  }
}

// ------------------------------------------------------------------ team

const setCookie = async (s: WalletSession) =>
  (await cookies()).set(WALLET_COOKIE, encodeWalletSession(s), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: WALLET_TTL_SECONDS });

export interface TeamView {
  role: MemberRole;
  workspaceOwner: Hex;
  members: { address: Hex; role: MemberRole }[];
  /** Other workspaces this wallet can open. */
  workspaces: { orgId: string; owner: Hex; role: MemberRole; current: boolean }[];
}

export async function teamState(): Promise<TeamView | null> {
  const s = await session();
  if (!s) return null;
  const db = await getDbOnly();
  const rows = await db.select().from(orgMembers).where(eq(orgMembers.orgId, s.orgId));
  const mine = await membershipsOf(db, s.owner);
  return {
    role: s.role,
    workspaceOwner: ownerOfOrg(s.orgId),
    members: rows.map((r) => ({ address: getAddress(r.address), role: r.role })),
    workspaces: [
      { orgId: walletOrgId(s.owner), owner: s.owner, role: "owner" as MemberRole, current: s.orgId === walletOrgId(s.owner) },
      ...mine.map((m) => ({ orgId: m.orgId, owner: m.owner, role: m.role, current: m.orgId === s.orgId })),
    ],
  };
}

export async function addMember(address: string, role: MemberRole): Promise<VaultResult> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  const lim = await limited();
  if (lim) return { error: lim };
  if (role !== "approver" && role !== "viewer") return { error: "Pick approver or viewer." };
  let a: Hex;
  try {
    a = getAddress(address.trim());
  } catch {
    return { error: "That isn't a wallet address." };
  }
  if (a.toLowerCase() === s.owner.toLowerCase()) return { error: "That's you: you're already the owner." };
  const db = await getDbOnly();
  if ((await db.select().from(orgMembers).where(eq(orgMembers.orgId, s.orgId))).length >= 20) return { error: "A workspace can have up to 20 teammates." };
  await db
    .insert(orgMembers)
    .values({ orgId: s.orgId, address: a.toLowerCase(), role, addedBy: s.owner })
    .onConflictDoUpdate({ target: [orgMembers.orgId, orgMembers.address], set: { role } });
  refresh();
  return { done: `Added ${a.slice(0, 6)}…${a.slice(-4)} as ${role}.` };
}

export async function removeMember(address: string): Promise<VaultResult> {
  const s = await as(["owner"]);
  if (!s) return { error: OWNER_ONLY };
  await (await getDbOnly()).delete(orgMembers).where(and(eq(orgMembers.orgId, s.orgId), eq(orgMembers.address, address.toLowerCase())));
  refresh();
  return { done: "Removed." };
}

/** Switch between your own workspace and teams you were invited to. */
export async function switchWorkspace(orgId: string): Promise<VaultResult> {
  const s = await session();
  if (!s) return { error: "Sign in with your wallet first." };
  const db = await getDbOnly();
  try {
    const next = orgId === walletOrgId(s.owner) ? await openWalletWorkspace(db, s.owner) : await openAsMember(db, s.owner, orgId);
    if (!next) return { error: "You're not a member of that workspace any more." };
    await setCookie(next);
    refresh();
    return { done: "Switched." };
  } catch (e) {
    return { error: msg(e) };
  }
}
