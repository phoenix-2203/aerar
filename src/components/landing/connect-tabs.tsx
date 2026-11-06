"use client";
// One-line agent setup, as MCP or plain REST, with copy.
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

const SNIPPETS = {
  MCP: `claude mcp add --transport http aerar \\
  https://aerar.duckdns.org/api/mcp \\
  --header "Authorization: Bearer $AERAR_AGENT_KEY"`,
  REST: `curl https://aerar.duckdns.org/api/v1/purchases \\
  -H "Authorization: Bearer $AERAR_AGENT_KEY" \\
  -d '{"taskId":"tsk_…","url":"https://api.example.com/report",
       "purpose":"Market report for the memo","idempotencyKey":"r-1"}'`,
} as const;
type Tab = keyof typeof SNIPPETS;

export function ConnectTabs() {
  const [tab, setTab] = useState<Tab>("MCP");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <div role="tablist" aria-label="Connect with" className="flex gap-1">
          {(Object.keys(SNIPPETS) as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${tab === t ? "bg-surface-2 text-text" : "text-text-2 hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <CopyButton text={SNIPPETS[tab]} />
      </div>
      <pre key={tab} className="animate-arrive overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-text-2">
        <code>{SNIPPETS[tab]}</code>
      </pre>
    </div>
  );
}
