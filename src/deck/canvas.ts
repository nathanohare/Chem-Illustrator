// Canvas slides: a slide whose drawing has no edge, shown through a series of keyframes. A
// keyframe is a slide-shaped window on the canvas; the slide show goes from one to the next, and
// each would be a slide of its own in PowerPoint. So a long synthesis is drawn once, across the
// canvas, and the talk moves along it a step or two at a time.
//
// Keyframes keep the slide's shape and are never turned. They can be smaller than the slide
// (zoomed in, at most 2×) or larger (zoomed out, for an overview of the route).

import type { Rect, Vec } from '../geom';

/**
 * A keyframe: the window's top-left corner on the canvas (points) and its size, as how many
 * slide widths wide it is (1: the slide's own size; 0.5: zoomed in 2×; 3: zoomed out 3×).
 */
export interface Keyframe { id: number; x: number; y: number; zoom: number }

/** What makes a slide a canvas slide: its keyframes, in the order the show plays them. */
export interface CanvasData { keys: Keyframe[] }

export interface Size { w: number; h: number }

/** The most a keyframe zooms in: half the slide's size. */
export const ZOOM_IN_MAX = 2;
export const ZOOM_MIN = 1 / ZOOM_IN_MAX;
/** The most it zooms out (an overview of a long route). */
export const ZOOM_MAX = 40;

/** How far Add Keyframe moves on from the last keyframe, in its widths. */
export const KEY_STEP = 0.5;

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1));

/** The part of the canvas a keyframe shows, in points. */
export function keyRect(k: Keyframe, size: Size): Rect {
  return { x1: k.x, y1: k.y, x2: k.x + size.w * k.zoom, y2: k.y + size.h * k.zoom };
}

/** A canvas's first keyframe: the slide's own place, so a canvas slide starts like any other. */
export function newCanvas(): CanvasData {
  return { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }] };
}

export const copyCanvas = (c: CanvasData): CanvasData => ({ keys: c.keys.map((k) => ({ ...k })) });

const nextId = (keys: Keyframe[]) => keys.reduce((m, k) => Math.max(m, k.id), 0) + 1;

/** Add Keyframe: a new one after keyframe `after` (the last by default), moved on to the right by `step` of its width and level with it. */
export function addKeyframe(c: CanvasData, size: Size, after = c.keys.length - 1, step = KEY_STEP): { canvas: CanvasData; index: number } {
  const keys = c.keys.map((k) => ({ ...k }));
  const from = keys[Math.max(0, Math.min(keys.length - 1, after))];
  const k: Keyframe = from ? { id: nextId(keys), x: from.x + size.w * from.zoom * step, y: from.y, zoom: from.zoom } : { id: nextId(keys), x: 0, y: 0, zoom: 1 };
  const at = from ? keys.indexOf(from) + 1 : 0;
  keys.splice(at, 0, k);
  return { canvas: { keys }, index: at };
}

/** A keyframe showing a box (a selection, or what is in the window) with a little room round it, as near its size as the zoom limits allow. */
export function keyframeAround(box: Rect, size: Size, id = 0, room = 1.08): Keyframe {
  const bw = Math.max(1, box.x2 - box.x1), bh = Math.max(1, box.y2 - box.y1);
  const zoom = clampZoom(Math.max(bw / size.w, bh / size.h) * room);
  const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
  return { id, x: cx - (size.w * zoom) / 2, y: cy - (size.h * zoom) / 2, zoom };
}

/** Insert a keyframe made elsewhere (Keyframe Here, Fit to Selection) after `after`, giving it a fresh id. */
export function insertKeyframe(c: CanvasData, k: Keyframe, after = c.keys.length - 1): { canvas: CanvasData; index: number } {
  const keys = c.keys.map((x) => ({ ...x }));
  const at = Math.max(0, Math.min(keys.length, after + 1));
  keys.splice(at, 0, { ...k, id: nextId(keys) });
  return { canvas: { keys }, index: at };
}

/** Take keyframe i away (a canvas keeps at least one). */
export function removeKeyframe(c: CanvasData, i: number): CanvasData | null {
  if (c.keys.length <= 1 || i < 0 || i >= c.keys.length) return null;
  return { keys: c.keys.filter((_, j) => j !== i).map((k) => ({ ...k })) };
}

/** Move keyframe `from` so it plays at place `to` (counted in the list without it). */
export function moveKeyframe(c: CanvasData, from: number, to: number): CanvasData {
  const keys = c.keys.map((k) => ({ ...k }));
  const [k] = keys.splice(from, 1);
  if (!k) return c;
  keys.splice(Math.max(0, Math.min(keys.length, to)), 0, k);
  return { keys };
}

/** Everything the keyframes cover. */
export function keysBounds(c: CanvasData, size: Size): Rect {
  const rs = c.keys.map((k) => keyRect(k, size));
  if (!rs.length) return { x1: 0, y1: 0, x2: size.w, y2: size.h };
  return { x1: Math.min(...rs.map((r) => r.x1)), y1: Math.min(...rs.map((r) => r.y1)), x2: Math.max(...rs.map((r) => r.x2)), y2: Math.max(...rs.map((r) => r.y2)) };
}

/** Boxes joined. */
export function unionRect(a: Rect, b: Rect | null): Rect {
  return b ? { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) } : a;
}

// ---------------------------------------------------------------- showing a keyframe

/** The part of the drawing a slide shows, in points: the slide, or on a canvas slide its keyframe. */
export function shownRect(p: { size: Size; view?: Rect }): Rect {
  return p.view ?? { x1: 0, y1: 0, x2: p.size.w, y2: p.size.h };
}

/**
 * Where a slide's drawing goes on a canvas `w` × `h` CSS pixels big, the slide centred in it: the
 * screen place of the drawing's (0, 0) and the CSS pixels per point. On a canvas slide that is
 * the keyframe shown filling the slide's place.
 */
export function slidePlace(w: number, h: number, p: { size: Size; view?: Rect }): { x: number; y: number; k: number } {
  const k = Math.min(w / p.size.w, h / p.size.h);
  const x = (w - p.size.w * k) / 2, y = (h - p.size.h * k) / 2;
  const v = p.view;
  if (!v) return { x, y, k };
  const kv = (k * p.size.w) / (v.x2 - v.x1);
  return { x: x - v.x1 * kv, y: y - v.y1 * kv, k: kv };
}

// ---------------------------------------------------------------- picking keyframes up on screen

/** The number tab drawn on a keyframe's top-left corner, in screen pixels. */
export const TAB = { w: 26, h: 18 };
/** How near (screen pixels) a pointer must be to a keyframe's edge or corner to take it. */
export const GRAB = 6;

/** What a point is over: a keyframe's number tab or (`edge`) its outline, to move it, or a corner, to zoom it about the opposite corner. */
export type KeyGrab = { index: number; part: 'move'; edge?: boolean } | { index: number; part: 'corner'; corner: 1 | 2 | 3 };

/**
 * The keyframe under a point (in points), at a screen scale (pixels per point). Corners and tabs
 * come first, then edges; the keyframe picked (`first`) is tried before the others, then the
 * later keyframes over the earlier ones, as they are drawn.
 */
export function keyAt(c: CanvasData, size: Size, p: Vec, scale: number, first = -1): KeyGrab | null {
  const tol = GRAB / scale;
  const order = c.keys.map((_, i) => i).reverse();
  if (first >= 0 && first < c.keys.length) order.unshift(...order.splice(order.indexOf(first), 1));
  for (const i of order) {
    const r = keyRect(c.keys[i], size);
    const corners: Vec[] = [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }];
    // the top-left corner is under the tab, which moves the keyframe
    for (const k of [1, 2, 3] as const) if (Math.abs(p.x - corners[k].x) <= tol && Math.abs(p.y - corners[k].y) <= tol) return { index: i, part: 'corner', corner: k };
    if (p.x >= r.x1 - tol && p.x <= r.x1 + TAB.w / scale && p.y >= r.y1 - tol && p.y <= r.y1 + TAB.h / scale) return { index: i, part: 'move' };
  }
  for (const i of order) {
    const r = keyRect(c.keys[i], size);
    const inX = p.x >= r.x1 - tol && p.x <= r.x2 + tol, inY = p.y >= r.y1 - tol && p.y <= r.y2 + tol;
    const nearX = Math.abs(p.x - r.x1) <= tol || Math.abs(p.x - r.x2) <= tol, nearY = Math.abs(p.y - r.y1) <= tol || Math.abs(p.y - r.y2) <= tol;
    if ((nearX && inY) || (nearY && inX)) return { index: i, part: 'move', edge: true };
  }
  return null;
}

/**
 * A keyframe dragged by a corner: grown or shrunk about the opposite corner, keeping the slide's
 * shape, as far as the zoom limits allow. `p` is where the corner is dragged to.
 */
export function zoomByCorner(k: Keyframe, size: Size, corner: 1 | 2 | 3, p: Vec): Keyframe {
  const r = keyRect(k, size);
  const fixed = corner === 1 ? { x: r.x1, y: r.y2 } : corner === 2 ? { x: r.x1, y: r.y1 } : { x: r.x2, y: r.y1 };
  const zoom = clampZoom(Math.max(Math.abs(p.x - fixed.x) / size.w, Math.abs(p.y - fixed.y) / size.h));
  const w = size.w * zoom, h = size.h * zoom;
  const x = corner === 3 ? fixed.x - w : fixed.x;
  const y = corner === 1 ? fixed.y - h : fixed.y;
  return { ...k, x, y, zoom };
}

/**
 * Where a moved keyframe settles: level with (or in line with) the keyframes next to it in the
 * show when it is within `tol` points of them, so pans run straight.
 */
export function snapKeyframe(c: CanvasData, i: number, k: Keyframe, size: Size, tol: number): Keyframe {
  const near = [c.keys[i - 1], c.keys[i + 1]].filter((x): x is Keyframe => !!x);
  let { x, y } = k;
  const h = size.h * k.zoom, w = size.w * k.zoom;
  for (const o of near) {
    const r = keyRect(o, size);
    // tops, middles or bottoms in line
    for (const [mine, theirs] of [[y, r.y1], [y + h / 2, (r.y1 + r.y2) / 2], [y + h, r.y2]] as const) if (Math.abs(mine - theirs) <= tol) { y += theirs - mine; break; }
    for (const [mine, theirs] of [[x, r.x1], [x + w / 2, (r.x1 + r.x2) / 2], [x + w, r.x2]] as const) if (Math.abs(mine - theirs) <= tol) { x += theirs - mine; break; }
  }
  return { ...k, x, y };
}

// ---------------------------------------------------------------- saving

/** A canvas as kept in a tag of its slide in a PowerPoint file. */
export function canvasTag(c: CanvasData): string {
  return JSON.stringify({ v: 1, keys: c.keys.map((k) => [k.id, +k.x.toFixed(3), +k.y.toFixed(3), +k.zoom.toFixed(5)]) });
}

/** A canvas read back from its tag (null when the tag is not one). */
export function readCanvasTag(text: string | undefined): CanvasData | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as { keys?: unknown };
    if (!Array.isArray(o.keys)) return null;
    const keys: Keyframe[] = [];
    for (const row of o.keys) {
      if (!Array.isArray(row)) continue;
      const [id, x, y, zoom] = row.map(Number);
      if (![id, x, y, zoom].every(Number.isFinite)) continue;
      keys.push({ id: keys.some((k) => k.id === id) ? nextId(keys) : id, x, y, zoom: clampZoom(zoom) });
    }
    return keys.length ? { keys } : null;
  } catch {
    return null;
  }
}
