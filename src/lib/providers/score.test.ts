import { describe, expect, it } from "vitest";
import { scoreProviders } from "./score";

const r = (host: string, status: string, reasonCodes: string[] = []) => ({ host, status, reasonCodes }) as never;

describe("provider reliability", () => {
  it("scores from the ledger and weighs a swapped payee heavily", () => {
    const s = scoreProviders([
      ...Array.from({ length: 9 }, () => r("good.dev", "delivered")),
      r("good.dev", "payment_failed", ["PAYMENT_NOT_SETTLED"]),
      r("shady.io", "delivered"),
      r("shady.io", "delivered"),
      r("shady.io", "declined", ["PAYEE_CHANGED"]),
      r("new.dev", "delivered"),
    ]);
    const get = (h: string) => s.find((x) => x.host === h)!;
    expect(get("good.dev")).toMatchObject({ score: 90, label: "reliable" });
    expect(get("shady.io").score).toBe(40);
    expect(get("shady.io").label).toBe("risky");
    expect(get("new.dev")).toMatchObject({ score: null, label: "new" });
  });

  it("doesn't blame the provider when the owner's Vault refused", () => {
    const s = scoreProviders([r("a.dev", "delivered"), r("a.dev", "delivered"), r("a.dev", "payment_failed", ["VAULT_REFUSED"])]);
    expect(s[0].score).toBe(100);
  });
});
