// Public, read-only morning report for the seeded demo workspace: real purchases by Aerar's demo agent, paid in
// test USDC on Base Sepolia. No login; approve/decline are shown disabled. Rate-limited per IP.
import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/app-shell";
import { ReportSkeleton } from "@/components/skeleton";
import { getDbOnly } from "@/lib/server/context";
import { getPurchaseDetail } from "@/lib/server/queries";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { morningReport, windowFor } from "@/lib/server/report";
import { PurchaseDrawer } from "../report/purchase-drawer";
import { reportHref, ReportView, type ReportQuery, type ViewMode } from "../report/report-view";

export const metadata: Metadata = {
  title: "Last night's report",
  description: "Aerar's public demo workspace: real purchases by an AI agent, paid in test USDC on Base Sepolia, each with onchain proof. Read-only.",
};

/** The workspace the seed script creates. Public on purpose: it only holds testnet demo activity. */
const DEMO_ORG_ID = process.env.AERAR_PUBLIC_DEMO_ORG_ID || "org_demo";
const MODE: ViewMode = { readOnly: true, basePath: "/demo", defaultPeriod: "7d" };
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default function DemoPage({ searchParams }: PageProps<"/demo">) {
  return (
    <PublicShell active="/demo">
      <div className="mb-6 flex flex-col gap-2 rounded-xl border border-info/30 bg-info-tint px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <Eye className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <span>
            <span className="font-medium text-info">Read-only demo · test USDC on Base Sepolia.</span>{" "}
            <span className="text-text-2">Real purchases by Aerar&apos;s demo agent. Open any row to see every step and its onchain proof.</span>
          </span>
        </p>
        <Link href="/scenarios" className="shrink-0 font-medium text-info hover:underline">
          Try the attack lab →
        </Link>
      </div>
      <Suspense fallback={<ReportSkeleton />}>
        <Demo searchParams={searchParams} />
      </Suspense>
    </PublicShell>
  );
}

async function Demo({ searchParams }: { searchParams: PageProps<"/demo">["searchParams"] }) {
  await connection(); // request-time only: the rate limiter and report window read the clock
  const rate = publicLimits().publicPages.check(clientIp(await headers()));
  if (!rate.ok)
    return <p className="rounded-xl border border-border bg-surface p-5 text-text-2">You&apos;ve opened this page a lot in the last minute. Try again in {rate.retryAfter} seconds.</p>;

  const sp = await searchParams;
  const q: ReportQuery = { period: str(sp.period) ?? MODE.defaultPeriod, status: str(sp.status), task: str(sp.task) };
  const purchase = str(sp.purchase);
  const db = await getDbOnly();
  const w = windowFor(q.period);
  const [r, detail] = await Promise.all([morningReport(db, DEMO_ORG_ID, w), purchase ? getPurchaseDetail(db, DEMO_ORG_ID, purchase) : null]);
  return (
    <>
      <ReportView r={r} w={w} mode={MODE} q={q} />
      {purchase && <PurchaseDrawer detail={detail} closeHref={reportHref(MODE, q)} />}
    </>
  );
}
