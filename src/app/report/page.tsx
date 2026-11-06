import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ReportSkeleton } from "@/components/skeleton";
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { getPurchaseDetail } from "@/lib/server/queries";
import { morningReport, windowFor } from "@/lib/server/report";
import { operatorOrLogin } from "@/lib/server/session";
import { PurchaseDrawer } from "./purchase-drawer";
import { reportHref, ReportView, type ReportQuery, type ViewMode } from "./report-view";

export const metadata: Metadata = {
  title: "Morning report",
  description: "What your agents bought overnight, what was reused, declined or held for you, with onchain proof.",
};

const MODE: ViewMode = { readOnly: false, basePath: "/report", defaultPeriod: "night" };
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <AppShell active="/report">
      <Suspense fallback={<ReportSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  const sp = await searchParams;
  const q: ReportQuery = { period: str(sp.period), status: str(sp.status), task: str(sp.task) };
  const purchase = str(sp.purchase);
  await operatorOrLogin(reportHref(MODE, { ...q, purchase }));
  const db = await getDbOnly();
  const w = windowFor(q.period);
  const [r, detail] = await Promise.all([morningReport(db, operatorOrgId(), w), purchase ? getPurchaseDetail(db, operatorOrgId(), purchase) : null]);
  return (
    <>
      <ReportView r={r} w={w} mode={MODE} q={q} />
      {purchase && <PurchaseDrawer detail={detail} closeHref={reportHref(MODE, q)} />}
    </>
  );
}
