"use client";
import { useActionState } from "react";
import { approve, reject } from "@/app/actions";

export function DecisionButtons({ id, amount }: { id: string; amount: string | null }) {
  const [a, approveAction, approving] = useActionState(approve.bind(null, id), undefined);
  const [r, rejectAction, rejecting] = useActionState(reject.bind(null, id), undefined);
  const busy = approving || rejecting;
  const msg = a ?? r;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <form action={rejectAction}>
          <button disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-refused hover:text-refused disabled:opacity-50">
            {rejecting ? "Rejecting…" : "Reject"}
          </button>
        </form>
        <form action={approveAction}>
          <button disabled={busy} className="rounded-lg bg-lamp px-3 py-1.5 text-sm font-medium text-ink transition hover:brightness-110 disabled:opacity-50">
            {approving ? "Paying…" : `Approve${amount ? ` ${amount}` : ""}`}
          </button>
        </form>
      </div>
      {msg?.error && <p role="alert" className="max-w-xs text-right text-xs text-refused">{msg.error}</p>}
      {msg?.done && <p className="text-xs text-paid">{msg.done}</p>}
    </div>
  );
}
