"use client";
// One purchase waiting for a person: the itemised amount, who asked, for which task, their stated reason, the rule
// that held it, and buttons that say exactly what they do. Read-only mode (public demo) shows them disabled.
import { Check, ChevronRight, Clock, X } from "lucide-react";
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
  const simulated = /\[simulated\]/i.test(item.purpose);
  const purpose = item.purpose.replace(/\s*\[simulated\]\s*/gi, " ").trim();
  return (
    <article className="relative overflow-hidden rounded-xl border border-warning/45 bg-surface shadow-card">
      <span className="absolute inset-y-0 left-0 w-1 bg-warning" aria-hidden />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pl-6">
        <div className="flex min-w-0 gap-4">
          <span className="hidden size-10 shrink-0 place-items-center rounded-lg bg-warning-tint text-warning sm:grid">
            <Clock className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium">
              <span className="min-w-0">&ldquo;{purpose}&rdquo;</span>
              {simulated && <span className="rounded border border-border px-1 text-[10px] font-normal uppercase tracking-wide text-text-3">sim</span>}
            </p>
            <p className="mt-1 text-[13px] text-text-2">
              <span className="tabular font-semibold text-text">{item.amountFormatted}</span> to <span className="font-mono">{item.host}</span> · {item.agentName} for {item.taskTitle}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-warning">Above this task&apos;s auto-approve limit</span>
              <Link href={item.detailsHref} scroll={false} className="group inline-flex items-center gap-0.5 font-medium text-text-2 hover:text-text">
                See every step
                <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </p>
          </div>
        </div>
        {readOnly ? <ReadOnlyButtons amount={item.amountFormatted} /> : <LiveButtons id={item.id} amount={item.amountFormatted} />}
      </div>
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
