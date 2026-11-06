"use client";
// The seven pipeline steps grouped into three moments a person can hold in their head: check, pay, prove.
// Pick a moment to see its steps. Keyboard: arrow keys move between tabs.
import { BadgeCheck, Coins, ShieldCheck } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { STEP_INFO, STEP_ORDER, type StepId } from "@/lib/copy/steps";

const PHASES: { id: string; icon: typeof ShieldCheck; title: string; line: string; steps: StepId[] }[] = [
  { id: "check", icon: ShieldCheck, title: "Check", line: "Rules first. A disallowed provider never even gets a request.", steps: ["access", "memory", "quote", "policy"] },
  { id: "pay", icon: Coins, title: "Pay exactly", line: "The approved quote, nothing else. A changed price pays nothing.", steps: ["reserve", "pay"] },
  { id: "prove", icon: BadgeCheck, title: "Prove", line: "Every transfer checked on Base and sealed in a tamper-evident log.", steps: ["onchain"] },
];

export function HowItWorks() {
  const [sel, setSel] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent) {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (sel + d + PHASES.length) % PHASES.length;
    setSel(n);
    tabs.current[n]?.focus();
  }
  const phase = PHASES[sel];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div role="tablist" aria-label="How Aerar handles a request" aria-orientation="vertical" className="flex flex-col gap-2" onKeyDown={onKey}>
        {PHASES.map((p, i) => {
          const Icon = p.icon;
          const on = i === sel;
          return (
            <button
              key={p.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={on}
              aria-controls={`panel-${p.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setSel(i)}
              className={`group flex items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 ${on ? "border-border-strong bg-surface shadow-card" : "border-transparent hover:bg-surface/60"}`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${on ? "bg-accent-tint text-accent" : "bg-surface-2 text-text-2 group-hover:text-text"}`}>
                <Icon className={`size-5 transition-transform duration-300 ${on ? "scale-110" : "group-hover:scale-105"}`} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  <span className="tabular text-xs font-medium text-text-3">0{i + 1}</span>
                  {p.title}
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-5 text-text-2">{p.line}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        key={phase.id}
        role="tabpanel"
        id={`panel-${phase.id}`}
        aria-labelledby={`tab-${phase.id}`}
        className="animate-arrive rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6"
      >
        <ol className="space-y-0">
          {phase.steps.map((id, i) => (
            <li key={id} className="relative flex gap-4 pb-5 last:pb-0 [animation:record-in_300ms_cubic-bezier(0.2,0.8,0.2,1)_both]" style={{ animationDelay: `${i * 70}ms` }}>
              {i < phase.steps.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-24px)] w-px bg-border" aria-hidden />}
              <span className="tabular relative grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold">
                {STEP_ORDER.indexOf(id) + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <h3 className="text-sm font-semibold">{STEP_INFO[id].title}</h3>
                <p className="mt-0.5 text-[13.5px] leading-5 text-text-2">{STEP_INFO[id].does}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-border pt-4 text-[13px] text-text-3">
          Plain code in a fixed order. No AI decides about money, and nothing the agent says can change a decision.
        </p>
      </div>
    </div>
  );
}
