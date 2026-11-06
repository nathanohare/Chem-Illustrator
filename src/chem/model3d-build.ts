// 3-D models of molecules: OpenChemLib (BSD-3, Idorsia) builds conformers from its torsion
// library and relaxes each with the MMFF94s+ force field. Runs in the 3-D worker (and in tests).
//
// Two tiers here: Quick (a dozen likely conformers, the default) and Conformer Search (hundreds
// of starting points, each relaxed, duplicates dropped by their fitted heavy-atom RMSD, ranked
// within an energy window with Boltzmann populations). xTB refining and Gaussian/ORCA input are
// in xtb.ts and qm-input.ts.

import { Molecule, ConformerGenerator, ForceFieldMMFF94 } from 'openchemlib';
import { DEFAULT_SEARCH, finiteEnergies, fittedRmsd, withPopulations, type SearchOptions } from './conformer-rank';

export { DEFAULT_SEARCH, fittedRmsd, withPopulations, type SearchOptions } from './conformer-rank';

/** One conformer: every atom's position (Å), hydrogens added at the end, and its MMFF94s+ energy. */
export interface Conformer {
  xyz: number[];
  /** kcal/mol, or null when the force field has no parameters for the molecule. */
  energy: number | null;
  /** Its share at 25 °C from the Boltzmann distribution over the conformers kept (0 to 1). */
  population?: number;
  /**
   * How many conformers found are this one: copies that differ only by swapping equivalent atoms
   * (the two methyls of an isopropyl, a ring flipped over) or by a mirror, counted in its population.
   */
  degeneracy?: number;
}

/**
 * The molfile with its stereocentres read as drawn (the chiral flag set). Without it OpenChemLib
 * takes them as racemic, and a 3-D model may come out as the mirror image of the drawing. A V3000
 * file with enhanced stereo groups (AND, OR) is left as it says.
 */
export function absoluteMolfile(molblock: string): string {
  const lines = molblock.split('\n');
  if (lines.length > 3 && /V2000\s*$/.test(lines[3]) && lines[3].length >= 15) {
    lines[3] = lines[3].slice(0, 12) + '  1' + lines[3].slice(15);
    return lines.join('\n');
  }
  if (/M {2}V30 COUNTS/.test(molblock) && !/STE(RAC|REL)/.test(molblock)) {
    return molblock.replace(/^(M {2}V30 COUNTS +\d+ +\d+ +\d+ +\d+) +\d+/m, '$1 1');
  }
  return molblock;
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
  /** Heavy atoms that are stereocentres, and sp3 CH2 carbons whose two hydrogens are diastereotopic (for the NMR CH2 split). */
  stereo?: number[];
  diaCH2?: number[];
}

/** Stereocentres and diastereotopic CH2 carbons of a molecule (heavy-atom indices, molfile order). */
export function ch2Flags(mol: Molecule): { stereo: number[]; diaCH2: number[] } {
  const m = mol.getCompactCopy();
  m.ensureHelperArrays(Molecule.cHelperCIP);
  const n = m.getAtoms();
  const stereo: number[] = [];
  for (let i = 0; i < n; i++) if (m.getAtomicNo(i) > 1 && m.isAtomStereoCenter(i)) stereo.push(i);
  // OpenChemLib gives the two hydrogens of a carbon different IDs when they are diastereotopic
  m.addImplicitHydrogens();
  const ids = m.getDiastereotopicAtomIDs();
  m.ensureHelperArrays(Molecule.cHelperNeighbours);
  const hs = new Map<number, number[]>();
  for (let k = 0; k < m.getAllAtoms(); k++) {
    if (m.getAtomicNo(k) !== 1 || !m.getAllConnAtoms(k)) continue;
    const c = m.getConnAtom(k, 0);
    hs.set(c, [...(hs.get(c) ?? []), k]);
  }
  const diaCH2: number[] = [];
  for (const [c, l] of hs) if (m.getAtomicNo(c) === 6 && l.length === 2 && m.getAllConnAtoms(c) === 4 && ids[l[0]] !== ids[l[1]]) diaCH2.push(c);
  return { stereo, diaCH2: diaCH2.sort((p, q) => p - q) };
}



/**
 * A conformer search: up to `opts.starts` starting conformers (OpenChemLib's adaptive random
 * torsion sets, so it moves on from torsions that clash), each relaxed with MMFF94s+; the ones
 * that come out the same (fitted heavy-atom RMSD under `opts.rmsd` and within 0.1 kcal/mol) kept
 * once, lowest energy first, within `opts.window` of the lowest, with their populations.
 */
export function searchModel(molblock: string, opts: SearchOptions, seed = 1): Model3d | null {
  const mol = Molecule.fromMolfile(absoluteMolfile(molblock));
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
  return { ...model, conformers: distinct(found, model, shape, opts.rmsd, opts.window), method: 'MMFF94s+', starts: tried };
}

/**
 * The conformers found, lowest energy first, each shape once: two within 0.1 kcal/mol whose heavy
 * atoms lie within `rmsd` Å of each other after fitting are the same conformer, and so are copies
 * that differ only by a mirror or by swapping equivalent atoms (counted in its degeneracy). Those
 * more than `window` kcal/mol above the lowest are left out.
 */
function distinct(found: Conformer[], model: Omit<Model3d, 'conformers'>, shape: Molecule, rmsd: number, window: number): Conformer[] {
  const opts = { rmsd, window };
  const heavy = model.atoms.map((a, i) => (a.z === 1 ? -1 : i)).filter((i) => i >= 0);
  shape.ensureHelperArrays(Molecule.cHelperSymmetrySimple);
  const classes = heavy.map((i) => shape.getSymmetryRank(i));
  found = finiteEnergies(found);
  found.sort((p, q) => (p.energy ?? 0) - (q.energy ?? 0));
  const e0 = found[0].energy;
  const kept: (Conformer & { profile: number[][]; forms: number[][] })[] = [];
  for (const c of found) {
    if (e0 !== null && c.energy !== null && c.energy - e0 > opts.window) break;
    const close = (k: Conformer) => k.energy === null || c.energy === null || Math.abs(k.energy - c.energy) < 0.1;
    if (kept.some((k) => close(k) && fittedRmsd(k.xyz, c.xyz, heavy) < opts.rmsd)) continue;
    // the same shape with equivalent atoms swapped, or its mirror image: counted, not listed again
    const profile = distanceProfile(c.xyz, heavy, classes);
    const twin = kept.find((k) => close(k) && sameProfile(k.profile, profile, opts.rmsd));
    if (twin) {
      // each different equivalent form found counts once (finding the same form again doesn't)
      if (!twin.forms.some((f) => fittedRmsd(f, c.xyz, heavy) < opts.rmsd)) { twin.forms.push(c.xyz); twin.degeneracy = twin.forms.length; }
      continue;
    }
    kept.push({ ...c, profile, forms: [c.xyz] });
  }
  return withPopulations(kept.map(({ profile: _p, forms: _f, ...c }) => c));
}

/**
 * A conformer's shape without its atom numbering or handedness: the heavy atoms' distances, grouped
 * by the pair of symmetry classes they join and sorted. Two conformers that differ only by swapping
 * equivalent atoms, or by a mirror, have the same profile.
 */
function distanceProfile(xyz: number[], heavy: number[], classes: number[]): number[][] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < heavy.length; i++) {
    for (let j = i + 1; j < heavy.length; j++) {
      const a = heavy[i], b = heavy[j];
      const d = Math.hypot(xyz[3 * a] - xyz[3 * b], xyz[3 * a + 1] - xyz[3 * b + 1], xyz[3 * a + 2] - xyz[3 * b + 2]);
      const key = classes[i] < classes[j] ? `${classes[i]}-${classes[j]}` : `${classes[j]}-${classes[i]}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(d);
    }
  }
  return [...groups.keys()].sort().map((k) => groups.get(k)!.sort((x, y) => x - y));
}

/** Whether two profiles are the same shape: the root-mean-square difference of their distances under a fifth of `tol` Å. */
function sameProfile(p: number[][], q: number[][], tol: number): boolean {
  if (p.length !== q.length) return false;
  let sum = 0, n = 0;
  for (let g = 0; g < p.length; g++) {
    if (p[g].length !== q[g].length) return false;
    for (let k = 0; k < p[g].length; k++) { sum += (p[g][k] - q[g][k]) ** 2; n++; }
  }
  return !n || Math.sqrt(sum / n) < tol / 5;
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
  const mol = Molecule.fromMolfile(absoluteMolfile(molblock));
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
  // minimising often brings two starting points to the same shape: each is listed once
  const model = describe(shape);
  let flags: { stereo: number[]; diaCH2: number[] } | Record<string, never> = {};
  try { flags = ch2Flags(mol); } catch { /* the NMR CH2 split is left out */ }
  return { ...model, ...flags, conformers: distinct(conformers, model, shape, DEFAULT_SEARCH.rmsd, Infinity), method: 'MMFF94s+' };
}
