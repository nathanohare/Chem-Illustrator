// Captions tied to a structure: ID labels, captions and descriptors (formula, masses) that keep
// their place beside the structure when it moves, grows or turns. They are put back in place at
// the end of every change, inside the same undo step, as frames are. Moving one by hand keeps
// the new place (as a gap and a shift from the middle of its side), so it follows from there.

import type { AttachSide, Attachment, Caption, Doc, Entity } from '../model';
import type { Rect, Vec } from '../geom';
import { POINTS, selectionBox, type Measure } from './arrange';

/** The name of the tag that saves a caption's tie in a CDXML file. */
export const ATTACH_TAG = 'Chem Illustrator attached';
/** The tag that marks a caption whose label warning was ignored. */
export const IGNORE_TAG = 'Chem Illustrator ignore';
/** The objecttag on a text box set by hand to be read as chemistry ('yes') or as plain text ('no'). */
export const CHEM_TAG = 'Chem Illustrator chemistry';

/** The usual gap between a structure and its label: a third of a bond length. */
export function defaultGap(doc: Doc): number {
  return Math.round(doc.style.bondLength * 0.3 * 10) / 10;
}

/** The structure a caption is tied to, as it is now (empty when it is gone). */
export function attachedAtoms(doc: Doc, a: Attachment): Set<number> {
  const id = a.atoms.find((x) => doc.atoms.has(x));
  return id === undefined ? new Set() : doc.fragmentOf(id);
}

/** A structure's box, with its atom labels. */
export function structureBox(doc: Doc, atoms: Set<number>, m: Measure): Rect | null {
  if (!atoms.size) return null;
  return selectionBox(doc, { atoms, bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() }, m);
}

/** The point of the caption's box that is held to the structure: the edge facing it, in the middle. */
function capPoint(cap: Rect, side: AttachSide): Vec {
  const cx = (cap.x1 + cap.x2) / 2, cy = (cap.y1 + cap.y2) / 2;
  return side === 'below' ? { x: cx, y: cap.y1 } : side === 'above' ? { x: cx, y: cap.y2 } : side === 'left' ? { x: cap.x2, y: cy } : { x: cap.x1, y: cy };
}

/** Where that point goes, beside the structure's box. */
export function anchorPoint(box: Rect, a: Pick<Attachment, 'side' | 'gap' | 'shift'>): Vec {
  const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
  switch (a.side) {
    case 'below': return { x: cx + a.shift, y: box.y2 + a.gap };
    case 'above': return { x: cx + a.shift, y: box.y1 - a.gap };
    case 'left': return { x: box.x1 - a.gap, y: cy + a.shift };
    case 'right': return { x: box.x2 + a.gap, y: cy + a.shift };
  }
}

/** How far to move a caption (its box `cap`) so it sits in its place beside the structure's box. */
export function attachOffset(box: Rect, cap: Rect, a: Pick<Attachment, 'side' | 'gap' | 'shift'>): Vec {
  const want = anchorPoint(box, a), now = capPoint(cap, a.side);
  return { x: want.x - now.x, y: want.y - now.y };
}

/** The gap and shift of a caption where it is now (after it was moved by hand), on its side. */
export function readPlace(box: Rect, cap: Rect, side: AttachSide): { gap: number; shift: number } {
  const p = capPoint(cap, side);
  const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
  const r = (v: number) => Math.round(v * 100) / 100;
  switch (side) {
    case 'below': return { gap: r(p.y - box.y2), shift: r(p.x - cx) };
    case 'above': return { gap: r(box.y1 - p.y), shift: r(p.x - cx) };
    case 'left': return { gap: r(box.x1 - p.x), shift: r(p.y - cy) };
    case 'right': return { gap: r(p.x - box.x2), shift: r(p.y - cy) };
  }
}

/** The side a caption sits on, judged from where it is (for captions tied to a structure after the fact). */
export function sideOf(box: Rect, cap: Rect): AttachSide {
  const cx = (cap.x1 + cap.x2) / 2, cy = (cap.y1 + cap.y2) / 2;
  const bx = (box.x1 + box.x2) / 2, by = (box.y1 + box.y2) / 2;
  const w = Math.max(1, box.x2 - box.x1), h = Math.max(1, box.y2 - box.y1);
  const dx = (cx - bx) / w, dy = (cy - by) / h;
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 'below' : 'above';
  return dx >= 0 ? 'right' : 'left';
}

/**
 * A structure as written now (its atoms and how they are bonded), to tell when its descriptors
 * need working out again. It leaves out atom numbers and positions, so it is the same for the
 * same structure read back from a file, and is saved with the descriptors.
 */
export function structureSig(doc: Doc, atoms: Set<number>): string {
  const tok = new Map<number, string>();
  for (const id of atoms) {
    const a = doc.atoms.get(id);
    // a labelled atom is what its label says (its element number is only a guess from the first
    // letter, and is not kept in the file), so its number is left out
    if (a) tok.set(id, `${a.label ? '' : a.z}:${a.charge}:${a.isotope || ''}:${a.label ?? ''}:${a.group ?? ''}:${a.radical ?? ''}`);
  }
  const parts: string[] = [];
  for (const [id, t] of tok) {
    const orders: string[] = [];
    for (const b of doc.adj.get(id) ?? []) {
      const bd = doc.bonds.get(b);
      if (!bd) continue;
      // a dative bond leaves the valences as they were, so it changes the hydrogens (and formula)
      const o = bd.display === 'dative' ? `${bd.order}d` : `${bd.order}`;
      orders.push(o);
      if (bd.a1 !== id) continue;
      const u = t, v = tok.get(bd.a2) ?? '?';
      parts.push(`${u < v ? u + '~' + v : v + '~' + u}~${o}`);
    }
    parts.push(`${t}/${orders.sort().join(',')}`);
  }
  return hashText(parts.sort().join('|'));
}

/** A short hash of some text (two 32-bit FNV-1a runs), the same in every session. */
function hashText(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 13);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const RANK: Record<Attachment['role'], number> = { label: 0, caption: 1, descriptors: 2 };

/** Which of two tied captions on one side sits nearer the structure: ID label, then caption, then descriptors. */
function nearer(x: Caption, y: Caption): number {
  return RANK[x.attach!.role] - RANK[y.attach!.role] || x.id - y.id;
}

/**
 * The box a tied caption is placed against: its structure's, grown past the tied captions that
 * sit nearer the structure on the same side, so several stack up instead of overlapping.
 */
export function placeBox(doc: Doc, c: Caption, atoms: Set<number>, m: Measure): Rect | null {
  const box = structureBox(doc, atoms, m);
  if (!box || !c.attach) return box;
  const side = c.attach.side;
  const out = { ...box };
  for (const o of doc.captions.values()) {
    if (o.id === c.id || !o.attach || o.attach.side !== side || nearer(o, c) > 0) continue;
    if (!o.attach.atoms.some((a) => atoms.has(a))) continue;
    const b = m.captionBox(o);
    if (side === 'below') out.y2 = Math.max(out.y2, b.y2);
    else if (side === 'above') out.y1 = Math.min(out.y1, b.y1);
    else if (side === 'left') out.x1 = Math.min(out.x1, b.x1);
    else out.x2 = Math.max(out.x2, b.x2);
  }
  return out;
}

/** Put a caption in its place beside its structure (inside an edit). */
export function placeAttached(doc: Doc, c: Caption, m: Measure): void {
  if (!c.attach) return;
  const box = placeBox(doc, c, attachedAtoms(doc, c.attach), m);
  if (!box) return;
  const d = attachOffset(box, m.captionBox(c), c.attach);
  if (Math.abs(d.x) > 1e-6 || Math.abs(d.y) > 1e-6) doc.updateCaption(c.id, { x: c.x + d.x, y: c.y + d.y });
}

const sameList = (a: number[], b: Set<number>) => a.length === b.size && a.every((x) => b.has(x));

/**
 * At the end of a change (`before` holds how the changed things were): captions whose structure
 * moved or changed take their places beside it again, as do the others tied to a structure when
 * one of them changed (they stack); a caption moved by hand on its own keeps its new place; captions
 * whose structure was deleted go with it.
 */
export function refitAttached(doc: Doc, before: ReadonlyMap<string, Entity | null>, m: Measure): void {
  const tied = [...doc.captions.values()].filter((c) => c.attach).sort(nearer);
  if (!tied.length) return;
  // structures (by an atom) with a tied caption that changed
  const touched = new Set<number>();
  for (const c of tied) if (before.has('c' + c.id)) for (const a of c.attach!.atoms) touched.add(a);
  for (const c0 of tied) {
    const c = doc.captions.get(c0.id);
    const a = c?.attach;
    if (!c || !a) continue;
    const atoms = attachedAtoms(doc, a);
    if (!atoms.size) {
      // the structure is gone: so is its label, unless the caption was what changed
      if (a.atoms.some((id) => before.has('a' + id))) doc.removeCaption(c.id);
      continue;
    }
    const structure = a.atoms.some((id) => before.has('a' + id)) || [...atoms].some((id) => before.has('a' + id));
    const old = before.get('c' + c.id) as Caption | null | undefined;
    const neighbour = [...atoms].some((id) => touched.has(id));
    if (!structure && !old && !neighbour) continue;
    // keep the list of atoms up to date (atoms added to or erased from the structure)
    let at: Attachment = a;
    if (!sameList(a.atoms, atoms)) at = { ...a, atoms: [...atoms] };
    const moved = !!old && !structure && (old.x !== c.x || old.y !== c.y) && sameAttach(old.attach, a);
    if (moved) {
      // moved by hand: it stays there, and follows the structure from there on
      const box = placeBox(doc, c, atoms, m);
      if (!box) continue;
      at = { ...at, ...readPlace(box, m.captionBox(c), a.side) };
      doc.updateCaption(c.id, { attach: at });
      continue;
    }
    if (at !== a) doc.updateCaption(c.id, { attach: at });
    placeAttached(doc, doc.captions.get(c.id)!, m);
  }
}

function sameAttach(x: Attachment | undefined, y: Attachment): boolean {
  return !!x && x.side === y.side && x.gap === y.gap && x.shift === y.shift;
}

/**
 * Tie a caption to a structure where it sits now: on the side it is on, at its present gap and
 * shift (Tie to Structure, and captions read back from a file).
 */
export function attachWhereItIs(doc: Doc, c: Caption, atoms: Set<number>, m: Measure, role: Attachment['role'], extra: Partial<Attachment> = {}): Attachment | null {
  const box = structureBox(doc, atoms, m);
  if (!box) return null;
  const cap = m.captionBox(c);
  const side = extra.side ?? sideOf(box, cap);
  return { atoms: [...atoms], side, ...readPlace(box, cap, side), role, ...extra };
}

/** The structure nearest a caption (its box closest to the caption's box), for tying one after the fact. */
export function nearestStructure(doc: Doc, cap: Rect, m: Measure, maxDist = Infinity): Set<number> | null {
  let best: Set<number> | null = null, bd = maxDist;
  for (const f of doc.fragments()) {
    const b = structureBox(doc, f, m);
    if (!b) continue;
    const dx = Math.max(0, b.x1 - cap.x2, cap.x1 - b.x2), dy = Math.max(0, b.y1 - cap.y2, cap.y1 - b.y2);
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

/**
 * An attachment as saved in a file (the structure is found again from where the caption sits).
 * Descriptors keep the signature of the structure they were worked out for, so a structure
 * changed in ChemDraw since gets them worked out again when the file is opened.
 */
export function attachTag(a: Attachment, on?: string): string {
  const { atoms: _atoms, ...rest } = a;
  // `on`: an atom of the structure (its id in the file), so the tie is found again as it was
  // instead of guessed from where the caption sits (issue #573)
  return JSON.stringify(on ? { ...rest, on } : rest);
}

/** The atom (its id in the file) a saved tie names, if any. */
export function attachedNode(text: string | null): string | undefined {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text) as { on?: unknown };
    return typeof v.on === 'string' && v.on ? v.on : typeof v.on === 'number' ? String(v.on) : undefined;
  } catch {
    return undefined;
  }
}

const SIDES: AttachSide[] = ['below', 'above', 'left', 'right'];
const KEYS = ['formula', 'name', 'exact', 'mw', 'mz', 'ea', 'hrms'];

export function attachFromTag(text: string | null): Attachment | undefined {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text) as Partial<Attachment>;
    const n = (x: unknown, d: number) => (typeof x === 'number' && isFinite(x) ? x : d);
    const role = v.role === 'label' || v.role === 'caption' || v.role === 'descriptors' ? v.role : 'caption';
    const out: Attachment = { atoms: [], side: SIDES.includes(v.side as AttachSide) ? (v.side as AttachSide) : 'below', gap: n(v.gap, 4), shift: n(v.shift, 0), role };
    // (a lab calculation is kept by its id: one this computer hasn't got is left out of the text)
    if (Array.isArray(v.show)) out.show = v.show.filter((k) => KEYS.includes(k) || (typeof k === 'string' && /^calc:[\w-]{1,20}$/.test(k)));
    if (typeof v.adduct === 'string') out.adduct = v.adduct;
    if (v.keepText === true) out.keepText = true;
    if (role === 'descriptors' && typeof v.sig === 'string' && v.sig) out.sig = v.sig;
    return out;
  } catch {
    return undefined;
  }
}

/** What a file says about a saved tie: the atom it names, and the caption's box as the file has it. */
export interface AttachHint {
  atom?: number;
  box?: Rect;
}

/** How far a box is from another (0 when they touch or overlap). */
function boxGap(a: Rect, b: Rect): number {
  return Math.hypot(Math.max(0, b.x1 - a.x2, a.x1 - b.x2), Math.max(0, b.y1 - a.y2, a.y1 - b.y2));
}

/**
 * The structure a saved caption was placed against: the one it would move least to take its saved
 * place beside (its side, gap and shift), among those within `reach` of it. Figures packed tight
 * put a label nearer the next row's structure than its own, so the nearest isn't enough.
 */
function fittingStructure(doc: Doc, cap: Rect, a: Attachment, m: Measure, reach: number): Set<number> | null {
  let best: Set<number> | null = null, bd = Infinity;
  for (const f of doc.fragments()) {
    const b = structureBox(doc, f, m);
    if (!b || boxGap(b, cap) > reach) continue;
    const d = attachOffset(b, cap, a);
    const miss = Math.hypot(d.x, d.y);
    if (miss < bd) { bd = miss; best = f; }
  }
  return best;
}

/**
 * After reading a file: tie each saved attached caption to its structure. That is the structure
 * the file names, while the caption is still beside it (it may have been moved in ChemDraw); else
 * the structure nearest the caption's whole box, not only its anchor point, which could sit
 * nearer the next structure along and tie the label to that one (issue #573).
 */
export function fillAttachments(doc: Doc, m: Measure = POINTS, hints?: ReadonlyMap<number, AttachHint>): void {
  const reach = doc.style.bondLength * 6;
  for (const c of [...doc.captions.values()]) {
    if (!c.attach || c.attach.atoms.length) continue;
    const hint = hints?.get(c.id);
    const cap = hint?.box ?? m.captionBox(c);
    let f: Set<number> | null = null;
    if (hint?.atom !== undefined && doc.atoms.has(hint.atom)) {
      const named = doc.fragmentOf(hint.atom);
      const b = structureBox(doc, named, m);
      if (b && boxGap(b, cap) <= reach) f = named;
    }
    f ??= hint?.box ? fittingStructure(doc, cap, c.attach, m, reach) : nearestStructure(doc, cap, m, reach);
    // descriptors saved with a signature keep it, so they are redone if the structure no longer
    // matches it (changed in ChemDraw); older files had none, so theirs are taken to match
    if (f) doc.updateCaption(c.id, { attach: { ...c.attach, atoms: [...f], ...(c.attach.role === 'descriptors' ? { sig: c.attach.sig ?? structureSig(doc, f) } : {}) } });
    else doc.updateCaption(c.id, { attach: undefined });
  }
}
