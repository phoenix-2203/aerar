// Renders the title cards frame by frame (not screen-recorded): every CSS animation is paused and stepped to the exact
// frame time, each frame is a lossless 1920x1080 screenshot, and ffmpeg encodes them at high quality. This removes the
// flicker and banding that real-time WebM recording put into the dark cards.
// Run: node demo/video/rec/cards.js [name ...]   Output: rec/out/<name>.mp4 (+ marks.json start = 0)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const CARDS = 'file://' + path.join(__dirname, '..', 'cards');
const FPS = 30;
const LIST = {
  c_grok: ['grok.html', 17.5], c_openai: ['openai.html', 13.5], c_bridge: ['bridge.html', 6],
  c_questions: ['questions.html', 7.5], c_flow: ['flow.html', 13], c_forge: ['forge.html', 6],
  c_compare: ['compare.html', 9.5], c_tests: ['tests.html', 6], c_end: ['end.html', 10.5],
};

(async () => {
  const want = process.argv.slice(2);
  const marksPath = path.join(OUT, 'marks.json');
  const marks = fs.existsSync(marksPath) ? JSON.parse(fs.readFileSync(marksPath, 'utf8')) : {};
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  for (const [name, [file, secs]] of Object.entries(LIST)) {
    if (want.length && !want.includes(name)) continue;
    await page.goto(`${CARDS}/${file}`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(OUT, name + '.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round(secs * FPS);
    for (let i = 0; i < n; i++) {
      await page.evaluate((ms) => {
        for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
        if (window.__tick) window.__tick();
      }, (i * 1000) / FPS);
      const png = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    marks[name] = { start: 0 };
    fs.writeFileSync(marksPath, JSON.stringify(marks, null, 2));
    console.log('rendered', name, n, 'frames');
  }
  await b.close();
})();
