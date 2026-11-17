// The two mode icons: flat SVG, steel rims, glass fill, one gold accent. Each is a function
// of one number, t from 0 to 1, so the scrollbar scrubs it forwards and backwards.
//   Blitz: nine players appear, group into three squads of three, a captain is marked in
//          each, then the squads lock one after the other (each at its own kickoff).
//   Draft: five foil packs appear and spread into a row, each opens on three players, five
//          are chosen and settle into a five-a-side while the packs close again, the captain
//          is marked, the team locks. The packs are HTML (see packs below), so their artwork
//          can be swapped for images and they can be hovered.
const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
// how far through the window a..b the time t is, eased
const seg = (t, a, b) => ease(clamp01((t - a) / (b - a)));

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.append(n);
  return n;
}
function svg(host, id, w, h) {
  const s = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'presentation', focusable: 'false' }, host);
  const d = el('defs', {}, s);
  const steel = el('linearGradient', { id: `${id}-steel`, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
  el('stop', { offset: 0, 'stop-color': '#f4f4f1' }, steel);
  el('stop', { offset: 0.5, 'stop-color': '#858b95' }, steel);
  el('stop', { offset: 1, 'stop-color': '#c9ccd1' }, steel);
  const glass = el('linearGradient', { id: `${id}-glass`, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
  el('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 0.2 }, glass);
  el('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': 0.04 }, glass);
  return s;
}
const set = (n, x, y, s, o) => { n.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(3)})`); n.setAttribute('opacity', o.toFixed(3)); };

// A player token, drawn at radius 12 about the origin: steel rim, glass fill, a head and
// shoulders. The gold captain face lies on top and is faded in.
function token(parent, id) {
  const g = el('g', {}, parent);
  el('circle', { r: 12, fill: '#0e1014' }, g);
  el('circle', { r: 12, fill: `url(#${id}-glass)`, stroke: `url(#${id}-steel)`, 'stroke-width': 1.4 }, g);
  const body = 'M-6.4 7.6a6.4 5.6 0 0 1 12.8 0z';
  el('circle', { cy: -3.4, r: 3.3, fill: '#c9ccd1' }, g);
  el('path', { d: body, fill: '#c9ccd1' }, g);
  const cap = el('g', { opacity: 0 }, g);
  el('circle', { r: 12.7, fill: '#f2c14e' }, cap);
  el('circle', { cy: -3.4, r: 3.3, fill: '#0a0b0d' }, cap);
  el('path', { d: body, fill: '#0a0b0d' }, cap);
  return { g, cap };
}
// The "x2" tag that sits on a captain's shoulder.
function badge(parent) {
  const g = el('g', { opacity: 0 }, parent);
  el('rect', { x: -10, y: -6.5, width: 20, height: 13, rx: 6.5, fill: '#f2c14e', stroke: '#0a0b0d', 'stroke-width': 1.5 }, g);
  const t = el('text', { y: 3.2, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: '#0a0b0d' }, g);
  t.textContent = '×2';
  return g;
}
function padlock(parent) {
  const g = el('g', { opacity: 0 }, parent);
  el('circle', { r: 9, fill: '#0e1014', stroke: '#c9ccd1', 'stroke-width': 1 }, g);
  el('path', { d: 'M-2.6 -1v-1.8a2.6 2.6 0 0 1 5.2 0v1.8', fill: 'none', stroke: '#f4f4f1', 'stroke-width': 1.3 }, g);
  el('rect', { x: -4, y: -1, width: 8, height: 6, rx: 1.4, fill: '#f4f4f1' }, g);
  return g;
}
function label(parent, x, y, text, size = 8.5) {
  const t = el('text', { x, y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 600, 'letter-spacing': size * 0.15, fill: '#a4a8af', opacity: 0 }, parent);
  t.textContent = text;
  return t;
}

export function blitzIcon(host) {
  const id = 'ib', s = svg(host, id, 300, 150);
  const boxes = el('g', {}, s), toks = el('g', {}, s), top = el('g', {}, s);
  const groups = [0, 1, 2].map((g) => {
    const cx = 52 + g * 98;
    return {
      cx,
      back: el('rect', { x: cx - 43, y: 14, width: 86, height: 96, rx: 14, fill: '#0a0b0d', opacity: 0 }, boxes),   // the ball is behind the icon
      dash: el('rect', { x: cx - 43, y: 14, width: 86, height: 96, rx: 14, fill: 'none', stroke: '#858b95', 'stroke-width': 1, 'stroke-dasharray': '3 4' }, boxes),
      solid: el('rect', { x: cx - 43, y: 14, width: 86, height: 96, rx: 14, fill: 'rgba(255,255,255,.04)', stroke: `url(#${id}-steel)`, 'stroke-width': 1.4, opacity: 0 }, boxes),
      label: label(top, cx, 134, `FIXTURE ${g + 1}`, 6),
    };
  });
  // nine players: column = squad, row = place in the squad (0 is the captain)
  const slots = [[0, 42], [-20, 80], [20, 80]];
  const players = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const t = token(toks, id);
    players.push({ ...t, col, row, from: [150 + (col - 1) * 34, 62 + (row - 1) * 34], to: [groups[col].cx + slots[row][0], slots[row][1]] });
  }
  groups.forEach((g) => { g.badge = badge(top); g.lock = padlock(top); });

  return function draw(t) {
    const grouped = seg(t, 0.2, 0.42);
    players.forEach((p, i) => {
      const a = seg(t, 0.02 + i * 0.012, 0.1 + i * 0.012);
      set(p.g, lerp(p.from[0], p.to[0], grouped), lerp(p.from[1], p.to[1], grouped), 0.6 + 0.4 * a, a);
      p.cap.setAttribute('opacity', p.row === 0 ? seg(t, 0.46 + p.col * 0.03, 0.54 + p.col * 0.03) : 0);
    });
    groups.forEach((g, i) => {
      const locked = seg(t, 0.64 + i * 0.11, 0.72 + i * 0.11);
      g.back.setAttribute('opacity', 0.78 * seg(t, 0.3, 0.42));
      g.dash.setAttribute('opacity', seg(t, 0.3, 0.42) * (1 - locked));
      g.solid.setAttribute('opacity', locked);
      g.label.setAttribute('opacity', seg(t, 0.32, 0.44));
      g.label.setAttribute('fill', locked > 0.5 ? '#f4f4f1' : '#a4a8af');
      const b = seg(t, 0.5 + i * 0.03, 0.58 + i * 0.03);
      set(g.badge, g.cx + 14, 31, 0.5 + 0.5 * b, b);
      set(g.lock, g.cx, 110, 0.5 + 0.5 * locked, locked);
    });
  };
}

// ---------------------------------------------------------------- the Draft packs
// Each pack is a layered HTML element, so its artwork can be swapped without touching code:
//   .pack            position in the row, driven by the scroll (CSS variables)
//     .pack-body     the hover state: lift, 3D tilt towards the cursor, gold rim glow
//       .pack-art    art/pack-N.png if that file exists, else the foil pack drawn below
//       video        art/pack-N-hover.webm or .mp4 if one exists: cross-faded in on hover
//       .pack-sheen  the foil sheen that sweeps across on hover
// The drawn pack: 200 x 300, crimped top and bottom, brushed foil, one diagonal swoosh,
// the elevn. wordmark, DRAFT and PACK N. Three tones of the same night and steel.
const ART = 'art/';
const TONES = {
  night: { body: ['#0c0d10', '#262a31', '#0f1114', '#2c3038', '#0a0b0d'], swoosh: ['#f4f4f1', '#c9ccd1', '#858b95'], ink: '#f4f4f1', sub: '#c9ccd1' },
  smoke: { body: ['#1a1d22', '#454a53', '#1e2126', '#565c66', '#16181c'], swoosh: ['#f4f4f1', '#c9ccd1', '#858b95'], ink: '#f4f4f1', sub: '#c9ccd1' },
  steel: { body: ['#5b616b', '#c9ccd1', '#767c86', '#e4e5e3', '#5b616b'], swoosh: ['#23262c', '#0e1014', '#0a0b0d'], ink: '#0a0b0d', sub: '#23262c' },
};
const PACK_TONES = ['night', 'smoke', 'steel', 'smoke', 'night'];
// the outline: straight sides, saw-tooth sealed edges top and bottom (20 teeth, 5 deep)
const CRIMP = (() => {
  const top = [], bottom = [];
  for (let k = 0; k <= 40; k++) { top.push([k * 5, k % 2 ? 0 : 5]); bottom.push([200 - k * 5, k % 2 ? 300 : 295]); }
  return [...top, ...bottom];
})();
const CRIMP_SVG = CRIMP.map((p) => p.join(',')).join(' ');
const CRIMP_CSS = `polygon(${CRIMP.map(([x, y]) => `${x / 2}% ${(y / 3).toFixed(2)}%`).join(',')})`;

function packArt(host, i) {
  const id = `pk${i}`, tone = TONES[PACK_TONES[i]];
  const s = el('svg', { viewBox: '0 0 200 300', role: 'presentation', focusable: 'false' }, host);
  const d = el('defs', {}, s);
  el('polygon', { points: CRIMP_SVG }, el('clipPath', { id: `${id}-clip` }, d));
  const grad = (name, x2, y2, stops) => {
    const g = el('linearGradient', { id: `${id}-${name}`, x1: 0, y1: 0, x2, y2 }, d);
    stops.forEach(([o, c, a = 1]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g));
  };
  grad('body', 1, 0, [[0, tone.body[0]], [0.24, tone.body[1]], [0.5, tone.body[2]], [0.8, tone.body[3]], [1, tone.body[4]]]);
  grad('swoosh', 1, 1, [[0, tone.swoosh[0]], [0.5, tone.swoosh[1]], [1, tone.swoosh[2]]]);
  grad('fall', 0, 1, [[0, '#ffffff', 0.16], [0.3, '#ffffff', 0], [0.7, '#000000', 0], [1, '#000000', 0.42]]);
  grad('edge', 1, 0, [[0, '#ffffff', 0.3], [0.07, '#ffffff', 0], [0.92, '#000000', 0], [1, '#000000', 0.45]]);
  grad('rim', 0, 1, [[0, '#f4f4f1'], [0.5, '#858b95'], [1, '#c9ccd1']]);
  // brushed foil: fine horizontal streaks
  const f = el('filter', { id: `${id}-brush`, x: 0, y: 0, width: 1, height: 1 }, d);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.008 0.85', numOctaves: 2, seed: 3 + i }, f);
  el('feColorMatrix', { values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -0.55' }, f);
  const ridges = el('pattern', { id: `${id}-ridge`, width: 5, height: 24, patternUnits: 'userSpaceOnUse' }, d);
  el('rect', { width: 5, height: 24, fill: 'rgba(0,0,0,.34)' }, ridges);
  el('rect', { x: 0, width: 1.6, height: 24, fill: 'rgba(255,255,255,.2)' }, ridges);

  const g = el('g', { 'clip-path': `url(#${id}-clip)` }, s);
  el('rect', { width: 200, height: 300, fill: `url(#${id}-body)` }, g);
  el('rect', { width: 200, height: 300, filter: `url(#${id}-brush)`, opacity: 0.2 }, g);
  // the pack's number, very large and outlined, behind the swoosh
  const big = el('text', { x: 100, y: 222, 'text-anchor': 'middle', 'font-family': '"Barlow Condensed", sans-serif', 'font-weight': 700, 'font-size': 250,
    fill: 'none', stroke: tone.ink, 'stroke-opacity': 0.26, 'stroke-width': 1.4 }, g);
  big.textContent = i + 1;
  // the swoosh: one bold band from lower left to upper right, a thin echo above, a gold hairline below
  const sw = el('g', { transform: 'translate(0 -42)' }, g);
  el('path', { d: 'M-10 208C52 190 128 126 210 14L210 26C132 134 56 196-10 218Z', fill: `url(#${id}-swoosh)`, opacity: 0.55 }, sw);
  el('path', { d: 'M-10 232C54 214 132 150 210 42L210 112C142 192 62 250-10 274Z', fill: `url(#${id}-swoosh)` }, sw);
  el('path', { d: 'M-10 284C64 258 144 198 210 122', fill: 'none', stroke: '#f2c14e', 'stroke-width': 2.2 }, sw);
  el('rect', { width: 200, height: 300, fill: `url(#${id}-fall)` }, g);
  // the wordmark, top left
  const wm = el('text', { x: 17, y: 62, 'font-family': '"Sora", sans-serif', 'font-weight': 800, 'font-size': 29, 'letter-spacing': -1.2, fill: tone.ink }, g);
  wm.textContent = 'elevn';
  el('circle', { cx: 101.5, cy: 59, r: 3.6, fill: '#f2c14e' }, g);
  // DRAFT and the pack's number, bottom right
  const mode = el('text', { x: 185, y: 250, 'text-anchor': 'end', 'font-family': '"Barlow Condensed", sans-serif', 'font-weight': 700, 'font-size': 47, 'letter-spacing': 1.5, fill: tone.ink }, g);
  mode.textContent = 'DRAFT';
  const no = el('text', { x: 184, y: 270, 'text-anchor': 'end', 'font-family': '"Barlow Condensed", sans-serif', 'font-weight': 700, 'font-size': 15.5, 'letter-spacing': 3.2, fill: tone.sub }, g);
  no.textContent = `PACK ${i + 1}`;
  // sealed edges: a ridged strip top and bottom, with the seal line
  for (const y of [0, 276]) el('rect', { x: 0, y, width: 200, height: 24, fill: `url(#${id}-ridge)` }, g);
  el('path', { d: 'M0 24.5H200M0 275.5H200', stroke: 'rgba(255,255,255,.3)', 'stroke-width': 1 }, g);
  el('path', { d: 'M0 25.5H200M0 274.5H200', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1 }, g);
  el('rect', { width: 200, height: 300, fill: `url(#${id}-edge)` }, g);
  el('polygon', { points: CRIMP_SVG, fill: 'none', stroke: `url(#${id}-rim)`, 'stroke-width': 1.2, 'stroke-opacity': 0.7 }, s);
  return s;
}

function buildPack(row, i, reduced) {
  const pack = document.createElement('div');
  pack.className = 'pack'; pack.tabIndex = -1;
  pack.setAttribute('role', 'img'); pack.setAttribute('aria-label', `Draft pack ${i + 1} of 5: three players`);
  const body = document.createElement('div'); body.className = 'pack-body';
  const art = document.createElement('div'); art.className = 'pack-art';
  const sheen = document.createElement('div'); sheen.className = 'pack-sheen';
  body.style.setProperty('--shape', CRIMP_CSS);
  packArt(art, i);
  body.append(art, sheen); pack.append(body); row.append(pack);

  // artwork: use art/pack-N.png when it is there
  const img = new Image();
  img.alt = ''; img.decoding = 'async'; img.draggable = false;
  img.onload = () => {
    art.replaceChildren(img); pack.classList.add('has-art');
    body.style.setProperty('--shape', 'none');
    body.style.setProperty('--mask', `url("${img.src}")`);
  };
  img.src = `${ART}pack-${i + 1}.png`;

  // hover video: looked for the first time the pack is hovered
  let video = null;
  const wantVideo = () => {
    if (video !== null) return;
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' });
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    let failed = 0;
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const src = document.createElement('source');
      src.src = `${ART}pack-${i + 1}-hover.${ext}`; src.type = type;
      src.addEventListener('error', () => { if (++failed === 2) { video.remove(); video = false; } });
      video.append(src);
    }
    video.addEventListener('canplay', () => { pack.classList.add('has-video'); if (pack.classList.contains('hot')) video.play().catch(() => {}); }, { once: true });
    body.insertBefore(video, sheen);
  };
  const heat = (on) => {
    if (on && !row.classList.contains('live')) return;
    pack.classList.toggle('hot', on);
    row.classList.toggle('hovering', !!row.querySelector('.pack.hot'));
    if (on) { wantVideo(); if (video && pack.classList.contains('has-video')) video.play().catch(() => {}); }
    else {
      body.style.removeProperty('--rx'); body.style.removeProperty('--ry');
      if (video) { const v = video; setTimeout(() => { if (!pack.classList.contains('hot')) v.pause(); }, 320); }
    }
  };
  pack.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') heat(true); });
  pack.addEventListener('pointerleave', () => { if (document.activeElement !== pack) heat(false); });
  pack.addEventListener('focus', () => heat(true));
  pack.addEventListener('blur', () => heat(false));
  pack.addEventListener('pointermove', (e) => {
    if (reduced || !pack.classList.contains('hot') || e.pointerType === 'touch') return;
    const b = pack.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    body.style.setProperty('--ry', `${(x * 36).toFixed(2)}deg`);
    body.style.setProperty('--rx', `${(-y * 24).toFixed(2)}deg`);
  });
  return { el: pack, cool: () => heat(false) };
}

export function draftIcon(host) {
  const id = 'id', W = 760, H = 350;
  const reduced = new URLSearchParams(location.search).get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  host.classList.add('draft-icon');
  const row = document.createElement('div'); row.className = 'packs';
  host.append(row);
  const s = svg(host, id, W, H);
  const pitch = el('g', {}, s), toks = el('g', {}, s), top = el('g', {}, s);
  const BOX = { x: 8, y: 240, w: 744, h: 100 };
  const dash = el('rect', { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h, rx: 20, fill: 'none', stroke: '#858b95', 'stroke-width': 1.2, 'stroke-dasharray': '4 5', opacity: 0 }, pitch);
  const solid = el('rect', { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h, rx: 20, fill: 'rgba(255,255,255,.04)', stroke: `url(#${id}-steel)`, 'stroke-width': 1.6, opacity: 0 }, pitch);
  // five packs, 132 x 198, standing in a row
  const PW = 132, PH = 198, PY = 14;
  const packs = [0, 1, 2, 3, 4].map((i) => {
    const cx = 74 + i * 153;
    const p = buildPack(row, i, reduced);
    Object.assign(p.el.style, { left: `${((cx - PW / 2) / W) * 100}%`, top: `${(PY / H) * 100}%`, width: `${(PW / W) * 100}%` });
    return { ...p, cx, cy: PY + PH / 2 };
  });
  // five of the fifteen are kept: [pack, place in the pack], left to right
  const chosen = [[0, 0], [0, 2], [1, 1], [3, 0], [4, 2]];
  const roles = ['DEF', 'DEF', 'MID', 'ATT', 'ATT'];
  const CAPTAIN = 2, ROW_Y = 280, rowX = (k) => 110 + k * 135;
  const players = [];
  packs.forEach((p, i) => { for (let j = 0; j < 3; j++) {
    const k = chosen.findIndex((c) => c[0] === i && c[1] === j);
    players.push({ ...token(toks, id), pack: p, k, open: [p.cx + (j === 0 ? 0 : j === 1 ? -31 : 31), p.cy + (j === 0 ? -34 : 30)], row: k < 0 ? null : [rowX(k), ROW_Y] });
  } });
  const roleText = roles.map((r, k) => label(top, rowX(k), 326, r, 11));
  const cap = badge(top), lock = padlock(top);

  return function draw(t) {
    const spread = seg(t, 0.03, 0.15), picked = seg(t, 0.38, 0.48), down = seg(t, 0.5, 0.68), shut = seg(t, 0.58, 0.72), locked = seg(t, 0.88, 0.97);
    let live = spread > 0.999;
    packs.forEach((p, i) => {
      const a = seg(t, 0.0 + i * 0.012, 0.08 + i * 0.012);
      p.out = seg(t, 0.21 + i * 0.015, 0.33 + i * 0.015);          // its three players are out
      const open = p.out * (1 - shut);                             // and the pack is dimmed behind them
      const st = p.el.style;
      st.setProperty('--tx', `${(((lerp(W / 2, p.cx, spread) - p.cx) / W) * 100).toFixed(3)}cqw`);
      st.setProperty('--ty', `${((12 * (1 - a) / W) * 100).toFixed(3)}cqw`);
      st.setProperty('--rot', `${((i - 2) * 7 * (1 - spread)).toFixed(2)}deg`);
      st.setProperty('--open', open.toFixed(3));
      st.opacity = a.toFixed(3);
      if (open > 0.01 || a < 0.999) live = false;
    });
    // hover only while the packs stand closed in their row
    if (live !== row.classList.contains('live')) {
      row.classList.toggle('live', live);
      packs.forEach((p) => { p.el.tabIndex = live ? 0 : -1; if (!live) p.cool(); });
    }
    players.forEach((p) => {
      const o = p.pack.out;
      let x = lerp(p.pack.cx, p.open[0], o), y = lerp(p.pack.cy, p.open[1], o), sc = 0.5 + 1.2 * o, op = o;
      if (p.row) { x = lerp(x, p.row[0], down); y = lerp(y, p.row[1], down); sc = lerp(sc, 2, down); sc *= 1 + 0.12 * picked * (1 - down); }
      else op *= lerp(1, 0.4, picked) * (1 - shut);                // the ten not chosen go back in
      set(p.g, x, y, sc, op);
      p.cap.setAttribute('opacity', p.k === CAPTAIN ? seg(t, 0.74, 0.82) : 0);
    });
    dash.setAttribute('opacity', seg(t, 0.52, 0.66) * (1 - locked));
    solid.setAttribute('opacity', locked);
    const b = seg(t, 0.77, 0.85);
    set(cap, rowX(CAPTAIN) + 27, ROW_Y - 22, 0.8 + 0.8 * b, b);
    set(lock, BOX.x + BOX.w, BOX.y + BOX.h / 2, 0.8 + 0.8 * locked, locked);
    roleText.forEach((r) => r.setAttribute('opacity', seg(t, 0.66, 0.76)));
  };
}
