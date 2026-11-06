// The path a catalytic cycle's step arrows follow: one smooth closed curve through the middle of
// every species, so that each arrow leaves a species along the same line the arrow before it came
// in on, and the loop stays rounded and orderly however its species are moved. Each step's arrow
// is the part of that curve between its two species, cut where it leaves the first one's box and
// where it reaches the next one's. Clean Up Cycle puts the species on one ellipse instead, and the
// arrows follow its arcs.

import type { Rect, Vec } from '../geom';
import { bezAt, splitBez } from '../objects';

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const len = (a: Vec) => Math.hypot(a.x, a.y);
const unit = (a: Vec): Vec => { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : { x: 0, y: 0 }; };
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

/**
 * The smooth closed curve through `pts` in order, as one cubic Bézier per step (four points each,
 * from pts[k] to pts[k + 1], the last back to pts[0]). The curve runs through each point along the
 * line halfway between the directions to its neighbours, and each piece bends as an arc of a
 * circle would, so evenly spaced points give a circle and points moved off it give a rounded,
 * egg-like loop with no corners.
 */
export function smoothLoop(pts: Vec[]): Vec[][] {
  const n = pts.length;
  if (n < 2) return [];
  const at = (k: number) => pts[((k % n) + n) % n];
  // the direction through each point: halfway between the way in and the way out
  const dirs = pts.map((p, k) => {
    const d = add(unit(sub(p, at(k - 1))), unit(sub(at(k + 1), p)));
    // two species only: the loop goes round, square to the line between them
    if (len(d) < 1e-9 || n === 2) { const c = unit(sub(at(k + 1), p)); return { x: -c.y * (k === 0 ? 1 : -1), y: c.x * (k === 0 ? 1 : -1) }; }
    return unit(d);
  });
  const out: Vec[][] = [];
  for (let k = 0; k < n; k++) {
    const a = at(k), b = at(k + 1);
    const chord = sub(b, a), c = len(chord);
    if (c < 1e-9) { out.push([a, a, b, b]); continue; }
    const u = mul(chord, 1 / c);
    // a handle as long as an arc's would be for the angle between the curve and the chord there
    const handle = (d: Vec) => {
      const cos = Math.max(-1, Math.min(1, dot(d, u)));
      const half = Math.acos(cos) / 2;
      return Math.min(c * 0.75, c / (3 * Math.cos(half) ** 2));
    };
    const da = dirs[k], db = dirs[(k + 1) % n];
    out.push([a, add(a, mul(da, handle(da))), sub(b, mul(db, handle(db))), b]);
  }
  return out;
}

/** An upright ellipse: its centre and half-widths. */
export interface Ellipse { c: Vec; rx: number; ry: number }

/**
 * The upright ellipse that fits `pts` best (each weighted by `w`, 1 by default): exactly through
 * them when there are four, the least-squares fit otherwise. Null when they don't make one.
 */
export function fitEllipse(pts: Vec[], w: number[] = []): Ellipse | null {
  if (pts.length < 3) return null;
  // A x² + B y² + C x + D y = 1, in the frame of the points' average (better conditioned)
  const o = mul(pts.reduce((s, p) => add(s, p), { x: 0, y: 0 }), 1 / pts.length);
  const scale = Math.max(1e-9, ...pts.map((p) => len(sub(p, o))));
  const rows = pts.map((p) => { const q = mul(sub(p, o), 1 / scale); return [q.x * q.x, q.y * q.y, q.x, q.y]; });
  const solve = (cols: number): number[] | null => {
    const M = Array.from({ length: cols }, () => new Array(cols + 1).fill(0));
    rows.forEach((r, i) => {
      const wi = w[i] ?? 1;
      for (let a = 0; a < cols; a++) { for (let b = 0; b < cols; b++) M[a][b] += wi * r[a] * r[b]; M[a][cols] += wi * r[a]; }
    });
    for (let i = 0; i < cols; i++) {
      let p = i;
      for (let r = i + 1; r < cols; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      [M[i], M[p]] = [M[p], M[i]];
      for (let r = 0; r < cols; r++) {
        if (r === i) continue;
        const f = M[r][i] / M[i][i];
        for (let c = i; c <= cols; c++) M[r][c] -= f * M[i][c];
      }
    }
    return M.map((r, i) => r[cols] / r[i]);
  };
  // three points: a circle-like fit with the same half-widths isn't enough to fix four numbers
  const s = pts.length >= 4 ? solve(4) : null;
  let A: number, B: number, C: number, D: number;
  if (s && s[0] > 0 && s[1] > 0) [A, B, C, D] = s;
  else {
    // fall back on a circle: A = B
    const circ = pts.map((p) => { const q = mul(sub(p, o), 1 / scale); return [q.x * q.x + q.y * q.y, q.x, q.y]; });
    const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const r of circ) for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) M[a][b] += r[a] * r[b]; M[a][3] += r[a]; }
    for (let i = 0; i < 3; i++) {
      if (Math.abs(M[i][i]) < 1e-12) return null;
      for (let r = 0; r < 3; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let c = i; c <= 3; c++) M[r][c] -= f * M[i][c]; }
    }
    A = B = M[0][3] / M[0][0]; C = M[1][3] / M[1][1]; D = M[2][3] / M[2][2];
    if (!(A > 0)) return null;
  }
  const cx = -C / (2 * A), cy = -D / (2 * B);
  const k = 1 + A * cx * cx + B * cy * cy;
  if (!(k > 0)) return null;
  return { c: add(o, mul({ x: cx, y: cy }, scale)), rx: Math.sqrt(k / A) * scale, ry: Math.sqrt(k / B) * scale };
}

/** Where a point at `p` goes on the ellipse: along the line from its centre. */
export function ontoEllipse(e: Ellipse, p: Vec): Vec {
  const t = Math.atan2((p.y - e.c.y) / e.ry, (p.x - e.c.x) / e.rx);
  return { x: e.c.x + e.rx * Math.cos(t), y: e.c.y + e.ry * Math.sin(t) };
}

/** The ellipse's own angle for a point on it. */
const paramOf = (e: Ellipse, p: Vec) => Math.atan2((p.y - e.c.y) / e.ry, (p.x - e.c.x) / e.rx);

/** The ellipse from angle t0 to t1 (either way round), as cubic pieces of a quarter turn at most. */
function ellipseArc(e: Ellipse, t0: number, t1: number): Vec[] {
  const m = Math.max(1, Math.ceil(Math.abs(t1 - t0) / (Math.PI / 2) - 1e-9));
  const h = (t1 - t0) / m, k = (4 / 3) * Math.tan(h / 4);
  const pt = (t: number) => ({ x: e.c.x + e.rx * Math.cos(t), y: e.c.y + e.ry * Math.sin(t) });
  const dv = (t: number) => ({ x: -e.rx * Math.sin(t), y: e.ry * Math.cos(t) });
  const out: Vec[] = [pt(t0)];
  for (let i = 0; i < m; i++) {
    const a = t0 + h * i, b = a + h;
    out.push(add(pt(a), mul(dv(a), k)), sub(pt(b), mul(dv(b), k)), pt(b));
  }
  return out;
}

/** The ellipse's pieces from each point to the next, going the way the points go round. */
export function ellipseLoop(e: Ellipse, pts: Vec[]): { from: number; to: number }[] {
  const n = pts.length;
  const ts = pts.map((p) => paramOf(e, p));
  // which way round: the way most steps go
  let turn = 0;
  for (let k = 0; k < n; k++) { let d = ts[(k + 1) % n] - ts[k]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; }
  const dir = turn >= 0 ? 1 : -1;
  return ts.map((t, k) => {
    let to = ts[(k + 1) % n];
    while (dir > 0 && to <= t + 1e-9) to += 2 * Math.PI;
    while (dir < 0 && to >= t - 1e-9) to -= 2 * Math.PI;
    if (n === 1) to = t + dir * 2 * Math.PI;
    return { from: t, to };
  });
}

const inRect = (r: Rect, p: Vec) => p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;

/** The first t (from 0 to 1, or from 1 down when `back`) where f(t) is out of `r`; null when it never is. */
function exit(f: (t: number) => Vec, r: Rect, back: boolean): number | null {
  const steps = 240;
  let lo = back ? 1 : 0;
  if (!inRect(r, f(lo))) return lo;
  for (let j = 1; j <= steps; j++) {
    const t = back ? 1 - j / steps : j / steps;
    if (!inRect(r, f(t))) {
      // and to the edge exactly
      let a = lo, b = t;
      for (let i = 0; i < 30; i++) { const mid = (a + b) / 2; if (inRect(r, f(mid))) a = mid; else b = mid; }
      return b;
    }
    lo = t;
  }
  return null;
}

/** One step's arrow along the loop: its page points (a run of cubic pieces, 3n + 1 points), from its tail to its head. */
export type StepCurve = Vec[];

/**
 * Each step's arrow along the cycle's path through the species' middles `pts`, cut at their
 * boxes `boxes` (already padded by the gap to leave). `pts` must be in loop order; arrow k goes
 * from species k to species k + 1. A step whose species overlap gets null.
 */
export function cycleCurves(pts: Vec[], boxes: Rect[], ellipse?: Ellipse | null): (StepCurve | null)[] {
  const n = pts.length;
  if (n < 2) return [];
  // on an ellipse (Clean Up Cycle): its own arcs
  if (ellipse) {
    const e = ellipse;
    return ellipseLoop(e, pts).map(({ from, to }, k) => {
      const f = (t: number) => { const a = from + (to - from) * t; return { x: e.c.x + e.rx * Math.cos(a), y: e.c.y + e.ry * Math.sin(a) }; };
      const s = exit(f, boxes[k], false), en = exit(f, boxes[(k + 1) % n], true);
      if (s === null || en === null || en - s < 0.02) return null;
      return ellipseArc(e, from + (to - from) * s, from + (to - from) * en);
    });
  }
  return smoothLoop(pts).map((p, k) => {
    const f = (t: number) => bezAt(p, t);
    const s = exit(f, boxes[k], false), e = exit(f, boxes[(k + 1) % n], true);
    if (s === null || e === null || e - s < 0.02) return null;
    // the piece between: cut after s, then (in what is left) before e
    const after = splitBez(p, s)[1];
    return splitBez(after, (e - s) / (1 - s))[0];
  });
}

/** The point and the direction of travel at t (0 to 1, by length) along a run of cubic pieces. */
export function alongCurve(pts: Vec[], t: number): { p: Vec; d: Vec } {
  // by length: sample it
  const samples: { p: Vec; s: number; i: number; u: number }[] = [];
  const n = (pts.length - 1) / 3;
  let s = 0, prev = pts[0];
  for (let i = 0; i < n; i++) for (let j = 0; j <= 32; j++) {
    if (i > 0 && j === 0) continue;
    const u = j / 32, p = bezAt(pts, u, i * 3);
    s += len(sub(p, prev)); prev = p;
    samples.push({ p, s, i, u });
  }
  const total = s || 1, want = Math.max(0, Math.min(1, t)) * total;
  let k = samples.findIndex((x) => x.s >= want);
  if (k < 0) k = samples.length - 1;
  const a = samples[Math.max(0, k - 1)], b = samples[Math.min(samples.length - 1, Math.max(1, k))];
  return { p: samples[k].p, d: unit(sub(b.p, a.p)) };
}
