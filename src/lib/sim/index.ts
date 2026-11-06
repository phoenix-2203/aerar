// Simulation kit: an in-memory Postgres with the real migrations, and a programmable fake x402 rail.
// Powers the test suite, the scenario catalogue and the public /scenarios page. No network, no money.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { PolicyRules } from "@/db/schema";
import { createAgent, createOrg, createTask } from "@/lib/workspace";
import type { CapturedResponse, HttpRequestSpec, OnchainCheck, PaymentRail, PayResult, Quote, QuoteResult } from "@/lib/x402/rail";

export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const PAYEE = "0x1111111111111111111111111111111111111111";

/** Fresh in-process Postgres with the real migrations applied. */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

const enc = new TextEncoder();
export const resp = (body: string, status = 200): CapturedResponse => ({ status, contentType: "application/json", body: enc.encode(body) });

export interface FakeOffer {
  amount: bigint;
  payTo?: string;
  network?: string;
  asset?: string;
  scheme?: string;
}

/** Programmable fake x402 rail: price per URL, counts quotes and payments. */
export function fakeRail(offers: Record<string, FakeOffer | "free">, opts: { payResult?: (q: Quote) => PayResult } = {}) {
  const calls = { quote: [] as string[], pay: [] as { url: string; amount: bigint }[] };
  let tx = 0;
  const offerFor = (url: string) => {
    const path = new URL(url).pathname;
    return offers[url] ?? offers[path];
  };
  const rail: PaymentRail & { calls: typeof calls; offers: typeof offers } = {
    id: "fake",
    network: "eip155:84532",
    asset: USDC,
    scheme: "exact",
    payerAddress: "0x9999999999999999999999999999999999999999",
    calls,
    offers,
    async quote(req: HttpRequestSpec): Promise<QuoteResult> {
      calls.quote.push(req.url);
      const o = offerFor(req.url);
      if (!o) throw new Error("connect ECONNREFUSED");
      if (o === "free") return { kind: "free", response: resp('{"free":true}') };
      const q: Quote = {
        scheme: o.scheme ?? "exact",
        network: o.network ?? "eip155:84532",
        asset: o.asset ?? USDC,
        amount: o.amount,
        payTo: o.payTo ?? PAYEE,
        raw: { accepts: [] },
      };
      return { kind: "payment_required", quotes: [q] };
    },
    async pay(req: HttpRequestSpec, q: Quote): Promise<PayResult> {
      calls.pay.push({ url: req.url, amount: q.amount });
      if (opts.payResult) return opts.payResult(q);
      tx += 1;
      return { kind: "settled", response: resp(JSON.stringify({ data: req.url, n: tx })), txHash: `0xtx${tx}`, payer: this.payerAddress, amount: q.amount };
    },
    async verifyOnchain(): Promise<OnchainCheck> {
      return { ok: true, checkedAt: new Date().toISOString(), blockNumber: "1" };
    },
  };
  return rail;
}

export const defaultRules = (over: Partial<PolicyRules> = {}): PolicyRules => ({
  allowedProviders: ["data.example.com"],
  maxPerPurchase: "100000", // $0.10
  approvalAbove: "50000", // $0.05
  maxPurchasesPerHour: 50,
  reuseWindowSeconds: 3600,
  expiresAt: null,
  ...over,
});

/** A seeded workspace (org, two agents, one task). Uses `over.db` if given (an already-empty sandbox), else a fresh in-memory database. */
export async function world(over: { budget?: bigint; rules?: Partial<PolicyRules>; db?: Db } = {}) {
  const db = over.db ?? (await testDb());
  const org = await createOrg(db, "Test Org", "org_test");
  const { agent, apiKey } = await createAgent(db, org.id, "researcher");
  const { agent: agent2 } = await createAgent(db, org.id, "analyst");
  const task = await createTask(db, {
    orgId: org.id,
    title: "Competitor report",
    purpose: "Research",
    budget: over.budget ?? 1_000_000n,
    rules: defaultRules(over.rules),
    agentIds: [agent.id, agent2.id],
    createdBy: "test",
  });
  return { db, org, agent, agent2, apiKey, task };
}
