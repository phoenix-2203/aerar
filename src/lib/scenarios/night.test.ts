// The before/after night used in the demo. Pins the numbers so the comparison can't silently drift.
import { describe, expect, it } from "vitest";
import { NIGHT, runNight } from "./night";

describe("one night: plain agent wallet vs Aerar", () => {
  it("a wallet that pays every 402 loses money to attackers, duplicates, persuasion and a loop; Aerar stops most of it", async () => {
    const r = await runNight();
    expect(r.events).toHaveLength(NIGHT.length);

    // Without Aerar: every request is paid.
    expect(r.plainWallet).toMatchObject({ paid: 2_050_000n, toAttackers: 910_000n, duplicates: 40_000n, overLimit: 900_000n, loop: 50_000n, wasted: 1_900_000n });

    // With Aerar: attackers, duplicates and over-limit asks cost nothing; the loop is cut at the hourly cap.
    expect(r.aerar).toMatchObject({ paid: 170_000n, saved: 40_000n, reused: 2, declined: 6, toAttackers: 0n, duplicates: 0n, overLimit: 0n, loop: 20_000n });
    expect(r.aerar.paid).toBeLessThanOrEqual(r.aerar.budget);
    expect(r.approval?.outcome).toMatch(/approved.*Paid \$0\.08/);
    expect(r.headline[0]).toMatch(/16 purchase requests.*paid \$0\.17 for 8 deliveries/);
  });
});
