// Captures the stills and turntable frames from the running prototype.
//   node capture.js stills            -> shots/<variant>-<state>.png (1600x900)
//   node capture.js turntable         -> shots/turntable-<variant>.mp4 (1280x720, 24 fps, 6 s)
//   node capture.js one "<query>" out.png [w h]
// Needs the folder served: python3 -m http.server 8771
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8771;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(__dirname, 'shots');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const STATES = {
  closed: 'view=hero&turn=20',
  open: 'view=three-quarter&split=1&turn=20',
  exploded: 'view=three-quarter&explode=1&turn=20',
  macro: 'view=macro&turn=20',
};

async function open(browser, query, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [page]', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 400)));
  await page.goto(`${BASE}?still=1&ui=0&${query}`);
  await page.waitForFunction('window.__ballReady === true || window.__ballError', null, { timeout: 180000 });
  const err = await page.evaluate('window.__ballError || null');
  if (err) throw new Error(err);
  return page;
}

(async () => {
  const mode = process.argv[2] || 'stills';
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (mode === 'one') {
      const [, , , query, out, w = 1600, h = 900] = process.argv;
      const page = await open(browser, query, +w, +h);
      await page.screenshot({ path: out });
      console.log(out, JSON.stringify(await page.evaluate('window.ball.stats()')));
    } else if (mode === 'stills') {
      const only = process.argv[3];
      for (const variant of ['steel', 'glass']) for (const [name, query] of Object.entries(STATES)) {
        if (only && !`${variant}-${name}`.includes(only)) continue;
        const page = await open(browser, `variant=${variant}&${query}`, 1600, 900);
        const out = path.join(SHOTS, `${variant}-${name}.png`);
        await page.screenshot({ path: out });
        console.log(path.basename(out), JSON.stringify(await page.evaluate('window.ball.stats()')));
        await page.close();
      }
    } else if (mode === 'turntable') {
      const frames = 144;                       // 6 s at 24 fps
      const sweep = 144;                        // degrees: two periods of the ball's five-fold symmetry, so the clip loops
      for (const variant of (process.argv[3] ? [process.argv[3]] : ['steel', 'glass'])) {
        const dir = path.join(SHOTS, `_frames-${variant}`);
        fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
        // One page per variant; each frame sets the same angle ?turn= would, through the engine API.
        const page = await open(browser, `variant=${variant}&view=hero&turn=0`, 1280, 720);
        for (let i = 0; i < frames; i++) {
          const deg = (i / frames) * sweep;
          await page.evaluate((d) => { window.ball.setTurn(d * Math.PI / 180); window.ball.render(); }, deg);
          await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) });
          if (i % 24 === 0) console.log(variant, 'frame', i);
        }
        await page.close();
        const out = path.join(SHOTS, `turntable-${variant}.mp4`);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(dir, 'f%04d.png'),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', out]);
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('wrote', out);
      }
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
