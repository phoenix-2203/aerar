import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blockingReasons, explain, REASONS, sentence, STATUS } from "./reasons";

describe("reason copy", () => {
  it("has a plain sentence for every reason code the engine and pipeline can produce", () => {
    const src = readFileSync("src/lib/policy/engine.ts", "utf8") + readFileSync("src/lib/purchase/pipeline.ts", "utf8");
    // Codes that end up on a purchase: pushed onto decline/approval lists or written into reasonCodes.
    const produced = new Set([...src.matchAll(/\["([A-Z_]+)",/g), ...src.matchAll(/reasonCodes: \[[^\]]*"([A-Z_]+)"/g), ...src.matchAll(/passes\.push\("([A-Z_]+)"\)/g), ...src.matchAll(/, "([A-Z_]+)", "/g)].map((m) => m[1]));
    for (const code of ["REUSED_EARLIER_PURCHASE", "NO_PAYMENT_REQUESTED", "PROVIDER_UNREACHABLE", "NO_USABLE_QUOTE", "APPROVED_BY_HUMAN", "QUOTE_CHANGED", "PAYMENT_NOT_SETTLED"]) produced.add(code);
    const missing = [...produced].filter((c) => !REASONS[c]);
    expect(missing).toEqual([]);
  });

  it("reads as plain words", () => {
    expect(sentence("PROVIDER_NOT_ALLOWED")).toBe("The provider isn't on the task's allowed list.");
    expect(explain("SOMETHING_NEW")).toBe("something new");
    expect(blockingReasons(["TASK_ACTIVE", "RATE_LIMITED", "ABOVE_APPROVAL_THRESHOLD"])).toEqual(["RATE_LIMITED"]);
  });

  it("uses one verb per outcome", () => {
    expect(STATUS.delivered.label).toBe("Paid");
    expect(STATUS.reused.label).toBe("Reused");
    expect(STATUS.awaiting_approval.label).toBe("Needs approval");
    expect(STATUS.declined.label).toBe("Declined");
    expect(STATUS.rejected.label).toBe("Declined");
  });
});
