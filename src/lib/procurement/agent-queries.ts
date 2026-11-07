// Read-only questions an agent can ask before it buys, shared by the REST API (/api/v1/...), the MCP tools and the SDK.
// None of these authorise anything: a purchase is still decided only by submitPurchase, server-side.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { purchases, taskAgents, tasks, type agents } from "@/db/schema";
import { categoryLabel, classify, evaluateIntent, itemText, type IntentResult } from "@/lib/intent/intentlock";
import { normaliseUrl, reuseKey, sha256 } from "@/lib/memory/reuse-key";
import { fmt$ } from "@/lib/money/usdc";
import { scoreProviders } from "@/lib/providers/score";
import { loadMandate, PurchaseError } from "@/lib/purchase/pipeline";

type Agent = typeof agents.$inferSelect;
type Task = typeof tasks.$inferSelect;

export async function agentTasks(db: Db, agent: Agent): Promise<Task[]> {
  const links = await db.select().from(taskAgents).where(eq(taskAgents.agentId, agent.id));
  if (!links.length) return [];
  return db.select().from(tasks).where(inArray(tasks.id, links.map((l) => l.taskId)));
}

/** The task the agent means: the one named, or its only active task. Throws a readable error otherwise. */
export async function pickTask(db: Db, agent: Agent, taskId?: string | null): Promise<Task> {
  const ts = await agentTasks(db, agent);
  if (taskId) {
    const t = ts.find((x) => x.id === taskId);
    if (!t) throw new PurchaseError("UNKNOWN_TASK", `Task ${taskId} isn't one of yours`, 404);
    return t;
  }
  const active = ts.filter((t) => t.status === "active");
  if (active.length === 1) return active[0];
  throw new PurchaseError("TASK_REQUIRED", active.length ? "You have more than one active task; pass taskId" : "You have no active task", 400);
}

export async function mandateView(db: Db, task: Task) {
  const { policy, check } = await loadMandate(db, task);
  const r = policy.rules;
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    purpose: task.purpose,
    version: policy.version,
    valid: check.ok,
    problems: check.problems,
    budget: { total: task.budget.toString(), spent: task.spent.toString(), reserved: task.reserved.toString(), left: (task.budget - task.spent - task.reserved).toString(), leftFormatted: fmt$(task.budget - task.spent - task.reserved) },
    intentLock: {
      on: !!r.categories?.length,
      categories: (r.categories ?? []).map((id) => ({ id, label: categoryLabel(id) })),
      ifUncertain: r.ifUncertain ?? "hold",
    },
    limits: {
      allowedProviders: r.allowedProviders,
      blockedProviders: r.blockedProviders ?? [],
      maxPerPurchase: r.maxPerPurchase,
      approvalAbove: r.approvalAbove,
      maxPurchasesPerHour: r.maxPurchasesPerHour,
      maxPurchases: r.maxPurchases ?? null,
      reuseWindowSeconds: r.reuseWindowSeconds,
      expiresAt: r.expiresAt,
      shoppingList: r.allowedItems ?? [],
      delegationAllowed: r.delegationAllowed !== false,
    },
    signed: { sha256: policy.mandateHash, signature: policy.mandateSig, document: policy.mandate },
  };
}
export type MandateView = Awaited<ReturnType<typeof mandateView>>;

export interface IntentCheck {
  outcome: IntentResult["outcome"];
  /** What would happen at purchase time, on the URL alone. */
  wouldBe: "allowed" | "refused" | "held" | "unchecked";
  explanation: string;
  itemCategories: { id: string; label: string }[];
  taskCategories: { id: string; label: string }[];
  note: string;
}

export async function intentCheck(db: Db, task: Task, url: string): Promise<IntentCheck> {
  const { policy } = await loadMandate(db, task);
  const r = evaluateIntent({ taskCategories: policy.rules.categories, url });
  const refuse = policy.rules.ifUncertain === "refuse";
  return {
    outcome: r.outcome,
    wouldBe: r.outcome === "match" ? "allowed" : r.outcome === "mismatch" ? "refused" : r.outcome === "uncertain" ? (refuse ? "refused" : "held") : "unchecked",
    explanation: r.explanation,
    itemCategories: r.itemCategories.map((id) => ({ id, label: categoryLabel(id) })),
    taskCategories: r.taskCategories.map((id) => ({ id, label: categoryLabel(id) })),
    note: "Judged on the URL only. At purchase time the provider's own description is read too, which can place an item the URL can't. Budget and every other rule still apply.",
  };
}

export interface MemoryCheck {
  inMemory: boolean;
  /** Buying now would be served for $0. */
  free: boolean;
  reason: string;
  purchaseId: string | null;
  paid: string | null;
  ageSeconds: number | null;
  windowSeconds: number;
}

export async function memoryCheck(db: Db, orgId: string, task: Task, req: { url: string; method?: "GET" | "POST"; body?: string | null }, now = new Date()): Promise<MemoryCheck> {
  const { policy } = await loadMandate(db, task);
  const windowSeconds = policy.rules.reuseWindowSeconds;
  const none = (reason: string): MemoryCheck => ({ inMemory: false, free: false, reason, purchaseId: null, paid: null, ageSeconds: null, windowSeconds });
  if (!windowSeconds) return none("This task never reuses earlier purchases (its reuse window is 0).");
  const method = req.method ?? "GET";
  let key: string;
  try {
    key = reuseKey(method, normaliseUrl(req.url).toString(), method === "POST" ? (req.body ?? null) : null);
  } catch {
    throw new PurchaseError("INVALID_URL", "url is not a valid absolute URL");
  }
  const [hit] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.orgId, orgId), eq(purchases.reuseKey, key), eq(purchases.status, "delivered"), gte(purchases.deliveredAt, new Date(now.getTime() - windowSeconds * 1000))))
    .orderBy(desc(purchases.deliveredAt))
    .limit(1);
  if (!hit || hit.responseBody == null) return none(`Not bought within this task's ${Math.round(windowSeconds / 60)}-minute freshness window.`);
  const ageSeconds = Math.round((now.getTime() - (hit.deliveredAt?.getTime() ?? 0)) / 1000);
  if (hit.responseHash && sha256(hit.responseBody) !== hit.responseHash)
    return { inMemory: true, free: false, reason: "A copy exists but no longer matches what was delivered, so it won't be reused.", purchaseId: hit.id, paid: hit.paidAmount.toString(), ageSeconds, windowSeconds };
  return { inMemory: true, free: true, reason: `Bought ${Math.round(ageSeconds / 60)} min ago for ${fmt$(hit.paidAmount)}; buying it again now is served for $0.`, purchaseId: hit.id, paid: hit.paidAmount.toString(), ageSeconds, windowSeconds };
}

export interface ProviderOption {
  host: string;
  path: string;
  lastPaid: string;
  lastPaidFormatted: string;
  timesBought: number;
  reliability: { score: number | null; label: string; delivered: number; failed: number; payeeChanged: number; priceSurprises: number };
}

/** From the organisation's own ledger only: who delivered this kind of item, at what price, how reliably. Most reliable first, then cheapest. */
export async function compareProviders(db: Db, orgId: string, kind: string): Promise<{ categories: { id: string; label: string }[]; options: ProviderOption[]; note: string }> {
  const want = classify(kind).categories;
  const rows = await db.select().from(purchases).where(eq(purchases.orgId, orgId)).orderBy(desc(purchases.createdAt)).limit(500);
  const scores = new Map(scoreProviders(rows).map((s) => [s.host, s]));
  const items = new Map<string, { host: string; path: string; last: bigint; times: number }>();
  const needle = kind.toLowerCase();
  for (const p of rows) {
    if (p.status !== "delivered") continue;
    const cats = classify(itemText(p.url)).categories;
    if (want.length ? !cats.some((c) => want.includes(c)) : !p.url.toLowerCase().includes(needle)) continue;
    const path = new URL(p.url).pathname;
    const k = `${p.host}${path}`;
    const cur = items.get(k);
    if (cur) cur.times += 1;
    else items.set(k, { host: p.host, path, last: p.paidAmount, times: 1 });
  }
  const options = [...items.values()]
    .sort((a, b) => (scores.get(b.host)?.score ?? -1) - (scores.get(a.host)?.score ?? -1) || Number(a.last - b.last))
    .map((i) => {
      const s = scores.get(i.host);
      return {
        host: i.host,
        path: i.path,
        lastPaid: i.last.toString(),
        lastPaidFormatted: fmt$(i.last),
        timesBought: i.times,
        reliability: {
          score: s?.score ?? null,
          label: s?.label ?? "new",
          delivered: s?.delivered ?? 0,
          failed: s?.failed ?? 0,
          payeeChanged: s?.payeeChanged ?? 0,
          priceSurprises: (s?.priceChanged ?? 0) + (s?.priceJumped ?? 0),
        },
      };
    });
  return {
    categories: want.map((id) => ({ id, label: categoryLabel(id) })),
    options,
    note: "From your own ledger only; no outside ratings. A null score means fewer than two outcomes, not a good or bad provider.",
  };
}
