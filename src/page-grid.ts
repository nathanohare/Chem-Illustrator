// The drawing as a grid of pages (Drawing mode): a new drawing has one page, and whole pages are
// added as the drawing goes past them, so it is plain how it maps onto ChemDraw's pages and
// printed sheets. Up to three edges can be fixed (top and left at first, as ChemDraw's pages grow
// right and down): the grid never grows past them, and nothing can be put beyond them. With
// "keep it on the page" the grid is a set number of pages across and down. The sums are here,
// apart from the screen, so they can be tested; the painting is in ui/page-grid-view.ts.

import type { Rect, Vec } from './geom';
import { type Doc, type PageSetup, type PageWalls, shiftDrawing } from './model';

/** Top and left fixed at the first page, as ChemDraw's pages grow right and down. */
export const DEFAULT_WALLS: PageWalls = { l: 0, t: 0 };

/** The pages a drawing has: columns c0..c1 and rows r0..r1 (page 0, 0 is the first, at the origin). */
export interface Extent { c0: number; c1: number; r0: number; r1: number }

export type Side = 'l' | 't' | 'r' | 'b';
export const SIDES: readonly Side[] = ['t', 'b', 'l', 'r'];
export const SIDE_NAMES: Record<Side, string> = { t: 'top', b: 'bottom', l: 'left', r: 'right' };

/** The page's fixed edges (top and left when it doesn't say); a page kept to a set size has all four. */
export function wallsOf(p: PageSetup): PageWalls {
  if (!p.grow) return { l: 0, t: 0, r: Math.max(1, p.across ?? 1) - 1, b: Math.max(1, p.down ?? 1) - 1 };
  return p.walls ?? DEFAULT_WALLS;
}

/** How many edges are fixed. */
export function fixedCount(w: PageWalls): number {
  return SIDES.filter((s) => w[s] !== undefined).length;
}

/** The column or row of pages a coordinate is in. */
const cell = (v: number, size: number) => Math.floor(v / size);
/** The last column or row an edge at `v` reaches into (an edge right on a boundary stays on the page before it). */
const lastCell = (v: number, size: number) => Math.ceil(v / size) - 1;

/**
 * The pages the drawing has: the first page, as many as the file was set to have, and every page
 * something is on, out to (and never past) the fixed edges. A fixed edge is always the grid's
 * edge on its side. Kept to a set size: just those pages.
 */
export function pageExtent(p: PageSetup, content: Rect | null): Extent {
  if (!p.grow) {
    const w = wallsOf(p);
    return { c0: 0, c1: w.r!, r0: 0, r1: w.b! };
  }
  const e: Extent = { c0: 0, c1: Math.max(1, p.across ?? 1) - 1, r0: 0, r1: Math.max(1, p.down ?? 1) - 1 };
  if (content) {
    e.c0 = Math.min(e.c0, cell(content.x1, p.w));
    e.c1 = Math.max(e.c1, lastCell(content.x2, p.w));
    e.r0 = Math.min(e.r0, cell(content.y1, p.h));
    e.r1 = Math.max(e.r1, lastCell(content.y2, p.h));
  }
  const w = wallsOf(p);
  if (w.l !== undefined) e.c0 = w.l;
  if (w.r !== undefined) e.c1 = w.r;
  if (w.t !== undefined) e.r0 = w.t;
  if (w.b !== undefined) e.r1 = w.b;
  if (e.c1 < e.c0) e.c1 = e.c0;
  if (e.r1 < e.r0) e.r1 = e.r0;
  return e;
}

/** The grid's pages as one box, in points. */
export function extentRect(p: PageSetup, e: Extent): Rect {
  return { x1: e.c0 * p.w, y1: e.r0 * p.h, x2: (e.c1 + 1) * p.w, y2: (e.r1 + 1) * p.h };
}

/** How many pages across and down. */
export function pageCount(e: Extent): { across: number; down: number } {
  return { across: e.c1 - e.c0 + 1, down: e.r1 - e.r0 + 1 };
}

/** Where things may go: inside the fixed edges (an open side goes on for ever). */
export function wallRect(p: PageSetup): Rect {
  const w = wallsOf(p);
  return {
    x1: w.l !== undefined ? w.l * p.w : -Infinity, y1: w.t !== undefined ? w.t * p.h : -Infinity,
    x2: w.r !== undefined ? (w.r + 1) * p.w : Infinity, y2: w.b !== undefined ? (w.b + 1) * p.h : Infinity,
  };
}

/** A point kept inside the fixed edges. */
export function inWalls(pt: Vec, walls: Rect): Vec {
  const x = Math.min(Math.max(pt.x, walls.x1), walls.x2), y = Math.min(Math.max(pt.y, walls.y1), walls.y2);
  return x === pt.x && y === pt.y ? pt : { x, y };
}

/**
 * A move of `box` by `d` cut short where it would cross a fixed edge. Something bigger than the
 * room between two edges keeps to the first (left or top) one.
 */
export function clampMove(box: Rect, d: Vec, walls: Rect): Vec {
  const axis = (lo: number, hi: number, m: number, w1: number, w2: number) => {
    let v = m;
    if (hi + v > w2) v = w2 - hi;
    if (lo + v < w1) v = w1 - lo;
    return v;
  };
  return { x: axis(box.x1, box.x2, d.x, walls.x1, walls.x2), y: axis(box.y1, box.y2, d.y, walls.y1, walls.y2) };
}

/** Whether a box goes past a fixed edge. */
export function crossesWalls(box: Rect, walls: Rect, slack = 0.5): boolean {
  return box.x1 < walls.x1 - slack || box.y1 < walls.y1 - slack || box.x2 > walls.x2 + slack || box.y2 > walls.y2 + slack;
}

/**
 * How far the window can scroll: the pages, one page more on each open side (so the next pages
 * can be seen and drawn on), and anything drawn outside them.
 */
export function scrollBox(p: PageSetup, e: Extent, content: Rect | null): Rect {
  const r = extentRect(p, e), w = wallsOf(p);
  const out = {
    x1: r.x1 - (w.l === undefined ? p.w : 0), y1: r.y1 - (w.t === undefined ? p.h : 0),
    x2: r.x2 + (w.r === undefined ? p.w : 0), y2: r.y2 + (w.b === undefined ? p.h : 0),
  };
  if (content) {
    out.x1 = Math.min(out.x1, content.x1); out.y1 = Math.min(out.y1, content.y1);
    out.x2 = Math.max(out.x2, content.x2); out.y2 = Math.max(out.y2, content.y2);
  }
  return out;
}

/** The key of a page in the set of pages in use. */
export const pageKey = (c: number, r: number) => `${c},${r}`;

/** The pages the boxes reach into (something across a page boundary is on both pages). */
export function usedPages(p: PageSetup, boxes: Iterable<Rect>): Set<string> {
  const out = new Set<string>();
  for (const b of boxes) {
    const c0 = cell(b.x1, p.w), c1 = Math.max(c0, lastCell(b.x2, p.w)), r0 = cell(b.y1, p.h), r1 = Math.max(r0, lastCell(b.y2, p.h));
    // (a box over a huge area is cut down to a sane number of pages)
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > 10000) continue;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.add(pageKey(c, r));
  }
  return out;
}

/**
 * The pages to print, in reading order (across, then down): every page of the grid, or only those
 * with something on them.
 */
export function pagesToPrint(e: Extent, used: Set<string>, skipEmpty: boolean): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = [];
  for (let r = e.r0; r <= e.r1; r++) for (let c = e.c0; c <= e.c1; c++) if (!skipEmpty || used.has(pageKey(c, r))) out.push({ c, r });
  return out;
}

/** The fixed edges after ticking or unticking one: a newly fixed edge is fixed where the grid's edge is now. */
export function setWall(p: PageSetup, content: Rect | null, side: Side, on: boolean): PageWalls {
  const w: PageWalls = { ...wallsOf(p) };
  if (!on) { delete w[side]; return w; }
  if (w[side] !== undefined) return w;
  const e = pageExtent(p, content);
  w[side] = side === 'l' ? e.c0 : side === 'r' ? e.c1 : side === 't' ? e.r0 : e.r1;
  return w;
}

/**
 * The move that puts the grid's first page at the origin, as ChemDraw has it (pages added above or
 * to the left of the first page): what to add to every coordinate when saving.
 */
export function originShift(p: PageSetup, e: Extent): Vec {
  return { x: e.c0 < 0 ? -e.c0 * p.w : 0, y: e.r0 < 0 ? -e.r0 * p.h : 0 };
}

/** The fixed edges counted from a new first page (after originShift). */
export function shiftWalls(w: PageWalls, dc: number, dr: number): PageWalls {
  const out: PageWalls = {};
  if (w.l !== undefined) out.l = w.l + dc;
  if (w.r !== undefined) out.r = w.r + dc;
  if (w.t !== undefined) out.t = w.t + dr;
  if (w.b !== undefined) out.b = w.b + dr;
  return out;
}

/**
 * Pasted things wrapped at the page's edges, like words in a line of text: things one above
 * another (a reagent over its arrow) stay together as one column, the columns keep their order
 * from left to right and their heights as pasted, and a new row is started below when the next
 * column would go past `right`. Returns how far to move each box.
 */
export function wrapPieces(boxes: Rect[], left: number, right: number, top: number, gap: number): Vec[] {
  const out: Vec[] = boxes.map(() => ({ x: 0, y: 0 }));
  if (!boxes.length) return out;
  // the columns: things whose widths overlap
  const order = boxes.map((_b, i) => i).sort((i, j) => boxes[i].x1 - boxes[j].x1);
  const cols: { x1: number; x2: number; y2: number; items: number[] }[] = [];
  for (const i of order) {
    const b = boxes[i], last = cols[cols.length - 1];
    if (last && b.x1 < last.x2) { last.items.push(i); last.x2 = Math.max(last.x2, b.x2); last.y2 = Math.max(last.y2, b.y2); } else cols.push({ x1: b.x1, x2: b.x2, y2: b.y2, items: [i] });
  }
  const top0 = Math.min(...boxes.map((b) => b.y1));
  let x = left, y = top, rowH = 0;
  for (const c of cols) {
    const w = c.x2 - c.x1;
    if (x > left && x + w > right) { y += rowH + gap; x = left; rowH = 0; }
    const d = { x: x - c.x1, y: y - top0 };
    for (const i of c.items) out[i] = d;
    x += w + gap;
    rowH = Math.max(rowH, c.y2 - top0);
  }
  return out;
}

/**
 * Run `fn` (writing the file) with the grid's first page at the origin, as ChemDraw has it, when
 * pages were added above or to the left of the first page; the drawing is put back after, with
 * nothing to undo. (Not while a step is being made, which putting it back would undo too.)
 */
export function atFirstPage<T>(doc: Doc, fn: () => T): T {
  const p = doc.page;
  if (!p || doc.editing) return fn();
  const e = pageExtent(p, doc.bounds()), d = originShift(p, e);
  if (!d.x && !d.y) return fn();
  const was = p.walls, across = p.across, down = p.down;
  // (the pages before the first are counted in, so none are lost)
  const n = pageCount(e);
  p.across = Math.max(across ?? 1, n.across);
  p.down = Math.max(down ?? 1, n.down);
  doc.begin('Save');
  shiftDrawing(doc, d.x, d.y);
  if (p.grow) p.walls = shiftWalls(wallsOf(p), Math.round(d.x / p.w), Math.round(d.y / p.h));
  try {
    return fn();
  } finally {
    doc.abandon();
    if (was) p.walls = was; else delete p.walls;
    if (across === undefined) delete p.across; else p.across = across;
    if (down === undefined) delete p.down; else p.down = down;
  }
}

// ---------------------------------------------------------------- in the file

/**
 * What the CDXML page keeps for this program: whether the grid is kept to its pages and which edges
 * are fixed (null when it is as a new drawing's: growing, with top and left fixed).
 */
export function pageTag(p: PageSetup): string | null {
  const walls = p.walls ?? DEFAULT_WALLS;
  const usual = walls.l === 0 && walls.t === 0 && walls.r === undefined && walls.b === undefined;
  if (p.grow && usual) return null;
  return JSON.stringify(p.grow ? { walls } : { grow: false });
}

/** The page grid kept in a file, or null when there is none (or it can't be read). */
export function readPageTag(v: string | null | undefined): Partial<PageSetup> | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as { grow?: unknown; walls?: unknown };
    if (o.grow === false) return { grow: false };
    if (!o.walls || typeof o.walls !== 'object') return null;
    const w: PageWalls = {};
    for (const s of SIDES) {
      const n = (o.walls as Record<string, unknown>)[s];
      if (typeof n === 'number' && Number.isInteger(n) && Math.abs(n) < 10000) w[s] = n;
    }
    // (never all four: one side always grows)
    if (fixedCount(w) > 3) delete w.b;
    return { walls: w };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- how the grid looks (Settings ▸ Page Grid)

export type LineStyle = 'dashed' | 'dotted' | 'solid';
export type Shade = 'off' | 'faint' | 'light' | 'strong';

export interface PageLook {
  /** Show the drawing's pages (off: the endless canvas, with nothing fixed). */
  grid: boolean;
  /** The page boundaries: width in screen pixels, style, colour and how see-through (0 to 1). */
  lineWidth: number;
  lineStyle: LineStyle;
  lineColour: string;
  lineOpacity: number;
  /** Pages with nothing on them shaded grey; the area outside the pages too. */
  emptyShade: Shade;
  outsideShade: Shade;
  /** A faint outline of the pages beyond the grid, where drawing will add pages. */
  ghost: boolean;
  /** A fixed edge: a bold line with hatching on the outside ('hatch') or a bold line only. */
  wallStyle: 'hatch' | 'line';
  /** What happens when a paste would go past a fixed edge. */
  pasteAtWall: 'ask' | 'pages' | 'wrap';
}

export const DEFAULT_LINE_COLOUR = '#6b7a90';

export const DEFAULT_PAGE_LOOK: PageLook = {
  grid: true, lineWidth: 1, lineStyle: 'dashed', lineColour: DEFAULT_LINE_COLOUR, lineOpacity: 0.55,
  emptyShade: 'light', outsideShade: 'faint', ghost: true, wallStyle: 'hatch', pasteAtWall: 'ask',
};

const LOOK_CHOICES: { [K in keyof PageLook]?: readonly string[] } = {
  lineStyle: ['dashed', 'dotted', 'solid'], emptyShade: ['off', 'faint', 'light', 'strong'], outsideShade: ['off', 'faint', 'light', 'strong'],
  wallStyle: ['hatch', 'line'], pasteAtWall: ['ask', 'pages', 'wrap'],
};

/** The settings as saved, with anything missing or not understood left at its default. */
export function parsePageLook(raw: unknown): PageLook {
  const out: PageLook = { ...DEFAULT_PAGE_LOOK };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const o = out as unknown as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_PAGE_LOOK) as (keyof PageLook)[]) {
    const v = r[k], allowed = LOOK_CHOICES[k];
    if (allowed) { if (typeof v === 'string' && allowed.includes(v)) o[k] = v; }
    else if (k === 'lineColour') { if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) o[k] = v; }
    else if (k === 'lineWidth') { if (typeof v === 'number' && v >= 0.5 && v <= 4) o[k] = v; }
    else if (k === 'lineOpacity') { if (typeof v === 'number' && v >= 0.05 && v <= 1) o[k] = v; }
    else if (typeof v === 'boolean') o[k] = v;
  }
  return out;
}

/** How dark the shading of empty pages and the outside is (over the page colour). */
export const SHADE_ALPHA: Record<Shade, number> = { off: 0, faint: 0.035, light: 0.06, strong: 0.1 };
