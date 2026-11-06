// Scenario stage: an isolated world (in-memory Postgres, agents, a task, a simulated x402 network)
// in which one real-world situation is played through the real purchase pipeline.
// Used by the scenario tests, the night-shift simulation script and the demo page.
import type { Db } from "@/db";
import type { PolicyRules } from "@/db/schema";
import { submitPurchase, type Purchase, type PurchaseRequest } from "@/lib/purchase/pipeline";
import { fakeRail, world, type FakeOffer } from "@/lib/sim";
import { leaseSandbox } from "@/lib/sim/sandbox";
import type { PayResult, Quote } from "@/lib/x402/rail";

/** The problems from the README, in the same order. Every scenario answers one of them. */
export const PROBLEMS = {
  injection: { title: "An agent is talked into paying", short: "Talked into paying" },
  duplicate: { title: "The same thing is paid for twice", short: "Paid twice" },
  mismatch: { title: "Payments and services don't line up", short: "Paid but not delivered" },
  evidence: { title: "The numbers can't be trusted", short: "Untrustworthy records" },
  oversight: { title: "People don't trust agents with money yet", short: "No human in the loop" },
  runaway: { title: "Spending gets out of hand", short: "Runaway spending" },
} as const;
export type ProblemId = keyof typeof PROBLEMS;

export interface StageOptions {
  budget?: bigint;
  rules?: Partial<PolicyRules>;
  /** Simulated providers: path or full URL -> price (atomic USDC, 6 decimals) or "free". */
  offers?: Record<string, FakeOffer | "free">;
  payResult?: (q: Quote) => PayResult;
}

export type Stage = Awaited<ReturnType<typeof createStage>>;

let seq = 0;

export async function createStage(opts: StageOptions = {}) {
  // The shared sandbox is wiped for this lease and held until close(), so stages never see each other.
  const lease = await leaseSandbox();
  let w: Awaited<ReturnType<typeof world>>;
  try {
    w = await world({ budget: opts.budget ?? 1_000_000n, rules: opts.rules, db: lease.db });
  } catch (e) {
    lease.release();
    throw e;
  }
  const rail = fakeRail(opts.offers ?? {}, { payResult: opts.payResult });
  const ctx = { db: w.db as Db, rail };
  const agentIds = { researcher: w.agent.id, analyst: w.agent2.id } as const;

  /** An agent asks Aerar to buy something. Everything the agent says is just data to Aerar. */
  async function buy(
    agent: keyof typeof agentIds,
    url: string,
    over: Partial<Omit<PurchaseRequest, "url" | "taskId">> & { taskId?: string } = {},
  ): Promise<Purchase> {
    return submitPurchase(ctx, agentIds[agent], {
      taskId: over.taskId ?? w.task.id,
      url,
      method: over.method ?? "GET",
      body: over.body ?? null,
      purpose: over.purpose ?? "Overnight research",
      idempotencyKey: over.idempotencyKey ?? `scn-${++seq}`,
    });
  }

  /** Hand the sandbox to the next stage. Always call it (play() and runNight() do). */
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    lease.release();
  }

  return { ...w, rail, ctx, agentIds, buy, close };
}

/** Collects pass/fail checks so a scenario can grade itself in tests and in the live narration. */
export class Checks {
  readonly failures: string[] = [];
  readonly passed: string[] = [];
  that(ok: boolean, what: string) {
    (ok ? this.passed : this.failures).push(what);
    return ok;
  }
}

export interface ScenarioResult {
  /** One plain-language line per thing that happened, in order. */
  timeline: string[];
  /** What Aerar's handling meant in money terms, e.g. "$0.00 paid, $0.10 avoided". */
  verdict: string;
  checks: Checks;
  /** Real payments the simulated network received. */
  payments: number;
}

export interface Scenario {
  id: string;
  problem: ProblemId;
  /** What goes wrong in the real world, as a headline. */
  title: string;
  /** The situation, in two sentences a non-developer understands. */
  story: string;
  /** What Aerar should do about it. */
  expected: string;
  run(): Promise<ScenarioResult>;
}

/**
 * Run one scenario body on a fresh stage. The body logs what happens (`log`), grades itself (`check`)
 * and returns the verdict line.
 */
export async function play(
  opts: StageOptions,
  body: (s: Stage, log: (line: string | Purchase) => void, check: Checks) => Promise<string>,
): Promise<ScenarioResult> {
  const s = await createStage(opts);
  try {
    const timeline: string[] = [];
    const checks = new Checks();
    const log = (line: string | Purchase) => timeline.push(typeof line === "string" ? line : describe(line));
    const verdict = await body(s, log, checks);
    return { timeline, verdict, checks, payments: s.rail.calls.pay.length };
  } finally {
    await s.close();
  }
}

const usd = (atomic: bigint | null | undefined) => `$${(Number(atomic ?? 0n) / 1e6).toFixed(2)}`;
export { usd };

/** One timeline line for a purchase, in the words the dashboard uses. */
export function describe(p: Purchase): string {
  const price = usd(p.quoteAmount);
  switch (p.status) {
    case "delivered":
      return `Paid ${usd(p.paidAmount)} to ${p.host}, delivered${p.onchainVerifiedAt ? ", transfer checked onchain" : ", onchain check FAILED"}`;
    case "reused":
      return `Reused an earlier purchase: paid $0.00, avoided ${price}`;
    case "awaiting_approval":
      return `Held for a person to approve (${price})`;
    case "declined":
      return `Declined, nothing paid: ${p.error ?? p.reasonCodes.join(", ")}`;
    case "rejected":
      return `Rejected by a person, nothing paid`;
    case "payment_failed":
      return `Not paid: ${p.error ?? p.reasonCodes.at(-1)}`;
    case "free":
      return `Free resource, nothing to pay`;
    default:
      return `${p.status}: ${p.error ?? ""}`.trim();
  }
}
