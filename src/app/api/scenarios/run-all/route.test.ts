import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/lib/scenarios";
import { POST as runAll } from "./route";

const req = (ip: string) => new NextRequest("https://aerar.test/api/scenarios/run-all", { method: "POST", headers: { "x-forwarded-for": ip } });

async function lines(res: Response) {
  const text = await res.text();
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

describe("run all scenarios (public)", () => {
  it("streams a start line, one result per scenario with money compared, and a final score", async () => {
    const res = await runAll(req("198.51.100.1"));
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const out = await lines(res);
    expect(out[0]).toEqual({ type: "start", total: SCENARIOS.length });
    const results = out.filter((l) => l.type === "result");
    expect(results).toHaveLength(SCENARIOS.length);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.find((r) => r.id === "injected-attacker-endpoint")).toMatchObject({ plainWalletFormatted: "$0.09", aerarPaidFormatted: "$0.00" });
    expect(out.at(-1)).toEqual({ type: "done", total: SCENARIOS.length, ok: SCENARIOS.length });
  }, 60_000);

  it("allows three full runs per IP per 10 minutes", async () => {
    for (let i = 0; i < 3; i++) await (await runAll(req("198.51.100.2"))).text();
    const blocked = await runAll(req("198.51.100.2"));
    expect(blocked.status).toBe(429);
  }, 120_000);
});
