// elevn home page prototype: one continuous scroll over a fixed canvas.
// The scroll position is the timeline. A list of cues is blended every frame, so the
// story runs forwards and backwards with the scrollbar. Nothing here uses observers.
import * as THREE from 'three';
import { BallEngine, SPEC, LEVELS } from '../ball/ball.js';
import { blitzIcon, draftIcon } from './icons.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && isFinite(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
const STILL = q.get('still') === '1';                       // capture mode: no time-based motion at all
const REDUCED = q.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;

// The window and the story are measured when the window is sized, never while a frame is drawn:
// reading a size after the frame has written to the page makes the browser lay the page out
// again, every frame.
const vp = { W: window.innerWidth, H: window.innerHeight, narrow: window.innerWidth <= 900, storyH: 0, range: 1, scrollY: 0 };
const narrow = () => vp.narrow;

const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------- the story
// Where each beat sits on the scrollbar (the spec's marks).
const MARKS = [0, 0.2, 0.4, 0.56, 0.72, 0.88, 1];
const TITLES = ['ELEVN', 'FULL TIME', 'MODES', 'BLITZ', 'DRAFT', 'HOLD', 'ELEVN'];

// One pose per beat. All numbers are in mm and degrees.
//   fit    mm that fill the height of the screen (smaller is closer)
//   az, el camera direction round the ball
//   x, y   where the camera target sits, as a fraction of the screen from the centre
//   tear   the teardown, 0 whole to 1 apart: panels lift first, then the halves part
//   gap    the halves alone, 1 is 60 mm apart (the hold's frame), with no panels lifted
//   turn   the ball about its own axis
//   focus  slides the target along the axis: +1 the Blitz half, -1 the Draft half
//   near   1 puts the target on the ball's surface (the close-up)
//   lit    how lit the core is at the least, 0 to 1 (it also lights by itself as the ball opens)
//   scrim  strength of the dark wash behind the words
//   idle   1 lets the ball turn on its own (6 degrees a second)
const POSE = {
  hero:   { fit: 350, az: 0,  el: 9,  x: 0.13, y: 0.04, tear: 0,    gap: 0, turn: 0,   focus: 0,     near: 0, scrim: 0.55, idle: 1 },
  // the macro: the ball is about two screens tall and fills the lower right; its limb runs from
  // the top right corner down to the bottom edge, which leaves the top left dark for the title word
  close:  { fit: 80,  az: 17, el: 14, x: 0.45, y: 0.42, tear: 0.03, gap: 0, turn: 22,  focus: 0,     near: 1, scrim: 1,    idle: 0 },
  close2: { fit: 76,  az: 20, el: 15, x: 0.45, y: 0.43, tear: 0.04, gap: 0, turn: 30,  focus: 0,     near: 1, scrim: 1,    idle: 0 },
  apart:  { fit: 500, az: 23, el: 18, x: 0.12, y: 0.02, tear: 1,    gap: 0, turn: 52,  focus: 0,     near: 0, scrim: 0.6,  idle: 0 },
  apart2: { fit: 500, az: 23, el: 18, x: 0.12, y: 0.02, tear: 1,    gap: 0, turn: 58,  focus: 0,     near: 0, scrim: 0.6,  idle: 0 },
  // Blitz and Draft: the panels are back on and the two halves stand 84 mm apart, upper right,
  // above the cards. x is set by layoutTitles so the ball stays over the right end of the cards.
  blitz:  { fit: 560, az: 23, el: 18, x: 0.27, y: -0.16, tear: 0,   gap: 1.4, turn: 84,  focus: 0.06,  near: 0, scrim: 0.7,  idle: 0 },
  blitz2: { fit: 560, az: 23, el: 18, x: 0.27, y: -0.16, tear: 0,   gap: 1.4, turn: 98,  focus: 0.06,  near: 0, scrim: 0.7,  idle: 0 },
  draft:  { fit: 560, az: 23, el: 18, x: 0.27, y: -0.15, tear: 0,   gap: 1.4, turn: 124, focus: -0.06, near: 0, scrim: 0.7,  idle: 0 },
  draft2: { fit: 560, az: 23, el: 18, x: 0.27, y: -0.15, tear: 0,   gap: 1.4, turn: 138, focus: -0.06, near: 0, scrim: 0.7,  idle: 0 },
  access: { fit: 400, az: 23, el: 18, x: 0.13, y: 0.02, tear: 0,    gap: 1, turn: 196, focus: 0,     near: 0, scrim: 0.55, idle: 0 },
  end:    { fit: 350, az: 0,  el: 9,  x: 0.13, y: 0.04, tear: 0,    gap: 0, turn: 216, focus: 0,     near: 0, scrim: 0.55, idle: 1 },
  // what a completed hold blends towards: "the one frame"
  open:   { fit: 400, az: 23, el: 18 },
};
// The cue list: scroll position, pose. Two cues with similar poses make a beat hold.
// 216 degrees is three of the ball's 72 degree repeats, so the last frame matches the first.
const CUES = [
  [0.00, 'hero'], [0.035, 'hero'],
  [0.17, 'close'], [0.235, 'close2'],
  [0.37, 'apart'], [0.43, 'apart2'],
  [0.53, 'blitz'], [0.60, 'blitz2'],
  [0.69, 'draft'], [0.76, 'draft2'],
  [0.875, 'access'], [0.90, 'access'],
  [0.985, 'end'], [1.00, 'end'],
];
for (const k in POSE) {
  POSE[k].dy = 0;                            // set by layoutTitles: how far the ball moves down to clear its title word
  if (POSE[k].lit === undefined) POSE[k].lit = 0;
}
const KEYS = Object.keys(POSE.hero);
// The teardown at its fullest: how far the panels lift (1 is 30 mm) and how far the halves
// part (1 is 60 mm between them).
const TEAR = { explode: num('ex', 0.7), split: num('sp', 2.4) };
// Blitz and Draft: where the ball's centre stands, 0.24 window heights in from the cards' right end
const modeX = (W, H) => (W - Math.max(80, (W - 1440) / 2) - 36 - 0.24 * H) / W - 0.5;

// The pose at a scroll position. It fills and returns one shared object (nothing is made per
// frame), so use the result before asking for another.
const POSED = {};
function poseAt(p) {
  let i = 0;
  while (i < CUES.length - 2 && p >= CUES[i + 1][0]) i++;
  const a = CUES[i][0], A = POSE[CUES[i][1]], b = CUES[i + 1][0], B = POSE[CUES[i + 1][1]];
  const t = easeInOut(clamp01((p - a) / (b - a)));
  for (let k = 0; k < KEYS.length; k++) POSED[KEYS[k]] = lerp(A[KEYS[k]], B[KEYS[k]], t);
  return POSED;
}
// Which beat's words are up: each beat owns the scroll from halfway after the last mark
// to halfway before the next.
function beatAt(p) {
  for (let i = 0; i < MARKS.length - 1; i++) if (p < (MARKS[i] + MARKS[i + 1]) / 2) return i;
  return MARKS.length - 1;
}

// ---------------------------------------------------------------- page
const root = document.documentElement;
const canvas = document.getElementById('stage');
const story = document.getElementById('story');
const overlay = document.getElementById('overlay');
const ring = document.getElementById('ring'), ringTrack = document.getElementById('ring-track');
const holdBtn = document.getElementById('hold');
const beats = [...document.querySelectorAll('.beat')];
const railDots = [...document.querySelectorAll('.rail a')];
root.classList.add('js');
if (STILL) root.classList.add('still');

// No WebGL (or ?nogl=1): engine stays null and the page shows a still per beat instead (see "stills").
let engine = null;
try {
  if (q.get('nogl') === '1') throw new Error('WebGL switched off by ?nogl=1');
  engine = new BallEngine(canvas, { variant: 'glass', still: STILL, reducedMotion: REDUCED, pointer: false, pixelRatio: q.has('dpr') ? num('dpr', 1) : undefined });
} catch (e) {
  console.warn('elevn: no WebGL, showing stills.', e);
}

// ---------------------------------------------------------------- quality
// The engine has seven quality levels (LEVELS in ball.js): cheaper effects first, then fewer
// pixels. The page starts at the best and keeps watching what a frame really costs:
//   - one drawn frame in four is timed: it is drawn and one pixel is read back, which waits for
//     the graphics card, so the time is the frame's real cost and not the time taken to queue it;
//   - nothing is timed in the first second (shaders, textures and buffers are still being made),
//     for half a second after the level or the window changes, or while the tab is hidden;
//   - every 40 timed frames the middle one decides. Over 18 ms (it cannot hold 60 frames a
//     second): one level down. The steps that cost sharpness need two slow lots in a row, and
//     below 1.5 pixels per CSS pixel the limit is 30 ms. Under 7 ms three lots in a row: one
//     level back up (a level that has proved too slow twice is not tried again).
// ?quality=high, low or min fixes the level and switches the watching off.
const LAST = LEVELS.length - 1;
const FORCED = ['high', 'low', 'min'].includes(q.get('quality')) ? q.get('quality') : null;
const WINDOW = 40;
const mon = {
  on: !!engine && !FORCED && !STILL,
  n: 0, holdUntil: Infinity,
  ring: new Float32Array(WINDOW), sorted: new Float32Array(WINDOW), filled: 0, at: 0, count: 0,
  bad: 0, slow: 0, fast: 0, fails: new Uint8Array(LEVELS.length),
  median: 0, worst: 0, px: new Uint8Array(4), log: [],
};
const hush = (ms) => { mon.holdUntil = performance.now() + ms; mon.count = 0; mon.bad = 0; };
function setLevel(n, why) {
  if (!engine || engine.level === n) return;
  engine.setLevel(n);
  mon.log.push(`${LEVELS[n].name}: ${why}`);
  mon.slow = 0; mon.fast = 0; mon.filled = 0; mon.at = 0;
  hush(500);                                   // the first frames of a level pay for its new buffers
  state.dirty = true;
}
function setQuality(tier) { const i = LEVELS.findIndex((L) => L.name === tier); if (i >= 0) setLevel(i, 'set by hand'); }
// Two levels that come to the same thing on this screen (a 1x screen has no 1.5 to drop to).
const sameLevel = (a, b) => engine.pixelRatioAt(a) === engine.pixelRatioAt(b) && LEVELS[a].msaa === LEVELS[b].msaa
  && LEVELS[a].bloom === LEVELS[b].bloom && Math.min(LEVELS[a].glass, engine.pixelRatioAt(a)) === Math.min(LEVELS[b].glass, engine.pixelRatioAt(b));
function nextLevel(dir) {
  let n = engine.level;
  do { n += dir; } while (n > 0 && n < LAST && sameLevel(n, n - dir));
  return Math.max(0, Math.min(LAST, n));
}
function middle() {                             // the middle and the worst of the timed frames in hand
  const n = mon.filled;
  if (!n) { mon.median = 0; mon.worst = 0; return; }
  mon.sorted.set(mon.ring);
  const part = mon.sorted.subarray(0, n).sort();
  mon.median = part[n >> 1]; mon.worst = part[n - 1];
}
function timed(ms) {
  mon.ring[mon.at] = ms; mon.at = (mon.at + 1) % WINDOW; mon.filled = Math.min(WINDOW, mon.filled + 1);
  if (!mon.on) return;
  const L = engine.level;
  // hopeless (a software renderer): three timed frames in a row over 100 ms, straight to the lowest
  mon.bad = ms > 100 ? mon.bad + 1 : 0;
  if (mon.bad >= 3 && L < LAST) { setLevel(LAST, 'three frames in a row over 100 ms'); return; }
  if (++mon.count < WINDOW) return;
  mon.count = 0;
  middle();
  const sharp = L < 2;                          // the next step down costs no sharpness
  const limit = L < 3 ? 18 : 30;
  if (mon.median > limit) {
    mon.fast = 0;
    if (++mon.slow >= (sharp ? 1 : 2) && L < LAST) { mon.fails[L]++; setLevel(nextLevel(1), `${mon.median.toFixed(1)} ms a frame`); }
  } else {
    mon.slow = 0;
    const up = nextLevel(-1);
    if (mon.median < 7 && L > 0 && mon.fails[up] < 2) { if (++mon.fast >= 3) setLevel(up, `${mon.median.toFixed(1)} ms a frame`); }
    else mon.fast = 0;
  }
}
// Draws the frame. One in four is timed, for the level and for ?stats=1.
function draw() {
  stats.draws++;
  if ((!mon.on && !stats.on) || STILL || (mon.n++ & 3) || performance.now() < mon.holdUntil) { engine.render(); return; }
  const t0 = performance.now();
  engine.render();
  const gl = engine.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, mon.px);
  timed(performance.now() - t0);
}

// ---------------------------------------------------------------- ?stats=1
// A small readout in the corner, for reading real numbers on a real graphics card.
const stats = { on: q.get('stats') === '1', el: null, draws: 0, rafs: 0, since: performance.now(), gap: 0, gaps: [0, 0, 0, 0, 0, 0], gi: 0, lastRaf: 0, text: '' };
if (stats.on) {
  stats.el = document.createElement('div');
  stats.el.setAttribute('aria-hidden', 'true');
  stats.el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:60;padding:8px 12px;border-radius:8px;white-space:pre;pointer-events:none;'
    + 'font:500 12px/1.55 "Sora",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:#ECEAE4;background:rgba(10,11,13,.88);border:1px solid rgba(255,255,255,.16)';
  document.body.append(stats.el);
}
function statsRaf(now) {                        // called once per animation frame
  if (!stats.on) return;
  if (stats.lastRaf) stats.gap = Math.max(stats.gap, now - stats.lastRaf);
  stats.lastRaf = now; stats.rafs++;
  if (now - stats.since >= 500) statsShow(now);
}
function statsShow(now) {
  if (!stats.on) return;
  const span = Math.max(1, now - stats.since);
  const fps = (stats.rafs * 1000) / span, redraws = (stats.draws * 1000) / span;
  stats.gaps[stats.gi] = stats.gap; stats.gi = (stats.gi + 1) % stats.gaps.length;
  const gap = Math.max(...stats.gaps);
  stats.rafs = 0; stats.draws = 0; stats.gap = 0; stats.since = now;
  let text;
  if (!engine || stills.on) text = 'no WebGL: showing stills';
  else {
    middle();
    const b = engine.renderer.domElement, pr = engine.renderer.getPixelRatio();
    text = `fps ${fps.toFixed(0)} · redraws ${redraws.toFixed(0)} a second · longest gap ${gap.toFixed(0)} ms\n`
      + (mon.filled ? `frame ${mon.median.toFixed(1)} ms median · ${mon.worst.toFixed(1)} worst (last ${mon.filled} timed frames)\n` : 'frame: none timed yet (scroll, or wait for the ball to turn)\n')
      + `tier ${engine.quality} (level ${engine.level} of ${LAST}, ${FORCED ? 'fixed by ?quality' : STILL ? 'fixed: still mode' : 'automatic'})\n`
      + `DPR ${+pr.toFixed(2)} in use · screen ${+(window.devicePixelRatio || 1).toFixed(2)} · canvas ${b.width} × ${b.height}\n`
      + `draw calls ${engine.lastCalls} · triangles ${engine.lastTriangles.toLocaleString('en-GB')}`;
  }
  if (text !== stats.text) { stats.text = text; stats.el.textContent = text; }
}

// ---------------------------------------------------------------- title words
// One outlined word per beat. It is HTML, above the canvas and above the dark wash, so every
// letter is drawn at the same strength: nothing in the 3D scene (the wash behind the copy,
// the vignette, the glass) can dim or hide part of it. Decoration only: the real words are
// the copy on the left.
// The word lives in a band under the bar. It is placed against the ball's outline on screen,
// measured at the beat's resting pose, never by fixed numbers:
//   above   centred over the ball; the ball is moved down until its top clears the word
//   beside  to the left of the part of the ball that reaches into the band
//   left    at the left content edge, over the dark area (the close-up, where the ball is
//           too large to stand clear of: the word goes where the ball is not)
const TITLE = {
  'ELEVN':     { place: 'above',  poses: ['hero', 'end'] },
  'FULL TIME': { place: 'left',   poses: ['close', 'close2'] },
  'MODES':      { place: 'beside', poses: ['apart', 'apart2'] },
  'BLITZ':     { place: 'beside', poses: ['blitz', 'blitz2'] },
  'DRAFT':     { place: 'beside', poses: ['draft', 'draft2'] },
  'HOLD':      { place: 'above',  poses: ['access'] },
};
const titleBox = document.getElementById('titles');
const titles = Object.keys(TITLE).map((word) => {
  const el = document.createElement('span');
  el.textContent = word;
  titleBox.append(el);
  return { word, el, rect: null };
});
const measure = document.createElement('canvas').getContext('2d');
// The ball's outline on screen at a pose: points on a shell just outside each half.
function ballPoints(P) {
  applyPose(P, 0, 0);
  const ex = engine.state.explode, r = R + 6 + 48 * ex;      // lifted panels and their panes
  const pts = [];
  for (const half of ['blitz', 'draft']) {
    const sign = half === 'blitz' ? 1 : -1;
    for (let lat = -12; lat <= 90; lat += 6) for (let lon = 0; lon < 360; lon += 10) {
      const cl = Math.cos(rad(lat));
      pts.push(engine.project([r * cl * Math.cos(rad(lon)), sign * r * Math.sin(rad(lat)), r * cl * Math.sin(rad(lon))], engine.halves[half]));
    }
  }
  return pts;
}
function layoutTitles() {
  for (const k in POSE) POSE[k].dy = 0;
  if (!engine || narrow()) return;
  const W = vp.W, H = vp.H;
  const edge = Math.max(80, (W - 1440) / 2);                 // the content edge
  // Blitz and Draft: the ball's centre stands a fixed part of the window height in from the
  // right end of the cards, whatever the window's shape
  for (const k of ['blitz', 'blitz2', 'draft', 'draft2']) POSE[k].x = modeX(W, H);
  const cap = Math.round(0.125 * H), px = cap / 0.7;          // Barlow Condensed capitals are 0.7 em tall
  const top = 64 + Math.round(0.028 * H), bottom = top + cap; // the band, under the 64 px bar
  const gap = Math.round(0.022 * H);
  for (const t of titles) {
    const spec = TITLE[t.word];
    const font = `700 ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    measure.font = font;
    const m = measure.measureText(t.word);
    const track = 0.03 * px, w = m.width + track * (t.word.length - 1);
    const sets = spec.poses.map((k) => ballPoints(POSE[k]));
    const all = sets.flat();
    let left;
    if (spec.place === 'above') {
      const xs = all.map((p) => p.x);
      left = (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2;
    } else if (spec.place === 'left') {
      left = edge;
    } else {
      const inBand = all.filter((p) => p.y > top - gap && p.y < bottom + gap).map((p) => p.x);
      left = (inBand.length ? Math.min(...inBand) : Math.min(...all.map((p) => p.x))) - gap - w;
    }
    left = Math.round(Math.min(Math.max(left, edge), W - edge - 44 - w));   // 44: the beat rail
    // how far the ball must come down so that no part of it is inside the word's box
    let dy = 0;
    for (const p of all) if (p.x > left - gap && p.x < left + w + gap && p.y < bottom + gap) dy = Math.max(dy, bottom + gap - p.y);
    for (const k of spec.poses) POSE[k].dy = dy / H;
    // CSS: the line box is 1 em tall; put the capitals' top edge on the band's top edge
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    const capTop = (px - (asc + desc)) / 2 + asc - cap;
    Object.assign(t.el.style, { left: `${left}px`, top: `${(top - capTop).toFixed(1)}px`, fontSize: `${px.toFixed(2)}px`, letterSpacing: `${track.toFixed(2)}px` });
    t.rect = { left, top, right: left + w, bottom, gap };
  }
}
// For the captures: at each beat's mark, the word's box and how near the ball comes to it.
function titleReport() {
  const W = vp.W;
  return MARKS.map((mk, i) => {
    const t = titles.find((x) => x.word === TITLES[i]), r = t.rect;
    if (!r) return null;
    let near = Infinity;
    for (const p of ballPoints(poseAt(mk))) {
      const dx = Math.max(r.left - p.x, 0, p.x - r.right), dyy = Math.max(r.top - p.y, 0, p.y - r.bottom);
      near = Math.min(near, Math.hypot(dx, dyy));
    }
    const b = t.el.getBoundingClientRect();
    const words = beats[i].querySelector('.words').getBoundingClientRect();
    return { word: t.word, left: r.left, right: Math.round(r.right), top: r.top, bottom: r.bottom, domRight: Math.round(b.right),
      ballGap: Math.round(near), insideView: r.left >= 0 && b.right <= W, belowNav: r.top >= 64, clearOfCopy: r.bottom < words.top || r.left > words.right };
  });
}

const R = SPEC.radius;

// ---------------------------------------------------------------- mode icons
// Each icon runs from 0 to 1 over the first part of its beat and rests on its last frame
// from the beat's mark onwards. Reduced motion and narrow screens show the last frame.
const ICON_SPAN = { blitz: [0.484, 0.556], draft: [0.644, 0.716] };
const icons = [...document.querySelectorAll('.mode')].map((mode) => {
  const half = mode.dataset.half;
  const draw = (half === 'blitz' ? blitzIcon : draftIcon)(mode.querySelector('.icon'));
  const notes = [...mode.querySelectorAll('li')].map((li) => ({ li, at: parseFloat(li.dataset.at) || 0 }));
  return { half, draw, notes, t: -1 };
});
function drawIcons(p) {
  for (const ic of icons) {
    const [a, b] = ICON_SPAN[ic.half];
    const t = REDUCED || narrow() ? 1 : clamp01((p - a) / (b - a));
    if (t === ic.t) continue;
    ic.t = t;
    ic.draw(t);
    for (const n of ic.notes) n.li.classList.toggle('lit', t >= n.at);
  }
}

// ---------------------------------------------------------------- pose to engine
const state = {
  p: 0, pTarget: 0, pVel: 0,  // scroll position: eased, raw, and how fast the eased one is moving
  beat: -1,
  idle: 0,                   // degrees the ball has turned on its own
  hold: 0, open: 0,          // the ring (0 to 1) and how far the hold has opened the ball
  holding: false, opened: false,
  studio: { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 },
  last: performance.now(), dirty: true,
};
// what the last drawn frame was drawn from, to tell whether anything has changed
const seen = { p: -1, open: -1, idle: 1e9, yaw: 1e9, pitch: 1e9, beat: -1, scrim: -1, canHold: null, past: null };
const tmp = new THREE.Vector3();
const smooth = (x) => x * x * (3 - 2 * x);
const camera = { fit: 0, dir: [0, 0, 1], target: [0, 0, 0], shift: [0, 0] };   // reused every frame
function applyPose(P, open, idleDeg) {
  // the hold opens the ball and pulls the camera round to the three-quarter frame
  const o = easeInOut(clamp01(open));
  const fit = lerp(P.fit, Math.max(P.fit, POSE.open.fit), o);
  const az = rad(lerp(P.az, POSE.open.az, o)), el = rad(lerp(P.el, POSE.open.el, o));
  const dir = camera.dir;
  dir[0] = Math.sin(az) * Math.cos(el); dir[1] = Math.sin(el); dir[2] = Math.cos(az) * Math.cos(el);
  const tear = P.tear;
  const explode = TEAR.explode * clamp01(tear / 0.45);
  const split = Math.max(TEAR.split * easeInOut(clamp01((tear - 0.3) / 0.7)), P.gap || 0, open);
  // the core lights as the ball opens (the engine's own rule), or as far as the beat asks, whichever is more
  const lit = Math.max(smooth(Math.min(split, 1)), explode * 0.6, P.lit || 0);
  engine.setPose(split, explode, rad((P.turn || 0) + idleDeg), lit);
  // target: the centre, slid along the axis for a half, or pushed out to the surface
  engine.spin.updateWorldMatrix(true, false);
  tmp.set(0, (P.focus || 0) * 80, 0);
  engine.spin.localToWorld(tmp);
  const n = (P.near || 0) * R;
  camera.target[0] = tmp.x + dir[0] * n; camera.target[1] = tmp.y + dir[1] * n; camera.target[2] = tmp.z + dir[2] * n;
  const compact = narrow();
  camera.fit = compact ? fit * 1.25 : fit;
  camera.shift[0] = compact ? 0 : P.x; camera.shift[1] = compact ? -0.17 : P.y + (P.dy || 0);
  engine.setCamera(camera);
}

function setBeat(b) {
  if (b === state.beat) return;
  state.beat = b;
  beats.forEach((el, i) => el.classList.toggle('on', i === b));
  titles.forEach((t) => t.el.classList.toggle('on', t.word === TITLES[b]));
  railDots.forEach((el, i) => { el.classList.toggle('on', i === b); if (i === b) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); });
}
// The dark wash behind the words. Set on the wash itself: on the root element it would make
// the browser restyle the whole page every frame of a transition.
const scrimEl = document.getElementById('scrim');
function setScrim(v) {
  const k = Math.round(v * 1000);
  if (k === seen.scrim) return;
  seen.scrim = k;
  scrimEl.style.setProperty('--scrim', String(k / 1000));
}

// Measured when the window is sized (and when the story's own height changes), never per frame.
function measureWindow() {
  vp.W = window.innerWidth; vp.H = window.innerHeight; vp.narrow = vp.W <= 900;
  vp.storyH = story.offsetHeight; vp.range = vp.storyH - vp.H;
}
function storyProgress() {
  return vp.range > 0 ? clamp01(vp.scrollY / vp.range) : 0;
}
const canHold = () => !vp.narrow && (state.p < 0.06 || state.p > 0.975);

// The eased scroll position follows the scrollbar like a critically damped spring: it starts
// and stops without a jerk, never overshoots, and runs backwards exactly as it runs forwards.
// SMOOTH is the time it lags behind a steady scroll (?smooth=milliseconds to try others).
const SMOOTH = Math.max(0.001, num('smooth', 120) / 1000);
function follow(s, dt) {
  const w = 2 / SMOOTH, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = s.p - s.pTarget, t = (s.pVel + w * d) * dt;
  let out = s.pTarget + (d + t) * e;
  s.pVel = (s.pVel - w * t) * e;
  if ((s.pTarget > s.p) === (out > s.pTarget)) { out = s.pTarget; s.pVel = 0; }   // never past the target
  if (Math.abs(s.pTarget - out) < 2e-5 && Math.abs(s.pVel) < 2e-4) { out = s.pTarget; s.pVel = 0; }
  s.p = out;
}

function frame(dt, wall = dt) {
  const s = state;
  if (STILL || REDUCED || vp.narrow || dt <= 0) { s.p = s.pTarget; s.pVel = 0; }
  else follow(s, dt);

  const beat = beatAt(s.pTarget);
  // Reduced motion and narrow screens: no scrubbed motion, one still pose per beat.
  let P;
  if (vp.narrow) P = POSE.hero;
  else if (REDUCED) P = poseAt(MARKS[beatAt(s.p)]);
  else P = poseAt(s.p);

  // the hold
  const holdable = canHold();
  if (!holdable) { s.holding = false; }
  if (!REDUCED && !STILL) {
    // the ring runs on the wall clock, so it takes 900 ms however slow the frames are
    if (s.holding) { s.hold = Math.min(1, s.hold + wall / 0.9); if (s.hold >= 1) s.opened = true; }
    else { s.hold = Math.max(0, s.hold - wall / 0.25); s.opened = false; }
    const want = s.holding ? (s.opened ? 1 : 0.1 * s.hold) : 0;
    if (want > s.open) s.open = Math.min(want, s.open + dt / 0.55);
    else s.open = Math.max(want, s.open - dt / 0.35);       // release closes it in 350 ms
  }
  // the ball turns on its own in the hero and the end frame only
  if (!REDUCED && !STILL && !vp.narrow && P.idle > 0.999 && s.open < 0.01 && !s.holding) s.idle += dt * 6;
  let idle = ((s.idle + 180) % 360) - 180;
  idle *= P.idle;

  // the cursor turns the studio light, never the ball (it follows at the same pace on a 60 Hz and a 120 Hz screen)
  const st = s.studio;
  if (!REDUCED && !STILL) {
    const k = 1 - Math.exp(-dt * 3.7);
    st.yaw += (st.tYaw - st.yaw) * k; st.pitch += (st.tPitch - st.pitch) * k;
    if (Math.abs(st.tYaw - st.yaw) + Math.abs(st.tPitch - st.pitch) < 1e-4) { st.yaw = st.tYaw; st.pitch = st.tPitch; }
  }

  const changed = s.dirty || s.p !== seen.p || s.open !== seen.open || idle !== seen.idle || st.yaw !== seen.yaw || st.pitch !== seen.pitch || beat !== seen.beat;
  if (changed) {
    seen.p = s.p; seen.open = s.open; seen.idle = idle; seen.yaw = st.yaw; seen.pitch = st.pitch; seen.beat = beat;
    applyPose(P, s.open, idle);
    engine.setStudio(st.yaw, st.pitch, true);
    setScrim(P.scrim);
  }
  setBeat(beat);
  drawIcons(s.p);
  if (changed || s.holding || s.hold > 0) drawRing();
  if (changed) { draw(); s.dirty = false; }
  if (holdable !== seen.canHold) { seen.canHold = holdable; canvas.classList.toggle('can-hold', holdable); }
}

// The hold's ring, and what goes with it. Every write is skipped when its value has not changed,
// and the ring's own shape is left alone while it cannot be seen.
const ringSeen = { on: null, fade: -1, pressed: null, shown: false };
const ringAt = { x: 0, y: 0, depth: 0 };
function drawRing() {
  const on = state.hold > 0.001;
  if (on !== ringSeen.on) { ringSeen.on = on; overlay.classList.toggle('holding', on); }
  // the title word steps back while the ball is held open, so the ring and the open ball do not cross it
  const fade = Math.round((1 - clamp01(Math.max(state.hold * 2.5, state.open * 4))) * 1000);
  if (fade !== ringSeen.fade) { ringSeen.fade = fade; titleBox.style.opacity = String(fade / 1000); }
  const pressed = state.opened || (REDUCED && state.open > 0.5);
  if (pressed !== ringSeen.pressed) { ringSeen.pressed = pressed; holdBtn.setAttribute('aria-pressed', String(pressed)); }
  if (!on && !ringSeen.shown) return;
  ringSeen.shown = on;
  const c = engine.project([0, 0, 0], engine.spin, ringAt);
  const r = engine.pxPerMm() * (R + 30 * easeInOut(state.open)) + 14;
  const len = 2 * Math.PI * r;
  for (const el of [ring, ringTrack]) { el.setAttribute('cx', c.x); el.setAttribute('cy', c.y); el.setAttribute('r', r); }
  ring.setAttribute('transform', `rotate(-90 ${c.x} ${c.y})`);
  ring.setAttribute('stroke-dasharray', `${len * state.hold} ${len}`);
}

// ---------------------------------------------------------------- input
// The scroll handler only notes where the page is. Everything that follows from it is done in
// the next animation frame.
function onScroll() {
  vp.scrollY = window.scrollY;
  state.pTarget = storyProgress();
  const past = vp.scrollY > vp.storyH - vp.H * 0.55;
  if (past !== seen.past) { seen.past = past; root.classList.toggle('past-story', past); }
}
function onResize() {
  measureWindow();
  if (engine) engine.resize();
  layoutTitles(); onScroll();
  state.dirty = true;
  if (mon.holdUntil !== Infinity) hush(500);   // new buffers: do not time the frames that make them
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onResize);
if ('ResizeObserver' in window) new ResizeObserver(() => { const h = story.offsetHeight; if (h !== vp.storyH) { measureWindow(); onScroll(); state.dirty = true; } }).observe(story);
document.addEventListener('visibilitychange', () => { state.last = performance.now(); stats.lastRaf = 0; if (mon.holdUntil !== Infinity) hush(500); });

// rail and logo: jump to a beat's mark
function goTo(i) {
  window.scrollTo({ top: MARKS[i] * vp.range, behavior: REDUCED ? 'auto' : 'smooth' });
}
railDots.forEach((a, i) => a.addEventListener('click', (e) => { e.preventDefault(); goTo(i); }));
document.querySelector('.logo').addEventListener('click', (e) => { e.preventDefault(); goTo(0); });

// cursor: 12 degrees of yaw and 6 of pitch at most
window.addEventListener('pointermove', (e) => {
  if (REDUCED || e.pointerType === 'touch') return;
  state.studio.tYaw = rad(12) * ((e.clientX / vp.W) * 2 - 1);
  state.studio.tPitch = rad(6) * ((e.clientY / vp.H) * 2 - 1);
});

// hold to open: press the ball, or hold Space or Enter on the button
function overBall(e) {
  const c = engine.project([0, 0, 0]);
  return Math.hypot(e.clientX - c.x, e.clientY - c.y) < engine.pxPerMm() * (R + 10);
}
function swapStill(fn) {            // reduced motion: a 200 ms fade between two stills
  canvas.classList.add('swap');
  setTimeout(() => { fn(); state.dirty = true; frame(0); canvas.classList.remove('swap'); }, 200);
}
function holdStart() {
  if (!canHold()) return;
  if (REDUCED) { swapStill(() => { state.open = state.open > 0.5 ? 0 : 1; }); return; }
  state.holding = true;
}
function holdEnd() { state.holding = false; }
canvas.addEventListener('pointerdown', (e) => { if (e.button === 0 && overBall(e)) { holdStart(); e.preventDefault(); } });
holdBtn.addEventListener('pointerdown', (e) => { if (e.button === 0) holdStart(); });
for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, holdEnd);
canvas.addEventListener('contextmenu', (e) => { if (state.holding) e.preventDefault(); });
holdBtn.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  if (!e.repeat) holdStart();
});
holdBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') holdEnd(); });
holdBtn.addEventListener('blur', holdEnd);
if (REDUCED) holdBtn.querySelector('.hold-text').textContent = 'Open the ball';

// ---------------------------------------------------------------- start
let lastBeatShown = -1;
function loop(now) {
  requestAnimationFrame(loop);
  const wall = Math.min((now - state.last) / 1000, 1);
  const dt = Math.min(wall, 0.1);
  state.last = now;
  statsRaf(now);
  // nothing is drawn in a hidden tab or once the prizes band has covered the stage; and a frame
  // is only drawn when something has changed (the scroll, the idle turn, the cursor, the hold, the window)
  if (stills.on) return;
  if (document.hidden || vp.scrollY > vp.storyH + 40) return;
  if (REDUCED && !vp.narrow) {
    // crossfade between the stills when the beat changes
    const b = beatAt(storyProgress());
    if (lastBeatShown !== -1 && b !== lastBeatShown) { lastBeatShown = b; state.pTarget = storyProgress(); swapStill(() => {}); return; }
    lastBeatShown = b;
    if (canvas.classList.contains('swap')) return;
  }
  frame(dt, wall);
}

// ---------------------------------------------------------------- stills
// poster/beat-1.jpg is in the HTML and is on screen before any script runs: the hero frame.
// The canvas fades in over it once its first frame is drawn. If there is no WebGL (or the
// context is lost) the canvas is never shown and each beat gets its own still instead.
// A still is the canvas alone, 2400 x 1080. It is shown at the window's height and slid
// sideways so that the ball lands where the live canvas would put it (--fx: where the ball
// is in the picture, --cx: where it belongs in the window).
const stillBox = document.getElementById('stills');
const STILL_SIZE = [2400, 1080];
const stills = { on: false, imgs: [stillBox.querySelector('img')] };
function showStill() {
  const p = storyProgress(), beat = beatAt(p);
  const b = narrow() ? 0 : beat, i = b === 6 ? 0 : b;      // the end frame is the hero frame
  if (!stills.imgs[i]) {
    const im = new Image();
    im.alt = ''; im.decoding = 'async'; im.src = `poster/beat-${i + 1}.jpg`;
    stillBox.append(im); stills.imgs[i] = im;
  }
  const P = poseAt(MARKS[b]), mode = i === 3 || i === 4;
  const st = stills.imgs[i].style;
  st.setProperty('--fx', (0.5 + (mode ? modeX(...STILL_SIZE) : P.x)).toFixed(4));
  st.setProperty('--cx', `${((0.5 + (mode ? modeX(vp.W, vp.H) : P.x)) * vp.W).toFixed(1)}px`);
  stills.imgs.forEach((im, k) => im && im.classList.toggle('on', k === i));
  setScrim(P.scrim);
  setBeat(beat);
  drawIcons(p);
}
function useStills() {
  if (stills.on) return;
  stills.on = true;
  root.classList.add('nogl');
  stillBox.hidden = false;
  window.addEventListener('scroll', showStill, { passive: true });
  window.addEventListener('resize', showStill);
  showStill();
  statsShow(performance.now());
  window.__homeReady = true;
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); useStills(); });

async function start() {
  try { await Promise.all([document.fonts.load('700 100px "Barlow Condensed"'), document.fonts.load('800 60px "Sora"'), document.fonts.ready]); } catch (e) { /* fall back to system fonts */ }
  measureWindow(); vp.scrollY = window.scrollY;
  if (!engine) { useStills(); return; }
  if (FORCED) setQuality(FORCED);
  layoutTitles();
  if (q.has('p')) state.pTarget = clamp01(num('p', 0)); else onScroll();
  state.p = state.pTarget;
  if (q.has('hold')) { state.hold = clamp01(num('hold', 0)); state.open = 0.1 * state.hold; }
  if (q.has('open')) { state.hold = 1; state.opened = true; state.open = clamp01(num('open', 1)); }
  // Every shader is compiled before the first frame, off the main thread where the browser can,
  // so the first frames (and the timing that sets the quality) do not pay for it.
  applyPose(vp.narrow ? POSE.hero : poseAt(state.p), state.open, 0);
  try { await engine.precompile(); } catch (e) { /* compiled on the first frame instead */ }
  state.dirty = true; frame(0);
  requestAnimationFrame(() => {
    state.dirty = true; frame(0);
    canvas.classList.add('ready');
    // the poster is under the canvas: take it away once the canvas has faded in over it
    setTimeout(() => { if (!stills.on) stillBox.hidden = true; }, STILL ? 0 : 700);
    statsShow(performance.now());
    window.__homeReady = true;
    mon.holdUntil = performance.now() + 1000;      // nothing is timed in the first second
    if (!STILL) { state.last = performance.now(); requestAnimationFrame(loop); }
  });
}

// For captures: set the story position (and the hold) and draw that frame now.
window.home = {
  engine, state, POSE, CUES, MARKS, TITLE, ICON_SPAN, STILL_SIZE, LEVELS, layoutTitles, titleReport, setQuality, setLevel, mon,
  stats() { statsShow(performance.now()); return stats.text; },
  get quality() { return engine ? engine.quality : 'stills'; },
  set(p, hold = 0, open = null) {
    if (!engine) return;
    state.pTarget = state.p = clamp01(p); state.pVel = 0;
    state.hold = clamp01(hold); state.opened = open !== null; state.open = open !== null ? open : 0.1 * state.hold;
    state.dirty = true; frame(0);
  },
};
start().catch((e) => { document.getElementById('err').textContent = String((e && e.stack) || e); window.__homeError = String(e); });
