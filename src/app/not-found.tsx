// 404: say so plainly and point at the three ways in.
import Link from "next/link";
import { PublicShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";

export default function NotFound() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-xl py-16 text-center">
        <p className="eyebrow">404 · not in the ledger</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[44px]">
          Nothing was bought <span className="text-wash">at this address.</span>
        </h1>
        <p className="mt-4 text-[15px] leading-6 text-text-2">The page you asked for doesn&apos;t exist. Here&apos;s where the night shift actually happens:</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/try" variant="primary">
            Try it, no wallet
          </ButtonLink>
          <ButtonLink href="/scenarios" variant="secondary">
            Attack lab
          </ButtonLink>
        </div>
        <p className="mt-6 text-[13px] text-text-3">
          Or go <Link href="/" className="underline hover:text-text">home</Link>.
        </p>
      </section>
    </PublicShell>
  );
}
