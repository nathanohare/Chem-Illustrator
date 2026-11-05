import { describe, expect, it } from 'vitest';
import type { EnvGraph } from '../src/chem/nmr/env';
import { ATOM_BLOCKS, ATOM_DIM, graphFeatures, solventIndex } from '../src/chem/nmr/features';

// Benzaldehyde: ring C0-C5 (aromatic), C6 aldehyde carbon, O7
const benzaldehyde: EnvGraph = {
  atoms: [
    { el: 'C', q: 0, arom: true, h: 0 }, ...[1, 2, 3, 4, 5].map(() => ({ el: 'C', q: 0, arom: true, h: 1 })),
    { el: 'C', q: 0, arom: false, h: 1 }, { el: 'O', q: 0, arom: false, h: 0 },
  ],
  bonds: [
    { u: 0, v: 1, o: 2 }, { u: 1, v: 2, o: 1 }, { u: 2, v: 3, o: 2 }, { u: 3, v: 4, o: 1 }, { u: 4, v: 5, o: 2 }, { u: 5, v: 0, o: 1 },
    { u: 0, v: 6, o: 1 }, { u: 6, v: 7, o: 2 },
  ],
};

describe('NMR network features', () => {
  const f = graphFeatures(benzaldehyde);
  it('describes atoms within their block sizes', () => {
    const sizes = Object.values(ATOM_BLOCKS);
    expect(ATOM_DIM).toBe(42);
    for (const a of f.atoms) a.forEach((v, j) => expect(v).toBeLessThan(sizes[j]));
  });
  it('types ring aromatic bonds and the carbonyl', () => {
    expect(f.bonds[0][2]).toBe(3 + 4); // aromatic, in ring
    expect(f.bonds[7][2]).toBe(1); // C=O, not in ring
    expect(f.atoms[6]).toEqual([0, 0, 1, 1, 2, 0, 1, 0]); // aldehyde C: one double bond
    expect(f.atoms[1][5]).toBe(4); // six-membered ring
  });
  it('maps unknown solvents to "other"', () => {
    expect(solventIndex('CDCl3')).toBe(0);
    expect(solventIndex('THF-d8')).toBe(8);
  });
});
