// MCP tools that help an agent buy well before it buys: read its signed mandate, check whether an item would pass
// IntentLock, look in procurement memory, compare providers from the ledger, and fetch a purchase's evidence.
// All read-only, and the same answers as the REST API and SDK (src/lib/procurement/agent-queries.ts). None of them
// can authorise anything: buy_resource still runs every check server-side, so an agent that skips these tools gets
// exactly the same decisions, just with less warning.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { agents } from "@/db/schema";
import { buildEvidence } from "@/lib/evidence/evidence";
import { fmt$ } from "@/lib/money/usdc";
import { compareProviders, intentCheck, mandateView, memoryCheck, pickTask } from "@/lib/procurement/agent-queries";
import type { Ctx } from "@/lib/purchase/pipeline";
import { publicUrl } from "@/lib/server/http";

type Agent = typeof agents.$inferSelect;
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });
const fail = (e: unknown) => text((e as Error).message, true);

export function registerProcurementTools(server: McpServer, ctx: Ctx, agent: Agent) {
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
      try {
        const m = await mandateView(ctx.db, await pickTask(ctx.db, agent, taskId));
        const l = m.limits;
        return text(
          [
            `Task ${m.taskId}: ${m.title}. Mandate v${m.version}${m.valid ? ", signature valid" : `, NOT VALID: ${m.problems.join(" ")} Nothing can be bought until a person re-signs it.`}.`,
            `Purpose: ${m.purpose}`,
            m.intentLock.on
              ? `You may buy: ${m.intentLock.categories.map((c) => c.label).join(", ")}. Anything else is refused, however cheap. Items Aerar can't place ${m.intentLock.ifUncertain === "refuse" ? "are refused" : "wait for a person"}.`
              : "No purpose categories on this mandate: IntentLock is off for it.",
            `Budget left ${m.budget.leftFormatted}. Max per purchase ${fmt$(BigInt(l.maxPerPurchase))}; a person approves anything above ${fmt$(BigInt(l.approvalAbove))}.`,
            l.maxPurchases ? `At most ${l.maxPurchases} purchases in total.` : "",
            l.blockedProviders.length ? `Never buy from: ${l.blockedProviders.join(", ")}.` : "",
            l.delegationAllowed ? "" : "You may not hire other agents for this task.",
            `Mandate sha256: ${m.signed.sha256}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      } catch (e) {
        return fail(e);
      }
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
      try {
        const r = await intentCheck(ctx.db, await pickTask(ctx.db, agent, taskId), url);
        const verdict = { allowed: "Fits the task.", refused: "Would be refused.", held: "Would wait for a person unless the provider's description places it.", unchecked: "IntentLock is off for this task." }[r.wouldBe];
        return text(`${verdict} ${r.explanation}`);
      } catch (e) {
        return fail(e);
      }
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
      try {
        const r = await memoryCheck(ctx.db, agent.orgId, await pickTask(ctx.db, agent, taskId), { url, method, body });
        return text(r.free ? `In memory: ${r.reason} (purchase ${r.purchaseId}).` : r.inMemory ? r.reason : `Not in memory: ${r.reason} Buying would pay the provider.`);
      } catch (e) {
        return fail(e);
      }
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
      const r = await compareProviders(ctx.db, agent.orgId, kind);
      const scope = r.categories.length ? ` (${r.categories.map((c) => c.label).join(", ")})` : "";
      if (!r.options.length) return text(`No delivered purchases of that kind${scope} in your ledger yet, so there's nothing to compare. Aerar doesn't use outside ratings.`);
      return text(
        [
          `From your own ledger${scope}, most reliable first, then cheapest:`,
          ...r.options.map((o) => {
            const s = o.reliability;
            const rel = s.score == null ? "not enough history to rate" : `${s.score}/100 (${s.delivered} delivered, ${s.failed} failed after payment, ${s.payeeChanged} payee swaps)`;
            return `- ${o.host}${o.path}: last paid ${o.lastPaidFormatted}, bought ${o.timesBought}x; reliability ${rel}`;
          }),
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
