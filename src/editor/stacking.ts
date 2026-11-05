// The drawing order of whole objects (Format > Order, issue #406). Every structure, text box,
// arrow and shape has a place in one stack, as in PowerPoint, so any of them can go in front of
// or behind any other. Until something is reordered nothing carries a place, and the usual
// layers hold: shapes at the back (filled boxes first), then structures, arrows and text.
// A structure's place is kept on its atoms (all the same); a shape's in `stack` and in `z`, so
// shape lists sorted by `z` keep the same order.

import type { Doc } from '../model';
import { shapeOrder } from '../objects';
import type { Selection } from './arrange';

export type StackKind = 'shape' | 'structure' | 'arrow' | 'caption';

export interface StackItem {
  kind: StackKind;
  /** The shape, arrow or caption; for a structure, its atoms. */
  ids: number[];
}

export type StackMove = 'front' | 'back' | 'forward' | 'backward';

const BAND: Record<StackKind, number> = { shape: 0, structure: 1, arrow: 2, caption: 3 };

/** Whether anything in the drawing has a place of its own in the stack. */
export function usesStacking(doc: Doc): boolean {
  for (const m of [doc.shapes, doc.captions, doc.arrows, doc.atoms] as Map<number, { stack?: number }>[]) {
    for (const x of m.values()) if (x.stack !== undefined) return true;
  }
  return false;
}

/** Every object in the drawing, back to front. */
export function stackItems(doc: Doc): StackItem[] {
  return flatten(stackUnits(doc));
}

/** An object and, for a structure, the ring fills behind it and the lone pairs and charges on it. */
interface StackUnit { item: StackItem; behind: number[]; front: number[] }

function flatten(units: StackUnit[]): StackItem[] {
  const out: StackItem[] = [];
  for (const u of units) {
    for (const id of u.behind) out.push({ kind: 'shape', ids: [id] });
    out.push(u.item);
    for (const id of u.front) out.push({ kind: 'shape', ids: [id] });
  }
  return out;
}

function stackUnits(doc: Doc): StackUnit[] {
  // ring fills sit just behind their structure, and pinned marks (lone pairs, circled charges)
  // just in front of it, wherever the structure goes
  const fragOf = new Map<number, number>();
  const frags = doc.fragments().map((f) => [...f]);
  frags.forEach((f, i) => { for (const id of f) fragOf.set(id, i); });
  const behind = new Map<number, number[]>(), front = new Map<number, number[]>();
  const owned = new Set<number>();
  const order = shapeOrder([...doc.shapes.values()]);
  for (const s of order) {
    const at = s.ring?.length ? fragOf.get(s.ring[0]) : s.pin?.ref.length ? fragOf.get(s.pin.ref[0]) : undefined;
    if (at === undefined) continue;
    const m = s.ring?.length ? behind : front;
    if (!m.has(at)) m.set(at, []);
    m.get(at)!.push(s.id);
    owned.add(s.id);
  }
  // things without a place: shapes stay at the very back in their usual order, the rest go on
  // top in the usual layers (so a new structure or text box lands in front, as in PowerPoint)
  const keyed: { unit: StackUnit; key: number; band: number; tie: number }[] = [];
  const unit = (item: StackItem, i = -1): StackUnit => ({ item, behind: behind.get(i) ?? [], front: front.get(i) ?? [] });
  order.forEach((s, i) => {
    if (owned.has(s.id)) return;
    keyed.push({ unit: unit({ kind: 'shape', ids: [s.id] }), key: s.stack ?? -1e9 + i, band: BAND.shape, tie: i });
  });
  const free = 1e9;
  frags.forEach((ids, i) => {
    let st: number | undefined;
    for (const id of ids) { const v = doc.atoms.get(id)?.stack; if (v !== undefined && (st === undefined || v > st)) st = v; }
    keyed.push({ unit: unit({ kind: 'structure', ids }, i), key: st ?? free, band: BAND.structure, tie: Math.min(...ids) });
  });
  for (const r of doc.arrows.values()) keyed.push({ unit: unit({ kind: 'arrow', ids: [r.id] }), key: r.stack ?? free, band: BAND.arrow, tie: r.id });
  for (const c of doc.captions.values()) keyed.push({ unit: unit({ kind: 'caption', ids: [c.id] }), key: c.stack ?? free, band: BAND.caption, tie: c.id });
  keyed.sort((a, b) => a.key - b.key || a.band - b.band || a.tie - b.tie);
  return keyed.map((k) => k.unit);
}

/**
 * Whether the selection takes in this object. A structure counts only when all of it is selected,
 * so picking a bond or two (to bring one bond over another) leaves the structure where it is.
 */
function picked(it: StackItem, sel: Selection): boolean {
  switch (it.kind) {
    case 'shape': return sel.shapes.has(it.ids[0]);
    case 'arrow': return sel.arrows.has(it.ids[0]);
    case 'caption': return sel.captions.has(it.ids[0]);
    case 'structure': return it.ids.every((id) => sel.atoms.has(id));
  }
}

/** The new order after moving the picked objects, or null when none are picked. */
export function restackOrder(items: StackItem[], isPicked: (it: StackItem) => boolean, how: StackMove): StackItem[] | null {
  const mine = items.filter(isPicked);
  if (!mine.length) return null;
  const rest = items.filter((it) => !isPicked(it));
  if (how === 'front') return [...rest, ...mine];
  if (how === 'back') return [...mine, ...rest];
  // one step: past the next object (not picked) in that direction
  const next = [...items];
  const step = how === 'forward' ? 1 : -1;
  const idx = how === 'forward' ? [...next.keys()].reverse() : [...next.keys()];
  for (const i of idx) {
    if (!isPicked(next[i])) continue;
    const j = i + step;
    if (j < 0 || j >= next.length || isPicked(next[j])) continue;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * Bring the selected objects to the front or send them to the back, or one step either way, among
 * everything in the drawing. Call inside an edit. False when no whole object is selected.
 */
export function restack(doc: Doc, sel: Selection, how: StackMove): boolean {
  const units = stackUnits(doc);
  const byItem = new Map(units.map((u) => [u.item, u]));
  const next = restackOrder(units.map((u) => u.item), (it) => picked(it, sel), how);
  if (!next) return false;
  place(doc, flatten(next.map((it) => byItem.get(it)!)));
  return true;
}

/** Every object gets its place (1, 2… back to front), so the order holds whatever is added later. */
function place(doc: Doc, items: StackItem[]): void {
  items.forEach((it, i) => {
    const n = i + 1;
    for (const id of it.ids) {
      if (it.kind === 'shape') { const s = doc.shapes.get(id); if (s && (s.stack !== n || s.z !== n)) doc.updateShape(id, { stack: n, z: n }); }
      else if (it.kind === 'arrow') { if (doc.arrows.get(id)?.stack !== n) doc.updateArrow(id, { stack: n }); }
      else if (it.kind === 'caption') { if (doc.captions.get(id)?.stack !== n) doc.updateCaption(id, { stack: n }); }
      else if (doc.atoms.get(id)?.stack !== n) doc.updateAtom(id, { stack: n });
    }
  });
}

/**
 * Put the drawing's objects in the order a file stacks them: `rank` says where each came from
 * (lower is further back: a slide's shapes are stacked in the order they are listed), and things
 * of the same rank keep the order they have now. Only done when the file's order differs from the
 * one now in a way that shows, two objects that `overlap` the other way round; otherwise the
 * usual layers are left to hold. Call inside an edit or bulk. True when it put things in order.
 */
export function stackAsRead(doc: Doc, rank: (it: StackItem) => number, overlap: (a: StackItem, b: StackItem) => boolean): boolean {
  const units = stackUnits(doc);
  const keyed = units.map((u, i) => ({ u, r: rank(u.item), i }));
  const sorted = keyed.slice().sort((a, b) => a.r - b.r || a.i - b.i);
  let differs = false;
  for (let x = 0; x < sorted.length && !differs; x++) {
    for (let y = x + 1; y < sorted.length; y++) {
      if (sorted[x].i > sorted[y].i && overlap(sorted[x].u.item, sorted[y].u.item)) { differs = true; break; }
    }
  }
  if (!differs) return false;
  place(doc, flatten(sorted.map((k) => k.u)));
  return true;
}
