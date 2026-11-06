// Public, read-only morning report for the seeded demo workspace. No login, no approve/reject.
// Rate-limited per IP. Shows real Base Sepolia purchases made by the demo agent.
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { PublicShell } from "@/components/ui";
import { getDbOnly } from "@/lib/server/context";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { morningReport, windowFor } from "@/lib/server/report";
import { ReportView } from "../report/report-view";

export const metadata: Metadata = {
  title: "Last night's report",
  description: "The morning report for Aerar's public demo workspace: real testnet purchases, read-only.",
};

/** The workspace the seed script creates. Public on purpose: it only holds testnet demo activity. */
const DEMO_ORG_ID = process.env.AERAR_PUBLIC_DEMO_ORG_ID || "org_demo";

export default function DemoPage({ searchParams }: PageProps<"/demo">) {
  return (
    <PublicShell active="/demo">
      <Suspense fallback={<p className="text-muted">Reading the night&apos;s ledger…</p>}>
        <Demo searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function Demo({ searchParams }: { searchParams: PageProps<"/demo">["searchParams"] }) {
  await connection(); // request-time only: the rate limiter and report window read the clock
  const rate = publicLimits().publicPages.check(clientIp(await headers()));
  if (!rate.ok)
    return (
      <p className="rounded-xl border border-line bg-panel p-5 text-muted">
        You&apos;ve opened this page a lot in the last minute. Try again in {rate.retryAfter} seconds.
      </p>
    );

  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : "7d";
  const w = windowFor(period);
  const r = await morningReport(await getDbOnly(), DEMO_ORG_ID, w);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-saved/30 bg-saved-soft px-4 py-3 text-sm">
        <span className="font-medium text-saved">Read-only demo.</span>{" "}
        <span className="text-muted">
          Real purchases by Aerar&apos;s demo agent, paid in test USDC on Base Sepolia. Approvals happen in the private operator dashboard. Want to
          see Aerar under pressure?{" "}
          <Link href="/scenarios" className="text-text underline-offset-2 hover:underline">
            Run the scenarios
          </Link>
          .
        </span>
      </div>
      <ReportView r={r} w={w} mode={{ readOnly: true, basePath: "/demo", defaultPeriod: "7d" }} />
    </div>
  );
}
