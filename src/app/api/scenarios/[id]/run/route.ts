// Public (no login): run one catalogue scenario in its own isolated in-memory stage and return what happened.
// Simulated providers only; nothing touches the real database or wallet. Rate-limited per IP, and at most
// two runs execute at once so visitors can't overload the server.
import type { NextRequest } from "next/server";
import { SCENARIOS } from "@/lib/scenarios";
import { json, withErrors } from "@/lib/server/http";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";

export const POST = withErrors(async (req: NextRequest, ctx: RouteContext<"/api/scenarios/[id]/run">) => {
  const { id } = await ctx.params;
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) return json({ error: "NOT_FOUND", message: "No such scenario" }, 404);

  const limits = publicLimits();
  const rate = limits.scenarioRuns.check(clientIp(req.headers));
  if (!rate.ok)
    return json(
      { error: "RATE_LIMITED", message: `You've run a lot of scenarios. Try again in ${rate.retryAfter} seconds.` },
      { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
    );

  const started = Date.now();
  const out = await limits.scenarioGate.run(() => scenario.run());
  if (!out.ok)
    return json({ error: "BUSY", message: "Other visitors are running scenarios right now. Try again in a few seconds." }, { status: 503, headers: { "retry-after": "3" } });

  const r = out.value;
  return json({
    id: scenario.id,
    timeline: r.timeline,
    verdict: r.verdict,
    checks: { passed: r.checks.passed, failed: r.checks.failures },
    ok: r.checks.failures.length === 0,
    payments: r.payments,
    ms: Date.now() - started,
    remainingRuns: rate.remaining,
  });
});
