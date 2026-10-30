// The drawing's page grid on screen (the sums are in page-grid.ts): pages in use white, empty
// pages and the space round them a light grey, the page boundaries a faint dashed line, a fainter
// outline of the pages beyond the grid where drawing adds pages, and each fixed edge a bold line
// hatched on its outside, like the ground in a physics diagram. Drawn on the overlay, in points;
// none of it is saved, printed, copied or exported.

import type { Rect } from '../geom';
import type { PageSetup } from '../model';
import { type Extent, type PageLook, type Side, SHADE_ALPHA, DEFAULT_LINE_COLOUR, extentRect, wallRect, wallsOf, pageKey } from '../page-grid';
import { seenRect } from '../orientation-prefs';
import type { OrientView } from './orientation';

/** The colour of the shading (over the page colour) and of the lines when left at their default, on light and dark pages. */
const SHADE = { light: '45, 58, 82', dark: '225, 232, 245' };
const DARK_LINE = '#a9b6cc';

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The dash pattern for a line style, in points at this zoom. */
function dash(style: PageLook['lineStyle'], width: number, px: number): number[] {
  if (style === 'dashed') return [6 * px * Math.max(1, width), 4 * px * Math.max(1, width)];
  if (style === 'dotted') return [Math.max(1, width) * px, 3 * px * Math.max(1, width)];
  return [];
}

function clip(a: Rect, b: Rect): Rect | null {
  const r = { x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2) };
  return r.x2 > r.x1 && r.y2 > r.y1 ? r : null;
}

/** The grid lines (multiples of the page's size) that cross a box, as one path. */
function gridPath(ctx: CanvasRenderingContext2D, p: PageSetup, box: Rect): void {
  ctx.beginPath();
  for (let c = Math.ceil(box.x1 / p.w); c * p.w <= box.x2; c++) { ctx.moveTo(c * p.w, box.y1); ctx.lineTo(c * p.w, box.y2); }
  for (let r = Math.ceil(box.y1 / p.h); r * p.h <= box.y2; r++) { ctx.moveTo(box.x1, r * p.h); ctx.lineTo(box.x2, r * p.h); }
}

/**
 * Paint the page grid: `e` the drawing's pages, `used` those with something on them (page-grid.ts
 * usedPages). `dark`: the page is shown dark.
 */
export function paintPages(ctx: CanvasRenderingContext2D, look: PageLook, r: OrientView, p: PageSetup, e: Extent, used: Set<string>, dark: boolean): void {
  if (!look.grid) return;
  const s = r.view.scale;
  if (!(s > 0)) return;
  const px = 1 / s;
  const seen = seenRect(r.view, r.width, r.height);
  const pad = 4 * px;
  const view = { x1: seen.x1 - pad, y1: seen.y1 - pad, x2: seen.x2 + pad, y2: seen.y2 + pad };
  const grid = extentRect(p, e);
  const walls = wallRect(p);
  const room = clip(walls, view);
  const shade = dark ? SHADE.dark : SHADE.light;
  const lineHex = dark && look.lineColour === DEFAULT_LINE_COLOUR ? DARK_LINE : look.lineColour;
  // (pages a few pixels across are too small to draw lines between)
  const tiny = Math.min(p.w, p.h) * s < 8;
  ctx.save();

  // the space round the pages, where drawing adds pages, a light grey; beyond a fixed edge darker
  const out = SHADE_ALPHA[look.outsideShade];
  if (out > 0) {
    ctx.fillStyle = `rgba(${shade}, ${out})`;
    ctx.beginPath();
    ctx.rect(view.x1, view.y1, view.x2 - view.x1, view.y2 - view.y1);
    ctx.rect(grid.x1, grid.y1, grid.x2 - grid.x1, grid.y2 - grid.y1);
    ctx.fill('evenodd');
  }
  if (!room || room.x1 > view.x1 || room.y1 > view.y1 || room.x2 < view.x2 || room.y2 < view.y2) {
    ctx.fillStyle = `rgba(${shade}, ${Math.max(0.07, out + 0.05)})`;
    ctx.beginPath();
    ctx.rect(view.x1, view.y1, view.x2 - view.x1, view.y2 - view.y1);
    if (room) ctx.rect(room.x1, room.y1, room.x2 - room.x1, room.y2 - room.y1);
    ctx.fill('evenodd');
  }

  // pages with nothing on them a light grey
  const empty = SHADE_ALPHA[look.emptyShade];
  const inView = clip(grid, view);
  if (empty > 0 && inView) {
    ctx.fillStyle = `rgba(${shade}, ${empty})`;
    ctx.beginPath();
    const c0 = Math.floor(inView.x1 / p.w), c1 = Math.ceil(inView.x2 / p.w) - 1, r0 = Math.floor(inView.y1 / p.h), r1 = Math.ceil(inView.y2 / p.h) - 1;
    if ((c1 - c0 + 1) * (r1 - r0 + 1) < 20000) {
      for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) if (!used.has(pageKey(c, rr))) ctx.rect(c * p.w, rr * p.h, p.w, p.h);
    }
    ctx.fill();
  }

  const w = look.lineWidth;
  ctx.lineWidth = w * px;
  ctx.setLineDash(dash(look.lineStyle, w, px));
  ctx.lineCap = look.lineStyle === 'dotted' ? 'round' : 'butt';

  // a faint outline of the pages beyond the grid: there is more room that way
  if (look.ghost && room && !tiny) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(room.x1, room.y1, room.x2 - room.x1, room.y2 - room.y1);
    ctx.rect(grid.x1, grid.y1, grid.x2 - grid.x1, grid.y2 - grid.y1);
    ctx.clip('evenodd');
    ctx.strokeStyle = rgba(lineHex, look.lineOpacity * 0.45);
    gridPath(ctx, p, room);
    ctx.stroke();
    ctx.restore();
  }

  // the page boundaries, and the grid's open edges
  if (inView && !tiny) {
    ctx.strokeStyle = rgba(lineHex, look.lineOpacity);
    gridPath(ctx, p, { x1: Math.max(grid.x1, view.x1), y1: Math.max(grid.y1, view.y1), x2: Math.min(grid.x2, view.x2), y2: Math.min(grid.y2, view.y2) });
    ctx.stroke();
  }

  // fixed edges: a bold line, hatched on the side nothing can go
  const ws = wallsOf(p);
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  const wallInk = rgba(lineHex, Math.min(1, look.lineOpacity + 0.35));
  if (look.wallStyle === 'hatch') {
    ctx.strokeStyle = wallInk;
    ctx.lineWidth = look.hatchWidth * px;
    for (const side of ['l', 't', 'r', 'b'] as Side[]) {
      if (ws[side] === undefined) continue;
      const band = hatchBand(side, walls, look.hatchLength * px, view);
      if (!band) continue;
      // the side edges' strokes lean the other way when mirrored, meeting the others in a chevron
      const turned = look.hatchCorner === 'mirror' && (side === 'l' || side === 'r');
      hatch(ctx, band, turned ? 180 - look.hatchAngle : look.hatchAngle, look.hatchSpacing * px);
    }
  }
  ctx.strokeStyle = wallInk;
  ctx.lineWidth = look.wallWidth * px;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const side of ['l', 't', 'r', 'b'] as Side[]) {
    if (ws[side] === undefined) continue;
    const vertical = side === 'l' || side === 'r';
    const at = side === 'l' ? walls.x1 : side === 'r' ? walls.x2 : side === 't' ? walls.y1 : walls.y2;
    // along the room the edge bounds (it runs on where the grid can still grow)
    const from = Math.max(vertical ? walls.y1 : walls.x1, vertical ? view.y1 : view.x1);
    const to = Math.min(vertical ? walls.y2 : walls.x2, vertical ? view.y2 : view.x2);
    if (to <= from || at < (vertical ? view.x1 : view.y1) || at > (vertical ? view.x2 : view.y2)) continue;
    if (vertical) { ctx.moveTo(at, from); ctx.lineTo(at, to); } else { ctx.moveTo(from, at); ctx.lineTo(to, at); }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The strip a fixed edge's hatching fills: `depth` deep on the outside of the edge, along the part
 * in view. Where it meets another fixed edge it runs on to the outside corner, cut along the
 * diagonal, so the two strips meet like the sides of a picture frame. Null when out of view.
 */
export function hatchBand(side: Side, walls: Rect, depth: number, view: Rect): { x: number; y: number }[] | null {
  const vertical = side === 'l' || side === 'r';
  const at = side === 'l' ? walls.x1 : side === 'r' ? walls.x2 : side === 't' ? walls.y1 : walls.y2;
  const lo = vertical ? walls.y1 : walls.x1, hi = vertical ? walls.y2 : walls.x2;
  const vlo = (vertical ? view.y1 : view.x1) - depth, vhi = (vertical ? view.y2 : view.x2) + depth;
  const across = vertical ? [view.x1, view.x2] : [view.y1, view.y2];
  if (!isFinite(at) || at < across[0] - depth || at > across[1] + depth) return null;
  // each end: at the corner with another fixed edge (mitred), or cut off past the window
  const a = isFinite(lo) && lo >= vlo ? lo : vlo, b = isFinite(hi) && hi <= vhi ? hi : vhi;
  if (b <= a) return null;
  const ma = a === lo ? depth : 0, mb = b === hi ? depth : 0;
  const out = side === 'l' || side === 't' ? -depth : depth;
  const pts: [number, number][] = [[at, a], [at, b], [at + out, b + mb], [at + out, a - ma]];
  return pts.map(([u, v]) => (vertical ? { x: u, y: v } : { x: v, y: u }));
}

/** Parallel strokes at `angle` degrees (45 leans like /), `gap` apart along a level edge, filling a polygon. */
function hatch(ctx: CanvasRenderingContext2D, poly: { x: number; y: number }[], angle: number, gap: number): void {
  const t = (angle * Math.PI) / 180;
  const d = { x: Math.cos(t), y: -Math.sin(t) }, n = { x: Math.sin(t), y: Math.cos(t) };
  // the gap between the strokes themselves
  const step = Math.max(1e-6, gap * Math.abs(Math.sin(t)));
  let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
  for (const p of poly) {
    const u = p.x * n.x + p.y * n.y, v = p.x * d.x + p.y * d.y;
    p0 = Math.min(p0, u); p1 = Math.max(p1, u); q0 = Math.min(q0, v); q1 = Math.max(q1, v);
  }
  // (a strip far longer than the window is never asked for: hatchBand cuts it to the view)
  if ((p1 - p0) / step > 5000) return;
  ctx.save();
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  ctx.beginPath();
  for (let k = Math.ceil(p0 / step); k * step <= p1; k++) {
    const u = k * step;
    ctx.moveTo(n.x * u + d.x * q0, n.y * u + d.y * q0);
    ctx.lineTo(n.x * u + d.x * q1, n.y * u + d.y * q1);
  }
  ctx.stroke();
  ctx.restore();
}
