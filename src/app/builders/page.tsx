// For builders: connect an agent in a minute (chat app, Claude Code, REST), give users their own Vault, what it costs.
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { CodeTabs } from "./code-tabs";
import { getDbOnly } from "@/lib/server/context";
import { liveStats } from "@/lib/server/stats";

export const metadata: Metadata = {
  title: "For builders",
  description: "Give your agent a budget, not a wallet. Connect over MCP or REST in a minute; give each user an on-chain Vault.",
};

const SITE = process.env.AERAR_PUBLIC_URL || "https://aerar.duckdns.org";

const TOOLS: [string, string][] = [
  ["buy_resource", "Buy an x402 resource for a task. Rules, memory, approvals and the Vault decide; you never touch a wallet."],
  ["get_purchase", "A purchase's decision, reasons, payment and (when delivered) the data."],
  ["list_tasks", "Your tasks, what's left, the rules, and what you can buy."],
  ["recent_purchases", "What you bought lately and what was refused, in plain words."],
  ["provider_scores", "How reliable each provider has been, from your own ledger."],
  ["hire_agent", "Hand part of a task to another agent with a smaller budget that counts up to yours."],
  ["stop_hired_agent", "Pause an agent you hired."],
];

const PLANS = [
  { name: "Builder", price: "Free", for: "Solo builders and side projects", items: ["Up to $50/month of agent spend", "Rules, memory, price memory", "Signed receipts, Morning Seal"] },
  { name: "Team", price: "$29/month", for: "Teams running agents for clients", items: ["Approvals in Slack, Discord, Telegram", "Owners, approvers, viewers", "Agents hiring agents, provider scores"] },
  { name: "Platform", price: "0.5% of routed spend", for: "Apps where users run agents", items: ["A Vault per end user (non-custodial)", "White-label receipts and verify page", "Volume pricing"] },
];

export default function BuildersPage() {
  return (
    <PublicShell active="/builders">
      <section className="max-w-3xl animate-fade-up">
        <p className="eyebrow">For builders</p>
        <h1 className="mt-3 text-[36px] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[48px]">
          Give your agent a budget, <span className="text-text-2">not a wallet.</span>
        </h1>
        <p className="mt-4 text-[16px] leading-7 text-text-2">
          Your agent asks Aerar to buy; Aerar checks the task, pays the x402 quote in USDC on Base, and hands back the data plus a signed receipt. One key per
          agent, revocable in a click. No private key ever reaches the agent.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/try" variant="primary" trailing={<ArrowRight className="size-4" aria-hidden />}>
            Get a test key (sandbox)
          </ButtonLink>
          <ButtonLink href="/vault" variant="secondary">
            Open a Vault
          </ButtonLink>
        </div>
      </section>

      <Suspense fallback={<div className="skeleton mt-10 h-20 rounded-2xl" />}>
        <Live />
      </Suspense>

      <section className="mt-16" aria-labelledby="quick">
        <p className="eyebrow">Quickstart</p>
        <h2 id="quick" className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">
          Connect in a minute.
        </h2>
        <p className="mt-2 max-w-2xl text-[14.5px] text-text-2">
          Create a sandbox to get a key that pays simulated shops, or a Vault workspace for real test USDC. Keep the key in an environment variable, never in a
          chat or a repo.
        </p>
        <div className="mt-6">
          <CodeTabs site={SITE} />
        </div>
      </section>

      <section className="mt-16" aria-labelledby="tools">
        <p className="eyebrow">MCP tools</p>
        <h2 id="tools" className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">
          Seven tools. No wallet code.
        </h2>
        <dl className="mt-6 divide-y divide-dashed divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {TOOLS.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
              <dt className="font-mono text-[13px] text-accent">{k}</dt>
              <dd className="text-[13.5px] text-text-2">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13px] text-text-3">
          REST: <span className="font-mono">POST /api/v1/purchases</span> and <span className="font-mono">GET /api/v1/purchases/:id</span>, same rules, same
          receipts. Provider responses come back fenced as untrusted data.
        </p>
      </section>

      <section className="mt-16" aria-labelledby="vaults">
        <p className="eyebrow">For platforms</p>
        <h2 id="vaults" className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">
          Each user keeps their own money.
        </h2>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <ol className="space-y-3 text-[14px] leading-6 text-text-2">
            <li>
              <b className="text-text">1. The user opens a Vault</b> from their own wallet: one transaction to the factory on Base.
            </li>
            <li>
              <b className="text-text">2. They sign a mandate</b> per task: who can be paid, how much each time and per day, until when.
            </li>
            <li>
              <b className="text-text">3. Your agents buy through Aerar.</b> Aerar asks the Vault to approve one exact USDC transfer; the contract checks the mandate
              and the x402 facilitator settles it (ERC-1271).
            </li>
            <li>
              <b className="text-text">4. You never hold user funds.</b> Pause, revoke and withdraw stay in the user&apos;s wallet.
            </li>
          </ol>
          <pre className="overflow-x-auto rounded-2xl border border-border bg-surface p-5 font-mono text-[12px] leading-6 text-text-2">{`// AerarVault (Base Sepolia)
setMandate(task, payees[], perPayment, perDay, period, expires)  // owner
authorize(task, to, value, validAfter, validBefore, nonce)       // Aerar
isValidSignature(digest, sig) -> 0x1626ba7e                       // ERC-1271
setPaused(bool) · revoke(task) · withdraw(to, value)              // owner`}</pre>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="pricing">
        <p className="eyebrow">Pricing · planned</p>
        <h2 id="pricing" className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">
          Free while it&apos;s on testnet.
        </h2>
        <p className="mt-2 max-w-2xl text-[14.5px] text-text-2">How we plan to charge once Aerar is on Base mainnet and audited. Everything is free today.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className="vault-slip p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">{p.name}</p>
              <p className="mt-2 text-[24px] font-semibold tracking-tight">{p.price}</p>
              <p className="mt-1 text-[13px] text-text-2">{p.for}</p>
              <ul className="mt-4 space-y-1.5 border-t border-dashed border-border-strong pt-4 text-[13px]">
                {p.items.map((i) => (
                  <li key={i}>· {i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

async function Live() {
  await connection();
  const s = await liveStats(await getDbOnly()).catch(() => null);
  if (!s) return null;
  const items: [string, string][] = [
    ["purchases decided", s.decided.toLocaleString("en-US")],
    ["checked on Base", s.onchain.toLocaleString("en-US")],
    ["stopped before paying", s.stopped],
    ["saved by reuse", s.saved],
    ["sandboxes opened", s.sandboxes.toLocaleString("en-US")],
    ["wallet workspaces", s.wallets.toLocaleString("en-US")],
  ];
  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-card" aria-label="Live numbers">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-3">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-success text-success" aria-hidden /> Live on this deployment
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-text-3">{k}</dt>
            <dd className="tabular text-[20px] font-semibold tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
