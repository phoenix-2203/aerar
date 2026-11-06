// "How Aerar solves it" demo: one realistic night of agent purchases, then a side-by-side of what a plain
// agent wallet (pays every 402) would have spent versus Aerar, and the morning report Aerar writes.
// Real pipeline, in-memory database, simulated providers; no money moves.
//
//   npm run night-shift            paced for a screen recording
//   npm run night-shift -- --fast  no pauses
import { runNight, type NightEvent } from "@/lib/scenarios/night";

const fast = process.argv.includes("--fast");
const color = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint("1"), dim = paint("2"), green = paint("32"), red = paint("31"), yellow = paint("33"), cyan = paint("36"), brass = paint("38;5;179");
const sleep = (ms: number) => (fast ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
const usd = (a: bigint) => `$${(Number(a) / 1e6).toFixed(2)}`;
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.replace(/\x1b\[[0-9;]*m/g, "").length));

function outcome(e: NightEvent) {
  const s = e.outcome.length > 92 ? e.outcome.slice(0, 89) + "…" : e.outcome;
  if (e.status === "delivered" || e.status === "reused") return green(s);
  if (e.status === "awaiting_approval") return yellow(s);
  return red(s);
}

async function main() {
  console.log();
  console.log(brass("  ◠ ") + bold("Aerar · one night shift"));
  console.log(dim("  Two agents work overnight on one task: $1.00 budget, pay automatically up to $0.05, ask a person up to $0.10,"));
  console.log(dim("  only data.example.com allowed, at most 6 purchases per agent per hour."));
  await sleep(2500);

  const r = await runNight();

  console.log();
  console.log(cyan(bold("  Overnight")));
  for (const e of r.events) {
    console.log(`  ${dim(e.time)}  ${pad(e.agent, 10)} ${dim("asks:")} ${e.says} ${dim(`(${usd(e.price)})`)}`);
    await sleep(500);
    console.log(`  ${" ".repeat(18)}${brass("→")} ${outcome(e)}`);
    await sleep(700);
  }
  if (r.approval) {
    console.log();
    console.log(`  ${dim(r.approval.time)}  ${pad("operator", 10)} ${green(r.approval.outcome)}`);
    await sleep(1500);
  }

  const p = r.plainWallet, a = r.aerar;
  const rows: [string, bigint, bigint][] = [
    ["Paid in total", p.paid, a.paid],
    ["Sent to attackers", p.toAttackers, a.toAttackers],
    ["Paid twice for the same data", p.duplicates, a.duplicates],
    ["Over the limit, because the agent insisted", p.overLimit, a.overLimit],
    ["Burned by a looping agent", p.loop, a.loop],
  ];
  console.log();
  console.log(cyan(bold("  The same night, two ways")));
  console.log(dim(`  ${pad("", 46)}${pad("Plain agent wallet", 22)}With Aerar`));
  for (const [label, plain, aerar] of rows) {
    console.log(`  ${pad(label, 46)}${pad(red(usd(plain)), 22)}${(aerar === 0n ? green : yellow)(usd(aerar))}`);
    await sleep(600);
  }
  console.log(`  ${pad("Payments made", 46)}${pad(String(p.payments), 22)}${a.payments}`);
  console.log(`  ${pad("Each payment checked onchain", 46)}${pad(red("no"), 22)}${green("yes")}`);
  console.log(`  ${pad("Record you can audit", 46)}${pad(red("wallet history only"), 22)}${green("hash-chained ledger")}`);
  console.log();
  console.log(bold(`  Aerar kept ${usd(p.wasted - a.wasted)} of ${usd(p.wasted)} in waste from leaving the wallet.`) + dim(` (${usd(a.wasted)} slipped through under the hourly cap.)`));
  await sleep(2000);

  console.log();
  console.log(cyan(bold("  08:00 · Morning report")));
  for (const line of r.headline) {
    console.log("  " + line);
    await sleep(900);
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
