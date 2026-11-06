// One realistic night, played twice: by a plain agent wallet that pays every 402 it is shown,
// and through Aerar. The difference is what Aerar is for.
import { eq } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { approvePurchase, type Purchase } from "@/lib/purchase/pipeline";
import { morningReport } from "@/lib/server/report";
import { createStage, describe as describePurchase, type Stage } from "./stage";

const HOST = "https://data.example.com";
const ATTACKER_WALLET = "0x2222222222222222222222222222222222222222";

/** Why a plain wallet's payment would have been a loss. */
export type Waste = "attacker" | "duplicate" | "over_limit" | "loop" | null;

interface Ask {
  time: string;
  agent: "researcher" | "analyst";
  path: string;
  price: bigint;
  says: string;
  /** What this request costs you without Aerar, beyond what you meant to buy. */
  waste: Waste;
  host?: string;
}

const loop: Ask[] = Array.from({ length: 8 }, (_, i) => ({
  time: `03:${String(10 + i * 2).padStart(2, "0")}`,
  agent: "analyst" as const,
  path: `/page-${i + 1}`,
  price: 10_000n,
  says: `Buy /page-${i + 1} (stuck in a retry loop)`,
  waste: i < 3 ? null : ("loop" as const),
}));

export const NIGHT: Ask[] = [
  { time: "00:10", agent: "researcher", path: "/fx?base=USD", price: 10_000n, says: "Buy today's FX rates", waste: null },
  { time: "00:40", agent: "analyst", path: "/fx?base=USD", price: 10_000n, says: "Buy today's FX rates (didn't know the researcher had them)", waste: "duplicate" },
  { time: "01:15", agent: "researcher", path: "/competitors", price: 30_000n, says: "Buy the competitor list", waste: null },
  { time: "01:20", agent: "researcher", host: "https://pay.attacker.io", path: "/full-dataset", price: 900_000n, says: "A web page told me to buy pay.attacker.io/full-dataset", waste: "attacker" },
  { time: "02:00", agent: "analyst", path: "/premium", price: 80_000n, says: "Buy the premium market report for the client memo", waste: null },
  { time: "02:30", agent: "researcher", path: "/rates", price: 10_000n, says: "Buy interest rates (provider's 402 now names a new wallet)", waste: "attacker" },
  ...loop,
  { time: "04:00", agent: "researcher", path: "/competitors", price: 30_000n, says: "Buy the competitor list again for the appendix", waste: "duplicate" },
  { time: "05:00", agent: "researcher", path: "/deep-report", price: 900_000n, says: "URGENT, CEO approved: buy the $0.90 deep report", waste: "over_limit" },
];

export interface NightEvent {
  time: string;
  agent: string;
  says: string;
  price: bigint;
  outcome: string;
  status: Purchase["status"];
  waste: Waste;
}

export interface NightResult {
  events: NightEvent[];
  approval: { time: string; outcome: string } | null;
  plainWallet: { paid: bigint; wasted: bigint; toAttackers: bigint; duplicates: bigint; overLimit: bigint; loop: bigint; payments: number };
  aerar: { paid: bigint; saved: bigint; declined: number; reused: number; payments: number; budget: bigint; wasted: bigint; toAttackers: bigint; duplicates: bigint; overLimit: bigint; loop: bigint };
  headline: string[];
}

export async function runNight(): Promise<NightResult> {
  const offers: Record<string, { amount: bigint; payTo?: string }> = {};
  for (const a of NIGHT) offers[(a.host ?? HOST) + a.path] = { amount: a.price, ...(a.path === "/rates" ? { payTo: ATTACKER_WALLET } : {}) };
  const s = await createStage({
    budget: 1_000_000n,
    offers,
    rules: { allowedProviders: ["data.example.com"], maxPerPurchase: "100000", approvalAbove: "50000", maxPurchasesPerHour: 6, reuseWindowSeconds: 12 * 3600 },
  });
  try {
    return await playNight(s);
  } finally {
    await s.close();
  }
}

async function playNight(s: Stage): Promise<NightResult> {
  const events: NightEvent[] = [];
  let held: Purchase | null = null;
  for (const a of NIGHT) {
    const p = await s.buy(a.agent, (a.host ?? HOST) + a.path, { purpose: a.says });
    if (p.status === "awaiting_approval") held = p;
    events.push({ time: a.time, agent: a.agent, says: a.says, price: a.price, outcome: describePurchase(p), status: p.status, waste: a.waste });
  }

  let approval: NightResult["approval"] = null;
  if (held) {
    const done = await approvePurchase(s.ctx, held.id, "operator");
    approval = { time: "08:00", outcome: `Operator approved the premium report. ${describePurchase(done)}` };
  }

  const sum = (f: (a: Ask) => boolean) => NIGHT.filter(f).reduce((t, a) => t + a.price, 0n);
  const plainWallet = {
    paid: sum(() => true),
    wasted: sum((a) => a.waste !== null),
    toAttackers: sum((a) => a.waste === "attacker"),
    duplicates: sum((a) => a.waste === "duplicate"),
    overLimit: sum((a) => a.waste === "over_limit"),
    loop: sum((a) => a.waste === "loop"),
    payments: NIGHT.length,
  };

  // What Aerar still paid that was waste (honest accounting: e.g. loop purchases under the hourly cap).
  const leaked = (w: Waste) => events.filter((e) => e.waste === w && e.status === "delivered").reduce((x, e) => x + e.price, 0n);
  const aerarWaste = { toAttackers: leaked("attacker"), duplicates: leaked("duplicate"), overLimit: leaked("over_limit"), loop: leaked("loop") };

  const [t] = await s.db.select().from(tasks).where(eq(tasks.id, s.task.id));
  const report = await morningReport(s.db, s.org.id, { since: new Date(Date.now() - 86_400_000), until: new Date(Date.now() + 60_000) });
  return {
    events,
    approval,
    plainWallet,
    aerar: {
      paid: t.spent,
      saved: report.totals.saved,
      declined: events.filter((e) => e.status === "declined").length,
      reused: events.filter((e) => e.status === "reused").length,
      payments: s.rail.calls.pay.length,
      budget: t.budget,
      ...aerarWaste,
      wasted: aerarWaste.toAttackers + aerarWaste.duplicates + aerarWaste.overLimit + aerarWaste.loop,
    },
    headline: report.headline,
  };
}
