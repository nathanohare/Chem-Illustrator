// Choosing a view of a 3-D model that draws cleanly flat on the page (the 3-D Model window's
// Place on Page and Best View). From most angles some atoms land on top of others, a bond runs
// through an atom, or a bond points at the reader and shrinks to a dot; such a view makes a
// tangled drawing. These score a view by how much of that it has, and search for a better one.

export type M3 = [number, number, number, number, number, number, number, number, number];
export type P3 = [number, number, number];

export const ident = (): M3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const mul = (a: M3, b: M3): M3 => {
  const r = new Array(9).fill(0) as M3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};

/** A turn by `t` radians about the unit axis (x, y, z). */
export function axisTurn(x: number, y: number, z: number, t: number): M3 {
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}

export const turn = (r: M3, pts: P3[]): P3[] => pts.map(([x, y, z]) => [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z, r[6] * x + r[7] * y + r[8] * z]);

/** The structure a view is judged on: the atoms drawn (heavy atoms) and the bonds between them. */
export interface Skeleton {
  atoms: number[];
  bonds: [number, number][];
  /** Mean bond length (Å). */
  L: number;
}

/** The heavy atoms and their bonds of a model (atomic numbers and bonds by atom index). */
export function skeleton(z: number[], bonds: { a: number; b: number }[], pts: P3[]): Skeleton {
  const atoms = z.map((_, i) => i).filter((i) => z[i] !== 1);
  const bs = bonds.filter((b) => z[b.a] !== 1 && z[b.b] !== 1).map((b) => [b.a, b.b] as [number, number]);
  const lens = bs.map(([a, b]) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1], pts[a][2] - pts[b][2]));
  return { atoms, bonds: bs, L: lens.length ? lens.reduce((s, v) => s + v, 0) / lens.length : 1.5 };
}

/** Atoms nearer than this (in bond lengths) look like one on top of the other. */
const NEAR_ATOM = 0.45;
/** An atom nearer than this to a bond it isn't on looks as if it sits on the bond. */
const NEAR_BOND = 0.22;
/** Nearer than these, the drawing's checks flag the atom (warnings.ts: 0.2 and 0.1, with room to spare). */
const HIT_ATOM = 0.3;
const HIT_BOND = 0.15;
/** A bond shorter than this as seen points almost at the reader. */
const SHORT_BOND = 0.45;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function cross(p: P3, q: P3, r: P3, s: P3): boolean {
  const o = (a: P3, b: P3, c: P3) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
}

/**
 * How tangled a view (positions as seen, x and y on the page) would look drawn flat: 0 when no
 * atoms overlap, no bond runs through an atom, no bond shrinks to a dot and no bonds cross.
 * Overlaps count most, crossings least (a crossing drawn with depth still reads).
 */
export function clutter(view: P3[], sk: Skeleton): { score: number; overlaps: number } {
  // `overlaps`: atoms the drawing's own checks would flag as on top of an atom or a bond
  const { atoms, bonds, L } = sk;
  const bonded = new Set(bonds.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)));
  let score = 0, overlaps = 0;
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    const a = atoms[i], b = atoms[j];
    if (bonded.has(a < b ? `${a},${b}` : `${b},${a}`)) continue;
    const d = Math.hypot(view[a][0] - view[b][0], view[a][1] - view[b][1]) / L;
    if (d < NEAR_ATOM) { score += 3 + 3 * (1 - d / NEAR_ATOM); if (d < HIT_ATOM) overlaps++; }
  }
  for (const [a, b] of bonds) {
    const len = Math.hypot(view[a][0] - view[b][0], view[a][1] - view[b][1]) / L;
    if (len < SHORT_BOND) score += 1.5 * (1 - len / SHORT_BOND) + 0.5;
    for (const c of atoms) {
      if (c === a || c === b) continue;
      const d = segDist(view[c][0], view[c][1], view[a][0], view[a][1], view[b][0], view[b][1]) / L;
      if (d < NEAR_BOND) { score += 3; if (d < HIT_BOND) overlaps++; }
    }
  }
  for (let i = 0; i < bonds.length; i++) for (let j = i + 1; j < bonds.length; j++) {
    const [a, b] = bonds[i], [c, d] = bonds[j];
    if (a === c || a === d || b === c || b === d) continue;
    if (cross(view[a], view[b], view[c], view[d])) score += 1;
  }
  return { score, overlaps };
}

/** Evenly spread directions (a Fibonacci sphere). */
function directions(n: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = i * Math.PI * (3 - Math.sqrt(5));
    out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return out;
}

/**
 * The smallest turn (up to `maxDeg`) of the view `rot` (of the model at `base`) after which no
 * atom sits on another or on a bond, the cleanest such view at that turn; null when there is
 * none that near. Returns `rot` itself when it has no overlaps.
 */
export function cleanerNearby(base: P3[], rot: M3, sk: Skeleton, maxDeg = 45): { rot: M3; deg: number } | null {
  if (clutter(turn(rot, base), sk).overlaps === 0) return { rot, deg: 0 };
  // turns about axes in the page (a turn about the line of sight changes nothing)
  const axes = directions(64).filter(([, , z]) => Math.abs(z) < 0.95);
  for (let deg = 3; deg <= maxDeg; deg += 3) {
    let best: { rot: M3; score: number } | null = null;
    for (const [x, y, z] of axes) {
      const r = mul(axisTurn(x, y, z, (deg * Math.PI) / 180), rot);
      const c = clutter(turn(r, base), sk);
      if (c.overlaps === 0 && (!best || c.score < best.score)) best = { rot: r, score: c.score };
    }
    if (best) return { rot: best.rot, deg };
  }
  return null;
}

/**
 * The view of the model that draws most cleanly (fewest overlaps and crossings, then flattest),
 * turned in the page to lie as much like `drawn` (page positions, by atom index) as it can.
 */
export function cleanestView(base: P3[], sk: Skeleton, drawn?: ({ x: number; y: number } | null)[] | null): M3 {
  let best: { rot: M3; cost: number } = { rot: ident(), cost: Infinity };
  const depth = (v: P3[]) => Math.sqrt(sk.atoms.reduce((s, i) => s + v[i][2] ** 2, 0) / Math.max(1, sk.atoms.length)) / sk.L;
  // the line of sight from 200 directions; the turn about it doesn't matter yet
  for (const [x, y, z] of directions(200)) {
    // the turn that brings this direction to face the reader (to +z), about direction × z
    const ax = y, ay = -x, n = Math.hypot(ax, ay);
    const r = n < 1e-9 ? (z > 0 ? ident() : axisTurn(1, 0, 0, Math.PI)) : axisTurn(ax / n, ay / n, 0, Math.acos(Math.max(-1, Math.min(1, z))));
    const v = turn(r, base);
    const cost = clutter(v, sk).score + 0.3 * depth(v);
    if (cost < best.cost) best = { rot: r, cost };
  }
  let rot = best.rot;
  // in the page, turn it to lie like the drawing
  if (drawn) {
    const v = turn(rot, base);
    const pts = drawn.flatMap((p, i) => (p && v[i] ? [{ x: p.x, y: -p.y, v: v[i] }] : [])); // the drawing's y runs down the page
    if (pts.length >= 2) {
      const n = pts.length;
      const pcx = pts.reduce((s, t) => s + t.x, 0) / n, pcy = pts.reduce((s, t) => s + t.y, 0) / n;
      const vcx = pts.reduce((s, t) => s + t.v[0], 0) / n, vcy = pts.reduce((s, t) => s + t.v[1], 0) / n;
      let dot = 0, crs = 0;
      for (const t of pts) {
        const ax = t.v[0] - vcx, ay = t.v[1] - vcy, bx = t.x - pcx, by = t.y - pcy;
        dot += ax * bx + ay * by;
        crs += ax * by - ay * bx;
      }
      rot = mul(axisTurn(0, 0, 1, Math.atan2(crs, dot)), rot);
    }
  }
  return rot;
}
