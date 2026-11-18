// elevn match ball: geometry, materials and studio, all made in code at start-up.
// One scene unit is 1 mm. No model files, no image files, no HDRIs.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ---------------------------------------------------------------- numbers
export const SPEC = {
  radius: 110,          // ball is 220 across
  panelThickness: 6,
  seam: 1.5,            // gap between neighbouring panels
  bevel: 0.9,           // polished edge (spec says 0.6; see README)
  cornerRadius: 2.2,    // panel corners are slightly rounded
  linerRadius: 103,
  linerThickness: 2,
  flangeInner: 86,      // the flat rim each half shows to the other
  coreRadius: 32,       // 64 across
  studRadius: 5,        // 10 across
  studProud: 2,
  splitTravel: 30,      // each half moves 30, so 60 apart when open
  explodeLift: 30,      // spec says 6; 30 reads as an exploded view (see README)
  bezelWidth: 5.5,      // glass variant: steel frame around each pane
  bg: 0x0a0b0d,
  gold: 0xf2c14e,
};

const FACE = 0, EDGE = 1;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);

// ---------------------------------------------------------------- solid
// Truncated icosahedron: 12 pentagons and 20 hexagons, every vertex on the sphere.
function truncatedIcosahedron(R) {
  const p = (1 + Math.sqrt(5)) / 2;
  const V = [[0, 1, p], [0, -1, p], [0, 1, -p], [0, -1, -p], [1, p, 0], [-1, p, 0],
    [1, -p, 0], [-1, -p, 0], [p, 0, 1], [p, 0, -1], [-p, 0, 1], [-p, 0, -1]]
    .map((v) => new THREE.Vector3(...v));
  // Put one icosahedron vertex on +Y so a pentagon sits on each pole.
  const q = new THREE.Quaternion().setFromUnitVectors(V[0].clone().normalize(), new THREE.Vector3(0, 1, 0));
  V.forEach((v) => v.applyQuaternion(q));
  const adj = (a, b) => Math.abs(V[a].distanceTo(V[b]) - 2) < 1e-6;
  const third = (a, b) => V[a].clone().multiplyScalar(2 / 3).addScaledVector(V[b], 1 / 3);
  const polys = [];
  for (let i = 0; i < 12; i++) {
    const pts = [];
    for (let j = 0; j < 12; j++) if (j !== i && adj(i, j)) pts.push(third(i, j));
    polys.push(pts);
  }
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
    if (adj(a, b) && adj(b, c) && adj(a, c)) {
      polys.push([third(a, b), third(b, a), third(b, c), third(c, b), third(c, a), third(a, c)]);
    }
  }
  const scale = R / polys[0][0].length();
  return polys.map((pts) => {
    pts.forEach((v) => v.multiplyScalar(scale));
    const c = pts.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const n = c.clone().normalize();
    const X = pts[0].clone().sub(c).normalize();
    const Y = new THREE.Vector3().crossVectors(n, X);
    pts.sort((u, v) => {
      const au = Math.atan2(u.clone().sub(c).dot(Y), u.clone().sub(c).dot(X));
      const av = Math.atan2(v.clone().sub(c).dot(Y), v.clone().sub(c).dot(X));
      return ((au + TAU) % TAU) - ((av + TAU) % TAU);
    });
    return { n: pts.length, verts: pts, centre: c, normal: n, X, Y, h: c.length(), rc: pts[0].distanceTo(c) };
  });
}

// Regular n-gon outline with rounded corners, counter-clockwise, first corner on +X.
function outline(n, rc, cr, segEdge, segCorner) {
  const out = [];
  const half = Math.PI / n;
  const cd = rc - cr / Math.cos(half); // distance of the corner-arc centre from the middle
  const corner = (k, j) => {
    const a = (k * TAU) / n;
    const b = a - half + (j / segCorner) * 2 * half;
    return [cd * Math.cos(a) + cr * Math.cos(b), cd * Math.sin(a) + cr * Math.sin(b)];
  };
  for (let k = 0; k < n; k++) {
    for (let j = 0; j <= segCorner; j++) out.push(corner(k, j));
    const a = corner(k, segCorner), b = corner((k + 1) % n, 0);
    for (let j = 1; j < segEdge; j++) {
      const t = j / segEdge;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Sweeps the outline through a list of rings {d: inset from the raw face edge in mm,
// r: distance from the ball centre, g: material group of the strip that starts here}
// and pushes every vertex onto its sphere, so the panel is curved, not flat.
// Strips run "outward then down", which with a counter-clockwise outline gives
// outward-facing triangles all the way round the section.
// 6 steps along an edge keep it within 0.07 mm of its sphere (under a pixel in the close-up);
// 3 round each corner.
function sweepPanel(face, rings, { capStart = null, capEnd = null, closed = false, segEdge = 6, segCorner = 3 } = {}) {
  const { n, rc, h } = face;
  const ap = rc * Math.cos(Math.PI / n);
  const base = outline(n, rc, SPEC.cornerRadius, segEdge, segCorner);
  const m = base.length;
  const pos = [], uv = [], start = [];
  const tris = [[], []];
  const put = (x, y, r) => {
    const l = Math.hypot(x, y, h);
    pos.push((x / l) * r, (y / l) * r, (h / l) * r);
    uv.push(x / (2 * rc) + 0.5, y / (2 * rc) + 0.5);
    return pos.length / 3 - 1;
  };
  for (const ring of rings) {
    const s = (ap - ring.d) / ap;
    start.push(pos.length / 3);
    for (const p of base) put(p[0] * s, p[1] * s, ring.r);
  }
  const strips = closed ? rings.length : rings.length - 1;
  for (let k = 0; k < strips; k++) {
    const k2 = (k + 1) % rings.length;
    for (let i = 0; i < m; i++) {
      const i2 = (i + 1) % m;
      const a = start[k] + i, b = start[k2] + i, c = start[k2] + i2, d = start[k] + i2;
      tris[rings[k].g].push(a, b, c, a, c, d);
    }
  }
  if (capStart !== null) {
    const c0 = put(0, 0, rings[0].r);
    for (let i = 0; i < m; i++) tris[capStart].push(c0, start[0] + i, start[0] + ((i + 1) % m));
  }
  if (capEnd !== null) {
    const last = rings.length - 1;
    const c1 = put(0, 0, rings[last].r);
    for (let i = 0; i < m; i++) tris[capEnd].push(start[last] + i, c1, start[last] + ((i + 1) % m));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...tris[0], ...tris[1]]);
  g.addGroup(0, tris[0].length, FACE);
  g.addGroup(tris[0].length, tris[1].length, EDGE);
  g.computeVertexNormals();
  return g;
}

// A solid curved panel: satin face, rounded polished bevel, radial side wall, back face.
function solidPanel(face, { R, T, inset, bevel, topRings = 5, backRings = 2, backBevel = 0.3 }) {
  const ap = face.rc * Math.cos(Math.PI / face.n);
  const rings = [];
  const dTop = inset + bevel;
  for (let k = 1; k <= topRings; k++) rings.push({ d: ap - ((ap - dTop) * k) / topRings, r: R, g: k < topRings ? FACE : EDGE });
  const nb = 3;
  for (let j = 1; j <= nb; j++) {
    const a = (j / nb) * Math.PI / 2;
    rings.push({ d: inset + bevel * (1 - Math.sin(a)), r: R - bevel * (1 - Math.cos(a)), g: EDGE });
  }
  rings.push({ d: inset, r: R - T + backBevel, g: EDGE });
  rings.push({ d: inset + backBevel, r: R - T, g: FACE });
  for (let k = backRings; k >= 1; k--) rings.push({ d: ap - ((ap - inset - backBevel) * k) / (backRings + 1), r: R - T, g: FACE });
  return sweepPanel(face, rings, { capStart: FACE, capEnd: FACE });
}

// A frame (bezel) that follows the panel outline: used by the glass variant.
function bezelPanel(face, { R, T, inset, width, bevel }) {
  const rings = [];
  const w = inset + width;
  rings.push({ d: w - bevel, r: R, g: FACE });
  rings.push({ d: (w + inset) / 2, r: R, g: FACE });
  rings.push({ d: inset + bevel, r: R, g: EDGE });
  const nb = 3;
  for (let j = 1; j <= nb; j++) {
    const a = (j / nb) * Math.PI / 2;
    rings.push({ d: inset + bevel * (1 - Math.sin(a)), r: R - bevel * (1 - Math.cos(a)), g: EDGE });
  }
  rings.push({ d: inset, r: R - T, g: EDGE });
  rings.push({ d: w, r: R - T, g: EDGE });
  rings.push({ d: w, r: R - bevel, g: EDGE });
  for (let j = 1; j < nb; j++) {
    const a = (j / nb) * Math.PI / 2;
    rings.push({ d: w - bevel * (1 - Math.cos(a)), r: R - bevel + bevel * Math.sin(a), g: EDGE });
  }
  return sweepPanel(face, rings, { closed: true });
}

// Our own lathe. Each piece is a polyline in (radius, height); pieces do not share
// vertices, so corners between them stay crisp. The outward side is to the right of
// the direction of travel, and the winding is checked and flipped if it comes out
// wrong (the guide's "round parts inside out" bug).
function lathe(pieces, seg = 96) {
  const pos = [];
  const tris = [[], []];
  for (const piece of pieces) {
    const base = pos.length / 3;
    const pts = piece.pts;
    for (const [x, y] of pts) for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      pos.push(x * Math.cos(a), y, x * Math.sin(a));
    }
    const local = [];
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = base + i * seg + j, b = base + (i + 1) * seg + j, c = base + (i + 1) * seg + j2, d = base + i * seg + j2;
      if (pts[i][0] > 1e-6) local.push(a, b, d);
      if (pts[i + 1][0] > 1e-6) local.push(b, c, d);
    }
    // orientation check on the first triangle against the right-of-travel normal
    const v = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    let flip = false;
    for (let t = 0; t < local.length; t += 3) {
      const A = v(local[t]), B = v(local[t + 1]), C = v(local[t + 2]);
      const nrm = B.clone().sub(A).cross(C.clone().sub(A));
      if (nrm.lengthSq() < 1e-9) continue;
      const mid = A.clone().add(B).add(C).multiplyScalar(1 / 3);
      const ang = Math.atan2(mid.z, mid.x);
      // find the profile segment this triangle belongs to
      const i = Math.floor((local[t] - base) / seg);
      const i1 = Math.min(i + 1, pts.length - 1);
      const dx = pts[i1][0] - pts[i][0], dy = pts[i1][1] - pts[i][1];
      const want = new THREE.Vector3(dy * Math.cos(ang), -dx, dy * Math.sin(ang));
      flip = nrm.dot(want) < 0;
      break;
    }
    if (flip) for (let t = 0; t < local.length; t += 3) { const s = local[t + 1]; local[t + 1] = local[t + 2]; local[t + 2] = s; }
    tris[piece.g].push(...local);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([...tris[0], ...tris[1]]);
  g.addGroup(0, tris[0].length, FACE);
  g.addGroup(tris[0].length, tris[1].length, EDGE);
  g.computeVertexNormals();
  return g;
}

const arc = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [Math.max(0, r * Math.cos(a)), r * Math.sin(a)];
});

// The liner of one half (drawn for the +Y half; the other is this turned over).
function linerGeometry(withDome) {
  const Ro = SPEC.linerRadius, Ri = Ro - SPEC.linerThickness, f = SPEC.flangeInner, t = SPEC.linerThickness;
  const pieces = [];
  if (withDome) {
    pieces.push({ g: FACE, pts: arc(Ro, 0, Math.PI / 2, 40) });
    pieces.push({ g: FACE, pts: arc(Ri, Math.PI / 2, Math.asin(t / Ri), 40) });
    pieces.push({ g: FACE, pts: [[Math.sqrt(Ri * Ri - t * t), t], [f, t]] });
  } else {
    pieces.push({ g: EDGE, pts: [[Ro, 0], [Ro, t]] });
    pieces.push({ g: FACE, pts: [[Ro, t], [f, t]] });
  }
  pieces.push({ g: EDGE, pts: [[f, t], [f, 0]] });
  pieces.push({ g: FACE, pts: [[f, 0], [Ro - 1.6, 0]] });
  pieces.push({ g: EDGE, pts: [[Ro - 1.6, 0], [Ro, 0]] });
  return lathe(pieces, 128);
}

function studGeometry() {
  const r = SPEC.studRadius, p = SPEC.studProud;
  const pts = [[r, 0], [r, p * 0.35]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * Math.PI / 2;
    pts.push([Math.max(0, r * Math.cos(a)), p * 0.35 + p * 0.65 * Math.sin(a)]);
  }
  return lathe([{ g: FACE, pts }], 32);
}

// ---------------------------------------------------------------- textures made in code
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Sunray brushing: fine streaks running from the panel centre outward.
function brushedTexture(size = 1024) {
  const rnd = rng(7);
  const M = 4096;
  const A = Float32Array.from({ length: M }, () => rnd());
  const B = Float32Array.from({ length: M }, () => rnd());
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
    const th = (Math.atan2(dy, dx) / TAU + 0.5), rho = Math.hypot(dx, dy);
    const fine = A[Math.floor(th * M) % M];
    const mid = B[Math.floor(th * 700 + rho * 0.006) % M];
    const coarse = B[(Math.floor(th * 150) + 900) % M];
    let v = 0.46 * fine + 0.36 * mid + 0.18 * coarse;
    v = 0.72 + 0.28 * v;                      // roughness multiplier, 0.72 to 1
    const b = Math.round(v * 255), i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = b; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// Direction map for the anisotropic highlight. Radial grooves stretch the highlight
// across the grooves, so the direction stored is the tangent of a circle round the
// panel centre. Blue is the strength, eased to zero at the centre where it is undefined.
function directionTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
    const l = Math.hypot(dx, dy) || 1;
    const tx = -dy / l, ty = dx / l;
    const i = (y * size + x) * 4;
    data[i] = Math.round((tx * 0.5 + 0.5) * 255);
    data[i + 1] = Math.round((ty * 0.5 + 0.5) * 255);
    data[i + 2] = Math.round(clamp01(l / (size * 0.16)) * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// Ripple normal map for the wet ground the studio stands on.
function rippleNormalTexture(size = 256) {
  const rnd = rng(21);
  const waves = Array.from({ length: 14 }, () => ({
    kx: Math.round((rnd() - 0.5) * 14), ky: Math.round((rnd() - 0.5) * 14), ph: rnd() * TAU, a: 0.4 + rnd() * 0.6,
  }));
  const hgt = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(TAU * (w.kx * x + w.ky * y) + w.ph), 0);
  const data = new Uint8Array(size * size * 4);
  const e = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const nx = (hgt(u - e, v) - hgt(u + e, v)) * 0.9, ny = (hgt(u, v - e) - hgt(u, v + e)) * 0.9;
    const l = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
    data[i] = Math.round((nx / l * 0.5 + 0.5) * 255);
    data[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- studio
// A light panel: bright in the middle, a soft edge, optional dark dividers so the
// reflection reads as a softbox and not as a white rectangle.
function lightPanel(w, h, position, color, intensity, { bars = 0, soft = 0.06 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uBars: { value: bars }, uSoft: { value: soft }, uAspect: { value: w / h } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv; uniform vec3 uColor; uniform float uBars; uniform float uSoft; uniform float uAspect;
      void main(){
        vec2 e = min(vUv, 1.0 - vUv) * vec2(uAspect, 1.0);
        float edge = smoothstep(0.0, uSoft, min(e.x, e.y));
        float fall = 0.72 + 0.28 * (1.0 - length(vUv - 0.5) * 1.3);
        float bar = 1.0;
        if (uBars > 0.5) {
          vec2 c = abs(fract(vUv * vec2(uBars, max(1.0, uBars - 1.0))) - 0.5);
          float gx = smoothstep(0.0, 0.012, 0.5 - c.x), gy = smoothstep(0.0, 0.016, 0.5 - c.y);
          bar = mix(0.12, 1.0, gx * gy);
        }
        gl_FragColor = vec4(uColor * edge * fall * bar, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.copy(position);
  m.lookAt(0, 0, 0);
  return m;
}

function buildStudio(renderer, look) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  // a very dim dome so metal that sees no panel is near-black, not dead black
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTop: { value: new THREE.Color(look.domeTop) }, uLow: { value: new THREE.Color(look.domeLow) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 uTop; uniform vec3 uLow; void main(){ gl_FragColor = vec4(mix(uLow, uTop, smoothstep(-0.2, 0.9, vP.y)), 1.0); }',
  }));
  s.add(dome);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const panels = new THREE.Group();
  for (const p of look.panels) panels.add(lightPanel(p.w, p.h, V(...p.pos), p.color, p.intensity, p));
  s.add(panels);
  // pass 1: panels only, so the wet ground has something to reflect
  const first = pmrem.fromScene(s, 0, 1, 10000, { size: 256 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({
    color: 0x05060a, metalness: 0.0, roughness: 0.12, envMap: first.texture, envMapIntensity: look.groundReflect,
    normalMap: rippleNormalTexture(), normalScale: new THREE.Vector2(0.35, 0.35),
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -125;
  s.add(ground);
  const rt = pmrem.fromScene(s, 0, 1, 10000, { size: look.envSize });
  first.dispose(); pmrem.dispose();
  s.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return rt.texture;
}

// ---------------------------------------------------------------- look (all the tunable art direction in one place)
const LOOK = {
  exposure: 1.0,
  envIntensity: 1.0,
  envSize: 1024,
  domeTop: 0x0b0c0f, domeLow: 0x020203,
  groundReflect: 2.2,
  panels: [
    // the spec's three, then two helpers (see README, "Where this departs from the spec")
    { name: 'key', w: 600, h: 400, pos: [350, 400, 300], color: 0xfff6ea, intensity: 9, bars: 3, soft: 0.05 },
    { name: 'strip-left', w: 80, h: 900, pos: [-420, 100, 150], color: 0xdfe9ff, intensity: 12, soft: 0.2 },
    { name: 'strip-back', w: 80, h: 900, pos: [300, 150, -400], color: 0xeaf0ff, intensity: 10, soft: 0.2 },
    { name: 'rim-back-left', w: 90, h: 800, pos: [-380, 220, -420], color: 0xeaf0ff, intensity: 11, soft: 0.2 },
    { name: 'fill-low', w: 700, h: 120, pos: [-60, -110, 520], color: 0xcdd6e6, intensity: 1.6, soft: 0.3 },
  ],
  bloom: { threshold: 2.6, strength: 0.18, radius: 0.5 },
  grain: 0.03,
  vignette: 0.35,
  glow: { color: 0x5c616b, radius: 0.6 },   // the soft pool of light behind the ball
  coreLight: { intensity: 40000, steel: { closed: 0, open: 1 }, glass: { closed: 0, open: 0.07 } },
  // The core while the ball is closed (a dark bead with one glint) and once it is open.
  ignite: { dark: 0x15130f, darkRough: 0.34, emissive: 0.6, studEmissive: 0.45 },
  tilt: { x: -14, z: -34 },                   // degrees: puts the split on a diagonal
};

function makeMaterials(env) {
  const brushed = brushedTexture();
  const dir = directionTexture();
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const m = {};
  // steel variant
  m.steelFace = P({ color: 0xc9ccd1, metalness: 1, roughness: 0.34, roughnessMap: brushed, anisotropy: 0.6, anisotropyMap: dir, bumpMap: brushed, bumpScale: 0.25 });
  m.steelEdge = P({ color: 0xe8eaed, metalness: 1, roughness: 0.06 });
  m.smokeFace = P({ color: 0x0e1014, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 6, ior: 1.8, attenuationColor: 0x1b1e23, attenuationDistance: 12 });
  m.smokeEdge = P({ color: 0x0e1014, metalness: 0, roughness: 0.25, transmission: 0.9, thickness: 6, ior: 1.8, attenuationColor: 0x1b1e23, attenuationDistance: 12 });
  m.liner = P({ color: 0x3a3e46, metalness: 0.5, roughness: 0.42 });
  m.linerRim = P({ color: 0x9a9ea6, metalness: 1, roughness: 0.1 });
  m.gold = P({ color: SPEC.gold, metalness: 1, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.03, emissive: SPEC.gold, emissiveIntensity: 0.4 });
  // glass variant
  m.frameFace = P({ color: 0xd4d7dc, metalness: 1, roughness: 0.16 });
  m.frameEdge = P({ color: 0xeceef1, metalness: 1, roughness: 0.04 });
  m.clearFace = P({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 3.5, ior: 1.7, attenuationColor: 0x9fb0c4, attenuationDistance: 9, specularIntensity: 1 });
  m.clearEdge = P({ color: 0xffffff, metalness: 0, roughness: 0.3, transmission: 1, thickness: 3.5, ior: 1.7, attenuationColor: 0x9fb0c4, attenuationDistance: 5 });
  m.tintFace = P({ color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 3.5, ior: 1.7, attenuationColor: 0x2a3038, attenuationDistance: 3.2 });
  m.tintEdge = P({ color: 0xffffff, metalness: 0, roughness: 0.3, transmission: 1, thickness: 3.5, ior: 1.7, attenuationColor: 0x2a3038, attenuationDistance: 2.4 });
  // The core and the studs have their own copies: they are dark while the ball is closed
  // and ignite to full gold as it opens (see _applyPose).
  m.core = m.gold.clone();
  m.stud = m.gold.clone();
  // shared inner parts
  m.rod = P({ color: 0x6f747c, metalness: 1, roughness: 0.3 });
  // glass variant: the rim ring of each half. Satin, so it reads as a steel ring and not as a black band.
  m.rimFace = P({ color: 0x8f949c, metalness: 0.55, roughness: 0.4, roughnessMap: brushed });
  m.rimEdge = P({ color: 0xe8eaed, metalness: 1, roughness: 0.08 });
  m.tube = P({ color: 0xd8dbe0, metalness: 1, roughness: 0.1 });
  // Glass is lit by the studio only: the core's point light is taken out of every
  // glass material, so it cannot leave a hot spot on a pane (one of the guide's five bugs).
  for (const k of ['smokeFace', 'smokeEdge', 'clearFace', 'clearEdge', 'tintFace', 'tintEdge']) {
    m[k].onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>',
        '#include <lights_fragment_begin>\n reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0);');
    };
    m[k].customProgramCacheKey = () => 'studio-only';
  }
  for (const k in m) { m[k].envMap = env; m[k].envMapIntensity = 1; }
  return m;
}

// ---------------------------------------------------------------- views
const VIEWS = {
  hero: { dir: [0.0, 0.16, 1], fit: 330, target: 'centre' },
  'three-quarter': { dir: [0.42, 0.36, 1], fit: 400, target: 'centre' },
  macro: { dir: [0.34, 0.3, 1], fit: 78, target: 'seam' },
};

// ---------------------------------------------------------------- quality
// Quality levels, best first. Going down, the cheaper effects go before any resolution:
//   dpr    buffer pixels per CSS pixel, at most (never more than the screen has, 2 at most)
//   msaa   multisampling of the scene
//   glass  pixels per CSS pixel of the picture the glass refracts, at most
//   bloom  1: worked out from a picture the size of the window in CSS pixels; 0.5: half that; 0: off
// ?quality=high, low and min are levels 0, 3 and 6.
export const LEVELS = [
  { name: 'high',   dpr: 2,    msaa: 4, glass: 2,   bloom: 1 },
  { name: 'high-1', dpr: 2,    msaa: 4, glass: 1,   bloom: 0.5 },
  { name: 'high-2', dpr: 2,    msaa: 2, glass: 1,   bloom: 0 },
  { name: 'low',    dpr: 1.5,  msaa: 2, glass: 1,   bloom: 0 },
  { name: 'low-1',  dpr: 1.25, msaa: 2, glass: 1,   bloom: 0 },
  { name: 'low-2',  dpr: 1,    msaa: 2, glass: 0.5, bloom: 0 },
  { name: 'min',    dpr: 0.75, msaa: 0, glass: 0.5, bloom: 0 },
];

// ---------------------------------------------------------------- engine
export class BallEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.state = { split: 0, explode: 0, turn: 0, variant: 'steel', view: 'hero', ignite: null };
    this._cam = null;                        // set by setCamera; null means a named view
    this.still = !!opts.still;
    this.reducedMotion = !!opts.reducedMotion;
    this.autoTurn = !this.still && !this.reducedMotion;
    this.turnSpeed = TAU / 48;               // one slow turn every 48 seconds
    this.studio = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 };
    this.drag = { yaw: 0, pitch: 0, vy: 0, active: false };
    this.look = LOOK;
    this.frames = 0;
    this.lastCalls = 0; this.lastTriangles = 0;   // renderer.info of the last frame drawn
    this._dirty = true;
    this._running = false;
    this._last = performance.now();
    // scratch objects, so that nothing is allocated while the ball moves
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
    this._freeCam = { fit: 330, dir: [0, 0.16, 1], target: [0, 0, 0], shift: [0, 0] };
    this._w = canvas.clientWidth || window.innerWidth; this._h = canvas.clientHeight || window.innerHeight;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this._fixedDpr = opts.pixelRatio || 0;   // ?dpr= : do not follow the screen
    this._dpr = Math.min(this._fixedDpr || window.devicePixelRatio || 1, 2);
    this.level = 0;
    this.quality = LEVELS[0].name;
    r.setPixelRatio(this._dpr);
    r.setClearColor(SPEC.bg, 1);
    r.toneMapping = THREE.NoToneMapping;     // ACES is applied once, in the output pass
    r.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.env = buildStudio(r, LOOK);
    this.scene.environment = this.env;
    this.scene.environmentIntensity = LOOK.envIntensity;
    this.camera = new THREE.PerspectiveCamera(24, 1, 20, 4000);

    this.mats = makeMaterials(this.env);
    this._buildBackdrop();
    this._buildBall();
    this._buildPost();
    this.resize();
    this.setVariant(opts.variant || 'steel');
    this.setView(opts.view || 'hero');
    if (opts.pointer !== false) this._bindPointer();
    window.addEventListener('resize', () => this.resize());
  }

  // ---- public API --------------------------------------------------------
  /**
   * 0 closed to 1 open: the two halves part along the axis, 60 mm apart at 1.
   * Values up to 4 carry on at the same rate (the scroll story parts them further).
   */
  setSplit(t) { this.state.split = Math.min(4, Math.max(0, +t || 0)); this._applyPose(); return this; }
  /** 0 to 1: every panel lifts along its own normal, pole first, equator last. */
  setExplode(t) { this.state.explode = clamp01(+t || 0); this._applyPose(); return this; }
  /** Turntable angle in radians, about the ball's own (tilted) axis. */
  setTurn(angle) { this.state.turn = +angle || 0; this._applyPose(); return this; }
  /** Split, explode, turn and ignite (null follows the opening) in one call: one pass over the ball instead of four. */
  setPose(split, explode, turn, ignite = null) {
    const s = this.state;
    s.split = Math.min(4, Math.max(0, +split || 0));
    s.explode = clamp01(+explode || 0);
    s.turn = +turn || 0;
    s.ignite = ignite === null || ignite === undefined ? null : clamp01(+ignite || 0);
    this._applyPose();
    return this;
  }
  /** 'steel' or 'glass'. */
  setVariant(name) {
    const v = name === 'glass' ? 'glass' : 'steel';
    this.state.variant = v;
    for (const o of this.variantParts.steel) o.visible = v === 'steel';
    for (const o of this.variantParts.glass) o.visible = v === 'glass';
    this._applyPose();
    return this;
  }
  /** 'hero', 'three-quarter' or 'macro'. Framed by size in mm, not by distance. */
  setView(name) { this._cam = null; this.state.view = VIEWS[name] ? name : 'hero'; this._applyView(); return this; }
  /**
   * A free camera for the scroll story, replacing the named view until setView is called.
   * fit: mm that fill the short side; dir: direction from the target to the camera;
   * target: world point looked at; shift: where the target sits on screen, as a fraction
   * of the viewport from the centre (0.12 puts it at 62% across).
   */
  setCamera({ fit = 330, dir = [0, 0.16, 1], target = [0, 0, 0], shift = [0, 0] } = {}) {
    const c = this._freeCam;                 // copied, so the caller may reuse its arrays
    c.fit = fit;
    c.dir[0] = dir[0]; c.dir[1] = dir[1]; c.dir[2] = dir[2];
    c.target[0] = target[0]; c.target[1] = target[1]; c.target[2] = target[2];
    c.shift[0] = shift[0]; c.shift[1] = shift[1];
    this._cam = c;
    this._applyView();
    return this;
  }
  /**
   * A quality level, 0 (best) to LEVELS.length - 1: see LEVELS. Changing the multisampling or
   * the size makes new buffers, so the next frame is a slow one.
   */
  setLevel(i) {
    const n = Math.max(0, Math.min(LEVELS.length - 1, Math.round(+i || 0)));
    const L = LEVELS[n];
    this.level = n;
    this.quality = L.name;
    this.bloom.enabled = L.bloom > 0;
    if (this._sceneTarget.samples !== L.msaa) { this._sceneTarget.samples = L.msaa; this._sceneTarget.dispose(); }
    this._size = '';
    this.resize();
    return this;
  }
  /** 'high', 'low' or 'min': the named levels (0, 3 and 6). */
  setQuality(tier) {
    const i = LEVELS.findIndex((L) => L.name === tier);
    return this.setLevel(i < 0 ? 0 : i);
  }
  /** Buffer pixels per CSS pixel that a level gives on this screen. */
  pixelRatioAt(level) { return Math.min(this._dpr, LEVELS[level].dpr); }
  /** Compiles every shader the scene needs without blocking the page (resolves when they are ready). */
  precompile() { return this.renderer.compileAsync(this.scene, this.camera); }
  /** How lit the gold core is, 0 dark to 1 full gold. null (the default) follows the opening. */
  setIgnite(t) { this.state.ignite = t === null || t === undefined ? null : clamp01(+t || 0); this._applyPose(); return this; }
  /**
   * Screen position in CSS pixels of a point given in the space of `object` (default: the turning ball).
   * Pass `out` to have it filled instead of a new object.
   */
  project(point, object = this.spin, out = {}) {
    object.updateWorldMatrix(true, false);
    const v = this._v3.set(point[0], point[1], point[2]).applyMatrix4(object.matrixWorld);
    out.depth = v.distanceTo(this.camera.position);
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this._w; out.y = (0.5 - v.y * 0.5) * this._h;
    return out;
  }
  /** CSS pixels per mm at the camera target. */
  pxPerMm() {
    return this._h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this._dist);
  }
  /** Studio yaw and pitch in radians (the cursor drives this, eased). */
  setStudio(yaw, pitch, immediate = false) {
    this.studio.tYaw = yaw; this.studio.tPitch = pitch;
    if (immediate) { this.studio.yaw = yaw; this.studio.pitch = pitch; }
    this._dirty = true; return this;
  }
  start() { if (this._running) return; this._running = true; this._last = performance.now(); const loop = () => { if (!this._running) return; this._tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this._running = false; }
  /** Draw one frame now. */
  render() {
    const s = this.studio;
    this.scene.environmentRotation.set(s.pitch, s.yaw, 0);
    this.finish.uniforms.uTime.value = this.still ? 0.37 : (performance.now() / 1000) % 100;
    const info = this.renderer.info;
    info.reset();
    this.composer.render();
    this.lastCalls = info.render.calls; this.lastTriangles = info.render.triangles;
    this.frames++;
    this._dirty = false;
  }
  /** Draw calls and triangles of the last frame (all passes) and of the visible geometry alone. */
  stats() {
    let meshes = 0, tris = 0, draws = 0;
    this.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      const n = o.isInstancedMesh ? o.count : 1;
      tris += n * (g.index ? g.index.count : g.attributes.position.count) / 3;
      draws += Array.isArray(o.material) ? g.groups.length : 1;
    });
    const b = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { frameCalls: this.lastCalls, frameTriangles: this.lastTriangles, sceneMeshes: meshes, sceneDrawCalls: draws, sceneTriangles: tris,
      programs: this.renderer.info.programs.length, level: this.level, quality: this.quality, pixelRatio: this.renderer.getPixelRatio(), buffer: [b.x, b.y] };
  }
  /** Fits every buffer to the canvas, the screen's pixel ratio and the quality level. Does nothing if none of them changed. */
  resize() {
    const w = this._w = this.canvas.clientWidth || window.innerWidth, h = this._h = this.canvas.clientHeight || window.innerHeight;
    if (!this._fixedDpr) this._dpr = Math.min(window.devicePixelRatio || 1, 2);   // the window may have moved to another screen
    const L = LEVELS[this.level];
    const pr = Math.min(this._dpr, L.dpr);
    const size = `${w}x${h}@${pr}/${this.level}`;
    if (size === this._size) return;
    this._size = size;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);         // sizes the composer's buffers (and the bloom's) to w * pr
    this.composer.setSize(w, h);
    // The bloom is worked out from a picture the size of the window in CSS pixels, whatever the
    // pixel ratio: the glow is as wide on a 2x screen as on a 1x one, and costs a quarter.
    if (L.bloom > 0) this.bloom.setSize(Math.max(2, Math.round(w * L.bloom)), Math.max(2, Math.round(h * L.bloom)));
    this.renderer.transmissionResolutionScale = Math.min(1, L.glass / pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.backdrop.material.uniforms.uAspect.value = w / h;
    this.finish.uniforms.uRes.value.set(w, h);
    this._applyView();
  }

  // ---- build --------------------------------------------------------------
  _buildBackdrop() {
    const mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        uBg: { value: new THREE.Color(0x000000) }, uGlow: { value: new THREE.Color(LOOK.glow.color) },
        uRadius: { value: LOOK.glow.radius }, uAspect: { value: 1 }, uCentre: { value: new THREE.Vector2(0.5, 0.5) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform vec3 uBg; uniform vec3 uGlow; uniform float uRadius; uniform float uAspect; uniform vec2 uCentre;
        void main(){
          float d = length((vUv - uCentre) * vec2(uAspect, 1.0));
          float f = 1.0 - smoothstep(0.0, uRadius, d);
          gl_FragColor = vec4(mix(uBg, uGlow, f * f), 1.0);
        }`,
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = -1000;
    this.scene.add(this.backdrop);
  }

  // Every repeated part is one instanced mesh (one draw call per material), placed in the space
  // of the turning ball. The halves and the panels move by rewriting their instances' positions.
  _buildBall() {
    const M = this.mats, R = SPEC.radius;
    const faces = this.faces = truncatedIcosahedron(R);
    const hexF = faces.find((f) => f.n === 6), penF = faces.find((f) => f.n === 5);
    const solid = { R, T: SPEC.panelThickness, inset: SPEC.seam / 2, bevel: SPEC.bevel };
    const bez = { R, T: SPEC.panelThickness, inset: SPEC.seam / 2, width: SPEC.bezelWidth, bevel: 0.8 };
    const pane = { R: R - 1.1, T: 3.5, inset: SPEC.seam / 2 + SPEC.bezelWidth + 0.12, bevel: 0.35, topRings: 4 };
    const geo = this.geo = {
      hexSolid: solidPanel(hexF, solid), penSolid: solidPanel(penF, solid),
      hexBezel: bezelPanel(hexF, bez), penBezel: bezelPanel(penF, bez),
      hexPane: solidPanel(hexF, pane), penPane: solidPanel(penF, pane),
      linerSteel: linerGeometry(true), linerGlass: linerGeometry(false),
      stud: studGeometry(),
      core: new THREE.SphereGeometry(SPEC.coreRadius, 64, 48),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 40, 1, false),
    };

    this.root = new THREE.Group();      // pointer drag
    this.tilt = new THREE.Group();      // fixed tilt: the split sits on a diagonal
    this.spin = new THREE.Group();      // setTurn
    this.tilt.rotation.set(THREE.MathUtils.degToRad(LOOK.tilt.x), 0, THREE.MathUtils.degToRad(LOOK.tilt.z), 'ZXY');
    this.scene.add(this.root); this.root.add(this.tilt); this.tilt.add(this.spin);

    // The two halves hold no meshes: they are the frames of reference for project() (they move with the split).
    this.halves = { blitz: new THREE.Group(), draft: new THREE.Group() };
    this.halves.blitz.name = 'blitz'; this.halves.draft.name = 'draft';
    this.spin.add(this.halves.blitz, this.halves.draft);
    this.variantParts = { steel: [], glass: [] };
    this.panels = [];

    const inst = (geometry, material, count, variant) => {
      const m = new THREE.InstancedMesh(geometry, material, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;          // the instances move; the ball is nearly always in view
      this.spin.add(m);
      if (variant) this.variantParts[variant].push(m);
      return m;
    };
    const nHex = faces.filter((f) => f.n === 6).length, nPen = faces.length - nHex;
    const P = this.parts = {
      // steel variant: brushed steel hexagons, smoked glass pentagons
      hexSolid: inst(geo.hexSolid, [M.steelFace, M.steelEdge], nHex, 'steel'),
      penSolid: inst(geo.penSolid, [M.smokeFace, M.smokeEdge], nPen, 'steel'),
      // glass variant: a polished steel bezel with a pane set into it
      hexBezel: inst(geo.hexBezel, [M.frameFace, M.frameEdge], nHex, 'glass'),
      penBezel: inst(geo.penBezel, [M.frameFace, M.frameEdge], nPen, 'glass'),
      hexPane: inst(geo.hexPane, [M.clearFace, M.clearEdge], nHex, 'glass'),
      penPane: inst(geo.penPane, [M.tintFace, M.tintEdge], nPen, 'glass'),
      linerSteel: inst(geo.linerSteel, [M.liner, M.linerRim], 2, 'steel'),
      linerGlass: inst(geo.linerGlass, [M.rimFace, M.rimEdge], 2, 'glass'),
      studs: inst(geo.stud, M.stud, 8),
      tubes: inst(geo.cylinder, M.tube, 6),
    };

    const m4 = new THREE.Matrix4();
    const maxY = Math.max(...faces.map((f) => Math.abs(f.normal.y)));
    let iHex = 0, iPen = 0;
    for (const f of faces) {
      const hex = f.n === 6;
      const slot = hex ? iHex++ : iPen++;
      m4.makeBasis(f.X, f.Y, f.normal);
      for (const k of hex ? ['hexSolid', 'hexBezel', 'hexPane'] : ['penSolid', 'penBezel', 'penPane']) P[k].setMatrixAt(slot, m4);
      this.panels.push({ normal: f.normal.clone(), half: f.centre.y > 0 ? 'blitz' : 'draft', sign: f.centre.y > 0 ? 1 : -1, hex, slot, order: 1 - Math.abs(f.normal.y) / maxY });
    }

    // Parts that ride with a half: [instanced mesh, instance, +1 Blitz or -1 Draft, height at rest].
    this._riders = [];
    const ride = (mesh, i, sign, matrix) => { mesh.setMatrixAt(i, matrix); this._riders.push({ a: mesh.instanceMatrix.array, o: i * 16 + 13, sign, y: matrix.elements[13] }); };
    const turned = new THREE.Matrix4().makeRotationX(Math.PI);   // the Draft half is the Blitz half turned over (a turn, not a mirror, so normals stay outward)
    // liners
    for (const k of ['linerSteel', 'linerGlass']) { ride(P[k], 0, 1, m4.identity()); ride(P[k], 1, -1, turned); }
    // studs on the rims: 3 on Blitz, 5 on Draft, their domes pointing at the other half
    const studCount = { blitz: 3, draft: 5 };
    const studR = (SPEC.flangeInner + SPEC.linerRadius) / 2;
    let iStud = 0;
    for (const name of ['blitz', 'draft']) for (let i = 0; i < studCount[name]; i++) {
      const a = (i / studCount[name]) * TAU + 0.3;
      const x = studR * Math.cos(a), z = studR * Math.sin(a);
      if (name === 'blitz') ride(P.studs, iStud++, 1, m4.copy(turned).setPosition(x, 0, z));
      else ride(P.studs, iStud++, -1, m4.identity().setPosition(x, 0, -z));
    }
    // the sliding tube and its collar in each half, and the two collars on the core (which stay put)
    const cyl = (radius, height, y) => m4.makeScale(radius, height, radius).setPosition(0, y, 0);
    ride(P.tubes, 0, 1, cyl(4.2, 60, 71)); ride(P.tubes, 1, 1, cyl(6.5, 3, 42.5));
    ride(P.tubes, 2, -1, cyl(4.2, 60, -71)); ride(P.tubes, 3, -1, cyl(6.5, 3, -42.5));
    P.tubes.setMatrixAt(4, cyl(5.2, 4, SPEC.coreRadius + 1.2)); P.tubes.setMatrixAt(5, cyl(5.2, 4, -SPEC.coreRadius - 1.2));

    // the core: still while the halves travel, turns with the ball
    this.coreGroup = new THREE.Group();
    this.core = new THREE.Mesh(geo.core, M.core);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 198, 24), M.rod);
    this.rod = rod;
    this.coreGroup.add(this.core, rod);
    this.coreLight = new THREE.PointLight(0xffc860, 0, 0, 2);
    this.coreGroup.add(this.coreLight);
    this.spin.add(this.coreGroup);
    this._posed = '';                   // the split and explode the instances were last written for
  }

  _buildPost() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(r, target);
    c.setPixelRatio(r.getPixelRatio());
    // The scene is always drawn into the composer's read buffer (the passes below swap the two
    // buffers an even number of times a frame). Only that one needs multisampling and depth:
    // the other only ever receives a full-screen pass.
    this._sceneTarget = c.readBuffer;
    c.writeBuffer.samples = 0;
    c.writeBuffer.depthBuffer = false;
    c.addPass(new RenderPass(this.scene, this.camera));
    const b = LOOK.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), b.strength, b.radius, b.threshold);
    c.addPass(this.bloom);
    const out = new OutputPass();
    c.addPass(out);
    r.toneMapping = THREE.ACESFilmicToneMapping;   // read by the output pass only
    r.toneMappingExposure = LOOK.exposure;
    this.finish = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uGrain: { value: LOOK.grain }, uVignette: { value: LOOK.vignette }, uBg: { value: new THREE.Vector3(0x0a / 255, 0x0b / 255, 0x0d / 255) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrain; uniform float uVignette; uniform vec3 uBg;
        float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          float v = smoothstep(0.35, 1.05, length(p)) * uVignette;
          c = mix(c, vec3(0.0), v);
          float n = hash(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5;
          c += n * uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.5, dot(c, vec3(0.3333))));
          // lift the floor to the page colour, so the canvas edge meets #0A0B0D exactly
          c = uBg + c * (1.0 - uBg);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    c.addPass(this.finish);
  }

  // ---- pose ---------------------------------------------------------------
  _applyPose() {
    const { split, explode, turn, variant } = this.state;
    const s = (ease(Math.min(split, 1)) + Math.max(0, split - 1)) * SPEC.splitTravel;
    this.halves.blitz.position.y = s;
    this.halves.draft.position.y = -s;
    this.spin.rotation.y = turn;
    // The instances are rewritten only when the split or the explode has changed (a turn alone moves nothing inside the ball).
    const posed = split + '/' + explode;
    if (posed !== this._posed) {
      this._posed = posed;
      const P = this.parts;
      for (const p of this.panels) {
        // staggered: the pole panels leave first, the equator band last
        const t = ease(clamp01((explode - p.order * 0.45) / 0.55));
        const lift = SPEC.explodeLift * t * (p.hex ? 1 : 1.3);
        const n = p.normal, o = p.slot * 16 + 12;
        const x = n.x * lift, y = n.y * lift + p.sign * s, z = n.z * lift;
        const solid = (p.hex ? P.hexSolid : P.penSolid).instanceMatrix.array;
        const bezel = (p.hex ? P.hexBezel : P.penBezel).instanceMatrix.array;
        const pane = (p.hex ? P.hexPane : P.penPane).instanceMatrix.array;
        solid[o] = bezel[o] = x; solid[o + 1] = bezel[o + 1] = y; solid[o + 2] = bezel[o + 2] = z;
        const g = 9 * t;                    // glass variant: the pane lifts clear of its bezel
        pane[o] = x + n.x * g; pane[o + 1] = y + n.y * g; pane[o + 2] = z + n.z * g;
      }
      for (const r of this._riders) r.a[r.o] = r.y + r.sign * s;
      for (const k in P) P[k].instanceMatrix.needsUpdate = true;
    }
    const L = LOOK.coreLight, I = LOOK.ignite;
    const k = this.state.ignite === null ? Math.max(ease(Math.min(split, 1)), explode * 0.6) : this.state.ignite;
    this.coreLight.intensity = L.intensity * (L[variant].closed + (L[variant].open - L[variant].closed) * k);
    // The core is a dark bead while closed and full gold once open, so opening is a reveal.
    const kk = k * k * (3 - 2 * k);
    const M = this.mats, base = M.gold;
    M.core.color.set(I.dark).lerp(base.color, kk);
    M.core.roughness = I.darkRough + (base.roughness - I.darkRough) * kk;
    M.core.clearcoat = base.clearcoat * kk;
    M.core.emissiveIntensity = I.emissive * kk * kk;
    M.stud.color.set(I.dark).lerp(base.color, kk);
    M.stud.emissiveIntensity = I.studEmissive * kk * kk;
    if (!this._cam && this.state.view === 'macro') this._applyView();
    this._dirty = true;
  }

  _applyView() {
    const free = this._cam;
    const v = free || VIEWS[this.state.view];
    const cam = this.camera;
    const dir = this._v1.set(v.dir[0], v.dir[1], v.dir[2]).normalize();
    const target = this._v2.set(0, 0, 0);
    if (free) target.set(free.target[0], free.target[1], free.target[2]);
    if (v.target === 'seam') {
      // the panel corner (hexagon, hexagon, pentagon) that faces the camera most
      this.scene.updateMatrixWorld(true);
      let best = -Infinity;
      const w = new THREE.Vector3();
      for (const f of this.faces) for (const p of f.verts) {
        w.copy(p).applyMatrix4(this.spin.matrixWorld);
        const d = w.clone().normalize().dot(dir);
        if (d > best) { best = d; target.copy(w); }
      }
    }
    const fitV = v.fit, fitH = v.fit * 1.02;
    const half = THREE.MathUtils.degToRad(cam.fov / 2);
    const dist = Math.max(fitV / 2 / Math.tan(half), fitH / 2 / (Math.tan(half) * cam.aspect));
    this._dist = dist;
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    // Slide the picture sideways without changing the perspective (the ball at 62% across).
    const w = this._w, h = this._h;       // measured in resize(), never here: reading the canvas's size every frame forces a layout
    if (free && (free.shift[0] || free.shift[1])) cam.setViewOffset(w, h, -free.shift[0] * w, -free.shift[1] * h, w, h);
    else if (cam.view) cam.clearViewOffset();
    cam.updateMatrixWorld();
    // keep the glow pool behind the ball
    const c = this._v3.set(0, 0, 0).project(cam);
    this.backdrop.material.uniforms.uCentre.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5);
    this._dirty = true;
  }

  // ---- loop and pointer ---------------------------------------------------
  _tick() {
    const now = performance.now();
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    if (document.hidden) return;
    const s = this.studio, d = this.drag;
    if (this.autoTurn && !d.active) { this.state.turn += dt * this.turnSpeed; this.spin.rotation.y = this.state.turn; this._dirty = true; }
    if (!this.reducedMotion) {
      const dy = s.tYaw - s.yaw, dp = s.tPitch - s.pitch;
      if (Math.abs(dy) + Math.abs(dp) > 1e-4) { s.yaw += dy * 0.06; s.pitch += dp * 0.06; this._dirty = true; }
      if (!d.active && Math.abs(d.vy) > 1e-4) { d.yaw += d.vy; d.vy *= 0.93; this._dirty = true; }
    }
    this.root.rotation.set(d.pitch, d.yaw, 0);
    if (this._dirty || (!this.still && !this.reducedMotion)) this.render();
  }

  _bindPointer() {
    const el = this.canvas, d = this.drag;
    let lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => { d.active = true; d.vy = 0; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (d.active) {
        const dx = (e.clientX - lx) * 0.006, dy = (e.clientY - ly) * 0.006;
        lx = e.clientX; ly = e.clientY;
        d.yaw += dx; d.vy = dx;
        d.pitch = Math.max(-1.1, Math.min(1.1, d.pitch + dy));
        this._dirty = true;
      } else if (!this.reducedMotion) {
        // the cursor turns the studio, not the ball: 12 degrees of yaw, 6 of pitch
        const nx = (e.clientX / window.innerWidth) * 2 - 1, ny = (e.clientY / window.innerHeight) * 2 - 1;
        this.setStudio(THREE.MathUtils.degToRad(12) * nx, THREE.MathUtils.degToRad(6) * ny);
      }
    });
    const up = () => { d.active = false; d.vy = Math.max(-0.03, Math.min(0.03, d.vy)); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
}
