// Editing a curved arrow as a path: a run of cubic curves from tail to head, with joins between
// them and two control points on each curve. An arrow's `bez` keeps the points between its tail
// and head in the frame of the line from one to the other (see chordPoint), so everything here
// works on the page points and turns them back into that frame at the end.

import type { Arrow } from './model';
import { type Vec, add, sub, mul, dot, dist, norm, angleOf, fromAngle, snapAngle, arcCenter, DEG } from './geom';
import { bezPoints, chordLocal, splitBez, bezAt, bezPathAt } from './objects';

type Path = Pick<Arrow, 'tail' | 'head' | 'sweep'> & Partial<Pick<Arrow, 'bez'>>;

/** How the two handles at a join move: together in a line (and the same length), or each on its own. */
export type JoinKind = 'symmetric' | 'smooth' | 'corner';

/** The `bez` that puts a path's inner points (all but its first and last) where `pts` has them. */
export function bezFrom(tail: Vec, head: Vec, pts: Vec[]): Vec[] {
  return pts.slice(1, -1).map((p) => chordLocal(tail, head, p));
}

/**
 * A curved arrow's page points as a path (3n + 1 points): a Bézier arrow's own, a single-curve
 * arrow's arc as up to four quarter-turn curves, a straight one as one straight curve.
 */
export function pathPoints(r: Path): Vec[] {
  const bz = bezPoints(r);
  if (bz) return bz;
  if (!r.sweep) return [r.tail, add(r.tail, mul(sub(r.head, r.tail), 1 / 3)), add(r.tail, mul(sub(r.head, r.tail), 2 / 3)), r.head];
  const { center, radius } = arcCenter(r.tail, r.head, r.sweep);
  const m = Math.max(1, Math.ceil(Math.abs(r.sweep) / (90 * DEG) - 1e-9));
  const th = r.sweep / m, k = (4 / 3) * Math.tan(th / 4);
  const a0 = angleOf(sub(r.tail, center));
  const out: Vec[] = [r.tail];
  for (let i = 0; i < m; i++) {
    const a = a0 + th * i, b = a + th;
    const p0 = add(center, fromAngle(a, radius)), p3 = i === m - 1 ? r.head : add(center, fromAngle(b, radius));
    out.push(add(p0, mul({ x: -Math.sin(a), y: Math.cos(a) }, k * radius)), sub(p3, mul({ x: -Math.sin(b), y: Math.cos(b) }, k * radius)), p3);
  }
  return out;
}

/** The joins of a path (the indexes of the points where one curve meets the next). */
export function joinIndexes(pts: Vec[]): number[] {
  const out: number[] = [];
  for (let j = 3; j < pts.length - 1; j += 3) out.push(j);
  return out;
}

/** How a join's handles sit: in a line (and as long as each other), or at an angle. */
export function joinKind(pts: Vec[], j: number): JoinKind {
  const a = sub(pts[j - 1], pts[j]), b = sub(pts[j + 1], pts[j]);
  const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
  if (la < 1e-6 || lb < 1e-6) return 'corner';
  if (dot(a, b) / (la * lb) > -Math.cos(4 * DEG)) return 'corner';
  return Math.abs(la - lb) <= 0.03 * Math.max(la, lb) ? 'symmetric' : 'smooth';
}

export interface DragHow {
  /** Move only this handle, leaving the one across the join where it is (Alt): a sharp corner. */
  corner?: boolean;
  /** A handle turns round its join in 15° steps; a join slides along the line of its handles (Shift). */
  step?: boolean;
}

/**
 * Dragging point `i` of a path (1 to 3n − 1: a control point or a join) to `p`. A join takes its
 * two handles with it; a handle at a smooth join turns the one across the join with it, so the
 * curve stays smooth there (and a symmetric join keeps both the same length).
 */
export function dragPathPoint(pts: Vec[], i: number, p: Vec, how: DragHow = {}): Vec[] {
  const out = pts.slice();
  const last = pts.length - 1;
  if (i <= 0 || i >= last) return out;
  if (i % 3 === 0) {
    let q = p;
    if (how.step) {
      const along = sub(pts[i + 1], pts[i - 1]);
      if (Math.hypot(along.x, along.y) > 1e-6) { const u = norm(along); q = add(pts[i], mul(u, dot(sub(p, pts[i]), u))); }
    }
    const d = sub(q, pts[i]);
    out[i] = q;
    out[i - 1] = add(pts[i - 1], d);
    out[i + 1] = add(pts[i + 1], d);
    return out;
  }
  const anchor = i % 3 === 1 ? i - 1 : i + 1, across = i % 3 === 1 ? i - 2 : i + 2;
  const a = pts[anchor];
  const q = how.step && dist(a, p) > 1e-6 ? add(a, fromAngle(snapAngle(angleOf(sub(p, a))), dist(a, p))) : p;
  out[i] = q;
  if (!how.corner && anchor > 0 && anchor < last && dist(q, a) > 1e-6) {
    const kind = joinKind(pts, anchor);
    if (kind !== 'corner') out[across] = add(a, mul(norm(sub(a, q)), kind === 'symmetric' ? dist(q, a) : dist(pts[across], a)));
  }
  return out;
}

/** Where along a path (as bezPathAt counts) is nearest `p`, and how far away that is. */
export function nearestOnPath(pts: Vec[], p: Vec): { t: number; d: number } {
  const n = (pts.length - 1) / 3;
  const steps = 64 * n;
  let best = 0, bd = Infinity;
  for (let s = 0; s <= steps; s++) {
    const d = dist(bezPathAt(pts, (n * s) / steps), p);
    if (d < bd) { bd = d; best = (n * s) / steps; }
  }
  // then closer in, either side of the best sample
  let lo = Math.max(0, best - n / steps), hi = Math.min(n, best + n / steps);
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (dist(bezPathAt(pts, m1), p) < dist(bezPathAt(pts, m2), p)) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, d: dist(bezPathAt(pts, t), p) };
}

/** A path with a join added at `t` (as bezPathAt counts) that leaves its shape as it was. Null at an end or an existing join. */
export function insertJoin(pts: Vec[], t: number): Vec[] | null {
  const n = (pts.length - 1) / 3;
  const k = Math.min(n - 1, Math.max(0, Math.floor(t)));
  const u = t - k;
  if (u < 0.02 || u > 0.98) return null;
  const [a, b] = splitBez(pts.slice(3 * k, 3 * k + 4), u);
  return [...pts.slice(0, 3 * k), ...a, ...b.slice(1), ...pts.slice(3 * k + 4)];
}

/** A path with join `j` taken out: the two curves either side of it become one, as close to them as one curve can be. */
export function removeJoin(pts: Vec[], j: number): Vec[] | null {
  if (j % 3 || j <= 0 || j >= pts.length - 1) return null;
  const seg = pts.slice(j - 3, j + 4);
  const along: Vec[] = [];
  for (let s = 0; s <= 24; s++) along.push(bezAt(seg, s / 24, 0));
  for (let s = 1; s <= 24; s++) along.push(bezAt(seg, s / 24, 3));
  const t1 = startTangent(seg), t2 = endTangent(seg);
  const one = fitOne(along, t1, t2);
  return [...pts.slice(0, j - 3), ...one, ...pts.slice(j + 4)];
}

/** A join made smooth (its handles in a line, each keeping its length) or symmetric (the same length too). */
export function setJoin(pts: Vec[], j: number, kind: 'smooth' | 'symmetric'): Vec[] {
  const out = pts.slice();
  const a = sub(pts[j - 1], pts[j]), b = sub(pts[j + 1], pts[j]);
  let la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
  // the way the path runs through the join: between the two handles
  let u = sub(norm(b), norm(a));
  if (Math.hypot(u.x, u.y) < 1e-6) u = sub(pts[j + 3] ?? pts[j + 1], pts[j - 3] ?? pts[j - 1]);
  u = norm(u);
  if (kind === 'symmetric') la = lb = (la + lb) / 2 || dist(pts[j - 3], pts[j + 3]) / 6;
  out[j - 1] = sub(pts[j], mul(u, la || lb));
  out[j + 1] = add(pts[j], mul(u, lb || la));
  return out;
}

// ------------------------------------------------------------------ fitting curves to points

const startTangent = (p: Vec[]): Vec => norm(dist(p[1], p[0]) > 1e-6 ? sub(p[1], p[0]) : sub(p[2], p[0]));
const endTangent = (p: Vec[]): Vec => { const n = p.length - 1; return norm(dist(p[n - 1], p[n]) > 1e-6 ? sub(p[n - 1], p[n]) : sub(p[n - 2], p[n])); };

/** Each point's place along a polyline, 0 to 1 by length. */
function chordParams(d: Vec[]): number[] {
  const u = [0];
  for (let i = 1; i < d.length; i++) u.push(u[i - 1] + dist(d[i], d[i - 1]));
  const L = u[u.length - 1] || 1;
  return u.map((x) => x / L);
}

/** The cubic from d[0] to d[last] leaving and arriving along t1 and t2 (t2 points back) that best fits the points at params u. */
function generate(d: Vec[], u: number[], t1: Vec, t2: Vec): Vec[] {
  const p0 = d[0], p3 = d[d.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = u[i], s = 1 - t;
    const b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const tmp = sub(d[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = dist(p0, p3), eps = 1e-6 * seg;
  // a fit with a handle pointing backwards (or none) falls back to a third of the way along
  if (al < eps || ar < eps) al = ar = seg / 3;
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}

/** Better params for each point: one Newton step towards the nearest place on the curve. */
function reparam(bez: Vec[], d: Vec[], u: number[]): number[] {
  return u.map((t, i) => {
    const q = bezAt(bez, t);
    const s = 1 - t;
    const q1 = add(add(mul(sub(bez[1], bez[0]), 3 * s * s), mul(sub(bez[2], bez[1]), 6 * s * t)), mul(sub(bez[3], bez[2]), 3 * t * t));
    const q2 = add(mul(add(sub(bez[2], mul(bez[1], 2)), bez[0]), 6 * s), mul(add(sub(bez[3], mul(bez[2], 2)), bez[1]), 6 * t));
    const diff = sub(q, d[i]);
    const den = dot(q1, q1) + dot(diff, q2);
    return den ? Math.min(1, Math.max(0, t - dot(diff, q1) / den)) : t;
  });
}

function worst(bez: Vec[], d: Vec[], u: number[]): { err: number; at: number } {
  let err = 0, at = Math.floor(d.length / 2);
  for (let i = 1; i < d.length - 1; i++) {
    const e = dist(bezAt(bez, u[i]), d[i]);
    if (e > err) { err = e; at = i; }
  }
  return { err, at };
}

/** The single cubic that best follows the points, leaving along t1 and arriving back along t2. */
function fitOne(d: Vec[], t1: Vec, t2: Vec): Vec[] {
  let u = chordParams(d);
  let bez = generate(d, u, t1, t2);
  for (let k = 0; k < 8; k++) { u = reparam(bez, d, u); bez = generate(d, u, t1, t2); }
  return bez;
}

function fitRun(d: Vec[], t1: Vec, t2: Vec, tol: number, depth: number): Vec[] {
  if (d.length === 2) {
    const l = dist(d[0], d[1]) / 3;
    return [d[0], add(d[0], mul(t1, l)), add(d[1], mul(t2, l)), d[1]];
  }
  let u = chordParams(d);
  let bez = generate(d, u, t1, t2);
  let { err, at } = worst(bez, d, u);
  if (err <= tol) return bez;
  if (err <= tol * 4) {
    for (let k = 0; k < 12; k++) {
      u = reparam(bez, d, u);
      bez = generate(d, u, t1, t2);
      ({ err, at } = worst(bez, d, u));
      if (err <= tol) return bez;
    }
  }
  if (depth > 12) return bez;
  // split at the worst point, smooth through it
  at = Math.min(d.length - 2, Math.max(1, at));
  const mid = norm(sub(d[at - 1], d[at + 1]));
  const left = fitRun(d.slice(0, at + 1), t1, mid, tol, depth + 1);
  const right = fitRun(d.slice(at), mul(mid, -1), t2, tol, depth + 1);
  return [...left, ...right.slice(1)];
}

/**
 * Smooth curves through a run of points (a freehand stroke), keeping within `tol` of them:
 * the path as 3n + 1 points, with as few curves as that takes.
 */
export function fitPath(points: Vec[], tol: number): Vec[] {
  const d: Vec[] = [];
  for (const p of points) if (!d.length || dist(p, d[d.length - 1]) > 1e-6) d.push(p);
  if (d.length < 2) return [];
  return fitRun(d, startTangent(d), endTangent(d), tol, 0);
}

// ------------------------------------------------------------------ drawing and reshaping

/**
 * A smooth path through points clicked one after another: each point a join, the curve running
 * through it in the direction from the point before to the point after (or along `dirs[i]`,
 * where a point was dragged out to set its direction).
 */
export function throughPoints(anchors: Vec[], dirs: (Vec | null)[] = []): Vec[] {
  const n = anchors.length;
  if (n < 2) return [];
  const tangent = (i: number): Vec => {
    const prev = anchors[Math.max(0, i - 1)], next = anchors[Math.min(n - 1, i + 1)];
    const t = sub(next, prev);
    const span = Math.hypot(t.x, t.y);
    const d = dirs[i];
    // a direction set by hand keeps the usual length
    return d && Math.hypot(d.x, d.y) > 1e-6 ? mul(norm(d), span / (i === 0 || i === n - 1 ? 1 : 2)) : mul(t, i === 0 || i === n - 1 ? 1 : 0.5);
  };
  const out: Vec[] = [anchors[0]];
  for (let i = 0; i < n - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const l = dist(a, b);
    // (each handle a third of the way to the next point, at most)
    const ta = tangent(i), tb = tangent(i + 1);
    const cap = (t: Vec) => { const m = Math.hypot(t.x, t.y) / 3; return m > l / 1.5 ? mul(norm(t), l / 1.5) : mul(t, 1 / 3); };
    out.push(add(a, cap(ta)), sub(b, cap(tb)), b);
  }
  return out;
}

/**
 * Dragging a path by its line: the curve that was grabbed at `t` (as bezPathAt counts) reshapes
 * so that the place grabbed follows the pointer to `p`, its ends and joins staying put. A smooth
 * join next to it stays smooth (the handle across it turns to match). `pts` is the path as it
 * was when the drag began.
 */
export function dragCurveAt(pts: Vec[], t: number, p: Vec): Vec[] {
  const n = (pts.length - 1) / 3;
  const k = Math.min(n - 1, Math.max(0, Math.floor(t)));
  const u = Math.min(0.9, Math.max(0.1, t - k));
  const from = bezAt(pts, u, 3 * k);
  const d = sub(p, from);
  // the two controls move the same way, the nearer one more, so the grabbed place lands on p
  const w1 = 1 - u, w2 = u;
  const s = 1 / (3 * u * (1 - u) * (w1 * (1 - u) + w2 * u));
  const out = pts.slice();
  const i1 = 3 * k + 1, i2 = 3 * k + 2;
  out[i1] = add(pts[i1], mul(d, w1 * s));
  out[i2] = add(pts[i2], mul(d, w2 * s));
  // smooth joins either side stay smooth
  for (const [i, anchor, across] of [[i1, 3 * k, 3 * k - 1], [i2, 3 * k + 3, 3 * k + 4]] as const) {
    if (anchor <= 0 || anchor >= pts.length - 1) continue;
    const kind = joinKind(pts, anchor);
    if (kind === 'corner' || dist(out[i], pts[anchor]) < 1e-6) continue;
    out[across] = add(pts[anchor], mul(norm(sub(pts[anchor], out[i])), kind === 'symmetric' ? dist(out[i], pts[anchor]) : dist(pts[across], pts[anchor])));
  }
  return out;
}
