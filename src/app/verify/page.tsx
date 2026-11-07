// Public receipt verifier: paste any Aerar receipt (or open /verify?id=pur_…) and check it in your own browser.
import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicShell } from "@/components/app-shell";
import { Verifier } from "./verifier";

export const metadata: Metadata = {
  title: "Verify a receipt",
  description: "Check an Aerar purchase receipt yourself: that it wasn't edited, that Aerar signed it, and that the USDC transfer on Base matches.",
};

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  return (
    <PublicShell active="/verify">
      <div className="max-w-2xl animate-fade-up">
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[42px]">Don&apos;t trust the dashboard. Check the receipt.</h1>
        <p className="mt-3 text-[15px] leading-6 text-text-2">
          Every purchase Aerar decides comes with a signed receipt: what was asked, the provider&apos;s real quote, the rules version, every reason, and where the
          money went. This page checks one in your browser: unchanged, signed by Aerar, and matching the USDC transfer on Base.
        </p>
      </div>
      <div className="mt-8">
        <Suspense fallback={null}>
          <WithId searchParams={searchParams} />
        </Suspense>
      </div>
    </PublicShell>
  );
}

async function WithId({ searchParams }: { searchParams: PageProps<"/verify">["searchParams"] }) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" && /^pur_[A-Za-z0-9_-]{6,40}$/.test(sp.id) ? sp.id : undefined;
  return <Verifier initialId={id} />;
}
