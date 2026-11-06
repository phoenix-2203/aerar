// Route-level tests: call the real App Router handlers with the fake payment rail.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTestContext } from "@/lib/server/context";
import { createAgent, createOrg } from "@/lib/workspace";
import { fakeRail, world } from "@/test/helpers";
import { POST as buy } from "./v1/purchases/route";
import { GET as getPurchase } from "./v1/purchases/[id]/route";
import { POST as login } from "./auth/login/route";
import { POST as logout } from "./auth/logout/route";
import { GET as listTasks } from "./tasks/route";
import { GET as getTask } from "./tasks/[id]/route";
import { POST as approve } from "./purchases/[id]/approve/route";
import { POST as reject } from "./purchases/[id]/reject/route";
import { GET as auditList } from "./audit/route";
import { GET as auditVerify } from "./audit/verify/route";
import { POST as revoke } from "./agents/[id]/revoke/route";

const BASE = "https://aerar.test";
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

function request(path: string, init: { method?: string; body?: unknown; key?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

async function setup(offers: Parameters<typeof fakeRail>[0] = { "/fx": { amount: 10_000n }, "/big": { amount: 60_000n } }) {
  const w = await world();
  const rail = fakeRail(offers);
  setTestContext({ db: w.db, rail });
  return { ...w, rail };
}

async function operatorCookie() {
  const res = await login(request("/api/auth/login", { body: { password: "correct horse battery" } }));
  expect(res.status).toBe(200);
  const set = res.headers.get("set-cookie")!;
  expect(set).toMatch(/HttpOnly/i);
  expect(set).toMatch(/SameSite=Strict/i);
  return set.split(";")[0];
}

beforeEach(() => {
  process.env.OPERATOR_PASSWORD = "correct horse battery";
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
  process.env.AERAR_ORG_ID = "org_test";
});
afterEach(() => setTestContext(null));

describe("agent API", () => {
  it("buys, returns strings for money and a plain summary, and serves the data", async () => {
    const w = await setup();
    const res = await buy(
      request("/api/v1/purchases", {
        key: w.apiKey,
        body: { taskId: w.task.id, url: "https://data.example.com/fx?base=USD", purpose: "rates", idempotencyKey: "a1" },
      }),
    );
    expect(res.status).toBe(200);
    const { purchase } = await res.json();
    expect(purchase.status).toBe("delivered");
    expect(purchase.paidAmount).toBe("10000");
    expect(purchase.paidFormatted).toBe("$0.01");
    expect(purchase.summary).toMatch(/^Delivered\. Paid \$0\.01/);
    expect(purchase.responseBody).toContain("data.example.com");
    expect(purchase.quoteRaw).toBeUndefined();

    const again = await getPurchase(request(`/api/v1/purchases/${purchase.id}`, { key: w.apiKey }), params({ id: purchase.id }));
    expect((await again.json()).purchase.id).toBe(purchase.id);
  });

  it("returns 202 for purchases waiting on a person", async () => {
    const w = await setup();
    const res = await buy(
      request("/api/v1/purchases", { key: w.apiKey, body: { taskId: w.task.id, url: "https://data.example.com/big", purpose: "x", idempotencyKey: "b1" } }),
    );
    expect(res.status).toBe(202);
    const { purchase } = await res.json();
    expect(purchase.summary).toMatch(/^Needs approval: .* a person decides/);
  });

  it("rejects missing, wrong and revoked keys with 401", async () => {
    const w = await setup();
    const body = { taskId: w.task.id, url: "https://data.example.com/fx", purpose: "x", idempotencyKey: "c1" };
    expect((await buy(request("/api/v1/purchases", { body }))).status).toBe(401);
    expect((await buy(request("/api/v1/purchases", { body, key: "aer_nope" }))).status).toBe(401);
    const cookie = await operatorCookie();
    expect((await revoke(request(`/api/agents/${w.agent.id}/revoke`, { method: "POST", cookie }), params({ id: w.agent.id }))).status).toBe(200);
    expect((await buy(request("/api/v1/purchases", { body, key: w.apiKey }))).status).toBe(401);
    expect(w.rail.calls.pay).toHaveLength(0);
  });

  it("validates input with zod and reports bad JSON", async () => {
    const w = await setup();
    const bad = await buy(request("/api/v1/purchases", { key: w.apiKey, body: { taskId: w.task.id, url: "https://data.example.com/fx", purpose: "", idempotencyKey: "has space" } }));
    expect(bad.status).toBe(400);
    const j = await bad.json();
    expect(j.error).toBe("INVALID_REQUEST");
    expect(j.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(["purpose", "idempotencyKey"]));
    const notJson = await buy(request("/api/v1/purchases", { key: w.apiKey, body: "{nope" }));
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error).toBe("INVALID_JSON");
  });

  it("maps PurchaseError to its status (409 idempotency conflict, 404 unknown task)", async () => {
    const w = await setup();
    const ok = { taskId: w.task.id, url: "https://data.example.com/fx", purpose: "x", idempotencyKey: "d1" };
    await buy(request("/api/v1/purchases", { key: w.apiKey, body: ok }));
    const conflict = await buy(request("/api/v1/purchases", { key: w.apiKey, body: { ...ok, url: "https://data.example.com/big" } }));
    expect(conflict.status).toBe(409);
    const missing = await buy(request("/api/v1/purchases", { key: w.apiKey, body: { ...ok, taskId: "tsk_nope", idempotencyKey: "d2" } }));
    expect(missing.status).toBe(404);
  });

  it("can't read another organisation's purchase", async () => {
    const w = await setup();
    const res = await buy(request("/api/v1/purchases", { key: w.apiKey, body: { taskId: w.task.id, url: "https://data.example.com/fx", purpose: "x", idempotencyKey: "e1" } }));
    const { purchase } = await res.json();
    const other = await createOrg(w.db, "Other", "org_other");
    const { apiKey: otherKey } = await createAgent(w.db, other.id, "intruder");
    const r = await getPurchase(request(`/api/v1/purchases/${purchase.id}`, { key: otherKey }), params({ id: purchase.id }));
    expect(r.status).toBe(404);
  });
});

describe("operator API", () => {
  it("requires a session and rejects a bad password", async () => {
    await setup();
    expect((await listTasks(request("/api/tasks"))).status).toBe(401);
    expect((await listTasks(request("/api/tasks", { cookie: "aerar_session=operator.9999999999.forged" }))).status).toBe(401);
    expect((await login(request("/api/auth/login", { body: { password: "wrong" } }))).status).toBe(401);
  });

  it("lists tasks and shows one task with money, policy and purchases", async () => {
    const w = await setup();
    await buy(request("/api/v1/purchases", { key: w.apiKey, body: { taskId: w.task.id, url: "https://data.example.com/fx", purpose: "x", idempotencyKey: "f1" } }));
    const cookie = await operatorCookie();
    const list = await (await listTasks(request("/api/tasks", { cookie }))).json();
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].money.spent).toBe("10000");
    const detail = await (await getTask(request(`/api/tasks/${w.task.id}`, { cookie }), params({ id: w.task.id }))).json();
    expect(detail.money.formatted.remaining).toBe("$0.99");
    expect(detail.policy.version).toBe(1);
    expect(detail.purchases).toHaveLength(1);
    expect(detail.purchases[0].responseBody).toBeUndefined();
  });

  it("approves and rejects", async () => {
    const w = await setup();
    const mk = async (k: string) =>
      (await (await buy(request("/api/v1/purchases", { key: w.apiKey, body: { taskId: w.task.id, url: `https://data.example.com/big?k=${k}`, purpose: "x", idempotencyKey: k } }))).json()).purchase;
    w.rail.offers["/big"] = { amount: 60_000n };
    const a = await mk("g1");
    const b = await mk("g2");
    const cookie = await operatorCookie();
    const ok = await (await approve(request(`/api/purchases/${a.id}/approve`, { method: "POST", cookie }), params({ id: a.id }))).json();
    expect(ok.purchase.status).toBe("delivered");
    expect(ok.purchase.approvedBy).toBe("operator");
    const no = await (await reject(request(`/api/purchases/${b.id}/reject`, { body: { note: "not needed" }, cookie }), params({ id: b.id }))).json();
    expect(no.purchase.status).toBe("rejected");
    const twice = await approve(request(`/api/purchases/${a.id}/approve`, { method: "POST", cookie }), params({ id: a.id }));
    expect(twice.status).toBe(409);
  });

  it("lists and verifies the audit chain", async () => {
    const w = await setup();
    await buy(request("/api/v1/purchases", { key: w.apiKey, body: { taskId: w.task.id, url: "https://data.example.com/fx", purpose: "x", idempotencyKey: "h1" } }));
    const cookie = await operatorCookie();
    const list = await (await auditList(request("/api/audit?limit=5", { cookie }))).json();
    expect(list.events.length).toBeGreaterThan(0);
    expect(list.events[0].seq).toBeGreaterThan(list.events[list.events.length - 1].seq);
    const v = await (await auditVerify(request("/api/audit/verify", { cookie }))).json();
    expect(v).toMatchObject({ ok: true, brokenAt: null });
  });

  it("logout clears the cookie", async () => {
    const res = await logout();
    expect(res.headers.get("set-cookie")).toMatch(/aerar_session=;.*Max-Age=0/i);
  });
});
