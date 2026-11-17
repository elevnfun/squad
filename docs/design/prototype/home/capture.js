// Captures the home prototype through Playwright (software WebGL, still mode).
//   node capture.js beats [width height]   -> shots/beat-1-hero.png ... beat-7-end.png, hold-mid.png, hold-open.png,
//                                             blitz-step-1..4.png, draft-step-1..4.png
//   node capture.js one "<query>" out.png [width height]
//   node capture.js video                  -> shots/scroll.mp4 (1280x720, 30 fps)
// Needs the prototype folder served:  cd docs/design/prototype && python3 -m http.server 8772
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8772;
const BASE = `http://127.0.0.1:${PORT}/home/index.html`;
const SHOTS = path.join(__dirname, 'shots');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BEATS = [['1-hero', 0], ['2-full-time', 0.2], ['3-two', 0.4], ['4-blitz', 0.56], ['5-draft', 0.72], ['6-access', 0.88], ['7-end', 1]];

async function open(browser, query, w, h, opts = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...opts });
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [page]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 400)));
  await page.goto(`${BASE}?still=1&${query}`);
  await page.waitForFunction('window.__homeReady === true || window.__homeError', null, { timeout: 240000 });
  const err = await page.evaluate('window.__homeError || null');
  if (err) throw new Error(err);
  return page;
}

(async () => {
  const mode = process.argv[2] || 'beats';
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (mode === 'one') {
      const [, , , query, out, w = 1440, h = 900] = process.argv;
      const page = await open(browser, query, +w, +h, query.includes('reduced=1') ? { reducedMotion: 'reduce' } : {});
      await page.screenshot({ path: out });
      console.log(out);
    } else if (mode === 'beats') {
      const w = +(process.argv[3] || 1440), h = +(process.argv[4] || 900);
      const suffix = w === 1440 ? '' : `-${w}`;
      const only = process.argv[5];
      const page = await open(browser, 'p=0', w, h);
      const snap = async (name, p, hold = 0, opened = null) => {
        if (only && !name.includes(only)) return;
        await page.evaluate(([a, b, c]) => window.home.set(a, b, c), [p, hold, opened]);
        await page.screenshot({ path: path.join(SHOTS, `${name}${suffix}.png`) });
        console.log(`${name}${suffix}.png`);
      };
      for (const [name, p] of BEATS) await snap(`beat-${name}`, p);
      await snap('hold-mid', 0, 0.6);
      await snap('hold-open', 0, 1, 1);
      // the mode icons part of the way through: four frames each
      const span = await page.evaluate(() => window.home.ICON_SPAN);
      for (const half of ['blitz', 'draft']) {
        const [s, e] = span[half];
        const steps = half === 'blitz' ? [0.14, 0.36, 0.56, 0.8] : [0.12, 0.3, 0.46, 0.68];
        for (let i = 0; i < steps.length; i++) await snap(`${half}-step-${i + 1}`, s + (e - s) * steps[i]);
      }
    } else if (mode === 'video') {
      // The scrollbar from top to bottom with a short rest on each beat, then the hold.
      const fps = 30, w = 1280, h = 720;
      const dir = path.join(SHOTS, '_frames');
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const page = await open(browser, 'p=0', w, h);
      const frames = [];
      const ease = (t) => t * t * (3 - 2 * t);
      const marks = BEATS.map((b) => b[1]);
      // the hold first: ring fills over 0.9 s, the ball opens over 0.55 s, rests, closes in 0.35 s
      for (let i = 0; i < 12; i++) frames.push([0, 0, null]);
      for (let i = 1; i <= 27; i++) frames.push([0, i / 27, null]);
      for (let i = 1; i <= 16; i++) frames.push([0, 1, 0.1 + 0.9 * (i / 16)]);
      for (let i = 0; i < 24; i++) frames.push([0, 1, 1]);
      for (let i = 1; i <= 10; i++) frames.push([0, 1 - i / 10, 1 - i / 10]);
      for (let i = 0; i < 10; i++) frames.push([0, 0, null]);
      const span = await page.evaluate(() => window.home.ICON_SPAN);
      const run = (from, to, n) => { for (let i = 1; i <= n; i++) frames.push([from + (to - from) * ease(i / n), 0, null]); };
      for (let k = 0; k < marks.length - 1; k++) {
        // about 2.4 s for a 20% step; the stretch where a mode icon plays is taken slowly (3 s)
        const icon = Object.values(span).find(([s, e]) => s > marks[k] && e <= marks[k + 1]);
        let from = marks[k];
        if (icon) {
          run(from, icon[0], Math.round((icon[0] - from) * 2.4 * 5 * fps));
          run(icon[0], icon[1], 3 * fps);
          from = icon[1];
        }
        const n = Math.round((marks[k + 1] - from) * 2.4 * 5 * fps);
        if (n > 0) run(from, marks[k + 1], n);
        for (let i = 0; i < 18; i++) frames.push([marks[k + 1], 0, null]);
      }
      console.log(frames.length, 'frames');
      for (let i = 0; i < frames.length; i++) {
        await page.evaluate(([a, b, c]) => window.home.set(a, b, c), frames[i]);
        await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) });
        if (i % 30 === 0) console.log('frame', i);
      }
      const out = path.join(SHOTS, 'scroll.mp4');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('wrote', out);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
