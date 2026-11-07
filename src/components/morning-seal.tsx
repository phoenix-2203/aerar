"use client";
// The Morning Seal card: when the audit log was last sealed on Base, and a button that checks it in the browser by
// reading the seal straight from the contract and comparing it with what the log says today.
import { CheckCircle2, ExternalLink, Loader2, Stamp, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { createPublicClient, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { sealAbi } from "@/lib/vault/artifacts";

type Status = {
  seq: number;
  entries: number;
  sealedAt: string;
  txHash: string;
  contract: Hex;
  sealer: Hex;
  workspace: Hex;
  headNow: string | null;
  chainOk: boolean;
};

const pub = createPublicClient({ chain: baseSepolia, transport: http() });

export function MorningSeal() {
  const [s, setS] = useState<Status | null | undefined>(undefined);
  const [check, setCheck] = useState<{ state: "idle" | "busy" | "ok" | "bad" | "skip"; text?: string }>({ state: "idle" });
  useEffect(() => {
    fetch("/api/seal/status")
      .then((r) => r.json())
      .then((d) => setS(d.seal ?? null))
      .catch(() => setS(null));
  }, []);
  if (s === undefined) return <div className="skeleton h-28 rounded-2xl" />;
  if (s === null)
    return (
      <div className="rounded-2xl border border-dashed border-border-strong p-4 text-[13px] text-text-2">
        <p className="flex items-center gap-2 font-medium text-text">
          <Stamp className="size-4 text-accent" aria-hidden /> Morning Seal
        </p>
        <p className="mt-1">Not sealed yet. Each morning the head of the audit log is written to Base.</p>
      </div>
    );

  const run = async () => {
    setCheck({ state: "busy" });
    try {
      const onchain = (await pub.readContract({ address: s.contract, abi: sealAbi, functionName: "latest", args: [s.sealer, s.workspace] })) as {
        head: Hex;
        seq: bigint;
        entries: number;
      };
      if (Number(onchain.seq) !== s.seq) return setCheck({ state: "bad", text: `Base has a different seal (entry #${onchain.seq}).` });
      if (!s.headNow || onchain.head.toLowerCase() !== s.headNow.toLowerCase())
        return setCheck({ state: "bad", text: `Entry #${s.seq} no longer matches what Base recorded: the log was changed after it was sealed.` });
      setCheck({ state: "ok", text: `Base holds the same hash for entry #${s.seq}. The ${s.entries} entries up to it are exactly as sealed.` });
    } catch {
      setCheck({ state: "skip", text: "Couldn't reach Base from this browser. Use the transaction link instead." });
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="flex items-center justify-between gap-2 text-[13.5px] font-medium">
        <span className="flex items-center gap-2">
          <Stamp className="size-4 text-accent" aria-hidden /> Morning Seal
        </span>
        <span className="font-mono text-[11px] text-text-3">{new Date(s.sealedAt).toUTCString().slice(5, 22)} UTC</span>
      </p>
      <p className="mt-1.5 text-[12.5px] leading-5 text-text-2">
        The audit log&apos;s head, entry #{s.seq} of {s.entries}, is written on Base. Nothing before it can change without the hashes no longer matching.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={check.state === "busy"} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-medium hover:border-border-strong disabled:opacity-60">
          {check.state === "busy" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Check against Base
        </button>
        <a href={`https://sepolia.basescan.org/tx/${s.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-info hover:underline">
          Seal transaction <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      {check.text && (
        <p className={`mt-3 flex animate-arrive gap-2 text-[12.5px] ${check.state === "ok" ? "text-success" : check.state === "bad" ? "text-danger" : "text-text-2"}`} role="status">
          {check.state === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : check.state === "bad" ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
          {check.text}
        </p>
      )}
      <p className="mt-2 font-mono text-[10.5px] text-text-3">sealed by {s.sealer.slice(0, 8)}…{s.sealer.slice(-4)} (Aerar&apos;s operator)</p>
    </div>
  );
}
