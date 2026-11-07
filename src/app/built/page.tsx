// How Aerar was built: vibecoded with Claude, from research to contracts, in one build week. Numbers are from the repo.
import type { Metadata } from "next";
import { PublicShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "How it was built",
  description: "Aerar was built with Claude in one Vibeathon week: research, design, code, Solidity, tests, deploys.",
};

const NUMBERS: [string, string][] = [
  ["160+", "commits in the build week"],
  ["158", "automated tests (140 app + 18 contract)"],
  ["29", "attack scenarios run through the real pipeline"],
  ["2", "contracts on Base Sepolia: Vault factory, Morning Seal"],
  ["14k", "lines of TypeScript"],
  ["0", "AI calls in the money path"],
];

const STEPS: [string, string, string][] = [
  ["Research", "Claude", "Read x402, Circle's USDC v2.2 and the x402 facilitator source to find that a contract wallet can pay over x402 (ERC-1271). Wrote a read-only check; it passed on Base Sepolia."],
  ["Design", "Claude + Figma", "Logo explored across 20+ directions to the ledger mark; tokens, both themes and the night-ledger look designed in Figma through Claude, then built in Tailwind."],
  ["Build", "Claude Code + Cowork", "The pipeline, rules engine, memory, receipts, Vault, Morning Seal, approvals in chat, teams and the connector, each landed as a small tested commit."],
  ["Attack", "Claude", "37 scenarios written from real incidents (prompt injection, swapped payees, loops), run against the real pipeline on every build."],
  ["Verify", "Claude", "Every flow tested end to end on a local copy of Base Sepolia (anvil at chain 84532 with a USDC v2.2 stand-in), then in a real browser against the live site."],
  ["You decide", "People", "Product calls (what to build, what to cut, the look) were made by the builder; Claude proposed, built and checked."],
];

export default function BuiltPage() {
  return (
    <PublicShell active="/built">
      <section className="max-w-3xl animate-fade-up">
        <p className="eyebrow">How it was built</p>
        <h1 className="mt-3 text-[36px] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[48px]">
          One build week, <span className="text-wash">built with Claude.</span>
        </h1>
        <p className="mt-4 text-[16px] leading-7 text-text-2">
          Aerar was vibecoded for Vibestarter Vibeathon 02. Claude did the research, design, code, contracts and testing; the builder set the direction and made
          the calls. The product itself never asks an AI about money: every decision is plain, deterministic code you can read.
        </p>
      </section>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
        {NUMBERS.map(([n, k]) => (
          <div key={k} className="flex flex-col bg-surface p-5">
            <dt className="order-2 mt-1 text-[13px] text-text-2">{k}</dt>
            <dd className="tabular text-[30px] font-semibold tracking-tight">{n}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-14" aria-labelledby="steps">
        <p className="eyebrow">The process</p>
        <h2 id="steps" className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">
          From question to tested commit.
        </h2>
        <ol className="mt-6 divide-y divide-dashed divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {STEPS.map(([t, who, text], i) => (
            <li key={t} className="grid gap-2 px-5 py-4 sm:grid-cols-[48px_160px_minmax(0,1fr)] sm:gap-6">
              <span className="font-mono text-[12px] text-text-3">0{i + 1}</span>
              <span>
                <span className="block text-[15px] font-semibold">{t}</span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-accent">{who}</span>
              </span>
              <span className="text-[13.5px] leading-6 text-text-2">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 max-w-3xl" aria-labelledby="honest">
        <p className="eyebrow">Honest limits</p>
        <h2 id="honest" className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">
          What it isn&apos;t yet.
        </h2>
        <ul className="mt-4 space-y-2 text-[14px] leading-6 text-text-2">
          <li>· Testnet only (Base Sepolia, test USDC). No mainnet switch in this build.</li>
          <li>· The contracts are tested but not audited.</li>
          <li>· Control covers purchases that go through Aerar. An agent with its own unrestricted wallet can go around it; the Vault is how you close that.</li>
          <li>· x402 &ldquo;exact&rdquo; payments settle at once: no escrow or refunds yet.</li>
        </ul>
        <p className="mt-4 text-[13px] text-text-3">
          Source: <a className="underline hover:text-text" href="https://github.com/phoenix-2203/aerar">github.com/phoenix-2203/aerar</a>
        </p>
      </section>
    </PublicShell>
  );
}
