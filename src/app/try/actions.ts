"use server";
// Try-it sandbox actions. Each one reads the visitor's signed sandbox cookie and only ever touches that sandbox.
import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { approvePurchase, PurchaseError, rejectPurchase, submitPurchase } from "@/lib/purchase/pipeline";
import { requirePurchaseInOrg } from "@/lib/server/queries";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { parseUsdc } from "@/lib/money/usdc";
import { PRESETS, TRY_PROVIDERS } from "@/lib/try/catalog";
import { createTrySandbox, decodeSession, DEFAULT_TRY_BUDGET, DEFAULT_TRY_RULES, encodeSession, TRY_COOKIE, TRY_TTL_SECONDS, tryContext, type TrySession } from "@/lib/try/sandbox";
import { setBudget, updatePolicy } from "@/lib/workspace";
import { policies, tasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type TryResult = { error?: string; done?: string; ids?: string[] } | undefined;

async function ip() {
  return clientIp(await headers());
}

async function session(): Promise<TrySession | null> {
  return decodeSession((await cookies()).get(TRY_COOKIE)?.value);
}

async function limited(): Promise<string | null> {
  const r = publicLimits().tryActions.check(await ip());
  return r.ok ? null : `That's a lot of clicks. Try again in ${r.retryAfter} seconds.`;
}

const msg = (e: unknown) => (e instanceof PurchaseError ? e.message : "Something went wrong. Try again.");

export async function startSandbox(): Promise<TryResult> {
  const r = publicLimits().trySandboxes.check(await ip());
  if (!r.ok) return { error: `You've made several sandboxes recently. Try again in ${Math.ceil(r.retryAfter / 60)} minutes.` };
  try {
    const ctx = await tryContext();
    const s = await createTrySandbox(ctx.db);
    (await cookies()).set(TRY_COOKIE, encodeSession(s), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TRY_TTL_SECONDS,
    });
    refresh();
    return { done: "Your sandbox is ready." };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function resetSandbox(): Promise<void> {
  (await cookies()).delete(TRY_COOKIE);
  refresh();
}

/** Run a preset (one or more purchases) or a custom request, as the visitor's sandbox agent. */
export async function agentBuy(input: { preset?: string; url?: string; purpose?: string }): Promise<TryResult> {
  const s = await session();
  if (!s) return { error: "Your sandbox expired. Start a new one." };
  const lim = await limited();
  if (lim) return { error: lim };
  const steps = input.preset
    ? PRESETS.find((p) => p.id === input.preset)?.steps
    : input.url
      ? [{ url: input.url.trim(), purpose: (input.purpose ?? "").trim() || "Custom request" }]
      : undefined;
  if (!steps?.length) return { error: "Pick something for the agent to buy." };
  try {
    const ctx = await tryContext();
    const ids: string[] = [];
    for (const step of steps) {
      const p = await submitPurchase(ctx, s.agentId, {
        taskId: s.taskId,
        url: step.url,
        method: "GET",
        body: null,
        purpose: step.purpose,
        idempotencyKey: `try-${randomBytes(8).toString("hex")}`,
      });
      ids.push(p.id);
    }
    refresh();
    return { done: "Done", ids };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function decideTry(id: string, kind: "approve" | "reject"): Promise<TryResult> {
  const s = await session();
  if (!s) return { error: "Your sandbox expired. Start a new one." };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const ctx = await tryContext();
    await requirePurchaseInOrg(ctx.db, s.orgId, id);
    if (kind === "approve") await approvePurchase(ctx, id, "you");
    else await rejectPurchase(ctx, id, "you", "Declined in the sandbox");
    refresh();
    return { done: kind === "approve" ? "Approved" : "Declined", ids: [id] };
  } catch (e) {
    return { error: msg(e) };
  }
}

export interface RulesForm {
  budget: string;
  approvalAbove: string;
  maxPerPurchase: string;
  providers: string[];
  shoppingList: boolean;
  items: string[];
}

/** Save the visitor's rules as a new policy version (old versions are kept, like the real dashboard). */
export async function saveRules(f: RulesForm): Promise<TryResult> {
  const s = await session();
  if (!s) return { error: "Your sandbox expired. Start a new one." };
  const lim = await limited();
  if (lim) return { error: lim };
  try {
    const budget = parseUsdc(f.budget);
    const approvalAbove = parseUsdc(f.approvalAbove);
    const maxPerPurchase = parseUsdc(f.maxPerPurchase);
    if (budget <= 0n || budget > 100_000_000n) return { error: "Budget must be between $0.01 and $100." };
    if (maxPerPurchase > budget) return { error: "The per-purchase limit can't be above the budget." };
    const hosts = TRY_PROVIDERS.map((p) => p.host);
    const providers = f.providers.filter((h) => hosts.includes(h));
    const known = new Set(TRY_PROVIDERS.flatMap((p) => p.items.map((i) => `${p.host}${i.path}`)));
    const items = f.shoppingList ? f.items.filter((i) => known.has(i)) : [];
    if (f.shoppingList && items.length === 0) return { error: "Tick at least one item for the shopping list, or turn it off." };
    const ctx = await tryContext();
    const [task] = await ctx.db.select().from(tasks).where(and(eq(tasks.id, s.taskId), eq(tasks.orgId, s.orgId)));
    if (!task) return { error: "Your sandbox expired. Start a new one." };
    const [cur] = await ctx.db.select().from(policies).where(and(eq(policies.taskId, task.id), eq(policies.version, task.currentPolicyVersion)));
    await updatePolicy(
      ctx.db,
      task.id,
      { ...DEFAULT_TRY_RULES, ...cur.rules, allowedProviders: providers, approvalAbove: approvalAbove.toString(), maxPerPurchase: maxPerPurchase.toString(), allowedItems: items },
      "you",
      "Changed in the sandbox",
    );
    if (budget !== task.budget) await setBudget(ctx.db, task.id, budget || DEFAULT_TRY_BUDGET, "you");
    refresh();
    return { done: "Rules saved as a new version." };
  } catch (e) {
    return { error: e instanceof Error && /USDC amount/.test(e.message) ? "Use plain dollar amounts, like 0.25." : msg(e) };
  }
}
