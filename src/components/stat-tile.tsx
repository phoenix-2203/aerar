// One money or count tile for the top of a report: icon, label, big number, one line of context.
import { Ban, CheckCircle2, Clock, Repeat2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/copy/reasons";

const ICON: Record<Tone, typeof CheckCircle2> = { success: CheckCircle2, info: Repeat2, warning: Clock, danger: Ban, neutral: Sparkles };
const TINT: Record<Tone, string> = {
  success: "bg-success-tint text-success",
  info: "bg-info-tint text-info",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-surface-2 text-text-2",
};

export function StatTile({ label, value, note, tone, href }: { label: string; value: ReactNode; note?: ReactNode; tone: Tone; href?: string }) {
  const Icon = ICON[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-text-2">{label}</span>
        <span className={`grid size-7 place-items-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${TINT[tone]}`}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="tabular mt-3 text-[30px] font-semibold leading-9 tracking-[-0.02em]">{value}</div>
      {note && <div className="mt-1 text-[13px] leading-5 text-text-3 sm:truncate">{note}</div>}
    </>
  );
  const cls = "group block rounded-xl border border-border bg-surface p-4 shadow-card transition-[border-color,transform] duration-200 sm:p-5";
  return href ? (
    <a href={href} className={`${cls} hover:-translate-y-0.5 hover:border-border-strong`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
