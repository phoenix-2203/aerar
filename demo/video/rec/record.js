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
  await fn(page, ctx);
  if (saveStorage) await ctx.storageState({ path: STATE });
  const video = page.video();
  await ctx.close(); await b.close();
  fs.renameSync(await video.path(), path.join(OUT, name + '.webm'));
  fs.rmSync(dir, { recursive: true, force: true });
  marks[name] = mark;
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  console.log('recorded', name, mark);
}

const hideCounters = (page) => page.addStyleTag({ content: '[aria-label="Live numbers"], section .glass.rounded-lg { }' });

const SCENES = {
  // Title cards
  async s01_hook() { await record('s01_hook', async (p) => { await p.goto(`${CARDS}/hook.html`); p.mark('start'); await p.waitForTimeout(17500); }); },
  async s02b_questions() { await record('s02b_questions', async (p) => { await p.goto(`${CARDS}/questions.html`); p.mark('start'); await p.waitForTimeout(9000); }); },
  async s08c_forge() { await record('s08c_forge', async (p) => { await p.goto(`${CARDS}/forge.html`); p.mark('start'); await p.waitForTimeout(6500); }); },
  async s09b_tests() { await record('s09b_tests', async (p) => { await p.goto(`${CARDS}/tests.html`); p.mark('start'); await p.waitForTimeout(7000); }); },
  async s10a_compare() { await record('s10a_compare', async (p) => { await p.goto(`${CARDS}/compare.html`); p.mark('start'); await p.waitForTimeout(9000); }); },
  async s10c_end() { await record('s10c_end', async (p) => { await p.goto(`${CARDS}/end.html`); p.mark('start'); await p.waitForTimeout(13000); }); },

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
      await p.waitForTimeout(5200);
      const paid = p.locator('text=Paid $1.50').first();
      await moveTo(p, paid, { fx: 0.2, steps: 25 }).catch(() => {});
      await p.waitForTimeout(6000);
    });
  },

  // 05: sandbox: paid, reused, attacker never contacted
  async s05_sandbox() {
    await record('s05_sandbox', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const ask = p.locator('section[aria-labelledby="ask"]');
      await smoothScrollTo(p, ask, 80, 10);
      await p.waitForTimeout(500); p.mark('start');
      const presets = ask.locator('ol li button');
      for (const [i, wait] of [[0, 3600], [1, 3600], [2, 3600]]) {
        await smoothScrollTo(p, ask, 80, 500);
        await click(p, presets.nth(i), { fx: 0.3 });
        await p.waitForTimeout(wait);
      }
      await p.waitForTimeout(800);
    }, { storage: STATE });
  },

  // 06: approval in place, then a shop that takes the money and sends nothing
  async s06_outcomes() {
    await record('s06_outcomes', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const ask = p.locator('section[aria-labelledby="ask"]');
      await smoothScrollTo(p, ask, 80, 10);
      await p.waitForTimeout(500); p.mark('start');
      await click(p, ask.locator('ol li button').nth(5), { fx: 0.3 });
      await p.waitForTimeout(1500);
      const card = p.locator('section[aria-label="Needs your approval"] article').filter({ hasText: 'deep report' }).first();
      await smoothScrollTo(p, card, 260, 700);
      await p.waitForTimeout(500);
      await click(p, card.getByRole('button', { name: /Approve/ }));
      await p.waitForTimeout(2600);
      await smoothScrollTo(p, ask, 80, 700);
      await click(p, ask.locator('ol li button').nth(7), { fx: 0.3 });
      await p.waitForTimeout(2600);
      const sec = p.locator('section[aria-labelledby="security"]');
      await smoothScrollTo(p, sec, 90, 1100);
      await moveTo(p, sec.locator('text=is on hold').first(), { steps: 30 });
      await p.waitForTimeout(4200);
    }, { storage: STATE });
  },

  // 07: evidence, then the live receipt (replayed), then try to cheat
  async s07_proof() {
    await record('s07_proof', async (p) => {
      await p.goto(BASE + '/try', { waitUntil: 'networkidle' });
      const act = p.locator('#activity');
      await smoothScrollTo(p, act, 80, 10);
      await p.waitForTimeout(500); p.mark('start');
      const row = act.locator('ul > li').filter({ hasText: 'Paid' }).first();
      await click(p, row.locator('button').first(), { fx: 0.4 });
      await p.waitForTimeout(700);
      await click(p, row.getByRole('button', { name: /Evidence/ }));
      await p.waitForSelector('text=What can be checked', { timeout: 15000 });
      await p.waitForTimeout(600);
      await p.locator('dialog[open] .overflow-y-auto').evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
      await p.waitForTimeout(3000);
      await p.keyboard.press('Escape');
      p.mark('verify');
      await p.goto(BASE + '/verify', { waitUntil: 'networkidle' });
      await p.waitForTimeout(400);
      await click(p, p.getByRole('button', { name: /Load a real receipt/ }));
      await p.waitForTimeout(4800);
      await click(p, p.getByRole('button', { name: /Try to cheat/ }));
      await p.waitForTimeout(600);
      const target = p.getByLabel('Edit paid amount');
      await smoothScrollTo(p, target, 330, 600);
      await click(p, target);
      await target.press('End'); for (let i = 0; i < 4; i++) await target.press('Backspace');
      await target.type('0.05', { delay: 110 });
      await smoothScrollTo(p, p.getByText('Nobody changed it').first(), 200, 700);
      await p.waitForTimeout(3600);
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
