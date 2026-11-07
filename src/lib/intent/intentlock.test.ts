import { describe, expect, it } from "vitest";
import { categoriesForPurpose, classify, evaluateIntent, quoteDescription } from "./intentlock";

describe("IntentLock classifier", () => {
  it("reads categories from URL words, not substrings", () => {
    expect(classify("api.marketdata.dev /fx-rates").categories).toContain("market_data");
    expect(classify("/blocklist").categories).not.toContain("blockchain_analytics");
    expect(classify("/eth/transactions?address=0xabc").categories).toEqual(["blockchain_analytics"]);
  });

  it("derives a task's categories from its purpose, but never sensitive ones", () => {
    expect(categoriesForPurpose("Research Ethereum transaction analytics")).toEqual(expect.arrayContaining(["blockchain_analytics", "research_reports"]));
    expect(categoriesForPurpose("Buy gift cards for the team")).toEqual([]);
  });

  it("reads the provider's description from x402 v2 and v1 shapes", () => {
    expect(quoteDescription({ resource: { description: "Daily FX rates" } })).toBe("Daily FX rates");
    expect(quoteDescription({ accepts: [{ description: "Weather forecast" }] })).toBe("Weather forecast");
    expect(quoteDescription({ accepts: [] })).toBeNull();
  });
});

describe("evaluateIntent", () => {
  const eth = ["blockchain_analytics"];

  it("matches an item that serves the task", () => {
    const r = evaluateIntent({ taskCategories: eth, url: "https://api.chainscope.dev/eth/transactions" });
    expect(r.outcome).toBe("match");
    expect(r.code).toBe("INTENT_MATCH");
  });

  it("refuses an off-purpose item, with the reason in plain words", () => {
    const r = evaluateIntent({ taskCategories: eth, url: "https://bazaar.dev/gift-cards/amazon-50" });
    expect(r.outcome).toBe("mismatch");
    expect(r.explanation).toMatch(/Gift cards/);
    expect(r.explanation).toMatch(/Blockchain analytics/);
  });

  it("a sensitive category vetoes a match the provider tries to add with its description", () => {
    const r = evaluateIntent({ taskCategories: ["research_reports"], url: "https://bazaar.dev/gift-cards", providerDescription: "Gift card market report" });
    expect(r.outcome).toBe("mismatch");
  });

  it("can't place an item -> uncertain, never a silent pass", () => {
    const r = evaluateIntent({ taskCategories: eth, url: "https://bazaar.dev/item/7731" });
    expect(r.outcome).toBe("uncertain");
  });

  it("the provider's description can place an item its URL doesn't", () => {
    const r = evaluateIntent({ taskCategories: eth, url: "https://bazaar.dev/item/7731", providerDescription: "Ethereum mempool snapshot" });
    expect(r.outcome).toBe("match");
    expect(r.described).toBe("provider");
  });

  it("is off when the mandate names no categories (older tasks)", () => {
    expect(evaluateIntent({ taskCategories: [], url: "https://bazaar.dev/gift-cards" }).outcome).toBe("off");
  });
});
