// Where new things go so they land clear of what is already drawn (File > Import > Import Structures
// places what it read here): the drawing is marked on a coarse grid, and the free rectangle of
// the size needed nearest the middle of the window is found.

import type { Doc } from '../model';
import { arrowPoints } from '../objects';
import type { Rect, Vec } from '../geom';

/**
 * The centre of a w × h rectangle, as near `near` as can be, that overlaps nothing in `doc`
 * with at least `margin` around it. `near` itself when the drawing is empty there.
 */
export function freeSpace(doc: Doc, w: number, h: number, near: Vec, margin: number): Vec {
  const b = doc.bounds();
  if (!b) return near;
  const cell = Math.max(1, margin / 2);
  // the grid covers the drawing and the place asked for, with room for the rectangle all round
  const pad = Math.max(w, h) + 2 * margin;
  const ox = Math.min(b.x1, near.x) - pad, oy = Math.min(b.y1, near.y) - pad;
  const gw = Math.ceil((Math.max(b.x2, near.x) + pad - ox) / cell) + 1;
  const gh = Math.ceil((Math.max(b.y2, near.y) + pad - oy) / cell) + 1;
  // a drawing too spread out for a grid: below everything
  if (gw * gh > 4e6) return { x: near.x, y: b.y2 + margin + h / 2 };
  const used = new Uint8Array(gw * gh);
  const fill = (r: Rect) => {
    const i1 = Math.max(0, Math.floor((r.x1 - ox) / cell)), i2 = Math.min(gw - 1, Math.floor((r.x2 - ox) / cell));
    const j1 = Math.max(0, Math.floor((r.y1 - oy) / cell)), j2 = Math.min(gh - 1, Math.floor((r.y2 - oy) / cell));
    for (let j = j1; j <= j2; j++) used.fill(1, j * gw + i1, j * gw + i2 + 1);
  };
  const dot = (p: Vec, r: number) => fill({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r });
  const L = margin / 2;
  for (const a of doc.atoms.values()) dot(a, L / 3);
  for (const bd of doc.bonds.values()) {
    const a = doc.atoms.get(bd.a1), c = doc.atoms.get(bd.a2);
    if (a && c) dot({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, L / 3);
  }
  for (const c of doc.captions.values()) fill({ x1: c.x, y1: c.y - 10, x2: c.x + (c.width ?? 40), y2: c.y + 4 });
  for (const r of doc.arrows.values()) for (const p of arrowPoints(r, 12)) dot(p, L / 3);
  for (const s of doc.shapes.values()) fill({ x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) });
  // sums over the grid, so any rectangle's count of used cells takes four look-ups
  const sum = new Uint32Array((gw + 1) * (gh + 1));
  for (let j = 0; j < gh; j++) {
    let row = 0;
    for (let i = 0; i < gw; i++) {
      row += used[j * gw + i];
      sum[(j + 1) * (gw + 1) + i + 1] = sum[j * (gw + 1) + i + 1] + row;
    }
  }
  const cw = Math.ceil((w + 2 * margin) / cell), ch = Math.ceil((h + 2 * margin) / cell);
  const ni = Math.round((near.x - ox) / cell - cw / 2), nj = Math.round((near.y - oy) / cell - ch / 2);
  const clear = (i: number, j: number) => i >= 0 && j >= 0 && i + cw <= gw && j + ch <= gh
    && sum[(j + ch) * (gw + 1) + i + cw] - sum[j * (gw + 1) + i + cw] - sum[(j + ch) * (gw + 1) + i] + sum[j * (gw + 1) + i] === 0;
  // rings of growing size round the place asked for: the first clear spot is the nearest
  const most = Math.max(gw, gh);
  for (let k = 0; k <= most; k++) {
    let best: [number, number] | null = null, bestD = Infinity;
    for (let dj = -k; dj <= k; dj++) {
      for (let di = -k; di <= k; di += (Math.abs(dj) === k ? 1 : 2 * k || 1)) {
        const i = ni + di, j = nj + dj;
        const d = di * di + dj * dj;
        if (d < bestD && clear(i, j)) { best = [i, j]; bestD = d; }
      }
    }
    if (best) return { x: ox + (best[0] + cw / 2) * cell, y: oy + (best[1] + ch / 2) * cell };
  }
  return { x: near.x, y: b.y2 + margin + h / 2 };
}
