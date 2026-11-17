// The two mode icons: flat SVG, steel rims, glass fill, one gold accent. Each is a function
// of one number, t from 0 to 1, so the scrollbar scrubs it forwards and backwards.
//   Blitz: three fixture cards appear and spread into a row, three players drop into each,
//          a captain is marked in each, then each card's kickoff bar runs out and its lock
//          snaps shut, one card after the other. The cards are HTML like the packs, and
//          share their hover.
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

// ---------------------------------------------------------------- hover, shared by the packs and the fixture cards
// card: the element placed by the scroll; body: the element that lifts and tilts. The row
// carries .live (hover allowed) and .hovering (one card is hot, the others dim).
function hoverable(row, card, body, reduced, onHeat = () => {}) {
  const heat = (on) => {
    if (on && !row.classList.contains('live')) return;
    card.classList.toggle('hot', on);
    row.classList.toggle('hovering', !!row.querySelector('.pack.hot'));
    if (!on) { body.style.removeProperty('--rx'); body.style.removeProperty('--ry'); }
    onHeat(on);
  };
  card.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') heat(true); });
  card.addEventListener('pointerleave', () => { if (document.activeElement !== card) heat(false); });
  card.addEventListener('focus', () => heat(true));
  card.addEventListener('blur', () => heat(false));
  card.addEventListener('pointermove', (e) => {
    if (reduced || !card.classList.contains('hot') || e.pointerType === 'touch') return;
    const b = card.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    body.style.setProperty('--ry', `${(x * 36).toFixed(2)}deg`);
    body.style.setProperty('--rx', `${(-y * 24).toFixed(2)}deg`);
  });
  return () => heat(false);
}
const isReduced = () => new URLSearchParams(location.search).get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

// ---------------------------------------------------------------- the Blitz fixture cards
// Three tall glass cards with a steel rim, the same family as the packs and built the same way:
//   .pack.fx         position in the row, driven by the scroll
//     .pack-body     the hover state (shared with the packs)
//       .pack-art    the card, one SVG: fixture header, kickoff bar, three players, the lock
//       .pack-sheen  the sheen that sweeps across on hover
// Placeholder fixtures only: no club names, no crests.
const KICKOFFS = ['12:30', '15:00', '17:30'];
const FW = 216, FH = 302;                       // the card's own units
function fixtureCard(host, i) {
  const id = `fx${i}`, s = svg(host, id, FW, FH);
  const d = s.querySelector('defs');
  const grad = (name, x2, y2, stops) => {
    const g = el('linearGradient', { id: `${id}-${name}`, x1: 0, y1: 0, x2, y2 }, d);
    stops.forEach(([o, c, a = 1]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g));
  };
  grad('face', 0, 1, [[0, '#23272e'], [0.34, '#14161a'], [1, '#0b0c0f']]);
  grad('streak', 1, 0, [[0, '#ffffff', 0], [0.5, '#ffffff', 0.1], [1, '#ffffff', 0]]);
  grad('head', 0, 1, [[0, '#ffffff', 0.1], [1, '#ffffff', 0]]);
  el('rect', { width: FW, height: FH, rx: 18 }, el('clipPath', { id: `${id}-clip` }, d));
  // the glass: a dark face, a lit header, one diagonal streak
  const face = el('g', { 'clip-path': `url(#${id}-clip)` }, s);
  el('rect', { width: FW, height: FH, fill: `url(#${id}-face)` }, face);
  el('rect', { width: FW, height: 108, fill: `url(#${id}-head)` }, face);
  el('path', { d: 'M96 0H150L26 302H-28Z', fill: `url(#${id}-streak)` }, face);
  el('path', { d: 'M168 0H184L60 302H44Z', fill: `url(#${id}-streak)`, opacity: 0.6 }, face);
  // the pitch behind the squad: halfway line and centre circle, very faint
  const pitch = el('g', { fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.09, 'stroke-width': 1 }, face);
  el('path', { d: 'M0 200H216' }, pitch);
  el('circle', { cx: 108, cy: 200, r: 56 }, pitch);
  el('circle', { cx: 108, cy: 200, r: 2, fill: '#ffffff', 'fill-opacity': 0.14, stroke: 'none' }, pitch);
  // the rim: steel, with a bright copy faded in when the card locks
  el('rect', { x: 5.5, y: 5.5, width: FW - 11, height: FH - 11, rx: 13, fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.07 }, s);
  el('rect', { x: 1, y: 1, width: FW - 2, height: FH - 2, rx: 17, fill: 'none', stroke: `url(#${id}-steel)`, 'stroke-width': 2, 'stroke-opacity': 0.8 }, s);
  const rim = el('rect', { x: 1, y: 1, width: FW - 2, height: FH - 2, rx: 17, fill: 'none', stroke: '#f4f4f1', 'stroke-width': 2.4, opacity: 0 }, s);
  // header: FIXTURE N, the status chip, HOME v AWAY, the kickoff time and its bar
  const text = (x, y, size, str, o = {}) => { const t = el('text', { x, y, 'font-size': size, 'font-weight': 600, fill: '#a4a8af', ...o }, s); t.textContent = str; return t; };
  text(18, 32, 10.5, `FIXTURE ${i + 1}`, { 'letter-spacing': 1.6 });
  const chip = el('rect', { x: 140, y: 17.5, width: 58, height: 21, rx: 10.5, fill: '#f4f4f1', 'fill-opacity': 0, stroke: '#858b95', 'stroke-width': 1 }, s);
  const open = text(169, 31.6, 9.5, 'OPEN', { 'text-anchor': 'middle', 'letter-spacing': 1.3, fill: '#c9ccd1' });
  const shut = text(169, 31.6, 9.5, 'LOCKED', { 'text-anchor': 'middle', 'letter-spacing': 0.8, fill: '#0a0b0d', 'font-weight': 700, opacity: 0 });
  const teams = el('text', { x: 18, y: 75, 'font-family': '"Barlow Condensed", "Arial Narrow", sans-serif', 'font-weight': 700, 'font-size': 38, 'letter-spacing': 0.6, fill: '#f4f4f1' }, s);
  teams.append('HOME ');
  const v = el('tspan', { fill: '#858b95', 'font-size': 25 }, teams); v.textContent = 'v';
  teams.append(' AWAY');
  text(18, 96, 10.5, 'KICKOFF', { 'letter-spacing': 1.6 });
  text(198, 96, 13, KICKOFFS[i], { 'text-anchor': 'end', fill: '#f4f4f1', 'letter-spacing': 0.6 });
  el('rect', { x: 18, y: 106, width: 180, height: 2.4, rx: 1.2, fill: '#ffffff', 'fill-opacity': 0.12 }, s);
  const bar = el('rect', { x: 18, y: 106, width: 180, height: 2.4, rx: 1.2, fill: '#f4f4f1' }, s);
  // the squad: captain on top, two below
  const toks = el('g', {}, s), top = el('g', {}, s);
  const players = [[108, 158, 2.25], [58, 240, 1.9], [158, 240, 1.9]].map(([x, y, sc]) => ({ ...token(toks, id), x, y, sc }));
  const cap = badge(top);
  // the lock, on the card's bottom edge: its shackle stands open until kickoff
  const flash = el('circle', { cx: 108, cy: FH, r: 16, fill: 'none', stroke: '#f4f4f1', 'stroke-width': 1.6, opacity: 0 }, top);
  const lock = el('g', {}, top);
  const disc = el('circle', { r: 9, fill: '#0e1014', stroke: '#c9ccd1', 'stroke-width': 1 }, lock);
  const shackle = el('path', { d: 'M-2.6 -1v-1.8a2.6 2.6 0 0 1 5.2 0v1.8', fill: 'none', stroke: '#f4f4f1', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, lock);
  const block = el('rect', { x: -4, y: -1, width: 8, height: 6, rx: 1.4, fill: '#f4f4f1' }, lock);
  return { rim, chip, open, shut, bar, players, cap, flash, lock, disc, shackle, block };
}

export function blitzIcon(host) {
  const W = 760, H = 350, CY = 14, reduced = isReduced();
  host.classList.add('blitz-icon');
  const row = div('packs'); host.append(row);
  const cards = [0, 1, 2].map((i) => {
    const cx = 380 + (i - 1) * 250;
    const card = div('pack fx'), body = div('pack-body'), art = div('pack-art'), sheen = div('pack-sheen');
    card.tabIndex = -1;
    card.setAttribute('role', 'img'); card.setAttribute('aria-label', `Fixture ${i + 1} of 3: a squad of three with a captain, locked at its ${KICKOFFS[i]} kickoff`);
    const parts = fixtureCard(art, i);
    body.append(art, sheen); card.append(body); row.append(card);
    Object.assign(card.style, { left: `${((cx - FW / 2) / W) * 100}%`, top: `${(CY / H) * 100}%`, width: `${(FW / W) * 100}%` });
    return { ...parts, el: card, cx, cool: hoverable(row, card, body, reduced) };
  });

  return function draw(t) {
    const spread = seg(t, 0.03, 0.15);
    let live = spread > 0.999;
    cards.forEach((c, i) => {
      const a = seg(t, 0.0 + i * 0.015, 0.08 + i * 0.015);
      const st = c.el.style;
      st.setProperty('--tx', `${(((lerp(W / 2, c.cx, spread) - c.cx) / W) * 100).toFixed(3)}cqw`);
      st.setProperty('--ty', `${((14 * (1 - a) / W) * 100).toFixed(3)}cqw`);
      st.setProperty('--rot', `${((i - 1) * 9 * (1 - spread)).toFixed(2)}deg`);
      st.opacity = a.toFixed(3);
      if (a < 0.999) live = false;
      // three players drop in, the captain first
      c.players.forEach((p, j) => {
        const at = 0.18 + i * 0.05 + j * 0.03, o = seg(t, at, at + 0.09);
        set(p.g, p.x, p.y - 16 * (1 - o), p.sc * (0.6 + 0.4 * o), o);
        p.cap.setAttribute('opacity', j === 0 ? seg(t, 0.44 + i * 0.03, 0.52 + i * 0.03) : 0);
      });
      const b = seg(t, 0.48 + i * 0.03, 0.56 + i * 0.03);
      set(c.cap, 108 + 27, 158 - 24, 1.5 * (0.5 + 0.5 * b), b);
      // kickoff: the bar runs out, then the lock snaps shut
      const k0 = 0.64 + i * 0.11, k1 = k0 + 0.045;
      const left = 1 - clamp01((t - 0.52) / (k0 - 0.52));
      const locked = seg(t, k0, k1), snap = clamp01((t - k1) / 0.05);
      c.bar.setAttribute('width', (180 * left).toFixed(2));
      c.rim.setAttribute('opacity', locked.toFixed(3));
      c.chip.setAttribute('fill-opacity', locked.toFixed(3));
      c.chip.setAttribute('stroke', locked > 0.5 ? '#f4f4f1' : '#858b95');
      c.open.setAttribute('opacity', (1 - locked).toFixed(3));
      c.shut.setAttribute('opacity', locked.toFixed(3));
      const up = 1 - locked;
      c.shackle.setAttribute('transform', `rotate(${(-34 * up).toFixed(2)} 2.6 -1) translate(0 ${(-1.9 * up).toFixed(2)})`);
      const on = locked > 0.5;
      c.disc.setAttribute('fill', on ? '#f4f4f1' : '#0e1014');
      c.shackle.setAttribute('stroke', on ? '#0a0b0d' : '#f4f4f1');
      c.block.setAttribute('fill', on ? '#0a0b0d' : '#f4f4f1');
      const pop = 1 + 0.22 * Math.sin(Math.PI * locked);
      const show = seg(t, 0.1 + i * 0.015, 0.16 + i * 0.015);
      set(c.lock, 108, FH, 1.75 * pop * (0.6 + 0.4 * show), show);
      c.flash.setAttribute('r', (16 + 16 * snap).toFixed(2));
      c.flash.setAttribute('opacity', (locked > 0.999 && snap < 1 ? 0.9 * (1 - snap) : 0).toFixed(3));
    });
    // hover once the cards stand in their row
    if (live !== row.classList.contains('live')) {
      row.classList.toggle('live', live);
      cards.forEach((c) => { c.el.tabIndex = live ? 0 : -1; if (!live) c.cool(); });
    }
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
  const pack = div('pack'); pack.tabIndex = -1;
  pack.setAttribute('role', 'img'); pack.setAttribute('aria-label', `Draft pack ${i + 1} of 5: three players`);
  const body = div('pack-body'), art = div('pack-art'), sheen = div('pack-sheen');
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
  // one shared design: art/pack.png is used when there is no art/pack-N.png
  img.onerror = () => { img.onerror = null; img.src = `${ART}pack.png`; };
  img.src = `${ART}pack-${i + 1}.png`;
  const num = document.createElement('span'); num.className = 'pack-num'; num.textContent = `PACK ${i + 1}`;
  body.append(num);

  // hover video: looked for the first time the pack is hovered
  let video = null;
  const wantVideo = () => {
    if (video !== null) return;
    video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' });
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
    let failed = 0;
    for (const [name, ext, type] of [[`pack-${i + 1}-hover`, 'webm', 'video/webm'], [`pack-${i + 1}-hover`, 'mp4', 'video/mp4'], ['pack-hover', 'webm', 'video/webm'], ['pack-hover', 'mp4', 'video/mp4']]) {
      const src = document.createElement('source');
      src.src = `${ART}${name}.${ext}`; src.type = type;
      src.addEventListener('error', () => { if (++failed === 4) { video.remove(); video = false; } });
      video.append(src);
    }
    video.addEventListener('canplay', () => { pack.classList.add('has-video'); if (pack.classList.contains('hot')) video.play().catch(() => {}); }, { once: true });
    body.insertBefore(video, sheen);
  };
  const cool = hoverable(row, pack, body, reduced, (on) => {
    if (on) { wantVideo(); if (video && pack.classList.contains('has-video')) video.play().catch(() => {}); }
    else if (video) { const v = video; setTimeout(() => { if (!pack.classList.contains('hot')) v.pause(); }, 320); }
  });
  return { el: pack, cool };
}

export function draftIcon(host) {
  const id = 'id', W = 760, H = 350, reduced = isReduced();
  host.classList.add('draft-icon');
  const row = div('packs');
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
