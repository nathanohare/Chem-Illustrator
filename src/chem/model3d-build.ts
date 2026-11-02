// 3-D models of molecules: OpenChemLib (BSD-3, Idorsia) builds conformers from its torsion
// library and relaxes each with the MMFF94s+ force field. Runs in the 3-D worker (and in tests).
//
// Two tiers here: Quick (a dozen likely conformers, the default) and Conformer Search (hundreds
// of starting points, each relaxed, duplicates dropped by their fitted heavy-atom RMSD, ranked
// within an energy window with Boltzmann populations). xTB refining and Gaussian/ORCA input are
// in xtb.ts and qm-input.ts.

import { Molecule, ConformerGenerator, ForceFieldMMFF94 } from 'openchemlib';
import { fittedRmsd, withPopulations, type SearchOptions } from './conformer-rank';

export { DEFAULT_SEARCH, fittedRmsd, withPopulations, type SearchOptions } from './conformer-rank';

/** One conformer: every atom's position (Å), hydrogens added at the end, and its MMFF94s+ energy. */
export interface Conformer {
  xyz: number[];
  /** kcal/mol, or null when the force field has no parameters for the molecule. */
  energy: number | null;
  /** Its share at 25 °C from the Boltzmann distribution over the conformers kept (0 to 1). */
  population?: number;
}

/** A molecule's atoms and bonds (the drawn atoms first, in molfile order) and its conformers, lowest energy first. */
export interface Model3d {
  atoms: { z: number; charge: number }[];
  bonds: { a: number; b: number; order: number; aromatic: boolean }[];
  conformers: Conformer[];
  /** What the energies are: 'MMFF94s+' (the default) or 'GFN2-xTB' (refined with xTB). */
  method?: string;
  /** For a conformer search: how many starting points were relaxed. */
  starts?: number;
}



/**
 * A conformer search: up to `opts.starts` starting conformers (OpenChemLib's adaptive random
 * torsion sets, so it moves on from torsions that clash), each relaxed with MMFF94s+; the ones
 * that come out the same (fitted heavy-atom RMSD under `opts.rmsd` and within 0.1 kcal/mol) kept
 * once, lowest energy first, within `opts.window` of the lowest, with their populations.
 */
export function searchModel(molblock: string, opts: SearchOptions, seed = 1): Model3d | null {
  const mol = Molecule.fromMolfile(molblock);
  if (!mol.getAllAtoms()) return null;
  const gen = new ConformerGenerator(seed);
  if (!gen.initializeConformers(mol, { strategy: ConformerGenerator.STRATEGY_ADAPTIVE_RANDOM, maxTorsionSets: Math.max(1000, opts.starts * 10) })) return null;
  const found: Conformer[] = [];
  let shape: Molecule | null = null, tried = 0;
  for (; tried < opts.starts; tried++) {
    const c = gen.getNextConformerAsMolecule();
    if (!c) break;
    shape ??= c.getCompactCopy();
    let energy: number | null = null;
    try {
      const ff = new ForceFieldMMFF94(c, ForceFieldMMFF94.MMFF94SPLUS);
      ff.minimise({ maxIts: 6000 });
      energy = ff.getTotalEnergy();
    } catch {
      energy = null;
    }
    const xyz: number[] = [];
    for (let i = 0; i < c.getAllAtoms(); i++) xyz.push(c.getAtomX(i), c.getAtomY(i), c.getAtomZ(i));
    found.push({ xyz, energy });
    if (opts.progress && (tried + 1) % 10 === 0) opts.progress(tried + 1, opts.starts);
  }
  if (!shape || !found.length) return null;
  const model = describe(shape);
  const heavy = model.atoms.map((a, i) => (a.z === 1 ? -1 : i)).filter((i) => i >= 0);
  found.sort((p, q) => (p.energy ?? 0) - (q.energy ?? 0));
  const e0 = found[0].energy;
  const kept: Conformer[] = [];
  for (const c of found) {
    if (e0 !== null && c.energy !== null && c.energy - e0 > opts.window) break;
    if (kept.some((k) => (k.energy === null || c.energy === null || Math.abs(k.energy - c.energy) < 0.1) && fittedRmsd(k.xyz, c.xyz, heavy) < opts.rmsd)) continue;
    kept.push(c);
  }
  return { ...model, conformers: withPopulations(kept), method: 'MMFF94s+', starts: tried };
}

/** The atoms and bonds of a conformer (with its hydrogens). */
function describe(shape: Molecule): Omit<Model3d, 'conformers'> {
  shape.ensureHelperArrays(Molecule.cHelperAll);
  const atoms = [];
  for (let i = 0; i < shape.getAllAtoms(); i++) atoms.push({ z: shape.getAtomicNo(i), charge: shape.getAtomCharge(i) });
  const bonds = [];
  for (let b = 0; b < shape.getAllBonds(); b++) {
    bonds.push({ a: shape.getBondAtom(0, b), b: shape.getBondAtom(1, b), order: shape.getBondOrder(b), aromatic: shape.isAromaticBond(b) });
  }
  return { atoms, bonds };
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
  return { atoms, bonds, conformers: withPopulations(kept), method: 'MMFF94s+' };
}

/** Root-mean-square distance between two sets of positions as they lie (no fitting): enough to tell duplicates apart. */
function rmsd(p: number[], q: number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - q[i]) ** 2;
  return Math.sqrt(s / (p.length / 3));
}
