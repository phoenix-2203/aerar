import { createHash } from "node:crypto";

// Deterministic synthetic "market report" for the demo provider. Same topic -> same report, so
// procurement memory has something real to reuse. Clearly labelled as demo data in every response.

const SEGMENTS = ["SMB", "Mid-market", "Enterprise", "Developers", "Consumers", "Public sector"];
const SIGNALS = [
  "rising search interest",
  "new entrants in the last quarter",
  "pricing pressure from open-source alternatives",
  "consolidation among the top vendors",
  "regulatory attention",
  "strong developer community activity",
  "slowing enterprise budgets",
  "growing demand for usage-based pricing",
];

function rng(seed: string) {
  let h = createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = createHash("sha256").update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i);
    i += 4;
    return v / 0xffffffff;
  };
}

export function normaliseTopic(raw: string | null): string | null {
  const t = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!t || t.length > 80) return null;
  if (!/^[\p{L}\p{N} .,&'()\-/+]+$/u.test(t)) return null;
  return t;
}

export function buildReport(topic: string, tier: "standard" | "premium") {
  const r = rng(`${tier}:${topic.toLowerCase()}`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const marketSizeUsdM = Math.round(200 + r() * 9800);
  const growthPct = Math.round((2 + r() * 38) * 10) / 10;
  const base = {
    demo: true,
    notice: "Synthetic demo data generated from the topic. Not real market research.",
    topic,
    tier,
    estimatedMarketSizeUsdMillions: marketSizeUsdM,
    estimatedAnnualGrowthPct: growthPct,
    leadingSegment: pick(SEGMENTS),
    signals: [pick(SIGNALS), pick(SIGNALS)].filter((s, i, a) => a.indexOf(s) === i),
  };
  if (tier === "standard") return base;
  return {
    ...base,
    segments: SEGMENTS.map((name) => ({ name, sharePct: Math.round(r() * 1000) / 10 })),
    risks: [pick(SIGNALS), pick(SIGNALS), pick(SIGNALS)].filter((s, i, a) => a.indexOf(s) === i),
    confidence: pick(["low", "medium"]),
  };
}
