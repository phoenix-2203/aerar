"use client";
// The sandbox console: 1) your rules, 2) ask your agent to buy, 3) what happened. Plus "connect your own agent".
import { ArrowRight, Bot, Check, ChevronDown, Crosshair, FileCheck2, ListChecks, Play, RotateCcw, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { PurchaseTimeline } from "@/components/purchase-timeline";
import { ConnectAi } from "@/components/connect-ai";
import { NotifyCard } from "@/components/notify-card";
import { ReceiptButton } from "@/components/receipt-slip";
import { EvidenceButton } from "@/components/evidence-button";
import { CATEGORIES, categoriesForPurpose } from "@/lib/intent/intentlock";
import { FRESHNESS } from "@/lib/memory/freshness";
import { AgentTeam } from "./agent-team";
import { StatusChip } from "@/components/status-chip";
import { explain, reasonKind } from "@/lib/copy/reasons";
import type { TryState } from "@/lib/try/sandbox";
import { agentBuy, decideTry, resetSandbox, saveRules, startSandbox, type TryResult } from "./actions";

interface ProviderView {
  host: string;
  name: string;
  attacker: boolean;
  items: { key: string; url: string; name: string; price: string }[];
}

export function StartButton() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="primary"
        size="lg"
        loading={pending}
        onClick={() => start(async () => setErr((await startSandbox())?.error ?? null))}
        trailing={<ArrowRight className="size-4" aria-hidden />}
      >
        Create my sandbox
      </Button>
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}

const usd = (atomic: string) => (Number(atomic) / 1e6).toFixed(2);

export function TryConsole({
  state,
  presets,
  providers,
  apiKey,
  site,
}: {
  state: TryState;
  presets: { id: string; label: string; shows: string }[];
  providers: ProviderView[];
  apiKey: string;
  taskId: string;
  site: string;
}) {
  const [running, setRunning] = useState<string | null>(null);
  const [flash, setFlash] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function after(r: TryResult) {
    if (r?.error) setToast({ tone: "err", text: r.error });
    if (r?.ids?.length) {
      setFlash(r.ids);
      setOpen(r.ids[r.ids.length - 1]);
      setTimeout(() => document.getElementById("activity")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  }

  function run(key: string, input: Parameters<typeof agentBuy>[0]) {
    setRunning(key);
    start(async () => {
      after(await agentBuy(input));
      setRunning(null);
    });
  }

  const waiting = state.purchases.filter((p) => p.status === "awaiting_approval");
  const used = Number(state.task.spent) + Number(state.task.reserved);
  const pct = Math.min(100, (used / Math.max(1, Number(state.task.budget))) * 100);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Your sandbox · simulated shops · nothing real is spent</p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[36px]">{state.task.title}</h1>
          <div className="mt-3 flex max-w-md items-center gap-3 text-[13px] text-text-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular shrink-0">
              {state.task.spentFormatted} of {state.task.budgetFormatted} · {state.task.leftFormatted} left
            </span>
          </div>
          {state.task.forecast && <p className="mt-1.5 font-mono text-[11.5px] text-text-3">{state.task.forecast}</p>}
        </div>
        <form action={resetSandbox}>
          <Button type="submit" variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" aria-hidden />}>
            Start over
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Guide state={state} running={running} onRun={(id) => run(id, { preset: id })} />
          {/* 2. Ask your agent */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6" aria-labelledby="ask">
            <StepHead n={1} id="ask" title="Ask your agent to buy something" sub="Each button is one thing that really happens to agents. Watch how your rules answer." />
            <ol className="mt-5 divide-y divide-dashed divide-border overflow-hidden rounded-xl border border-border bg-bg/30">
              {presets.map((p, i) => (
                <li key={p.id}>
                  <button
                    onClick={() => run(p.id, { preset: p.id })}
                    disabled={!!running}
                    className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2/60 disabled:opacity-60"
                  >
                    <span className="w-6 shrink-0 font-mono text-[12px] text-text-3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-5">{p.label}</span>
                      <span className="mt-0.5 block font-mono text-[11.5px] text-text-3">{p.shows}</span>
                    </span>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-text-2 transition-all duration-200 group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent">
                      {running === p.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Play className="size-3.5 translate-x-px" aria-hidden />}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <CustomRequest providers={providers} disabled={!!running} onRun={(url, purpose) => run("custom", { url, purpose })} busy={running === "custom"} />
          </section>

          {/* Waiting for you */}
          {waiting.length > 0 && (
            <section className="space-y-2" aria-label="Needs your approval">
              {waiting.map((p) => (
                <Approval key={p.id} p={p} onDone={after} />
              ))}
            </section>
          )}

          {/* 3. What happened */}
          <section id="activity" className="scroll-mt-20 rounded-2xl border border-border bg-surface shadow-card" aria-labelledby="happened">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <StepHead n={2} id="happened" title="What happened" sub="Your sandbox's morning report. Open any purchase to see every step." />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Paid" value={state.totals.paid} sub={`${state.totals.paidCount} purchases`} tone="text-success" />
                <Mini label="Saved by reuse" value={state.totals.saved} sub={`${state.totals.reusedCount} reused`} tone="text-info" />
                <Mini label="Declined" value={String(state.totals.declined)} sub="nothing paid" tone="text-danger" />
                <Mini label="Needs you" value={String(state.totals.waiting)} sub="waiting" tone="text-warning" />
              </div>
            </div>
            {state.purchases.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bot className="mx-auto size-6 text-text-3" aria-hidden />
                <p className="mt-2 font-medium">Nothing bought yet</p>
                <p className="mt-1 text-sm text-text-2">Press a request above. Start with &ldquo;Buy today&apos;s FX rates&rdquo;.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {state.purchases.map((p) => (
                  <Row key={p.id} p={p} open={open === p.id} flash={flash.includes(p.id)} onToggle={() => setOpen(open === p.id ? null : p.id)} />
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-text-3 sm:px-6">
              <ShieldCheck className={`size-3.5 ${state.chain.ok ? "text-success" : "text-danger"}`} aria-hidden />
              {state.chain.ok ? `Audit log intact: ${state.chain.count} entries, each sealed to the one before.` : `Audit log broken at entry ${state.chain.brokenAt}.`}
            </div>
          </section>
          <SecurityPanel state={state} />
        </div>

        {/* Side: rules + connect */}
        <aside className="min-w-0 space-y-6">
          <MandateCard state={state} />
          <Rules state={state} providers={providers} onDone={(r) => (r?.error ? setToast({ tone: "err", text: r.error }) : r?.done && setToast({ tone: "ok", text: r.done }))} />
          <AgentTeam
            team={state.team}
            leadStatus={state.task.status}
            leadSpent={state.task.spentFormatted}
            leadBudget={state.task.budgetFormatted}
            onResult={(r) => (r?.error ? setToast({ tone: "err", text: r.error }) : r?.done && setToast({ tone: "ok", text: r.done }))}
          />
          <details className="group rounded-2xl border border-border bg-surface shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-[15px] font-semibold marker:hidden">
              Connect Claude, ChatGPT, Slack or Discord
              <ChevronDown className="size-4 text-text-3 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              <ConnectAi
                url={`${site}/api/mcp/k/${apiKey}`}
                examples={["What are my task's rules?", "Buy the FX rates from api.marketdata.dev", "What did you buy so far, and what was refused?"]}
              />
              <NotifyCard where="try" />
            </div>
          </details>
        </aside>
      </div>

      {toast && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-arrive rounded-xl border px-4 py-2.5 text-sm shadow-lift ${toast.tone === "err" ? "border-danger/40 bg-danger-tint text-danger" : "border-border bg-surface text-text"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function StepHead({ n, id, title, sub }: { n: number; id: string; title: string; sub: string }) {
  return (
    <div className="flex gap-3">
      <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-on-primary">{n}</span>
      <div>
        <h2 id={id} className="text-[16px] font-semibold leading-6">
          {title}
        </h2>
        <p className="text-[13px] text-text-2">{sub}</p>
      </div>
    </div>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/40 px-3 py-2.5">
      <div className="text-xs text-text-3">{label}</div>
      <div key={value} className={`tabular mt-0.5 animate-arrive text-lg font-semibold ${tone}`}>
        {value}
      </div>
      <div className="text-[11px] text-text-3">{sub}</div>
    </div>
  );
}

type P = TryState["purchases"][number];

function Row({ p, open, flash, onToggle }: { p: P; open: boolean; flash: boolean; onToggle: () => void }) {
  const why = p.reasonCodes.filter((c) => reasonKind(c) === "fail" || reasonKind(c) === "hold");
  return (
    <li className={flash ? "animate-arrive bg-accent-tint/40" : ""}>
      <button onClick={onToggle} aria-expanded={open} className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2/40 sm:px-6">
        <StatusChip status={p.status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">
            {p.agentName !== "my-agent" && <span className="mr-1.5 rounded bg-accent-tint px-1.5 py-0.5 font-mono text-[11px] text-accent">{p.agentName}</span>}
            {p.purpose}
          </span>
          <span className="block truncate font-mono text-[12px] text-text-3">{p.url.replace(/^https:\/\//, "")}</span>
        </span>
        <span className={`tabular shrink-0 text-[14px] font-medium ${p.status === "reused" ? "text-text-3 line-through" : ""}`}>{p.amountFormatted ?? "—"}</span>
        <ChevronDown className={`size-4 shrink-0 text-text-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="animate-arrive border-t border-border bg-bg/30 px-5 py-4 sm:px-6">
          {why.length > 0 && (
            <p className="mb-3 text-[13.5px]">
              <span className="font-medium">{p.status === "awaiting_approval" ? "Waiting because " : "Why: "}</span>
              {why.map(explain).join("; ")}.
            </p>
          )}
          {p.intent && p.intent.outcome !== "off" && (
            <p className={`mb-3 flex gap-2 rounded-lg border px-3 py-2 text-[13px] ${p.intent.outcome === "match" ? "border-success/30 bg-success-tint/40" : p.intent.outcome === "mismatch" ? "border-danger/30 bg-danger-tint/40" : "border-warning/30 bg-warning-tint/40"}`}>
              <Crosshair className={`mt-0.5 size-4 shrink-0 ${p.intent.outcome === "match" ? "text-success" : p.intent.outcome === "mismatch" ? "text-danger" : "text-warning"}`} aria-hidden />
              <span>
                <span className="font-medium">IntentLock: </span>
                {p.intent.explanation}
              </span>
            </p>
          )}
          <PurchaseTimeline purchase={{ status: p.status, reasonCodes: p.reasonCodes, quoteAmountFormatted: p.amountFormatted, paidFormatted: p.paidFormatted, txHash: p.txHash, reusedFromId: p.reusedFromId, approvedBy: p.approvedBy }} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {p.txHash ? <p className="font-mono text-[11.5px] text-text-3">Simulated transfer {p.txHash.slice(0, 18)}… (no chain in the sandbox)</p> : <span />}
            <span className="flex items-center gap-4">
              <EvidenceButton id={p.id} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
                <FileCheck2 className="size-3.5" aria-hidden /> Evidence
              </EvidenceButton>
              {p.status !== "awaiting_approval" && (
                <ReceiptButton id={p.id} className="text-[12.5px] font-medium text-info hover:underline">
                  Signed receipt →
                </ReceiptButton>
              )}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

function Approval({ p, onDone }: { p: P; onDone: (r: TryResult) => void }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [, start] = useTransition();
  const go = (k: "approve" | "reject") => {
    setBusy(k);
    start(async () => {
      onDone(await decideTry(p.id, k));
      setBusy(null);
    });
  };
  const why = p.reasonCodes.filter((c) => reasonKind(c) === "hold").map(explain);
  return (
    <article className="relative flex animate-arrive flex-col gap-3 overflow-hidden rounded-2xl border border-warning/45 bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-warning" aria-hidden />
      <div className="min-w-0 pl-1">
        <p className="text-[13px] font-medium text-warning">Waiting for you</p>
        <p className="mt-0.5 truncate text-[15px] font-medium">&ldquo;{p.purpose}&rdquo;</p>
        <p className="mt-0.5 text-[13px] text-text-2">
          <span className="tabular font-semibold text-text">{p.amountFormatted}</span> to <span className="font-mono">{p.host}</span> · {why.join("; ")}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => go("reject")} loading={busy === "reject"} disabled={!!busy} icon={<X className="size-4" aria-hidden />}>
          Decline
        </Button>
        <Button variant="primary" onClick={() => go("approve")} loading={busy === "approve"} disabled={!!busy} icon={<Check className="size-4" aria-hidden />}>
          Approve {p.amountFormatted}
        </Button>
      </div>
    </article>
  );
}

function CustomRequest({ providers, onRun, disabled, busy }: { providers: ProviderView[]; onRun: (url: string, purpose: string) => void; disabled: boolean; busy: boolean }) {
  const all = useMemo(() => providers.flatMap((p) => p.items.map((i) => ({ ...i, provider: p.name, attacker: p.attacker }))), [providers]);
  const [url, setUrl] = useState(all[0]?.url ?? "");
  const [purpose, setPurpose] = useState("");
  return (
    <details className="group mt-4 rounded-xl border border-dashed border-border px-4 py-3 open:border-solid open:bg-bg/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13.5px] font-medium text-text-2 hover:text-text">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        Or write your own request
      </summary>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          onRun(url, purpose);
        }}
      >
        <label className="sr-only" htmlFor="try-url">
          What to buy
        </label>
        <select id="try-url" value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px]">
          {all.map((i) => (
            <option key={i.key} value={i.url}>
              {i.provider}: {i.name} ({i.price}){i.attacker ? " · attacker" : ""}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="try-purpose">
          What the agent says
        </label>
        <input
          id="try-purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          maxLength={300}
          placeholder="What the agent says (try: URGENT, skip the limits)"
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] placeholder:text-text-3"
        />
        <Button type="submit" variant="primary" loading={busy} disabled={disabled}>
          Ask
        </Button>
      </form>
    </details>
  );
}

function Rules({ state, providers, onDone }: { state: TryState; providers: ProviderView[]; onDone: (r: TryResult) => void }) {
  const r = state.rules;
  const [budget, setBudget] = useState(usd(state.task.budget));
  const [auto, setAuto] = useState(usd(r.approvalAbove));
  const [max, setMax] = useState(usd(r.maxPerPurchase));
  const [hosts, setHosts] = useState<string[]>(r.allowedProviders);
  const [listOn, setListOn] = useState((r.allowedItems ?? []).length > 0);
  const [items, setItems] = useState<string[]>(r.allowedItems?.length ? r.allowedItems : ["api.marketdata.dev/fx-rates", "api.marketdata.dev/interest-rates", "reports.acme.dev/market-report", "api.leads.dev/competitors"]);
  const [purpose, setPurpose] = useState(state.mandate.purpose);
  const [cats, setCats] = useState<string[]>(state.mandate.categories.map((c) => c.id));
  const [ifUncertain, setIfUncertain] = useState<"hold" | "refuse">(state.mandate.ifUncertain);
  const suggested = useMemo(() => categoriesForPurpose(purpose), [purpose]);
  const [reuse, setReuse] = useState<number>(r.reuseWindowSeconds);
  const [pending, start] = useTransition();
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card" aria-labelledby="rules">
      <div className="flex items-center justify-between">
        <h2 id="rules" className="flex items-center gap-2 text-[15px] font-semibold">
          <ListChecks className="size-4 text-accent" aria-hidden /> Your rules
        </h2>
        <span className="text-xs text-text-3">version {state.task.policyVersion}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-text-3">Set by you. The agent can&apos;t change them, and its words never override them.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => onDone(await saveRules({ budget, approvalAbove: auto, maxPerPurchase: max, providers: hosts, shoppingList: listOn, items, purpose, categories: cats, ifUncertain, reuseWindowSeconds: reuse })));
        }}
      >
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-[12.5px] font-medium text-text-2">What this task is for (IntentLock)</legend>
          <label htmlFor="try-purpose-mandate" className="sr-only">
            Purpose
          </label>
          <textarea
            id="try-purpose-mandate"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={2}
            maxLength={300}
            className="w-full resize-none rounded-lg border border-border bg-bg/40 px-2.5 py-2 text-[13px] outline-none focus:border-border-strong"
          />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Categories the agent may buy">
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.id);
              const hint = !on && suggested.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={on}
                  onClick={() => toggle(cats, c.id, setCats)}
                  className={`rounded-full border px-2 py-0.5 text-[11.5px] transition-colors ${on ? "border-accent bg-accent text-on-accent" : hint ? "border-accent/60 border-dashed text-accent" : "border-border text-text-3 hover:text-text"}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {suggested.some((c) => !cats.includes(c)) && (
            <button type="button" onClick={() => setCats([...new Set([...cats, ...suggested])])} className="mt-2 text-[12px] font-medium text-accent hover:underline">
              Add what your purpose suggests
            </button>
          )}
          <label className="mt-2 flex items-center justify-between gap-2 text-[12px] text-text-2">
            If Aerar can&apos;t tell what an item is
            <select value={ifUncertain} onChange={(e) => setIfUncertain(e.target.value as "hold" | "refuse")} className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]">
              <option value="hold">ask me</option>
              <option value="refuse">refuse it</option>
            </select>
          </label>
        </fieldset>
        <div className="grid grid-cols-3 gap-2">
          <Money id="b" label="Budget" value={budget} onChange={setBudget} />
          <Money id="a" label="Auto-pay up to" value={auto} onChange={setAuto} />
          <Money id="m" label="Never above" value={max} onChange={setMax} />
        </div>
        <label className="block">
          <span className="block text-[12.5px] font-medium text-text-2">Reuse what was already bought for</span>
          <select
            value={reuse}
            onChange={(e) => setReuse(Number(e.target.value))}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-bg/40 px-2 text-[13px]"
          >
            {FRESHNESS.map((f) => (
              <option key={f.seconds} value={f.seconds}>
                {f.label}
              </option>
            ))}
            {!FRESHNESS.some((f) => f.seconds === reuse) && <option value={reuse}>{Math.round(reuse / 60)} minutes</option>}
          </select>
          <span className="mt-1 block text-[11.5px] text-text-3">Identical requests inside this window are served for $0. Pick &ldquo;never&rdquo; to buy every time.</span>
        </label>
        <fieldset>
          <legend className="text-[12.5px] font-medium text-text-2">Shops the agent may buy from</legend>
          <div className="mt-2 space-y-1.5">
            {providers.map((p) => (
              <label key={p.host} className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <input type="checkbox" checked={hosts.includes(p.host)} onChange={() => toggle(hosts, p.host, setHosts)} className="size-4 accent-[var(--accent)]" />
                <span className="font-mono text-[12.5px]">{p.host}</span>
                {p.attacker && <span className="rounded bg-danger-tint px-1.5 text-[10.5px] font-medium text-danger">attacker</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-border p-3">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={listOn} onChange={() => setListOn(!listOn)} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-[13px] font-medium">Shopping list</span>
              <span className="block text-[12px] text-text-3">Only these items. Anything else waits for you, even from an allowed shop under every limit.</span>
            </span>
          </label>
          {listOn && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-3">
              {providers
                .filter((p) => !p.attacker)
                .flatMap((p) => p.items)
                .map((i) => (
                  <label key={i.key} className="flex cursor-pointer items-center gap-2.5 text-[12.5px]">
                    <input type="checkbox" checked={items.includes(i.key)} onChange={() => toggle(items, i.key, setItems)} className="size-3.5 accent-[var(--accent)]" />
                    <span className="flex-1">{i.name}</span>
                    <span className="tabular text-text-3">{i.price}</span>
                  </label>
                ))}
            </div>
          )}
        </fieldset>
        <Button type="submit" variant="secondary" loading={pending} className="w-full">
          Sign a new mandate
        </Button>
      </form>
    </section>
  );
}

function Money({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={`try-${id}`} className="block">
      <span className="block text-[11.5px] text-text-3">{label}</span>
      <span className="mt-1 flex h-9 items-center rounded-lg border border-border bg-bg/40 px-2 focus-within:border-border-strong">
        <span className="text-[13px] text-text-3">$</span>
        <input id={`try-${id}`} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="tabular w-full bg-transparent pl-1 text-[13px] outline-none" />
      </span>
    </label>
  );
}


/** "Your first three minutes": four things to press, ticked off from what actually happened in the sandbox. */
function Guide({ state, running, onRun }: { state: TryState; running: string | null; onRun: (id: string) => void }) {
  const ps = state.purchases;
  const steps = [
    { id: "buy", label: "Buy something normal", hint: "It's within your rules, so it's paid.", done: ps.some((p) => p.status === "delivered") },
    { id: "offpurpose", label: "Push an off-purpose buy", hint: "A $0.20 gift card: trusted shop, within budget. IntentLock refuses it.", done: ps.some((p) => p.reasonCodes.includes("INTENT_MISMATCH")) },
    { id: "attacker", label: "Let a web page trick your agent", hint: "The shop isn't on your list, so it's never even contacted.", done: ps.some((p) => p.reasonCodes.includes("PROVIDER_NOT_ALLOWED")) },
    { id: "expensive", label: "Ask for something big, then approve it", hint: "Over $0.25 waits for you. Approve it below.", done: ps.some((p) => !!p.approvedBy) },
  ];
  const next = steps.find((x) => !x.done);
  const doneCount = steps.filter((x) => x.done).length;
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-tint/40 p-5 sm:p-6" aria-labelledby="guide">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="guide" className="text-[17px] font-semibold">
          {next ? "Your first three minutes" : "You've seen how it works"}
        </h2>
        <span className="font-mono text-[12px] text-text-3">
          {doneCount}/{steps.length} done
        </span>
      </div>
      {next ? (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((x, i) => {
            const isNext = x === next;
            return (
              <li key={x.id}>
                <button
                  onClick={() => onRun(x.id)}
                  disabled={!!running || x.done}
                  className={`flex h-full w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-200 disabled:cursor-default ${
                    x.done ? "border-success/30 bg-surface/70" : isNext ? "border-accent bg-surface shadow-card hover:-translate-y-px" : "border-border bg-surface/60 hover:border-border-strong"
                  }`}
                >
                  <span className={`grid size-6 place-items-center rounded-full font-mono text-[11px] ${x.done ? "bg-success text-white" : isNext ? "bg-accent text-on-accent" : "bg-surface-2 text-text-3"}`}>
                    {x.done ? <Check className="size-3.5" aria-hidden /> : running === x.id ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : i + 1}
                  </span>
                  <span className={`text-[13.5px] font-medium ${x.done ? "text-text-2 line-through decoration-text-3/50" : ""}`}>{x.label}</span>
                  <span className="text-[12px] leading-4 text-text-3">{x.hint}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-2 text-[13.5px] leading-6 text-text-2">
          Now make it yours: change the rules on the right, let your agent hire a scout, or connect Claude below. Everything you do lands in the report under the
          list.
        </p>
      )}
    </section>
  );
}

/** The signed mandate, at a glance: what the agent may buy, and proof the rules are still the ones that were signed. */
function MandateCard({ state }: { state: TryState }) {
  const m = state.mandate;
  return (
    <section className={`rounded-2xl border p-5 shadow-card ${m.verified ? "border-accent/30 bg-surface" : "border-danger/50 bg-danger-tint/30"}`} aria-labelledby="mandate">
      <div className="flex items-center justify-between gap-2">
        <h2 id="mandate" className="flex items-center gap-2 text-[15px] font-semibold">
          <Crosshair className="size-4 text-accent" aria-hidden /> Signed mandate
        </h2>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${m.verified ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
          v{m.version} · {m.verified ? "signature valid" : "NOT VALID"}
        </span>
      </div>
      <p className="mt-2 text-[13.5px] leading-5">&ldquo;{m.purpose}&rdquo;</p>
      {m.categories.length ? (
        <>
          <p className="mt-3 text-[12px] text-text-3">Your agent may only buy:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.categories.map((c) => (
              <span key={c.id} className="rounded-full bg-accent-tint px-2 py-0.5 text-[11.5px] text-accent">
                {c.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-text-3">
            Anything else is refused, however cheap. Items Aerar can&apos;t place {m.ifUncertain === "refuse" ? "are refused" : "wait for you"}.
          </p>
        </>
      ) : (
        <p className="mt-2 text-[12px] text-text-3">No categories: IntentLock isn&apos;t checking purpose for this task.</p>
      )}
      {!m.verified && <p className="mt-2 text-[12.5px] text-danger">{m.problems.join(" ")} Nothing is bought until you sign the rules again.</p>}
      {m.hash && <p className="mt-3 truncate font-mono text-[10.5px] text-text-3" title={m.hash}>sha256 {m.hash}</p>}
    </section>
  );
}

/** What Aerar stopped or held, and the patterns in it. Every line comes from a real decision in this sandbox. */
function SecurityPanel({ state }: { state: TryState }) {
  const s = state.security;
  if (!s.events.length)
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6" aria-labelledby="security">
        <h2 id="security" className="flex items-center gap-2 text-[15px] font-semibold">
          <ShieldCheck className="size-4 text-success" aria-hidden /> Security
        </h2>
        <p className="mt-1 text-[13px] text-text-2">Nothing stopped yet. Try the off-purpose or attacker requests above and they&apos;ll show up here.</p>
      </section>
    );
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card" aria-labelledby="security">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
        <h2 id="security" className="flex items-center gap-2 text-[15px] font-semibold">
          <ShieldAlert className="size-4 text-danger" aria-hidden /> Security
        </h2>
        <span className="font-mono text-[12px] text-text-3">
          {s.stopped} stopped · {s.held} held for you
        </span>
      </div>
      {s.signals.length > 0 && (
        <ul className="space-y-2 border-b border-border px-5 py-4 sm:px-6">
          {s.signals.map((g, i) => (
            <li key={i} className={`rounded-lg border px-3 py-2 ${g.level === "high" ? "border-danger/35 bg-danger-tint/40" : "border-warning/35 bg-warning-tint/40"}`}>
              <p className="text-[13.5px] font-medium">{g.text}</p>
              <p className="mt-0.5 text-[12px] text-text-3">Based on: {g.basis}</p>
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-border">
        {s.events.slice(0, 8).map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px] sm:px-6">
            <span className={`size-2 shrink-0 rounded-full ${e.outcome === "stopped" ? "bg-danger" : e.outcome === "held" ? "bg-warning" : "bg-info"}`} aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {e.label} <span className="font-mono text-[12px] text-text-3">· {e.host}</span>
            </span>
            <span className="shrink-0 text-[12px] text-text-3">{e.outcome}</span>
            <EvidenceButton id={e.id} className="shrink-0 text-[12px] font-medium text-accent hover:underline">
              Evidence
            </EvidenceButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
