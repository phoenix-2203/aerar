"use client";
// One purchase waiting for a person: the itemised amount, who asked, for which task, their stated reason, the rule
// that held it, and buttons that say exactly what they do. Read-only mode (public demo) shows them disabled.
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { approve, reject, type ActionState } from "@/app/actions";
import { Button } from "./button";
import { useToast } from "./toast";

export interface ApprovalItem {
  id: string;
  amountFormatted: string | null;
  host: string;
  agentName: string;
  taskTitle: string;
  purpose: string;
  detailsHref: string;
}

function useResult(state: ActionState) {
  const toast = useToast();
  useEffect(() => {
    if (state?.done) toast({ tone: "success", text: state.done });
    if (state?.error) toast({ tone: "danger", text: state.error });
  }, [state, toast]);
}

export function ApprovalCard({ item, readOnly = false }: { item: ApprovalItem; readOnly?: boolean }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-warning/35 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-2xl font-semibold tracking-tight">{item.amountFormatted}</span>
          <span className="text-sm text-text-2">to</span>
          <span className="truncate font-mono text-sm">{item.host}</span>
        </div>
        <p className="mt-1 text-sm">
          <span className="font-medium">{item.agentName}</span> <span className="text-text-2">for</span> {item.taskTitle}
        </p>
        <blockquote className="mt-1.5 border-l-2 border-border-strong pl-2.5 text-sm text-text-2">“{item.purpose}”</blockquote>
        <p className="mt-2 text-xs text-warning">Held because the price is above this task&apos;s auto-approve limit.</p>
        <Link href={item.detailsHref} scroll={false} className="mt-1 inline-block text-xs text-info hover:underline">
          See every step
        </Link>
      </div>
      {readOnly ? <ReadOnlyButtons amount={item.amountFormatted} /> : <LiveButtons id={item.id} amount={item.amountFormatted} />}
    </article>
  );
}

function LiveButtons({ id, amount }: { id: string; amount: string | null }) {
  const [a, approveAction, approving] = useActionState(approve.bind(null, id), undefined);
  const [r, rejectAction, rejecting] = useActionState(reject.bind(null, id), undefined);
  useResult(a);
  useResult(r);
  const busy = approving || rejecting;
  return (
    <div className="flex shrink-0 gap-2">
      <form action={rejectAction}>
        <Button type="submit" variant="secondary" loading={rejecting} disabled={busy} icon={<X className="size-4" aria-hidden />}>
          Decline
        </Button>
      </form>
      <form action={approveAction}>
        <Button type="submit" variant="primary" loading={approving} disabled={busy} icon={<Check className="size-4" aria-hidden />}>
          Approve {amount}
        </Button>
      </form>
    </div>
  );
}

function ReadOnlyButtons({ amount }: { amount: string | null }) {
  const tip = "Operators approve this in the private dashboard. This demo is read-only.";
  return (
    <div className="flex shrink-0 gap-2" title={tip}>
      <Button variant="secondary" disabled aria-describedby="readonly-tip" icon={<X className="size-4" aria-hidden />}>
        Decline
      </Button>
      <Button variant="primary" disabled aria-describedby="readonly-tip" icon={<Check className="size-4" aria-hidden />}>
        Approve {amount}
      </Button>
      <span id="readonly-tip" className="sr-only">
        {tip}
      </span>
    </div>
  );
}
