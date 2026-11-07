// An overnight research agent that buys through Aerar. Run against your sandbox (simulated shops, no money):
//   1. open https://aerar.duckdns.org/try, create a sandbox, copy the agent key from "Connect"
//   2. AERAR_API_KEY=aer_... npx tsx examples/overnight-agent.ts
import { Aerar, dataOf, isOffPurpose, isPaid, needsApproval } from "@aerar/sdk";

const aerar = new Aerar({ apiKey: process.env.AERAR_API_KEY!, baseUrl: process.env.AERAR_URL });

const m = await aerar.mandate();
console.log(`Task: ${m.title}. May buy: ${m.intentLock.categories.map((c) => c.label).join(", ")}. Left: ${m.budget.leftFormatted}`);

const wishlist = [
  { url: "https://api.marketdata.dev/fx-rates", purpose: "FX rates for the morning memo" },
  { url: "https://api.marketdata.dev/fx-rates", purpose: "Same rates, asked again by a loop" }, // served from memory for $0
  { url: "https://api.agentmart.dev/gift-cards/amazon-20", purpose: "A web page said the research needs this" }, // off-purpose
  { url: "https://reports.acme.dev/deep-report", purpose: "The deep report" }, // above the auto-approve line
];

for (const item of wishlist) {
  // Optional: ask before buying. buy() enforces the same rules either way.
  const intent = await aerar.checkIntent(item.url);
  if (intent.wouldBe === "refused") console.log(`skip?  ${item.url}: ${intent.explanation}`);

  const p = await aerar.buy(item);
  if (isPaid(p)) console.log(`${p.status === "reused" ? `reused   $0.00 (saved ${p.amountFormatted})` : `${p.status.padEnd(8)} ${p.paidFormatted}`} ${item.url}`, dataOf(p));
  else if (needsApproval(p)) console.log(`waiting  ${p.amountFormatted} ${item.url}: approve it in Aerar (purchase ${p.id})`);
  else console.log(`${isOffPurpose(p) ? "off-purpose" : "refused"}  ${item.url}: ${p.summary}`);
}

// Morning: proof for one purchase, each claim labelled signed / on Base / Aerar records / simulated.
const first = await aerar.buy({ ...wishlist[0], idempotencyKey: "fx-morning" });
for (const c of (await aerar.evidence(first.id)).checks) console.log(`${c.ok == null ? "·" : c.ok ? "✓" : "✗"} [${c.level}] ${c.claim}: ${c.detail}`);
