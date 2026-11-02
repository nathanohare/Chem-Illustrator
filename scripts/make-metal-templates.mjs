// Builds src/chem/metal-templates.json: coordination geometries, organometallic complexes and
// ligands for the template tools.
//
// Geometries, sandwich and half-sandwich complexes are built in 3-D here and drawn as their
// shadow on the page, seen a little from above: bonds from the metal that come towards the
// viewer become wedges, ones going away hashed wedges, so the drawing reads the way the shape
// is. Rings bonded side-on (η⁵-Cp, η⁶-arene) get a hapto bond to their middle. Ligands are laid
// out by RDKit (CoordGen) from SMILES with the metal in place, so chelate rings come out
// regular; the metal is the template's first atom, the one put on a metal that is clicked.
// σ-donors are written with a + charge only so RDKit accepts the extra bond; the charge is
// taken off again.
//
// Run with:  node scripts/make-metal-templates.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RDKit = await require('@rdkit/rdkit')();

const DEG = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ 3-D building

/** A structure in 3-D (y up, z towards the viewer), drawn by project(). */
function mol() {
  const t = { atoms: [], bonds: [], hapto: [], circle: [] };
  t.atom = (p, el = 'C', label) => { t.atoms.push({ ...p, el, label }); return t.atoms.length - 1; };
  /** display 'auto': a wedge or hashed wedge from `a` when the bond runs towards or away from the viewer. */
  t.bond = (a, b, order = 1, display) => { t.bonds.push({ a, b, order, display }); return t; };
  t.ring = (ids, circled = true) => {
    for (let i = 0; i < ids.length; i++) t.bond(ids[i], ids[(i + 1) % ids.length]);
    if (circled) t.circle.push(ids);
    return ids;
  };
  return t;
}

const v3 = (x, y, z) => ({ x, y, z });
const addv = (p, q) => v3(p.x + q.x, p.y + q.y, p.z + q.z);
const scl = (p, k) => v3(p.x * k, p.y * k, p.z * k);
const len = (p) => Math.hypot(p.x, p.y, p.z);
/** A unit vector at `polar` from straight up and `az` round from the front (+z) towards the right (+x). */
const dirv = (polar, az) => v3(Math.sin(polar * DEG) * Math.sin(az * DEG), Math.cos(polar * DEG), Math.sin(polar * DEG) * Math.cos(az * DEG));

/** Two unit vectors across a ring whose axis is `n`. */
function frame(n) {
  const a = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(0, 0, 1);
  // u = a × n, w = n × u
  let u = v3(a.y * n.z - a.z * n.y, a.z * n.x - a.x * n.z, a.x * n.y - a.y * n.x);
  u = scl(u, 1 / len(u));
  const w = v3(n.y * u.z - n.z * u.y, n.z * u.x - n.x * u.z, n.x * u.y - n.y * u.x);
  return [u, w];
}

/** A flat ring of n atoms (one bond long) round `c`, square to the axis `n`, turned by `phase`°. */
function ringAt(t, c, n, size, phase = 0, el = 'C') {
  const nn = scl(n, 1 / len(n));
  const [u, w] = frame(nn);
  const r = 1 / (2 * Math.sin(Math.PI / size));
  const ids = [];
  for (let k = 0; k < size; k++) {
    const a = (phase + (360 * k) / size) * DEG;
    ids.push(t.atom(addv(c, addv(scl(u, r * Math.cos(a)), scl(w, r * Math.sin(a)))), el));
  }
  return ids;
}

/** Methyls on each ring atom, pointing out from the ring's middle (Cp*, C6Me6). */
function methylate(t, ring) {
  const c = ring.reduce((s, i) => addv(s, scl(t.atoms[i], 1 / ring.length)), v3(0, 0, 0));
  for (const i of ring) {
    const p = t.atoms[i];
    const d = addv(p, scl(c, -1));
    t.bond(i, t.atom(addv(p, scl(d, 1 / len(d)))));
  }
}

/**
 * The page drawing of a 3-D structure: turned by `turnY`° round the upright axis, then tipped
 * by `tilt`° so it is seen from a little above; y down, centred, bond length 1 in 3-D.
 */
function project(t, { tilt = 0, turnY = 0 } = {}) {
  const cy = Math.cos(turnY * DEG), sy = Math.sin(turnY * DEG), ct = Math.cos(tilt * DEG), st = Math.sin(tilt * DEG);
  const P = t.atoms.map((p) => {
    const x = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
    return { x, y: p.y * ct - z1 * st, z: p.y * st + z1 * ct };
  });
  const atoms = t.atoms.map((p, i) => ({ x: P[i].x, y: -P[i].y, el: p.el, label: p.label, charge: p.charge ?? 0 }));
  const bonds = t.bonds.map((b) => {
    let display = b.display;
    if (display === 'auto') {
      const d = (P[b.b].z - P[b.a].z) / Math.max(1e-9, Math.hypot(P[b.b].x - P[b.a].x, P[b.b].y - P[b.a].y, P[b.b].z - P[b.a].z));
      display = d > 0.5 ? 'wedge' : d < -0.5 ? 'hashWedge' : undefined;
    }
    return { a: b.a, b: b.b, order: b.order, display };
  });
  return { atoms, bonds, hapto: t.hapto, circle: t.circle };
}

// ------------------------------------------------------------------ geometries

/** A metal with ligands L along these directions (polar°, azimuth°), each a bond (in 3-D) long. */
function geometry(dirs, opts = {}) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const L = opts.length ?? 1.35;
  for (const [polar, az] of dirs) t.bond(m, t.atom(scl(dirv(polar, az), L), 'C', 'L'), 1, 'auto');
  return project(t, opts.view ?? { tilt: 15, turnY: 0 });
}

const tetra = Math.acos(-1 / 3) / DEG; // 109.47°

const GEOMETRIES = [
  ['linear', 'Linear ML₂', geometry([[90, 90], [90, -90]], { view: {} })],
  ['trigonal-planar', 'Trigonal planar ML₃', geometry([[0, 0], [120, 90], [120, -90]], { view: {} })],
  // two bonds in the page, and below them one towards the viewer and one away, drawn a little
  // apart (seen exactly side-on they would lie on top of each other)
  ['tetrahedral', 'Tetrahedral ML₄', (() => {
    const t = mol();
    const m = t.atom(v3(0, 0, 0), 'C', 'M');
    const h = (tetra / 2) * DEG;
    for (const sx of [-1, 1]) t.bond(m, t.atom(v3(sx * 1.35 * Math.sin(h), 1.35 * Math.cos(h), 0), 'C', 'L'));
    t.bond(m, t.atom(v3(0.5, -1.2, 0.8), 'C', 'L'), 1, 'wedge');
    t.bond(m, t.atom(v3(-0.5, -1.2, -0.8), 'C', 'L'), 1, 'hashWedge');
    return project(t);
  })()],
  ['square-planar', 'Square planar ML₄', geometry([[0, 0], [90, 90], [180, 0], [90, -90]], { view: {} })],
  ['tbp', 'Trigonal bipyramidal ML₅', geometry([[0, 0], [180, 0], [90, -90], [90, 30], [90, 150]], { view: { tilt: 25 } })],
  ['square-pyramidal', 'Square pyramidal ML₅', geometry([[0, 0], [90, 45], [90, 135], [90, 225], [90, 315]], { length: 1.5, view: { tilt: 25 } })],
  ['octahedral', 'Octahedral ML₆', geometry([[0, 0], [180, 0], [90, 45], [90, 135], [90, 225], [90, 315]], { length: 1.5, view: { tilt: 25 } })],
];

// ------------------------------------------------------------------ organometallic complexes

/** The view for rings bonded side-on: from a little above, so each ring is a flattened polygon. */
const SANDWICH = { tilt: 28 };
/** Metal to ring middle, in bond lengths (Fe–Cp 1.65 Å against C–C 1.42 Å, drawn a little longer to leave room). */
const M_RING = 1.3;

/** A ring bonded side-on to metal `m` from direction `n`, with a hapto bond to its middle. */
function hapto(t, m, n, size, phase, { circled = true, dist = M_RING, methyls = false } = {}) {
  const nn = scl(n, 1 / len(n));
  const ring = ringAt(t, addv(t.atoms[m], scl(nn, dist)), nn, size, phase);
  t.ring(ring, circled);
  if (methyls) methylate(t, ring);
  t.hapto.push([m, ring]);
  return ring;
}

function allyl() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  // the allyl above the metal, its middle carbon pointing back
  const c1 = t.atom(v3(-0.866, 0.95, 0)), c2 = t.atom(v3(0, 1.45, 0)), c3 = t.atom(v3(0.866, 0.95, 0));
  t.bond(c1, c2, 1.5).bond(c2, c3, 1.5);
  t.hapto.push([m, [c1, c2, c3]]);
  t.bond(m, t.atom(scl(dirv(130, -90), 1.35), 'C', 'L'));
  t.bond(m, t.atom(scl(dirv(130, 90), 1.35), 'C', 'L'));
  return project(t);
}

function alkene() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const a = t.atom(v3(-0.5, 1.2, 0)), b = t.atom(v3(0.5, 1.2, 0));
  t.bond(a, b, 2);
  t.hapto.push([m, [a, b]]);
  t.bond(m, t.atom(scl(dirv(130, -90), 1.35), 'C', 'L'));
  t.bond(m, t.atom(scl(dirv(130, 90), 1.35), 'C', 'L'));
  return project(t);
}

/** [L₂M(μ-Cl)]₂: two square-planar metals sharing two chlorides. */
function chlorideDimer() {
  const t = mol();
  const m1 = t.atom(v3(-1.05, 0, 0), 'C', 'M'), m2 = t.atom(v3(1.05, 0, 0), 'C', 'M');
  const c1 = t.atom(v3(0, 1.05, 0), 'Cl'), c2 = t.atom(v3(0, -1.05, 0), 'Cl');
  for (const m of [m1, m2]) for (const c of [c1, c2]) t.bond(m, c);
  for (const [m, sx] of [[m1, -1], [m2, 1]]) {
    for (const sy of [1, -1]) t.bond(m, t.atom(addv(t.atoms[m], v3(sx * 0.95, sy * 0.95, 0)), 'C', 'L'));
  }
  return project(t);
}

/**
 * X₄M≣MX₄ (as in [Re₂Cl₈]²⁻): a quadruple bond, each metal with an X above and below and two
 * leaning outwards, one in front and one behind.
 */
function quadruple() {
  const t = mol();
  const m1 = t.atom(v3(-0.65, 0, 0), 'C', 'M'), m2 = t.atom(v3(0.65, 0, 0), 'C', 'M');
  t.bond(m1, m2, 4);
  for (const [m, sx] of [[m1, -1], [m2, 1]]) {
    const p = t.atoms[m];
    for (const sy of [1, -1]) t.bond(m, t.atom(addv(p, v3(sx * 0.3, sy * 1.3, 0)), 'C', 'X'));
    t.bond(m, t.atom(addv(p, v3(sx * 1.25, -0.45, 0)), 'C', 'X'), 1, 'wedge');
    t.bond(m, t.atom(addv(p, v3(sx * 1.25, 0.45, 0)), 'C', 'X'), 1, 'hashWedge');
  }
  return project(t);
}

/** A β-agostic alkyl: M–Cα–Cβ–H with the C–H donating to the metal (dashed). */
function agostic() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const ca = t.atom(v3(0.75, 0.8, 0)), cb = t.atom(v3(1.6, 0.25, 0)), h = t.atom(v3(0.85, -0.45, 0), 'H');
  t.bond(m, ca).bond(ca, cb).bond(cb, h).bond(m, h, 1, 'dash');
  t.bond(cb, t.atom(v3(2.55, 0.6, 0)));
  t.bond(m, t.atom(v3(-1, 0.35, 0), 'C', 'L'));
  t.bond(m, t.atom(v3(-0.35, -1.05, 0), 'C', 'L'));
  return project(t);
}

const COMPLEXES = [
  ['allyl-complex', '(η³-Allyl)ML₂', allyl()],
  ['alkene-complex', '(η²-Alkene)ML₂', alkene()],
  ['mu-cl-dimer', 'Chloride-bridged dimer [L₂M(μ-Cl)]₂', chlorideDimer()],
  ['quadruple', 'Metal–metal quadruple bond X₄M≣MX₄', quadruple()],
  ['agostic', 'β-Agostic alkyl', agostic()],
];

// ------------------------------------------------------------------ metallocenes
//
// Sandwich, bent, ansa and half-sandwich complexes, built from their real shapes (metal–ring
// distances and ring tilts from crystal structures, in C–C bond lengths) and drawn the textbook
// way: the rings level (or tipped as they are) and seen from a little above, so each ring is a
// flattened polygon and its hapto bond runs from the metal to its middle. A ring's edge, not a
// corner, faces where the hapto bond crosses it, so the bond never seems to end on an atom.

const cross = (p, q) => v3(p.y * q.z - p.z * q.y, p.z * q.x - p.x * q.z, p.x * q.y - p.y * q.x);
const dot3 = (p, q) => p.x * q.x + p.y * q.y + p.z * q.z;
const unit = (p) => scl(p, 1 / len(p));
const sub3 = (p, q) => addv(p, scl(q, -1));
const FRONT = v3(0, 0, 1), LEFT = v3(-1, 0, 0), UP = v3(0, 1, 0), DOWN = v3(0, -1, 0);

/** A flat ring of `size` atoms round `c`, square to the axis `n`, its first atom towards `ref` turned by `offset`° (towards n × ref). */
function ringToward(t, c, n, size, ref, offset = 0) {
  const nn = unit(n);
  const e1 = unit(sub3(ref, scl(nn, dot3(ref, nn))));
  const e2 = cross(nn, e1);
  const r = 1 / (2 * Math.sin(Math.PI / size));
  const ids = [];
  for (let k = 0; k < size; k++) {
    const a = (offset + (360 * k) / size) * DEG;
    ids.push(t.atom(addv(c, addv(scl(e1, r * Math.cos(a)), scl(e2, r * Math.sin(a))))));
  }
  return ids;
}

/** A group on ring atom `i`, a bond out from the ring's middle: a methyl, or an atom with a label. */
function outward(t, ring, i, el = 'C', label) {
  const c = ring.reduce((s, k) => addv(s, scl(t.atoms[k], 1 / ring.length)), v3(0, 0, 0));
  const p = t.atoms[i];
  const id = t.atom(addv(p, unit(sub3(p, c))), el, label);
  t.bond(i, id);
  return id;
}

/**
 * A π ring on metal `m`, its middle `dist` along `n`; the hapto bond goes to its middle. `methyls`:
 * a methyl on every ring atom (Cp*, C₆Me₆), or on all but the atoms listed.
 */
function piOn(t, m, n, size, { ref = FRONT, offset = 0, dist = M_RING, circled = true, methyls = false } = {}) {
  const ring = ringToward(t, addv(t.atoms[m], scl(unit(n), dist)), n, size, ref, offset);
  t.ring(ring, circled);
  if (methyls) for (const [k, i] of ring.entries()) if (methyls === true || !methyls.includes(k)) outward(t, ring, i);
  t.hapto.push([m, ring]);
  return ring;
}

// A pentagon level above the metal with its corner at the back (offset 180) has an edge in
// front, where the hapto bond comes down across it; one below has its corner in front (offset
// 0), so the bond reaches it across the back edge. The two together are staggered (D5d).
const TOP_EDGE = 180, BOTTOM_EDGE = 0;

/** M(η-ring)₂: Cp₂M, ferrocene, bis(benzene)chromium, uranocene. */
function sandwich({ el = 'C', label, charge = 0, size = 5, top = TOP_EDGE, bottom = BOTTOM_EDGE, dist = M_RING, methyls = false, subs = [] } = {}) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), el, label);
  t.atoms[m].charge = charge;
  const rt = piOn(t, m, UP, size, { offset: top, dist, methyls });
  const rb = piOn(t, m, DOWN, size, { offset: bottom, dist, methyls });
  // substituents: [ring (0 top, 1 bottom), atom, label]
  for (const [r, k, lab] of subs) outward(t, [rt, rb][r], [rt, rb][r][k], 'C', lab);
  return { t, m, rings: [rt, rb] };
}

/**
 * Cp₂MXₙ, the rings tipped back from each other: their middles `wedge`° apart (about 130°),
 * opening to the right, where the X ligands sit in the plane square to the rings' (X–M–X about
 * 95°, one in front and one behind). Each ring's first atom points left, where the rings come
 * closest (an ansa bridge goes there).
 */
function bent({ el = 'C', label, xs = [['C', 'X'], ['C', 'X']], wedge = 130, xAngle = 95, offset = 0, methyls = false, size = 5, dist = M_RING } = {}) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), el, label);
  const h = 90 - wedge / 2;
  const rt = piOn(t, m, dirv(h, -90), size, { ref: LEFT, offset, methyls, dist });
  const rb = piOn(t, m, dirv(180 - h, -90), size, { ref: LEFT, offset: -offset, methyls, dist });
  const a = (xAngle / 2) * DEG;
  const xIds = [];
  const at = xs.length === 1 ? [v3(1, 0, 0)] : [v3(Math.cos(a), 0, Math.sin(a)), v3(Math.cos(a), 0, -Math.sin(a))];
  xs.forEach(([xel, xlabel], i) => {
    const id = t.atom(scl(at[i], 1.35), xel, xlabel);
    t.bond(m, id, 1, 'auto');
    xIds.push(id);
  });
  return { t, m, rings: [rt, rb], xIds };
}

const BENT = { tilt: 30 };

/** Two rings joined through their first atoms by a bridge: one atom (SiMe₂) or two (CH₂CH₂). */
function bridge(t, [rt, rb], atoms) {
  const p = t.atoms[rt[0]], q = t.atoms[rb[0]];
  if (atoms.length === 1) {
    // on the line between them, as far out as makes both bonds 1.3 long (Si–C 1.87 Å)
    const d = Math.hypot(p.y - q.y, p.z - q.z) / 2;
    const out = Math.sqrt(Math.max(0, 1.3 ** 2 - d * d));
    const s = t.atom(v3((p.x + q.x) / 2 - out, (p.y + q.y) / 2, (p.z + q.z) / 2), atoms[0][0], atoms[0][1]);
    t.bond(rt[0], s).bond(rb[0], s);
    return [s];
  }
  // two atoms one bond apart, each a bond from its ring
  const half = Math.hypot(p.y - q.y, p.z - q.z) / 2;
  const off = Math.sqrt(Math.max(0, 1 - (half - 0.5) ** 2));
  const mid = v3((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  const dir = unit(sub3(p, q));
  const a = t.atom(addv(v3(mid.x - off, mid.y, mid.z), scl(dir, 0.5)), atoms[0][0], atoms[0][1]);
  const b = t.atom(addv(v3(mid.x - off, mid.y, mid.z), scl(dir, -0.5)), atoms[1][0], atoms[1][1]);
  t.bond(rt[0], a).bond(a, b).bond(b, rb[0]);
  return [a, b];
}

/** A benzo ring fused on the edge `i`–`j` of a ring, in its plane, away from its middle (indenyl). */
function benzo(t, ring, i, j) {
  const c = ring.reduce((s, k) => addv(s, scl(t.atoms[k], 1 / ring.length)), v3(0, 0, 0));
  const p = t.atoms[ring[i]], q = t.atoms[ring[j]];
  const mid = scl(addv(p, q), 0.5);
  const out = unit(sub3(mid, c));
  const hc = addv(mid, scl(out, Math.sqrt(3) / 2));
  // the other four corners, going on round from q
  const hex = [ring[i], ring[j]];
  // turned on 60° at a time about the hexagon's axis, the way p goes to q
  const axis = unit(cross(sub3(p, hc), sub3(q, hc)));
  const c60 = Math.cos(60 * DEG), s60 = Math.sin(60 * DEG);
  let cur = sub3(q, hc);
  for (let k = 0; k < 4; k++) {
    cur = addv(addv(scl(cur, c60), scl(cross(axis, cur), s60)), scl(axis, dot3(axis, cur) * (1 - c60)));
    hex.push(t.atom(addv(hc, cur)));
  }
  for (let k = 1; k < 6; k++) t.bond(hex[k], hex[(k + 1) % 6]);
  t.circle.push([hex[1], ...hex.slice(2), hex[0]]);
  return hex;
}

/** C₂ turn about the x axis (the bisector of a bent metallocene): (x, y, z) → (x, −y, −z). */
const c2x = (p) => v3(p.x, -p.y, -p.z);

/** rac-Ethylenebis(indenyl)MX₂ (Brintzinger's ansa-zirconocene): benzo rings one in front, one behind (C₂). */
function ebi({ el = 'Zr' } = {}) {
  const { t, rings } = bent({ el, xs: [['Cl'], ['Cl']], wedge: 126 });
  // indenyl C1 is the bridged atom (0) and C7a–C3a, next to it, carries the benzo ring: behind
  // on the top ring and in front on the bottom one (the C₂ turn takes atom k of one ring to atom
  // k of the other), so seen from above both stand clear of the metal
  const [rt, rb] = rings;
  const [i, j] = t.atoms[rt[1]].z < t.atoms[rt[4]].z ? [1, 2] : [4, 3];
  benzo(t, rt, i, j);
  benzo(t, rb, i, j);
  bridge(t, rings, [['C'], ['C']]);
  return t;
}

/** Me₂Si(η⁵-C₅Me₄)(N-t-Bu)TiCl₂, the constrained-geometry catalyst: one ring, bridged to an amido. */
function cgc() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'Ti');
  // ring middle up and a little to the left, drawn well clear of the metal; the amide down and
  // to the left (Cp–Ti–N about 115°)
  const rt = piOn(t, m, dirv(22, -90), 5, { ref: LEFT, offset: 0, methyls: [0], dist: 1.45 });
  const n = t.atom(scl(dirv(137, -90), 1.3), 'N');
  t.bond(m, n);
  const p = t.atoms[rt[0]], q = t.atoms[n];
  const mid = scl(addv(p, q), 0.5);
  const d = Math.hypot(p.x - q.x, p.y - q.y) / 2;
  const away = unit(v3(-(q.y - p.y), q.x - p.x, 0));
  const si = t.atom(addv(mid, scl(away.x < 0 ? away : scl(away, -1), Math.sqrt(Math.max(0, 1.3 ** 2 - d * d)))), 'Si', 'SiMe2');
  t.bond(rt[0], si).bond(si, n);
  t.bond(n, t.atom(addv(q, scl(dirv(165, 90), 1)), 'C', 'tBu'));
  const a = 52 * DEG;
  for (const z of [1, -1]) t.bond(m, t.atom(scl(v3(Math.cos(a), -0.15, z * Math.sin(a)), 1.35), 'Cl'), 1, 'auto');
  return t;
}

/** The Tebbe reagent Cp₂Ti(μ-CH₂)(μ-Cl)AlMe₂: a bent titanocene whose CH₂ and Cl both bridge to the aluminium. */
function tebbe() {
  const { t, xIds } = bent({ el: 'Ti', xs: [['C'], ['Cl']], xAngle: 88 });
  const [c, cl] = xIds;
  t.atoms[c].label = 'CH2';
  const al = t.atom(addv(t.atoms[c], v3(t.atoms[c].x, 0, -t.atoms[c].z)), 'Al', 'AlMe2');
  t.bond(c, al).bond(cl, al);
  return t;
}

/**
 * A metal with a ring on top and legs below (a piano stool): CpML₃, Cp*ML₃, (η⁶-arene)Cr(CO)₃,
 * CpML₂. Legs: [element, label, azimuth°] (0 in front), each 125° from the ring's middle.
 */
function stool({ el = 'C', label = el === 'C' ? 'M' : undefined, size = 5, offset, methyls = false, legs = [0, 120, 240].map((az) => ['C', 'L', az]), subs = [] } = {}) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), el, label);
  const ring = piOn(t, m, UP, size, { offset: offset ?? (size === 5 ? TOP_EDGE : 30), methyls });
  for (const [k, sel, slab] of subs) outward(t, ring, ring[k], sel, slab);
  for (const [lel, llab, az] of legs) t.bond(m, t.atom(scl(dirv(125, az), 1.35), lel, llab), 1, 'auto');
  return t;
}

/**
 * [(ring)MCl₂]₂: two piano stools sharing two chlorides, drawn the way papers draw them rather
 * than as a true view (in which the square would be seen edge on): the M₂Cl₂ square flat in the
 * page, the first metal's ring up and out to the left and its own chloride below; the second
 * half is the first turned through the middle (Cᵢ, as in the crystal).
 */
function stoolDimer({ el, size, offset = 0, methyls = false, subs = [] }) {
  const t = mol();
  const m1 = t.atom(v3(-1.15, 0, 0), el), m2 = t.atom(v3(1.15, 0, 0), el);
  for (const y of [1.0, -1.0]) { const c = t.atom(v3(0, y, 0), 'Cl'); t.bond(m1, c).bond(m2, c); }
  const firstAtom = t.atoms.length;
  // (the ring tipped towards the viewer, as if seen from a little above)
  const ring = piOn(t, m1, v3(-0.55, 0.75, 0.45), size, { ref: LEFT, offset, methyls, dist: 1.4 });
  for (const [k, sel, slab] of subs) outward(t, ring, ring[k], sel, slab);
  t.bond(m1, t.atom(addv(t.atoms[m1], scl(dirv(150, -90), 1.3)), 'Cl'));
  // the other half: every atom of the first turned through the middle
  const n = t.atoms.length;
  const map = new Map([[m1, m2]]);
  for (let i = firstAtom; i < n; i++) { const p = t.atoms[i]; map.set(i, t.atom(v3(-p.x, -p.y, -p.z), p.el, p.label)); }
  const bonds = t.bonds.filter((x) => map.has(x.a) && map.has(x.b));
  for (const x of bonds) t.bond(map.get(x.a), map.get(x.b), x.order, x.display);
  for (const [mm, ids] of [...t.hapto]) if (mm === m1) t.hapto.push([m2, ids.map((i) => map.get(i))]);
  for (const ids of [...t.circle]) t.circle.push(ids.map((i) => map.get(i)));
  return t;
}

const CO = (az) => ['C', 'CO', az];

/** [id, name, structure, view, extra template fields]. */
const METALLOCENES = [
  // sandwiches
  ['ferrocene', 'Ferrocene (staggered)', sandwich({ el: 'Fe' }).t],
  ['ferrocene-eclipsed', 'Ferrocene (eclipsed)', sandwich({ el: 'Fe', bottom: TOP_EDGE }).t],
  ['metallocene', 'Metallocene Cp₂M (eclipsed)', sandwich({ label: 'M', bottom: TOP_EDGE }).t],
  ['metallocene-staggered', 'Metallocene Cp₂M (staggered)', sandwich({ label: 'M' }).t],
  ['decamethylferrocene', 'Decamethylferrocene Cp*₂Fe', sandwich({ el: 'Fe', methyls: true }).t],
  ['ferrocenium', 'Ferrocenium [Cp₂Fe]⁺', sandwich({ el: 'Fe', charge: 1 }).t],
  ['cobaltocenium', 'Cobaltocenium [Cp₂Co]⁺', sandwich({ el: 'Co', charge: 1 }).t],
  ['bis-benzene-cr', 'Bis(benzene)chromium', sandwich({ el: 'Cr', size: 6, top: 30, bottom: 30 }).t],
  ['uranocene', 'Uranocene (η⁸-C₈H₈)₂U', sandwich({ el: 'U', size: 8, top: 22.5, bottom: 22.5, dist: 1.4 }).t],
  // substituted ferrocenes
  // (a corner to the left, where the group goes: offset 270)
  // (a corner of each ring to the left, where the groups go: offset 270 above, 90 below, where
  // the ring is seen the other way up)
  ['ferrocenyl', 'Ferrocenyl group Fc– (joins a clicked atom)', sandwich({ el: 'Fe', top: 270, bottom: 90 }).t, SANDWICH, { attach: 1, join: 'bond', upright: true }],
  ['ferrocene-11', '1,1′-Disubstituted ferrocene', sandwich({ el: 'Fe', top: 270, bottom: 90, subs: [[0, 0, 'R'], [1, 0, 'R']] }).t],
  // (on the back corner and the one to its left, clear of the iron)
  ['ferrocene-12', '1,2-Disubstituted ferrocene (planar chiral)', sandwich({ el: 'Fe', subs: [[0, 1, 'R1'], [0, 0, 'R2']] }).t],
  // bent metallocenes
  ['bent-metallocene', 'Bent metallocene Cp₂MX₂', bent({ label: 'M' }).t, BENT],
  ['cp2ticl2', 'Titanocene dichloride Cp₂TiCl₂', bent({ el: 'Ti', xs: [['Cl'], ['Cl']] }).t, BENT],
  ['cp2zrcl2', 'Zirconocene dichloride Cp₂ZrCl₂', bent({ el: 'Zr', xs: [['Cl'], ['Cl']] }).t, BENT],
  ['schwartz', 'Schwartz reagent Cp₂Zr(H)Cl', bent({ el: 'Zr', xs: [['H'], ['Cl']] }).t, BENT],
  ['petasis', 'Petasis reagent Cp₂TiMe₂', bent({ el: 'Ti', xs: [['C', 'Me'], ['C', 'Me']] }).t, BENT],
  ['tebbe', 'Tebbe reagent Cp₂Ti(μ-CH₂)(μ-Cl)AlMe₂', tebbe(), { tilt: 38 }],
  ['cp2ticl', 'Titanocene(III) chloride Cp₂TiCl', bent({ el: 'Ti', xs: [['Cl']], wedge: 134 }).t, BENT],
  ['cp2mx2-star', 'Bent Cp*₂MX₂', bent({ label: 'M', methyls: true, wedge: 145, offset: 36, dist: 1.4 }).t, BENT],
  // ansa-metallocenes
  ['ansa-sime2', 'ansa-Metallocene Me₂Si(Cp)₂MX₂', (() => { const b = bent({ label: 'M', wedge: 124 }); bridge(b.t, b.rings, [['Si', 'SiMe2']]); return b.t; })(), BENT],
  ['ansa-ch2ch2', 'ansa-Metallocene (CH₂CH₂)(Cp)₂MX₂', (() => { const b = bent({ label: 'M', wedge: 126 }); bridge(b.t, b.rings, [['C'], ['C']]); return b.t; })(), BENT],
  ['ebi-zrcl2', 'rac-(EBI)ZrCl₂, ethylenebis(indenyl)', ebi(), BENT],
  ['cgc', 'Constrained-geometry catalyst Me₂Si(C₅Me₄)(Nt-Bu)TiCl₂', cgc(), { tilt: 20 }],
  // half-sandwiches
  ['cpml3', 'Half-sandwich CpML₃ (piano stool)', stool(), { tilt: 20 }],
  ['cpstarml3', 'Half-sandwich Cp*ML₃', stool({ methyls: true }), { tilt: 20 }],
  ['arene-ml3', '(η⁶-Arene)ML₃', stool({ size: 6 }), { tilt: 20 }],
  ['cpml2', 'Half-sandwich CpML₂', stool({ legs: [['C', 'L', 90], ['C', 'L', -90]] }), { tilt: 20 }],
  ['arene-cr-co3', '(η⁶-Benzene)Cr(CO)₃', stool({ el: 'Cr', size: 6, legs: [CO(0), CO(120), CO(240)] }), { tilt: 20 }],
  ['cpmn-co3', 'Cymantrene CpMn(CO)₃', stool({ el: 'Mn', legs: [CO(0), CO(120), CO(240)] }), { tilt: 20 }],
  ['fp-r', 'Fp–R, CpFe(CO)₂R', stool({ el: 'Fe', legs: [CO(120), CO(240), ['C', 'R', 0]] }), { tilt: 20 }],
  ['cpstar-rh-dimer', '[Cp*RhCl₂]₂', stoolDimer({ el: 'Rh', size: 5, offset: 36, methyls: true }), {}],
  ['cymene-ru-dimer', '[(p-Cymene)RuCl₂]₂', stoolDimer({ el: 'Ru', size: 6, offset: 90, subs: [[1, 'C'], [4, 'C', 'iPr']] }), {}],
].map(([id, name, t, view = SANDWICH, extra = {}]) => [id, name, project(t, view), extra]);

// ------------------------------------------------------------------ ligands

/** A ligand on its own metal M (atom 0), from SMILES laid out by RDKit. */
function rdLigand(smiles, labels = {}) {
  // CoordGen lays a metal's bonds out short; a silicon in its place is laid out like any atom
  const m = RDKit.get_mol(smiles.replace('[Pd]', '[Si]'));
  if (!m) throw new Error(`RDKit could not read: ${smiles}`);
  m.set_new_coords(true);
  const t = parseMolblock(m.get_molblock());
  m.delete();
  // the metal on the left, the ligand to its right
  const M = t.atoms[0];
  const rest = t.atoms.slice(1);
  const cx = rest.reduce((s, p) => s + p.x, 0) / rest.length - M.x, cy = rest.reduce((s, p) => s + p.y, 0) / rest.length - M.y;
  const a = -Math.atan2(cy, cx);
  const mx = M.x, my = M.y;
  for (const p of t.atoms) {
    const x = (p.x - mx) * Math.cos(a) - (p.y - my) * Math.sin(a), y = (p.x - mx) * Math.sin(a) + (p.y - my) * Math.cos(a);
    p.x = x; p.y = y;
  }
  // bond length 1
  const k = t.bonds.length / t.bonds.reduce((s, b) => s + Math.hypot(t.atoms[b.a].x - t.atoms[b.b].x, t.atoms[b.a].y - t.atoms[b.b].y), 0);
  for (const p of t.atoms) { p.x *= k; p.y *= k; }
  t.atoms[0].el = 'C';
  t.atoms[0].label = 'M';
  for (const p of t.atoms) {
    p.charge = 0;
    if (labels[p.el]) p.label = labels[p.el];
  }
  // aromatic rings come back Kekulé (bond orders 1 and 2), as drawn
  return { atoms: t.atoms, bonds: t.bonds.map((b) => ({ ...b, display: b.stereo === 1 ? 'wedge' : b.stereo === 6 ? 'hashWedge' : undefined })), hapto: [], circle: [] };
}

/** A straight-line ligand: M–C≡O, M–N≡C–CH₃. */
function linear(els, orders) {
  const atoms = [{ x: 0, y: 0, el: 'C', label: 'M' }, ...els.map((el, i) => ({ x: i + 1, y: 0, el }))];
  return { atoms, bonds: orders.map((o, i) => ({ a: i, b: i + 1, order: o })), hapto: [], circle: [] };
}

/** A π-ligand bonded side-on to M: a ring (Cp, Cp*, benzene) seen from a little above. */
function piRing(size, opts = {}) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  piOn(t, m, UP, size, { offset: size === 5 ? TOP_EDGE : 30, ...opts });
  return project(t, SANDWICH);
}

function piAllyl() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const c1 = t.atom(v3(-0.866, 0.95, 0)), c2 = t.atom(v3(0, 1.45, 0)), c3 = t.atom(v3(0.866, 0.95, 0));
  t.bond(c1, c2, 1.5).bond(c2, c3, 1.5);
  t.hapto.push([m, [c1, c2, c3]]);
  return project(t);
}

function piEthylene() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const a = t.atom(v3(-0.5, 1.2, 0)), b = t.atom(v3(0.5, 1.2, 0));
  t.bond(a, b, 2);
  t.hapto.push([m, [a, b]]);
  return project(t);
}

/**
 * η²,η²-1,5-Cyclooctadiene in its tub shape: both C=C bonds upright and facing the metal, one
 * in front and one behind, joined by CH₂CH₂ bridges over the top and under the bottom; turned
 * so the two don't hide each other.
 */
function cod(view = { tilt: 20, turnY: 50 }) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const X = 1.25, X2 = 1.95, Y = 0.5, Y2 = 1.0, Z = 0.7, Z2 = 0.45;
  const c1 = t.atom(v3(X, Y, Z)), c2 = t.atom(v3(X, -Y, Z));
  const c3 = t.atom(v3(X2, -Y2, Z2)), c4 = t.atom(v3(X2, -Y2, -Z2));
  const c5 = t.atom(v3(X, -Y, -Z)), c6 = t.atom(v3(X, Y, -Z));
  const c7 = t.atom(v3(X2, Y2, -Z2)), c8 = t.atom(v3(X2, Y2, Z2));
  t.bond(c1, c2, 2).bond(c2, c3).bond(c3, c4).bond(c4, c5).bond(c5, c6, 2).bond(c6, c7).bond(c7, c8).bond(c8, c1);
  t.hapto.push([m, [c1, c2]], [m, [c5, c6]]);
  return project(t, view);
}

/**
 * A 1,1′-bis(phosphino)ferrocene chelating M (dppf and its PR₂ kin): the two Cp rings above and
 * below the iron, each with its PR₂ bonded on to M.
 */
function ferroBis(label = 'PPh2') {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const fe = t.atom(v3(-2.45, 0, 0), 'Fe');
  const top = hapto(t, fe, v3(0, 1, 0), 5, 180, { dist: 1.25 });
  const bottom = hapto(t, fe, v3(0, -1, 0), 5, 180, { dist: 1.25 });
  for (const ring of [top, bottom]) {
    // the ring carbon nearest M carries the phosphorus
    const c = ring.reduce((best, i) => (t.atoms[i].x > t.atoms[best].x ? i : best), ring[0]);
    const q = t.atoms[c];
    const p = t.atom(v3(q.x + 0.85, q.y * 1.15, q.z), 'P', label);
    t.bond(c, p).bond(m, p);
  }
  return project(t, SANDWICH);
}
const dppf = () => ferroBis('PPh2');

/**
 * A Josiphos ligand on M: the upper Cp ring of a ferrocene carries PR₂ (on the carbon nearest M)
 * and, on the carbon beside it at the front, CH(CH₃)PR′₂; both phosphorus atoms bond to M,
 * closing a six-membered chelate ring. The lower ring is plain.
 */
function josiphos(ringP = 'PPh2', armP = 'PCy2') {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const fe = t.atom(v3(-2.6, -0.9, 0), 'Fe');
  const top = hapto(t, fe, v3(0, 1, 0), 5, 180, { dist: 1.25 });
  hapto(t, fe, v3(0, -1, 0), 5, 180, { dist: 1.25 });
  const c1 = top.reduce((best, i) => (t.atoms[i].x > t.atoms[best].x ? i : best), top[0]);
  const k = top.indexOf(c1);
  // its neighbour round the ring towards the front
  const [na, nb] = [top[(k + 1) % 5], top[(k + 4) % 5]];
  const c2 = t.atoms[na].z > t.atoms[nb].z ? na : nb;
  // PR₂ out and up from the ring like dppf's; the arm's CH(CH₃) out in front, its PR′₂ down
  // and to the right, so the two phosphorus atoms sit one above the other with M beside them
  const q = t.atoms[c1];
  const p1 = t.atom(v3(q.x + 0.85, q.y + 0.55, q.z), 'P', ringP);
  t.bond(c1, p1);
  const cs = t.atom(addv(t.atoms[c2], v3(0.6, -0.5, 0.5)));
  t.bond(c2, cs);
  const p2 = t.atom(addv(t.atoms[cs], v3(0.8, -0.6, 0)), 'P', armP);
  t.bond(cs, p2).bond(m, p2).bond(m, p1);
  t.bond(cs, t.atom(addv(t.atoms[cs], v3(-0.6, -0.8, 0))));
  bridgeMetal(t, m, p1, p2, 1.3);
  return project(t, SANDWICH);
}

/** Puts metal `m` out beyond the middle of donors `a` and `b`, `d` from each, away from the rest. */
function bridgeMetal(t, m, a, b, d) {
  const A = t.atoms[a], B = t.atoms[b];
  const mid = scl(addv(A, B), 0.5);
  const half = len(sub3(A, B)) / 2;
  const rest = t.atoms.filter((_, i) => i !== m && i !== a && i !== b);
  const c = rest.reduce((s, p) => addv(s, scl(p, 1 / rest.length)), v3(0, 0, 0));
  const ab = unit(sub3(B, A));
  let out = sub3(mid, c);
  out = unit(sub3(out, scl(ab, dot3(out, ab))));
  Object.assign(t.atoms[m], addv(mid, scl(out, Math.sqrt(Math.max(0.25, d * d - half * half)))));
}

/** Q-Phos on M: a ferrocene with PtBu₂ on the upper ring (bonded to M) and five phenyls on the lower one. */
function qphos() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const fe = t.atom(v3(-2.45, -0.8, 0), 'Fe');
  const top = hapto(t, fe, v3(0, 1, 0), 5, 180, { dist: 1.25 });
  const bottom = hapto(t, fe, v3(0, -1, 0), 5, 180, { dist: 1.25 });
  const c = top.reduce((best, i) => (t.atoms[i].x > t.atoms[best].x ? i : best), top[0]);
  const p = outward(t, top, c, 'P', 'P(t-Bu)2');
  t.bond(m, p);
  for (const i of bottom) outward(t, bottom, i, 'C', 'Ph');
  // the metal a bond on from P, out and a little down from the ring
  Object.assign(t.atoms[m], addv(t.atoms[p], v3(0.45, -1.0, 0)));
  return project(t, SANDWICH);
}

/**
 * Triphos-style tripod MeC(CH₂PR₂)₃ capping M (κ³): M at the bottom, two PR₂ in front (left and
 * right) and one behind, spread so their labels stand apart, the CH₂ arms going up to the
 * quaternary carbon over them; seen from above. (Its numbers were found by trying many and keeping
 * the one with the most room between atoms and labels.)
 */
function tripod(label = 'PPh2') {
  const t = mol();
  const m = t.atom(v3(0, -0.5, 0), 'C', 'M');
  const cq = t.atom(v3(0, 2.5, 0));
  t.bond(cq, t.atom(v3(0, 3.5, 0)));
  const at = (az, r, y) => v3(r * Math.sin(az * DEG), y, r * Math.cos(az * DEG));
  for (const az of [60, 180, 300]) {
    const p = t.atom(at(az, 1.6, 0.4), 'P', label);
    // each arm swings round a little on its way up, so the one behind doesn't hide under the top
    const ch2 = t.atom(at(az + 30, 1.2, 1.8));
    t.bond(m, p).bond(p, ch2).bond(ch2, cq);
  }
  return project(t, { tilt: 20, turnY: 30 });
}

/**
 * A tripodal N₄ amine on M (tren, Me₆tren): the bridgehead N straight above M and the three
 * CH₂CH₂ arms coming down round it to amines (labelled `label`) below, one in front and two
 * behind, each arm swinging round a little (a propeller) so the front one is not drawn over the
 * M–N bond; seen from just above.
 */
function tripodN(label) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const na = t.atom(v3(0, 1.1, 0), 'N');
  t.bond(m, na);
  const at = (az, r, y) => v3(r * Math.sin(az * DEG), y, r * Math.cos(az * DEG));
  for (const az of [0, 120, 240]) {
    const d = t.atom(at(az, 1.3, -0.2), 'N', label);
    const c1 = t.atom(at(az + 30, 1.2, 1.55));
    const c2 = t.atom(at(az + 20, 1.9, 0.6));
    t.bond(na, c1).bond(c1, c2).bond(c2, d).bond(m, d);
  }
  return project(t, { tilt: 30 });
}

/**
 * BISBI-style 2,2′-bis(PR₂CH₂)biphenyl chelating M, drawn flat: M on the left, the two PR₂ above
 * and below it, the biphenyl standing upright to their right so M sits outside the big ring.
 */
function bisbi(label = 'PPh2') {
  const atoms = [{ x: 0, y: 0, el: 'C', label: 'M' }];
  const bonds = [];
  const add = (x, y, el = 'C', lab) => { atoms.push({ x, y, el, ...(lab ? { label: lab } : {}) }); return atoms.length - 1; };
  const c1s = [];
  for (const s of [-1, 1]) {
    const p = add(0.75, 0.7 * s, 'P', label);
    const ch2 = add(1.5, 1.366 * s);
    // the ring: C2 (bonded to CH2), C1 (to the other ring), then round
    const cx = 3.5, cy = 1.366 * s;
    const ring = [180, 240, 300, 0, 60, 120].map((a) => add(cx + Math.cos(a * DEG), cy + s * Math.sin(a * DEG)));
    for (let k = 0; k < 6; k++) bonds.push({ a: ring[k], b: ring[(k + 1) % 6], order: k % 2 ? 1 : 2 });
    bonds.push({ a: 0, b: p, order: 1 }, { a: p, b: ch2, order: 1 }, { a: ch2, b: ring[0], order: 1 });
    c1s.push(ring[1]);
  }
  bonds.push({ a: c1s[0], b: c1s[1], order: 1 });
  return { atoms, bonds, hapto: [], circle: [] };
}

/** An η³-allyl with groups on it: [carbon (0 end, 1 middle, 2 other end), label or undefined for a methyl]. */
function allylWith(subs) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const c = [t.atom(v3(-0.866, 0.95, 0)), t.atom(v3(0, 1.45, 0)), t.atom(v3(0.866, 0.95, 0))];
  t.bond(c[0], c[1], 1.5).bond(c[1], c[2], 1.5);
  t.hapto.push([m, c]);
  for (const [k, label] of subs) {
    // out from the allyl's middle: straight up from C2, out and up from an end (syn)
    const d = k === 1 ? v3(0, 1, 0) : v3(k === 0 ? -0.87 : 0.87, 0.5, 0);
    t.bond(c[k], t.atom(addv(t.atoms[c[k]], d), 'C', label));
  }
  return project(t);
}

/** η⁴-s-cis-1,3-butadiene: the four carbons in an arc over the metal, bonded to their middle. */
function piButadiene() {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const c = [t.atom(v3(-1.15, 0.85, 0.25)), t.atom(v3(-0.5, 1.6, 0)), t.atom(v3(0.5, 1.6, 0)), t.atom(v3(1.15, 0.85, 0.25))];
  t.bond(c[0], c[1], 2).bond(c[1], c[2]).bond(c[2], c[3], 2);
  t.hapto.push([m, c]);
  return project(t, { tilt: 15 });
}

/** η²,η²-Norbornadiene: both C=C bonds upright and facing the metal, the bridgeheads above and below, the CH₂ bridge at the back. */
function nbd(view = { tilt: 20, turnY: 50 }) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const X = 1.25, Y = 0.5, Z = 0.7;
  const c2 = t.atom(v3(X, Y, Z)), c3 = t.atom(v3(X, -Y, Z)), c6 = t.atom(v3(X, Y, -Z)), c5 = t.atom(v3(X, -Y, -Z));
  const c1 = t.atom(v3(X + 0.45, 1.15, 0)), c4 = t.atom(v3(X + 0.45, -1.15, 0)), c7 = t.atom(v3(X + 1.35, 0, 0));
  t.bond(c2, c3, 2).bond(c6, c5, 2).bond(c1, c2).bond(c1, c6).bond(c4, c3).bond(c4, c5).bond(c1, c7).bond(c7, c4);
  t.hapto.push([m, [c2, c3]], [m, [c6, c5]]);
  return project(t, view);
}

/** A π ring on M with methyls on the atoms listed (by place round the ring). */
function piRingMethyls(size, at) {
  const t = mol();
  const m = t.atom(v3(0, 0, 0), 'C', 'M');
  const r = piOn(t, m, UP, size, { offset: size === 5 ? TOP_EDGE : 30 });
  for (const k of at) outward(t, r, r[k]);
  return project(t, SANDWICH);
}

const PPH2 = { P: 'PPh2' };
const LIGANDS = [
  ['pph3', 'Triphenylphosphine PPh₃', rdLigand('[Pd][P+](c1ccccc1)(c1ccccc1)c1ccccc1')],
  ['pcy3', 'Tricyclohexylphosphine PCy₃', rdLigand('[Pd][P+](C1CCCCC1)(C1CCCCC1)C1CCCCC1')],
  ['ptbu3', 'Tri-tert-butylphosphine P(t-Bu)₃', rdLigand('[Pd][P+](C(C)(C)C)(C(C)(C)C)C(C)(C)C')],
  ['xphos', 'XPhos', rdLigand('[Pd][PH2+]c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C', { P: 'PCy2' })],
  ['sphos', 'SPhos', rdLigand('[Pd][PH2+]c1ccccc1-c1c(OC)cccc1OC', { P: 'PCy2' })],
  ['dppe', 'dppe (chelating)', rdLigand('[Pd]1[PH2+]CC[PH2+]1', PPH2)],
  ['dppp', 'dppp (chelating)', rdLigand('[Pd]1[PH2+]CCC[PH2+]1', PPH2)],
  ['dppf', 'dppf (chelating)', dppf()],
  ['binap', 'BINAP (chelating)', rdLigand('[Pd]1[PH2+]c2ccc3ccccc3c2-c2c([PH2+]1)ccc1ccccc21', PPH2)],
  ['xantphos', 'Xantphos (chelating)', rdLigand('[Pd]1[PH2+]c2cccc3c2Oc2c(cccc2C3(C)C)[PH2+]1', PPH2)],
  ['imes', 'IMes (N-heterocyclic carbene)', rdLigand('[Pd]C1N(c2c(C)cc(C)cc2C)C=CN1c1c(C)cc(C)cc1C')],
  ['ipr', 'IPr (N-heterocyclic carbene)', rdLigand('[Pd]C1N(c2c(C(C)C)cccc2C(C)C)C=CN1c1c(C(C)C)cccc1C(C)C')],
  ['co', 'Carbonyl CO', linear(['C', 'O'], [1, 3])],
  ['mecn', 'Acetonitrile MeCN', linear(['N', 'C', 'C'], [1, 3, 1])],
  ['py', 'Pyridine', rdLigand('[Pd][n+]1ccccc1')],
  ['bipy', '2,2′-Bipyridine (chelating)', rdLigand('[Pd]1[n+]2ccccc2-c2cccc[n+]12')],
  ['phen', '1,10-Phenanthroline (chelating)', rdLigand('[Pd]1[n+]2cccc3ccc4ccc[n+]1c4c23')],
  ['tmeda', 'TMEDA (chelating)', rdLigand('[Pd]1[N+](C)(C)CC[N+]1(C)C')],
  ['en', 'Ethylenediamine (chelating)', rdLigand('[Pd]1[NH2+]CC[NH2+]1', { N: 'NH2' })],
  ['acac', 'Acetylacetonate acac (chelating)', rdLigand('[Pd]1OC(C)=CC(C)=[O+]1')],
  ['cp', 'η⁵-Cyclopentadienyl Cp', piRing(5)],
  ['cpstar', 'η⁵-Pentamethylcyclopentadienyl Cp*', piRing(5, { methyls: true })],
  ['benzene', 'η⁶-Benzene', piRing(6)],
  ['cymene', 'η⁶-p-Cymene', project((() => { const t = mol(); const m = t.atom(v3(0, 0, 0), 'C', 'M'); const r = piOn(t, m, UP, 6, { offset: 30 }); outward(t, r, r[4]); outward(t, r, r[1], 'C', 'iPr'); return t; })(), SANDWICH)],
  ['indenyl', 'η⁵-Indenyl Ind', project((() => { const t = mol(); const m = t.atom(v3(0, 0, 0), 'C', 'M'); const r = piOn(t, m, UP, 5, { offset: 0 }); benzo(t, r, 2, 3); return t; })(), SANDWICH)],
  ['allyl', 'η³-Allyl', piAllyl()],
  ['ethylene', 'η²-Ethylene', piEthylene()],
  ['cod', 'η⁴-1,5-Cyclooctadiene COD', cod()],
];

/** Ligands for the Ligand Library only (not on the Ligands palette): shapes built in 3-D. */
const LIBRARY_LIGANDS = [
  ['dippf', 'dippf (chelating)', ferroBis('PiPr2')],
  ['dcypf', 'dcypf (chelating)', ferroBis('PCy2')],
  ['dtbpf', 'dtbpf (chelating)', ferroBis('P(t-Bu)2')],
  ['josiphos', 'Josiphos SL-J001 (chelating)', josiphos('PPh2', 'PCy2')],
  ['josiphos-tbu', 'Josiphos SL-J002 (chelating)', josiphos('PPh2', 'P(t-Bu)2')],
  ['josiphos-cy', 'Josiphos SL-J009 (chelating)', josiphos('PCy2', 'P(t-Bu)2')],
  ['qphos', 'Q-Phos', qphos()],
  ['triphos', 'triphos (κ³)', tripod('PPh2')],
  ['bisbi', 'BISBI (chelating)', bisbi('PPh2')],
  ['tbuxantphos', 't-Bu-Xantphos (chelating)', rdLigand('[Pd]1[PH2+]c2cccc3c2Oc2c(cccc2C3(C)C)[PH2+]1', { P: 'P(t-Bu)2' })],
  ['nixantphos', 'NiXantphos (chelating)', rdLigand('[Pd]1[PH2+]c2cccc3c2Oc2c(cccc2N3)[PH2+]1', { P: 'PPh2' })],
  ['tren', 'tren (κ⁴)', tripodN('NH2')],
  ['me6tren', 'Me₆tren (κ⁴)', tripodN('NMe2')],
  ['cpme', 'η⁵-Methylcyclopentadienyl Cp′', piRingMethyls(5, [2])],
  ['mesitylene', 'η⁶-Mesitylene', piRingMethyls(6, [0, 2, 4])],
  ['c6me6', 'η⁶-Hexamethylbenzene', piRing(6, { methyls: true })],
  ['nbd', 'η⁴-Norbornadiene NBD', nbd()],
  ['butadiene', 'η⁴-1,3-Butadiene', piButadiene()],
  ['methallyl', 'η³-2-Methylallyl', allylWith([[1]])],
  ['crotyl', 'η³-Crotyl', allylWith([[0]])],
  ['cinnamyl', 'η³-Cinnamyl', allylWith([[2, 'Ph']])],
];

// ------------------------------------------------------------------ molfiles and output

function parseMolblock(mb) {
  const lines = mb.split('\n');
  const na = parseInt(lines[3].slice(0, 3), 10), nb = parseInt(lines[3].slice(3, 6), 10);
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    // molfiles have y up; the page has y down
    atoms.push({ x: parseFloat(l.slice(0, 10)), y: -parseFloat(l.slice(10, 20)), el: l.slice(31, 34).trim(), charge: 0 });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push({ a: parseInt(l.slice(0, 3), 10) - 1, b: parseInt(l.slice(3, 6), 10) - 1, order: parseInt(l.slice(6, 9), 10), stereo: parseInt(l.slice(9, 12), 10) || 0 });
  }
  return { atoms, bonds };
}

/** Centred on the middle of the box round its atoms. */
function centre(t) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of t.atoms) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  for (const p of t.atoms) { p.x -= (x1 + x2) / 2; p.y -= (y1 + y2) / 2; }
}

function finish(t, group, id, name, extra = {}) {
  centre(t);
  const { attach, ...more } = extra;
  // a group drawn upright that joins a clicked atom has its middle level with the atom it joins by,
  // so it goes on without being turned
  if (extra.upright) { const y0 = t.atoms[attach].y; for (const p of t.atoms) p.y -= y0; }
  return {
    id, name, group,
    atoms: t.atoms.map((p) => [r3(p.x), r3(p.y), p.el, ...(p.charge || p.label ? [p.charge ?? 0] : []), ...(p.label ? [p.label] : [])]),
    bonds: t.bonds.map((b) => [b.a, b.b, b.order, ...(b.display ? [b.display] : [])]),
    // the metal: put on a metal that is clicked (ligands), or the middle of the complex
    attach: attach ?? (group === 'metallocenes' ? 0 : t.atoms.findIndex((p) => p.label === 'M' || p.el === 'Fe')),
    ...(group === 'ligands' || group === 'ligand-lib' || group === 'geometries' ? { onMetal: true } : {}),
    ...more,
    ...(t.hapto.length ? { hapto: t.hapto.map(([m, ids]) => [m, ids]) } : {}),
    ...(t.circle.length ? { circle: t.circle } : {}),
  };
}

const out = [
  ...GEOMETRIES.map(([id, name, t]) => finish(t, 'geometries', id, name)),
  ...COMPLEXES.map(([id, name, t]) => finish(t, 'organometallic', id, name)),
  ...METALLOCENES.map(([id, name, t, extra]) => finish(t, 'metallocenes', id, name, extra)),
  ...LIGANDS.map(([id, name, t]) => finish(t, 'ligands', id, name)),
  ...LIBRARY_LIGANDS.map(([id, name, t]) => finish(t, 'ligand-lib', id, name)),
];
for (const t of out) if (t.attach < 0) { console.error(`${t.id}: no metal`); process.exit(1); }
const file = path.join(root, 'src', 'chem', 'metal-templates.json');
fs.writeFileSync(file, '[\n' + out.map((t) => '  ' + JSON.stringify(t)).join(',\n') + '\n]\n');
console.log(`Wrote ${out.length} templates to ${path.relative(root, file)}`);
