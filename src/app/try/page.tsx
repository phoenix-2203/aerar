// Try it yourself: a private sandbox per visitor. Set rules, let a test agent buy from simulated shops (or connect
// your own agent over MCP), and approve what waits for you. No sign-up, no wallet, no real money.
import { Bot, Coins, ShieldCheck, Sparkles } from "lucide-react";
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
  const points = [
    { icon: ShieldCheck, title: "Set the rules", text: "Budget, auto-approve limit, allowed shops and a shopping list." },
    { icon: Bot, title: "Let an agent shop", text: "Press a request, or connect your own agent over MCP." },
    { icon: Coins, title: "See every decision", text: "Paid, reused, held for you or declined, with each step explained." },
  ];
  return (
    <section className="relative -mx-4 -mt-6 px-4 pb-10 pt-10 sm:-mx-6 sm:-mt-10 sm:px-6 sm:pt-16">
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto max-w-2xl animate-fade-up text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-text-2 shadow-card">
          <Sparkles className="size-3.5 text-accent" aria-hidden /> About 3 minutes · no sign-up · no wallet
        </span>
        <h1 className="mt-6 text-[36px] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[48px]">Try Aerar yourself.</h1>
        <p className="mx-auto mt-4 max-w-xl text-[17px] leading-7 text-text-2">
          Get a private sandbox with your own task, rules and test agent. The agent shops at simulated providers, so nothing real is spent. It&apos;s yours for
          24 hours.
        </p>
        <div className="mt-8 flex justify-center">
          <StartButton />
        </div>
      </div>
      <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-3">
        {points.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="group rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-text-2 transition-colors group-hover:bg-accent-tint group-hover:text-accent">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="tabular text-xs font-medium text-text-3">0{i + 1}</span>
              </div>
              <h2 className="mt-3 text-[15px] font-semibold">{p.title}</h2>
              <p className="mt-1 text-[13.5px] leading-5 text-text-2">{p.text}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-center text-[13px] text-text-3">Real testnet payments made by Aerar&apos;s own agent are in the live report.</p>
    </section>
  );
}
