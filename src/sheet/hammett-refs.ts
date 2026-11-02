// The reference positions a drawing offers for Hammett columns (its attachment points, named as
// HAMMETT's third argument: "wavy", "star", "1"…), and where the o, m and p places of the ring
// they sit on are, for the picture in Insert Property Columns. The values themselves come from
// the chemistry worker (chem/hammett-match.ts); this only reads the drawing.

import type { Atom, Doc } from '../model';
import { attachCode, attachCodesFor } from '../chem/attach-codes';
import { ringsThroughBond } from '../chem/aromatic';

/** The reference an attachment point answers to. */
export function attachRef(a: Atom): string | null {
  if (!a.attach) return null;
  if (a.attach === 'Wavy') return 'wavy';
  if (a.attach === 'Star') return 'star';
  return a.attachNum !== undefined ? String(a.attachNum) : 'numbered';
}

/** How a reference is shown in the Reference position list. */
export function refLabel(ref: string): string {
  if (ref === 'wavy') return '〰 Wavy bond';
  if (ref === 'star') return '* Star';
  if (ref === 'numbered') return '◆ Numbered';
  return `◆ Numbered ${ref}`;
}

/** The attachment points of a drawing, by the reference each answers to. */
export function attachRefs(doc: Doc): Map<string, Atom[]> {
  const out = new Map<string, Atom[]>();
  for (const a of doc.atoms.values()) {
    const r = attachRef(a);
    if (r) out.set(r, [...(out.get(r) ?? []), a]);
  }
  return out;
}

/** The attachment points a reference picks out. */
export function refAtoms(doc: Doc, ref: string): Atom[] {
  const wants = attachCodesFor(ref);
  return wants ? [...doc.atoms.values()].filter((a) => a.attach && wants(attachCode(a.attach, a.attachNum))) : [];
}

export interface RefMarks {
  /** The attachment point. */
  ref: Atom;
  /** The other ring atoms, each with its place: o, m or p from the ring carbon the point is on. */
  places: { atom: Atom; place: 'o' | 'm' | 'p' }[];
  /** The ring's middle. */
  centre: { x: number; y: number };
}

/**
 * The first attachment point the reference picks out, with the o, m and p places of the
 * benzene ring it sits on. Null when there's no such point or it isn't on a six-carbon ring.
 */
export function refMarks(doc: Doc, ref: string): RefMarks | null {
  const at = refAtoms(doc, ref)[0];
  if (!at) return null;
  const on = doc.neighbors(at.id);
  if (on.length !== 1) return null;
  const start = on[0];
  for (const bid of doc.adj.get(start.id) ?? []) {
    for (const ring of ringsThroughBond(doc, bid)) {
      if (ring.length !== 6 || !ring.includes(start.id)) continue;
      const atoms = ring.map((id) => doc.atoms.get(id)!);
      if (atoms.some((a) => a.z !== 6 || a.attach || a.label)) continue;
      const i = ring.indexOf(start.id);
      const centre = { x: atoms.reduce((s, a) => s + a.x, 0) / 6, y: atoms.reduce((s, a) => s + a.y, 0) / 6 };
      const places = atoms.flatMap((a, j) => {
        const d = Math.min(Math.abs(j - i), 6 - Math.abs(j - i));
        return d === 0 ? [] : [{ atom: a, place: (d === 1 ? 'o' : d === 2 ? 'm' : 'p') as 'o' | 'm' | 'p' }];
      });
      return { ref: at, places, centre };
    }
  }
  return null;
}
