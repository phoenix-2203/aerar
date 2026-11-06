import { describe, expect, it } from "vitest";
import { purchaseSteps, type StepState } from "./steps";

const states = (p: Parameters<typeof purchaseSteps>[0]) => purchaseSteps(p).map((s) => `${s.id}:${s.state}`);
const all = (s: StepState) => (ids: string[]) => ids.map((id) => `${id}:${s}`);

describe("purchase steps", () => {
  it("a paid, verified purchase passes every step", () => {
    expect(states({ status: "delivered", reasonCodes: ["TASK_ACTIVE", "PROVIDER_ALLOWED"], txHash: "0xabc", onchainVerifiedAt: new Date() })).toEqual(
      all("passed")(["access", "memory", "quote", "policy", "reserve", "pay", "onchain"]),
    );
  });

  it("a disallowed provider fails at access and nothing after it runs", () => {
    const s = purchaseSteps({ status: "declined", reasonCodes: ["PROVIDER_NOT_ALLOWED"] });
    expect(s[0]).toMatchObject({ id: "access", state: "failed" });
    expect(s[0].detail).toMatch(/never contacted/);
    expect(s.slice(1).every((x) => x.state === "skipped")).toBe(true);
  });

  it("a reused purchase stops at memory for $0", () => {
    expect(states({ status: "reused", reasonCodes: ["REUSED_EARLIER_PURCHASE"], reusedFromId: "pur_1" })).toEqual([
      "access:passed",
      "memory:passed",
      ...all("skipped")(["quote", "policy", "reserve", "pay", "onchain"]),
    ]);
  });

  it("an expensive purchase is held at the rules step, then passes once approved", () => {
    expect(states({ status: "awaiting_approval", reasonCodes: ["ABOVE_APPROVAL_THRESHOLD"] }).slice(3, 5)).toEqual(["policy:held", "reserve:skipped"]);
    const approved = purchaseSteps({ status: "delivered", reasonCodes: ["ABOVE_APPROVAL_THRESHOLD", "APPROVED_BY_HUMAN"], approvedBy: "operator", onchainVerifiedAt: new Date() });
    expect(approved[3]).toMatchObject({ state: "passed" });
    expect(approved[3].detail).toMatch(/approved by operator/);
  });

  it("over a limit fails at the rules step", () => {
    expect(states({ status: "declined", reasonCodes: ["TASK_ACTIVE", "OVER_PER_PURCHASE_LIMIT"] })[3]).toBe("policy:failed");
  });

  it("a changed quote fails at pay; an unknown outcome is pending; a bad transfer fails the proof", () => {
    expect(states({ status: "payment_failed", reasonCodes: ["QUOTE_CHANGED"] })[5]).toBe("pay:failed");
    expect(states({ status: "unknown", reasonCodes: [] })[5]).toBe("pay:pending");
    expect(states({ status: "delivered", reasonCodes: [], onchainCheck: { ok: false, reason: "wrong amount" } })[6]).toBe("onchain:failed");
  });
});
