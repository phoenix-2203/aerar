"use client";
// Hashes and addresses: mono, middle-truncated, copy button, optional BaseScan link.
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

export function middle(value: string, head = 6, tail = 4) {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function Hash({
  value,
  kind,
  label,
  head = 6,
  tail = 4,
}: {
  value: string | null | undefined;
  /** "tx" or "address" links to BaseScan (Base Sepolia); omit for plain hashes. */
  kind?: "tx" | "address";
  label?: string;
  head?: number;
  tail?: number;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-text-2">—</span>;
  const valid = kind === "tx" ? /^0x[0-9a-fA-F]{64}$/.test(value) : kind === "address" ? /^0x[0-9a-fA-F]{40}$/.test(value) : true;
  const href = kind && valid ? `https://sepolia.basescan.org/${kind}/${value}` : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the full value is in the title tooltip */
    }
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-text" title={value}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-info hover:underline">
          {middle(value, head, tail)}
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">{label ?? (kind === "tx" ? "View transaction on BaseScan" : "View address on BaseScan")}</span>
        </a>
      ) : (
        <span>{middle(value, head, tail)}</span>
      )}
      <button type="button" onClick={copy} className="rounded p-0.5 text-text-2 hover:bg-surface-2 hover:text-text" aria-label={copied ? "Copied" : `Copy ${label ?? "value"}`}>
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
