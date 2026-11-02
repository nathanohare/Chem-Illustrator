// Graph features for the NMR shift networks. The same code runs when the training set is written
// (scripts/nmr/graph_feats.ts, in Node) and when the app predicts, so the network always sees
// atoms and bonds described the same way.

import { ringInfo, type EnvGraph } from './env';

export const ELEMENTS = ['C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I', 'B', 'Si', 'Se', 'Sn'] as const;
/** Sizes of each atom feature block (one-hot), in order. */
export const ATOM_BLOCKS = {
  element: ELEMENTS.length + 1, // last: any other element
  aromatic: 2,
  charge: 3, // -1 or less, 0, +1 or more
  hydrogens: 5, // 0..4
  degree: 6, // 0..5
  ring: 7, // none, 3, 4, 5, 6, 7, 8
  doubles: 3, // double bonds: 0, 1, 2+
  triples: 2, // triple bond: none, one or more
} as const;
export const ATOM_DIM = Object.values(ATOM_BLOCKS).reduce((t, n) => t + n, 0);
/** Bond types: single, double, triple, aromatic; each in or out of a ring. */
export const BOND_TYPES = 8;

export interface GraphFeatures {
  /** Per atom: the index set in each block (ATOM_BLOCKS order), so x[i][k] < block size k. */
  atoms: number[][];
  /** u, v, bond type (0..7). */
  bonds: [number, number, number][];
}

export function graphFeatures(g: EnvGraph): GraphFeatures {
  const ri = ringInfo(g);
  const doubles = g.atoms.map(() => 0), triples = g.atoms.map(() => 0);
  const bonds = g.bonds.map((b, i): [number, number, number] => {
    const arom = g.atoms[b.u].arom && g.atoms[b.v].arom && ri.bond[i] > 0;
    if (!arom && b.o === 2) { doubles[b.u]++; doubles[b.v]++; }
    if (!arom && b.o === 3) { triples[b.u]++; triples[b.v]++; }
    const t = arom ? 3 : b.o === 2 ? 1 : b.o === 3 ? 2 : 0;
    return [b.u, b.v, t + (ri.bond[i] > 0 ? 4 : 0)];
  });
  const atoms = g.atoms.map((a, i) => {
    const el = (ELEMENTS as readonly string[]).indexOf(a.el);
    const r = ri.atom[i];
    return [
      el < 0 ? ELEMENTS.length : el,
      a.arom ? 1 : 0,
      a.q < 0 ? 0 : a.q > 0 ? 2 : 1,
      Math.min(a.h, 4),
      Math.min(ri.degree[i], 5),
      r >= 3 && r <= 8 ? r - 2 : 0,
      Math.min(doubles[i], 2),
      Math.min(triples[i], 1),
    ];
  });
  return { atoms, bonds };
}

/** The solvents the networks know by name; anything else is "other". */
export const NET_SOLVENTS = ['CDCl3', 'DMSO-d6', 'CD3OD', 'C6D6', 'acetone-d6', 'CD2Cl2', 'CD3CN', 'D2O'] as const;
export function solventIndex(s: string | null | undefined): number {
  const i = (NET_SOLVENTS as readonly string[]).indexOf(s ?? '');
  return i < 0 ? NET_SOLVENTS.length : i;
}
