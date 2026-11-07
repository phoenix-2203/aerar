// MCP tools that help an agent buy well before it buys: read its signed mandate, check whether an item would pass
// IntentLock, look in procurement memory, compare providers from the ledger, and fetch a purchase's evidence.
// All read-only. None of them can authorise anything: buy_resource still runs every check server-side, so an agent
// that skips these tools gets exactly the same decisions, just with less warning.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { purchases, tasks, type agents } from "@/db/schema";
import { buildEvidence } from "@/lib/evidence/evidence";
import { categoryLabel, classify, evaluateIntent, itemText } from "@/lib/intent/intentlock";
import { reuseKey, normaliseUrl, sha256 } from "@/lib/memory/reuse-key";
import { fmt$ } from "@/lib/money/usdc";
import { scoreProviders } from "@/lib/providers/score";
import { loadMandate, type Ctx } from "@/lib/purchase/pipeline";
import { publicUrl } from "@/lib/server/http";

type Agent = typeof agents.$inferSelect;
type Task = typeof tasks.$inferSelect;
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

export function registerProcurementTools(server: McpServer, ctx: Ctx, agent: Agent, myTasks: () => Promise<Task[]>) {
  const pickTask = async (taskId?: string) => {
    const ts = await myTasks();
    if (taskId) return ts.find((t) => t.id === taskId) ?? null;
    const active = ts.filter((t) => t.status === "active");
    return active.length === 1 ? active[0] : null;
  };
  const noTask = (taskId?: string) => text(taskId ? `Task ${taskId} isn't one of yours.` : "Pass taskId: you have more than one active task (see list_tasks).", true);

  server.registerTool(
    "get_mandate",
    {
      title: "Read my task's signed mandate",
      description:
        "The mandate a person signed for your task: its purpose, the categories you may buy (IntentLock), budget, limits and version, and whether the stored rules still match the signature. Read this before planning purchases.",
      inputSchema: { taskId: z.string().max(64).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ taskId }) => {
      const t = await pickTask(taskId);
      if (!t) return noTask(taskId);
      const { policy, check } = await loadMandate(ctx.db, t);
      const r = policy.rules;
      return text(
        [
          `Task ${t.id}: ${t.title}. Mandate v${policy.version}${check.ok ? ", signature valid" : `, NOT VALID: ${check.problems.join(" ")} Nothing can be bought until a person re-signs it.`}.`,
          `Purpose: ${t.purpose}`,
          r.categories?.length
            ? `You may buy: ${r.categories.map(categoryLabel).join(", ")}. Anything else is refused, however cheap. Items Aerar can't place ${r.ifUncertain === "refuse" ? "are refused" : "wait for a person"}.`
            : "No purpose categories on this mandate: IntentLock is off for it.",
          `Budget ${fmt$(t.budget)}, spent ${fmt$(t.spent)}, left ${fmt$(t.budget - t.spent - t.reserved)}. Max per purchase ${fmt$(BigInt(r.maxPerPurchase))}; a person approves anything above ${fmt$(BigInt(r.approvalAbove))}.`,
          r.maxPurchases ? `At most ${r.maxPurchases} purchases in total.` : "",
          r.blockedProviders?.length ? `Never buy from: ${r.blockedProviders.join(", ")}.` : "",
          r.delegationAllowed === false ? "You may not hire other agents for this task." : "",
          `Mandate sha256: ${policy.mandateHash}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "check_intent",
    {
      title: "Would this item fit my task?",
      description:
        "Ask IntentLock, without buying, whether an item's URL fits your task's signed purpose. The final decision at purchase also reads the provider's own description of the item, so 'uncertain' here may still match then.",
      inputSchema: { url: z.string().url().max(2048), taskId: z.string().max(64).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ url, taskId }) => {
      const t = await pickTask(taskId);
      if (!t) return noTask(taskId);
      const { policy } = await loadMandate(ctx.db, t);
      const r = evaluateIntent({ taskCategories: policy.rules.categories, url });
      const verdict = { match: "Fits the task.", mismatch: "Would be refused.", uncertain: policy.rules.ifUncertain === "refuse" ? "Would be refused unless the provider's description places it." : "Would wait for a person unless the provider's description places it.", off: "IntentLock is off for this task." }[r.outcome];
      return text(`${verdict} ${r.explanation}`);
    },
  );

  server.registerTool(
    "check_memory",
    {
      title: "Did we already buy this?",
      description:
        "Look in your organisation's procurement memory for an identical purchase that is still fresh under your task's reuse window and still byte-for-byte what was delivered. If there is one, buy_resource will serve it for $0.",
      inputSchema: { url: z.string().url().max(2048), method: z.enum(["GET", "POST"]).default("GET"), body: z.string().max(65536).optional(), taskId: z.string().max(64).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ url, method, body, taskId }) => {
      const t = await pickTask(taskId);
      if (!t) return noTask(taskId);
      const { policy } = await loadMandate(ctx.db, t);
      const window = policy.rules.reuseWindowSeconds;
      if (!window) return text("This task never reuses earlier purchases (its reuse window is 0), so it would buy fresh.");
      let key: string;
      try {
        key = reuseKey(method, normaliseUrl(url).toString(), method === "POST" ? (body ?? null) : null);
      } catch {
        return text("That isn't a valid URL.", true);
      }
      const since = new Date(Date.now() - window * 1000);
      const [hit] = await ctx.db
        .select()
        .from(purchases)
        .where(and(eq(purchases.orgId, agent.orgId), eq(purchases.reuseKey, key), eq(purchases.status, "delivered"), gte(purchases.deliveredAt, since)))
        .orderBy(desc(purchases.deliveredAt))
        .limit(1);
      if (!hit || hit.responseBody == null) return text(`Not in memory within this task's ${Math.round(window / 60)}-minute freshness window: buying would pay the provider.`);
      const intact = !hit.responseHash || sha256(hit.responseBody) === hit.responseHash;
      const age = Math.round((Date.now() - (hit.deliveredAt?.getTime() ?? 0)) / 60000);
      if (!intact) return text("A copy exists but no longer matches what was delivered, so it won't be reused; buying would fetch a fresh one.");
      return text(`In memory: bought ${age} min ago for ${fmt$(hit.paidAmount)} (purchase ${hit.id}). Buying it again now would be served for $0. Freshness window: ${Math.round(window / 60)} min.`);
    },
  );

  server.registerTool(
    "compare_providers",
    {
      title: "Compare providers for a kind of item",
      description:
        "From your organisation's own ledger only: which providers have delivered items of a kind (e.g. 'market data', 'ethereum transactions'), at what price, and how reliable each has been. Says so when there isn't enough history; never invents ratings.",
      inputSchema: { kind: z.string().min(2).max(200) },
      annotations: { readOnlyHint: true },
    },
    async ({ kind }) => {
      const want = classify(kind).categories;
      const rows = await ctx.db.select().from(purchases).where(eq(purchases.orgId, agent.orgId)).orderBy(desc(purchases.createdAt)).limit(500);
      const scores = new Map(scoreProviders(rows).map((s) => [s.host, s]));
      const items = new Map<string, { host: string; path: string; last: bigint; times: number }>();
      for (const p of rows) {
        if (p.status !== "delivered") continue;
        const cats = classify(itemText(p.url)).categories;
        const words = kind.toLowerCase();
        if (want.length ? !cats.some((c) => want.includes(c)) : !p.url.toLowerCase().includes(words)) continue;
        const path = new URL(p.url).pathname;
        const k = `${p.host}${path}`;
        const cur = items.get(k);
        if (cur) cur.times += 1;
        else items.set(k, { host: p.host, path, last: p.paidAmount, times: 1 });
      }
      if (!items.size)
        return text(`No delivered purchases of that kind${want.length ? ` (${want.map(categoryLabel).join(", ")})` : ""} in your ledger yet, so there's nothing to compare. Aerar doesn't use outside ratings.`);
      const lines = [...items.values()]
        .sort((a, b) => (scores.get(b.host)?.score ?? -1) - (scores.get(a.host)?.score ?? -1) || Number(a.last - b.last))
        .map((i) => {
          const s = scores.get(i.host);
          const rel = !s || s.score == null ? "not enough history to rate" : `${s.score}/100 (${s.delivered} delivered, ${s.failed} failed after payment, ${s.payeeChanged} payee swaps)`;
          return `- ${i.host}${i.path}: last paid ${fmt$(i.last)}, bought ${i.times}x; reliability ${rel}`;
        });
      return text(
        [
          `From your own ledger${want.length ? ` (${want.map(categoryLabel).join(", ")})` : ""}, most reliable first, then cheapest:`,
          ...lines,
          "Prefer the most reliable provider that fits the budget, not simply the cheapest. Reliability is measured, not estimated; 'not enough history' means fewer than two outcomes.",
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "get_evidence",
    {
      title: "Evidence for a purchase",
      description: "The evidence package for one purchase: mandate, IntentLock decision, payment, delivery and audit, with each claim labelled by how it can be checked (signed, on Base, Aerar's database, simulated).",
      inputSchema: { id: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const e = await buildEvidence(ctx.db, agent.orgId, id, publicUrl());
      if (!e) return text(`No purchase with id ${id} in your organisation.`, true);
      const mark = (ok: boolean | null) => (ok == null ? "·" : ok ? "✓" : "✗");
      return text(
        [
          `${e.purchase.statusLabel}: ${e.purchase.request.url}`,
          e.decision.intentLock ? `IntentLock: ${e.decision.intentLock.outcome}. ${e.decision.intentLock.explanation}` : "",
          ...e.checks.map((c) => `${mark(c.ok)} [${c.level}] ${c.claim}: ${c.detail}`),
          `Full package (JSON): ${publicUrl()}/api/v1/purchases/${id}/evidence`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );
}
