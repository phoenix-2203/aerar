import { describe, expect, it } from "vitest";
import { reveal } from "./reveal";
import { evaluateIntent } from "./intentlock";

const morse = (s: string) => {
  const M: Record<string, string> = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", r: "-.-.", t: "-", n: "-.", o: "---", s: "..." };
  M.r = ".-."; M.c = "-.-.";
  return s.split(" ").map((w) => [...w].map((c) => M[c]).join(" ")).join(" / ");
};

describe("reveal", () => {
  it("decodes Morse, base64, hex and percent-encoding into readable text", () => {
    expect(reveal(morse("gift card")).texts.join(" ")).toContain("gift card");
    expect(reveal(Buffer.from("amazon gift card").toString("base64")).disguises).toContain("base64");
    expect(reveal(Buffer.from("gift cards").toString("hex")).texts.join(" ")).toContain("gift cards");
    expect(reveal("/%67%69%66%74-cards").texts.join(" ")).toContain("gift-cards");
  });

  it("undoes look-alike letters, leetspeak and spaced letters", () => {
    expect(reveal("gіft card").disguises).toContain("look-alike letters"); // Cyrillic і
    expect(reveal("g1ft-c4rd").texts.join(" ")).toContain("gift-card");
    expect(reveal("g-i-f-t c-a-r-d").texts.join(" ")).toContain("gift card");
  });

  it("leaves ordinary URLs, numbers, addresses and hashes alone", () => {
    for (const s of ["api marketdata /fx-rates", "/competitors?week=45", "/eth/transactions?address=0x4d2cc52A7D80d1276aa5dd2a6e5b2b4e9e931b2c", "/item/7731", "/reports/2026-11-07", "/v1/web3/l2"])
      expect(reveal(s).disguises.filter((d) => d !== "leetspeak")).toEqual([]);
  });
});

describe("IntentLock sees through disguises", () => {
  const eth = ["blockchain_analytics", "research_reports"];
  const shop = "https://api.agentmart.dev";

  it("refuses a gift card written in Morse code (the Grok x Bankrbot trick)", () => {
    const r = evaluateIntent({ taskCategories: eth, url: `${shop}/item/7731`, providerDescription: morse("gift card") });
    expect(r.outcome).toBe("mismatch");
    expect(r.disguises).toContain("morse");
    expect(r.explanation).toMatch(/disguised \(morse\)/);
  });

  it("refuses leetspeak, look-alike letters, base64 and encoded paths", () => {
    for (const url of [`${shop}/g1ft-c4rds/amazon`, `${shop}/gіft-cards/amazon`, `${shop}/%67%69%66%74-%63%61%72%64`, `${shop}/item/${Buffer.from("amazon gift card").toString("base64url")}`])
      expect(evaluateIntent({ taskCategories: eth, url }).outcome, url).toBe("mismatch");
  });

  it("an on-purpose item with hidden extra words waits for a person instead of passing", () => {
    const r = evaluateIntent({ taskCategories: eth, url: `${shop}/reports/weekly`, providerDescription: morse("bet now") + " " + Buffer.from("ethereum transactions").toString("base64") });
    expect(r.outcome).toBe("uncertain");
  });

  it("holds an item whose address and shop description disagree", () => {
    const r = evaluateIntent({ taskCategories: eth, url: "https://api.chainscope.dev/eth/transactions", providerDescription: "Weather forecast for Lagos" });
    expect(r.outcome).toBe("uncertain");
    expect(r.explanation).toMatch(/address says/);
  });

  it("ordinary on-purpose items still pass", () => {
    expect(evaluateIntent({ taskCategories: eth, url: "https://api.chainscope.dev/eth/transactions?address=0xabc" }).outcome).toBe("match");
    expect(evaluateIntent({ taskCategories: ["market_data"], url: "https://api.marketdata.dev/fx-rates", providerDescription: "Today's FX rates" }).outcome).toBe("match");
  });
});
