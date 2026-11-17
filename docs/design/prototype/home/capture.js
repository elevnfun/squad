// Captures the home prototype through Playwright (software WebGL, still mode).
//   node capture.js beats [width height]   -> shots/beat-1-hero.png ... beat-7-end.png, hold-mid.png, hold-open.png,
//                                             blitz-step-1..4.png, draft-step-1..4.png
//   node capture.js sizes                  -> beat-1-hero, beat-2-full-time, beat-4-blitz, beat-5-draft at 1512x860 and 1728x1000
//   node capture.js hover [width height]   -> shots/blitz-card-hover.png, shots/draft-pack-hover.png (the pointer on a card, on a pack)
//   node capture.js glint                  -> shots/blitz-card-glint-strip.png: one card with the hover glint at six points of its loop
//   node capture.js poster                 -> poster/beat-1.jpg ... beat-6.jpg: the canvas alone at 2400x1080 (the load poster and the no-WebGL stills)
//   node capture.js modes                  -> shots/no-webgl-blitz.png (?nogl=1), shots/quality-low-hero.png (?quality=low)
//   node capture.js titles                 -> prints each title word's box and its gap to the ball at four sizes
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
const BEATS = [['1-hero', 0], ['2-full-time', 0.2], ['3-modes', 0.4], ['4-blitz', 0.56], ['5-draft', 0.72], ['6-access', 0.88], ['7-end', 1]];

async function open(browser, query, w, h, opts = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...opts });
  // a missing art/pack-N file is expected (the page looks for optional artwork), so 404s are not printed
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) console.log('  [page]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 400)));
  await page.goto(`${BASE}?still=1&${query}`);
  await page.waitForFunction('window.__homeReady === true || window.__homeError', null, { timeout: 240000 });
  const err = await page.evaluate('window.__homeError || null');
  if (err) throw new Error(err);
  // pack artwork loads after the page is ready (pack-N.png, then the shared pack.png)
  await page.waitForTimeout(600);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('.pack.has-art').length === 8 || !document.querySelector('.pack-art img'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
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
    } else if (mode === 'sizes') {
      // hero, Blitz and Draft at two common Mac window sizes
      for (const [w, h] of [[1512, 860], [1728, 1000]]) {
        const page = await open(browser, 'p=0', w, h);
        for (const [name, p] of [BEATS[0], BEATS[1], BEATS[3], BEATS[4]]) {
          await page.evaluate((a) => window.home.set(a), p);
          await page.waitForTimeout(120);
          await page.screenshot({ path: path.join(SHOTS, `beat-${name}-${w}x${h}.png`) });
          console.log(`beat-${name}-${w}x${h}.png`);
        }
        await page.close();
      }
    } else if (mode === 'hover') {
      // each mode's beat at rest with the pointer on a card: the second fixture card, the fourth pack
      const w = +(process.argv[3] || 1440), h = +(process.argv[4] || 900);
      const page = await open(browser, 'p=0', w, h);
      for (const [name, p, sel, n] of [['blitz-card-hover', 0.56, '#blitz .pack', 1], ['draft-pack-hover', 0.72, '#draft .pack', 3]]) {
        await page.mouse.move(2, 2);
        await page.evaluate((a) => window.home.set(a), p);
        const b = await page.locator(sel).nth(n).boundingBox();
        await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
        await page.mouse.move(b.x + b.width * 0.72, b.y + b.height * 0.3, { steps: 4 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS, w === 1440 ? `${name}.png` : `${name}-${w}.png`) });
        console.log(name);
      }
    } else if (mode === 'glint') {
      // the hover glint frozen at six points of its 4 s loop (?demo=cardhover), one card each, side by side
      const page = await open(browser, 'p=0.56&demo=cardhover', 1440, 900);
      const dir = path.join(SHOTS, '_frames');
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const us = [0.14, 0.28, 0.42, 0.56, 0.7, 0.84];
      for (let i = 0; i < us.length; i++) {
        await page.evaluate((u) => window.homeCardGlint(1, u), us[i]);
        await page.waitForTimeout(150);
        const b = await page.locator('#blitz .pack').nth(1).boundingBox();
        await page.screenshot({ path: path.join(dir, `g${i}.png`), clip: { x: Math.round(b.x - 14), y: Math.round(b.y - 34), width: Math.round(b.width + 28), height: Math.round(b.height + 62) } });
      }
      const out = path.join(SHOTS, 'blitz-card-glint-strip.png');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, 'g%d.png'), '-vf', `tile=${us.length}x1`, '-frames:v', '1', out]);
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('blitz-card-glint-strip.png');
    } else if (mode === 'poster') {
      // The canvas alone, one still per beat (the end frame is the hero frame again), as JPEG.
      // beat-1 is the load poster; it is taken before the ball is moved down for its title word,
      // because the page makes that move in CSS (home.css, #stills img:first-child).
      const dir = path.join(__dirname, 'poster');
      fs.mkdirSync(dir, { recursive: true });
      const [w, h] = [2400, 1080];
      const page = await open(browser, 'p=0', w, h);
      await page.addStyleTag({ content: '.nav, #scrim, #titles, #overlay, #story, #stills, #err { opacity: 0 !important; }' });
      for (let i = 0; i < 6; i++) {
        await page.evaluate(([a, hero]) => { if (hero) { window.home.POSE.hero.dy = 0; window.home.POSE.end.dy = 0; } window.home.set(a); }, [BEATS[i][1], i === 0]);
        await page.screenshot({ path: path.join(dir, `beat-${i + 1}.jpg`), type: 'jpeg', quality: 80 });
        console.log(`poster/beat-${i + 1}.jpg`, fs.statSync(path.join(dir, `beat-${i + 1}.jpg`)).size);
      }
    } else if (mode === 'modes') {
      // the two fallbacks: no WebGL (a still per beat), and the low quality tier
      let page = await open(browser, 'nogl=1', 1440, 900);
      await page.evaluate(() => { const s = document.getElementById('story'); window.scrollTo(0, 0.56 * (s.offsetHeight - innerHeight)); });
      await page.waitForFunction(() => { const i = document.querySelector('#stills img.on'); return i && i.complete && /beat-4/.test(i.src); }, null, { timeout: 15000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'no-webgl-blitz.png') });
      console.log('no-webgl-blitz.png');
      await page.close();
      page = await open(browser, 'p=0&quality=low', 1440, 900);
      console.log('quality:', await page.evaluate(() => window.home.quality));
      await page.screenshot({ path: path.join(SHOTS, 'quality-low-hero.png') });
      console.log('quality-low-hero.png');
    } else if (mode === 'titles') {
      // every title word at four window sizes: its box, and how near the ball comes to it
      for (const [w, h] of [[1440, 900], [1920, 1080], [1512, 860], [1728, 1000]]) {
        const page = await open(browser, 'p=0', w, h);
        console.log(`${w}x${h}`);
        for (const r of await page.evaluate(() => window.home.titleReport())) console.log('  ', JSON.stringify(r));
        await page.close();
      }
    } else if (mode === 'beats') {
      const w = +(process.argv[3] || 1440), h = +(process.argv[4] || 900);
      const suffix = w === 1440 ? '' : `-${w}`;
      const only = process.argv[5];
      const page = await open(browser, 'p=0', w, h);
      const snap = async (name, p, hold = 0, opened = null) => {
        if (only && !name.includes(only)) return;
        await page.evaluate(([a, b, c]) => window.home.set(a, b, c), [p, hold, opened]);
        await page.waitForTimeout(120);
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
        const steps = half === 'blitz' ? [0.14, 0.36, 0.56, 0.8] : [0.17, 0.34, 0.47, 0.64];
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
