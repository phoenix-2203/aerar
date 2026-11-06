import Link from "next/link";
import { Logo } from "@/components/ui";

const STEPS = [
  { t: "Access first", d: "Is this agent on the task, is the task live, is the provider allowed? If not, the provider is never contacted." },
  { t: "Already bought?", d: "If any agent in your organisation bought the identical request recently, Aerar serves that result for $0." },
  { t: "The real price", d: "Aerar reads the provider's own x402 quote and checks it against the task's versioned rules. Plain code; no AI decides about money." },
  { t: "Pay the quote, nothing else", d: "Budget reserved under a lock, price re-quoted, USDC paid on Base. A changed price or payee pays nothing." },
  { t: "Prove it", d: "Response hash, transaction hash, an onchain check of the transfer, and a hash-chained audit log." },
];

const NIGHT = [
  { at: "01:12", tone: "text-paid", s: "Paid $0.10", d: "Agent A buys the AI-agents report for tonight's brief. Transfer verified on Base." },
  { at: "01:40", tone: "text-saved", s: "Reused · $0", d: "Agent B asks for the identical report. Served from memory; $0.10 not spent twice." },
  { at: "02:30", tone: "text-wait", s: "Waiting", d: "Premium report at $0.50 is above the approval line. Held for a person." },
  { at: "03:15", tone: "text-refused", s: "Refused", d: "A scraped page tells Agent A to buy from an unknown host. Not on the list; never contacted." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-5 text-sm">
          <a href="https://github.com/phoenix-2203/aerar" className="text-muted hover:text-text">GitHub</a>
          <Link href="/scenarios" className="text-muted hover:text-text">Scenarios</Link>
          <Link href="/report" className="rounded-lg border border-line px-3 py-1.5 hover:border-lamp/50">Operator login</Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-center gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <p className="text-sm font-medium text-lamp">For AI agents that pay over x402 on Base</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Every agent purchase, accounted for.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Your agents buy data and APIs all night, a few cents at a time. Spending caps stop the worst case. Aerar tells you the rest:
              which task each purchase was for, whether it was allowed, whether you already had it, and proof that you paid exactly what was quoted.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/scenarios#injection" className="rounded-lg bg-lamp px-5 py-2.5 font-medium text-ink transition hover:brightness-110">See it handle an attack</Link>
              <Link href="/demo" className="rounded-lg border border-line px-5 py-2.5 transition hover:border-lamp/50">See last night&apos;s report</Link>
            </div>
            <p className="mt-4 text-sm text-faint">
              No login or wallet needed. Testnet only: settles in USDC on Base Sepolia.{" "}
              <a href="#connect" className="text-muted hover:text-text">Connect an agent ↓</a>
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-panel/80 p-5 shadow-2xl shadow-black/30">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <span className="text-sm font-medium">Last night</span>
              <span className="text-xs text-muted">Market research sprint</span>
            </div>
            <ol className="mt-4 space-y-4">
              {NIGHT.map((n) => (
                <li key={n.at} className="grid grid-cols-[3rem_1fr] gap-3">
                  <span className="num pt-0.5 text-xs text-faint">{n.at}</span>
                  <div>
                    <div className={`text-sm font-medium ${n.tone}`}>{n.s}</div>
                    <p className="text-sm text-muted">{n.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl bg-night/70 p-3 text-sm">
              <span className="text-lamp">Morning report:</span> 1 paid and verified, $0.10 not spent twice, 1 refused, 1 waiting for you.
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="text-2xl font-semibold tracking-tight">What happens on every request</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.t} className="rounded-2xl border border-line bg-panel/60 p-5">
                <span className="num text-sm text-lamp">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-medium">{s.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-10 border-t border-line py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Not another spending limit</h2>
            <p className="mt-3 leading-relaxed text-muted">
              Wallets already cap how much an agent can spend. That answers &quot;how bad can it get&quot;, not &quot;what did we buy and was it right&quot;.
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                ["Procurement memory", "Two agents asking for the same thing pay once."],
                ["Quote-bound", "Decides and pays on the provider's real 402 price, re-quoted before paying."],
                ["Proven", "Every payment checked onchain; every decision in a tamper-evident log."],
                ["Keyless agents", "Agents never hold a wallet. Revoke one in a click."],
              ].map(([k, v]) => (
                <li key={k} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lamp" />
                  <span>
                    <span className="font-medium">{k}.</span> <span className="text-muted">{v}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div id="connect">
            <h2 className="text-2xl font-semibold tracking-tight">Connect an agent</h2>
            <p className="mt-3 leading-relaxed text-muted">Over MCP or REST. The agent gets a revocable key, never a wallet.</p>
            <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-night p-4 font-mono text-xs leading-6 text-muted">
              <span className="text-faint"># keep the key in an env var, not in a chat</span>
              {"\n"}claude mcp add --transport http aerar \{"\n"}  https://&lt;your-aerar&gt;/api/mcp \{"\n"}  --header &quot;Authorization: Bearer $AERAR_AGENT_KEY&quot;
            </pre>
            <p className="mt-3 text-sm text-muted">
              Tools: <code className="text-text">buy_resource</code> and <code className="text-text">get_purchase</code>.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-6 text-sm text-faint sm:px-6">
          <span>Aerar · built for Vibestarter Vibeathon 02, &quot;Night shift&quot;</span>
          <span>Your agents work the night shift. Aerar is the morning report.</span>
        </div>
      </footer>
    </div>
  );
}
