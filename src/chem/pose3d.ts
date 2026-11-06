// The real 3-D shape of a drawn structure, for the 3-D Perspective tool: OpenChemLib (BSD-3,
// Idorsia) builds a few likely conformers from its torsion library (they keep the drawing's
// stereocentres and double bonds), the one the drawing means is picked (perspective.ts
// choosePose), and only that one is relaxed with the MMFF94s+ force field, which keeps the
// wait short. Runs in the 3-D worker (and in tests).

import { Molecule, ConformerGenerator, ForceFieldMMFF94 } from 'openchemlib';
import { choosePose, type DepthCues, type PoseProblem, type V3 } from './perspective';
import { absoluteMolfile, putBackIons, withoutLoneIons } from './model3d-build';

export interface Pose {
  /** Every atom (the molfile's first, in its order, then added hydrogens), Å, the 3-D window's frame: x right, y up, z towards the reader. */
  pts: V3[];
  /** Atomic numbers, by atom. */
  z: number[];
  bonds: [number, number][];
  /** The shape was taken in the mirror (a biaryl's other twist). */
  mirror: boolean;
}

export type PoseResult = { pose: Pose } | { problem: PoseProblem | 'build'; message: string };

const PROBLEM: Record<PoseProblem | 'build', string> = {
  build: 'No 3-D shape could be built for this structure.',
  stereo: 'No 3-D shape keeps the stereocenters as they are drawn.',
  hints: 'The wedges and bold bonds don\'t say which 3-D shape is meant (or no shape of this structure looks like that).',
};

/** OpenChemLib's coordinates (y down, z away) in the 3-D window's frame. */
const viewOf = (m: Molecule): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i < m.getAllAtoms(); i++) out.push([m.getAtomX(i), -m.getAtomY(i), -m.getAtomZ(i)]);
  return out;
};

/** The drawing's shape in 3-D: up to `count` conformers are tried. */
export function buildPose(molblock: string, cues: DepthCues, L: number, count = 8, seed = 1): PoseResult {
  const fail = (p: PoseProblem | 'build'): PoseResult => ({ problem: p, message: PROBLEM[p] });
  const mol = Molecule.fromMolfile(absoluteMolfile(molblock));
  if (!mol.getAllAtoms()) return fail('build');
  const { core, ions } = withoutLoneIons(mol);
  const gen = new ConformerGenerator(seed);
  if (!gen.initializeConformers(core)) return fail('build');
  const confs: Molecule[] = [];
  for (let k = 0; k < count; k++) {
    const c = gen.getNextConformerAsMolecule();
    if (!c) break;
    confs.push(putBackIons(c, mol, ions));
  }
  if (!confs.length) return fail('build');
  const first = confs[0];
  first.ensureHelperArrays(Molecule.cHelperNeighbours);
  const bonds: [number, number][] = [];
  for (let b = 0; b < first.getAllBonds(); b++) bonds.push([first.getBondAtom(0, b), first.getBondAtom(1, b)]);
  const pick = choosePose(confs.map(viewOf), bonds, cues, L);
  if ('problem' in pick) return fail(pick.problem);
  const chosen = confs[pick.k];
  try {
    const ff = new ForceFieldMMFF94(chosen, ForceFieldMMFF94.MMFF94SPLUS);
    ff.minimise({ maxIts: 300 });
  } catch {
    // no force field parameters (most metals): keep the generator's shape
  }
  let pts = viewOf(chosen);
  if (pick.mirror) pts = pts.map(([x, y, z]) => [x, y, -z]);
  const z: number[] = [];
  for (let i = 0; i < chosen.getAllAtoms(); i++) z.push(chosen.getAtomicNo(i));
  return { pose: { pts, z, bonds, mirror: pick.mirror } };
}
