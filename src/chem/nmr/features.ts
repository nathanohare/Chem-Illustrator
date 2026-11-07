// Graph features for the NMR shift networks. The same code runs when the training set is written
// (scripts/nmr/graph_feats.ts, in Node) and when the app predicts, so the network always sees
// atoms and bonds described the same way.

import { envCodes, MAX_RADIUS, ringInfo, type EnvGraph } from './env';

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

/**
 * Feature set 2 adds stereochemistry. Per atom (one more block): no stereocentre; a possible
 * stereocentre the drawing leaves undefined; the same hand as the structure's reference
 * stereocentre; the opposite hand; pseudo-asymmetric (r/s). Per bond: none, E or Z, folded into the
 * bond type (type + 8 x stereo). Hands are relative, so a structure and its enantiomer get the
 * same features, as their shifts are the same in an achiral solvent.
 */
export const STEREO_STATES = 5;
export const BOND_STEREO = 3;
export type FeatureSet = 1 | 2;
export const atomBlockSizes = (v: FeatureSet): number[] => [...Object.values(ATOM_BLOCKS), ...(v >= 2 ? [STEREO_STATES] : [])];
export const atomDim = (v: FeatureSet): number => atomBlockSizes(v).reduce((t, n) => t + n, 0);
export const bondTypes = (v: FeatureSet): number => (v >= 2 ? BOND_TYPES * BOND_STEREO : BOND_TYPES);

export interface GraphFeatures {
  /** Per atom: the index set in each block (ATOM_BLOCKS order), so x[i][k] < block size k. */
  atoms: number[][];
  /** u, v, bond type (0..7). */
  bonds: [number, number, number][];
}

export function graphFeatures(g: EnvGraph, v: FeatureSet = 1): GraphFeatures {
  const ri = ringInfo(g);
  const doubles = g.atoms.map(() => 0), triples = g.atoms.map(() => 0);
  const bonds = g.bonds.map((b, i): [number, number, number] => {
    const arom = g.atoms[b.u].arom && g.atoms[b.v].arom && ri.bond[i] > 0;
    if (!arom && b.o === 2) { doubles[b.u]++; doubles[b.v]++; }
    if (!arom && b.o === 3) { triples[b.u]++; triples[b.v]++; }
    const t = arom ? 3 : b.o === 2 ? 1 : b.o === 3 ? 2 : 0;
    const st = v >= 2 ? (b.ez === 'E' ? 1 : b.ez === 'Z' ? 2 : 0) : 0;
    return [b.u, b.v, t + (ri.bond[i] > 0 ? 4 : 0) + BOND_TYPES * st];
  });
  const stereo = v >= 2 ? stereoStates(g, ri.degree) : null;
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
      ...(stereo ? [stereo[i]] : []),
    ];
  });
  return { atoms, bonds };
}

/** Per atom, its stereo state (feature set 2; see STEREO_STATES). */
export function stereoStates(g: EnvGraph, degree: number[]): number[] {
  // symmetry classes: environments that stay equal out to MAX_RADIUS bonds
  const cls = envCodes(g, MAX_RADIUS).map((c) => c[MAX_RADIUS]);
  const nb: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) { nb[b.u].push(b.v); nb[b.v].push(b.u); }
  const multiple = new Set<number>();
  g.bonds.forEach((b) => { if (b.o > 1) { multiple.add(b.u); multiple.add(b.v); } });
  const out = g.atoms.map((a, i): number => {
    if (a.cip === 'r' || a.cip === 's') return 4;
    if (a.cip === 'R' || a.cip === 'S') return 2;
    // a possible stereocentre: sp3 carbon with four different substituents (hydrogen counts as one)
    if (a.el !== 'C' || a.arom || multiple.has(i) || a.h > 1 || degree[i] + a.h !== 4) return 0;
    const subs = nb[i].map((n) => cls[n]);
    return new Set(subs).size === subs.length ? 1 : 0;
  });
  // the reference: the labelled centre whose class no other labelled centre shares, first by class
  const labelled = g.atoms.map((_, i) => i).filter((i) => g.atoms[i].cip === 'R' || g.atoms[i].cip === 'S');
  const count = new Map<string, number>();
  for (const i of labelled) count.set(cls[i], (count.get(cls[i]) ?? 0) + 1);
  const unique = labelled.filter((i) => count.get(cls[i]) === 1).sort((p, q) => (cls[p] < cls[q] ? -1 : cls[p] > cls[q] ? 1 : 0));
  let flip: boolean;
  if (unique.length) flip = g.atoms[unique[0]].cip === 'S';
  else {
    const r = labelled.filter((i) => g.atoms[i].cip === 'R').length;
    flip = labelled.length - r > r;
  }
  for (const i of labelled) out[i] = (g.atoms[i].cip === 'R') !== flip ? 2 : 3;
  return out;
}

/** The solvents the networks know by name; anything else is "other". */
export const NET_SOLVENTS = ['CDCl3', 'DMSO-d6', 'CD3OD', 'C6D6', 'acetone-d6', 'CD2Cl2', 'CD3CN', 'D2O'] as const;
export function solventIndex(s: string | null | undefined): number {
  const i = (NET_SOLVENTS as readonly string[]).indexOf(s ?? '');
  return i < 0 ? NET_SOLVENTS.length : i;
}
