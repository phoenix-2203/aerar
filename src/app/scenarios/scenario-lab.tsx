"use client";
// The attack lab: pick a problem on the left, open a scenario, press Run and watch the real pipeline answer.
// "Run all" plays every scenario with live progress and a scoreboard. Results come from the public API
// (isolated sandbox, simulated providers, no money moves).
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy as CopyIcon,
  Gauge,
  Crosshair,
  Loader2,
  Play,
  Repeat2,
  ScrollText,
  ShieldAlert,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";

export interface LabScenario {
  id: string;
  title: string;
  story: string;
  expected: string;
}
export interface LabGroup {
  id: string;
  title: string;
  short: string;
  scenarios: LabScenario[];
}

interface RunView {
  id: string;
  ok: boolean;
  timeline: string[];
  verdict: string;
  checks: { passed: string[]; failed: string[] };
  plainWallet: string;
  aerarPaid: string;
  plainWalletFormatted: string;
  aerarPaidFormatted: string;
  ms: number;
}

type RunState = { kind: "idle" } | { kind: "running" } | { kind: "done"; r: RunView } | { kind: "error"; message: string };
type AllState =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; ok: number; total: number; plain: bigint; aerar: bigint }
  | { kind: "error"; message: string };

const usd = (atomic: bigint) => `$${(Number(atomic) / 1e6).toFixed(2)}`;

const GROUP_ICON: Record<string, LucideIcon> = {
  intent: Crosshair,
  injection: ShieldAlert,
  duplicate: CopyIcon,
  mismatch: AlertTriangle,
  evidence: ScrollText,
  oversight: UserCheck,
  runaway: Gauge,
};

export function ScenarioLab({ groups }: { groups: LabGroup[] }) {
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [all, setAll] = useState<AllState>({ kind: "idle" });
  const [sel, setSel] = useState(groups[0]?.id ?? "");
  const [open, setOpen] = useState<string | null>(groups[0]?.scenarios[0]?.id ?? null);
  const total = groups.reduce((n, g) => n + g.scenarios.length, 0);
  const set = (id: string, s: RunState) => setRuns((c) => ({ ...c, [id]: s }));

  // Deep links: /scenarios#injection selects that problem.
  useEffect(() => {
    const t = setTimeout(() => {
      const g = groups.find((x) => x.id === window.location.hash.slice(1));
      if (g) {
        setSel(g.id);
        setOpen(g.scenarios[0]?.id ?? null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [groups]);

  function pick(id: string) {
    setSel(id);
    const g = groups.find((x) => x.id === id);
    setOpen(g?.scenarios[0]?.id ?? null);
    history.replaceState(null, "", `#${id}`);
  }

  async function runOne(id: string) {
    set(id, { kind: "running" });
    setOpen(id);
    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(id)}/run`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) return set(id, { kind: "error", message: body?.message ?? `Couldn't run it (HTTP ${res.status}). Try again in a moment.` });
      set(id, { kind: "done", r: body as RunView });
    } catch {
      set(id, { kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  async function runAll() {
    setAll({ kind: "running", done: 0, total });
    setRuns(Object.fromEntries(groups.flatMap((g) => g.scenarios.map((s) => [s.id, { kind: "running" } as RunState]))));
    try {
      const res = await fetch("/api/scenarios/run-all", { method: "POST" });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setRuns({});
        return setAll({ kind: "error", message: body?.message ?? `Couldn't run the lab (HTTP ${res.status}).` });
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let done = 0;
      let plain = 0n;
      let aerar = 0n;
      let ok = 0;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "result") {
            done++;
            if (msg.ok) ok++;
            plain += BigInt(msg.plainWallet);
            aerar += BigInt(msg.aerarPaid);
            set(msg.id, { kind: "done", r: msg as RunView });
            setAll({ kind: "running", done, total });
          } else if (msg.type === "error") {
            done++;
            set(msg.id, { kind: "error", message: msg.message });
          } else if (msg.type === "busy") {
            setRuns({});
            return setAll({ kind: "error", message: msg.message });
          } else if (msg.type === "done") {
            setAll({ kind: "done", ok, total: msg.total, plain, aerar });
          }
        }
      }
    } catch {
      setAll({ kind: "error", message: "The connection dropped. Results so far are shown; run the rest one by one." });
    }
  }

  const group = groups.find((g) => g.id === sel) ?? groups[0];

  return (
    <div>
      <Scoreboard state={all} total={total} onRun={runAll} />

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
        {/* Problems */}
        <nav aria-label="Problems" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 hidden px-3 text-xs font-medium uppercase tracking-wider text-text-3 lg:block">Problems</p>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
            {groups.map((g) => {
              const Icon = GROUP_ICON[g.id] ?? ShieldAlert;
              const on = g.id === group.id;
              const res = g.scenarios.map((s) => runs[s.id]);
              const done = res.filter((r) => r?.kind === "done");
              const bad = done.some((r) => r?.kind === "done" && !r.r.ok);
              return (
                <li key={g.id} className="shrink-0">
                  <button
                    onClick={() => pick(g.id)}
                    aria-current={on ? "true" : undefined}
                    className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-[13.5px] transition-colors lg:border-transparent ${on ? "border-border-strong bg-surface font-medium text-text shadow-card lg:border-border" : "border-border text-text-2 hover:bg-surface hover:text-text"}`}
                  >
                    <Icon className={`size-4 shrink-0 transition-colors ${on ? "text-accent" : "text-text-3 group-hover:text-text-2"}`} aria-hidden />
                    <span className="flex-1 whitespace-nowrap lg:whitespace-normal">{g.short}</span>
                    {done.length === g.scenarios.length && done.length > 0 ? (
                      bad ? <XCircle className="size-4 text-danger" aria-label="A check failed" /> : <CheckCircle2 className="size-4 animate-pop text-success" aria-label="All handled" />
                    ) : (
                      <span className="tabular rounded-full bg-surface-2 px-1.5 text-[11px] text-text-2">{g.scenarios.length}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Scenarios of the selected problem */}
        <section key={group.id} className="min-w-0 animate-arrive" aria-labelledby="problem-title">
          <h2 id="problem-title" className="text-xl font-semibold tracking-tight">
            {group.title}
          </h2>
          <p className="mt-1 text-[13.5px] text-text-2">
            {group.scenarios.length} scenario{group.scenarios.length === 1 ? "" : "s"}. Open one and press Run.
          </p>
          <ul className="mt-5 space-y-2">
            {group.scenarios.map((s) => (
              <ScenarioRow
                key={s.id}
                s={s}
                state={runs[s.id] ?? { kind: "idle" }}
                open={open === s.id}
                onToggle={() => setOpen(open === s.id ? null : s.id)}
                onRun={() => runOne(s.id)}
                disabled={all.kind === "running"}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Scoreboard({ state, total, onRun }: { state: AllState; total: number; onRun: () => void }) {
  const running = state.kind === "running";
  const done = state.kind === "done" ? state : null;
  const pct = state.kind === "running" ? (state.done / state.total) * 100 : done ? 100 : 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card" aria-live="polite">
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid grid-cols-3 divide-x divide-border">
          <Stat label="Handled" value={done ? `${done.ok}/${done.total}` : running ? `${state.done}/${state.total}` : `–/${total}`} tone={done ? (done.ok === done.total ? "text-success" : "text-danger") : ""} />
          <Stat label="Plain wallet" value={done ? usd(done.plain) : "–"} tone={done ? "text-danger" : ""} />
          <Stat label="With Aerar" value={done ? usd(done.aerar) : "–"} tone={done ? "text-success" : ""} />
        </div>
        <div className="flex items-center justify-center border-t border-border p-4 sm:border-l sm:border-t-0 sm:px-6">
          <Button variant="primary" size="lg" onClick={onRun} loading={running} icon={<Play className="size-4" aria-hidden />} className="w-full sm:w-auto">
            {running ? "Running…" : done ? "Run all again" : `Run all ${total}`}
          </Button>
        </div>
      </div>
      <div className="h-1 bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Scenarios finished">
        <div className={`h-full transition-[width] duration-300 ease-out ${done ? (done.ok === done.total ? "bg-success" : "bg-danger") : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      {state.kind === "error" && <p className="border-t border-border bg-danger-tint px-5 py-3 text-sm text-danger">{state.message}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
      <div className="truncate text-xs text-text-3">{label}</div>
      <div key={value} className={`tabular mt-1 animate-arrive text-xl font-semibold tracking-tight sm:text-2xl ${tone}`}>
        {value}
      </div>
    </div>
  );
}

function RowIcon({ state }: { state: RunState }) {
  if (state.kind === "running") return <Loader2 className="size-[18px] animate-spin text-text-2" aria-label="Running" />;
  if (state.kind === "done")
    return state.r.ok ? <CheckCircle2 className="size-[18px] animate-pop text-success" aria-label="Handled correctly" /> : <XCircle className="size-[18px] animate-pop text-danger" aria-label="A check failed" />;
  if (state.kind === "error") return <AlertTriangle className="size-[18px] text-warning" aria-label="Couldn't run" />;
  return <span className="block size-[18px] rounded-full border-2 border-dashed border-border-strong" aria-hidden />;
}

function ScenarioRow({ s, state, open, onToggle, onRun, disabled }: { s: LabScenario; state: RunState; open: boolean; onToggle: () => void; onRun: () => void; disabled: boolean }) {
  return (
    <li id={s.id} className={`overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] duration-200 ${open ? "border-border-strong shadow-card" : "border-border hover:border-border-strong"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <RowIcon state={state} />
        <button onClick={onToggle} aria-expanded={open} aria-controls={`body-${s.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1 text-[14px] font-medium leading-5">{s.title}</span>
          <ChevronDown className={`size-4 shrink-0 text-text-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <Button size="sm" variant={state.kind === "done" ? "ghost" : "secondary"} onClick={onRun} loading={state.kind === "running"} disabled={disabled} icon={<Play className="size-3.5" aria-hidden />}>
          {state.kind === "done" ? "Again" : "Run"}
        </Button>
      </div>
      <div id={`body-${s.id}`} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-4 pb-4 pt-3 sm:pl-[46px]">
            <p className="text-[13.5px] leading-5 text-text-2">{s.story}</p>
            <p className="mt-2 flex gap-2 text-[13.5px] leading-5">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <span>{s.expected}</span>
            </p>
            <div aria-live="polite">
              {state.kind === "error" && <p className="mt-3 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{state.message}</p>}
              {state.kind === "running" && (
                <div className="mt-4 space-y-2" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-4 rounded" style={{ width: `${80 - i * 15}%` }} />
                  ))}
                </div>
              )}
              {state.kind === "done" && <Result r={state.r} />}
              {state.kind === "idle" && (
                <button onClick={onRun} disabled={disabled} className="group mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-2 hover:text-text disabled:opacity-50">
                  <Play className="size-3.5 transition-transform group-hover:scale-110" aria-hidden />
                  Run it through the real pipeline
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function lineTone(line: string): { icon: LucideIcon; cls: string } {
  if (/^Reused|^Returned/.test(line)) return { icon: Repeat2, cls: "text-info" };
  if (/^Paid/.test(line) && !/FAILED/.test(line)) return { icon: CheckCircle2, cls: "text-success" };
  if (/^(Declined|Rejected|Not paid)/.test(line) || /BROKEN|FAILED|BAD/.test(line)) return { icon: Ban, cls: "text-danger" };
  if (/^(Held|Needs approval|unknown)/.test(line)) return { icon: Clock, cls: "text-warning" };
  return { icon: ArrowRight, cls: "text-text-3" };
}

function Result({ r }: { r: RunView }) {
  const saved = BigInt(r.plainWallet) - BigInt(r.aerarPaid);
  return (
    <div className="mt-4 space-y-4">
      <ol className="space-y-1.5 rounded-lg bg-bg p-3">
        {r.timeline.map((line, i) => {
          const t = lineTone(line);
          const Icon = t.icon;
          return (
            <li key={i} className="flex gap-2 text-[13px] leading-5 [animation:record-in_280ms_cubic-bezier(0.2,0.8,0.2,1)_both]" style={{ animationDelay: `${i * 90}ms` }}>
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${t.cls}`} aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">{line}</span>
            </li>
          );
        })}
      </ol>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <p className="text-[13.5px] font-medium [overflow-wrap:anywhere]">{r.verdict}</p>
        <Amount label="Plain wallet" value={r.plainWalletFormatted} cls={saved > 0n ? "text-danger" : "text-text-2"} />
        <Amount label="Aerar" value={r.aerarPaidFormatted} cls="text-success" />
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {r.checks.passed.map((c) => (
          <li key={c} className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs text-success">
            <CheckCircle2 className="size-3" aria-hidden />
            <span className="sr-only">Passed: </span>
            {c}
          </li>
        ))}
        {r.checks.failed.map((c) => (
          <li key={c} className="inline-flex items-center gap-1 rounded-full bg-danger-tint px-2 py-0.5 text-xs text-danger">
            <XCircle className="size-3" aria-hidden />
            <span className="sr-only">Failed: </span>
            {c}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-3">
        {r.ms} ms · isolated database · simulated providers{saved > 0n ? ` · ${usd(saved)} kept` : ""}
      </p>
    </div>
  );
}

function Amount({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-1.5 text-right">
      <div className="text-[11px] text-text-3">{label}</div>
      <div className={`tabular text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
