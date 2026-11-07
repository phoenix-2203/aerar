"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CodeTabs({ site }: { site: string }) {
  const TABS: { id: string; name: string; code: string }[] = [
    {
      id: "sdk",
      name: "SDK",
      code: `npm install ${site}/sdk/aerar-sdk-0.1.0.tgz

import { Aerar, isPaid, needsApproval, dataOf } from "@aerar/sdk";

const aerar = new Aerar({ apiKey: process.env.AERAR_KEY! }); // from /try or /vault, never commit it

const m = await aerar.mandate();          // purpose, IntentLock categories, limits, budget left
const p = await aerar.buy({ url: "https://api.marketdata.dev/fx-rates", purpose: "FX rates for the memo" });

if (isPaid(p)) use(dataOf(p));            // paid, or reused from memory for $0
else if (needsApproval(p)) await aerar.waitForDecision(p.id);
else console.log(p.summary);              // refused, with the reason in plain words

const proof = await aerar.evidence(p.id); // each claim labelled: signed, on Base, Aerar records, simulated`,
    },
    {
      id: "chat",
      name: "Claude / ChatGPT",
      code: `# In Claude: Settings → Connectors → Add custom connector
# In ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode → Create
# Paste your workspace's connector URL (shown in /try and /vault):

${site}/api/mcp/k/<your agent key>

# Then ask: "What are my task's rules?" · "Buy the market report"`,
    },
    {
      id: "code",
      name: "Claude Code",
      code: `export AERAR_KEY=aer_…   # from /try or /vault, never commit it

claude mcp add --transport http aerar ${site}/api/mcp \\
  --header "Authorization: Bearer $AERAR_KEY"`,
    },
    {
      id: "rest",
      name: "REST",
      code: `curl -s ${site}/api/v1/purchases \\
  -H "Authorization: Bearer $AERAR_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "taskId": "tsk_…",
    "url": "https://reports.acme.dev/market-report",
    "purpose": "Market report for the overnight memo",
    "idempotencyKey": "memo-step-3"
  }'`,
    },
    {
      id: "ts",
      name: "fetch",
      code: `const res = await fetch("${site}/api/v1/purchases", {
  method: "POST",
  headers: { authorization: \`Bearer \${process.env.AERAR_KEY}\`, "content-type": "application/json" },
  body: JSON.stringify({ taskId, url, purpose, idempotencyKey: \`\${taskId}-\${step}\` }),
});
const p = await res.json();
// p.status: "delivered" | "reused" | "awaiting_approval" | "declined" | …
// p.summary: one plain sentence · p.receipt.verifyUrl: the signed receipt`,
    },
  ];
  const [on, setOn] = useState("sdk");
  const [copied, setCopied] = useState(false);
  const t = TABS.find((x) => x.id === on)!;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex overflow-x-auto" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={on === x.id}
              onClick={() => setOn(x.id)}
              className={`relative whitespace-nowrap px-3 py-3 text-[13px] font-medium transition-colors ${on === x.id ? "text-text" : "text-text-3 hover:text-text-2"}`}
            >
              {x.name}
              {on === x.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-accent" aria-hidden />}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(t.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              /* blocked */
            }
          }}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-text-2 hover:text-text"
        >
          {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre key={on} className="animate-arrive overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-text-2">
        {t.code}
      </pre>
    </div>
  );
}
