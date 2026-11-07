import { describe, expect, it } from "vitest";
import { evaluatePolicy, hostAllowed, type PolicyInput } from "./engine";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYEE = "0x1111111111111111111111111111111111111111";

function base(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    now: new Date("2026-11-07T02:00:00Z"),
    task: { status: "active", budget: 1_000_000n, reserved: 0n, spent: 0n, deadline: null },
    policy: {
      version: 1,
      rules: {
        allowedProviders: ["data.example.com"],
        maxPerPurchase: "100000",
        approvalAbove: "50000",
        maxPurchasesPerHour: 20,
        reuseWindowSeconds: 3600,
        expiresAt: null,
      },
    },
    agent: { revoked: false, assignedToTask: true },
    host: "data.example.com",
    quote: { scheme: "exact", network: "eip155:84532", asset: USDC, amount: 10_000n, payTo: PAYEE },
    knownPayTo: null,
    agentPurchasesLastHour: 0,
    rails: { network: "eip155:84532", asset: USDC, scheme: "exact" },
    ...over,
  };
}

describe("evaluatePolicy", () => {
  it("approves a small, allowed purchase", () => {
    const r = evaluatePolicy(base());
    expect(r.decision).toBe("approve");
    expect(r.reasonCodes).toContain("WITHIN_TASK_BUDGET");
    expect(r.remainingAfter).toBe(990_000n);
  });

  it("declines a host that is not on the list", () => {
    const r = evaluatePolicy(base({ host: "evil.example.net" }));
    expect(r.decision).toBe("decline");
    expect(r.reasonCodes).toContain("PROVIDER_NOT_ALLOWED");
  });

  it("does not let a lookalike host match a wildcard", () => {
    expect(hostAllowed("api.example.com", ["*.example.com"])).toBe(true);
    expect(hostAllowed("example.com.evil.net", ["*.example.com"])).toBe(false);
    expect(hostAllowed("badexample.com", ["*.example.com"])).toBe(false);
  });

  it("declines when reserved + spent leaves too little budget", () => {
    const r = evaluatePolicy(base({ task: { status: "active", budget: 100_000n, reserved: 60_000n, spent: 35_000n, deadline: null } }));
    expect(r.decision).toBe("decline");
    expect(r.reasonCodes).toContain("OVER_TASK_BUDGET");
  });

  it("allows spending the budget down to exactly zero", () => {
    const r = evaluatePolicy(base({ task: { status: "active", budget: 10_000n, reserved: 0n, spent: 0n, deadline: null } }));
    expect(r.decision).toBe("approve");
    expect(r.remainingAfter).toBe(0n);
  });

  it("declines above the per-purchase limit even with budget left", () => {
    const r = evaluatePolicy(base({ quote: { ...base().quote, amount: 100_001n } }));
    expect(r.reasonCodes).toContain("OVER_PER_PURCHASE_LIMIT");
    expect(r.decision).toBe("decline");
  });

  it("asks a human above the approval threshold", () => {
    const r = evaluatePolicy(base({ quote: { ...base().quote, amount: 60_000n } }));
    expect(r.decision).toBe("needs_approval");
    expect(r.reasonCodes).toContain("ABOVE_APPROVAL_THRESHOLD");
  });

  it("declines wrong network, wrong asset, unknown scheme", () => {
    const r = evaluatePolicy(
      base({ quote: { scheme: "upto", network: "eip155:8453", asset: "0xdead000000000000000000000000000000000000", amount: 1n, payTo: PAYEE } }),
    );
    expect(r.reasonCodes).toEqual(expect.arrayContaining(["NETWORK_NOT_ALLOWED", "ASSET_NOT_ALLOWED", "SCHEME_NOT_SUPPORTED"]));
  });

  it("flags a provider whose payee changed", () => {
    const r = evaluatePolicy(base({ knownPayTo: "0x2222222222222222222222222222222222222222" }));
    expect(r.decision).toBe("decline");
    expect(r.reasonCodes).toContain("PAYEE_CHANGED");
  });

  it("accepts the same payee in different letter case", () => {
    expect(evaluatePolicy(base({ knownPayTo: PAYEE.toUpperCase().replace("0X", "0x") })).decision).toBe("approve");
  });

  it("declines revoked or unassigned agents, paused tasks, expired mandates, passed deadlines", () => {
    expect(evaluatePolicy(base({ agent: { revoked: true, assignedToTask: true } })).reasonCodes).toContain("AGENT_REVOKED");
    expect(evaluatePolicy(base({ agent: { revoked: false, assignedToTask: false } })).reasonCodes).toContain("AGENT_NOT_ASSIGNED");
    expect(evaluatePolicy(base({ task: { ...base().task, status: "paused" } })).reasonCodes).toContain("TASK_NOT_ACTIVE");
    const expired = base();
    expired.policy.rules.expiresAt = "2026-11-07T01:00:00Z";
    expect(evaluatePolicy(expired).reasonCodes).toContain("MANDATE_EXPIRED");
    expect(evaluatePolicy(base({ task: { ...base().task, deadline: new Date("2026-11-06T00:00:00Z") } })).reasonCodes).toContain(
      "TASK_DEADLINE_PASSED",
    );
  });

  it("rate-limits a looping agent even when every purchase is tiny", () => {
    const r = evaluatePolicy(base({ agentPurchasesLastHour: 20 }));
    expect(r.decision).toBe("decline");
    expect(r.reasonCodes).toContain("RATE_LIMITED");
  });

  it("declines zero and invalid payees", () => {
    expect(evaluatePolicy(base({ quote: { ...base().quote, amount: 0n } })).reasonCodes).toContain("INVALID_AMOUNT");
    expect(evaluatePolicy(base({ quote: { ...base().quote, payTo: "not-an-address" } })).reasonCodes).toContain("INVALID_PAYEE");
  });

  it("decline wins over needs-approval", () => {
    const r = evaluatePolicy(base({ host: "other.example.org", quote: { ...base().quote, amount: 60_000n } }));
    expect(r.decision).toBe("decline");
  });
});

describe("shopping list", () => {
  it("holds an item from an allowed provider that isn't on the list, even under every limit", async () => {
    const { onShoppingList } = await import("./engine");
    expect(onShoppingList("https://reports.acme.dev/market-report?topic=fx", ["reports.acme.dev/market-report"])).toBe(true);
    expect(onShoppingList("https://reports.acme.dev/full-dataset", ["reports.acme.dev/market-report"])).toBe(false);
    expect(onShoppingList("https://reports.acme.dev/market-report-v2", ["reports.acme.dev/market-report"])).toBe(false);
    expect(onShoppingList("https://reports.acme.dev/anything", [])).toBe(true);
    expect(onShoppingList("https://reports.acme.dev/reports/q3", ["reports.acme.dev/reports/"])).toBe(true);
  });
});
