"use client";
// Hero: one night shift, 22:00 → 06:00, as a ledger. The clock runs on its own; drag it to scrub. Each purchase prints
// as a line and gets stamped (PAID, REUSED, HELD, REFUSED). Totals add up as the night goes. Illustrative; the attack
// lab and the live report run the real pipeline.
import { useEffect, useMemo, useRef, useState } from "react";

type Stamp = "PAID" | "REUSED" | "HELD" | "REFUSED";
interface Line {
  at: number; // minutes after 22:00
  agent: string;
  item: string;
  amount: number; // dollars
  stamp: Stamp;
  note: string;
}

const NIGHT: Line[] = [
  { at: 8, agent: "researcher", item: "FX rates · marketdata", amount: 0.01, stamp: "PAID", note: "within the task's rules" },
  { at: 41, agent: "analyst", item: "FX rates · marketdata", amount: 0.01, stamp: "REUSED", note: "already bought tonight" },
  { at: 77, agent: "researcher", item: "Competitor list · leads", amount: 0.03, stamp: "PAID", note: "within the task's rules" },
  { at: 118, agent: "researcher", item: "“Full dataset” · attacker.io", amount: 4.0, stamp: "REFUSED", note: "a web page told the agent to buy it" },
  { at: 164, agent: "analyst", item: "Deep report · acme", amount: 0.9, stamp: "HELD", note: "above $0.25: waiting for you in Slack" },
  { at: 203, agent: "analyst", item: "Interest rates · marketdata", amount: 0.01, stamp: "REFUSED", note: "the shop's payee address changed" },
  { at: 251, agent: "researcher", item: "Market report · acme", amount: 0.08, stamp: "PAID", note: "receipt signed, transfer checked on Base" },
  { at: 290, agent: "researcher", item: "Market report · acme", amount: 0.08, stamp: "REUSED", note: "the loop asked again: served from memory" },
  { at: 336, agent: "analyst", item: "Market report · acme", amount: 0.08, stamp: "REUSED", note: "same data, $0 the third time" },
  { at: 392, agent: "researcher", item: "Payroll API · unknown", amount: 2.5, stamp: "REFUSED", note: "your Vault refused it on-chain" },
  { at: 431, agent: "analyst", item: "Sector summary · acme", amount: 0.12, stamp: "PAID", note: "within the task's rules" },
];
const END = 480; // 06:00

const STAMP: Record<Stamp, string> = {
  PAID: "text-success border-success",
  REUSED: "text-info border-info",
  HELD: "text-warning border-warning",
  REFUSED: "text-danger border-danger",
};

const clock = (m: number) => {
  const t = (22 * 60 + Math.round(m)) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const usd = (n: number) => `$${n.toFixed(2)}`;

export function NightLedger() {
  const [t, setT] = useState(0);
  const [held, setHeld] = useState(false); // paused by hover or drag
  const [reduced, setReduced] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) setT(END);
    };
    const id = setTimeout(apply, 0);
    mq.addEventListener("change", apply);
    return () => {
      clearTimeout(id);
      mq.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (held || reduced) return;
    const step = (now: number) => {
      const dt = last.current == null ? 0 : now - last.current;
      last.current = now;
      // ~24s for the whole night, then a short pause at dawn and start again.
      setT((x) => (x >= END + 40 ? 0 : x + dt / 50));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = null;
    };
  }, [held, reduced]);

  const now = Math.min(t, END);
  const shown = useMemo(() => NIGHT.filter((l) => l.at <= now), [now]);
  const paid = shown.filter((l) => l.stamp === "PAID").reduce((n, l) => n + l.amount, 0);
  const saved = shown.filter((l) => l.stamp === "REUSED").reduce((n, l) => n + l.amount, 0);
  const stopped = shown.filter((l) => l.stamp === "REFUSED").reduce((n, l) => n + l.amount, 0);
  const waiting = shown.filter((l) => l.stamp === "HELD").length;
  const dawn = now >= END;
  // Sky goes from deep night to first light as the shift ends.
  const light = Math.max(0, (now - 380) / 100);

  return (
    <div
      className="ledger-card relative overflow-hidden rounded-2xl border border-border bg-surface shadow-lift"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      aria-label="An example night: agent purchases through the night, each stamped by Aerar"
    >
      {/* sky */}
      <div className="relative h-24 overflow-hidden border-b border-border" aria-hidden>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#05060a_0%,#0d1222_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#1b2a4a_0%,#d8aa55_160%)] transition-opacity duration-500" style={{ opacity: Math.min(1, light) }} />
        {STARS.map(([x, y, s], i) => (
          <span key={i} className="star absolute rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, opacity: 0.8 * (1 - Math.min(1, light)), animationDelay: `${i * 0.37}s` }} />
        ))}
        <span
          className="absolute size-7 rounded-full bg-[#f4ecd8] shadow-[0_0_24px_6px_rgba(244,236,216,0.25)] transition-[left,top] duration-200"
          style={{ left: `calc(${(now / END) * 86 + 4}% - 14px)`, top: `${62 - Math.sin((now / END) * Math.PI) * 44}%`, opacity: 1 - Math.min(1, light) * 0.7 }}
        />
        <div className="absolute inset-x-4 bottom-2 flex items-end justify-between font-mono text-[11px] text-white/70">
          <span>22:00</span>
          <span className="rounded-md bg-black/40 px-2 py-0.5 text-[13px] font-semibold tabular-nums text-white">{dawn ? "06:00 · morning report ready" : clock(now)}</span>
          <span>06:00</span>
        </div>
      </div>

      {/* scrubber */}
      <div className="px-4 pt-3">
        <label htmlFor="night-scrub" className="sr-only">
          Time of night
        </label>
        <input
          id="night-scrub"
          type="range"
          min={0}
          max={END}
          step={1}
          value={Math.round(now)}
          onChange={(e) => setT(Number(e.target.value))}
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          className="night-range w-full"
        />
        <div className="relative -mt-1 h-2" aria-hidden>
          {NIGHT.map((l) => (
            <span key={l.at} className={`absolute top-0 h-2 w-0.5 rounded ${l.at <= now ? STAMP[l.stamp].split(" ")[0].replace("text-", "bg-") : "bg-border-strong"}`} style={{ left: `${(l.at / END) * 100}%` }} />
          ))}
        </div>
      </div>

      {/* ledger lines */}
      <ol className="h-[308px] space-y-0 overflow-hidden px-4 pb-2 pt-2 font-mono text-[12px]" aria-live="off">
        {shown.length === 0 && <li className="py-10 text-center text-text-3">Your agents start their shift…</li>}
        {shown
          .slice(-5)
          .reverse()
          .map((l) => (
            <li key={l.at} className="ledger-line flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0">
              <span className="w-10 shrink-0 text-text-3">{clock(l.at)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text">{l.item}</span>
                <span className="block truncate text-[11px] text-text-3">
                  {l.agent} · {l.note}
                </span>
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums text-text-2">{usd(l.amount)}</span>
              <span className={`stamp-mini shrink-0 ${STAMP[l.stamp]}`}>{l.stamp}</span>
            </li>
          ))}
      </ol>

      {/* totals */}
      <div className="grid grid-cols-4 border-t border-border bg-surface-2/40 font-mono text-[11px]">
        {[
          ["Paid", usd(paid), "text-text"],
          ["Saved", usd(saved), "text-info"],
          ["Stopped", usd(stopped), "text-danger"],
          ["Waiting", String(waiting), "text-warning"],
        ].map(([k, v, c]) => (
          <div key={k} className="border-r border-border px-3 py-2.5 last:border-0">
            <p className="text-text-3">{k}</p>
            <p className={`mt-0.5 text-[14px] font-semibold tabular-nums ${c}`}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const STARS: [number, number, number][] = [
  [6, 18, 2], [14, 52, 1], [21, 30, 2], [29, 12, 1], [37, 44, 2], [44, 22, 1], [52, 58, 1], [58, 16, 2], [66, 40, 1], [73, 10, 2], [81, 34, 1], [88, 20, 2], [94, 48, 1], [11, 70, 1], [63, 66, 1],
];
