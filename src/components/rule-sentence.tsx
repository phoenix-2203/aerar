// A task's rules as sentences a person reads in one pass, with the guarantee that agents can't change them.
import { Check, Clock3, Globe, Hourglass, Lock, Repeat2, Wallet } from "lucide-react";
import type { PolicyRules } from "@/db/schema";
import { fmt$ } from "@/lib/money/usdc";

export function ruleSentences(r: PolicyRules, now = new Date()): { icon: typeof Check; text: string }[] {
  const max = fmt$(BigInt(r.maxPerPurchase));
  const auto = fmt$(BigInt(r.approvalAbove));
  const hosts = r.allowedProviders;
  const expires = r.expiresAt ? new Date(r.expiresAt) : null;
  return [
    { icon: Check, text: `Pay automatically up to ${auto} per purchase.` },
    { icon: Hourglass, text: BigInt(r.approvalAbove) < BigInt(r.maxPerPurchase) ? `Ask a person above ${auto}, up to ${max}. Never more than ${max}.` : `Never pay more than ${max} for one purchase.` },
    { icon: Globe, text: hosts.length ? `Only buy from ${hosts.join(", ")}. Every other provider is never contacted.` : "No providers are allowed yet, so nothing can be bought." },
    { icon: Clock3, text: `At most ${r.maxPurchasesPerHour} purchases per agent per hour.` },
    { icon: Repeat2, text: r.reuseWindowSeconds ? `Reuse an identical purchase for ${duration(r.reuseWindowSeconds)} instead of paying again.` : "Always buy fresh; never reuse earlier purchases." },
    {
      icon: Wallet,
      text: expires
        ? `${expires < now ? "Permission ended" : "Permission ends"} ${expires.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC.`
        : "No end date on this permission.",
    },
  ];
}

function duration(s: number) {
  if (s % 86400 === 0) return `${s / 86400} day${s === 86400 ? "" : "s"}`;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  if (s % 60 === 0) return `${s / 60} minutes`;
  return `${s} seconds`;
}

export function RuleSentences({ rules, version }: { rules: PolicyRules; version?: number }) {
  return (
    <div>
      <ul className="space-y-2.5">
        {ruleSentences(rules).map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2.5 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-text-2" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-text-2">
        <Lock className="size-3.5" aria-hidden />
        Set by you · agents can&apos;t change this{version ? ` · version ${version}` : ""}
      </p>
    </div>
  );
}
