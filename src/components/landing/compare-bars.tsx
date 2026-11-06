"use client";
// Plain wallet vs Aerar for the same scripted night: two bars that grow when they scroll into view.
import { useEffect, useRef, useState } from "react";

export interface CompareRow {
  label: string;
  plain: string;
  aerar: string;
  plainBad: boolean;
  aerarBad: boolean;
}

export function CompareBars({
  plainTotal,
  aerarTotal,
  plainPct,
  aerarPct,
  plainPayments,
  aerarPayments,
  rows,
}: {
  plainTotal: string;
  aerarTotal: string;
  plainPct: number;
  aerarPct: number;
  plainPayments: number;
  aerarPayments: number;
  rows: CompareRow[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setOn(true), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-7">
      <div className="space-y-5">
        <Bar label="Plain agent wallet" sub={`${plainPayments} payments`} total={plainTotal} pct={on ? plainPct : 0} tone="bg-danger" text="text-danger" />
        <Bar label="With Aerar" sub={`${aerarPayments} payments`} total={aerarTotal} pct={on ? aerarPct : 0} tone="bg-success" text="text-success" delay />
      </div>
      <dl className="mt-7 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
            <dt className="text-[13px] text-text-2">{r.label}</dt>
            <dd className="tabular flex shrink-0 items-center gap-2 text-[13px]">
              <span className={r.plainBad ? "text-danger line-through decoration-danger/40" : "text-text-3"}>{r.plain}</span>
              <span className="text-text-3" aria-hidden>→</span>
              <span className={`font-semibold ${r.aerarBad ? "text-warning" : "text-success"}`}>{r.aerar}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Bar({ label, sub, total, pct, tone, text, delay }: { label: string; sub: string; total: string; pct: number; tone: string; text: string; delay?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {label} <span className="font-normal text-text-3">· {sub}</span>
        </span>
        <span className={`tabular text-2xl font-semibold tracking-tight ${text}`}>{total}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${tone} transition-[width] duration-1000 ease-out`}
          style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`, transitionDelay: delay ? "250ms" : "0ms" }}
        />
      </div>
    </div>
  );
}
