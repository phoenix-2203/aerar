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
