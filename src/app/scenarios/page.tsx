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
    scenarios: SCENARIOS.filter((s) => s.problem === id).map(({ id, title, story, expected }) => ({ id, title, story, expected })),
  }))
  .filter((g) => g.scenarios.length);

export default function ScenariosPage() {
  return (
    <PublicShell active="/scenarios">
      <div className="max-w-3xl">
        <p className="text-[13px] font-medium text-brass">Attack lab · {SCENARIOS.length} scenarios · no login, no wallet</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Throw what really happens to agents at Aerar</h1>
        <p className="mt-3 text-[15px] leading-6 text-text-2">
          Prompt injection, lookalike providers, duplicate purchases, swapped payees, runaway loops. Press <span className="font-medium text-text">Run</span> on
          any card and watch Aerar&apos;s real purchase pipeline decide, step by step, next to what a plain agent wallet would have paid. Real testnet payments
          are in{" "}
          <Link href="/demo" className="font-medium text-info hover:underline">
            last night&apos;s report
          </Link>
          .
        </p>
      </div>

      <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Problems">
        {groups.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="shrink-0 rounded-full border border-border px-3 py-1 text-[13px] text-text-2 transition-colors hover:border-border-strong hover:text-text">
            {g.title} <span className="tabular">· {g.scenarios.length}</span>
          </a>
        ))}
      </nav>

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
