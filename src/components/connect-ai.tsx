"use client";
// "Use it from Claude or ChatGPT": one connector URL for this workspace's agent, with copy-paste steps per app.
import { Check, Copy, Eye, EyeOff, MessageSquareText } from "lucide-react";
import { useState } from "react";

type App = "claude" | "chatgpt" | "code";

const STEPS: Record<App, { name: string; steps: string[] }> = {
  claude: {
    name: "Claude",
    steps: ["Open Claude → Settings → Connectors.", "Add custom connector, name it Aerar, paste the URL.", "In a chat, turn on the Aerar connector and ask away."],
  },
  chatgpt: {
    name: "ChatGPT",
    steps: ["Settings → Apps & Connectors → Advanced → turn on Developer mode.", "Create a connector, paste the URL, authentication: none.", "In a chat, pick Aerar from the tools menu and ask away."],
  },
  code: {
    name: "Claude Code",
    steps: ["Run this once in your terminal:"],
  },
};

export function ConnectAi({ url, examples }: { url: string; examples: string[] }) {
  const [app, setApp] = useState<App>("claude");
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const key = /\/k\/([^/]+)$/.exec(url)?.[1] ?? "";
  const masked = key ? url.replace(key, `${key.slice(0, 8)}${"•".repeat(14)}`) : url;
  const cmd = `claude mcp add --transport http aerar ${url}`;
  const copy = async (t: string, id: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card" aria-labelledby="connect-ai">
      <h2 id="connect-ai" className="flex items-center gap-2 text-[15px] font-semibold">
        <MessageSquareText className="size-4 text-accent" aria-hidden /> Use it from Claude or ChatGPT
      </h2>
      <p className="mt-1 text-[12.5px] leading-5 text-text-3">
        Your chat app becomes the agent. Every purchase still goes through your rules, and anything big still waits for a person.
      </p>

      <div className="mt-3 flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Chat app">
        {(Object.keys(STEPS) as App[]).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={app === a}
            onClick={() => setApp(a)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition ${app === a ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text"}`}
          >
            {STEPS[a].name}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-bg/40">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-3">{app === "code" ? "Command" : "Connector URL"}</span>
          <span className="flex items-center gap-3">
            <button onClick={() => setShow(!show)} className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text" aria-label={show ? "Hide key" : "Show key"}>
              {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            </button>
            <button onClick={() => copy(app === "code" ? cmd : url, "url")} className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text">
              {copied === "url" ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied === "url" ? "Copied" : "Copy"}
            </button>
          </span>
        </div>
        <p className="break-all p-3 font-mono text-[11.5px] leading-5 text-text-2">{app === "code" ? (show ? cmd : cmd.replace(url, masked)) : show ? url : masked}</p>
      </div>

      <ol className="mt-3 space-y-1 text-[12.5px] text-text-2">
        {STEPS[app].steps.map((s, i) => (
          <li key={s} className="flex gap-2">
            <span className="tabular text-text-3">{i + 1}.</span>
            {s}
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-text-3">Then try</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {examples.map((e) => (
          <button
            key={e}
            onClick={() => copy(e, e)}
            className="rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-left text-[12px] text-text-2 transition hover:border-border-strong hover:text-text"
            title="Copy"
          >
            {copied === e ? "Copied ✓" : `“${e}”`}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-4 text-text-3">The URL contains this agent&apos;s key: treat it like a password. It only works for this workspace and stops when you sign out of it or the key is revoked.</p>
    </section>
  );
}
