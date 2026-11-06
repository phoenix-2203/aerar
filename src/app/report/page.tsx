import type { Metadata } from "next";
import { Suspense } from "react";
import { Shell } from "@/components/ui";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { morningReport, windowFor } from "@/lib/server/report";
import { operatorOrLogin } from "@/lib/server/session";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Morning report" };


export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <Shell active="/report">
      <Suspense fallback={<p className="text-muted">Reading the night&apos;s ledger…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  const sp = await searchParams;
  const period = typeof sp.period === "string" ? sp.period : undefined;
  await operatorOrLogin(`/report${period ? `?period=${period}` : ""}`);
  const w = windowFor(period);
  const r = await morningReport(await getDbOnly(), operatorOrgId(), w);

  return <ReportView r={r} w={w} mode={{ readOnly: false, basePath: "/report", defaultPeriod: "night" }} />;
}
