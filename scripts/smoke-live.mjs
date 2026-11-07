#!/usr/bin/env node
// Smoke test against a running Aerar: every public page, the demo shop, receipts (checked here, not trusted), the
// Morning Seal, MCP auth, and all attack-lab scenarios through the real pipeline. Read-only except the scenarios, which
// run in a throwaway sandbox.
// Usage:  node scripts/smoke-live.mjs [https://aerar.duckdns.org]
import { createHash } from "node:crypto";
import { recoverMessageAddress } from "viem";

const BASE = (process.argv[2] || "https://aerar.duckdns.org").replace(/\/$/, "");
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "  ok " : "FAIL "} ${name}${detail ? `  (${detail})` : ""}`);
};
const get = (p, init) => fetch(BASE + p, { redirect: "manual", signal: AbortSignal.timeout(60_000), ...init });

const canon = (v) =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v);

console.log(`Smoke test: ${BASE}\n`);

for (const p of ["/", "/try", "/vault", "/scenarios", "/demo", "/verify", "/builders", "/built"]) {
  const r = await get(p).catch((e) => ({ status: 0, e }));
  ok(`page ${p}`, r.status === 200, String(r.status));
}

const shop = await get("/api/demo/report?topic=smoke");
ok("demo shop asks for payment (x402)", shop.status === 402, String(shop.status));

const signer = await (await get("/api/receipts/signer")).json().catch(() => ({}));
ok("receipt key published", /^0x[0-9a-fA-F]{40}$/.test(signer.signer ?? ""));

const sample = await (await get("/api/receipts/sample")).json().catch(() => ({}));
if (sample.id) {
  const { receipt } = await (await get(`/api/receipts/${sample.id}`)).json();
  const hash = `0x${createHash("sha256").update(canon(receipt.body)).digest("hex")}`;
  ok("sample receipt: hash matches", hash === receipt.sha256);
  const rec = await recoverMessageAddress({ message: { raw: receipt.sha256 }, signature: receipt.signature });
  ok("sample receipt: signed by Aerar's key", rec.toLowerCase() === (signer.signer ?? "").toLowerCase());
  const tampered = { ...receipt.body, purchase: { ...receipt.body.purchase, paid: { ...receipt.body.purchase.paid, amount: "1" } } };
  ok("tampered receipt is caught", `0x${createHash("sha256").update(canon(tampered)).digest("hex")}` !== receipt.sha256);
} else ok("a paid demo purchase exists for a sample receipt", false, "run one purchase in the live report");

const seal = await (await get("/api/seal/status")).json().catch(() => ({}));
ok("Morning Seal status answers", seal && "seal" in seal, seal?.seal ? `entry #${seal.seal.seq}, chain ok: ${seal.seal.chainOk}` : "not sealed yet");

const mcp = await get("/api/mcp/k/aer_not_a_real_key", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
ok("MCP refuses a bad key", mcp.status === 401, String(mcp.status));

const cron = await get("/api/cron/seal");
ok("seal cron refuses without its secret", cron.status === 401, String(cron.status));

const all = await get("/api/scenarios/run-all", { method: "POST" }).catch(() => null);
if (all && all.ok) {
  // One JSON line per scenario, streamed as each one runs.
  const results = (await all.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.type === "result");
  const handled = results.filter((r) => r.ok).length;
  for (const r of results.filter((x) => !x.ok)) console.log(`      scenario ${r.id}: ${(r.checks?.failed ?? []).join("; ")}`);
  ok("attack lab: every scenario handled", results.length > 0 && handled === results.length, `${handled}/${results.length}`);
} else ok("attack lab runs", false, all ? String(all.status) : "no answer");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
