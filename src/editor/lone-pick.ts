// Right-clicking an atom or bond picks just that atom or bond (issue #327). Commands that work on
// whole molecules (Copy As SMILES, Molfile or CDXML, Export as Molfile) take a lone atom or bond
// picked that way as its whole structure: Copy As SMILES of a right-clicked atom of ethanol is
// "CCO", not the "C" of that one atom.

import type { Doc } from '../model';
import type { Selection } from './editor';

/** The whole structure a lone picked atom or bond stands for, or null when the selection is anything else. */
export function loneStructure(doc: Doc, s: Selection): Set<number> | null {
  if (s.captions.size || s.arrows.size || s.shapes.size) return null;
  let root: number | undefined;
  if (s.atoms.size === 1 && !s.bonds.size) root = [...s.atoms][0];
  else if (s.bonds.size === 1) {
    const b = doc.bonds.get([...s.bonds][0]);
    if (b && [...s.atoms].every((id) => id === b.a1 || id === b.a2)) root = b.a1;
  }
  return root !== undefined && doc.atoms.has(root) ? doc.fragmentOf(root) : null;
}

/** The selection with a lone atom or bond grown to its whole structure (its atoms and bonds); null with nothing selected. */
export function chemistrySelection(doc: Doc, s: Selection, any: boolean): Selection | null {
  const lone = loneStructure(doc, s);
  if (!lone) return any ? s : null;
  return { atoms: lone, bonds: new Set([...lone].flatMap((id) => doc.adj.get(id) ?? [])), captions: new Set(), arrows: new Set(), shapes: new Set() };
}

/**
 * Whether Repeat Label from the right-click menu on atom `id` goes on every picked atom: only
 * when the atom was one of several picked, and not when the whole structure it is in was picked
 * (labelling every carbon of a selected structure is never meant).
 */
export function repeatsOnAll(doc: Doc, picked: Set<number>, id: number): boolean {
  if (!picked.has(id) || picked.size < 2) return false;
  const whole = doc.fragmentOf(id);
  return !(whole.size > 1 && [...whole].every((a) => picked.has(a)));
}
