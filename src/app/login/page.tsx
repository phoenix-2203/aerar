import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-block text-lg">
          <Logo />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Operator login</h1>
        <p className="mt-2 text-sm text-muted">See what your agents bought overnight, and approve what&apos;s waiting.</p>
        <Suspense>
          <NextField searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function NextField({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/report";
  return <LoginForm next={next} />;
}
