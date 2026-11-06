// Page frame. Operator shell: nav with a live approvals count. Public shell: the judge's path, no login.
import { and, count, eq } from "drizzle-orm";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions";
import { purchases } from "@/db/schema";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { isOperator } from "@/lib/server/session";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ToastProvider } from "./toast";

function NetworkPill() {
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-text-2 sm:inline-flex">
      <span className="size-1.5 rounded-full bg-info" aria-hidden />
      Base Sepolia (test)
    </span>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors ${active ? "bg-surface-2 font-medium text-text" : "text-text-2 hover:text-text"}`}
    >
      {children}
    </Link>
  );
}

async function ApprovalsBadge() {
  // Operators only; also makes this request-time (the session check reads the clock), so the count is never prerendered.
  if (!(await isOperator())) return null;
  const db = await getDbOnly();
  const [r] = await db
    .select({ n: count() })
    .from(purchases)
    .where(and(eq(purchases.orgId, operatorOrgId()), eq(purchases.status, "awaiting_approval")));
  if (!r?.n) return null;
  return (
    <span className="tabular rounded-full bg-warning-tint px-1.5 text-xs font-semibold text-warning" aria-label={`${r.n} waiting`}>
      {r.n}
    </span>
  );
}

function Frame({ nav, right, children, footer }: { nav: ReactNode; right: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link href="/" aria-label="Aerar home" className="shrink-0">
            <Logo />
          </Link>
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]" aria-label="Main">
            {nav}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">{right}</div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      {footer}
    </ToastProvider>
  );
}

export function AppShell({ active, children }: { active?: "/report" | "/audit" | "/tasks"; children: ReactNode }) {
  return (
    <Frame
      nav={
        <>
          <NavLink href="/report" active={active === "/report"}>
            Morning report
          </NavLink>
          <NavLink href="/report#approvals" active={false}>
            Approvals
            <Suspense fallback={null}>
              <ApprovalsBadge />
            </Suspense>
          </NavLink>
          <NavLink href="/report#tasks" active={active === "/tasks"}>
            Tasks
          </NavLink>
          <NavLink href="/audit" active={active === "/audit"}>
            Audit log
          </NavLink>
        </>
      }
      right={
        <>
          <NetworkPill />
          <ThemeToggle />
          <form action={logout}>
            <button className="grid size-8 place-items-center rounded-lg text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </>
      }
    >
      {children}
    </Frame>
  );
}

export function PublicShell({ active, children }: { active?: "/scenarios" | "/demo"; children: ReactNode }) {
  return (
    <Frame
      nav={
        <>
          <NavLink href="/scenarios" active={active === "/scenarios"}>
            Attack lab
          </NavLink>
          <NavLink href="/demo" active={active === "/demo"}>
            Last night&apos;s report
          </NavLink>
        </>
      }
      right={
        <>
          <NetworkPill />
          <ThemeToggle />
          <Link href="/login" className="hidden h-8 items-center rounded-lg px-2.5 text-sm text-text-2 hover:text-text sm:inline-flex">
            Operator sign in
          </Link>
        </>
      }
      footer={<SiteFooter />}
    >
      {children}
    </Frame>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-[13px] text-text-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Aerar · built for Vibestarter Vibeathon 02, &ldquo;Night shift&rdquo; · testnet only (Base Sepolia, test USDC)</span>
        <span className="flex gap-4">
          <a href="https://github.com/phoenix-2203/aerar" className="hover:text-text">
            GitHub
          </a>
          <Link href="/login" className="hover:text-text">
            Operator sign in
          </Link>
        </span>
      </div>
    </footer>
  );
}
