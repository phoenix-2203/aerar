// Public (no login): play every scenario in turn and stream one JSON line per result (NDJSON), so the page can
// show progress as each finishes. Same isolated sandbox as single runs; its own per-IP limit (3 per 10 minutes).
import type { NextRequest } from "next/server";
import { SCENARIOS } from "@/lib/scenarios";
import { scenarioRunView } from "@/lib/scenarios/view";
import { json, withErrors } from "@/lib/server/http";
import { clientIp, publicLimits } from "@/lib/server/rate-limit";

export const POST = withErrors(async (req: NextRequest) => {
  const limits = publicLimits();
  const rate = limits.runAll.check(clientIp(req.headers));
  if (!rate.ok)
    return json(
      { error: "RATE_LIMITED", message: `You've run the full lab a few times already. Try again in ${Math.ceil(rate.retryAfter / 60)} min, or run single scenarios.` },
      { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
    );

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const out = await limits.scenarioGate.run(async () => {
        send({ type: "start", total: SCENARIOS.length });
        let stopped = 0;
        for (const s of SCENARIOS) {
          if (req.signal.aborted) return;
          const t0 = Date.now();
          try {
            const view = scenarioRunView(s, await s.run(), Date.now() - t0);
            if (view.ok) stopped++;
            send({ type: "result", ...view });
          } catch {
            send({ type: "error", id: s.id, message: "This scenario couldn't run. Try it on its own." });
          }
        }
        send({ type: "done", total: SCENARIOS.length, ok: stopped });
      });
      if (!out.ok) send({ type: "busy", message: "Other visitors are running scenarios right now. Try again in a few seconds." });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
