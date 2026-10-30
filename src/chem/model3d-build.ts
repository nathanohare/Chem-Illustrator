// 3-D models of molecules: OpenChemLib (BSD-3, Idorsia) builds conformers from its torsion
// library and relaxes each with the MMFF94s+ force field. Runs in the 3-D worker (and in tests).

import { Molecule, ConformerGenerator, ForceFieldMMFF94 } from 'openchemlib';

/** One conformer: every atom's position (Å), hydrogens added at the end, and its MMFF94s+ energy. */
export interface Conformer {
  xyz: number[];
  /** kcal/mol, or null when the force field has no parameters for the molecule. */
  energy: number | null;
}

/** A molecule's atoms and bonds (the drawn atoms first, in molfile order) and its conformers, lowest energy first. */
export interface Model3d {
  atoms: { z: number; charge: number }[];
  bonds: { a: number; b: number; order: number; aromatic: boolean }[];
  conformers: Conformer[];
}

/** Conformers of a molecule, each relaxed with MMFF94s+, duplicates (same shape) dropped. */
export function buildModel(molblock: string, count: number, seed: number): Model3d | null {
  const mol = Molecule.fromMolfile(molblock);
  if (!mol.getAllAtoms()) return null;
  const gen = new ConformerGenerator(seed);
  if (!gen.initializeConformers(mol)) return null;
  const conformers: Conformer[] = [];
  let shape: Molecule | null = null;
  for (let k = 0; k < count; k++) {
    const c = gen.getNextConformerAsMolecule();
    if (!c) break;
    shape ??= c;
    let energy: number | null = null;
    try {
      const ff = new ForceFieldMMFF94(c, ForceFieldMMFF94.MMFF94SPLUS);
      ff.minimise();
      energy = ff.getTotalEnergy();
    } catch {
      energy = null; // no MMFF parameters (most metals): keep the generator's geometry
    }
    const xyz: number[] = [];
    for (let i = 0; i < c.getAllAtoms(); i++) xyz.push(c.getAtomX(i), c.getAtomY(i), c.getAtomZ(i));
    conformers.push({ xyz, energy });
  }
  if (!shape || !conformers.length) return null;
  shape.ensureHelperArrays(Molecule.cHelperAll);
  const atoms = [];
  for (let i = 0; i < shape.getAllAtoms(); i++) atoms.push({ z: shape.getAtomicNo(i), charge: shape.getAtomCharge(i) });
  const bonds = [];
  for (let b = 0; b < shape.getAllBonds(); b++) {
    bonds.push({ a: shape.getBondAtom(0, b), b: shape.getBondAtom(1, b), order: shape.getBondOrder(b), aromatic: shape.isAromaticBond(b) });
  }
  // lowest energy first; minimising often brings two starting points to the same shape
  conformers.sort((p, q) => (p.energy ?? 0) - (q.energy ?? 0));
  const kept: Conformer[] = [];
  for (const c of conformers) {
    if (!kept.some((k) => k.energy !== null && c.energy !== null && Math.abs(k.energy - c.energy) < 0.05 && rmsd(k.xyz, c.xyz) < 0.3)) kept.push(c);
  }
  return { atoms, bonds, conformers: kept };
}

/** Root-mean-square distance between two sets of positions as they lie (no fitting): enough to tell duplicates apart. */
function rmsd(p: number[], q: number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - q[i]) ** 2;
  return Math.sqrt(s / (p.length / 3));
}
