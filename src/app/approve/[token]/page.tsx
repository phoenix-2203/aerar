// The page an "Approve?" link from Slack / Discord / Telegram opens: the purchase, why it waits, and two buttons.
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { PublicShell } from "@/components/app-shell";
import { purchases } from "@/db/schema";
import { explain, reasonKind, statusCopy } from "@/lib/copy/reasons";
import { fmt$ } from "@/lib/money/usdc";
import { readApprovalToken } from "@/lib/notify/notify";
import { getDbOnly } from "@/lib/server/context";
import { DecideButtons } from "./decide";

export const metadata: Metadata = { title: "Approve a purchase", robots: { index: false } };

export default function ApprovePage({ params }: PageProps<"/approve/[token]">) {
  return (
    <PublicShell>
      <Suspense fallback={<div className="skeleton mx-auto h-96 max-w-md rounded-2xl" />}>
        <Body params={params} />
      </Suspense>
    </PublicShell>
  );
}

async function Body({ params }: { params: PageProps<"/approve/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const t = readApprovalToken(token);
  if ("error" in t) return <Note text={t.error} />;
  const [p] = await (await getDbOnly()).select().from(purchases).where(eq(purchases.id, t.purchaseId));
  if (!p) return <Note text="That purchase doesn't exist any more." />;
  const waiting = p.status === "awaiting_approval";
  const why = p.reasonCodes.filter((c) => reasonKind(c) === "hold").map(explain);
  return (
    <div className="mx-auto max-w-md animate-fade-up">
      <article className="receipt-paper relative p-6 font-mono text-[12.5px] leading-5">
        <p className="text-center text-[13px] font-semibold tracking-[0.2em]">AERAR · APPROVAL</p>
        <p className="mt-1 text-center text-text-3">{p.createdAt.toUTCString()}</p>
        <hr className="receipt-rule" />
        <p className="py-3 text-center font-sans text-[34px] font-semibold tracking-tight">{p.quoteAmount != null ? fmt$(p.quoteAmount) : "?"}</p>
        <Row k="To" v={p.host} />
        <Row k="Item" v={new URL(p.url).pathname} />
        <Row k="Purpose" v={p.purpose} />
        <hr className="receipt-rule" />
        {why.map((w) => (
          <p key={w} className="py-0.5 text-text-2">
            · waiting because {w}
          </p>
        ))}
        <Row k="Status" v={<b>{statusCopy(p.status).label.toUpperCase()}</b>} />
      </article>
      <div className="mt-6">
        {waiting ? (
          <DecideButtons token={token} />
        ) : (
          <p className="text-center text-sm text-text-2">Already decided: {statusCopy(p.status).label.toLowerCase()}. Nothing more to do.</p>
        )}
        <p className="mt-4 text-center text-[12px] text-text-3">Approving re-checks the task&apos;s rules and the provider&apos;s price before anything is paid.</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-text-3">{k}</span>
      <span className="text-right [overflow-wrap:anywhere]">{v}</span>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return <p className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-2">{text}</p>;
}
