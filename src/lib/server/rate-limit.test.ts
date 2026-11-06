import { describe, expect, it } from "vitest";
import { clientIp, createGate, createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks with a retry time, then allows again", () => {
    let t = 0;
    const rl = createRateLimiter({ max: 3, windowMs: 60_000 }, () => t);
    expect([rl.check("a").ok, rl.check("a").ok, rl.check("a").ok]).toEqual([true, true, true]);
    const blocked = rl.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(60);
    t = 30_000;
    expect(rl.check("a").retryAfter).toBe(30);
    t = 60_001;
    expect(rl.check("a").ok).toBe(true);
  });

  it("counts each IP separately", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 }, () => 0);
    expect(rl.check("1.1.1.1").ok).toBe(true);
    expect(rl.check("1.1.1.1").ok).toBe(false);
    expect(rl.check("2.2.2.2").ok).toBe(true);
  });

  it("stays bounded under a flood of distinct IPs", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 }, () => 0);
    for (let i = 0; i < 12_000; i++) rl.check(`ip-${i}`);
    expect(rl.check("fresh").ok).toBe(true);
  });
});

describe("client IP", () => {
  it("uses the entry our proxy appended, not one the client made up", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("concurrency gate", () => {
  it("runs at most N jobs at once and frees the slot after errors", async () => {
    const gate = createGate(1);
    let release!: () => void;
    const slow = gate.run(() => new Promise<string>((r) => (release = () => r("done"))));
    expect(await gate.run(async () => "second")).toEqual({ ok: false });
    release();
    expect(await slow).toEqual({ ok: true, value: "done" });
    await expect(gate.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(gate.running).toBe(0);
  });
});
