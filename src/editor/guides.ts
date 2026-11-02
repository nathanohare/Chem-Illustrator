// Guides on a drawing (View > Toolboxes > Guides): crosshairs, lines across or up and down, or a
// grid, each marked like a ruler with major and minor ticks (1 inch and a quarter inch to start
// with). The atom or bond grabbed in a move snaps onto a guide and to its ticks: the major ones,
// the minor ones, both, or neither. Guides are kept with the file (CDXML keeps them in a tag
// ChemDraw passes over), and are never exported or printed.

import type { Vec } from '../geom';

export type GuideKind = 'cross' | 'h' | 'v';

/** One guide: a crosshair (its middle at x, y), a line across (at y) or a line up and down (at x). */
export interface Guide { kind: GuideKind; x: number; y: number }

/** What a grabbed atom or bond snaps to along a guide. */
export type GuideSnap = 'major' | 'minor' | 'both' | 'none';
export const GUIDE_SNAPS: GuideSnap[] = ['major', 'minor', 'both', 'none'];

export interface CanvasGuides {
  list: Guide[];
  /** Grid lines every major tick across the whole drawing (from its top left), with minor ticks on them. */
  grid: boolean;
  /** Tick spacing in points. */
  major: number;
  minor: number;
  snap: GuideSnap;
  /** The guides show (and snap); off keeps them for later. */
  shown: boolean;
}

export const DEFAULT_GUIDES: CanvasGuides = { list: [], grid: false, major: 72, minor: 18, snap: 'both', shown: true };

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** Guides as a file keeps them (JSON), read back with only what makes sense; null when there are none. */
export function parseGuides(raw: unknown): CanvasGuides | null {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const list: Guide[] = [];
  if (Array.isArray(o.list)) {
    for (const g of o.list.slice(0, 200)) {
      if (!g || typeof g !== 'object') continue;
      const r = g as Record<string, unknown>;
      const kind = r.kind === 'h' || r.kind === 'v' || r.kind === 'cross' ? r.kind : null;
      const x = num(r.x, -1e6, 1e6) ?? 0, y = num(r.y, -1e6, 1e6) ?? 0;
      if (kind) list.push({ kind, x, y });
    }
  }
  const major = num(o.major, 1, 2000) ?? DEFAULT_GUIDES.major;
  const minor = Math.min(major, num(o.minor, 0.5, 2000) ?? Math.min(major, DEFAULT_GUIDES.minor));
  const snap = GUIDE_SNAPS.includes(o.snap as GuideSnap) ? (o.snap as GuideSnap) : DEFAULT_GUIDES.snap;
  const g: CanvasGuides = { list, grid: o.grid === true, major, minor, snap, shown: o.shown !== false };
  return g.list.length || g.grid ? g : null;
}

/** The text a file keeps (null: nothing worth keeping). */
export function guidesText(g: CanvasGuides | null): string | null {
  if (!g || (!g.list.length && !g.grid)) return null;
  const r = (v: number) => Math.round(v * 100) / 100;
  return JSON.stringify({ list: g.list.map((x) => ({ kind: x.kind, x: r(x.x), y: r(x.y) })), grid: g.grid || undefined, major: r(g.major), minor: r(g.minor), snap: g.snap, shown: g.shown ? undefined : false });
}

/** A line of a guide: up and down (at `at` = x) or across (at `at` = y), its ticks counted from `origin` along it. */
export interface GuideLine { axis: 'x' | 'y'; at: number; origin: number; guide: number | null }

/**
 * The lines of the guides, near `area` (the grid's lines only there): up-and-down lines (axis 'x')
 * and lines across (axis 'y'). `guide` is the index of the guide a line belongs to (null: the grid).
 */
export function guideLines(g: CanvasGuides, area: { x1: number; y1: number; x2: number; y2: number }): GuideLine[] {
  const out: GuideLine[] = [];
  g.list.forEach((x, i) => {
    if (x.kind !== 'h') out.push({ axis: 'x', at: x.x, origin: x.kind === 'cross' ? x.y : 0, guide: i });
    if (x.kind !== 'v') out.push({ axis: 'y', at: x.y, origin: x.kind === 'cross' ? x.x : 0, guide: i });
  });
  if (g.grid && g.major > 0) {
    const n = Math.ceil(Math.max(area.x2 - area.x1, area.y2 - area.y1) / g.major);
    // (a far zoomed-out view shows no grid rather than thousands of lines)
    if (n < 400) {
      for (let k = Math.floor(area.x1 / g.major); k * g.major <= area.x2; k++) out.push({ axis: 'x', at: k * g.major, origin: 0, guide: null });
      for (let k = Math.floor(area.y1 / g.major); k * g.major <= area.y2; k++) out.push({ axis: 'y', at: k * g.major, origin: 0, guide: null });
    }
  }
  return out;
}

const near = (v: number, step: number, origin: number) => origin + Math.round((v - origin) / step) * step;

/** The tick nearest `v` along a line whose ticks count from `origin`, of the kind snapped to (null: none). */
export function tickNear(v: number, origin: number, g: Pick<CanvasGuides, 'major' | 'minor' | 'snap'>): number | null {
  if (g.snap === 'none') return null;
  if (g.snap === 'major') return near(v, g.major, origin);
  const m = near(v, g.minor, origin);
  if (g.snap === 'both') return m;
  // minor only: the minor ticks between the major ones
  const isMajor = (t: number) => Math.abs(near(t, g.major, origin) - t) < 1e-6;
  if (!isMajor(m)) return m;
  const a = m - g.minor, b = m + g.minor;
  const ok = [a, b].filter((t) => !isMajor(t));
  return ok.length ? ok.reduce((best, t) => (Math.abs(t - v) < Math.abs(best - v) ? t : best)) : null;
}

/**
 * Where a grabbed point `p` snaps to: onto a guide line within `tol`, and to a tick along it.
 * Each coordinate snaps on its own; `lines` are the lines it snapped onto (to show them).
 */
export function snapToGuides(p: Vec, g: CanvasGuides, lines: GuideLine[], tol: number): { at: Vec; on: GuideLine[] } {
  if (!g.shown || g.snap === 'none') return { at: p, on: [] };
  const best = (axis: 'x' | 'y') => {
    let pick: GuideLine | null = null, d = tol;
    for (const l of lines) if (l.axis === axis) { const e = Math.abs((axis === 'x' ? p.x : p.y) - l.at); if (e <= d) { d = e; pick = l; } }
    return pick;
  };
  const vx = best('x'), hy = best('y');
  let x = p.x, y = p.y;
  if (vx) x = vx.at;
  if (hy) y = hy.at;
  // on one line only: the point slides along it to the nearest tick
  if (vx && !hy) { const t = tickNear(p.y, vx.origin, g); if (t !== null && Math.abs(t - p.y) <= tol) y = t; }
  if (hy && !vx) { const t = tickNear(p.x, hy.origin, g); if (t !== null && Math.abs(t - p.x) <= tol) x = t; }
  return { at: { x, y }, on: [vx, hy].filter((l): l is GuideLine => !!l) };
}

/** The guide (its index, and whether its middle) under a point, within `tol`: a crosshair's middle first, then any line. */
export function guideAt(p: Vec, g: CanvasGuides, tol: number): { index: number; part: 'middle' | 'x' | 'y' } | null {
  if (!g.shown) return null;
  for (let i = g.list.length - 1; i >= 0; i--) {
    const x = g.list[i];
    if (x.kind === 'cross' && Math.hypot(p.x - x.x, p.y - x.y) <= tol * 1.6) return { index: i, part: 'middle' };
  }
  for (let i = g.list.length - 1; i >= 0; i--) {
    const x = g.list[i];
    if (x.kind !== 'h' && Math.abs(p.x - x.x) <= tol) return { index: i, part: 'x' };
    if (x.kind !== 'v' && Math.abs(p.y - x.y) <= tol) return { index: i, part: 'y' };
  }
  return null;
}

/** A guide moved by a drag of its middle (both ways) or of one of its lines (that way only). */
export function movedGuide(x: Guide, part: 'middle' | 'x' | 'y', to: Vec): Guide {
  if (part === 'middle') return { ...x, x: to.x, y: to.y };
  return part === 'x' ? { ...x, x: to.x } : { ...x, y: to.y };
}

/** The ticks to draw along a line between a and b (in its own direction): positions and whether major. */
export function ticksBetween(a: number, b: number, origin: number, g: Pick<CanvasGuides, 'major' | 'minor'>, minGap: number): { at: number; major: boolean }[] {
  const out: { at: number; major: boolean }[] = [];
  const step = g.minor >= minGap ? g.minor : g.major >= minGap ? g.major : 0;
  if (!step) return out;
  const n = Math.ceil((b - a) / step);
  if (n > 4000) return out;
  for (let t = origin + Math.ceil((a - origin) / step) * step; t <= b; t += step) {
    const major = Math.abs(near(t, g.major, origin) - t) < 1e-6;
    out.push({ at: t, major });
  }
  return out;
}
