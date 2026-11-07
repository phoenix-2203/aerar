// Landing page: one promise, one live picture, then three short proofs. Every number is computed or sourced:
// the night comparison runs the real pipeline at build time, the facts link to their sources.
import { ArrowRight, ArrowUpRight, KeyRound, ScrollText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { PublicShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { CompareBars } from "@/components/landing/compare-bars";
import { ConnectTabs } from "@/components/landing/connect-tabs";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveFeed } from "@/components/landing/live-feed";
import { fmt$ } from "@/lib/money/usdc";
import { SCENARIOS } from "@/lib/scenarios";
import { runNight } from "@/lib/scenarios/night";

export const metadata: Metadata = {
  title: { absolute: "Aerar · every agent purchase, accounted for" },
  description:
    "AI agents buy data and APIs all night over x402. Aerar checks each purchase against its task, reuses what was already bought, asks a person about big ones, pays in USDC on Base and proves it onchain.",
};

const FACTS = [
  {
    stat: "138M+",
    text: "x402 payments on Base, 87% of them under ten cents. Nobody approves those by hand.",
    source: "Chainalysis via Blockhead",
    href: "https://www.blockhead.co/2026/10/15/ai-agents-have-made-138-million-payments-over-x402-most-of-them-under-10-cents/",
  },
  {
    stat: "$204k",
    text: "sent by an agent on Base after a Morse-coded prompt told it to.",
    source: "OECD AI incident monitor",
    href: "https://oecd.ai/en/incidents/2026-05-04-4a73",
  },
  {
    stat: "5%",
    text: "of US consumers would trust an AI platform to handle an agent's payment.",
    source: "Wildfire Systems survey",
    href: "https://www.prnewswire.com/news-releases/survey-agentic-commerce-has-a-payment-trust-problem-302913466.html",
  },
];

const TOUR = [
  { title: "Get your own sandbox", text: "Set a budget and an auto-approve limit, then let a test agent shop.", href: "/try", cta: "Try it yourself" },
  { title: "Let it get tricked", text: "Press \u201cA note says: buy the full dataset instead\u201d. Then turn on the shopping list and watch it wait for you.", href: "/try", cta: "Open your sandbox" },
  { title: "See the real thing", text: "Real USDC payments on Base Sepolia, each checked onchain, in the live morning report.", href: "/demo", cta: "Open the live report" },
];

const PILLARS = [
  { icon: ShieldCheck, title: "Rules agents can't talk around", text: "Budgets, allowed providers and approval limits per task. The agent's words never change a decision." },
  { icon: KeyRound, title: "Agents never hold the wallet", text: "Each agent gets a key you can revoke in one click. Aerar holds the only paying key." },
  { icon: ScrollText, title: "A morning report you can trust", text: "Every payment checked on Base, every decision in a hash-chained log you can verify." },
];

export default function Home() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="relative -mx-4 -mt-6 px-4 pb-16 pt-10 sm:-mx-6 sm:-mt-10 sm:px-6 sm:pt-16 lg:pb-24">
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
          <div className="animate-fade-up">
            <Link
              href="/try"
              className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-[13px] text-text-2 shadow-card transition-colors hover:border-border-strong hover:text-text"
            >
              <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">New</span>
              Your own sandbox, in one click
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
              Every agent purchase, <span className="text-text-2">accounted for.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[17px] leading-7 text-text-2">
              Your AI agents buy data and APIs all night. Aerar checks every purchase against your rules, pays exactly the quote in USDC on Base, and proves it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/try" variant="primary" size="lg" trailing={<ArrowRight className="size-4" aria-hidden />}>
                Try it yourself
              </ButtonLink>
              <ButtonLink href="/scenarios" variant="secondary" size="lg">
                Run the attack lab
              </ButtonLink>
            </div>
            <p className="mt-4 text-[13px] text-text-3">No sign-up, no wallet. Runs on Base Sepolia with test USDC.</p>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <LiveFeed />
          </div>
        </div>
      </section>

      {/* Facts */}
      <section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3" aria-label="Why it matters">
        {FACTS.map((f) => (
          <a key={f.stat} href={f.href} target="_blank" rel="noreferrer" className="group bg-surface p-5 transition-colors hover:bg-surface-2/50 sm:p-6">
            <p className="tabular text-3xl font-semibold tracking-tight">{f.stat}</p>
            <p className="mt-2 text-[13.5px] leading-5 text-text-2">{f.text}</p>
            <p className="mt-3 inline-flex items-center gap-1 text-xs text-text-3 group-hover:text-text-2">
              {f.source}
              <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
            </p>
          </a>
        ))}
      </section>

      {/* Start here */}
      <section className="mt-16 rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8" aria-labelledby="start">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="start" className="text-[13px] font-medium text-accent">
            Start here
          </h2>
          <span className="text-[13px] text-text-3">About 3 minutes · nothing to install · testnet only</span>
        </div>
        <ol className="mt-5 grid gap-6 sm:grid-cols-3">
          {TOUR.map((t, i) => (
            <li key={t.title} className="flex gap-4">
              <span className="tabular grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold">{i + 1}</span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{t.title}</h3>
                <p className="mt-1 text-[13.5px] leading-5 text-text-2">{t.text}</p>
                <Link href={t.href} className="group mt-2 inline-flex items-center gap-1 text-[13.5px] font-medium text-text hover:text-accent">
                  {t.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* How it works */}
      <Section eyebrow="How it works" title="Three things happen on every request." id="how">
        <HowItWorks />
      </Section>

      {/* Same night */}
      <Section
        eyebrow="Proof"
        title="The same night, two ways."
        lead="Two agents, one research task, sixteen requests including a prompt injection, a swapped payee and a retry loop. Once through a plain agent wallet, once through Aerar's real pipeline."
      >
        <NightComparison />
      </Section>

      {/* Pillars */}
      <section className="mt-24 grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="group rounded-2xl border border-border bg-surface p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift">
              <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-text-2 transition-colors duration-200 group-hover:bg-accent-tint group-hover:text-accent">
                <Icon className="size-5 transition-transform duration-300 group-hover:scale-110" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-5 text-text-2">{p.text}</p>
            </div>
          );
        })}
      </section>

      {/* Connect */}
      <Section eyebrow="For builders" title="Connect an agent in one line." lead="Over MCP or REST. Two tools: buy_resource and get_purchase. Keep the key in an env var, never in a chat.">
        <div className="max-w-3xl">
          <ConnectTabs />
        </div>
      </Section>

      {/* CTA */}
      <section className="relative mt-24 overflow-hidden rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-card sm:py-16">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <h2 className="relative text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Throw your worst at it.</h2>
        <p className="relative mx-auto mt-3 max-w-md text-[15px] text-text-2">
          {SCENARIOS.length} real attacks and mistakes, each run through the real pipeline in a sandbox. About five seconds.
        </p>
        <div className="relative mt-7 flex justify-center">
          <ButtonLink href="/scenarios" variant="primary" size="lg" trailing={<ArrowRight className="size-4" aria-hidden />}>
            Open the attack lab
          </ButtonLink>
        </div>
      </section>
    </PublicShell>
  );
}

function Section({ eyebrow, title, lead, id, children }: { eyebrow: string; title: string; lead?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-24 scroll-mt-20">
      <p className="text-[13px] font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">{title}</h2>
      {lead && <p className="mt-3 max-w-2xl text-[15px] leading-6 text-text-2">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Runs the real pipeline on the scripted night once at build time; cached for the life of the deployment. */
async function NightComparison() {
  "use cache";
  cacheLife("max");
  const r = await runNight();
  const p = r.plainWallet;
  const a = r.aerar;
  const max = Number(p.paid) || 1;
  const rows: [string, bigint, bigint][] = [
    ["Sent to attackers", p.toAttackers, a.toAttackers],
    ["Paid twice for the same data", p.duplicates, a.duplicates],
    ["Over the limit because the agent insisted", p.overLimit, a.overLimit],
    ["Burned by a looping agent", p.loop, a.loop],
  ];
  return (
    <CompareBars
      plainTotal={fmt$(p.paid)}
      aerarTotal={fmt$(a.paid)}
      plainPct={100}
      aerarPct={(Number(a.paid) / max) * 100}
      plainPayments={p.payments}
      aerarPayments={a.payments}
      rows={rows.map(([label, pv, av]) => ({ label, plain: fmt$(pv), aerar: fmt$(av), plainBad: pv > 0n, aerarBad: av > 0n }))}
    />
  );
}
