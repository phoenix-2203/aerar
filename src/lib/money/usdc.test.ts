import { describe, expect, it } from "vitest";
import { formatUsdc, parseUsdc } from "./usdc";

describe("usdc", () => {
  it("parses and formats without float error", () => {
    expect(parseUsdc("0.1") + parseUsdc("0.2")).toBe(parseUsdc("0.3"));
    expect(parseUsdc("1.25")).toBe(1_250_000n);
    expect(formatUsdc(1_250_000n)).toBe("1.25");
    expect(formatUsdc(5_000n)).toBe("0.005");
    expect(formatUsdc(0n)).toBe("0.00");
  });
  it("rejects junk", () => {
    for (const bad of ["-1", "1e3", "0.1234567", "", "abc", "1,000"]) expect(() => parseUsdc(bad)).toThrow();
  });
});
