import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Operator sign in", description: "Sign in to approve purchases and read your agents' morning report." };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-16">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-[15px] font-semibold" aria-label="Aerar home">
          <LogoMark size={28} />
          Aerar
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Operator sign in</h1>
        <p className="mt-1.5 text-sm text-text-2">Approve what&apos;s waiting and read what your agents bought overnight.</p>
        <Suspense>
          <NextField searchParams={searchParams} />
        </Suspense>
        <div className="mt-8 rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="font-medium">Just looking around?</p>
          <p className="mt-0.5 text-text-2">No account needed for the public demo.</p>
          <div className="mt-3 flex flex-col gap-1.5">
            <Link href="/demo" className="inline-flex items-center gap-1 font-medium text-info hover:underline">
              See last night&apos;s report <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <Link href="/scenarios" className="inline-flex items-center gap-1 font-medium text-info hover:underline">
              Open the attack lab <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

async function NextField({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/report";
  return <LoginForm next={next} />;
}
