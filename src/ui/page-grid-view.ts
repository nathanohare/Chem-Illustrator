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
  for (const side of ['l', 't', 'r', 'b'] as Side[]) {
    if (ws[side] === undefined) continue;
    const vertical = side === 'l' || side === 'r';
    const at = side === 'l' ? walls.x1 : side === 'r' ? walls.x2 : side === 't' ? walls.y1 : walls.y2;
    // along the room the edge bounds (it runs on where the grid can still grow)
    const from = Math.max(vertical ? walls.y1 : walls.x1, (vertical ? view.y1 : view.x1));
    const to = Math.min(vertical ? walls.y2 : walls.x2, (vertical ? view.y2 : view.x2));
    if (to <= from || at < (vertical ? view.x1 : view.y1) || at > (vertical ? view.x2 : view.y2)) continue;
    ctx.strokeStyle = wallInk;
    ctx.lineWidth = Math.max(2, w * 2.2) * px;
    ctx.beginPath();
    if (vertical) { ctx.moveTo(at, from); ctx.lineTo(at, to); } else { ctx.moveTo(from, at); ctx.lineTo(to, at); }
    ctx.stroke();
    if (look.wallStyle !== 'hatch') continue;
    // hatching: short slanted strokes on the outside, a fixed size on screen
    const step = 7 * px, len = 7 * px, outward = side === 'l' || side === 't' ? -1 : 1;
    ctx.lineWidth = Math.max(1, w) * px;
    ctx.beginPath();
    for (let v = Math.ceil(from / step) * step; v <= to; v += step) {
      if (vertical) { ctx.moveTo(at, v); ctx.lineTo(at + outward * len, v + len); } else { ctx.moveTo(v, at); ctx.lineTo(v + len, at + outward * len); }
    }
    ctx.stroke();
  }
  ctx.restore();
}
