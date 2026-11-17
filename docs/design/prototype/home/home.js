// elevn home page prototype: one continuous scroll over a fixed canvas.
// The scroll position is the timeline. A list of cues is blended every frame, so the
// story runs forwards and backwards with the scrollbar. Nothing here uses observers.
import * as THREE from 'three';
import { BallEngine, SPEC } from '../ball/ball.js';
import { blitzIcon, draftIcon } from './icons.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && isFinite(parseFloat(q.get(k))) ? parseFloat(q.get(k)) : d);
const STILL = q.get('still') === '1';                       // capture mode: no time-based motion at all
const REDUCED = q.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => window.innerWidth <= 900;

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
//   scrim  strength of the dark wash behind the words
//   idle   1 lets the ball turn on its own (6 degrees a second)
const POSE = {
  hero:   { fit: 350, az: 0,  el: 9,  x: 0.13, y: 0.04, tear: 0,    gap: 0, turn: 0,   focus: 0,     near: 0, scrim: 0.55, idle: 1 },
  close:  { fit: 180, az: 17, el: 14, x: 0.17, y: 0.18, tear: 0.03, gap: 0, turn: 22,  focus: 0,     near: 1, scrim: 1,    idle: 0 },
  close2: { fit: 172, az: 20, el: 15, x: 0.17, y: 0.19, tear: 0.04, gap: 0, turn: 30,  focus: 0,     near: 1, scrim: 1,    idle: 0 },
  apart:  { fit: 500, az: 23, el: 18, x: 0.12, y: 0.02, tear: 1,    gap: 0, turn: 52,  focus: 0,     near: 0, scrim: 0.6,  idle: 0 },
  apart2: { fit: 500, az: 23, el: 18, x: 0.12, y: 0.02, tear: 1,    gap: 0, turn: 58,  focus: 0,     near: 0, scrim: 0.6,  idle: 0 },
  blitz: { fit: 740, az: 23, el: 18, x: 0.19, y: -0.1, tear: 1, gap: 0, turn: 84, focus: 0.3, near: 0, scrim: 0.7, idle: 0 },
  blitz2: { fit: 740, az: 23, el: 18, x: 0.19, y: -0.1, tear: 1, gap: 0, turn: 98, focus: 0.3, near: 0, scrim: 0.7, idle: 0 },
  draft: { fit: 740, az: 23, el: 18, x: 0.19, y: -0.1, tear: 1, gap: 0, turn: 124, focus: -0.1, near: 0, scrim: 0.7, idle: 0 },
  draft2: { fit: 740, az: 23, el: 18, x: 0.19, y: -0.1, tear: 1, gap: 0, turn: 138, focus: -0.1, near: 0, scrim: 0.7, idle: 0 },
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
for (const k in POSE) POSE[k].dy = 0;        // set by layoutTitles: how far the ball moves down to clear its title word
const KEYS = Object.keys(POSE.hero);
// The teardown at its fullest: how far the panels lift (1 is 30 mm) and how far the halves
// part (1 is 60 mm between them).
const TEAR = { explode: num('ex', 0.7), split: num('sp', 2.4) };

function poseAt(p) {
  let i = 0;
  while (i < CUES.length - 2 && p >= CUES[i + 1][0]) i++;
  const [a, A] = CUES[i], [b, B] = CUES[i + 1];
  const t = easeInOut(clamp01((p - a) / (b - a)));
  const out = {};
  for (const k of KEYS) out[k] = lerp(POSE[A][k], POSE[B][k], t);
  return out;
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

let engine;
try {
  engine = new BallEngine(canvas, { variant: 'glass', still: STILL, reducedMotion: REDUCED, pointer: false, pixelRatio: q.has('dpr') ? num('dpr', 1) : undefined });
} catch (e) {
  document.getElementById('err').textContent = String((e && e.stack) || e);
  window.__homeError = String(e);
  throw e;
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
const TITLE = {
  'ELEVN':     { place: 'above',  poses: ['hero', 'end'] },
  'FULL TIME': { place: 'above',  poses: ['close', 'close2'] },
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
  if (narrow()) return;
  const W = window.innerWidth, H = window.innerHeight;
  const edge = Math.max(80, (W - 1440) / 2);                 // the content edge
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
  const W = window.innerWidth;
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
  p: 0, pTarget: 0,          // scroll position, smoothed and raw
  beat: -1,
  idle: 0,                   // degrees the ball has turned on its own
  hold: 0, open: 0,          // the ring (0 to 1) and how far the hold has opened the ball
  holding: false, opened: false,
  studio: { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 },
  last: performance.now(), dirty: true, key: '',
};
const tmp = new THREE.Vector3();
function applyPose(P, open, idleDeg) {
  // the hold opens the ball and pulls the camera round to the three-quarter frame
  const o = easeInOut(clamp01(open));
  const fit = lerp(P.fit, Math.max(P.fit, POSE.open.fit), o);
  const az = rad(lerp(P.az, POSE.open.az, o)), el = rad(lerp(P.el, POSE.open.el, o));
  const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const tear = P.tear;
  engine.setExplode(TEAR.explode * clamp01(tear / 0.45));
  engine.setSplit(Math.max(TEAR.split * easeInOut(clamp01((tear - 0.3) / 0.7)), P.gap || 0, open));
  engine.setTurn(rad((P.turn || 0) + idleDeg));
  // target: the centre, slid along the axis for a half, or pushed out to the surface
  engine.scene.updateMatrixWorld();
  tmp.set(0, (P.focus || 0) * 80, 0);
  engine.spin.localToWorld(tmp);
  const n = (P.near || 0) * R;
  const target = [tmp.x + dir[0] * n, tmp.y + dir[1] * n, tmp.z + dir[2] * n];
  const compact = narrow();
  engine.setCamera({ fit: compact ? fit * 1.25 : fit, dir, target, shift: compact ? [0, -0.17] : [P.x, P.y + (P.dy || 0)] });
}

function setBeat(b) {
  if (b === state.beat) return;
  state.beat = b;
  beats.forEach((el, i) => el.classList.toggle('on', i === b));
  titles.forEach((t) => t.el.classList.toggle('on', t.word === TITLES[b]));
  railDots.forEach((el, i) => { el.classList.toggle('on', i === b); if (i === b) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); });
}

function storyProgress() {
  const range = story.offsetHeight - window.innerHeight;
  return range > 0 ? clamp01(window.scrollY / range) : 0;
}
const canHold = () => !narrow() && (state.p < 0.06 || state.p > 0.975);

function frame(dt, wall = dt) {
  const s = state;
  // scroll, eased a little so a wheel step does not jerk the camera
  if (STILL) s.p = s.pTarget;
  else if (REDUCED || narrow()) s.p = s.pTarget;
  else s.p += (s.pTarget - s.p) * (1 - Math.exp(-dt * 9));
  if (Math.abs(s.pTarget - s.p) < 1e-5) s.p = s.pTarget;

  const beat = beatAt(s.pTarget);
  // Reduced motion and narrow screens: no scrubbed motion, one still pose per beat.
  let P;
  if (narrow()) P = POSE.hero;
  else if (REDUCED) P = poseAt(MARKS[beatAt(s.p)]);
  else P = poseAt(s.p);

  // the hold
  if (!canHold()) { s.holding = false; }
  if (!REDUCED && !STILL) {
    // the ring runs on the wall clock, so it takes 900 ms however slow the frames are
    if (s.holding) { s.hold = Math.min(1, s.hold + wall / 0.9); if (s.hold >= 1) s.opened = true; }
    else { s.hold = Math.max(0, s.hold - wall / 0.25); s.opened = false; }
    const want = s.holding ? (s.opened ? 1 : 0.1 * s.hold) : 0;
    if (want > s.open) s.open = Math.min(want, s.open + dt / 0.55);
    else s.open = Math.max(want, s.open - dt / 0.35);       // release closes it in 350 ms
  }
  // the ball turns on its own in the hero and the end frame only
  if (!REDUCED && !STILL && !narrow() && P.idle > 0.999 && s.open < 0.01 && !s.holding) s.idle += dt * 6;
  let idle = ((s.idle + 180) % 360) - 180;
  idle *= P.idle;

  // the cursor turns the studio light, never the ball
  const st = s.studio;
  if (!REDUCED && !STILL) { st.yaw += (st.tYaw - st.yaw) * 0.06; st.pitch += (st.tPitch - st.pitch) * 0.06; }

  const key = [s.p, s.open, idle, st.yaw.toFixed(4), st.pitch.toFixed(4), beat, window.innerWidth, window.innerHeight].join('|');
  const changed = key !== s.key || s.dirty;
  s.key = key;
  if (changed) {
    applyPose(P, s.open, idle);
    engine.setStudio(st.yaw, st.pitch, true);
    root.style.setProperty('--scrim', P.scrim.toFixed(3));
  }
  setBeat(beat);
  drawIcons(s.p);
  if (changed || s.holding || s.hold > 0) drawRing();
  if (changed) { engine.render(); s.dirty = false; }
  canvas.classList.toggle('can-hold', canHold());
}

function drawRing() {
  const c = engine.project([0, 0, 0]);
  const r = engine.pxPerMm() * (R + 30 * easeInOut(state.open)) + 14;
  const len = 2 * Math.PI * r;
  for (const el of [ring, ringTrack]) { el.setAttribute('cx', c.x); el.setAttribute('cy', c.y); el.setAttribute('r', r); }
  ring.setAttribute('transform', `rotate(-90 ${c.x} ${c.y})`);
  ring.setAttribute('stroke-dasharray', `${len * state.hold} ${len}`);
  overlay.classList.toggle('holding', state.hold > 0.001);
  // the title word steps back while the ball is held open, so the ring and the open ball do not cross it
  titleBox.style.opacity = (1 - clamp01(Math.max(state.hold * 2.5, state.open * 4))).toFixed(3);
  holdBtn.setAttribute('aria-pressed', String(state.opened || (REDUCED && state.open > 0.5)));
}

// ---------------------------------------------------------------- input
function onScroll() {
  state.pTarget = storyProgress();
  root.classList.toggle('past-story', window.scrollY > story.offsetHeight - window.innerHeight * 0.55);
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { layoutTitles(); onScroll(); state.dirty = true; });

// rail and logo: jump to a beat's mark
function goTo(i) {
  const range = story.offsetHeight - window.innerHeight;
  window.scrollTo({ top: MARKS[i] * range, behavior: REDUCED ? 'auto' : 'smooth' });
}
railDots.forEach((a, i) => a.addEventListener('click', (e) => { e.preventDefault(); goTo(i); }));
document.querySelector('.logo').addEventListener('click', (e) => { e.preventDefault(); goTo(0); });

// cursor: 12 degrees of yaw and 6 of pitch at most
window.addEventListener('pointermove', (e) => {
  if (REDUCED || e.pointerType === 'touch') return;
  state.studio.tYaw = rad(12) * ((e.clientX / window.innerWidth) * 2 - 1);
  state.studio.tPitch = rad(6) * ((e.clientY / window.innerHeight) * 2 - 1);
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
  // rendering stops in a hidden tab and once the prizes band has covered the stage
  if (document.hidden || window.scrollY > story.offsetHeight + 40) return;
  if (REDUCED && !narrow()) {
    // crossfade between the stills when the beat changes
    const b = beatAt(storyProgress());
    if (lastBeatShown !== -1 && b !== lastBeatShown) { lastBeatShown = b; state.pTarget = storyProgress(); swapStill(() => {}); return; }
    lastBeatShown = b;
    if (canvas.classList.contains('swap')) return;
  }
  frame(dt, wall);
}

async function start() {
  try { await Promise.all([document.fonts.load('700 100px "Barlow Condensed"'), document.fonts.load('800 60px "Sora"'), document.fonts.ready]); } catch (e) { /* fall back to system fonts */ }
  layoutTitles();
  if (q.has('p')) state.pTarget = clamp01(num('p', 0)); else onScroll();
  state.p = state.pTarget;
  if (q.has('hold')) { state.hold = clamp01(num('hold', 0)); state.open = 0.1 * state.hold; }
  if (q.has('open')) { state.hold = 1; state.opened = true; state.open = clamp01(num('open', 1)); }
  frame(0);
  requestAnimationFrame(() => {
    state.dirty = true; frame(0);
    canvas.classList.add('ready');
    window.__homeReady = true;
    if (!STILL) { state.last = performance.now(); requestAnimationFrame(loop); }
  });
}

// For captures: set the story position (and the hold) and draw that frame now.
window.home = {
  engine, state, POSE, CUES, MARKS, TITLE, ICON_SPAN, layoutTitles, titleReport,
  set(p, hold = 0, open = null) {
    state.pTarget = state.p = clamp01(p);
    state.hold = clamp01(hold); state.opened = open !== null; state.open = open !== null ? open : 0.1 * state.hold;
    state.dirty = true; frame(0);
  },
};
start().catch((e) => { document.getElementById('err').textContent = String((e && e.stack) || e); window.__homeError = String(e); });
