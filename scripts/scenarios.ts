// Narrated scenario runner for demos: tells each real-world story, plays it through the real purchase
// pipeline (in-memory database, simulated x402 providers; no money moves) and shows what Aerar did.
//
//   npm run scenarios                         all 25, paced for a screen recording
//   npm run scenarios -- --fast               no pauses
//   npm run scenarios -- --problem duplicate  one problem (injection|duplicate|mismatch|evidence|oversight|runaway)
//   npm run scenarios -- --only parallel-race one scenario by id
//   npm run scenarios -- --list               list scenario ids
import { PROBLEMS, SCENARIOS, type ProblemId } from "@/lib/scenarios";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};
const fast = args.includes("--fast");
const pace = fast ? 0 : Number(flag("pace") ?? 450);

const color = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint("1"), dim = paint("2"), green = paint("32"), red = paint("31"), yellow = paint("33"), cyan = paint("36"), brass = paint("38;5;179");
const sleep = (ms: number) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function wrap(text: string, width = 88, indent = "   ") {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > width) {
      out.push(indent + line.trim());
      line = word;
    } else line += " " + word;
  }
  if (line.trim()) out.push(indent + line.trim());
  return out.join("\n");
}

function tone(line: string) {
  if (/^(Paid|Reused|Returned)/.test(line)) return green(line);
  if (/^(Declined|Rejected|Not paid)/.test(line)) return red(line);
  if (/^(Held|Needs approval|unknown)/.test(line)) return yellow(line);
  if (/BROKEN|FAILED|BAD/.test(line)) return red(line);
  return line;
}

async function main() {
  if (args.includes("--list")) {
    for (const s of SCENARIOS) console.log(`${s.id.padEnd(30)} ${dim(s.problem.padEnd(10))} ${s.title}`);
    return;
  }
  const only = flag("only");
  const problem = flag("problem") as ProblemId | undefined;
  const picked = SCENARIOS.filter((s) => (!only || s.id === only) && (!problem || s.problem === problem));
  if (!picked.length) {
    console.error("No scenario matches. Try --list.");
    process.exit(1);
  }

  console.log();
  console.log(brass("  ◠ ") + bold("Aerar") + dim("  ·  the night-shift ledger for agents that spend money"));
  console.log(dim(`  ${picked.length} real-world scenario${picked.length === 1 ? "" : "s"}, each played through the real purchase pipeline. Simulated providers; no money moves.`));

  let passed = 0;
  let checks = 0;
  let lastProblem = "";
  for (const s of picked) {
    if (s.problem !== lastProblem) {
      lastProblem = s.problem;
      console.log();
      console.log(cyan(bold(`━━ Problem: ${PROBLEMS[s.problem].title} `)) + cyan("━".repeat(Math.max(3, 70 - PROBLEMS[s.problem].title.length))));
    }
    console.log();
    console.log(bold(` ▸ ${s.title}`));
    console.log(dim(wrap(s.story)));
    await sleep(pace * 2);
    const r = await s.run();
    for (const line of r.timeline) {
      console.log(`   ${dim("│")} ${tone(line)}`);
      await sleep(pace);
    }
    console.log(`   ${brass("Aerar:")} ${r.verdict}`);
    const ok = r.checks.failures.length === 0;
    checks += r.checks.passed.length;
    if (ok) passed++;
    console.log(
      "   " +
        r.checks.passed.map((c) => green("✓ ") + dim(c)).join(dim("  ")) +
        (ok ? "" : "  " + r.checks.failures.map((c) => red("✗ " + c)).join("  ")),
    );
    await sleep(pace * 2);
  }

  console.log();
  const allOk = passed === picked.length;
  console.log((allOk ? green : red)(bold(`  ${passed}/${picked.length} scenarios behaved as expected · ${checks} checks passed`)));
  console.log();
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
