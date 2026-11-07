"use client";
// Agents hiring agents, in the sandbox: your agent hires a scout for part of the job. The scout gets a smaller budget
// and fewer shops; its spend counts against your task; pausing your task stops the scout too.
import { Bot, CornerDownRight, Loader2, Pause, Play, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hireHelper, scoutBuy, toggleLead, type TryResult } from "./actions";

type Member = { taskId: string; title: string; status: string; agentName: string; budget: string; spent: string; pct: number };

const BUYS = [
  { kind: "competitors", label: "Competitor list · $0.03", shows: "its job, its shop: paid" },
  { kind: "dataset", label: "Full dataset · $0.12", shows: "allowed, counts up to you" },
  { kind: "fx", label: "FX rates · $0.01", shows: "not one of its shops: refused" },
];

export function AgentTeam({ team, leadStatus, leadSpent, leadBudget, onResult }: { team: Member[]; leadStatus: string; leadSpent: string; leadBudget: string; onResult: (r: TryResult) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<TryResult>) => {
    setWhich(key);
    start(async () => {
      onResult(await fn());
      router.refresh();
      setWhich(null);
    });
  };
  const scout = team[0];
  const paused = leadStatus !== "active";
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card" aria-labelledby="team-try">
      <h2 id="team-try" className="flex items-center gap-2 text-[15px] font-semibold">
        <UserPlus className="size-4 text-accent" aria-hidden /> Agents hiring agents
      </h2>
      <p className="mt-1 text-[12.5px] leading-5 text-text-3">
        Your agent can hand part of the job to another agent. The hire gets a smaller budget and fewer shops, never more than yours.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-bg/30 p-3 font-mono text-[12px]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Bot className="size-4 text-text-2" aria-hidden /> my-agent
          </span>
          <span className={`shrink-0 whitespace-nowrap ${paused ? "text-warning" : "text-text-2"}`}>
            {paused ? "PAUSED" : `${leadSpent} of ${leadBudget}`}
          </span>
        </div>
        {scout ? (
          <div className="mt-2 pl-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <CornerDownRight className="size-3.5 shrink-0 text-text-3" aria-hidden />
                <Bot className="size-4 shrink-0 text-accent" aria-hidden /> {scout.agentName}
                <span className="truncate text-text-3">· {scout.title}</span>
              </span>
              <span className={`shrink-0 whitespace-nowrap ${paused || scout.status !== "active" ? "text-warning" : "text-text-2"}`}>{paused ? "STOPPED" : `${scout.spent} of ${scout.budget}`}</span>
            </div>
            <div className="ml-6 mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.min(100, scout.pct)}%` }} />
            </div>
          </div>
        ) : (
          <p className="mt-2 pl-6 text-text-3">no hires yet</p>
        )}
      </div>

      {!scout ? (
        <button onClick={() => run("hire", hireHelper)} disabled={pending} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary active:scale-[0.98] disabled:opacity-60">
          {pending && which === "hire" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UserPlus className="size-3.5" aria-hidden />}
          Let my agent hire a scout · $0.30
        </button>
      ) : (
        <>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-text-3">The scout tries to buy</p>
          <div className="mt-1.5 space-y-1.5">
            {BUYS.map((b) => (
              <button
                key={b.kind}
                onClick={() => run(b.kind, () => scoutBuy(b.kind))}
                disabled={pending}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-[12.5px] transition hover:border-border-strong active:scale-[0.99] disabled:opacity-60"
              >
                <span className="font-medium">{b.label}</span>
                <span className="flex items-center gap-2 text-text-3">
                  {pending && which === b.kind && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {b.shows}
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => run("toggle", toggleLead)} disabled={pending} className={`mt-3 inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-medium active:scale-[0.98] disabled:opacity-60 ${paused ? "border-border" : "border-warning/50 text-warning"}`}>
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            {paused ? "Resume my agent's task" : "Pause my agent (stops the scout too)"}
          </button>
        </>
      )}
    </section>
  );
}
