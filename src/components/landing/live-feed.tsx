"use client";
// Hero visual: agent purchase requests arriving through the night, each checked, then answered. Illustrative (the
// attack lab and the live report are the real thing). Hover to pause. Static list with reduced motion.
import { Ban, Bot, CheckCircle2, Clock, Repeat2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Outcome = "paid" | "reused" | "declined" | "approval";
interface Req {
  agent: string;
  what: string;
  host: string;
  price: string;
  outcome: Outcome;
  why: string;
}

const REQUESTS: Req[] = [
  { agent: "researcher", what: "Today's FX rates", host: "api.marketdata.io", price: "$0.01", outcome: "paid", why: "Within the rules · proven onchain" },
  { agent: "analyst", what: "Today's FX rates", host: "api.marketdata.io", price: "$0.01", outcome: "reused", why: "Already bought tonight · $0.01 saved" },
  { agent: "researcher", what: "“Buy the full dataset”", host: "pay.attacker.io", price: "$4.00", outcome: "declined", why: "Provider not on the task's list · never contacted" },
  { agent: "analyst", what: "Deep market report", host: "reports.acme.dev", price: "$0.90", outcome: "approval", why: "Above the $0.25 auto-approve limit" },
  { agent: "researcher", what: "Competitor list", host: "api.leads.dev", price: "$0.03", outcome: "paid", why: "Within the rules · proven onchain" },
  { agent: "analyst", what: "Interest rates", host: "api.marketdata.io", price: "$0.01", outcome: "declined", why: "Payee address changed since last paid" },
];

const OUT: Record<Outcome, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  paid: { label: "Paid", icon: CheckCircle2, cls: "bg-success-tint text-success" },
  reused: { label: "Reused", icon: Repeat2, cls: "bg-info-tint text-info" },
  declined: { label: "Declined", icon: Ban, cls: "bg-danger-tint text-danger" },
  approval: { label: "Needs approval", icon: Clock, cls: "bg-warning-tint text-warning" },
};

interface Item extends Req {
  key: number;
  phase: 0 | 1 | 2; // 0 checking, 1 deciding, 2 answered
}

const VISIBLE = 4;

export function LiveFeed() {
  const [items, setItems] = useState<Item[]>(() =>
    REQUESTS.slice(0, VISIBLE).reverse().map((r, i) => ({ ...r, key: i, phase: 2 as const })),
  );
  const [paused, setPaused] = useState(false);
  const n = useRef(VISIBLE);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || reduced.current) return;
    const t = setInterval(() => {
      const k = n.current++;
      const r = REQUESTS[k % REQUESTS.length];
      setItems((cur) => [{ ...r, key: k, phase: 0 as const }, ...cur].slice(0, VISIBLE));
      setTimeout(() => setItems((cur) => cur.map((x) => (x.key === k ? { ...x, phase: 1 } : x))), 650);
      setTimeout(() => setItems((cur) => cur.map((x) => (x.key === k ? { ...x, phase: 2 } : x))), 1300);
    }, 2600);
    return () => clearInterval(t);
  }, [paused]);

  const answered = items.filter((i) => i.phase === 2);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-lift"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <span className="relative flex size-2">
            <span className={`absolute inline-flex size-full rounded-full bg-success opacity-60 ${paused ? "" : "animate-ping"}`} />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Tonight&apos;s requests
        </div>
        <span className="text-xs text-text-3">{paused ? "Paused" : "Illustration · hover to pause"}</span>
      </div>
      <ul className="divide-y divide-border" aria-live="off">
        {items.map((it) => (
          <FeedRow key={it.key} it={it} />
        ))}
      </ul>
      <div className="grid grid-cols-4 border-t border-border text-center">
        {(Object.keys(OUT) as Outcome[]).map((o) => {
          const c = answered.filter((a) => a.outcome === o).length;
          return (
            <div key={o} className="border-r border-border px-2 py-2.5 last:border-r-0">
              <div className="tabular text-sm font-semibold">{c}</div>
              <div className="truncate text-[11px] text-text-3">{OUT[o].label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedRow({ it }: { it: Item }) {
  const o = OUT[it.outcome];
  const Icon = o.icon;
  return (
    <li className="flex items-center gap-3 px-4 py-3 [animation:record-in_320ms_cubic-bezier(0.2,0.8,0.2,1)_both]">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-2">
        <Bot className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13.5px] font-medium">{it.what}</span>
          <span className="tabular shrink-0 text-[13px] text-text-2">{it.price}</span>
        </div>
        <div className="truncate text-xs text-text-3">
          {it.phase === 2 ? it.why : (
            <>
              <span className="font-mono">{it.host}</span> · {it.agent}
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap text-right">
        {it.phase < 2 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-3">
            <Dots phase={it.phase as 0 | 1} />
            {it.phase === 0 ? "Checking" : "Deciding"}
          </span>
        ) : (
          <span className={`inline-flex animate-pop items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${o.cls}`}>
            <Icon className="size-3.5" aria-hidden />
            {o.label}
          </span>
        )}
      </div>
    </li>
  );
}

function Dots({ phase }: { phase: 0 | 1 }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`size-1 rounded-full ${i <= phase + 1 ? "bg-accent" : "bg-border-strong"} transition-colors`} />
      ))}
    </span>
  );
}
