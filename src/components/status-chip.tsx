// Fixed status chips: text + icon + colour, never colour alone. Labels come from the shared copy.
import { Ban, CheckCircle2, CircleDashed, Clock, HelpCircle, Loader2, Repeat2, XCircle } from "lucide-react";
import { statusCopy, type Tone } from "@/lib/copy/reasons";

export const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-tint text-success",
  info: "bg-info-tint text-info",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-surface-2 text-text-2",
};

const ICON: Record<string, typeof CheckCircle2> = {
  delivered: CheckCircle2,
  reused: Repeat2,
  free: CheckCircle2,
  awaiting_approval: Clock,
  declined: Ban,
  rejected: Ban,
  reserved: Loader2,
  paying: Loader2,
  payment_failed: XCircle,
  unknown: HelpCircle,
  expired: CircleDashed,
};

export function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const s = statusCopy(status);
  const Icon = ICON[status] ?? CircleDashed;
  return (
    <span title={s.meaning} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[s.tone]} ${className}`}>
      <Icon className={`size-3.5 ${status === "paying" || status === "reserved" ? "animate-spin" : ""}`} aria-hidden />
      {s.label}
    </span>
  );
}
