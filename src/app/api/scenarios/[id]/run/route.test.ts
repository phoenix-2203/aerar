import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as run } from "./route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string, ip: string) =>
  new NextRequest(`https://aerar.test/api/scenarios/${id}/run`, { method: "POST", headers: { "x-forwarded-for": ip } });

describe("public scenario runs", () => {
  it("runs a scenario without login and returns its timeline and checks", async () => {
    const res = await run(req("injected-attacker-endpoint", "203.0.113.1"), params("injected-attacker-endpoint"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.timeline.join(" ")).toMatch(/Declined/);
    expect(body.checks.passed).toContain("the attacker's server is never contacted");
    expect(body.checks.failed).toEqual([]);
    expect(body).toMatchObject({ plainWalletFormatted: "$0.09", aerarPaidFormatted: "$0.00" });
  });

  it("404s for an unknown scenario", async () => {
    const res = await run(req("nope", "203.0.113.2"), params("nope"));
    expect(res.status).toBe(404);
  });

  it("rate-limits one IP after 20 runs in 10 minutes, without affecting others", async () => {
    const id = "lookalike-host";
    for (let i = 0; i < 20; i++) expect((await run(req(id, "203.0.113.3"), params(id))).status).toBe(200);
    const blocked = await run(req(id, "203.0.113.3"), params(id));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await run(req(id, "203.0.113.4"), params(id))).status).toBe(200);
  }, 60_000);
});
