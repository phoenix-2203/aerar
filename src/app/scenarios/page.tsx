// Public, no-login page: every real-world scenario Aerar is built for, grouped by the problem it answers.
// Each "Run" plays the scenario through the real purchase pipeline in its own isolated, in-memory stage.
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { PublicShell } from "@/components/ui";
import { PROBLEMS, SCENARIOS, type ProblemId } from "@/lib/scenarios";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";
import { ScenarioCard } from "./scenario-card";

export const metadata: Metadata = {
  title: "Scenarios",
  description: "Run real-world attacks and mistakes against Aerar's purchase pipeline and watch what it does. No login.",
};

const groups = (Object.keys(PROBLEMS) as ProblemId[])
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
        <p className="text-sm text-lamp">{SCENARIOS.length} scenarios · no login · no wallet</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">See Aerar handle what goes wrong</h1>
        <p className="mt-3 leading-relaxed text-muted">
          Each scenario is something that really happens to AI agents that spend money. Press <span className="text-text">Run</span> and it is played
          through Aerar&apos;s real purchase pipeline on a fresh, isolated database with simulated providers, so no money moves. You see every
          step and the checks it graded itself on. For real payments on Base Sepolia, see{" "}
          <Link href="/demo" className="text-text underline-offset-2 hover:underline">
            last night&apos;s report
          </Link>
          .
        </p>
      </div>

      <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="Problems">
        {groups.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="rounded-full border border-line px-3 py-1 text-muted transition hover:border-lamp/50 hover:text-text">
            {g.title} <span className="text-faint">· {g.scenarios.length}</span>
          </a>
        ))}
      </nav>

      <Suspense fallback={null}>
        <PageLimit />
      </Suspense>

      <div className="mt-10 space-y-12">
        {groups.map((g, i) => (
          <section key={g.id} id={g.id} className="scroll-mt-20">
            <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight">
              <span className="num text-sm text-lamp">{String(i + 1).padStart(2, "0")}</span>
              {g.title}
            </h2>
            <div className="mt-4 space-y-4">
              {g.scenarios.map((s) => (
                <ScenarioCard key={s.id} s={s} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PublicShell>
  );
}

/** Counts page views per IP; shows a notice instead of blocking the static list. Runs are limited separately. */
async function PageLimit() {
  await connection(); // request-time only: the rate limiter reads the clock
  const rate = publicLimits().publicPages.check(clientIp(await headers()));
  if (rate.ok) return null;
  return (
    <p className="mt-6 rounded-xl border border-line bg-panel p-4 text-sm text-muted">
      You&apos;ve loaded this page a lot in the last minute. Runs may be refused for {rate.retryAfter} seconds.
    </p>
  );
}
