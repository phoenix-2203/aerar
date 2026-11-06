// What the public API returns for one scenario run (JSON-safe: amounts formatted and as atomic strings).
import { fmt$ } from "@/lib/money/usdc";
import type { Scenario, ScenarioResult } from "./stage";

export interface ScenarioRunView {
  id: string;
  ok: boolean;
  timeline: string[];
  verdict: string;
  checks: { passed: string[]; failed: string[] };
  plainWallet: string;
  aerarPaid: string;
  /** Formatted, e.g. "$0.90". */
  plainWalletFormatted: string;
  aerarPaidFormatted: string;
  ms: number;
}

export function scenarioRunView(s: Scenario, r: ScenarioResult, ms: number): ScenarioRunView {
  return {
    id: s.id,
    ok: r.checks.failures.length === 0,
    timeline: r.timeline,
    verdict: r.verdict,
    checks: { passed: r.checks.passed, failed: r.checks.failures },
    plainWallet: r.plainWallet.toString(),
    aerarPaid: r.aerarPaid.toString(),
    plainWalletFormatted: fmt$(r.plainWallet),
    aerarPaidFormatted: fmt$(r.aerarPaid),
    ms,
  };
}
