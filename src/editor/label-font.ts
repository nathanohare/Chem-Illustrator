// Atom labels' own font, size and bold, structure by structure (Nate, 2026-11-05): with atoms
// picked, Home ▸ Font's boxes and the Style panel's Label font and Label size rows set them. A
// label with no font of its own is set in the drawing's (Drawing Style ▸ Atom labels); a size is
// kept as the atom's scale (Atom.s), as a structure shrunk in ChemDraw keeps its own.

import type { Atom, Doc } from '../model';
import { labelBold } from '../style';

/** The picked atoms whose labels these settings are for (not attachment points or the middle of a π-bond). */
export function labelAtoms(doc: Doc, ids: Iterable<number>): Atom[] {
  const out: Atom[] = [];
  for (const id of ids) {
    const a = doc.atoms.get(id);
    if (a && !a.attach && !a.multi) out.push(a);
  }
  return out;
}

/** Whether an atom shows a label (a heteroatom, a typed label, or a carbon shown with its letter). */
const shows = (a: Atom): boolean => !!a.label || a.z !== 6 || !!a.showCarbon;

/** A label's size in points. */
export const labelPt = (doc: Doc, a: Atom): number => doc.style.labelSize * (a.s ?? 1);

/**
 * How the labels look: their font where they all have the same one of their own (undefined: the
 * drawing's, or mixed), their size where they share it, and whether they are all bold. Labels
 * that show count; with none showing, every picked atom does.
 */
export function labelLookOf(doc: Doc, atoms: Atom[]): { font?: string; size?: number; bold: boolean; mixedFont: boolean } {
  const shown = atoms.filter(shows);
  const list = shown.length ? shown : atoms;
  if (!list.length) return { bold: false, mixedFont: false };
  const fonts = new Set(list.map((a) => a.font?.trim() || ''));
  const sizes = new Set(list.map((a) => Math.round(labelPt(doc, a) * 100) / 100));
  const font = fonts.size === 1 ? [...fonts][0] || undefined : undefined;
  return { ...(font ? { font } : {}), ...(sizes.size === 1 ? { size: [...sizes][0] } : {}), bold: list.every((a) => labelBold(doc.style, a)), mixedFont: fonts.size > 1 };
}

/** Set the labels' font (empty or the drawing's own: back to the drawing's). Call inside an edit. */
export function setLabelFont(doc: Doc, atoms: Atom[], font: string | undefined): void {
  const v = font?.trim();
  const own = v && v.toLowerCase() !== (doc.style.labelFont || 'Arial').trim().toLowerCase() ? v : undefined;
  for (const a of atoms) if ((a.font || undefined) !== own) doc.updateAtom(a.id, { font: own });
}

/** Set the labels' size in points (the drawing's size: no scale of their own). Call inside an edit. */
export function setLabelSize(doc: Doc, atoms: Atom[], pt: number): void {
  if (!(pt > 0) || !(doc.style.labelSize > 0)) return;
  const k = pt / doc.style.labelSize;
  const s = Math.abs(k - 1) < 1e-6 ? undefined : Math.round(k * 1e6) / 1e6;
  for (const a of atoms) if (a.s !== s) doc.updateAtom(a.id, { s });
}

/** Bold on for every label, or off when they are all bold already. Call inside an edit. */
export function toggleLabelBold(doc: Doc, atoms: Atom[]): void {
  const on = !labelLookOf(doc, atoms).bold;
  const base = doc.style.labelFace ?? 0;
  for (const a of atoms) {
    const face = on ? (a.face ?? base) | 1 : (a.face ?? base) & ~1;
    doc.updateAtom(a.id, { face: face === base ? undefined : face });
  }
}
