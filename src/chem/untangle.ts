// Untangling ring systems that can't be drawn as regular polygons fused side by side: cages and
// bridged polycycles such as aspidophytine, strychnine or morphine, pasted in tangled or drawn
// that way by hand.
//
// Many layouts are tried and the one with the fewest crossing bonds, the most even bonds and the
// most room between atoms is kept. Each layout starts from a "core": rings laid down as regular
// polygons one after another, fused on a shared edge, starting from a different ring each time
// and sometimes leaving a ring out on purpose. A ring that can't be laid down without landing
// on what is already there is left for later. Whatever is left are bridges, drawn as arcs from
// one part of the core to another, on whichever side crosses least, and then everything is
// eased into place: bonds pulled to their length, angles opened out, atoms that are too close
// pushed apart, never letting a new crossing form. Other starting shapes (the drawing as it
// was, or the chemistry engine's own layouts) are eased the same way and compete on the same
// score.
//
// Everything here works in units of one bond length.

import type { Vec } from '../geom';
import { add, sub, mul, dist, cross, angleOf, fromAngle, distToSegment } from '../geom';

export interface UntangleInput {
  /** Neighbours of each atom (indexes), the whole structure. */
  nbr: number[][];
  /** The atoms of the ring system. */
  atoms: number[];
  /** Its rings (atoms in order round each), smallest first. */
  rings: number[][];
  /** Starting shapes to ease and score too (the drawing first, then the engine's layouts), in bond lengths. */
  seeds: Map<number, Vec>[];
}

export interface Layout {
  pos: Map<number, Vec>;
  score: number;
  crossings: number;
}

/** Layouts for the ring system, best first (a few, all different), in units of one bond length. */
export function untangleSystem(inp: UntangleInput, keep = 6): Layout[] {
  // the ring system and the first atom of each substituent, which needs room too
  const ring = new Set(inp.atoms);
  const sys = new Set(inp.atoms);
  for (const a of inp.atoms) for (const b of inp.nbr[a]) sys.add(b);
  const ctx = makeContext(inp.nbr, sys, inp.rings, ring);
  const found: Layout[] = [];
  const consider = (pos: Map<number, Vec> | null) => {
    if (!pos || pos.size !== sys.size) return;
    found.push(scoreLayout(ctx, pos));
  };
  const R = inp.rings.length;
  // the order to try starting rings: most fused first
  const fused = inp.rings.map((r, i) => ({ i, k: inp.rings.filter((s, j) => j !== i && s.filter((a) => r.includes(a)).length >= 2).length }));
  fused.sort((p, q) => q.k - p.k || inp.rings[p.i].length - inp.rings[q.i].length || p.i - q.i);
  const starts = fused.map((f) => f.i).slice(0, sys.size > 60 ? 3 : 8);
  const skips: (number | -1)[] = [-1, ...Array.from({ length: R }, (_, i) => i)].slice(0, sys.size > 60 ? 3 : R + 1);
  for (const start of starts) {
    for (const skip of skips) {
      if (skip === start) continue;
      // (the mirror image of each is no different: wedges are turned over to suit afterwards)
      const core = buildCore(ctx, start, skip, 1);
      if (core) consider(finish(ctx, core));
    }
  }
  let asDrawn: Layout | undefined;
  inp.seeds.forEach((seed, k) => {
    if (seed.size !== sys.size) return;
    // the drawing itself competes as it is (a cage drawn in perspective may be best left alone)
    if (k === 0) { consider(new Map(seed)); asDrawn = found[found.length - 1]; }
    const pos = new Map(seed);
    relax(ctx, pos, new Set(), 200);
    consider(pos);
  });
  found.sort((a, b) => a.score - b.score);
  // keep the best few that look different from one another
  const out: Layout[] = [];
  for (const f of found) {
    if (out.length >= keep) break;
    if (out.some((o) => sameShape(o.pos, f.pos))) continue;
    out.push(f);
  }
  // and is always among them, so the whole structure can be judged that way too
  if (asDrawn && !out.includes(asDrawn)) out.push(asDrawn);
  return out;
}

// ------------------------------------------------------------------ context

interface Ctx {
  nbr: number[][];
  /** The atoms laid out: the ring system and the first atom of each substituent. */
  sys: Set<number>;
  /** The ring system's own atoms. */
  ring: Set<number>;
  rings: number[][];
  /** Bonds within the ring system. */
  edges: [number, number][];
  /** Pairs held at a set distance while easing: [a, b, distance, weight]. */
  angles: [number, number, number, number][];
  /** Atoms two bonds apart (not pushed apart as crowded). */
  near: Set<string>;
  /** Neighbours of one atom with no set angle between them: kept at least 60° apart. */
  spread: [number, number][];
  /** How many bonds each atom has to atoms outside the ring system (substituents need room). */
  ext: Map<number, number>;
  /** Atoms three or more bonds apart, and how far apart they should at least be: [a, b, distance, weight]. */
  far: [number, number, number, number][];
}

const pk = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function makeContext(nbr: number[][], sys: Set<number>, rings: number[][], ring: Set<number>): Ctx {
  const edges: [number, number][] = [];
  for (const a of sys) for (const b of nbr[a]) if (a < b && sys.has(b)) edges.push([a, b]);
  const near = new Set<string>();
  for (const [a, b] of edges) near.add(pk(a, b));
  // the angle at each atom between two neighbours: the corner of the smallest ring through both,
  // or 120° for an atom with two neighbours
  const angles: [number, number, number, number][] = [];
  const spread: [number, number][] = [];
  for (const i of sys) {
    const ns = nbr[i].filter((j) => sys.has(j));
    for (let p = 0; p < ns.length; p++) for (let q = p + 1; q < ns.length; q++) {
      const j = ns[p], k = ns[q];
      near.add(pk(j, k));
      let size = Infinity;
      for (const r of rings) {
        const at = r.indexOf(i);
        if (at < 0) continue;
        const m = r.length;
        const prev = r[(at + m - 1) % m], next = r[(at + 1) % m];
        if ((prev === j && next === k) || (prev === k && next === j)) size = Math.min(size, m);
      }
      let theta: number | null = null;
      if (size <= 12) theta = (Math.PI * (size - 2)) / size;
      else if (ns.length === 2) theta = (120 * Math.PI) / 180;
      if (theta !== null) angles.push([j, k, 2 * Math.sin(theta / 2), 0.4]);
      else spread.push([j, k]);
    }
  }
  const ext = new Map<number, number>();
  for (const a of sys) { if (ring.has(a)) continue; const k = nbr[a].filter((b) => !sys.has(b)).length; if (k) ext.set(a, k); }
  // bonds apart, within the system
  const far: [number, number, number, number][] = [];
  const list = [...sys];
  for (const a of list) {
    const d = new Map<number, number>([[a, 0]]);
    const queue = [a];
    for (let k = 0; k < queue.length; k++) for (const w of nbr[queue[k]]) if (sys.has(w) && !d.has(w)) { d.set(w, d.get(queue[k])! + 1); queue.push(w); }
    for (const [b, k] of d) if (a < b && k >= 3) far.push([a, b, 0.62 * k, 0.3 / (k * k)]);
  }
  return { nbr, sys, ring, rings, edges, angles, near, spread, ext, far };
}

// ------------------------------------------------------------------ the core: rings as polygons

interface Core {
  pos: Map<number, Vec>;
  /** Rings laid down as regular polygons. */
  placed: number[];
}

/** A regular polygon on edge p→q (bond length 1), centre on the given side. Starts p, q. */
function polygonOn(p: Vec, q: Vec, n: number, side: number): Vec[] {
  const l = dist(p, q) || 1;
  const R = 1 / (2 * Math.sin(Math.PI / n));
  const mid = mul(add(p, q), 0.5);
  const apo = Math.sqrt(Math.max(0, R * R - 0.25));
  const d = sub(q, p);
  const c = add(mid, mul({ x: -d.y / l, y: d.x / l }, side * apo));
  const a0 = angleOf(sub(p, c));
  let step = angleOf(sub(q, c)) - a0;
  while (step > Math.PI) step -= 2 * Math.PI;
  while (step < -Math.PI) step += 2 * Math.PI;
  return Array.from({ length: n }, (_, i) => (i === 0 ? p : i === 1 ? q : add(c, fromAngle(a0 + i * step, R))));
}

export function inPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Do segments p–q and r–s cross (not just touch at the ends)? */
export function segmentsCross(p: Vec, q: Vec, r: Vec, s: Vec): boolean {
  const d1x = q.x - p.x, d1y = q.y - p.y, d2x = s.x - r.x, d2y = s.y - r.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((r.x - p.x) * d2y - (r.y - p.y) * d2x) / den;
  const u = ((r.x - p.x) * d1y - (r.y - p.y) * d1x) / den;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

/** How many pairs of bonds cross (bonds that share an atom don't count). */
export function countCrossings(edges: [number, number][], pos: Map<number, Vec>): number {
  let n = 0;
  const segs = edges.map(([a, b]) => [a, b, pos.get(a)!, pos.get(b)!] as const);
  for (let i = 0; i < segs.length; i++) {
    const [a, b, p, q] = segs[i];
    const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
    for (let j = i + 1; j < segs.length; j++) {
      const [c, d, r, s] = segs[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (Math.max(r.x, s.x) < x1 || Math.min(r.x, s.x) > x2 || Math.max(r.y, s.y) < y1 || Math.min(r.y, s.y) > y2) continue;
      if (segmentsCross(p, q, r, s)) n++;
    }
  }
  return n;
}

function buildCore(ctx: Ctx, start: number, skip: number, sense: number): Core | null {
  const { rings } = ctx;
  if (rings[start].length > 12) return null;
  const pos = new Map<number, Vec>();
  const r0 = rings[start];
  const R0 = 1 / (2 * Math.sin(Math.PI / r0.length));
  r0.forEach((a, k) => pos.set(a, fromAngle(Math.PI / 2 + (sense * 2 * Math.PI * k) / r0.length, R0)));
  const placed = [start];
  const tried = new Set([start]);
  if (skip >= 0) tried.add(skip);
  for (;;) {
    let next = -1, best = 0;
    rings.forEach((r, i) => {
      if (tried.has(i)) return;
      const k = r.filter((a) => pos.has(a)).length;
      if (k > best || (k === best && k > 0 && r.length < rings[next].length)) { best = k; next = i; }
    });
    if (next < 0) break;
    tried.add(next);
    if (rings[next].length > 12) continue;
    const add1 = fitRing(ctx, rings[next], pos, placed.map((i) => rings[i]), sense);
    if (!add1) continue;
    for (const [a, p] of add1) pos.set(a, p);
    placed.push(next);
  }
  // leaving a ring out mustn't cut the others off from the start
  if (rings.some((r, i) => !tried.has(i) && r.length <= 12)) return null;
  return { pos, placed };
}

/** Where a ring's new atoms go to fit it onto what is placed, or null if it can't be done cleanly. */
function fitRing(ctx: Ctx, r: number[], pos: Map<number, Vec>, placedRings: number[][], sense: number): Map<number, Vec> | null {
  const m = r.length;
  const has = r.map((a) => pos.has(a));
  const t = has.filter(Boolean).length;
  let poly: Vec[] | null = null;
  let shift = 0; // poly[j] belongs to r[(shift + j) % m]
  if (t === 1) {
    // spiro: straight out from what is there
    const k = has.indexOf(true);
    const a = r[k];
    const pa = pos.get(a)!;
    const around = ctx.nbr[a].filter((x) => pos.has(x)).map((x) => pos.get(x)!);
    let dir = around.length ? sub(pa, centroid(around)) : { x: 1, y: 0 };
    if (Math.hypot(dir.x, dir.y) < 1e-3) dir = { x: 1, y: 0 };
    const R = 1 / (2 * Math.sin(Math.PI / m));
    const c = add(pa, mul(dir, R / Math.hypot(dir.x, dir.y)));
    const a0 = angleOf(sub(pa, c));
    poly = Array.from({ length: m }, (_, j) => (j === 0 ? pa : add(c, fromAngle(a0 + (sense * 2 * Math.PI * j) / m, R))));
    shift = k;
  } else {
    // fused: on an edge at the end of the shared run, on the side away from what is there
    let k = -1;
    for (let j = 0; j < m; j++) if (has[j] && has[(j + 1) % m] && (!has[(j + 2) % m] || !has[(j + m - 1) % m])) { k = j; break; }
    if (k < 0) return null;
    const pu = pos.get(r[k])!, pw = pos.get(r[(k + 1) % m])!;
    let bestPoly: Vec[] | null = null, bestBad = Infinity;
    for (const side of [1, -1]) {
      const p = polygonOn(pu, pw, m, side);
      const bad = conflict(ctx, r, k, p, pos, placedRings);
      if (bad < bestBad) { bestBad = bad; bestPoly = p; }
    }
    if (!bestPoly || bestBad > 0) return null;
    poly = bestPoly;
    shift = k;
  }
  if (t === 1 && conflict(ctx, r, shift, poly, pos, placedRings) > 0) return null;
  const out = new Map<number, Vec>();
  for (let j = 0; j < m; j++) {
    const a = r[(shift + j) % m];
    if (!pos.has(a)) out.set(a, poly[j]);
  }
  return out;
}

/** How badly a polygon for ring r (poly[j] is r[(shift + j) % m]) clashes with what is placed: 0 for not at all. */
function conflict(ctx: Ctx, r: number[], shift: number, poly: Vec[], pos: Map<number, Vec>, placedRings: number[][]): number {
  const m = r.length;
  let bad = 0;
  const inRing = new Set(r);
  for (let j = 0; j < m; j++) {
    const a = r[(shift + j) % m];
    const had = pos.get(a);
    if (had) { if (dist(had, poly[j]) > 0.35) bad += 1 + dist(had, poly[j]); continue; }
    const p = poly[j];
    for (const [b, q] of pos) if (!inRing.has(b) && dist(p, q) < 0.6) bad += 1;
    for (const pr of placedRings) if (inPolygon(p, pr.map((x) => pos.get(x)!))) bad += 1;
  }
  // nothing placed inside the new ring
  for (const [b, q] of pos) if (!inRing.has(b) && inPolygon(q, poly)) bad += 1;
  // no new bond crosses a placed one
  const at = (a: number): Vec | undefined => {
    const j = r.indexOf(a);
    return j >= 0 ? poly[(j - shift + m) % m] : pos.get(a);
  };
  for (let j = 0; j < m; j++) {
    const a = r[(shift + j) % m], b = r[(shift + j + 1) % m];
    if (pos.has(a) && pos.has(b)) continue;
    const p = at(a)!, q = at(b)!;
    for (const [c, d] of ctx.edges) {
      if (c === a || c === b || d === a || d === b || !pos.has(c) || !pos.has(d)) continue;
      if (segmentsCross(p, q, pos.get(c)!, pos.get(d)!)) bad += 1;
    }
  }
  return bad;
}

const centroid = (pts: Vec[]): Vec => mul(pts.reduce((s, p) => add(s, p), { x: 0, y: 0 }), 1 / Math.max(1, pts.length));

// ------------------------------------------------------------------ bridges

/** Lay down whatever the core left out, then ease the whole thing. */
function finish(ctx: Ctx, core: Core): Map<number, Vec> | null {
  const pos = new Map(core.pos);
  const fixed = new Set(pos.keys());
  for (let guard = 0; guard < ctx.sys.size; guard++) {
    const left = [...ctx.ring].filter((a) => !pos.has(a));
    if (!left.length) break;
    // the piece of unplaced atoms joined to the most placed ones
    const pieces = piecesOf(ctx, left);
    pieces.sort((p, q) => anchorsOf(ctx, q, pos).length - anchorsOf(ctx, p, pos).length);
    const piece = pieces[0];
    const anchors = anchorsOf(ctx, piece, pos);
    if (!anchors.length) return null;
    const path = asPath(ctx, piece, anchors);
    if (path) placeArc(ctx, pos, path.u, path.v, path.atoms);
    else placeLoose(ctx, pos, piece);
  }
  if (pos.size !== ctx.ring.size) return null;
  placeSubstituents(ctx, pos);
  // ease the bridges and substituents in first, then everything if that isn't enough, the rings
  // laid down as polygons keeping their shape as far as they can
  relax(ctx, pos, fixed, 150);
  if (worstBond(ctx, pos) > 0.6 || crowdedPairs(ctx, pos) > 0) {
    const shape: [number, number, number, number][] = [];
    for (const i of core.placed) {
      const r = ctx.rings[i];
      for (let p = 0; p < r.length; p++) for (let q = p + 2; q < r.length; q++) {
        if (p === 0 && q === r.length - 1) continue;
        shape.push([r[p], r[q], dist(core.pos.get(r[p])!, core.pos.get(r[q])!), 1]);
      }
    }
    relax(ctx, pos, new Set(), 250, shape);
  }
  return pos;
}

/** The first atom of each substituent, a bond out in the widest gap round its ring atom. */
function placeSubstituents(ctx: Ctx, pos: Map<number, Vec>): void {
  for (const a of ctx.ring) {
    const out = ctx.nbr[a].filter((b) => !ctx.ring.has(b));
    if (!out.length) continue;
    const pa = pos.get(a)!;
    const angs = ctx.nbr[a].filter((b) => ctx.ring.has(b)).map((b) => angleOf(sub(pos.get(b)!, pa))).sort((x, y) => x - y);
    // the gap round the atom where they cross nothing and have most room (usually the widest)
    let best: Vec[] = [], bestScore = Infinity;
    for (let i = 0; i < angs.length; i++) {
      const from = angs[i];
      const gap = i + 1 < angs.length ? angs[i + 1] - from : angs[0] + 2 * Math.PI - from;
      const pts = out.map((_, j) => add(pa, fromAngle(from + (gap * (j + 1)) / (out.length + 1))));
      let sc = -gap * 10;
      for (const p of pts) {
        for (const [c, d] of ctx.edges) if (c !== a && d !== a && pos.has(c) && pos.has(d) && segmentsCross(pa, p, pos.get(c)!, pos.get(d)!)) sc += 100;
        for (const [b, q] of pos) { if (b === a) continue; const d = dist(p, q); if (d < 0.9) sc += (0.9 - d) * 40; }
      }
      if (sc < bestScore) { bestScore = sc; best = pts; }
    }
    out.forEach((b, j) => { if (!pos.has(b)) pos.set(b, best[j]); });
  }
}

function piecesOf(ctx: Ctx, left: number[]): number[][] {
  const set = new Set(left), seen = new Set<number>();
  const out: number[][] = [];
  for (const s of left) {
    if (seen.has(s)) continue;
    const comp = [s];
    seen.add(s);
    for (let k = 0; k < comp.length; k++) for (const w of ctx.nbr[comp[k]]) if (set.has(w) && !seen.has(w)) { seen.add(w); comp.push(w); }
    out.push(comp);
  }
  return out;
}

/** [piece atom, placed neighbour] pairs. */
function anchorsOf(ctx: Ctx, piece: number[], pos: Map<number, Vec>): [number, number][] {
  const out: [number, number][] = [];
  for (const a of piece) for (const b of ctx.nbr[a]) if (ctx.sys.has(b) && pos.has(b)) out.push([a, b]);
  return out;
}

/** The piece as a chain from one placed atom to another, or null if it is anything else. */
function asPath(ctx: Ctx, piece: number[], anchors: [number, number][]): { u: number; v: number; atoms: number[] } | null {
  if (anchors.length !== 2) return null;
  const set = new Set(piece);
  const deg = (a: number) => ctx.nbr[a].filter((b) => set.has(b)).length;
  if (piece.some((a) => deg(a) > 2)) return null;
  const [[s, u], [e, v]] = anchors;
  if (u === v && piece.length < 2) return null;
  const atoms = [s];
  const seen = new Set([s]);
  while (atoms[atoms.length - 1] !== e) {
    const nx = ctx.nbr[atoms[atoms.length - 1]].find((b) => set.has(b) && !seen.has(b));
    if (nx === undefined) return null;
    seen.add(nx);
    atoms.push(nx);
  }
  return atoms.length === piece.length ? { u, v, atoms } : null;
}

/** A bridge of `atoms` from u to v along an arc, on the side and at the size that clash least. */
function placeArc(ctx: Ctx, pos: Map<number, Vec>, u: number, v: number, atoms: number[]): void {
  const pu = pos.get(u)!, pv0 = pos.get(v)!;
  const n = atoms.length + 1;
  let best: Vec[] | null = null, bestScore = Infinity;
  // u and v the same atom (a ring hanging off one atom): open the arc away from the rest
  let pv = pv0;
  if (u === v) {
    const around = ctx.nbr[u].filter((x) => pos.has(x)).map((x) => pos.get(x)!);
    const out = around.length ? sub(pu, centroid(around)) : { x: 1, y: 0 };
    const l = Math.hypot(out.x, out.y) || 1;
    pv = add(pu, mul({ x: -out.y / l, y: out.x / l }, 0.01));
  }
  for (const side of [1, -1]) {
    for (const size of [1, 0.8, 0.62]) {
      const pts = arc(pu, pv, n, size, side);
      const s = arcScore(ctx, pos, u, v, atoms, pts) + Math.abs(1 - size) * 2;
      if (s < bestScore) { bestScore = s; best = pts; }
    }
  }
  best!.forEach((p, i) => pos.set(atoms[i], p));
}

/** n − 1 points on an arc from p to q so that the n steps are each about `step` long, bulging to `side`. */
function arc(p: Vec, q: Vec, n: number, step: number, side: number): Vec[] {
  const d = Math.max(dist(p, q), 1e-6);
  const want = n * step;
  const e = mul(sub(q, p), 1 / d);
  const nrm = mul({ x: -e.y, y: e.x }, side);
  if (want <= d * 1.0001) return Array.from({ length: n - 1 }, (_, i) => add(p, mul(sub(q, p), (i + 1) / n)));
  // half-angle θ with d·θ / sin θ = want
  let lo = 1e-6, hi = Math.PI - 1e-6;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if ((d * mid) / Math.sin(mid) < want) lo = mid; else hi = mid;
  }
  const th = (lo + hi) / 2;
  const R = d / (2 * Math.sin(th));
  const mid = mul(add(p, q), 0.5);
  const c = sub(mid, mul(nrm, R * Math.cos(th)));
  const a0 = angleOf(sub(p, c));
  // go round the way that passes the bulge
  const bulge = add(mid, mul(nrm, R * (1 - Math.cos(th))));
  const tryDir = (dir: number) => add(c, fromAngle(a0 + dir * th, R));
  const dir = dist(tryDir(1), bulge) < dist(tryDir(-1), bulge) ? 1 : -1;
  return Array.from({ length: n - 1 }, (_, i) => add(c, fromAngle(a0 + (dir * 2 * th * (i + 1)) / n, R)));
}

function arcScore(ctx: Ctx, pos: Map<number, Vec>, u: number, v: number, atoms: number[], pts: Vec[]): number {
  const chain = [pos.get(u)!, ...pts, pos.get(v)!];
  const ids = [u, ...atoms, v];
  let s = 0;
  for (let i = 0; i + 1 < chain.length; i++) {
    for (const [c, d] of ctx.edges) {
      if (!pos.has(c) || !pos.has(d) || ids.includes(c) || ids.includes(d)) continue;
      if (segmentsCross(chain[i], chain[i + 1], pos.get(c)!, pos.get(d)!)) s += 100;
    }
  }
  for (const p of pts) for (const [b, q] of pos) {
    if (ids.includes(b)) continue;
    const d = dist(p, q);
    if (d < 0.8) s += (0.8 - d) * 20;
  }
  return s;
}

/** Anything that isn't a simple chain: atom by atom, out from what is placed, then eased. */
function placeLoose(ctx: Ctx, pos: Map<number, Vec>, piece: number[]): void {
  const left = new Set(piece);
  const all = centroid([...pos.values()]);
  while (left.size) {
    let pick = -1, most = -1;
    for (const a of left) {
      const k = ctx.nbr[a].filter((b) => pos.has(b)).length;
      if (k > most) { most = k; pick = a; }
    }
    const placedN = ctx.nbr[pick].filter((b) => pos.has(b)).map((b) => pos.get(b)!);
    let p: Vec;
    if (placedN.length >= 2) {
      const c = centroid(placedN);
      const out = sub(c, all);
      const l = Math.hypot(out.x, out.y);
      p = l > 1e-6 ? add(c, mul(out, 0.5 / l)) : add(c, { x: 0.3, y: 0.3 });
    } else if (placedN.length === 1) {
      const out = sub(placedN[0], all);
      const l = Math.hypot(out.x, out.y);
      p = add(placedN[0], l > 1e-6 ? mul(out, 1 / l) : { x: 1, y: 0 });
    } else p = add(all, { x: 2, y: 0 });
    pos.set(pick, p);
    left.delete(pick);
  }
}

// ------------------------------------------------------------------ easing

function worstBond(ctx: Ctx, pos: Map<number, Vec>): number {
  let w = 0;
  for (const [a, b] of ctx.edges) w = Math.max(w, Math.abs(dist(pos.get(a)!, pos.get(b)!) - 1));
  return w;
}

function crowdedPairs(ctx: Ctx, pos: Map<number, Vec>): number {
  const ids = [...pos.keys()];
  let n = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (ctx.near.has(pk(ids[i], ids[j]))) continue;
    if (dist(pos.get(ids[i])!, pos.get(ids[j])!) < 0.7) n++;
  }
  for (const [a, b] of ctx.spread) if (dist(pos.get(a)!, pos.get(b)!) < 0.7) n++;
  return n;
}

/**
 * Ease atoms into place: bonds pulled to one bond length, angles to the ring's corner (or 120°),
 * atoms that aren't neighbours pushed at least a bond apart, never letting a new crossing form.
 * Atoms in `fixed` stay put.
 */
function relax(ctx: Ctx, pos: Map<number, Vec>, fixed: Set<number>, iterations: number, shape: [number, number, number, number][] = []): void {
  const ids = [...pos.keys()];
  if (ids.every((a) => fixed.has(a))) return;
  let crossings = countCrossings(ctx.edges, pos);
  let step = 0.6;
  // each atom moves by its pull divided by how stiffly it is held, so crowded atoms don't overshoot
  const grad = new Map<number, Vec>();
  const stiff = new Map<number, number>();
  const pull = (a: number, b: number, target: number, w: number) => {
    const pa = pos.get(a)!, pb = pos.get(b)!;
    const dx = pa.x - pb.x, dy = pa.y - pb.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const f = (2 * w * (d - target)) / d;
    const ga = grad.get(a)!, gb = grad.get(b)!;
    ga.x += f * dx; ga.y += f * dy;
    gb.x -= f * dx; gb.y -= f * dy;
    stiff.set(a, stiff.get(a)! + 2 * w);
    stiff.set(b, stiff.get(b)! + 2 * w);
  };
  for (let it = 0; it < iterations && step > 1e-3; it++) {
    for (const a of ids) { grad.set(a, { x: 0, y: 0 }); stiff.set(a, 1e-6); }
    for (const [a, b] of ctx.edges) pull(a, b, 1, 1);
    for (const [a, b, t, w] of ctx.angles) pull(a, b, t, w);
    for (const [a, b, t, w] of shape) pull(a, b, t, w);
    for (const [a, b] of ctx.spread) if (dist(pos.get(a)!, pos.get(b)!) < 1) pull(a, b, 1, 0.6);
    // atoms far apart in bonds kept apart on the page too, which opens out squeezed rings
    for (const [a, b, t, w] of ctx.far) if (dist(pos.get(a)!, pos.get(b)!) < t) pull(a, b, t, w);
    for (let i = 0; i < ids.length; i++) {
      const pa = pos.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j++) {
        const pb = pos.get(ids[j])!;
        if (Math.abs(pa.x - pb.x) > 1.1 || Math.abs(pa.y - pb.y) > 1.1) continue;
        if (ctx.near.has(pk(ids[i], ids[j]))) continue;
        const d = dist(pa, pb);
        if (d < 1.1) pull(ids[i], ids[j], 1.1, 0.6);
      }
    }
    const before = new Map<number, Vec>();
    let moved = 0;
    for (const a of ids) {
      if (fixed.has(a)) continue;
      const g = grad.get(a)!, h = stiff.get(a)!;
      let dx = (-g.x * step) / h, dy = (-g.y * step) / h;
      const l = Math.hypot(dx, dy);
      if (l > 0.15) { dx *= 0.15 / l; dy *= 0.15 / l; }
      moved = Math.max(moved, Math.hypot(dx, dy));
      const p = pos.get(a)!;
      before.set(a, p);
      pos.set(a, { x: p.x + dx, y: p.y + dy });
    }
    if (moved < 1e-4) break;
    const now = countCrossings(ctx.edges, pos);
    if (now > crossings) {
      for (const [a, p] of before) pos.set(a, p);
      step *= 0.5;
    } else {
      crossings = now;
      step = Math.min(step * 1.1, 0.6);
    }
  }
}

// ------------------------------------------------------------------ scoring

/** What a crossing costs: a crossing is worth putting up with rather than squashing rings out of shape. */
export const CROSSING = 40;
/** What a ring corner off its ideal angle costs, per radian squared. */
const RING_SHAPE = 40;

/** Lower is better: crossings above all, then uneven bonds and angles, then atoms too close. */
function scoreLayout(ctx: Ctx, pos: Map<number, Vec>): Layout {
  const crossings = countCrossings(ctx.edges, pos);
  let s = crossings * CROSSING;
  // long bonds (a bridge drawn across) are easier on the eye than short ones
  for (const [a, b] of ctx.edges) { const d = dist(pos.get(a)!, pos.get(b)!) - 1; s += d * d * (d < 0 ? 10 : 4); }
  for (const [a, b, t] of ctx.angles) { const d = dist(pos.get(a)!, pos.get(b)!) - t; s += d * d * 18; }
  // rings out of shape, and worse, inside out (a corner pointing in), look broken
  for (const r of ctx.rings) {
    if (r.length > 8) continue;
    const m = r.length, ideal = (Math.PI * (m - 2)) / m;
    let pos1 = 0, neg = 0;
    for (let i = 0; i < m; i++) {
      const a = pos.get(r[i])!, b = pos.get(r[(i + 1) % m])!, c = pos.get(r[(i + 2) % m])!;
      const u = sub(a, b), w = sub(c, b);
      const turn = cross(sub(b, a), sub(c, b));
      if (turn > 0.05) pos1++; else if (turn < -0.05) neg++;
      const ang = Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / ((Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)) || 1))));
      s += (ang - ideal) * (ang - ideal) * RING_SHAPE;
    }
    s += Math.min(pos1, neg) * 15;
  }
  for (const [a, b] of ctx.spread) { const d = dist(pos.get(a)!, pos.get(b)!); if (d < 0.85) s += (0.85 - d) * (0.85 - d) * 40; }
  s += substituentRoom(ctx, pos);
  s += atomsOnBonds(ctx.edges, pos) * 30;
  const ids = [...pos.keys()];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (ctx.near.has(pk(ids[i], ids[j]))) continue;
    const d = dist(pos.get(ids[i])!, pos.get(ids[j])!);
    if (d < 0.9) s += (0.9 - d) * (0.9 - d) * 40;
  }
  return { pos, score: s, crossings };
}

/** Atoms sitting on (or nearly on) a bond they aren't part of: the sum of how far inside half a bond they are, squared. */
export function atomsOnBonds(edges: [number, number][], pos: Map<number, Vec>, near = 0.55): number {
  let s = 0;
  for (const [a, b] of edges) {
    const p = pos.get(a)!, q = pos.get(b)!;
    const x1 = Math.min(p.x, q.x) - near, x2 = Math.max(p.x, q.x) + near, y1 = Math.min(p.y, q.y) - near, y2 = Math.max(p.y, q.y) + near;
    for (const [c, r] of pos) {
      if (c === a || c === b || r.x < x1 || r.x > x2 || r.y < y1 || r.y > y2) continue;
      const d = distToSegment(r, p, q);
      if (d < near) s += (near - d) * (near - d);
    }
  }
  return s;
}

/** How cramped the substituents would be: each goes in the widest gap round its atom, a bond out. */
function substituentRoom(ctx: Ctx, pos: Map<number, Vec>): number {
  let s = 0;
  for (const [a, k] of ctx.ext) {
    const pa = pos.get(a)!;
    const angs = ctx.nbr[a].filter((b) => ctx.sys.has(b)).map((b) => angleOf(sub(pos.get(b)!, pa))).sort((x, y) => x - y);
    if (!angs.length) continue;
    let from = angs[angs.length - 1], gap = angs[0] + 2 * Math.PI - from;
    for (let i = 1; i < angs.length; i++) if (angs[i] - angs[i - 1] > gap) { gap = angs[i] - angs[i - 1]; from = angs[i - 1]; }
    for (let j = 1; j <= k; j++) {
      const probe = add(pa, fromAngle(from + (gap * j) / (k + 1)));
      for (const [b, q] of pos) {
        if (b === a) continue;
        const d = dist(probe, q);
        if (d < 0.8) s += (0.8 - d) * (0.8 - d) * 40;
      }
      for (const [c, d] of ctx.edges) if (c !== a && d !== a && segmentsCross(pa, probe, pos.get(c)!, pos.get(d)!)) s += CROSSING;
    }
  }
  return s;
}

/** Do two layouts look the same, allowing for turning (not mirroring) and moving? */
export function sameShape(a: Map<number, Vec>, b: Map<number, Vec>): boolean {
  const ids = [...a.keys()].filter((k) => b.has(k));
  if (!ids.length) return true;
  const ca = centroid(ids.map((i) => a.get(i)!)), cb = centroid(ids.map((i) => b.get(i)!));
  let sxx = 0, sxy = 0;
  for (const i of ids) {
    const p = sub(b.get(i)!, cb), q = sub(a.get(i)!, ca);
    sxx += p.x * q.x + p.y * q.y;
    sxy += p.x * q.y - p.y * q.x;
  }
  const t = Math.atan2(sxy, sxx), c = Math.cos(t), s = Math.sin(t);
  let worst = 0;
  for (const i of ids) {
    const p = sub(b.get(i)!, cb);
    const r = { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
    worst = Math.max(worst, dist(r, sub(a.get(i)!, ca)));
  }
  return worst < 0.25;
}

