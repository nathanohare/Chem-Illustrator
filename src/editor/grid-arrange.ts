// Format ▸ Align ▸ Arrange in a Row, Column or Grid: the selected structures (each with its
// compound number) and other objects set out in reading order, evenly spaced, each centred in its
// place. Clean Up does the same by itself when the selection is clearly already in rows.

import type { Rect, Vec } from '../geom';
import type { Doc } from '../model';
import { plainText } from '../richtext';
import type { Unit } from './arrange';
import { ringsAmong } from '../chem/aromatic';

export type GridKind = 'row' | 'column' | 'grid';

export interface GridHow {
  kind: GridKind;
  /** Grid: how many across (the square root of the count, rounded up, by default). */
  cols?: number;
  /** Space between neighbours, in points. */
  gap: number;
  /** Space between rows and between columns, when they differ (in points; `gap` otherwise). */
  rowGap?: number;
  colGap?: number;
  /**
   * The point of each thing that lines up with the others in its row and column (a ring they all
   * share, say). The middle of its box when not given.
   */
  anchors?: (Vec | null)[];
}

/** How many across a grid of n things is by default: as near square as can be. */
export const defaultColumns = (n: number): number => Math.max(1, Math.ceil(Math.sqrt(n)));

const width = (b: Rect) => b.x2 - b.x1;
const height = (b: Rect) => b.y2 - b.y1;
const mid = (b: Rect): Vec => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });

/**
 * A structure's compound number (short text just under it, or an ID label tied to it) goes with it:
 * the caption units are folded into their structures' units.
 */
export function withLabels(doc: Doc, us: Unit[], bond: number): Unit[] {
  const structures = us.filter((u) => u.atoms.length);
  const out = us.filter((u) => !isLabelOf(doc, u, structures, bond));
  return out.map((u) => {
    if (!u.atoms.length) return u;
    const labels = us.filter((c) => c !== u && labelOwner(doc, c, structures, bond) === u);
    if (!labels.length) return u;
    const box = labels.reduce((r, c) => ({ x1: Math.min(r.x1, c.box.x1), y1: Math.min(r.y1, c.box.y1), x2: Math.max(r.x2, c.box.x2), y2: Math.max(r.y2, c.box.y2) }), u.box);
    return { ...u, captions: [...u.captions, ...labels.flatMap((c) => c.captions)], box };
  });
}

function isLabelOf(doc: Doc, c: Unit, structures: Unit[], bond: number): boolean {
  return !!labelOwner(doc, c, structures, bond);
}

/** The structure a lone caption numbers, if it is one. */
function labelOwner(doc: Doc, c: Unit, structures: Unit[], bond: number): Unit | null {
  if (c.atoms.length || c.arrows.length || c.shapes.length || c.captions.length !== 1) return null;
  const cap = doc.captions.get(c.captions[0]);
  if (!cap) return null;
  if (cap.attach?.role === 'label') return structures.find((s) => cap.attach!.atoms.some((a) => s.atoms.includes(a))) ?? null;
  if (cap.attach) return null;
  const text = plainText(cap.runs).trim();
  if (!text || text.length > 8 || text.includes('\n')) return null;
  const cx = mid(c.box).x;
  let best: Unit | null = null, bestD = 1.4 * bond;
  for (const s of structures) {
    if (cx < s.box.x1 || cx > s.box.x2) continue;
    // under it: its middle below the structure's middle, and its top not far below the bottom
    // (a number can tuck a little into a structure's box, beside a ring's lowest corner)
    const under = mid(c.box).y > s.box.y2 - 0.3 * bond && c.box.y1 > mid(s.box).y;
    const d = under ? Math.max(0, c.box.y1 - s.box.y2) : Infinity;
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/**
 * The things in rows as they sit: top row first, each row left to right. Two things are in one
 * row when they overlap up and down by at least half the shorter one.
 */
export function readRows(boxes: Rect[]): number[][] {
  const order = boxes.map((_, i) => i).sort((a, b) => mid(boxes[a]).y - mid(boxes[b]).y || boxes[a].x1 - boxes[b].x1);
  const rows: { band: { y1: number; y2: number }; items: number[] }[] = [];
  for (const i of order) {
    const b = boxes[i];
    const last = rows[rows.length - 1];
    const overlap = last ? Math.min(last.band.y2, b.y2) - Math.max(last.band.y1, b.y1) : -Infinity;
    const shorter = last ? Math.min(...last.items.map((k) => height(boxes[k])), height(b)) : 0;
    // (flat things, a line of text, count as in the row when their middle is inside it)
    const inside = last && mid(b).y >= last.band.y1 && mid(b).y <= last.band.y2;
    if (last && (overlap >= 0.5 * Math.max(shorter, 1e-6) || (shorter < 1 && inside))) {
      last.items.push(i);
      last.band = { y1: Math.min(last.band.y1, b.y1), y2: Math.max(last.band.y2, b.y2) };
    } else rows.push({ band: { y1: b.y1, y2: b.y2 }, items: [i] });
  }
  return rows.map((r) => r.items.sort((a, b) => mid(boxes[a]).x - mid(boxes[b]).x));
}

/**
 * How the things are clearly meant to be set out, or null when it isn't clear: all in one row,
 * all in one column, or rows of the same length (the last may be shorter): a grid.
 */
export function inferGrid(boxes: Rect[]): { kind: GridKind; cols: number } | null {
  const n = boxes.length;
  if (n < 2) return null;
  const rows = readRows(boxes);
  // things in a row mustn't sit on top of one another
  for (const r of rows) for (let k = 1; k < r.length; k++) if (boxes[r[k]].x1 < boxes[r[k - 1]].x2 - 0.25 * Math.min(width(boxes[r[k]]), width(boxes[r[k - 1]]))) return null;
  if (rows.length === 1) return { kind: 'row', cols: n };
  const k = Math.max(...rows.map((r) => r.length));
  if (k === 1) {
    // one column: each overlaps the next across by at least half the narrower
    for (let i = 1; i < rows.length; i++) {
      const a = boxes[rows[i - 1][0]], b = boxes[rows[i][0]];
      if (Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) < 0.5 * Math.min(width(a), width(b))) return null;
    }
    return { kind: 'column', cols: 1 };
  }
  if (rows.slice(0, -1).some((r) => r.length !== k)) return null;
  return { kind: 'grid', cols: k };
}

/**
 * Where each thing goes (an offset for each box, in the order given). They are taken in reading
 * order and set out `cols` across: each column as wide as its widest, each row as tall as its
 * tallest, `gap` between, each thing centred in its place. The whole keeps its centre.
 */
export function gridOffsets(boxes: Rect[], how: GridHow): Vec[] {
  const n = boxes.length;
  if (!n) return [];
  const cols = how.kind === 'row' ? n : how.kind === 'column' ? 1 : Math.max(1, Math.min(n, Math.round(how.cols ?? defaultColumns(n))));
  const byX = (a: number, b: number) => mid(boxes[a]).x - mid(boxes[b]).x, byY = (a: number, b: number) => mid(boxes[a]).y - mid(boxes[b]).y;
  // a grid (or things in a grid now) in reading order; otherwise a row left to right, a column top to bottom
  const inGrid = how.kind === 'grid' || (inferGrid(boxes)?.kind === 'grid' && readRows(boxes).filter((r) => r.length > 1).length > 1);
  const order = inGrid ? readRows(boxes).flat() : boxes.map((_, i) => i).sort(how.kind === 'row' ? byX : byY);
  const nRows = Math.ceil(n / cols);
  const colGap = how.colGap ?? how.gap, rowGap = how.rowGap ?? how.gap;
  // each thing lines up on its anchor: how far its box reaches each way from it
  const anchor = (i: number) => how.anchors?.[i] ?? mid(boxes[i]);
  const left = new Array<number>(cols).fill(0), right = new Array<number>(cols).fill(0);
  const up = new Array<number>(nRows).fill(0), down = new Array<number>(nRows).fill(0);
  order.forEach((i, k) => {
    const c = k % cols, r = Math.floor(k / cols), p = anchor(i), b = boxes[i];
    left[c] = Math.max(left[c], p.x - b.x1); right[c] = Math.max(right[c], b.x2 - p.x);
    up[r] = Math.max(up[r], p.y - b.y1); down[r] = Math.max(down[r], b.y2 - p.y);
  });
  // where each column's and row's line of anchors goes
  const colX: number[] = [], rowY: number[] = [];
  let x = 0;
  for (let c = 0; c < cols; c++) { colX[c] = x + left[c]; x += left[c] + right[c] + colGap; }
  let y = 0;
  for (let r = 0; r < nRows; r++) { rowY[r] = y + up[r]; y += up[r] + down[r] + rowGap; }
  const totalW = x - colGap, totalH = y - rowGap;
  // keep the middle of the whole where it was
  const all = boxes.reduce((r, b) => ({ x1: Math.min(r.x1, b.x1), y1: Math.min(r.y1, b.y1), x2: Math.max(r.x2, b.x2), y2: Math.max(r.y2, b.y2) }));
  const c = mid(all);
  const x0 = c.x - totalW / 2, y0 = c.y - totalH / 2;
  const out: Vec[] = new Array(n);
  order.forEach((i, k) => {
    const want = { x: x0 + colX[k % cols], y: y0 + rowY[Math.floor(k / cols)] };
    const p = anchor(i);
    out[i] = { x: want.x - p.x, y: want.y - p.y };
  });
  return out;
}

/**
 * The spacing things in rows mostly have now (the middle of the gaps between neighbours, across
 * and between rows), kept within sensible bounds: half a bond to four bonds.
 */
export function usualGap(boxes: Rect[], bond: number): number {
  const rows = readRows(boxes);
  const gaps: number[] = [];
  for (const r of rows) for (let k = 1; k < r.length; k++) gaps.push(boxes[r[k]].x1 - boxes[r[k - 1]].x2);
  for (let i = 1; i < rows.length; i++) {
    const above = Math.max(...rows[i - 1].map((k) => boxes[k].y2)), below = Math.min(...rows[i].map((k) => boxes[k].y1));
    gaps.push(below - above);
  }
  if (!gaps.length) return 1.5 * bond;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.min(4 * bond, Math.max(0.5 * bond, median));
}

/**
 * The point each structure lines up on: the middle of a ring they all have (a pyridine in a set
 * of pyridines), the one nearest the middle of each where there are several. Things that aren't
 * structures, or structures with no ring in common, line up on the middle of their boxes (null).
 */
export function sharedAnchors(doc: Doc, us: Unit[]): (Vec | null)[] {
  const none = us.map(() => null);
  const structs = us.map((u, i) => ({ u, i })).filter(({ u }) => u.atoms.length);
  if (structs.length < 2) return none;
  // each structure's rings, by kind: their size and the elements round them
  const kinds = structs.map(({ u }) => {
    const atoms = new Set(u.atoms);
    const bonds = [...doc.bonds.values()].filter((b) => atoms.has(b.a1) && atoms.has(b.a2)).map((b) => b.id);
    const out = new Map<string, Vec[]>();
    if (!bonds.length) return out;
    for (const r of ringsAmong(doc, bonds)) {
      if (!r.every((a) => atoms.has(a))) continue;
      const key = `${r.length}:${r.map((a) => doc.atoms.get(a)!.z).sort((p, q) => p - q).join(',')}`;
      const c = r.reduce((s2, a) => ({ x: s2.x + doc.atoms.get(a)!.x / r.length, y: s2.y + doc.atoms.get(a)!.y / r.length }), { x: 0, y: 0 });
      out.set(key, [...(out.get(key) ?? []), c]);
    }
    return out;
  });
  const shared = [...kinds[0].keys()].filter((k) => kinds.every((m) => m.has(k)));
  if (!shared.length) return none;
  // of the kinds they all have, the one that sits nearest the middle of each
  const near = (k: string, j: number) => {
    const m = mid(structs[j].u.box);
    return kinds[j].get(k)!.reduce((best, c) => (Math.hypot(c.x - m.x, c.y - m.y) < Math.hypot(best.x - m.x, best.y - m.y) ? c : best));
  };
  const cost = (k: string) => structs.reduce((t, _, j) => { const c = near(k, j), m = mid(structs[j].u.box); return t + Math.hypot(c.x - m.x, c.y - m.y); }, 0);
  const best = shared.reduce((a, b) => (cost(b) < cost(a) - 1e-6 || (Math.abs(cost(b) - cost(a)) <= 1e-6 && Number(b.split(':')[0]) > Number(a.split(':')[0])) ? b : a));
  const out: (Vec | null)[] = none.slice();
  structs.forEach(({ i }, j) => { out[i] = near(best, j); });
  return out;
}
