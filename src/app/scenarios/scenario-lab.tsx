"use client";
// The attack lab: every scenario as a card with Run, plus Run all with live progress and a final scoreboard.
// Results come from the public API (isolated sandbox, simulated providers, no money moves).
import { Ban, CheckCircle2, Clock, Play, PlayCircle, Repeat2, XCircle } from "lucide-react";
import { useState } from "react";
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

type CardState = { kind: "idle" } | { kind: "running" } | { kind: "done"; r: RunView } | { kind: "error"; message: string };
type AllState =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; ok: number; total: number; plain: bigint; aerar: bigint }
  | { kind: "error"; message: string };

const usd = (atomic: bigint) => `$${(Number(atomic) / 1e6).toFixed(2)}`;

export function ScenarioLab({ groups }: { groups: LabGroup[] }) {
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [all, setAll] = useState<AllState>({ kind: "idle" });
  const total = groups.reduce((n, g) => n + g.scenarios.length, 0);
  const set = (id: string, s: CardState) => setCards((c) => ({ ...c, [id]: s }));

  async function runOne(id: string) {
    set(id, { kind: "running" });
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
    setCards(Object.fromEntries(groups.flatMap((g) => g.scenarios.map((s) => [s.id, { kind: "running" } as CardState]))));
    try {
      const res = await fetch("/api/scenarios/run-all", { method: "POST" });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setCards({});
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
            setCards({});
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

  return (
    <div>
      <RunAllBar state={all} total={total} onRun={runAll} />
      <div className="mt-10 space-y-12">
        {groups.map((g, i) => (
          <section key={g.id} id={g.id} className="scroll-mt-24" aria-labelledby={`h-${g.id}`}>
            <h2 id={`h-${g.id}`} className="flex items-baseline gap-3 text-lg font-semibold tracking-tight">
              <span className="tabular text-xs font-medium text-brass">{String(i + 1).padStart(2, "0")}</span>
              {g.title}
            </h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {g.scenarios.map((s) => (
                <ScenarioCard key={s.id} s={s} state={cards[s.id] ?? { kind: "idle" }} onRun={() => runOne(s.id)} disabled={all.kind === "running"} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RunAllBar({ state, total, onRun }: { state: AllState; total: number; onRun: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {state.kind === "done" ? (
            <>
              <p className="text-lg font-semibold tracking-tight">
                <span className={state.ok === state.total ? "text-success" : "text-danger"}>
                  {state.ok} of {state.total}
                </span>{" "}
                scenarios handled correctly
              </p>
              <p className="tabular mt-0.5 text-sm text-text-2">
                A plain agent wallet would have paid <span className="font-medium text-danger">{usd(state.plain)}</span>. Aerar paid{" "}
                <span className="font-medium text-success">{usd(state.aerar)}</span>, all of it for things the task allowed.
              </p>
            </>
          ) : state.kind === "running" ? (
            <p className="text-sm">
              Running scenario <span className="tabular font-medium">{Math.min(state.done + 1, state.total)}</span> of {state.total}…
            </p>
          ) : state.kind === "error" ? (
            <p className="text-sm text-danger">{state.message}</p>
          ) : (
            <>
              <p className="font-medium">Run all {total} in about five seconds</p>
              <p className="text-sm text-text-2">Each one plays on a fresh, isolated database with simulated providers. No wallet, no money moves.</p>
            </>
          )}
        </div>
        <Button variant="primary" size="lg" onClick={onRun} loading={state.kind === "running"} icon={<PlayCircle className="size-4" aria-hidden />}>
          {state.kind === "done" ? "Run all again" : "Run all"}
        </Button>
      </div>
      {state.kind === "running" && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done} aria-label="Scenarios finished">
          <div className="h-full bg-brand transition-[width] duration-200 ease-out" style={{ width: `${(state.done / state.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function lineTone(line: string): { icon: typeof CheckCircle2; cls: string } {
  if (/^Reused|^Returned/.test(line)) return { icon: Repeat2, cls: "text-info" };
  if (/^Paid/.test(line) && !/FAILED/.test(line)) return { icon: CheckCircle2, cls: "text-success" };
  if (/^(Declined|Rejected|Not paid)/.test(line) || /BROKEN|FAILED|BAD/.test(line)) return { icon: Ban, cls: "text-danger" };
  if (/^(Held|unknown)/.test(line)) return { icon: Clock, cls: "text-warning" };
  return { icon: Play, cls: "text-text-2" };
}

function ScenarioCard({ s, state, onRun, disabled }: { s: LabScenario; state: CardState; onRun: () => void; disabled: boolean }) {
  return (
    <article id={s.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[15px] font-semibold leading-5">{s.title}</h3>
        <Button size="sm" variant={state.kind === "done" ? "ghost" : "secondary"} onClick={onRun} loading={state.kind === "running"} disabled={disabled} icon={<Play className="size-3.5" aria-hidden />}>
          {state.kind === "done" ? "Again" : "Run"}
        </Button>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-text-2">{s.story}</p>
      <p className="mt-2 text-[13px] leading-5">
        <span className="font-medium text-brass">Aerar should </span>
        {s.expected.charAt(0).toLowerCase() + s.expected.slice(1)}
      </p>

      <div aria-live="polite" className="mt-auto">
        {state.kind === "error" && <p className="mt-3 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{state.message}</p>}
        {state.kind === "done" && <Result r={state.r} />}
      </div>
    </article>
  );
}

function Result({ r }: { r: RunView }) {
  const saved = BigInt(r.plainWallet) - BigInt(r.aerarPaid);
  return (
    <div className="mt-4 animate-arrive rounded-lg border border-border bg-bg p-3.5">
      <ol className="space-y-1.5">
        {r.timeline.map((line, i) => {
          const t = lineTone(line);
          const Icon = t.icon;
          return (
            <li key={i} className="flex gap-2 text-[13px] leading-5">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${t.cls}`} aria-hidden />
              <span className={t.cls === "text-text-2" ? "text-text-2" : ""}>{line}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[13px] font-medium">{r.verdict}</p>
      <dl className="tabular mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-md bg-danger-tint px-2.5 py-1.5">
          <dt className="text-xs text-danger">Plain wallet would pay</dt>
          <dd className="font-semibold text-danger">{r.plainWalletFormatted}</dd>
        </div>
        <div className="rounded-md bg-success-tint px-2.5 py-1.5">
          <dt className="text-xs text-success">Aerar paid</dt>
          <dd className="font-semibold text-success">
            {r.aerarPaidFormatted}
            {saved > 0n && <span className="ml-1 font-normal">· {usd(saved)} kept</span>}
          </dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-1">
        {r.checks.passed.map((c) => (
          <li key={c} className="flex gap-1.5 text-xs text-text-2">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
            <span>
              <span className="sr-only">Passed: </span>
              {c}
            </span>
          </li>
        ))}
        {r.checks.failed.map((c) => (
          <li key={c} className="flex gap-1.5 text-xs text-danger">
            <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="sr-only">Failed: </span>
              {c}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-text-2">Ran in {r.ms} ms on an isolated database · simulated providers</p>
    </div>
  );
}
