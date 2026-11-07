import { describe, expect, it } from "vitest";
import { forecast, forecastLine } from "./burn";

const now = new Date("2026-11-08T01:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const fmt = (n: bigint) => `$${(Number(n) / 1e6).toFixed(2)}`;

describe("burn forecast", () => {
  it("projects when the budget runs out from the recent rate", () => {
    // $0.30 paid over the last hour, $1.00 budget, $0.40 used: $0.60 left at $0.30/h = 2 hours.
    const b = forecast({ budget: 1_000_000n, spent: 400_000n, reserved: 0n }, [{ at: ago(60), amount: 100_000n }, { at: ago(30), amount: 100_000n }, { at: ago(1), amount: 100_000n }], now);
    expect(b.perHour).toBe(300_000n);
    expect(b.runsOutAt?.toISOString()).toBe("2026-11-08T03:00:00.000Z");
    expect(b.usedPct).toBe(40);
    expect(forecastLine(b, fmt, now)).toBe("At $0.30/hour it runs out around 03:00 UTC.");
  });
  it("says nothing when nothing is being spent", () => {
    expect(forecast({ budget: 1_000_000n, spent: 0n, reserved: 0n }, [{ at: ago(300), amount: 5n }], now).runsOutAt).toBeNull();
  });
});
