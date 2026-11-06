// Screenshot the UI with the locally installed Chrome over the DevTools protocol. No extra dependencies
// (Node 22's built-in WebSocket and fetch). Saves full-page PNGs to docs/screenshots.
//
//   npm run screenshots -- --base http://localhost:3311              all shots, 375 and 1440 px, light and dark
//   npm run screenshots -- --base http://localhost:3311 --only demo  one shot by name
//   ... --y 0 --height 1200                                            only a section of the page
//
// Operator pages need a session: the script signs one with SESSION_SECRET from your local .env (never printed).
// Use it against a local instance; it does not log in to remote servers.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { issueSession, SESSION_COOKIE } from "@/lib/server/auth";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = flag("base") ?? "http://localhost:3311";
const ONLY = flag("only");
const OUT = flag("out") ?? "docs/screenshots";
/** Optional section: start at --y and capture at most --height CSS pixels (for close-up reviews). */
const CLIP_Y = Number(flag("y") ?? 0);
const CLIP_H = flag("height") ? Number(flag("height")) : undefined;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

type Action = { click?: string; waitText?: string; waitMs?: number };
interface Shot {
  name: string;
  path: string;
  operator?: boolean;
  actions?: Action[];
}

const SHOTS: Shot[] = [
  { name: "landing", path: "/" },
  { name: "scenarios", path: "/scenarios", actions: [{ click: "Run all" }, { waitText: "scenarios handled correctly", waitMs: 30000 }] },
  { name: "demo", path: "/demo" },
  { name: "report", path: "/report", operator: true },
  { name: "purchase-drawer", path: "/report?purchase=__FIRST__", operator: true },
  { name: "task", path: "/tasks/__TASK__", operator: true },
  { name: "audit", path: "/audit", operator: true, actions: [{ click: "Verify chain" }, { waitText: "Chain intact", waitMs: 10000 }] },
  { name: "login", path: "/login" },
];
const SIZES = [
  { w: 375, h: 812, mobile: true },
  { w: 1440, h: 900, mobile: false },
];
const THEMES = ["dark", "light"] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: { result?: unknown; error?: { message: string } }) => void>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg);
        this.pending.delete(msg.id);
      }
    });
  }
  static async connect(url: string) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new Cdp(ws);
  }
  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.id;
    const reply = await new Promise<{ result?: unknown; error?: { message: string } }>((res) => {
      this.pending.set(id, res);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
    if (reply.error) throw new Error(`${method}: ${reply.error.message}`);
    return reply.result as T;
  }
  close() {
    this.ws.close();
  }
}

async function evaluate<T>(c: Cdp, expression: string): Promise<T> {
  const r = await c.send<{ result: { value: T } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return r.result.value;
}

async function waitFor(c: Cdp, js: string, timeout: number) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate<boolean>(c, js).catch(() => false)) return true;
    await sleep(150);
  }
  return false;
}

async function shoot(shot: Shot, size: (typeof SIZES)[number], theme: (typeof THEMES)[number], resolved: string) {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const c = await Cdp.connect(target.webSocketDebuggerUrl);
  try {
    await c.send("Page.enable");
    await c.send("Runtime.enable");
    await c.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile });
    await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] });
    // A distinct client address per shot, so local per-IP limits don't refuse later shots.
    // (Only affects local runs: the production proxy replaces X-Forwarded-For.)
    await c.send("Network.enable");
    await c.send("Network.setExtraHTTPHeaders", { headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    if (shot.operator) {
      const url = new URL(BASE);
      await c.send("Network.setCookie", { name: SESSION_COOKIE, value: issueSession(), domain: url.hostname, path: "/", httpOnly: true });
    }
    await c.send("Page.navigate", { url: BASE + resolved });
    await waitFor(c, "document.readyState === 'complete'", 15000);
    // The saved theme wins over the system one; make sure none is saved.
    await evaluate(c, `localStorage.removeItem('aerar-theme'); document.documentElement.dataset.theme = '${theme}'; true`);
    await sleep(600);
    for (const a of shot.actions ?? []) {
      if (a.click) {
        const ok = await evaluate<boolean>(
          c,
          `(() => { const el = [...document.querySelectorAll('button, a')].find(e => e.textContent && e.textContent.trim().startsWith(${JSON.stringify(a.click)})); if (!el) return false; el.click(); return true; })()`,
        );
        if (!ok) console.warn(`  ! ${shot.name}: no button "${a.click}"`);
      }
      if (a.waitText) {
        const ok = await waitFor(c, `document.body.innerText.includes(${JSON.stringify(a.waitText)})`, a.waitMs ?? 10000);
        if (!ok) console.warn(`  ! ${shot.name}: "${a.waitText}" never appeared`);
      }
      await sleep(400);
    }
    const { cssContentSize } = await c.send<{ cssContentSize: { width: number; height: number } }>("Page.getLayoutMetrics");
    const overflowX = await evaluate<number>(c, "document.documentElement.scrollWidth - document.documentElement.clientWidth");
    if (overflowX > 0) {
      // Name the widest offenders so the fix is obvious.
      const culprits = await evaluate<string[]>(
        c,
        `[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).filter(e => ![...e.children].some(ch => ch.getBoundingClientRect().right > document.documentElement.clientWidth + 1)).slice(0, 4).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 3).join('.') : '') + ' "' + (e.textContent || '').trim().slice(0, 40) + '"')`,
      );
      console.warn(`  ! ${shot.name} ${size.w}px: horizontal overflow of ${overflowX}px: ${culprits.join(" | ")}`);
    }
    const y = Math.min(CLIP_Y, Math.max(0, Math.ceil(cssContentSize.height) - 1));
    const height = Math.min(Math.ceil(cssContentSize.height) - y, CLIP_H ?? 12000, 12000);
    const { data } = await c.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y, width: size.w, height, scale: 1 },
    });
    const file = path.join(OUT, `${shot.name}-${size.w}-${theme}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`  ✓ ${file}`);
  } finally {
    c.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
  }
}

/** Fill in ids the operator shots need (a purchase, a task) from the report page itself, over HTTP. */
async function resolveIds(): Promise<Record<string, string>> {
  const html = await fetch(`${BASE}/report?period=7d`, { headers: { cookie: `${SESSION_COOKIE}=${issueSession()}` } }).then((r) => r.text());
  const purchase = html.match(/[?&]purchase=(pur_[A-Za-z0-9_-]+)/)?.[1];
  const task = html.match(/\/tasks\/(tsk_[A-Za-z0-9_-]+)/)?.[1];
  return { __FIRST__: purchase ?? "none", __TASK__: task ?? "none" };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ids = await resolveIds().catch(() => ({ __FIRST__: "none", __TASK__: "none" }) as Record<string, string>);
  const profile = path.join(tmpdir(), `aerar-shots-${process.pid}`);
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) {
      if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok).catch(() => false)) break;
      await sleep(200);
    }
    for (const shot of SHOTS.filter((s) => !ONLY || s.name === ONLY)) {
      const resolved = shot.path.replace(/__FIRST__|__TASK__/g, (m) => ids[m]);
      console.log(`${shot.name} (${resolved})`);
      for (const size of SIZES) for (const theme of THEMES) await shoot(shot, size, theme, resolved);
    }
  } finally {
    chrome.kill();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
