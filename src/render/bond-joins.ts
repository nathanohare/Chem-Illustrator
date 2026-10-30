import { Vec, sub, add, mul, perp, len, angleOf } from '../geom';

/**
 * The wide end of a bond drawn as a filled band (a bold bond, or a wedge's wide end) at an
 * atom. `u` points from the atom along the bond; the band's "plus" edge is on the perp(u) side.
 * Each edge runs from at ± perp(u)·h to its far point (the other end's corner on that side).
 */
export interface WideEnd {
  id: number;
  at: Vec;
  u: Vec;
  h: number;
  farPlus: Vec;
  farMinus: Vec;
}

/** Where a joined end's two corners go, and any filler triangles it owns. */
export interface EndJoin { plus: Vec; minus: Vec; fill: Vec[][] }

/** A mitre may reach this many half widths from the atom before the join falls back to a bevel. */
const MITRE_LIMIT = 4;

function meet(p1: Vec, d1: Vec, p2: Vec, d2: Vec): { at: Vec; t1: number; t2: number } | null {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9 * (len(d1) * len(d2) || 1)) return null;
  const w = sub(p2, p1);
  const t1 = (w.x * d2.y - w.y * d2.x) / den;
  const t2 = (w.x * d1.y - w.y * d1.x) / den;
  return { at: add(p1, mul(d1, t1)), t1, t2 };
}

/**
 * Joins the bold bands that meet at one atom, the way a stroked polyline is mitred: each pair of
 * neighbouring bands (going round the atom) has its facing edges carried to where they cross,
 * so the outline has no notch on the outside of the turn and no step on the inside (where a
 * wedge's wide end is wider than the bold bond it meets). Where the edges cross too far away
 * (a very sharp turn) the band keeps its square end and a bevel fills the gap instead.
 */
export function joinWideEnds(ends: WideEnd[]): Map<number, EndJoin> {
  const out = new Map<number, EndJoin>();
  if (ends.length < 2) return out;
  const sorted = [...ends].sort((a, b) => angleOf(a.u) - angleOf(b.u));
  for (const e of sorted) {
    const n = perp(e.u);
    out.set(e.id, { plus: add(e.at, mul(n, e.h)), minus: sub(e.at, mul(n, e.h)), fill: [] });
  }
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], b = sorted[(i + 1) % sorted.length];
    // the turn from a round to b (perp(u) of a faces b, -perp(u) of b faces a)
    let turn = angleOf(b.u) - angleOf(a.u);
    if (turn <= 1e-6) turn += 2 * Math.PI;
    const ja = out.get(a.id)!, jb = out.get(b.id)!;
    const pa = add(a.at, mul(perp(a.u), a.h)), pb = sub(b.at, mul(perp(b.u), b.h));
    const da = sub(a.farPlus, pa), db = sub(b.farMinus, pb);
    const m = Math.abs(turn - Math.PI) > 1e-3 ? meet(pa, da, pb, db) : null;
    const reflex = turn > Math.PI;
    // (inside a turn the edges cross ahead of the atom, outside it behind; where a wide wedge
    // meets a narrower bold bond one edge is cut short and the other carried on, either side)
    const ok = m && len(sub(m.at, a.at)) <= MITRE_LIMIT * Math.max(a.h, b.h) && m.t1 < 1 && m.t2 < 1;
    if (ok) { ja.plus = m!.at; jb.minus = m!.at; continue; }
    if (reflex) ja.fill.push([a.at, pa, pb]);
  }
  return out;
}

/** A line's end at an atom where other lines meet it: `u` points from the atom along the line, `h` is its half width. */
export interface LineEnd { id: number; u: Vec; h: number }

/**
 * Where square-ended (butt) lines meet at an atom, the turns that leave a notch: each turn wider
 * than a straight line going round from one line to the next, as the pair of directions, keyed
 * by the line that owns it. Each is drawn as a tiny two-segment polyline through the atom, so the
 * stroke's own mitre join (or bevel, past the mitre limit) fills the notch.
 */
export function lineMitres(ends: LineEnd[]): Map<number, [Vec, Vec][]> {
  const out = new Map<number, [Vec, Vec][]>();
  if (ends.length < 2) return out;
  const sorted = [...ends].sort((a, b) => angleOf(a.u) - angleOf(b.u));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i], b = sorted[(i + 1) % sorted.length];
    let turn = angleOf(b.u) - angleOf(a.u);
    if (turn <= 1e-6) turn += 2 * Math.PI;
    if (turn <= Math.PI + 1e-3) continue;
    const list = out.get(a.id) ?? [];
    list.push([a.u, b.u]);
    out.set(a.id, list);
  }
  return out;
}

/** The miter limit, in half line widths as a canvas measures it, that matches the bands' joins. */
export const LINE_MITRE_LIMIT = MITRE_LIMIT;

/**
 * The tip of a butt-ended line at `end` (with `out` pointing away from the line), rounded part
 * way: a short line across the end, from h − r one side to h − r the other, which stroked
 * r·2 wide with round caps reaches `r` past the end with its corners rounded to radius `r`.
 */
export function endTip(path: Path2D, end: Vec, out: Vec, h: number, r: number): void {
  if (r <= 0) return;
  const n = mul(perp(out), Math.max(0, h - Math.min(r, h)));
  path.moveTo(end.x + n.x, end.y + n.y);
  path.lineTo(end.x - n.x, end.y - n.y);
}
