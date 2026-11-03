// Freeform shapes drawn with the pen (Frames ▸ Freeform): a line through points clicked one after
// another, smooth or with straight sides, open or closed. Kept as a design shape whose id holds
// its Bézier points (design/geo.ts: `path:` closed, `pen:` open), so it moves and stretches with
// its box, and a closed one goes to ChemDraw as its own closed curve.

import { type Vec, type Rect, add, sub, mul, dist } from '../geom';
import type { Shape } from '../model';
import { throughPoints } from '../arrow-path';
import { freeformId, freeformPoints } from './geo';

/** The points a freeform's Bézier points pass through (its corners or joins): every third one, without a closed one's repeat of its start. */
export function freeformAnchors(pts: Vec[], closed: boolean): Vec[] {
  const out = pts.filter((_, i) => i % 3 === 0);
  return closed && out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-6 ? out.slice(0, -1) : out;
}

/** Straight sides from point to point (a closed one back to its start), as Bézier points with their handles a third of the way along. */
export function straightThrough(anchors: Vec[], closed: boolean): Vec[] {
  const ring = closed ? [...anchors, anchors[0]] : anchors;
  const out: Vec[] = ring.length ? [ring[0]] : [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], d = sub(b, a);
    out.push(add(a, mul(d, 1 / 3)), add(a, mul(d, 2 / 3)), b);
  }
  return out;
}

/**
 * A smooth curve through the points (a closed one round and back to its start, smooth there too):
 * each runs through a point in the direction from the point before it to the point after.
 * `dirs` gives the way it runs through a point that was dragged out as it was drawn.
 */
export function smoothThrough(anchors: Vec[], closed: boolean, dirs: (Vec | null)[] = []): Vec[] {
  const n = anchors.length;
  if (n < 2) return [];
  if (!closed) return throughPoints(anchors, dirs);
  const out: Vec[] = [anchors[0]];
  const at = (i: number) => anchors[((i % n) + n) % n];
  const tangent = (i: number): Vec => {
    const d = dirs[((i % n) + n) % n];
    if (d && (d.x || d.y)) {
      // as long as the usual one, along the way it was dragged
      const l = dist(at(i + 1), at(i - 1)) / 6, dl = Math.hypot(d.x, d.y);
      return mul(d, l / dl);
    }
    return mul(sub(at(i + 1), at(i - 1)), 1 / 6);
  };
  for (let i = 0; i < n; i++) out.push(add(at(i), tangent(i)), sub(at(i + 1), tangent(i + 1)), at(i + 1));
  return out;
}

/** Whether any side of a freeform bends (a handle off the straight line between its ends). */
export function isSmoothPath(pts: Vec[]): boolean {
  for (let i = 0; i + 3 < pts.length; i += 3) {
    const a = pts[i], b = pts[i + 3], d = sub(b, a), l = Math.hypot(d.x, d.y);
    if (l < 1e-9) continue;
    for (const c of [pts[i + 1], pts[i + 2]]) if (Math.abs((c.x - a.x) * d.y - (c.y - a.y) * d.x) / l > l * 0.005) return true;
  }
  return false;
}

/** A freeform shape along Bézier points (3n + 1), open or closed, outlined in `color`. */
export function freeformShape(pts: Vec[], closed: boolean, look: Partial<Shape> = {}): Omit<Shape, 'id'> {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  // (a straight line still has a box with some height, so it can be stretched)
  if (x2 - x1 < 0.5) { const m = (x1 + x2) / 2; x1 = m - 0.25; x2 = m + 0.25; }
  if (y2 - y1 < 0.5) { const m = (y1 + y2) / 2; y1 = m - 0.25; y2 = m + 0.25; }
  const box: Rect = { x1, y1, x2, y2 };
  return { kind: 'geo', filled: false, name: 'Freeform', ...look, ...box, geo: freeformId(pts, box, closed) };
}

/** A freeform shape changed to closed or open, or to smooth or straight sides, keeping the points it runs through. */
export function reshapeFreeform(s: Shape, change: { closed?: boolean; smooth?: boolean }): Partial<Shape> | null {
  const f = freeformPoints(s);
  if (!f) return null;
  const closed = change.closed ?? f.closed;
  const smooth = change.smooth ?? isSmoothPath(f.pts);
  const anchors = freeformAnchors(f.pts, f.closed);
  if (anchors.length < (closed ? 3 : 2)) return null;
  // the same points with the same curve when only Closed changes on a straight one
  const pts = smooth ? smoothThrough(anchors, closed) : straightThrough(anchors, closed);
  const next = freeformShape(pts, closed, s);
  return { x1: next.x1, y1: next.y1, x2: next.x2, y2: next.y2, geo: next.geo, ...(closed ? {} : { filled: false }) };
}
