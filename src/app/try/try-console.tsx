"use client";
// The sandbox console: 1) your rules, 2) ask your agent to buy, 3) what happened. Plus "connect your own agent".
import { ArrowRight, Bot, Check, ChevronDown, ListChecks, Play, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { PurchaseTimeline } from "@/components/purchase-timeline";
import { ConnectAi } from "@/components/connect-ai";
import { NotifyCard } from "@/components/notify-card";
import { ReceiptButton } from "@/components/receipt-slip";
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
    <div className="flex flex-col items-center gap-3">
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
          <p className="flex items-center gap-2 text-[13px] font-medium text-accent">
            <Sparkles className="size-3.5" aria-hidden /> Your sandbox · simulated shops · nothing real is spent
          </p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[36px]">{state.task.title}</h1>
          <div className="mt-3 flex max-w-md items-center gap-3 text-[13px] text-text-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular shrink-0">
              {state.task.spentFormatted} of {state.task.budgetFormatted} · {state.task.leftFormatted} left
            </span>
          </div>
        </div>
        <form action={resetSandbox}>
          <Button type="submit" variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" aria-hidden />}>
            Start over
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* 2. Ask your agent */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6" aria-labelledby="ask">
            <StepHead n={1} id="ask" title="Ask your agent to buy something" sub="Each button is one thing that really happens to agents. Watch how your rules answer." />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => run(p.id, { preset: p.id })}
                  disabled={!!running}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-bg/40 p-3.5 text-left transition-all duration-150 hover:-translate-y-px hover:border-border-strong hover:bg-surface-2/50 disabled:opacity-60"
                >
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-2 transition-colors group-hover:bg-accent-tint group-hover:text-accent">
                    {running === p.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Play className="size-3.5" aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-5">{p.label}</span>
                    <span className="mt-0.5 block text-[12.5px] text-text-3">{p.shows}</span>
                  </span>
                </button>
              ))}
            </div>
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
        </div>

        {/* Side: rules + connect */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-20">
          <Rules state={state} providers={providers} onDone={(r) => (r?.error ? setToast({ tone: "err", text: r.error }) : r?.done && setToast({ tone: "ok", text: r.done }))} />
          <ConnectAi
            url={`${site}/api/mcp/k/${apiKey}`}
            examples={["What are my task's rules?", "Buy the FX rates from api.marketdata.dev", "What did you buy so far, and what was refused?"]}
          />
          <NotifyCard where="try" />
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
          <span className="block truncate text-[14px] font-medium">{p.purpose}</span>
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
          <PurchaseTimeline purchase={{ status: p.status, reasonCodes: p.reasonCodes, quoteAmountFormatted: p.amountFormatted, paidFormatted: p.paidFormatted, txHash: p.txHash, reusedFromId: p.reusedFromId, approvedBy: p.approvedBy }} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {p.txHash ? <p className="font-mono text-[11.5px] text-text-3">Simulated transfer {p.txHash.slice(0, 18)}… (no chain in the sandbox)</p> : <span />}
            {p.status !== "awaiting_approval" && (
              <ReceiptButton id={p.id} className="text-[12.5px] font-medium text-info hover:underline">
                Signed receipt →
              </ReceiptButton>
            )}
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
          start(async () => onDone(await saveRules({ budget, approvalAbove: auto, maxPerPurchase: max, providers: hosts, shoppingList: listOn, items })));
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          <Money id="b" label="Budget" value={budget} onChange={setBudget} />
          <Money id="a" label="Auto-pay up to" value={auto} onChange={setAuto} />
          <Money id="m" label="Never above" value={max} onChange={setMax} />
        </div>
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
          Save rules
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

