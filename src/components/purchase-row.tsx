// One purchase in a list: who asked (avatar), what they asked for, where, the outcome, the amount and when.
// Opens the purchase drawer. Simulated rows carry "[simulated]" in their purpose; it shows as a small tag.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusChip } from "./status-chip";

export function splitPurpose(purpose: string) {
  const simulated = /\[simulated\]/i.test(purpose);
  return { text: purpose.replace(/\s*\[simulated\]\s*/gi, " ").trim(), simulated };
}

export function Avatar({ name }: { name: string }) {
  const initials = name.replace(/^night-/, "").slice(0, 2).toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-text"
      style={{ background: `color-mix(in oklab, hsl(${h} 60% 50%) 22%, var(--surface-2))` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function SimTag() {
  return <span className="shrink-0 rounded border border-border px-1 text-[10px] uppercase tracking-wide text-text-3">sim</span>;
}

export function PurchaseRow({
  href,
  purpose,
  agentName,
  host,
  status,
  amount,
  when,
}: {
  href: string;
  purpose: string;
  agentName?: string;
  host: string;
  status: string;
  amount: string | null;
  when: string;
}) {
  const { text, simulated } = splitPurpose(purpose);
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:gap-x-4 sm:px-5"
      >
        <Avatar name={agentName ?? host} />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-medium">{text}</span>
            {simulated && <SimTag />}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[12.5px] text-text-3">
            {agentName && (
              <>
                <span className="truncate">{agentName}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="truncate font-mono">{host}</span>
          </span>
        </span>
        <span className="flex items-center gap-3 sm:gap-5">
          <span className="hidden sm:block">
            <StatusChip status={status} />
          </span>
          <span className="min-w-16 text-right">
            <span className={`tabular block text-[14px] font-medium ${status === "reused" ? "text-text-3 line-through" : ""}`}>{amount ?? "—"}</span>
            <span className="tabular block whitespace-nowrap text-xs text-text-3">{when}</span>
          </span>
          <ChevronRight className="hidden size-4 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-text-2 sm:block" aria-hidden />
        </span>
        <span className="col-start-2 mt-1.5 sm:hidden">
          <StatusChip status={status} />
        </span>
      </Link>
    </li>
  );
}
