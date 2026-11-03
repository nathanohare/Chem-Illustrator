// Right-clicking one atom or bond picks just it (#327), but Copy As SMILES, Molfile or CDXML of
// that pick copies its whole structure, as it did before: ethanol, not methane.
import { it, expect } from 'vitest';
import { Doc } from '../src/model';
import { chemistrySelection, loneStructure } from '../src/editor/lone-pick';
import type { Selection } from '../src/editor/editor';

const sel = (atoms: number[], bonds: number[] = []): Selection => ({ atoms: new Set(atoms), bonds: new Set(bonds), captions: new Set(), arrows: new Set(), shapes: new Set() });

function ethanolAndWater() {
  const doc = new Doc();
  return doc.edit('build', () => {
    const c1 = doc.addAtom(0, 0).id, c2 = doc.addAtom(14, 8).id, o = doc.addAtom(28, 0, 8).id;
    const b1 = doc.addBond(c1, c2, 1).id, b2 = doc.addBond(c2, o, 1).id;
    const w = doc.addAtom(100, 0, 8).id;
    return { doc, c1, c2, o, b1, b2, w };
  });
}

it('a lone right-clicked atom stands for its whole structure', () => {
  const { doc, c1, c2, o } = ethanolAndWater();
  expect([...loneStructure(doc, sel([c1]))!].sort()).toEqual([c1, c2, o].sort());
});

it('a lone bond (with or without its end atoms) stands for its whole structure', () => {
  const { doc, c1, c2, o, b1, b2 } = ethanolAndWater();
  expect(loneStructure(doc, sel([], [b2]))!.size).toBe(3);
  expect(loneStructure(doc, sel([c1, c2], [b1]))!.size).toBe(3);
  const s = chemistrySelection(doc, sel([], [b1]), true)!;
  expect([...s.atoms].sort()).toEqual([c1, c2, o].sort());
  expect([...s.bonds].sort()).toEqual([b1, b2].sort());
});

it('anything bigger is taken as it is', () => {
  const { doc, c1, o, w } = ethanolAndWater();
  expect(loneStructure(doc, sel([c1, o]))).toBeNull();
  expect(loneStructure(doc, sel([c1, w]))).toBeNull();
  const two = sel([c1, o]);
  expect(chemistrySelection(doc, two, true)).toBe(two);
  expect(chemistrySelection(doc, sel([]), false)).toBeNull();
});
