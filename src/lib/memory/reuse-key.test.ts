import { describe, expect, it } from "vitest";
import { reuseKey } from "./reuse-key";

describe("reuseKey", () => {
  it("treats reordered query params, host case, default port and fragments as the same request", () => {
    const a = reuseKey("get", "https://API.example.com:443/fx?base=USD&symbols=NGN#x");
    const b = reuseKey("GET", "https://api.example.com/fx?symbols=NGN&base=USD");
    expect(a).toBe(b);
  });
  it("treats different params as different purchases", () => {
    expect(reuseKey("GET", "https://a.com/fx?base=USD")).not.toBe(reuseKey("GET", "https://a.com/fx?base=EUR"));
  });
  it("canonicalises JSON bodies but keeps content differences", () => {
    expect(reuseKey("POST", "https://a.com/q", '{"b":1,"a":2}')).toBe(reuseKey("POST", "https://a.com/q", '{ "a": 2, "b": 1 }'));
    expect(reuseKey("POST", "https://a.com/q", '{"a":1}')).not.toBe(reuseKey("POST", "https://a.com/q", '{"a":2}'));
  });
  it("separates methods", () => {
    expect(reuseKey("GET", "https://a.com/q")).not.toBe(reuseKey("POST", "https://a.com/q"));
  });
});
