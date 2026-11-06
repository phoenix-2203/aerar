"use client";
// One scenario: story, expected behaviour, and a Run button that plays it on the server in an isolated stage.
import { useState } from "react";

export interface ScenarioInfo {
  id: string;
  title: string;
  story: string;
  expected: string;
}

interface RunResult {
  timeline: string[];
  verdict: string;
  checks: { passed: string[]; failed: string[] };
  ok: boolean;
  ms: number;
}

type State = { kind: "idle" } | { kind: "running" } | { kind: "done"; r: RunResult } | { kind: "error"; message: string };

function tone(line: string) {
  if (/^(Paid|Reused|Returned)/.test(line)) return "text-paid";
  if (/^(Declined|Rejected|Not paid)/.test(line) || /BROKEN|FAILED|BAD/.test(line)) return "text-refused";
  if (/^(Held|unknown)/.test(line)) return "text-wait";
  return "text-muted";
}

export function ScenarioCard({ s }: { s: ScenarioInfo }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    setState({ kind: "running" });
    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(s.id)}/run`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setState({ kind: "error", message: body?.message ?? `Couldn't run it (HTTP ${res.status}).` });
      setState({ kind: "done", r: body as RunResult });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <article id={s.id} className="rounded-2xl border border-line bg-panel/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.story}</p>
          <p className="mt-2 text-sm">
            <span className="text-lamp">Aerar should: </span>
            {s.expected}
          </p>
        </div>
        <button
          onClick={run}
          disabled={state.kind === "running"}
          className="shrink-0 rounded-lg bg-lamp px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {state.kind === "running" ? "Running…" : state.kind === "done" ? "Run again" : "Run"}
        </button>
      </div>

      <div aria-live="polite">
        {state.kind === "error" && <p className="mt-4 rounded-lg bg-refused-soft px-3 py-2 text-sm text-refused">{state.message}</p>}
        {state.kind === "done" && (
          <div className="mt-4 rounded-xl border border-line bg-night/70 p-4">
            <ol className="space-y-1.5 border-l border-line pl-4 text-sm">
              {state.r.timeline.map((line, i) => (
                <li key={i} className={tone(line)}>
                  {line}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm">
              <span className="font-medium text-lamp">Result: </span>
              {state.r.verdict}
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {state.r.checks.passed.map((c) => (
                <li key={c} className="text-paid">
                  ✓ <span className="text-muted">{c}</span>
                </li>
              ))}
              {state.r.checks.failed.map((c) => (
                <li key={c} className="text-refused">
                  ✗ {c}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-faint">
              {state.r.ok ? "All checks passed" : "Some checks failed"} · ran in {state.r.ms} ms on a fresh, isolated database · simulated
              providers, no money moved
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
