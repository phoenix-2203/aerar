// Landing page. One night shift as a ledger (hero), why it matters (cited), one purchase traced end to end, the same
// night run through the real pipeline, where Aerar fits, and three ways in. Every number is computed or sourced.
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDbOnly } from "@/lib/server/context";
import { liveStats } from "@/lib/server/stats";
import Link from "next/link";
import { PublicShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { CompareBars } from "@/components/landing/compare-bars";
import { NightLedger } from "@/components/landing/night-ledger";
import { OnePurchase } from "@/components/landing/one-purchase";
import { WhereYouWork } from "@/components/landing/where-you-work";
import { fmt$ } from "@/lib/money/usdc";
import { SCENARIOS } from "@/lib/scenarios";
import { runNight } from "@/lib/scenarios/night";

export const metadata: Metadata = {
  title: { absolute: "Aerar · your agents work the night shift, Aerar keeps the books" },
  description:
    "AI agents pay for data and APIs all night over x402. Aerar checks every purchase against the purpose a person signed (IntentLock), never pays twice, asks a person about big ones in Slack, Discord or Telegram, and pays from a Vault you own on Base.",
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

const DOORS = [
  { href: "/try", title: "Try it, no wallet", text: "Your own sandbox in one click. Set rules, let a test agent shop, try to trick it.", tag: "1 minute" },
  { href: "/vault", title: "Open your Vault", text: "Connect a wallet, sign on-chain limits, watch your agent pay a real x402 shop with test USDC.", tag: "Base Sepolia" },
  { href: "/scenarios", title: "Run the attack lab", text: `${SCENARIOS.length} real attacks and mistakes, each through the real pipeline, scored in seconds.`, tag: `${SCENARIOS.length} scenarios` },
];

const INTENT_ROWS: [string, string, "pass" | "fail"][] = [
  ["Task budget", "$8.00 asked, $10.00 left", "pass"],
  ["Per-purchase limit", "$8.00 under $10.00", "pass"],
  ["Provider", "a marketplace the task trusts", "pass"],
  ["IntentLock", "gift card ≠ blockchain analytics", "fail"],
];

function IntentLockStrip() {
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:items-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-screen -translate-x-1/2 -translate-y-1/2 overflow-hidden" aria-hidden>
        <div className="wash left-[8%] top-[60px] h-[420px] w-[620px] opacity-[calc(var(--wash-opacity)*0.7)]" />
      </div>
      <ol className="glass overflow-hidden rounded-2xl font-mono text-[13px] shadow-lift">
        {INTENT_ROWS.map(([k, v, r]) => (
          <li key={k} className="flex items-center gap-3 border-b border-dashed border-border px-4 py-3 last:border-0">
            <span className="w-36 shrink-0 text-text-3">{k}</span>
            <span className="min-w-0 flex-1 truncate text-text-2">{v}</span>
            <span className={`stamp-mini shrink-0 ${r === "pass" ? "border-success text-success" : "border-danger text-danger"}`}>{r === "pass" ? "PASS" : "REFUSED"}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-3 text-[14.5px] leading-6 text-text-2">
        <p>
          The item is judged from what it is (its address and the shop&apos;s own description), never from the agent&apos;s reason, because the agent is the one
          that was talked into it.
        </p>
        <p>
          The purpose is part of a <b className="text-text">signed mandate</b>. Change the rules behind Aerar&apos;s back and buying stops until a person signs again.
          Items Aerar can&apos;t place wait for you.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink href="/scenarios#intent" variant="secondary" size="sm">
            Run it in the attack lab
          </ButtonLink>
          <ButtonLink href="/try" variant="ghost" size="sm">
            Try it in your sandbox
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** Live numbers from this deployment's database (Ramp-style ticker). Hidden if the database can't be reached. */
async function HeroCounters() {
  await connection();
  const s = await liveStats(await getDbOnly()).catch(() => null);
  if (!s || !s.decided) return null;
  const items: [string, string][] = [
    [s.decided.toLocaleString("en-US"), "decided"],
    [s.stopped, "stopped"],
    [s.onchain.toLocaleString("en-US"), "proven on Base"],
  ];
  return (
    <div className="mt-7 flex flex-wrap items-center gap-2 font-mono text-[12px] text-text-2">
      <span className="inline-flex items-center gap-1.5 text-text-3">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-success text-success" aria-hidden /> Live
      </span>
      {items.map(([v, k]) => (
        <span key={k} className="glass rounded-lg px-2.5 py-1.5 shadow-card">
          <b className="tabular font-semibold text-text">{v}</b> {k}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="relative -mx-4 -mt-6 px-4 pb-16 pt-10 sm:-mx-6 sm:-mt-10 sm:px-6 sm:pt-16 lg:pb-24">
        <div className="hero-night pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[-120px] -z-10 h-[1000px] w-screen -translate-x-1/2 overflow-hidden" aria-hidden>
          <div className="wash right-[-6%] top-[40px] h-[640px] w-[760px]" />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-text-3">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-accent text-accent" aria-hidden />
              Night shift for AI agents
            </p>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[58px]">
              Your agents work the night shift. <span className="text-wash">Aerar keeps the books.</span>
            </h1>
            <p className="mt-5 max-w-[540px] text-[17px] leading-7 text-text-2">
              Budget limits stop agents spending too much. Aerar also stops them buying the wrong thing: every purchase is checked against the purpose you signed,
              never paid twice, sent to you when it&apos;s big, and paid from a Vault you own.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/try" variant="primary" size="lg" trailing={<ArrowRight className="size-4" aria-hidden />}>
                Try it, no wallet
              </ButtonLink>
              <ButtonLink href="/vault" variant="secondary" size="lg">
                Open your Vault
              </ButtonLink>
            </div>
            <Suspense fallback={<div className="mt-7 h-8" />}>
              <HeroCounters />
            </Suspense>
            <a href="#one-purchase" className="group mt-5 inline-flex items-center gap-1.5 text-[13.5px] text-text-2 hover:text-text">
              Watch one purchase <ArrowDown className="size-3.5 transition-transform group-hover:translate-y-0.5" aria-hidden />
            </a>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <NightLedger />
            <p className="mt-3 text-center text-[12px] text-text-3">An example night. Drag the moon, or hover to pause.</p>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="mt-4" aria-labelledby="why">
        <h2 id="why" className="max-w-3xl text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">
          Agents now pay for things. <span className="text-text-2">Nobody is watching at 3&nbsp;a.m.</span>
        </h2>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {FACTS.map((f) => (
            <li key={f.stat}>
              <a href={f.href} target="_blank" rel="noreferrer" className="group flex h-full flex-col bg-surface p-5 transition-colors hover:bg-surface-2/50 sm:p-6">
                <span className="tabular text-[34px] font-semibold tracking-tight">{f.stat}</span>
                <span className="mt-2 flex-1 text-[13.5px] leading-5 text-text-2">{f.text}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-xs text-text-3 group-hover:text-text-2">
                  {f.source}
                  <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* IntentLock */}
      <Section
        id="intentlock"
        eyebrow="IntentLock"
        title="Within budget isn't the same as on purpose."
        lead="An agent researching Ethereum is told by a web page that the work “requires” an $8 gift card. The budget is $10, so a spending limit says yes. Aerar checks the item against the purpose a person signed, and says no."
      >
        <IntentLockStrip />
      </Section>

      {/* One purchase */}
      <Section id="one-purchase" eyebrow="How it works" title="Watch one purchase." lead="Every request walks the same line. Pick a situation and see where it stops, and why.">
        <OnePurchase />
      </Section>

      {/* Same night */}
      <Section
        eyebrow="Proof"
        title="The same night, two ways."
        lead="Two agents, one research task, sixteen requests including a prompt injection, a swapped payee and a retry loop. Once through a plain agent wallet, once through Aerar's real pipeline, computed when this page was built."
      >
        <NightComparison />
      </Section>

      {/* Where */}
      <Section eyebrow="Fits where you work" title="Your chat, your channel, your wallet." lead="Aerar isn't another dashboard to babysit. It plugs into the places you already are.">
        <WhereYouWork />
      </Section>

      {/* Doors */}
      <section className="mt-24" aria-labelledby="doors">
        <h2 id="doors" className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Three ways in.
        </h2>
        <ol className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {DOORS.map((d, i) => (
            <li key={d.href}>
              <Link href={d.href} className="group flex items-center gap-5 px-5 py-5 transition-colors hover:bg-surface-2/50 sm:px-7 sm:py-6">
                <span className="font-mono text-[13px] text-text-3">0{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-[18px] font-semibold tracking-tight">{d.title}</span>
                    <span className="font-mono text-[11px] uppercase tracking-wider text-text-3">{d.tag}</span>
                  </span>
                  <span className="mt-1 block text-[14px] text-text-2">{d.text}</span>
                </span>
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border transition-all duration-300 group-hover:translate-x-1 group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent">
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </PublicShell>
  );
}

function Section({ eyebrow, title, lead, id, children }: { eyebrow: string; title: string; lead?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-24 scroll-mt-20">
      <p className="eyebrow">{eyebrow}</p>
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
