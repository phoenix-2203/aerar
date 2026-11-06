// The seven pipeline steps with live states (passed, failed, held, skipped, pending). Server-renderable.
import { CheckCircle2, Clock, Loader2, MinusCircle, XCircle } from "lucide-react";
import { purchaseSteps, STEP_INFO, STEP_ORDER, type PurchaseLike, type Step, type StepState } from "@/lib/copy/steps";

const STATE: Record<StepState, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  passed: { icon: CheckCircle2, cls: "text-success", label: "Passed" },
  failed: { icon: XCircle, cls: "text-danger", label: "Stopped here" },
  held: { icon: Clock, cls: "text-warning", label: "Held for a person" },
  pending: { icon: Loader2, cls: "text-text-2", label: "In progress" },
  skipped: { icon: MinusCircle, cls: "text-text-2", label: "Not reached" },
};

export function PurchaseTimeline({ purchase, steps }: { purchase?: PurchaseLike; steps?: Step[] }) {
  const list = steps ?? (purchase ? purchaseSteps(purchase) : []);
  return (
    <ol className="space-y-0">
      {list.map((s, i) => {
        const st = STATE[s.state];
        const Icon = st.icon;
        return (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < list.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%-20px)] w-px bg-border" aria-hidden />}
            <Icon className={`relative mt-0.5 size-[18px] shrink-0 ${st.cls} ${s.state === "pending" ? "animate-spin" : ""}`} aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={s.state === "skipped" ? "text-text-2" : "font-medium"}>{s.title}</span>
                <span className={`text-xs ${st.cls}`}>{st.label}</span>
              </div>
              {s.state !== "skipped" && <p className="text-[13px] text-text-2">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The pipeline explained, for the landing page: what each step does on every request. */
export function PipelineExplainer() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-7">
      {STEP_ORDER.map((id, i) => (
        <li key={id} className="bg-surface p-4">
          <span className="tabular text-xs font-medium text-brass">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="mt-1 text-sm font-semibold">{STEP_INFO[id].title}</h3>
          <p className="mt-1 text-[13px] leading-5 text-text-2">{STEP_INFO[id].does}</p>
        </li>
      ))}
    </ol>
  );
}
