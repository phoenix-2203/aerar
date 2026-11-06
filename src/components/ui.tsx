import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5Z" fill="var(--color-lamp)" />
        <circle cx="17.5" cy="7" r="1.1" fill="var(--color-text)" opacity=".7" />
      </svg>
      Aerar
    </span>
  );
}

const NAV = [
  { href: "/report", label: "Morning report" },
  { href: "/audit", label: "Audit log" },
];

export function Shell({ active, children }: { active?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/report" aria-label="Aerar home">
            <Logo />
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 transition ${active === n.href ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden rounded-full border border-line px-2.5 py-0.5 text-xs text-muted sm:inline">Base Sepolia · testnet</span>
          <form action={logout}>
            <button className="text-sm text-muted hover:text-text">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

const PUBLIC_NAV = [
  { href: "/scenarios", label: "Scenarios" },
  { href: "/demo", label: "Last night's report" },
];

/** Header for the no-login pages judges and visitors can open. */
export function PublicShell({ active, children }: { active?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
          <Link href="/" aria-label="Aerar home">
            <Logo />
          </Link>
          <nav className="flex gap-1 text-sm">
            {PUBLIC_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${active === n.href ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden rounded-full border border-line px-2.5 py-0.5 text-xs text-muted md:inline">Public demo · no login</span>
          <Link href="/login" className="ml-auto text-sm text-muted hover:text-text md:ml-0">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel/80 ${className}`}>
      {title && (
        <div className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-medium text-text">{title}</h2>
          {aside && <div className="text-xs text-muted">{aside}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  paid: "text-paid bg-paid-soft",
  saved: "text-saved bg-saved-soft",
  refused: "text-refused bg-refused-soft",
  wait: "text-wait bg-wait-soft",
  plain: "text-muted bg-panel-2",
} as const;
export type Tone = keyof typeof TONES;
const DOTS: Record<Tone, string> = { paid: "bg-paid", saved: "bg-saved", refused: "bg-refused", wait: "bg-wait", plain: "bg-faint" };

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/80 p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
        <span className={`h-2 w-2 rounded-full ${DOTS[tone]}`} />
        {label}
      </div>
      <div className="num mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {note && <div className="mt-1.5 text-sm text-muted">{note}</div>}
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  delivered: { label: "Paid", tone: "paid" },
  reused: { label: "Reused · $0", tone: "saved" },
  free: { label: "Free", tone: "saved" },
  declined: { label: "Refused", tone: "refused" },
  rejected: { label: "Rejected", tone: "refused" },
  awaiting_approval: { label: "Waiting", tone: "wait" },
  reserved: { label: "Reserved", tone: "wait" },
  paying: { label: "Paying", tone: "wait" },
  payment_failed: { label: "Payment failed", tone: "refused" },
  unknown: { label: "Unknown", tone: "refused" },
  expired: { label: "Expired", tone: "plain" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "plain" as Tone };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[s.tone]}`}>{s.label}</span>;
}

export function TxLink({ hash }: { hash: string | null | undefined }) {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return hash ? <code className="text-xs text-muted">{hash}</code> : null;
  return (
    <a className="font-mono text-xs text-saved hover:underline" href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noreferrer">
      {hash.slice(0, 8)}…{hash.slice(-4)} ↗
    </a>
  );
}

export function time(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function dateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return `${new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}, ${time(d)} UTC`;
}
