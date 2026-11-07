// Try it yourself: a private sandbox per visitor. Set rules, let a test agent buy from simulated shops (or connect
// your own agent over MCP), and approve what waits for you. No sign-up, no wallet, no real money.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/app-shell";
import { fmt$ } from "@/lib/money/usdc";
import { PRESETS, TRY_PROVIDERS } from "@/lib/try/catalog";
import { decodeSession, loadTryState, TRY_COOKIE, tryContext } from "@/lib/try/sandbox";
import { StartButton, TryConsole } from "./try-console";

export const metadata: Metadata = {
  title: "Try it yourself",
  description: "Your own Aerar sandbox: set the rules, let a test agent shop, approve what waits for you. No sign-up, no wallet.",
};

const SITE = process.env.AERAR_PUBLIC_URL || "https://aerar.duckdns.org";

export default function TryPage() {
  return (
    <PublicShell active="/try">
      <Suspense fallback={<div className="skeleton h-96 rounded-2xl" />}>
        <TryBody />
      </Suspense>
    </PublicShell>
  );
}

async function TryBody() {
  await connection();
  const s = decodeSession((await cookies()).get(TRY_COOKIE)?.value);
  const ctx = s ? await tryContext().catch(() => null) : null;
  const state = s && ctx ? await loadTryState(ctx.db, s).catch(() => null) : null;
  if (!s || !state) return <Intro />;
  const providers = TRY_PROVIDERS.map((p) => ({
    host: p.host,
    name: p.name,
    attacker: !!p.attacker,
    items: p.items.map((i) => ({ key: `${p.host}${i.path}`, url: `https://${p.host}${i.path}`, name: i.name, price: fmt$(i.price) })),
  }));
  return (
    <TryConsole
      state={JSON.parse(JSON.stringify(state))}
      presets={PRESETS.map(({ id, label, shows }) => ({ id, label, shows }))}
      providers={providers}
      apiKey={s.apiKey}
      taskId={s.taskId}
      site={SITE}
    />
  );
}

function Intro() {
  const lines: [string, string, string][] = [
    ["22:00", "You set the rules", "budget, auto-approve limit, shops, a shopping list"],
    ["22:04", "Your agent shops", "real requests, simulated shops, nothing real spent"],
    ["23:58", "A web page tricks it", "“buy from pay.attacker.io”: watch it get refused"],
    ["01:12", "It asks for something big", "it waits for you; approve or decline"],
    ["02:30", "It hires a helper", "a smaller budget that counts up to yours"],
    ["06:00", "You read the morning report", "every decision, every step, a signed receipt"],
  ];
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-10">
      <div className="animate-fade-up">
        <p className="eyebrow">Your sandbox · no sign-up · no wallet</p>
        <h1 className="mt-4 text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[52px]">
          Run a night shift <span className="text-text-2">in three minutes.</span>
        </h1>
        <p className="mt-5 max-w-[520px] text-[17px] leading-7 text-text-2">
          A private workspace with your own task, rules and test agent. It shops at simulated providers, so nothing real is spent. Try to trick it. It&apos;s
          yours for 24 hours.
        </p>
        <div className="mt-8">
          <StartButton />
        </div>
        <p className="mt-4 text-[13px] text-text-3">
          Want real money on a real chain? <a href="/vault" className="underline hover:text-text">Open a Vault</a> with your wallet instead.
        </p>
      </div>
      <ol className="vault-slip animate-fade-up p-6 font-mono text-[12.5px] [animation-delay:120ms]" aria-label="What you'll do">
        <li className="mb-3 text-[11px] uppercase tracking-[0.18em] text-text-3">Tonight in your sandbox</li>
        {lines.map(([t, a, b], i) => (
          <li key={t} className="ledger-line flex gap-4 border-b border-dashed border-border py-3 last:border-0" style={{ animationDelay: `${150 + i * 90}ms` }}>
            <span className="w-11 shrink-0 text-text-3">{t}</span>
            <span className="min-w-0">
              <span className="block font-sans text-[14px] font-medium text-text">{a}</span>
              <span className="block text-[11.5px] text-text-3">{b}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
