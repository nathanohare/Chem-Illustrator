// Auto-Animate Steps (Animations ▸ Auto-Animate Steps…): a scheme on a slide built up one step at
// a time in the show. The first species is there (or comes in on the first click); each click
// then brings the next arrow with its conditions, and the species it makes. The pieces of each
// step are marked (`piece`) so they move on their own in the show and are pictures of their own
// in PowerPoint. On a canvas slide, Camera Follow adds a keyframe for each step, so the view
// travels along the route as it is built. Everything made is ordinary: animations to change in
// the Animation pane, keyframes to move.

import type { Doc } from '../model';
import type { Rect, Vec } from '../geom';
import type { Measure, Selection } from '../editor/arrange';
import { readSlots } from '../chem/smart-scheme';
import type { Scope } from '../chem/scheme-arrange';
import { newAnim, partHolds, slideParts, targetOf, type Anim, type Part, type Side } from './animation';
import { cameraAnim, slideShaped, type CanvasData, type Keyframe } from './canvas';
import { arrowPoints } from '../objects';

export interface AutoStepsOptions {
  effect: 'wipe' | 'fade' | 'appear';
  /** The species a step makes: right after its arrow, with it, or on a click of its own. */
  product: 'after' | 'with' | 'click';
  /** The first species comes in on the first click too (else it is there from the start). */
  first: boolean;
  /** Canvas slides: a keyframe for each step, the view moving there as the step comes in. */
  camera: boolean;
}

export const AUTO_STEPS_DEFAULTS: AutoStepsOptions = { effect: 'wipe', product: 'after', first: false, camera: true };

/** One piece that comes in: what is in it, which way its arrow points, and where it is. */
export interface StepPiece {
  kind: 'first' | 'arrow' | 'product';
  /** The step it belongs to (0 for the first species). */
  step: number;
  sel: Selection;
  from: Side;
  box: Rect;
}

const empty = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

/** The side a wipe starts from for an arrow pointing from `a` to `b`. */
function sideFrom(a: Vec, b: Vec): Side {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'left' : 'right';
  return dy >= 0 ? 'top' : 'bottom';
}

/**
 * The selected scheme's pieces, in the order they come in: the first species, then for each step
 * its arrow with its conditions and + signs, and the species it makes (not again when a cycle
 * comes back to its start). Null when no steps are found.
 */
export function stepPieces(doc: Doc, m: Measure, scope: Scope): StepPiece[] | null {
  const read = readSlots(doc, m, scope);
  if (!read || !read.links.length) return null;
  const out: StepPiece[] = [];
  const used = new Set<number>();
  const boxOf = (s: Selection): Rect => {
    const rs: Rect[] = [];
    for (const id of s.atoms) { const a = doc.atoms.get(id)!; rs.push({ x1: a.x, y1: a.y, x2: a.x, y2: a.y }); }
    for (const id of s.captions) rs.push(m.captionBox(doc.captions.get(id)!));
    for (const id of s.arrows) { const ps = arrowPoints(doc.arrows.get(id)!, 12); rs.push({ x1: Math.min(...ps.map((p) => p.x)), y1: Math.min(...ps.map((p) => p.y)), x2: Math.max(...ps.map((p) => p.x)), y2: Math.max(...ps.map((p) => p.y)) }); }
    for (const id of s.shapes) { const sh = doc.shapes.get(id)!; rs.push({ x1: Math.min(sh.x1, sh.x2), y1: Math.min(sh.y1, sh.y2), x2: Math.max(sh.x1, sh.x2), y2: Math.max(sh.y1, sh.y2) }); }
    return { x1: Math.min(...rs.map((r) => r.x1)), y1: Math.min(...rs.map((r) => r.y1)), x2: Math.max(...rs.map((r) => r.x2)), y2: Math.max(...rs.map((r) => r.y2)) };
  };
  const addItems = (s: Selection, items: { atoms: number[]; caption?: number; shape?: number }[]) => {
    for (const it of items) {
      for (const a of it.atoms) {
        // the whole structure, with its bonds
        for (const id of doc.fragmentOf(a)) s.atoms.add(id);
      }
      if (it.caption !== undefined) s.captions.add(it.caption);
      if (it.shape !== undefined) s.shapes.add(it.shape);
    }
    for (const id of s.atoms) for (const b of doc.adj.get(id) ?? []) s.bonds.add(b);
  };
  const slot = (k: number, kind: 'first' | 'product', step: number, from: Side) => {
    if (used.has(k)) return;
    used.add(k);
    const s = empty();
    addItems(s, [...read.slots[k].items, ...read.slots[k].labels]);
    if (s.atoms.size || s.captions.size || s.shapes.size) out.push({ kind, step, sel: s, from, box: boxOf(s) });
  };
  const first = read.links[0];
  slot(first.from, 'first', 0, sideFrom(first.arrow.tail, first.arrow.head));
  read.links.forEach((l, i) => {
    const from = sideFrom(l.arrow.tail, l.arrow.head);
    // a step that starts from a species not shown yet (a branch) brings it in first
    if (!used.has(l.from)) slot(l.from, 'product', i + 1, from);
    const s = empty();
    s.arrows.add(l.arrow.id);
    addItems(s, [...l.above, ...l.below, ...l.inside, ...l.plusses]);
    out.push({ kind: 'arrow', step: i + 1, sel: s, from, box: boxOf(s) });
    slot(l.to, 'product', i + 1, from);
  });
  return out;
}

/** Mark each piece's things with a piece number of their own (call inside an edit). */
export function markPieces(doc: Doc, pieces: StepPiece[]): void {
  let n = 0;
  for (const a of doc.atoms.values()) n = Math.max(n, a.piece ?? 0);
  for (const c of doc.captions.values()) n = Math.max(n, c.piece ?? 0);
  for (const r of doc.arrows.values()) n = Math.max(n, r.piece ?? 0);
  for (const s of doc.shapes.values()) n = Math.max(n, s.piece ?? 0);
  for (const p of pieces) {
    const piece = ++n;
    for (const id of p.sel.atoms) doc.updateAtom(id, { piece });
    for (const id of p.sel.captions) doc.updateCaption(id, { piece });
    for (const id of p.sel.arrows) doc.updateArrow(id, { piece });
    for (const id of p.sel.shapes) doc.updateShape(id, { piece });
  }
}

/** The slide's parts that hold a piece's things (one, unless text stands apart). */
function partsOf(parts: Part[], p: StepPiece): Part[] {
  const t = (kind: 'atom' | 'caption' | 'arrow' | 'shape', id: number) => ({ kind, id });
  const targets = [...[...p.sel.atoms].map((id) => t('atom', id)), ...[...p.sel.arrows].map((id) => t('arrow', id)), ...[...p.sel.shapes].map((id) => t('shape', id)), ...[...p.sel.captions].map((id) => t('caption', id))];
  return parts.filter((part) => part.kind !== 'highlight' && targets.some((x) => partHolds(part, x)));
}

/** A keyframe that takes in a step: the species it starts from, its arrow and what it makes, with room round them. */
function stepKey(boxes: Rect[], size: { w: number; h: number }, id: number, L: number): Keyframe {
  const b = { x1: Math.min(...boxes.map((r) => r.x1)) - 2 * L, y1: Math.min(...boxes.map((r) => r.y1)) - 2 * L, x2: Math.max(...boxes.map((r) => r.x2)) + 2 * L, y2: Math.max(...boxes.map((r) => r.y2)) + 2 * L };
  const r = slideShaped(b, size);
  // no closer than the slide itself, so text stays the size it was written
  const zoom = Math.max(1, (r.x2 - r.x1) / size.w);
  const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
  return { id, x: cx - (size.w * zoom) / 2, y: cy - (size.h * zoom) / 2, zoom };
}

/**
 * The slide's animations with the scheme built step by step (after marking its pieces): earlier
 * animations of the scheme's parts go, the rest stay before them. On a canvas slide with Camera
 * Follow, also the keyframes (the canvas's first keyframe on the first step, one more for each
 * step after) with each step's move to its keyframe on the click and the step coming in after it.
 */
export function stepAnims(doc: Doc, pieces: StepPiece[], o: AutoStepsOptions, was: Anim[], canvas?: { data: CanvasData; size: { w: number; h: number } }): { anims: Anim[]; canvas?: CanvasData } {
  const parts = slideParts(doc);
  const ours = new Set(pieces.flatMap((p) => partsOf(parts, p)));
  const keep = was.filter((a) => a.effect === 'camera' ? !canvas || !o.camera : !ours.has(parts.find((p) => partHolds(p, a.target))!));
  const anims: Anim[] = [...keep];
  const add = (p: StepPiece, start: Anim['start']) => {
    partsOf(parts, p).forEach((part, i) => {
      const a = newAnim(targetOf(part), o.effect);
      a.start = i ? 'with' : start;
      if (o.effect === 'wipe') a.from = p.from;
      if (o.effect === 'appear') a.dur = 0;
      anims.push(a);
    });
  };
  let keys: Keyframe[] | null = null;
  if (canvas && o.camera) {
    const L = doc.style.bondLength;
    let id = Math.max(0, ...canvas.data.keys.map((k) => k.id));
    const steps = Math.max(...pieces.map((p) => p.step));
    keys = [];
    for (let s = 1; s <= steps; s++) {
      // the view for step s: what it starts from (the step before's species) and what it brings
      const now = pieces.filter((p) => p.step === s);
      const before = pieces.filter((p) => p.step === s - 1 && p.kind !== 'arrow');
      keys.push(stepKey([...before, ...now].map((p) => p.box), canvas.size, ++id, L));
    }
  }
  for (const p of pieces) {
    if (p.kind === 'first') { if (o.first) add(p, 'click'); continue; }
    if (p.kind === 'arrow') {
      // the view moves to the step first (the first step's view is where the show starts)
      if (keys && p.step > 1) { anims.push(cameraAnim(keys[p.step - 1].id)); add(p, 'after'); } else add(p, 'click');
      continue;
    }
    add(p, o.product === 'click' ? 'click' : o.product);
  }
  if (!keys) return { anims };
  // the steps' keyframes take the place of the canvas's old route
  return { anims, canvas: { ...canvas!.data, keys } };
}

/**
 * What each click of the build brings in, for the preview in the Auto-Animate Steps window:
 * the pieces there from the start, then the pieces each click shows (with what comes after it
 * or with it), as stepAnims plays them.
 */
export function stepClicks(pieces: StepPiece[], o: Pick<AutoStepsOptions, 'product' | 'first'>): { start: StepPiece[]; clicks: StepPiece[][] } {
  const start: StepPiece[] = [], clicks: StepPiece[][] = [];
  for (const p of pieces) {
    if (p.kind === 'first') { if (o.first) clicks.push([p]); else start.push(p); continue; }
    if (p.kind === 'arrow' || o.product === 'click' || !clicks.length) { clicks.push([p]); continue; }
    clicks[clicks.length - 1].push(p);
  }
  return { start, clicks };
}
