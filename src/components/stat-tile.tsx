// One money or count tile for the top of a report (Mercury-style: headline first, a few tiles).
import type { ReactNode } from "react";
import type { Tone } from "@/lib/copy/reasons";

const DOT: Record<Tone, string> = { success: "bg-success", info: "bg-info", warning: "bg-warning", danger: "bg-danger", neutral: "bg-text-2" };

export function StatTile({ label, value, note, tone, href }: { label: string; value: ReactNode; note?: ReactNode; tone: Tone; href?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs font-medium text-text-2">
        <span className={`size-2 rounded-full ${DOT[tone]}`} aria-hidden />
        {label}
      </div>
      <div className="tabular mt-2 text-[28px] font-semibold leading-8 tracking-tight">{value}</div>
      {note && <div className="mt-1 text-[13px] text-text-2">{note}</div>}
    </>
  );
  const cls = "block rounded-xl border border-border bg-surface p-4 shadow-card";
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:border-border-strong`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
