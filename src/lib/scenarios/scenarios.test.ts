// Every scenario in the catalogue, played through the real pipeline. Run alone with: npm run test:scenarios
import { describe, expect, it } from "vitest";
import { PROBLEMS, SCENARIOS } from ".";

for (const [problem, info] of Object.entries(PROBLEMS)) {
  const group = SCENARIOS.filter((s) => s.problem === problem);
  if (!group.length) continue;
  describe(`Problem: ${info.title}`, () => {
    for (const s of group) {
      it(`${s.title} -> ${s.expected.split(/[.:]/)[0]}`, async () => {
        const r = await s.run();
        expect(r.checks.failures, r.timeline.join("\n")).toEqual([]);
        expect(r.checks.passed.length).toBeGreaterThan(0);
      });
    }
  });
}

describe("plain wallet vs Aerar, per scenario", () => {
  it("Aerar never pays more than a wallet that pays every 402, and stops the attacks outright", async () => {
    const byId = Object.fromEntries(await Promise.all(SCENARIOS.map(async (s) => [s.id, await s.run()] as const)));
    for (const [id, r] of Object.entries(byId)) expect(r.aerarPaid, id).toBeLessThanOrEqual(r.plainWallet);
    expect(byId["injected-attacker-endpoint"]).toMatchObject({ plainWallet: 90_000n, aerarPaid: 0n });
    expect(byId["parallel-race"]).toMatchObject({ plainWallet: 100_000n, aerarPaid: 10_000n });
    expect(byId["looping-agent"]).toMatchObject({ plainWallet: 120_000n, aerarPaid: 50_000n });
    expect(byId["approve-expensive"]).toMatchObject({ plainWallet: 80_000n, aerarPaid: 80_000n });
  }, 60_000);
});
