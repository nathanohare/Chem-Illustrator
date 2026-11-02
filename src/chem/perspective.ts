// Turning a drawn structure in perspective (the Perspective tools). Two ways:
//
// - Flat, the way ChemDraw does it: the drawing is taken as a flat sheet (with whatever depth
//   its atoms already have) and the sheet is turned, so its picture is foreshortened.
// - In 3-D: the structure's real shape is built (OpenChemLib conformers, see pose3d.ts) and that
//   is turned, so a molecule that isn't flat, such as BINAP with its two naphthalenes at right
//   angles, shows its true shape from every side.
//
// Everything here works in the drawing's own frame: x to the right, y down the page, z towards
// the reader (an atom's `depth`), in drawing units. A model's points come in the 3-D window's
// frame (Å; x right, y up, z towards the reader) and are brought over with drawingFrame.
//
// Which of a structure's shapes is meant is read from the drawing. A stereocentre drawn with a
// wedge must have the same handedness in the model (a hard rule: no other shape is offered).
// Wedges elsewhere (on a biaryl's ring atom, say), bold bonds (nearer the reader) and hashed
// bonds (further away) are hints: of the shapes that keep every stereocentre, the one turned to
// match the drawing that best agrees with them is taken. A biaryl's two twists are mirror
// images, so with no stereocentre drawn each shape is tried in the mirror too.

import { hornFit, rotation } from '../morph/rotate';

export type V3 = [number, number, number];
/** A 3×3 matrix, row by row. */
export type M3 = [number, number, number, number, number, number, number, number, number];

export const IDENT: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const times = (a: M3, b: M3): M3 => {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0] as M3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};

export const apply = (R: M3, p: V3): V3 => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const det3 = (u: V3, v: V3, w: V3): number => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);

export const centroid = (ps: V3[]): V3 => {
  const c: V3 = [0, 0, 0];
  for (const p of ps) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  const n = ps.length || 1;
  return [c[0] / n, c[1] / n, c[2] / n];
};

// ------------------------------------------------------------------ turns

/** About the up–down axis: the near side moves right for a positive angle (radians). */
export const turnY = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
/** About the left–right axis: the near side moves down the page for a positive angle. */
export const turnX = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, s, 0, -s, c]; };
/** In the page: clockwise as seen for a positive angle (y runs down the page). */
export const turnZ = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };

/** Degrees of turn per pixel dragged: 150 px is a quarter turn. */
export const DEG_PER_PX = 0.6;
const DEG = Math.PI / 180;

/**
 * The turn for a drag of (dx, dy) screen pixels from where it began: across turns about the
 * up–down axis, down about the left–right axis (the near side follows the pointer). With `snap`
 * (Shift), only the way dragged furthest counts, in 15° steps.
 */
export function dragTurn(dx: number, dy: number, snap: boolean): M3 {
  if (snap) {
    const across = Math.abs(dx) >= Math.abs(dy);
    const a = Math.round(((across ? dx : dy) * DEG_PER_PX) / 15) * 15 * DEG;
    return across ? turnY(a) : turnX(a);
  }
  return times(turnY(dx * DEG_PER_PX * DEG), turnX(dy * DEG_PER_PX * DEG));
}

/** The turn for angles typed in (degrees): about x (left–right), then y (up–down), then z (in the page). */
export function anglesTurn(x: number, y: number, z: number): M3 {
  return times(turnZ(z * DEG), times(turnY(y * DEG), turnX(x * DEG)));
}

/** Points turned by R about a centre. */
export const turnAbout = (R: M3, c: V3, ps: V3[]): V3[] => ps.map((p) => add3(c, apply(R, sub3(p, c))));

/** The proper turn (no mirror) that best carries P onto Q, each about its own centre; and how far off it leaves them (rms). */
export function fitTurn(P: V3[], Q: V3[]): { R: M3; pc: V3; qc: V3; rms: number } {
  const f = hornFit(P, Q);
  const R = rotation(f.axis, f.angle) as M3;
  let e = 0;
  P.forEach((p, i) => { const q = add3(f.qc, apply(R, sub3(p, f.pc))); e += (q[0] - Q[i][0]) ** 2 + (q[1] - Q[i][1]) ** 2 + (q[2] - Q[i][2]) ** 2; });
  return { R, pc: f.pc, qc: f.qc, rms: Math.sqrt(e / (P.length || 1)) };
}

/**
 * The unit normal of the plane a set of points lies in, facing the reader (z ≥ 0), from the
 * widest triangle of them; null when they lie along a line.
 */
export function facingNormal(ps: V3[]): V3 | null {
  if (ps.length < 3) return null;
  let a = 0, b = 0, far = -1;
  for (let i = 0; i < ps.length; i++) { const d = len3(sub3(ps[i], ps[0])); if (d > far) { far = d; b = i; } }
  far = -1;
  for (let i = 0; i < ps.length; i++) { const d = len3(sub3(ps[i], ps[b])); if (d > far) { far = d; a = i; } }
  const u = sub3(ps[b], ps[a]);
  let best: V3 | null = null, area = 0;
  for (const p of ps) {
    const v = sub3(p, ps[a]);
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = len3(n);
    if (l > area) { area = l; best = n; }
  }
  if (!best || area < 1e-9 * (far * far || 1)) return null;
  const l = len3(best), sgn = best[2] < 0 ? -1 : 1;
  return [(sgn * best[0]) / l, (sgn * best[1]) / l, (sgn * best[2]) / l];
}

/** How far points stray from the plane through their centre with this normal, at most. */
export function offPlane(ps: V3[], n: V3): number {
  const c = centroid(ps);
  return ps.reduce((m, p) => Math.max(m, Math.abs((p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1] + (p[2] - c[2]) * n[2])), 0);
}

// ------------------------------------------------------------------ fitting a model to the drawing

/** What the drawing says about its own depth, by molfile atom index. */
export interface DepthCues {
  /** Where each molfile atom is drawn (drawing units, y down), or null for one made from a label. */
  xy: ([number, number] | null)[];
  /** Wedges (toward the reader) and hashed wedges (away), from the narrow end `a` to `b`. */
  wedges: { a: number; b: number; toward: boolean }[];
  /** Bold bonds: nearer the reader than the rest. */
  near: [number, number][];
  /** Hashed (not wedged) bonds: further away than the rest. */
  far: [number, number][];
}

/** A model's points (Å, the 3-D window's frame: y up) in the drawing's frame (y down), scaled by s. */
export const drawingFrame = (view: V3[], s: number): V3[] => view.map(([x, y, z]) => [x * s, -y * s, z * s]);

/** The same points seen in a mirror (the page's plane): the other hand of the molecule. */
export const mirrored = (ps: V3[]): V3[] => ps.map(([x, y, z]) => [x, y, -z]);

/** Drawing units per model unit: the drawn bond length over the model's median bond between drawn atoms. */
export function modelScale(model: V3[], bonds: [number, number][], drawnLength: number, drawn: (i: number) => boolean): number {
  const lens = bonds.filter(([a, b]) => drawn(a) && drawn(b)).map(([a, b]) => len3(sub3(model[a], model[b]))).filter((l) => l > 0.3).sort((p, q) => p - q);
  const med = lens.length ? lens[lens.length >> 1] : 1.5;
  return drawnLength / med;
}

/** The turn of a model (drawing frame) that lies it best over the flat drawing: its drawn atoms over where they are drawn. */
export function fitToDrawing(M: V3[], xy: ([number, number] | null)[]): { R: M3; pc: V3; qc: V3; rms: number } | null {
  const P: V3[] = [], Q: V3[] = [];
  xy.forEach((p, i) => { if (p && M[i]) { P.push(M[i]); Q.push([p[0], p[1], 0]); } });
  if (P.length < 2) return null;
  if (P.length === 2) {
    // a single bond: lay it along the drawn one (any turn about it fits as well)
    const u = sub3(P[1], P[0]), v = sub3(Q[1], Q[0]);
    return { ...fitTurn([P[0], P[1], add3(P[0], [-u[1], u[0], 0])], [Q[0], Q[1], add3(Q[0], [-v[1], v[0], 0])]), rms: 0 };
  }
  return fitTurn(P, Q);
}

/** Neighbours of each atom from a bond list. */
export function neighbours(n: number, bonds: [number, number][]): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of bonds) { if (out[a] && out[b]) { out[a].push(b); out[b].push(a); } }
  return out;
}

/**
 * Whether a shape (drawing frame; only the handedness matters, so it needn't be turned to the
 * drawing) has each stereocentre the drawing shows with a wedge the way it is drawn. A centre
 * is checked from its neighbours: drawn with the wedged ones raised towards the reader (or
 * lowered, for a hash) and the rest flat, each three of them turn one way, and the model's must
 * turn the same way. Three that are drawn in a line, or that lie flat in the model (an sp²
 * atom, a wedge used only to show which way round a biaryl is), say nothing.
 */
export function keepsStereo(M: V3[], cues: DepthCues, nbrs: number[][], L: number): boolean {
  const lift = new Map<string, number>();
  for (const w of cues.wedges) lift.set(`${w.a}>${w.b}`, (w.toward ? 1 : -1) * L * 0.5);
  const centres = new Set(cues.wedges.map((w) => w.a));
  for (const c of centres) {
    const pc = cues.xy[c];
    if (!pc || !M[c]) continue;
    const ns = nbrs[c].filter((n) => cues.xy[n] && M[n]);
    if (ns.length < 3) continue;
    const drawn = (n: number): V3 => [cues.xy[n]![0] - pc[0], cues.xy[n]![1] - pc[1], lift.get(`${c}>${n}`) ?? 0];
    const real = (n: number): V3 => sub3(M[n], M[c]);
    const mL = Math.max(...ns.map((n) => len3(real(n)))) || 1;
    let vote = 0;
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) for (let k = j + 1; k < ns.length; k++) {
      const d = det3(drawn(ns[i]), drawn(ns[j]), drawn(ns[k])) / L ** 3;
      const r = det3(real(ns[i]), real(ns[j]), real(ns[k])) / mL ** 3;
      if (Math.abs(d) < 0.04 || Math.abs(r) < 0.08) continue;
      vote += Math.sign(d) * Math.sign(r) * Math.min(Math.abs(d), 1);
    }
    if (vote < 0) return false;
  }
  return true;
}

/**
 * How well a shape, turned to lie over the drawing, agrees with the drawing's hints about
 * depth: −1 (all wrong) to 1 (all right), and how many hints there were. A wedge's wide end
 * should be nearer than its point; a bold bond nearer than the structure's middle, a hashed one
 * further away.
 */
export function cueScore(F: V3[], cues: DepthCues, L: number): { score: number; count: number } {
  let sum = 0, count = 0;
  const vote = (diff: number) => { sum += Math.max(-1, Math.min(1, diff / (L * 0.5))); count++; };
  for (const w of cues.wedges) if (F[w.a] && F[w.b]) vote((F[w.b][2] - F[w.a][2]) * (w.toward ? 1 : -1));
  const drawn = F.filter((_, i) => cues.xy[i]);
  const mid = drawn.length ? drawn.reduce((s, p) => s + p[2], 0) / drawn.length : 0;
  for (const [a, b] of cues.near) if (F[a] && F[b]) vote((F[a][2] + F[b][2]) / 2 - mid);
  for (const [a, b] of cues.far) if (F[a] && F[b]) vote(mid - (F[a][2] + F[b][2]) / 2);
  return { score: count ? sum / count : 0, count };
}

export interface PoseChoice {
  /** Which conformer, and whether it is taken in the mirror. */
  k: number;
  mirror: boolean;
  score: number;
  /** How many depth hints the drawing had. */
  hints: number;
}

/** Why no shape fits the drawing. */
export type PoseProblem = 'stereo' | 'hints';

/**
 * Pick the conformer (or its mirror image) the drawing means: it must keep every wedged
 * stereocentre, and of those, the one that agrees best with the drawing's depth hints when
 * turned to lie over it; the earliest (likeliest) wins a tie. When the hints say nothing for
 * any shape, or argue against all of them, it is 'hints'.
 */
export function choosePose(conformers: V3[][], bonds: [number, number][], cues: DepthCues, L: number): PoseChoice | { problem: PoseProblem } {
  const n = cues.xy.length;
  const nbrs = neighbours(Math.max(n, ...conformers.map((c) => c.length)), bonds);
  let best: PoseChoice | null = null;
  let anyStereo = false;
  conformers.forEach((view, k) => {
    const s = modelScale(view, bonds, L, (i) => i < n && !!cues.xy[i]);
    for (const mirror of [false, true]) {
      const M = drawingFrame(view, s);
      const shape = mirror ? mirrored(M) : M;
      if (!keepsStereo(shape, cues, nbrs, L)) continue;
      anyStereo = true;
      const fit = fitToDrawing(shape, cues.xy);
      if (!fit) continue;
      const F = shape.map((p) => add3(fit.qc, apply(fit.R, sub3(p, fit.pc))));
      const { score, count } = cueScore(F, cues, L);
      if (!best || score > best.score + 1e-6) best = { k, mirror, score, hints: count };
    }
  });
  if (!anyStereo) return { problem: 'stereo' };
  const b = best as PoseChoice | null;
  if (!b) return { problem: 'stereo' };
  // hints that no shape bears out (they contradict each other, or the structure can't look like that)
  if (b.hints && b.score <= 0.1) return { problem: 'hints' };
  return b;
}
