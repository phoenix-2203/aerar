// Public attack lab (no login): every real-world scenario Aerar is built for, grouped by the problem it answers.
// Each Run plays the scenario through the real purchase pipeline on an isolated sandbox database.
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PublicShell } from "@/components/app-shell";
import { PROBLEMS, SCENARIOS, type ProblemId } from "@/lib/scenarios";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { ScenarioLab, type LabGroup } from "./scenario-lab";

export const metadata: Metadata = {
  title: "Attack lab",
  description: `Run ${SCENARIOS.length} real-world attacks and mistakes against Aerar's purchase pipeline and see what it stops. No login, no wallet.`,
};

const groups: LabGroup[] = (Object.keys(PROBLEMS) as ProblemId[])
  .map((id) => ({
    id,
    title: PROBLEMS[id].title,
    short: PROBLEMS[id].short,
    scenarios: SCENARIOS.filter((s) => s.problem === id).map(({ id, title, story, expected }) => ({ id, title, story, expected })),
  }))
  .filter((g) => g.scenarios.length);

export default function ScenariosPage() {
  return (
    <PublicShell active="/scenarios">
      <div className="max-w-2xl animate-fade-up">
        <p className="text-[13px] font-medium text-accent">Attack lab</p>
        <h1 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[42px]">Throw real attacks at Aerar.</h1>
        <p className="mt-3 text-[15px] leading-6 text-text-2">
          {SCENARIOS.length} things that really go wrong when agents spend money. Each one runs through the real pipeline on a sandbox, next to what a plain
          agent wallet would have paid. Real testnet payments are in the{" "}
          <Link href="/demo" className="font-medium text-text underline decoration-border-strong underline-offset-4 hover:decoration-text">
            live report
          </Link>
          .
        </p>
      </div>

      <Suspense fallback={null}>
        <PageLimit />
      </Suspense>

      <div className="mt-8">
        <ScenarioLab groups={groups} />
      </div>
    </PublicShell>
  );
}

/** Counts page views per IP; shows a notice when someone reloads very often. Runs have their own limits. */
async function PageLimit() {
  await connection(); // request-time only: the rate limiter reads the clock
  const rate = publicLimits().publicPages.check(clientIp(await headers()));
  if (rate.ok) return null;
  return (
    <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-text-2">
      You&apos;ve loaded this page a lot in the last minute. Runs may be refused for {rate.retryAfter} seconds.
    </p>
  );
}
