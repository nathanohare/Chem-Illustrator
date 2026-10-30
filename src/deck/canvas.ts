// Canvas slides: a slide whose drawing has no edge, shown through a series of keyframes. A
// keyframe is a slide-shaped window on the canvas; the slide show goes from one to the next, and
// each would be a slide of its own in PowerPoint. So a long synthesis is drawn once, across the
// canvas, and the talk moves along it a step or two at a time.
//
// Keyframes keep the slide's shape and are never turned. They can be smaller than the slide
// (zoomed in, at most 2×) or larger (zoomed out, for an overview of the route).

import type { Rect, Vec } from '../geom';
import type { Anim, CameraMove } from './animation';

/**
 * A keyframe: the window's top-left corner on the canvas (points) and its size, as how many
 * slide widths wide it is (1: the slide's own size; 0.5: zoomed in 2×; 3: zoomed out 3×). Its
 * `title` shows fixed to the screen while the show is there; its `tint` colours the background
 * softly round it (a zone: keyframes next to each other with one tint make one zone).
 */
export interface Keyframe {
  id: number; x: number; y: number; zoom: number; title?: string; tint?: string;
  /** Spotlight: the part of the keyframe that stays bright while the show is there (the rest dims). */
  spot?: Rect;
  /** A detour off the main route: after the last of a run of detours the show glides back to where it left the route. */
  detour?: boolean;
}

/**
 * How a canvas's endless background looks (canvas-look.ts): the master's background colour,
 * and over it a gradient from the first keyframe to the last (`route`, its colours in order), a
 * faint pattern that moves with the canvas, and parallax: the background moving slower than the
 * drawing (0: with it; 0.5: at half its speed), for a sense of depth.
 */
export interface CanvasLook { route?: string[]; texture?: Texture; parallax?: number }
export type Texture = 'dots' | 'grid' | 'hex';
export const TEXTURES: { id: Texture; name: string }[] = [{ id: 'dots', name: 'Dots' }, { id: 'grid', name: 'Grid' }, { id: 'hex', name: 'Hexagons' }];
/** The most parallax there can be (the background still moves a fifth as fast). */
export const PARALLAX_MAX = 0.8;

/**
 * How a canvas slide's show behaves: dim what is outside the keyframe it is at, a mini-map of the
 * whole canvas (on the screen, or in Presenter View only), and compound numbers that fly back to
 * the keyframe where the compound was made when clicked (on unless `noLinks`).
 */
export interface CanvasShow { dim?: boolean; minimap?: 'show' | 'presenter'; noLinks?: boolean }

/** What makes a slide a canvas slide: its keyframes, in the order the show plays them, its background's look and its show's settings. */
export interface CanvasData { keys: Keyframe[]; look?: CanvasLook; show?: CanvasShow }

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

export const copyCanvas = (c: CanvasData): CanvasData => ({
  keys: c.keys.map((k) => ({ ...k })),
  ...(c.look ? { look: { ...c.look, ...(c.look.route ? { route: [...c.look.route] } : {}) } } : {}),
  ...(c.show ? { show: { ...c.show } } : {}),
});

const nextId = (keys: Keyframe[]) => keys.reduce((m, k) => Math.max(m, k.id), 0) + 1;

/** Add Keyframe: a new one after keyframe `after` (the last by default), moved on to the right by `step` of its width and level with it. */
export function addKeyframe(c: CanvasData, size: Size, after = c.keys.length - 1, step = KEY_STEP): { canvas: CanvasData; index: number } {
  const keys = c.keys.map((k) => ({ ...k }));
  const from = keys[Math.max(0, Math.min(keys.length - 1, after))];
  // (it keeps the title, zone and detour of the one it follows: the next step of the same part of the route)
  const { spot: _, ...like } = from ?? { id: 0, x: 0, y: 0, zoom: 1 };
  const k: Keyframe = from ? { ...like, id: nextId(keys), x: from.x + size.w * from.zoom * step, y: from.y } : { id: nextId(keys), x: 0, y: 0, zoom: 1 };
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

/** A short text that is a compound's ID (2, 2a, (±)-12), as Number Compounds writes them. */
export function compoundId(text: string): string | null {
  const t = text.trim();
  return /^(?:\([±+\-−]\)-)?\d{1,3}[a-z]?$/.test(t) ? t : null;
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

// ---------------------------------------------------------------- moving between keyframes
//
// The moves from keyframe to keyframe are animations of the slide (effect `camera`), one for each
// keyframe after the first, in the keyframes' order, so the Animation pane puts them in order with
// the objects' animations: an arrow can wipe in with the move that brings it into view, a product
// fade in on the click after. Their places in the list are kept when keyframes come, go or are
// reordered: each slot then moves to the keyframe whose turn it is.

/** A keyframe move: on a click, a glide whose time follows the distance (`back`: the return from a detour to that keyframe). */
export function cameraAnim(keyId: number, back = false): Anim {
  return { target: { kind: 'keyframe', id: keyId }, effect: 'camera', start: 'click', dur: 1, delay: 0, move: 'pan', byDistance: true, ...(back ? { back: true } : {}) };
}

/**
 * The moves a canvas's keyframes need, in order: to each keyframe after the first, and after each
 * run of detours back to the keyframe on the main route the run left from.
 */
export function wantedMoves(keys: Keyframe[]): { id: number; back: boolean }[] {
  const out: { id: number; back: boolean }[] = [];
  let main = keys[0] && !keys[0].detour ? 0 : -1;
  keys.forEach((k, i) => {
    if (i) out.push({ id: k.id, back: false });
    if (!k.detour) { main = i; return; }
    // the last of a run of detours: back to where the run left the main route
    if (main >= 0 && !keys[i + 1]?.detour) out.push({ id: keys[main].id, back: true });
  });
  return out;
}

const moveKey = (a: { target: { id: number }; back?: boolean } | { id: number; back: boolean }): string =>
  'target' in a ? `${a.target.id}${a.back ? 'r' : ''}` : `${a.id}${a.back ? 'r' : ''}`;

export const isCamera = (a: Anim): boolean => a.effect === 'camera';

/**
 * A slide's animations with exactly one move for each keyframe after the first, in the keyframes'
 * order: the moves' places in the list are kept (a move to a keyframe gone is dropped, a missing
 * one goes at the end) and each keeps its own settings as it follows its keyframe.
 */
export function syncCamera(anims: Anim[], keys: Keyframe[]): Anim[] {
  const wanted = wantedMoves(keys);
  const want = new Set(wanted.map(moveKey));
  const byKey = new Map<string, Anim>();
  // the moves still wanted, each once; the first keyframe has none (the slide starts there)
  const kept = anims.filter((a) => {
    if (!isCamera(a)) return true;
    const k = moveKey(a);
    if (!want.has(k) || byKey.has(k)) return false;
    byKey.set(k, a);
    return true;
  });
  const made = (w: { id: number; back: boolean }) => byKey.get(moveKey(w)) ?? cameraAnim(w.id, w.back);
  let next = 0;
  const out = kept.map((a) => {
    if (!isCamera(a)) return a;
    const w = wanted[next++];
    const { back: _, ...own } = made(w);
    // the slot keeps when it plays; the move keeps how it moves
    return { ...own, target: { kind: 'keyframe' as const, id: w.id }, ...(w.back ? { back: true } : {}), start: a.start, delay: a.delay };
  });
  for (; next < wanted.length; next++) out.push(made(wanted[next]));
  return out;
}

/** How long a move takes when its time follows the distance: from 0.6 s for a short step to 1.5 s for a long jump. */
export function distanceDur(a: Keyframe, b: Keyframe, size: Size): number {
  const ra = keyRect(a, size), rb = keyRect(b, size);
  const w = Math.min(ra.x2 - ra.x1, rb.x2 - rb.x1);
  const d = Math.hypot((ra.x1 + ra.x2 - rb.x1 - rb.x2) / 2, (ra.y1 + ra.y2 - rb.y1 - rb.y2) / 2) / w;
  const z = Math.abs(Math.log2(b.zoom / a.zoom));
  return +Math.min(1.5, Math.max(0.6, 0.45 + 0.35 * d + 0.3 * z)).toFixed(2);
}

/** The slide's animations with each move's time worked out (by distance, or none for a cut), as the show plays them. */
export function timedCamera(anims: Anim[], keys: Keyframe[], size: Size): Anim[] {
  let at = keys[0];
  return anims.map((a) => {
    if (!isCamera(a)) return a;
    const to = keys.find((k) => k.id === a.target.id);
    if (!to || !at) return a;
    const dur = a.move === 'cut' ? 0 : a.byDistance ? distanceDur(at, to, size) : a.dur;
    at = to;
    return dur === a.dur ? a : { ...a, dur };
  });
}

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * The part of the canvas shown `p` of the way through a move from keyframe `a` to `b`. A pan
 * glides and zooms smoothly; a fly-over also pulls back on the way, to `wide` (a slide-shaped box
 * round both) at its widest.
 */
export function viewBetween(a: Keyframe, b: Keyframe, p: number, move: CameraMove, size: Size): Rect {
  const e = ease(Math.max(0, Math.min(1, p)));
  const ra = keyRect(a, size), rb = keyRect(b, size);
  const cx = (ra.x1 + ra.x2) / 2 + ((rb.x1 + rb.x2 - ra.x1 - ra.x2) / 2) * e;
  const cy = (ra.y1 + ra.y2) / 2 + ((rb.y1 + rb.y2 - ra.y1 - ra.y2) / 2) * e;
  let lz = Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e;
  if (move === 'fly') {
    const top = Math.log(wideZoom(a, b, size));
    lz += Math.max(0, top - Math.max(Math.log(a.zoom), Math.log(b.zoom))) * Math.sin(Math.PI * e);
  }
  const z = Math.exp(lz), w = size.w * z, h = size.h * z;
  return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
}

/** How many slide widths a slide-shaped box round both keyframes is. */
function wideZoom(a: Keyframe, b: Keyframe, size: Size): number {
  const u = unionRect(keyRect(a, size), keyRect(b, size));
  return Math.max((u.x2 - u.x1) / size.w, (u.y2 - u.y1) / size.h);
}

/** A slide-shaped box round a box (growing the short side about the middle). */
export function slideShaped(r: Rect, size: Size): Rect {
  const z = Math.max((r.x2 - r.x1) / size.w, (r.y2 - r.y1) / size.h);
  const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
  return { x1: cx - (size.w * z) / 2, y1: cy - (size.h * z) / 2, x2: cx + (size.w * z) / 2, y2: cy + (size.h * z) / 2 };
}

/** Where the show is on a canvas slide: at a keyframe, or `p` of the way through a move from one to the next. */
export type CameraAt = { at: number } | { from: number; to: number; p: number; move: CameraMove };

/**
 * Where the view is after `done` whole clicks of the slide's animations and `t` seconds into the
 * next (t < 0: not started), as keyframe indexes. `steps` are the slide's steps, each item with
 * its start and end in seconds (buildSteps).
 */
export function cameraAt(steps: { items: { anim: Anim; start: number; end: number }[] }[], keys: Keyframe[], done: number, t: number): CameraAt {
  const index = (id: number) => keys.findIndex((k) => k.id === id);
  let at = 0;
  for (let k = 0; k < Math.min(done, steps.length); k++) for (const it of steps[k].items) if (isCamera(it.anim) && index(it.anim.target.id) >= 0) at = index(it.anim.target.id);
  const st = steps[done];
  if (!st || t < 0) return { at };
  for (const it of [...st.items].sort((x, y) => x.start - y.start)) {
    if (!isCamera(it.anim) || t < it.start) continue;
    const to = index(it.anim.target.id);
    if (to < 0) continue;
    if (t >= it.end) { at = to; continue; }
    return { from: at, to, p: (t - it.start) / Math.max(1e-6, it.end - it.start), move: it.anim.move ?? 'pan' };
  }
  return { at };
}

// ---------------------------------------------------------------- saving

/**
 * A keyframe move as kept in its slide's tag: its place among the animations (how many of the
 * others come before it), keyframe, start, delay, time, kind of move, and whether its time
 * follows the distance.
 */
type MoveRow = [number, number, Anim['start'], number, number, CameraMove, 0 | 1, 0 | 1];

/**
 * A canvas as kept in a tag of its slide in a PowerPoint file, with its keyframe moves (which
 * move nothing in PowerPoint, so its animations can't hold them) and their places among the
 * slide's animations.
 */
export function canvasTag(c: CanvasData, anims: Anim[] = []): string {
  const moves: MoveRow[] = [];
  let others = 0;
  for (const a of anims) {
    if (isCamera(a)) moves.push([others, a.target.id, a.start, a.delay, a.dur, a.move ?? 'pan', a.byDistance ? 1 : 0, a.back ? 1 : 0]);
    else others++;
  }
  const keys = c.keys.map((k) => {
    // a spotlight and a detour in a seventh place
    const more = { ...(k.spot ? { s: [k.spot.x1, k.spot.y1, k.spot.x2, k.spot.y2].map((v) => +v.toFixed(3)) } : {}), ...(k.detour ? { d: 1 } : {}) };
    const extra = Object.keys(more).length ? [k.title ?? '', k.tint ?? '', more] : k.title || k.tint ? [k.title ?? '', k.tint ?? ''] : [];
    return [k.id, +k.x.toFixed(3), +k.y.toFixed(3), +k.zoom.toFixed(5), ...extra];
  });
  return JSON.stringify({
    v: 1, keys, ...(moves.length ? { moves } : {}), ...(c.look && Object.keys(c.look).length ? { look: c.look } : {}),
    ...(c.show && Object.keys(c.show).length ? { show: c.show } : {}),
  });
}

/** The slide's animations read from PowerPoint with the keyframe moves from its tag put back in their places. */
export function withCameraMoves(anims: Anim[], text: string | undefined): Anim[] {
  let rows: unknown[] = [];
  try { rows = (JSON.parse(text ?? '{}') as { moves?: unknown[] }).moves ?? []; } catch { return anims; }
  const others = anims.filter((a) => !isCamera(a));
  const out: Anim[] = [];
  const MOVE_IDS: CameraMove[] = ['pan', 'fly', 'fade', 'cut'];
  let j = 0;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const [before, id, start, delay, dur, move, byDistance, back] = row;
    if (![before, id, delay, dur].every((v) => Number.isFinite(Number(v)))) continue;
    // the other animations that come before it, then the move
    while (j < others.length && j < Number(before)) out.push(others[j++]);
    out.push({
      target: { kind: 'keyframe', id: Number(id) }, effect: 'camera',
      start: start === 'with' || start === 'after' ? start : 'click', delay: Math.max(0, Number(delay)), dur: Math.max(0, Number(dur)),
      move: MOVE_IDS.includes(move as CameraMove) ? move as CameraMove : 'pan', ...(byDistance ? { byDistance: true } : {}), ...(back ? { back: true } : {}),
    });
  }
  return [...out, ...others.slice(j)];
}

/** A canvas read back from its tag (null when the tag is not one). */
export function readCanvasTag(text: string | undefined): CanvasData | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as { keys?: unknown; look?: unknown; show?: unknown };
    if (!Array.isArray(o.keys)) return null;
    const keys: Keyframe[] = [];
    for (const row of o.keys) {
      if (!Array.isArray(row)) continue;
      const [id, x, y, zoom] = row.slice(0, 4).map(Number);
      if (![id, x, y, zoom].every(Number.isFinite)) continue;
      const title = typeof row[4] === 'string' && row[4] ? row[4] : undefined, tint = isColour(row[5]) ? row[5] : undefined;
      const more = (row[6] && typeof row[6] === 'object' ? row[6] : {}) as { s?: unknown; d?: unknown };
      const sp = Array.isArray(more.s) ? more.s.map(Number) : [];
      const spot = sp.length === 4 && sp.every(Number.isFinite) && sp[2] > sp[0] && sp[3] > sp[1] ? { x1: sp[0], y1: sp[1], x2: sp[2], y2: sp[3] } : undefined;
      keys.push({
        id: keys.some((k) => k.id === id) ? nextId(keys) : id, x, y, zoom: clampZoom(zoom),
        ...(title ? { title } : {}), ...(tint ? { tint } : {}), ...(spot ? { spot } : {}), ...(more.d ? { detour: true } : {}),
      });
    }
    const look = readLook(o.look), show = readShow(o.show);
    return keys.length ? { keys, ...(look ? { look } : {}), ...(show ? { show } : {}) } : null;
  } catch {
    return null;
  }
}

const isColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** A canvas's look read back from its tag, keeping only what makes sense. */
function readLook(v: unknown): CanvasLook | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const look: CanvasLook = {};
  if (Array.isArray(o.route)) {
    const route = o.route.filter(isColour).slice(0, 5);
    if (route.length >= 2) look.route = route;
  }
  if (TEXTURES.some((t) => t.id === o.texture)) look.texture = o.texture as Texture;
  const p = Number(o.parallax);
  if (Number.isFinite(p) && p > 0) look.parallax = Math.min(PARALLAX_MAX, p);
  return Object.keys(look).length ? look : null;
}

/** A canvas's show settings read back from its tag. */
function readShow(v: unknown): CanvasShow | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const show: CanvasShow = {
    ...(o.dim ? { dim: true } : {}),
    ...(o.minimap === 'show' || o.minimap === 'presenter' ? { minimap: o.minimap } : {}),
    ...(o.noLinks ? { noLinks: true } : {}),
  };
  return Object.keys(show).length ? show : null;
}
