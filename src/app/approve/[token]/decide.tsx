"use client";
import { Check, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { decideByLink } from "./actions";

export function DecideButtons({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [out, setOut] = useState<{ error?: string; done?: string } | null>(null);
  const go = (kind: "approve" | "reject") => {
    setWhich(kind);
    start(async () => setOut(await decideByLink(token, kind)));
  };
  if (out?.done)
    return (
      <p className={`animate-pop text-center font-mono text-lg font-semibold tracking-widest ${out.done === "Approved" ? "text-success" : "text-text-2"}`} role="status">
        {out.done.toUpperCase()}
      </p>
    );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => go("reject")} disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface font-medium transition hover:border-border-strong active:scale-[0.98] disabled:opacity-60">
          {pending && which === "reject" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />} Decline
        </button>
        <button onClick={() => go("approve")} disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-on-primary transition active:scale-[0.98] disabled:opacity-60">
          {pending && which === "approve" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Approve
        </button>
      </div>
      {out?.error && <p className="mt-3 text-center text-sm text-danger">{out.error}</p>}
    </div>
  );
}
