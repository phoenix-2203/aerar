import { describe, expect, it } from "vitest";
import { tasks } from "@/db/schema";
import { world } from ".";
import { assertSandboxUrl, leaseSandbox } from "./sandbox";

describe("scenario sandbox", () => {
  it("refuses any URL that could be the real database", () => {
    expect(() => assertSandboxUrl("postgres://u@h/aerar", undefined)).toThrow(/sandbox/);
    expect(() => assertSandboxUrl("postgres://u@h/aerar_sandbox", "postgres://u@h/aerar_sandbox")).toThrow(/must not be DATABASE_URL/);
    expect(() => assertSandboxUrl("not a url", undefined)).toThrow(/valid URL/);
    expect(() => assertSandboxUrl("postgres://u@h/aerar_sandbox", "postgres://u@h/aerar")).not.toThrow();
  });

  it("wipes the sandbox for every lease and serves leases one at a time", async () => {
    const a = await leaseSandbox();
    await world({ db: a.db });
    expect(await a.db.select().from(tasks)).toHaveLength(1);
    let secondStarted = false;
    const next = leaseSandbox().then((l) => ((secondStarted = true), l));
    await new Promise((r) => setTimeout(r, 50));
    expect(secondStarted).toBe(false); // still waiting for the first lease
    a.release();
    const b = await next;
    expect(await b.db.select().from(tasks)).toHaveLength(0); // wiped
    b.release();
  });
});
