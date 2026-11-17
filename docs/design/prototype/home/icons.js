// The two mode icons: flat SVG, steel rims, glass fill, one gold accent. Each is a function
// of one number, t from 0 to 1, so the scrollbar scrubs it forwards and backwards.
//   Blitz: nine players appear, group into three squads of three, a captain is marked in
//          each, then the squads lock one after the other (each at its own kickoff).
//   Draft: five packs appear, each opens on three players, five are chosen, they settle
//          into a five-a-side, the captain is marked, the team locks.
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
function label(parent, x, y, text) {
  const t = el('text', { x, y, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 600, 'letter-spacing': 1.3, fill: '#a4a8af', opacity: 0 }, parent);
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
      dash: el('rect', { x: cx - 43, y: 14, width: 86, height: 96, rx: 14, fill: 'none', stroke: '#858b95', 'stroke-width': 1, 'stroke-dasharray': '3 4' }, boxes),
      solid: el('rect', { x: cx - 43, y: 14, width: 86, height: 96, rx: 14, fill: 'rgba(255,255,255,.04)', stroke: `url(#${id}-steel)`, 'stroke-width': 1.4, opacity: 0 }, boxes),
      label: label(top, cx, 136, `FIXTURE ${g + 1}`),
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

export function draftIcon(host) {
  const id = 'id', s = svg(host, id, 300, 190);
  const pitch = el('g', {}, s), cards = el('g', {}, s), toks = el('g', {}, s), top = el('g', {}, s);
  const dash = el('rect', { x: 10, y: 122, width: 280, height: 62, rx: 14, fill: 'none', stroke: '#858b95', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0 }, pitch);
  const solid = el('rect', { x: 10, y: 122, width: 280, height: 62, rx: 14, fill: 'rgba(255,255,255,.04)', stroke: `url(#${id}-steel)`, 'stroke-width': 1.4, opacity: 0 }, pitch);
  const packs = [0, 1, 2, 3, 4].map((i) => {
    const g = el('g', {}, cards);
    el('rect', { x: -23, y: -32, width: 46, height: 64, rx: 8, fill: '#0e1014' }, g);
    el('rect', { x: -23, y: -32, width: 46, height: 64, rx: 8, fill: `url(#${id}-glass)`, stroke: `url(#${id}-steel)`, 'stroke-width': 1.4 }, g);
    const face = el('g', {}, g);                    // the closed face: two hairlines and the gold dot
    el('path', { d: 'M-13 -20h26M-13 20h26', stroke: '#858b95', 'stroke-width': 1 }, face);
    el('circle', { r: 3.4, fill: '#f2c14e' }, face);
    return { g, face, cx: 38 + i * 56 };
  });
  // five of the fifteen are kept: [pack, place in the pack], left to right
  const chosen = [[0, 0], [0, 2], [1, 1], [3, 0], [4, 2]];
  const roles = ['DEF', 'DEF', 'MID', 'ATT', 'ATT'];
  const CAPTAIN = 2;
  const players = [];
  packs.forEach((p, i) => { for (let j = 0; j < 3; j++) {
    const k = chosen.findIndex((c) => c[0] === i && c[1] === j);
    players.push({ ...token(toks, id), pack: p, k, open: [p.cx + (j - 1) * 14.5, 44 + (j === 1 ? -11 : 6)], row: k < 0 ? null : [46 + k * 52, 146] });
  } });
  const roleText = roles.map((r, k) => label(top, 46 + k * 52, 176, r));
  const cap = badge(top), lock = padlock(top);

  return function draw(t) {
    const spread = seg(t, 0.03, 0.17), picked = seg(t, 0.36, 0.48), down = seg(t, 0.5, 0.72), locked = seg(t, 0.88, 0.97);
    packs.forEach((p, i) => {
      const a = seg(t, 0.0 + i * 0.012, 0.08 + i * 0.012), opened = seg(t, 0.19 + i * 0.015, 0.31 + i * 0.015);
      const x = lerp(150, p.cx, spread);
      p.g.setAttribute('transform', `translate(${x.toFixed(2)} ${(54 + 10 * (1 - a)).toFixed(2)}) rotate(${((i - 2) * 7 * (1 - spread)).toFixed(2)})`);
      p.g.setAttribute('opacity', (a * lerp(1, 0.6, down)).toFixed(3));
      p.face.setAttribute('opacity', 1 - opened);
      p.opened = opened;
    });
    players.forEach((p) => {
      const o = p.pack.opened;
      let x = lerp(p.pack.cx, p.open[0], o), y = lerp(54, p.open[1], o), sc = 0.25 + 0.36 * o, op = o;
      if (p.row) { x = lerp(x, p.row[0], down); y = lerp(y, p.row[1], down); sc = lerp(sc, 1, down); }
      else op *= lerp(1, 0.4, picked);
      set(p.g, x, y, sc * (p.row ? 1 + 0.12 * picked * (1 - down) : 1), op);
      p.cap.setAttribute('opacity', p.k === CAPTAIN ? seg(t, 0.74, 0.82) : 0);
    });
    dash.setAttribute('opacity', seg(t, 0.52, 0.66) * (1 - locked));
    solid.setAttribute('opacity', locked);
    const b = seg(t, 0.77, 0.85);
    set(cap, 46 + CAPTAIN * 52 + 14, 135, 0.5 + 0.5 * b, b);
    set(lock, 290, 153, 0.5 + 0.5 * locked, locked);
    roleText.forEach((r) => r.setAttribute('opacity', seg(t, 0.66, 0.76)));
  };
}
