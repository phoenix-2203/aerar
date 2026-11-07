// Wallet workspaces: sign in with your own wallet, get a private workspace (org, one task, one agent) whose payments
// come out of your own Aerar Vault. Same signed-cookie pattern as the try-it sandbox.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getAddress, verifyMessage, type Hex } from "viem";
import type { Db } from "@/db";
import { agents, orgMembers, organisations, taskAgents, tasks, type MemberRole, type PolicyRules } from "@/db/schema";
import { PurchaseError, type Ctx } from "@/lib/purchase/pipeline";
import { getDb } from "@/db";
import { authenticateAgent, createAgent, createOrg, createTask } from "@/lib/workspace";
import { createX402Rail } from "@/lib/x402/x402-rail";
import { mandateIdFor, vaultOf } from "@/lib/vault/chain";

export const WALLET_COOKIE = "aerar_wallet";
export const WALLET_TTL_SECONDS = 7 * 24 * 3600;
export const isWalletOrg = (orgId: string) => orgId.startsWith("org_w_");
export const walletOrgId = (owner: string) => `org_w_${owner.toLowerCase().slice(2)}`;
export const ownerOfOrg = (orgId: string) => getAddress(`0x${orgId.slice("org_w_".length)}`);

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new PurchaseError("AUTH_NOT_CONFIGURED", "SESSION_SECRET must be set (32+ characters)", 503);
  return s;
}
const mac = (kind: string, payload: string) => createHmac("sha256", secret()).update(`${kind}:${payload}`).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The demo provider is the only shop wallet workspaces buy from: real x402, real USDC. */
export function demoHost(): string {
  return process.env.DEMO_PROVIDER_HOST || "aerar.duckdns.org";
}

export const DEFAULT_WALLET_BUDGET = 2_000_000n; // $2.00
export function defaultWalletRules(): PolicyRules {
  return {
    allowedProviders: [demoHost()],
    maxPerPurchase: "1000000",
    approvalAbove: "250000",
    maxPurchasesPerHour: 20,
    reuseWindowSeconds: 3600,
    expiresAt: null,
    allowedItems: [],
  };
}

// ---------------------------------------------------------------- sign-in

/** A sign-in message the server can check later without storing anything: timestamp + nonce + MAC. */
export function signInMessage(address: string): string {
  const owner = getAddress(address);
  const ts = Date.now();
  const nonce = randomBytes(9).toString("base64url");
  const tag = mac("signin", `${owner}.${ts}.${nonce}`).slice(0, 22);
  return [
    "Sign in to Aerar with this wallet.",
    "",
    "This only proves you own the address. It costs nothing and can't move funds.",
    "",
    `Wallet: ${owner}`,
    `Network: Base Sepolia (84532)`,
    `Nonce: ${ts}.${nonce}.${tag}`,
  ].join("\n");
}

export async function checkSignIn(message: string, signature: Hex): Promise<Hex | null> {
  const owner = /^Wallet: (0x[0-9a-fA-F]{40})$/m.exec(message)?.[1];
  const n = /^Nonce: (\d+)\.([\w-]+)\.([\w-]+)$/m.exec(message);
  if (!owner || !n) return null;
  const [, ts, nonce, tag] = n;
  if (Date.now() - Number(ts) > 10 * 60_000) return null;
  if (!same(tag, mac("signin", `${getAddress(owner)}.${ts}.${nonce}`).slice(0, 22))) return null;
  const ok = await verifyMessage({ address: getAddress(owner), message, signature }).catch(() => false);
  return ok ? getAddress(owner) : null;
}

// ---------------------------------------------------------------- session

export interface WalletSession {
  /** The wallet that signed in (proven by signature). */
  owner: Hex;
  /** The workspace being used: the wallet's own, or a team it was invited to. */
  orgId: string;
  role: MemberRole;
  taskId: string;
  /** Only the workspace owner gets the agent and its key. */
  agentId: string;
  apiKey: string;
}

export function encodeWalletSession(s: WalletSession): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${mac("wallet", payload)}`;
}

export function decodeWalletSession(token: string | undefined): WalletSession | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !same(sig, mac("wallet", payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as WalletSession;
    if (!isWalletOrg(s.orgId)) return null;
    if (s.role === "owner") return walletOrgId(s.owner) === s.orgId ? s : null;
    return s.role === "approver" || s.role === "viewer" ? s : null;
  } catch {
    return null;
  }
}

/**
 * The workspace agent's key, derived from the server secret: the same on every sign-in and device, so a Claude or
 * ChatGPT connector set up once keeps working. Never stored; only its hash is.
 */
function walletAgentKey(orgId: string): string {
  return `aer_w${mac("wallet-agent", orgId).slice(0, 32)}`;
}

/** First sign-in creates the workspace (org, task, agent); later sign-ins reopen it. */
export async function openWalletWorkspace(db: Db, owner: Hex): Promise<WalletSession> {
  const orgId = walletOrgId(owner);
  const apiKey = walletAgentKey(orgId);
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  if (!org) {
    await createOrg(db, `Wallet ${owner.slice(0, 6)}…${owner.slice(-4)}`, orgId);
    const { agent } = await createAgent(db, orgId, "my-agent", "Your agent, paying from your Vault", apiKey);
    const task = await createTask(db, {
      orgId,
      title: "Your research task",
      purpose: "Overnight market research: buy reports, reuse what's already bought, ask before anything big.",
      expectedDeliverable: "A short market memo",
      budget: DEFAULT_WALLET_BUDGET,
      rules: defaultWalletRules(),
      agentIds: [agent.id],
      createdBy: owner,
    });
    return { owner, orgId, role: "owner", taskId: task.id, agentId: agent.id, apiKey };
  }
  const [task] = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).limit(1);
  const live = await authenticateAgent(db, apiKey);
  if (live) return { owner, orgId, role: "owner", taskId: task.id, agentId: live.id, apiKey };
  // Workspaces from before keys were derived: retire the old random key and switch to the stable one.
  const [old] = await db.select().from(agents).where(and(eq(agents.orgId, orgId), isNull(agents.revokedAt)));
  if (old) await db.update(agents).set({ revokedAt: new Date() }).where(eq(agents.id, old.id));
  const { agent } = await createAgent(db, orgId, "my-agent", "Your agent, paying from your Vault", apiKey);
  await db.insert(taskAgents).values({ taskId: task.id, agentId: agent.id });
  return { owner, orgId, role: "owner", taskId: task.id, agentId: agent.id, apiKey };
}

// ---------------------------------------------------------------- teams

/** Workspaces this wallet was invited to, with its role in each. */
export async function membershipsOf(db: Db, address: Hex) {
  const rows = await db.select().from(orgMembers).where(eq(orgMembers.address, address.toLowerCase()));
  return rows.map((r) => ({ orgId: r.orgId, role: r.role, owner: ownerOfOrg(r.orgId) }));
}

/** Open a teammate's workspace as an invited member (no agent key: only the owner's agent buys). */
export async function openAsMember(db: Db, address: Hex, orgId: string): Promise<WalletSession | null> {
  const [m] = await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.address, address.toLowerCase())));
  if (!m) return null;
  const [task] = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).limit(1);
  if (!task) return null;
  return { owner: address, orgId, role: m.role, taskId: task.id, agentId: "", apiKey: "" };
}

/** Is this wallet still allowed to act in this workspace with at least this role? (Membership can be revoked.) */
export async function stillMember(db: Db, s: WalletSession, need: MemberRole[]): Promise<boolean> {
  if (s.role === "owner") return need.includes("owner") && walletOrgId(s.owner) === s.orgId;
  const [m] = await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, s.orgId), eq(orgMembers.address, s.owner.toLowerCase())));
  return !!m && need.includes(m.role);
}

// ---------------------------------------------------------------- payments

/** The pipeline context for a wallet workspace: payments come from the owner's Vault, under its on-chain mandate. */
export async function walletContext(orgId: string): Promise<Ctx> {
  const key = process.env.PAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new PurchaseError("PAYMENTS_NOT_CONFIGURED", "This deployment has no operator wallet configured", 503);
  const db = await getDb();
  const owner = ownerOfOrg(orgId);
  const vault = await vaultOf(owner);
  if (!vault) throw new PurchaseError("NO_VAULT", "This wallet has no Aerar Vault yet. Create one at /vault.", 409);
  const [task] = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).limit(1);
  if (!task) throw new PurchaseError("NO_TASK", "This wallet workspace has no task", 409);
  return {
    db,
    rail: createX402Rail({ privateKey: key as Hex, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || undefined, vault: { address: vault, mandateId: mandateIdFor(task.id) } }),
    allowInsecureHttp: process.env.AERAR_ALLOW_INSECURE_HTTP === "1",
  };
}
