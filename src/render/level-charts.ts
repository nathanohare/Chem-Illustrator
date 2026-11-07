// Drawing the three charts of levels (levels.ts works out their numbers): a Sankey chart, a
// treemap and a decomposition tree. chart-draw.ts lays out the chart's title and hands over the
// space left, with a pen for its text, and each chart says where its clickable parts are.
//
// `shown` is the chart's data again with a dashboard pick applied: a part the pick leaves nothing
// of is drawn faded, so what was picked stands out.

import type { Chart, SeriesData } from '../sheet/chart';
import { CHART_PALETTES } from '../sheet/chart';
import { findNode, levelFlows, levelRows, levelTree, reachablePath, squarify, type LevelNode } from '../sheet/levels';
import { generalNumber } from '../sheet/numfmt';
import type { VectorContext } from './vector';
import type { Box, ClickPart } from './chart-draw';

type Ctx = CanvasRenderingContext2D | VectorContext;

export interface PenStyle { bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' }

/** Writing the chart's text in its font. */
export interface Pen {
  /** Writes `s` with its baseline at `y`, and says how wide it came out. */
  write(s: string, x: number, y: number, size: number, style?: PenStyle): number;
  /** How wide `s` would come out. */
  width(s: string, size: number, style?: PenStyle): number;
}

const INK = '#404040', MUTED = '#a6a6a6', LINK = '#2f5597';

const paletteOf = (chart: Chart): string[] => (CHART_PALETTES[chart.palette ?? 'office'] ?? CHART_PALETTES.office).colors;

/** The red, green and blue of "#rrggbb" (null for any other way of writing a color). */
function rgbOf(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** A color moved `t` of the way toward white (t > 0) or black (t < 0). */
function tint(hex: string, t: number): string {
  const rgb = rgbOf(hex);
  if (!rgb) return hex;
  const to = t > 0 ? 255 : 0, k = Math.abs(t);
  return '#' + rgb.map((c) => Math.round(c + (to - c) * k).toString(16).padStart(2, '0')).join('');
}

/** A color seen through, `a` of it showing. */
function seeThrough(hex: string, a: number): string {
  const rgb = rgbOf(hex);
  return rgb ? `rgba(${rgb.join(', ')}, ${a})` : hex;
}

/** How a part the pick leaves out is drawn. */
const FADED = 0.3;

const fillPath = (ctx: Ctx): void => (ctx as CanvasRenderingContext2D).fill();

/** As much of `s` as fits in `room`, ending in an ellipsis when cut ('' when nothing fits). */
function shorten(pen: Pen, s: string, room: number, size: number, style?: PenStyle): string {
  if (pen.width(s, size, style) <= room) return s;
  let fits = 0, over = s.length;
  while (over - fits > 1) {
    const n = (fits + over) >> 1;
    if (pen.width(s.slice(0, n) + '…', size, style) <= room) fits = n; else over = n;
  }
  return fits ? s.slice(0, fits) + '…' : '';
}

/** Have the series their own names (not the "Series 1" given when there is none)? */
const hasNames = (data: SeriesData[]): boolean => data.some((d, i) => !!d.name && d.name !== `Series ${i + 1}`);

/** A path of categories as a pick: the category at each level from the first. */
const pickOfPath = (path: readonly string[]) => path.map((value, level) => ({ level, value }));

// ---------------------------------------------------------------- Sankey chart

/**
 * Where a Sankey band's edge is, `along` of the way across (0 to 1): how far across it has come and
 * how far from its start height toward its end height (0 to 1). The edge is the cubic drawn by
 * drawSankey, its two handles level with its ends and halfway across.
 */
function bandCurve(along: number): { across: number; down: number } {
  const t = along, u = 1 - t;
  return { across: 1.5 * u * u * t + 1.5 * u * t * t + t * t * t, down: 3 * u * t * t + t * t * t };
}

/** A band's lookup table: how far down its ends it is at each of 33 points across. */
const BAND_TABLE = Array.from({ length: 33 }, (_, i) => bandCurve(i / 32));

/** A Sankey band's top and bottom at `x` (null when `x` is past either end). */
export function bandAt(part: Extract<ClickPart, { shape: 'band' }>, x: number): [number, number] | null {
  const span = part.x1 - part.x0;
  if (span <= 0 || x < part.x0 || x > part.x1) return null;
  const f = (x - part.x0) / span;
  let i = BAND_TABLE.findIndex((p) => p.across >= f);
  if (i <= 0) i = 1;
  const a = BAND_TABLE[i - 1], b = BAND_TABLE[i];
  const down = a.down + ((b.down - a.down) * (f - a.across)) / (b.across - a.across || 1);
  return [part.top[0] + (part.top[1] - part.top[0]) * down, part.bottom[0] + (part.bottom[1] - part.bottom[0]) * down];
}

/**
 * A Sankey chart: each level a column of nodes as tall as the rows through them, and bands from a
 * node to the next level's nodes as wide as the rows they carry, tinted with the color of the node
 * they leave. The levels' names head their columns; each node has its label and total beside it.
 */
export function drawSankey(ctx: Ctx, pen: Pen, chart: Chart, data: SeriesData[], area: Box, shown?: SeriesData[]): ClickPart[] {
  const parts: ClickPart[] = [];
  const size = (chart.fontSize ?? 12) * 0.92;
  const { columns, bands } = levelFlows(levelRows(data), data.length);
  const count = columns.length;
  if (!columns.some((c) => c.length)) return parts;
  const colors = paletteOf(chart);
  const key = (...bits: (string | number)[]) => bits.join('\u0001');
  let lit: { nodes: Set<string>; bands: Set<string> } | null = null;
  if (shown) {
    const f = levelFlows(levelRows(shown), shown.length);
    lit = { nodes: new Set(f.columns.flat().map((n) => key(n.level, n.label))), bands: new Set(f.bands.map((b) => key(b.level, b.from, b.to))) };
  }

  let top = area.y;
  if (hasNames(data)) {
    data.forEach((d, i) => {
      const align = count === 1 ? 'center' : i === 0 ? 'left' : i === count - 1 ? 'right' : 'center';
      const x = count === 1 ? area.x + area.w / 2 : area.x + (area.w * i) / (count - 1);
      pen.write(d.name, x, top + size, size, { bold: true, align });
    });
    top += size * 1.8;
  }
  const height = Math.max(10, area.y + area.h - top);
  const nodeW = Math.min(16, Math.max(8, area.w * 0.022));
  const leftOf = (level: number) => (count === 1 ? area.x + (area.w - nodeW) / 2 : area.x + ((area.w - nodeW) * level) / (count - 1));
  // the gaps between nodes narrow in a crowded column, never more than a third of the height in all
  const crowd = Math.max(...columns.map((c) => c.length));
  const gap = Math.max(1, Math.min(10, height * 0.025, height / 3 / Math.max(1, crowd - 1)));
  // one scale for all the columns, set by the one that needs the most room
  const perUnit = Math.min(...columns.filter((c) => c.length).map((c) =>
    Math.max(1, height - gap * (c.length - 1)) / c.reduce((sum, n) => sum + n.total, 0)));

  interface Spot { x: number; y: number; h: number; color: string; outAt: number; inAt: number }
  const spots = new Map<string, Spot>();
  let nth = 0;
  columns.forEach((col, level) => {
    const used = col.reduce((sum, n) => sum + n.total * perUnit, 0) + gap * Math.max(0, col.length - 1);
    let y = top + Math.max(0, (height - used) / 2);
    for (const n of col) {
      const h = Math.max(1, n.total * perUnit);
      spots.set(key(level, n.label), { x: leftOf(level), y, h, color: colors[nth++ % colors.length], outAt: y, inAt: y });
      y += h + gap;
    }
  });

  // bands first, so the nodes cover their ends
  for (const b of bands) {
    const from = spots.get(key(b.level, b.from)), to = spots.get(key(b.level + 1, b.to));
    if (!from || !to) continue;
    const thick = b.total * perUnit;
    const x0 = from.x + nodeW, x1 = to.x, mid = (x0 + x1) / 2;
    const y0 = from.outAt, y1 = to.inAt;
    from.outAt += thick;
    to.inAt += thick;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(mid, y0, mid, y1, x1, y1);
    ctx.lineTo(x1, y1 + thick);
    ctx.bezierCurveTo(mid, y1 + thick, mid, y0 + thick, x0, y0 + thick);
    ctx.closePath();
    const on = !lit || lit.bands.has(key(b.level, b.from, b.to));
    ctx.fillStyle = seeThrough(from.color, on ? 0.42 : 0.12);
    fillPath(ctx);
    parts.push({
      shape: 'band', x0, x1, top: [y0, y1], bottom: [y0 + thick, y1 + thick],
      pick: [{ level: b.level, value: b.from }, { level: b.level + 1, value: b.to }],
    });
  }

  columns.forEach((col, level) => {
    // the last column's labels go on its left, the others' on their right
    const onLeft = count > 1 && level === count - 1;
    for (const n of col) {
      const s = spots.get(key(level, n.label))!;
      const on = !lit || lit.nodes.has(key(level, n.label));
      ctx.fillStyle = on ? s.color : seeThrough(s.color, FADED);
      ctx.fillRect(s.x, s.y, nodeW, s.h);
      parts.push({ shape: 'rect', x: s.x, y: s.y, w: nodeW, h: s.h, pick: [{ level, value: n.label }] });
      if (col.length > 1 && s.h < size * 0.7) continue; // no room for its label
      const words = `${n.label} (${generalNumber(n.total)})`;
      pen.write(words, onLeft ? s.x - 4 : s.x + nodeW + 4, s.y + s.h / 2 + size * 0.35, size, { align: onLeft ? 'right' : 'left' });
    }
  });
  return parts;
}

// ---------------------------------------------------------------- treemap

/** Is a node of the whole still in the data the pick leaves? */
const stillShown = (shownTree: LevelNode | null, node: LevelNode): boolean =>
  !shownTree || (findNode(shownTree, node.path)?.total ?? 0) > 0;

/**
 * A treemap: a box for each category of the level it is drilled to (the first, when it isn't), as
 * big as the rows in it. Where there's room a box carries its category in a band across its top
 * and holds the next level's categories as smaller boxes in lighter shades of its color. Drilled
 * in, a trail over it ("All › Aromatic") goes back up.
 *
 * What a click does: a box with categories under it drills into it (a small box, into the box it
 * is in); a box with none picks it; a step of the trail drills back up to it.
 */
export function drawTreemap(ctx: Ctx, pen: Pen, chart: Chart, data: SeriesData[], area: Box, shown?: SeriesData[]): ClickPart[] {
  const parts: ClickPart[] = [];
  const size = (chart.fontSize ?? 12) * 0.92;
  const tree = levelTree(levelRows(data));
  if (!tree.total) return parts;
  const path = reachablePath(tree, chart.path);
  const here = findNode(tree, path)!;
  const shownTree = shown ? levelTree(levelRows(shown)) : null;
  const colors = paletteOf(chart);

  let top = area.y;
  if (path.length) {
    const steps = ['All', ...path];
    let x = area.x;
    steps.forEach((step, i) => {
      const current = i === steps.length - 1;
      const w = pen.write(step, x, top + size, size, { bold: current, color: current ? INK : LINK });
      if (current) return;
      parts.push({ shape: 'rect', x, y: top, w, h: size * 1.4, pick: [], drill: path.slice(0, i) });
      x += w + pen.write(' › ', x + w, top + size, size, { color: '#8c8c8c' });
    });
    top += size * 1.8;
  }
  const room = { x: area.x, y: top, w: area.w, h: Math.max(1, area.y + area.h - top) };

  /** A box's category, with its total under it when there's room. */
  const caption = (n: LevelNode, r: Box): void => {
    if (r.w < size * 1.5 || r.h < size * 1.3) return;
    const label = shorten(pen, n.label, r.w - 8, size, { color: '#ffffff' });
    if (!label) return;
    pen.write(label, r.x + 4, r.y + size + 2, size, { color: '#ffffff' });
    if (r.h >= size * 2.7) pen.write(generalNumber(n.total), r.x + 4, r.y + size * 2.2 + 2, size * 0.9, { color: '#ffffff' });
  };
  const inset = (r: Box, by: number): Box => ({ x: r.x + by, y: r.y + by, w: r.w - 2 * by, h: r.h - 2 * by });
  const paint = (r: Box, color: string, on: boolean) => { ctx.fillStyle = on ? color : seeThrough(color, FADED); ctx.fillRect(r.x, r.y, r.w, r.h); };

  // drilled to the bottom: the one category fills the space
  const boxes = here.kids.length ? here.kids : [here];
  const rects = squarify(boxes.map((n) => n.total), room);
  boxes.forEach((n, k) => {
    const r = inset(rects[k], 1);
    if (r.w < 1 || r.h < 1) return;
    const color = colors[k % colors.length];
    const band = size * 1.6;
    const canDrill = n !== here && n.kids.length > 0;
    paint(r, color, stillShown(shownTree, n));
    if (!canDrill || r.h <= band + size * 1.5 || r.w <= size * 3) {
      caption(n, r);
      parts.push({ shape: 'rect', ...r, pick: pickOfPath(n.path), ...(canDrill ? { drill: n.path } : {}) });
      return;
    }
    const style = { color: '#ffffff', bold: true };
    const head = shorten(pen, `${n.label} (${generalNumber(n.total)})`, r.w - 8, size, style) || shorten(pen, n.label, r.w - 8, size, style);
    if (head) pen.write(head, r.x + 4, r.y + size * 1.15, size, style);
    const inner = { x: r.x + 2, y: r.y + band, w: r.w - 4, h: r.h - band - 2 };
    const small = squarify(n.kids.map((c) => c.total), inner);
    n.kids.forEach((c, m) => {
      const kr = inset(small[m], 0.75);
      if (kr.w < 1 || kr.h < 1) return;
      paint(kr, tint(color, Math.min(0.45, 0.12 + (m % 5) * 0.07)), stillShown(shownTree, c));
      caption(c, kr);
      parts.push({ shape: 'rect', ...kr, pick: pickOfPath(c.path), drill: n.path });
    });
    parts.push({ shape: 'rect', x: r.x, y: r.y, w: r.w, h: band, pick: pickOfPath(n.path), drill: n.path });
  });
  return parts;
}

// ---------------------------------------------------------------- decomposition tree

/**
 * A decomposition tree, as PowerBI draws one: the total, then a column for each level it is
 * expanded to. Each node is a bar filled as far as its share of the node it splits, and lines run
 * from the node expanded to the nodes it splits into. A click on a node expands it (or, already
 * expanded, closes it up again); a click on the total closes the whole tree up.
 */
export function drawDecomp(ctx: Ctx, pen: Pen, chart: Chart, data: SeriesData[], area: Box, shown?: SeriesData[]): ClickPart[] {
  const parts: ClickPart[] = [];
  const size = (chart.fontSize ?? 12) * 0.92;
  const levels = data.length;
  const tree = levelTree(levelRows(data));
  if (!levels || !tree.total) return parts;
  // nothing is under the last level, so it is never expanded
  const path = reachablePath(tree, chart.path).slice(0, levels - 1);
  const shownTree = shown ? levelTree(levelRows(shown)) : null;
  const color = paletteOf(chart)[0];

  // column 0 is the total; column i + 1 holds what the node expanded at level i - 1 splits into
  const columns: LevelNode[][] = [[tree]];
  for (let i = 0; i <= path.length && i < levels; i++) columns.push(findNode(tree, path.slice(0, i))!.kids);
  const colW = area.w / Math.max(3, columns.length);
  const barW = Math.max(20, colW - 30);
  const rowH = size * 2.7;
  const named = hasNames(data);
  columns.forEach((_, i) => {
    const title = i === 0 ? 'Total' : named ? data[i - 1].name : `Level ${i}`;
    const style = { bold: true, color: '#595959' };
    pen.write(shorten(pen, title, colW - 6, size, style), area.x + i * colW, area.y + size, size, style);
  });
  const top = area.y + size * 1.8;
  const height = Math.max(rowH, area.y + area.h - top);
  const rowsThatFit = Math.max(1, Math.floor(height / rowH));

  let lineFrom: { x: number; y: number } | null = null;
  columns.forEach((col, i) => {
    const x = area.x + i * colW;
    const whole = i === 0 ? tree.total : findNode(tree, path.slice(0, i - 1))!.total;
    // too many to fit: the biggest, then a line saying how many more there are
    const drawn = col.length > rowsThatFit ? col.slice(0, Math.max(1, rowsThatFit - 1)) : col;
    const rows = drawn.length + (drawn.length < col.length ? 1 : 0);
    // level with the node it splits, as far as the space allows
    const wanted = lineFrom ? lineFrom.y - (rows * rowH) / 2 : top + (height - rows * rowH) / 2;
    const y0 = Math.min(Math.max(top, wanted), top + height - rows * rowH);
    let nextFrom: { x: number; y: number } | null = null;
    drawn.forEach((n, k) => {
      const y = y0 + k * rowH;
      const barY = y + size * 1.45, barH = Math.max(5, size * 0.8), barMid = barY + barH / 2;
      const expanded = i > 0 && path[i - 1] === n.label;
      const on = stillShown(shownTree, n);
      if (lineFrom) {
        const mid = (lineFrom.x + x) / 2;
        ctx.setLineDash([]);
        ctx.strokeStyle = expanded ? '#7f7f7f' : '#c9c9c9';
        ctx.lineWidth = expanded ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(lineFrom.x, lineFrom.y);
        ctx.bezierCurveTo(mid, lineFrom.y, mid, barMid, x - 2, barMid);
        ctx.stroke();
      }
      ctx.fillStyle = '#ededed';
      ctx.fillRect(x, barY, barW, barH);
      const fill = i === 0 || expanded ? tint(color, -0.4) : color;
      ctx.fillStyle = on ? fill : seeThrough(fill, FADED);
      ctx.fillRect(x, barY, Math.max(1, (barW * n.total) / (whole || 1)), barH);
      const ink = on ? INK : MUTED;
      const amount = generalNumber(n.total);
      const amountW = pen.write(amount, x + barW, y + size * 1.05, size, { align: 'right', color: ink });
      const labelStyle = { bold: i === 0 || expanded, color: ink };
      pen.write(shorten(pen, i === 0 ? 'Total' : n.label, barW - amountW - 6, size, labelStyle), x, y + size * 1.05, size, labelStyle);
      if (i === 0 || expanded) nextFrom = { x: x + barW, y: barMid };
      const drill = i === 0 ? [] : expanded ? path.slice(0, i - 1) : i < levels ? n.path : undefined;
      parts.push({ shape: 'rect', x, y, w: barW, h: rowH, pick: pickOfPath(n.path), ...(drill ? { drill } : {}) });
    });
    if (drawn.length < col.length) pen.write(`+${col.length - drawn.length} more`, x, y0 + drawn.length * rowH + size * 1.1, size * 0.9, { color: '#8c8c8c' });
    lineFrom = nextFrom;
  });
  return parts;
}
