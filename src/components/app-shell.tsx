// Page frame. Operator shell: nav with a live approvals count. Public shell: the judge's path, no login.
import { and, count, eq } from "drizzle-orm";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions";
import { purchases } from "@/db/schema";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { isOperator } from "@/lib/server/session";
import { Logo, LogoMark } from "./logo";
import { AccentToggle, ThemeToggle } from "./theme-toggle";
import { ToastProvider } from "./toast";

function NetworkPill() {
  return (
    <span className="hidden h-7 items-center gap-2 rounded-full border border-border bg-surface px-2.5 text-xs text-text-2 md:inline-flex">
      <span className="size-1.5 animate-pulse-dot rounded-full bg-success text-success" aria-hidden />
      Base Sepolia · test
    </span>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13.5px] transition-colors duration-150 ${active ? "bg-surface-2 font-medium text-text" : "text-text-2 hover:bg-surface-2/60 hover:text-text"}`}
    >
      {children}
    </Link>
  );
}

/** A shorter label on phones so the whole nav fits without scrolling. */
function Short({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </>
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
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/" aria-label="Aerar home" className="logo-hover shrink-0">
            <span className="hidden sm:inline">
              <Logo />
            </span>
            <span className="text-text sm:hidden">
              <LogoMark size={22} />
            </span>
          </Link>
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]" aria-label="Main">
            {nav}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">{right}</div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
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
            <Short short="Report" long="Morning report" />
          </NavLink>
          <NavLink href="/report#approvals" active={false}>
            Approvals
            <Suspense fallback={null}>
              <ApprovalsBadge />
            </Suspense>
          </NavLink>
          <span className="hidden sm:contents">
            <NavLink href="/report#tasks" active={active === "/tasks"}>
              Tasks
            </NavLink>
          </span>
          <NavLink href="/audit" active={active === "/audit"}>
            <Short short="Audit" long="Audit log" />
          </NavLink>
        </>
      }
      right={
        <>
          <NetworkPill />
          <AccentToggle />
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

export function PublicShell({ active, children }: { active?: "/scenarios" | "/demo" | "/try" | "/verify" | "/vault"; children: ReactNode }) {
  return (
    <Frame
      nav={
        <>
          <NavLink href="/try" active={active === "/try"}>
            Try it
          </NavLink>
          <NavLink href="/vault" active={active === "/vault"}>
            Vault
          </NavLink>
          <NavLink href="/scenarios" active={active === "/scenarios"}>
            <Short short="Attacks" long="Attack lab" />
          </NavLink>
          <span className="hidden sm:contents">
            <NavLink href="/demo" active={active === "/demo"}>
              Live report
            </NavLink>
          </span>
          <span className="hidden sm:contents">
            <NavLink href="/verify" active={active === "/verify"}>
              Verify
            </NavLink>
          </span>
        </>
      }
      right={
        <>
          <NetworkPill />
          <AccentToggle />
          <ThemeToggle />
          <Link href="/login" className="ml-1 hidden h-8 items-center rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:border-border-strong sm:inline-flex">
            Sign in
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
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[13px] text-text-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo size={18} />
          <span className="text-text-3">Built for Vibestarter Vibeathon 02 · testnet only</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 whitespace-nowrap" aria-label="Footer">
          <Link href="/try" className="hover:text-text">Try it</Link>
          <Link href="/vault" className="hover:text-text">Your Vault</Link>
          <Link href="/scenarios" className="hover:text-text">Attack lab</Link>
          <Link href="/verify" className="hover:text-text">Verify a receipt</Link>
          <Link href="/demo" className="hover:text-text">Live report</Link>
          <a href="https://github.com/phoenix-2203/aerar" className="hover:text-text">GitHub</a>
          <Link href="/login" className="hover:text-text">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
