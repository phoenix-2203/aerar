// Records each demo scene from the real app (local production build of the same commit as aerar.duckdns.org) and
// the title cards. Output: rec/out/<scene>.webm plus rec/out/marks.json (seconds from video start where each scene's
// usable footage begins). Run: node demo/video/rec/record.js [scene ...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3311';
const OUT = path.join(__dirname, 'out');
const CARDS = 'file://' + path.join(__dirname, '..', 'cards');
const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'live', 'receipt-pur_4xCRpofq8Vqj.json'), 'utf8'));
const STATE = path.join(OUT, 'sandbox-state.json');
fs.mkdirSync(OUT, { recursive: true });
const marks = fs.existsSync(path.join(OUT, 'marks.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'marks.json'), 'utf8')) : {};

// A visible cursor with a click ripple, since recorded video has no mouse pointer.
const CURSOR = () => {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9 19z" fill="#18201c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)', transition: 'none' });
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '.__rip{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #2b55d6;z-index:2147483646;pointer-events:none;animation:__r .55s ease-out forwards}@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';
    document.documentElement.appendChild(st);
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

let mouse = { x: 960, y: 560 };
async function moveTo(page, loc, opts = {}) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  const x = b.x + b.width * (opts.fx ?? 0.5), y = b.y + b.height * (opts.fy ?? 0.5);
  await page.mouse.move(x, y, { steps: opts.steps ?? 22 });
  mouse = { x, y };
}
async function click(page, loc, opts = {}) {
  await moveTo(page, loc, opts);
  await page.waitForTimeout(opts.pause ?? 180);
  await page.mouse.down(); await page.mouse.up();
}
async function smoothScrollTo(page, loc, offset = 120, ms = 900) {
  const target = await loc.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await page.evaluate(([t, ms]) => new Promise((res) => {
    const s = window.scrollY, d = t - s, t0 = performance.now();
    const step = (n) => { const k = Math.min(1, (n - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; window.scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), [target, ms]);
}

async function record(name, fn, { storage = null, saveStorage = false } = {}) {
  const b = await chromium.launch();
  const dir = path.join(OUT, 'tmp-' + name);
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir, size: { width: 1920, height: 1080 } }, ...(storage ? { storageState: storage } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem('aerar-theme', 'light'); } catch (e) {} });
  await ctx.addInitScript(CURSOR);
  // Lay pages out at 1440px and show them 1.33x larger, so text is readable at 1080p.
  await ctx.addInitScript(() => { const z = () => { document.documentElement.style.zoom = '1.3333'; }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', z); else z(); });
  // Replay of real data recorded from the live site (see README in demo/video): the receipt, the published signer and
  // Base Sepolia's own answer for that transaction. The local server is a different deployment with a different key.
  await ctx.route('**/api/receipts/sample', (r) => r.fulfill({ json: { id: LIVE.id } }));
  await ctx.route(`**/api/receipts/${LIVE.id}`, (r) => r.fulfill({ json: LIVE.receipt }));
  await ctx.route('**/api/receipts/signer', (r) => r.fulfill({ json: { signer: LIVE.signer, scheme: 'EIP-191 personal_sign over the receipt\'s SHA-256' } }));
  await ctx.route('https://sepolia.base.org/**', (r) => r.fulfill({ json: LIVE.rpc }));
  const page = await ctx.newPage();
  const t0 = Date.now();
  const mark = { start: 0 };
  page.mark = (k) => { mark[k] = (Date.now() - t0) / 1000; };
  page.boxes = {};
  await fn(page, ctx);
  if (saveStorage) await ctx.storageState({ path: STATE });
  const video = page.video();
  await ctx.close(); await b.close();
  fs.renameSync(await video.path(), path.join(OUT, name + '.webm'));
  fs.rmSync(dir, { recursive: true, force: true });
  marks[name] = { ...mark, boxes: page.boxes };
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  console.log('recorded', name, mark);
}

const hideCounters = (page) => page.addStyleTag({ content: '[aria-label="Live numbers"], section .glass.rounded-lg { }' });

const CARD = (name, file, secs) => record(name, async (p) => { await p.goto(`${CARDS}/${file}`); p.mark('start'); await p.waitForTimeout(secs * 1000); });
// Remember where an element is (1920x1080 frame coordinates) so the assembler can punch in on it.
async function box(p, key, loc) {
  const b = await loc.boundingBox().catch(() => null);
  if (b) p.boxes[key] = { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
}

const SCENES = {
  // Title cards (v2)
  c_freysa: () => CARD('c_freysa', 'freysa.html', 21),
  c_aixbt: () => CARD('c_aixbt', 'aixbt.html', 12),
  c_bridge: () => CARD('c_bridge', 'bridge.html', 6.5),
  c_questions: () => CARD('c_questions', 'questions.html', 7),
  c_flow: () => CARD('c_flow', 'flow.html', 13),
  c_forge: () => CARD('c_forge', 'forge.html', 6),
  c_compare: () => CARD('c_compare', 'compare.html', 10),
  c_tests: () => CARD('c_tests', 'tests.html', 6),
  c_end: () => CARD('c_end', 'end.html', 11),

  // 02a: the landing page (live counters hidden: local numbers aren't the live site's)
  async s02a_landing() {
    await record('s02a_landing', async (p) => {
      await p.goto(BASE + '/', { waitUntil: 'networkidle' });
      // The live counters show this local copy's numbers, not the live site's, so they're hidden for the video.
      await p.addStyleTag({ content: 'div.mt-7.flex-wrap.font-mono{display:none!important}' });
      await p.mouse.move(900, 980);
      await p.waitForTimeout(900); p.mark('start');
      await p.waitForTimeout(2500);
      await moveTo(p, p.getByRole('link', { name: /Try it, no wallet/ }).first(), { steps: 40 });
      await p.waitForTimeout(5200);
    });
  },

  // 03: create a sandbox; the signed mandate
  async s03_mandate() {
    await record('s03_mandate', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      await p.waitForTimeout(700); p.mark('start');
      await p.waitForTimeout(600);
      await click(p, p.getByRole('button', { name: /Create my sandbox/ }));
      await p.waitForSelector('text=Signed mandate', { timeout: 30000 });
      await p.waitForTimeout(800);
      await smoothScrollTo(p, p.locator('section[aria-labelledby="mandate"]'), 90, 900);
      await moveTo(p, p.locator('section[aria-labelledby="mandate"] span.rounded-full').nth(1), { steps: 30 });
      await p.waitForTimeout(2600);
      await moveTo(p, p.locator('#try-purpose-mandate'), { steps: 25 });
      await p.waitForTimeout(1600);
      await moveTo(p, p.locator('section[aria-labelledby="mandate"] p.font-mono').first(), { steps: 25 });
      await p.waitForTimeout(3400);
    }, { saveStorage: true });
  },

  // 04: IntentLock in the attack lab, run through the real pipeline
  async s04_intentlock() {
    await record('s04_intentlock', async (p) => {
      await p.goto(BASE + '/scenarios', { waitUntil: 'networkidle' });
      const card = p.locator('text=Within budget, but not what the money was for').first();
      await smoothScrollTo(p, card, 140, 10);
      await p.waitForTimeout(600); p.mark('start');
      await p.waitForTimeout(2500);
      const run = p.getByRole('button', { name: 'Run it through the real pipeline' }).first();
      await click(p, run);
      await p.waitForSelector('text=Plain wallet', { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1200);
      await smoothScrollTo(p, card, 110, 900);
      const refused = p.locator('text=Declined: the item doesn').first();
      await moveTo(p, refused, { fx: 0.2, steps: 30 }).catch(() => {});
      p.mark('refused'); await box(p, 'refused', refused);
      await p.waitForTimeout(5200);
      const paid = p.locator('text=Paid $1.50').first();
      await moveTo(p, paid, { fx: 0.2, steps: 25 }).catch(() => {});
      await p.waitForTimeout(6000);
    });
  },

  // 07 (v2): sandbox: paid, reused, attacker never contacted. Clicks timed to the narration.
  async s05_sandbox() {
    await record('s05_sandbox', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const ask = p.locator('section[aria-labelledby="ask"]');
      await smoothScrollTo(p, ask, 80, 10);
      await p.mouse.move(760, 520);
      await p.waitForTimeout(500); p.mark('start');
      const t0 = Date.now(); const at = (x) => p.waitForTimeout(Math.max(0, x * 1000 - (Date.now() - t0)));
      const presets = ask.locator('ol li button');
      await click(p, presets.nth(0), { fx: 0.3 });
      await at(2.9); await click(p, presets.nth(1), { fx: 0.3 });
      await at(8.0); await click(p, presets.nth(2), { fx: 0.3 });
      await at(12.8);
    }, { storage: STATE });
  },

  // 08 (v2): price memory (5x price waits) and a payee swap (refused)
  async s08_guards() {
    await record('s08_guards', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const ask = p.locator('section[aria-labelledby="ask"]');
      await smoothScrollTo(p, ask, 80, 10);
      await p.mouse.move(760, 520);
      await p.waitForTimeout(500); p.mark('start');
      const t0 = Date.now(); const at = (x) => p.waitForTimeout(Math.max(0, x * 1000 - (Date.now() - t0)));
      const presets = ask.locator('ol li button');
      await at(0.6); await click(p, presets.nth(8), { fx: 0.3 });
      await at(5.4); await click(p, presets.nth(9), { fx: 0.3 });
      await at(11.6);
    }, { storage: STATE });
  },

  // 09 (v2): approval in place, then a shop that takes the money and sends nothing
  async s06_outcomes() {
    await record('s06_outcomes', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const ask = p.locator('section[aria-labelledby="ask"]');
      await smoothScrollTo(p, ask, 80, 10);
      await p.mouse.move(760, 520);
      await p.waitForTimeout(500); p.mark('start');
      await click(p, ask.locator('ol li button').nth(5), { fx: 0.3 });
      await p.waitForTimeout(900);
      const card = p.locator('section[aria-label="Needs your approval"] article').filter({ hasText: 'deep report' }).first();
      await smoothScrollTo(p, card, 260, 600);
      await click(p, card.getByRole('button', { name: /Approve/ }), { steps: 14 });
      await p.waitForTimeout(900);
      await smoothScrollTo(p, ask, 80, 500);
      await click(p, ask.locator('ol li button').nth(7), { fx: 0.3, steps: 14 });
      await p.waitForTimeout(1900);
      const sec = p.locator('section[aria-labelledby="security"]');
      await smoothScrollTo(p, sec, 90, 900);
      await moveTo(p, sec.locator('text=is on hold').first(), { steps: 24 });
      await p.waitForTimeout(3600);
    }, { storage: STATE });
  },

  // 10 (v2): evidence, then the live receipt (replayed), then try to cheat
  async s07_proof() {
    await record('s07_proof', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const act = p.locator('#activity');
      await smoothScrollTo(p, act, 80, 10);
      await p.waitForTimeout(500); p.mark('start');
      const row = act.locator('ul > li').filter({ hasText: 'Paid' }).first();
      await click(p, row.locator('button').first(), { fx: 0.4, steps: 14 });
      await p.waitForTimeout(500);
      await click(p, row.getByRole('button', { name: /Evidence/ }), { steps: 14 });
      await p.waitForSelector('text=What can be checked', { timeout: 15000 });
      await p.waitForTimeout(500);
      await p.locator('dialog[open] .overflow-y-auto').evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
      await p.waitForTimeout(2200);
      await p.keyboard.press('Escape');
      await p.goto(BASE + '/verify', { waitUntil: 'networkidle' });
      p.mark('verify');
      await p.waitForTimeout(200);
      await click(p, p.getByRole('button', { name: /Load a real receipt/ }), { steps: 16 });
      await p.waitForTimeout(3400);
      await click(p, p.getByRole('button', { name: /Try to cheat/ }), { steps: 16 });
      p.mark('cheat');
      await p.waitForTimeout(300);
      const target = p.getByLabel('Edit paid amount');
      await smoothScrollTo(p, target, 330, 500);
      await click(p, target, { steps: 14 });
      await target.press('End'); for (let i = 0; i < 4; i++) await target.press('Backspace');
      await target.type('0.05', { delay: 90 });
      await smoothScrollTo(p, p.getByText('Nobody changed it').first(), 200, 600);
      p.mark('invalid');
      await box(p, 'invalid', p.getByText('NOT VALID').first());
      await p.waitForTimeout(3000);
    }, { storage: STATE });
  },

  // 08: the Vault page, then "Aerar gets hacked" on the landing page
  async s08_vault() {
    await record('s08_vault', async (p) => {
      await p.goto(BASE + '/vault', { waitUntil: 'networkidle' });
      await p.waitForTimeout(800); p.mark('start');
      await moveTo(p, p.getByText('How the vault works').first(), { steps: 30 });
      await p.waitForTimeout(1200);
      await moveTo(p, p.getByText('It checks every payment').first(), { steps: 25 });
      await p.waitForTimeout(2600);
      p.mark('hacked');
      await p.goto(BASE + '/#one-purchase', { waitUntil: 'networkidle' });
      await p.addStyleTag({ content: 'html{scroll-behavior:auto}' });
      await smoothScrollTo(p, p.locator('#one-purchase'), 70, 10);
      await p.waitForTimeout(500);
      await click(p, p.getByText('Aerar gets hacked', { exact: true }).first());
      await p.waitForTimeout(5200);
    });
  },

  // 09: the whole attack lab, run against the real pipeline
  async s09_runall() {
    await record('s09_runall', async (p) => {
      await p.goto(BASE + '/scenarios', { waitUntil: 'networkidle' });
      await p.waitForTimeout(600); p.mark('start');
      await click(p, p.getByRole('button', { name: /Run all/ }));
      await p.waitForFunction(() => /36\/36/.test(document.body.innerText), null, { timeout: 60000 });
      await p.waitForTimeout(2600);
    });
  },

  // 10b: the SDK on the builders page
  async s10b_sdk() {
    await record('s10b_sdk', async (p) => {
      await p.goto(BASE + '/builders', { waitUntil: 'networkidle' });
      await smoothScrollTo(p, p.locator('#quick'), 90, 10);
      await p.waitForTimeout(600); p.mark('start');
      await moveTo(p, p.getByRole('tab', { name: 'SDK' }), { steps: 25 });
      await p.waitForTimeout(2200);
      await click(p, p.getByRole('tab', { name: 'Claude / ChatGPT' }));
      await p.waitForTimeout(2200);
      await click(p, p.getByRole('tab', { name: 'SDK' }));
      await p.waitForTimeout(1500);
    });
  },
};

(async () => {
  const want = process.argv.slice(2);
  for (const [k, fn] of Object.entries(SCENES)) if (!want.length || want.includes(k)) await fn();
})();
