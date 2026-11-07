"use client";
// "Fits where you already work": hover or tab through the places Aerar plugs into. Each icon moves on its own way.
import { BadgeCheck, BellRing, Code2, Landmark, MessageSquareText, Users } from "lucide-react";
import { useState } from "react";

const PLACES = [
  {
    id: "chat",
    icon: MessageSquareText,
    name: "Claude & ChatGPT",
    motion: "icon-bob",
    title: "Your chat app is the agent",
    text: "Paste one connector URL into Claude or ChatGPT. Then just ask: “buy the market report”, “what did you spend overnight?”. Every purchase still goes through your rules.",
    example: "“What did you buy last night, and what got refused?”",
  },
  {
    id: "approvals",
    icon: BellRing,
    name: "Slack · Discord · Telegram",
    motion: "icon-ring",
    title: "Approvals where your team already is",
    text: "Anything above your limit is posted to your channel with one link. It opens the purchase; one tap approves or declines. Links name one purchase and expire in a day.",
    example: "Approve $0.90 to reports.acme.dev?  → Review and decide",
  },
  {
    id: "vault",
    icon: Landmark,
    name: "Your wallet",
    motion: "icon-lift",
    title: "Money in a Vault you own",
    text: "Connect MetaMask, Coinbase Wallet or Rabby. Open a Vault on Base, sign its limits. Aerar can only ask it to pay; the contract says yes or no.",
    example: "Pays only: 2 shops · ≤ $0.50 each · ≤ $1.00 a day",
  },
  {
    id: "team",
    icon: Users,
    name: "Your team",
    motion: "icon-pop",
    title: "Owners, approvers, viewers",
    text: "Invite teammates by wallet. Approvers decide held purchases; viewers watch; only the owner's wallet can touch the money.",
    example: "0x9a…41 · approver · approves or declines held purchases",
  },
  {
    id: "dev",
    icon: Code2,
    name: "Any agent framework",
    motion: "icon-tilt",
    title: "MCP or REST, one line",
    text: "Two tools: buy_resource and get_purchase. Keys per agent, revocable in a click. Provider data comes back fenced as untrusted.",
    example: "claude mcp add --transport http aerar https://aerar…/api/mcp",
  },
  {
    id: "proof",
    icon: BadgeCheck,
    name: "Your accountant",
    motion: "icon-spin",
    title: "Receipts anyone can check",
    text: "Every decision has a signed receipt: the request, the real quote, the rules, every reason, the transfer. Checked in the browser against Base.",
    example: "Receipt unchanged ✓ · Signed by Aerar ✓ · Money moved ✓",
  },
];

export function WhereYouWork() {
  const [on, setOn] = useState("chat");
  const p = PLACES.find((x) => x.id === on)!;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLACES.map((x) => {
          const Icon = x.icon;
          const active = x.id === on;
          return (
            <li key={x.id}>
              <button
                onMouseEnter={() => setOn(x.id)}
                onFocus={() => setOn(x.id)}
                onClick={() => setOn(x.id)}
                aria-pressed={active}
                className={`group/w flex h-full w-full flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200 ${
                  active ? "border-border-strong bg-surface shadow-lift" : "border-border bg-surface/60 hover:border-border-strong"
                }`}
              >
                <span className={`grid size-10 place-items-center rounded-xl transition-colors duration-200 ${active ? "bg-accent text-on-accent" : "bg-surface-2 text-text-2"}`}>
                  <Icon className={`size-5 ${active ? x.motion : ""}`} aria-hidden />
                </span>
                <span className="text-[13.5px] font-medium leading-5">{x.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div key={p.id} className="animate-arrive rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h3 className="text-[19px] font-semibold tracking-tight">{p.title}</h3>
        <p className="mt-2 text-[14px] leading-6 text-text-2">{p.text}</p>
        <p className="mt-5 rounded-lg border border-dashed border-border-strong bg-bg/40 px-3 py-2.5 font-mono text-[12px] text-text-2">{p.example}</p>
      </div>
    </div>
  );
}
