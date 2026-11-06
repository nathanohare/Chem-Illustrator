// A relaxed torsion scan with MMFF94s+ (OpenChemLib, BSD-3, Idorsia): the bond is turned in
// steps through 360°, and at each step everything else is relaxed with the torsion held. Runs in
// the 3-D worker (and in tests).
//
// OpenChemLib's force field takes no constraints, so the torsion is held by turning it back
// after each short burst of minimising (rounds of turn, minimise 5 steps, read the positions
// back, until the energy settles). The scan is run both ways round and the lower energy kept at each angle, so a
// group that flips part way (a methyl's hydrogens) does not leave a step in the curve.

import { Molecule, ConformerGenerator, ForceFieldMMFF94 } from 'openchemlib';
import { sideOf, torsion, type NewmanMol } from './newman';
import { absoluteMolfile, putBackIons, withoutLoneIons } from './model3d-build';

export interface ScanPoint {
  /** The torsion a–b–c–d, degrees (0 to 360). */
  phi: number;
  /** kcal/mol above the lowest point of the scan. */
  energy: number;
  /** Every atom's position at this angle (Å), for drawing the Newman projection there. */
  xyz: number[];
}

export interface ScanResult {
  points: ScanPoint[];
  /** Relaxed at each angle (true), or only turned (false: the force field's positions could not be read back). */
  relaxed: boolean;
  method: string;
}

export interface ScanOptions {
  /** Degrees between angles (10 by default). */
  step: number;
  /** Rounds of turn-and-relax at each angle. */
  rounds?: number;
  progress?: (done: number, total: number) => void;
}

/** The field OpenChemLib keeps its positions in (its names are shortened when built), found once by matching a molecule's coordinates. */
let posKey: string | null | undefined;

function positionsKey(ff: ForceFieldMMFF94, m: Molecule): string | null {
  if (posKey !== undefined) return posKey;
  const inner = (ff as unknown as { a?: Record<string, unknown> }).a;
  const n = m.getAllAtoms();
  const want: number[] = [];
  for (let i = 0; i < n; i++) want.push(m.getAtomX(i), m.getAtomY(i), m.getAtomZ(i));
  posKey = null;
  if (inner && typeof inner === 'object') {
    for (const k of Object.keys(inner)) {
      const v = inner[k];
      if (Array.isArray(v) && v.length === 3 * n && v.every((x, i) => x === want[i])) { posKey = k; break; }
    }
  }
  return posKey;
}

/** The molecule the conformer generator makes (with its hydrogens), at positions `xyz`. */
export function moleculeAt(molblock: string, xyz: number[]): Molecule | null {
  const mol = Molecule.fromMolfile(absoluteMolfile(molblock));
  if (!mol.getAllAtoms()) return null;
  const { core, ions } = withoutLoneIons(mol);
  const gen = new ConformerGenerator(1);
  if (!gen.initializeConformers(core)) return null;
  const g = gen.getNextConformerAsMolecule();
  const c = g && putBackIons(g, mol, ions);
  if (!c || c.getAllAtoms() * 3 !== xyz.length) return null;
  for (let i = 0; i < c.getAllAtoms(); i++) { c.setAtomX(i, xyz[3 * i]); c.setAtomY(i, xyz[3 * i + 1]); c.setAtomZ(i, xyz[3 * i + 2]); }
  c.ensureHelperArrays(Molecule.cHelperNeighbours);
  return c;
}

function coords(m: Molecule): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.getAllAtoms(); i++) out.push(m.getAtomX(i), m.getAtomY(i), m.getAtomZ(i));
  return out;
}

function describe(m: Molecule): NewmanMol {
  const atoms = [];
  for (let i = 0; i < m.getAllAtoms(); i++) atoms.push({ z: m.getAtomicNo(i), charge: m.getAtomCharge(i) });
  const bonds = [];
  for (let b = 0; b < m.getAllBonds(); b++) bonds.push({ a: m.getBondAtom(0, b), b: m.getBondAtom(1, b), order: m.getBondOrder(b) });
  return { atoms, bonds };
}

/** Turn the atoms `moving` about the bond b→c so that the torsion a–b–c–d becomes `target` degrees. */
function setTorsion(m: Molecule, t: [number, number, number, number], moving: number[], target: number): void {
  const [, b, c] = t;
  const xyz = coords(m);
  const ang = ((torsion(xyz, ...t) - target) * Math.PI) / 180;
  const pb = [m.getAtomX(b), m.getAtomY(b), m.getAtomZ(b)], pc = [m.getAtomX(c), m.getAtomY(c), m.getAtomZ(c)];
  let k = [pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]];
  const L = Math.hypot(k[0], k[1], k[2]) || 1;
  k = k.map((v) => v / L);
  const cs = Math.cos(ang), sn = Math.sin(ang);
  for (const i of moving) {
    if (i === c) continue;
    const v = [m.getAtomX(i) - pc[0], m.getAtomY(i) - pc[1], m.getAtomZ(i) - pc[2]];
    const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    m.setAtomX(i, pc[0] + v[0] * cs + cr[0] * sn + k[0] * kv * (1 - cs));
    m.setAtomY(i, pc[1] + v[1] * cs + cr[1] * sn + k[1] * kv * (1 - cs));
    m.setAtomZ(i, pc[2] + v[2] * cs + cr[2] * sn + k[2] * kv * (1 - cs));
  }
}

/** Relax `m` with the torsion held at `target`; returns its energy (kcal/mol), and whether it could relax. */
function relaxAt(m: Molecule, t: [number, number, number, number], moving: number[], target: number, rounds: number): { e: number; relaxed: boolean } {
  let relaxed = true, last = Infinity, still = 0;
  for (let r = 0; r < rounds; r++) {
    setTorsion(m, t, moving, target);
    const ff = new ForceFieldMMFF94(m, ForceFieldMMFF94.MMFF94SPLUS);
    const key = positionsKey(ff, m);
    // short bursts: a long one wanders off along the torsion before it is turned back
    const done = ff.minimise({ maxIts: 5 });
    const e = ff.getTotalEnergy();
    still = Math.abs(e - last) < 2e-3 ? still + 1 : 0;
    last = e;
    if (done !== 0) {
      const pos = key ? (ff as unknown as { a: Record<string, number[]> }).a[key] : null;
      if (!pos) { relaxed = false; break; }
      for (let i = 0; i < m.getAllAtoms(); i++) { m.setAtomX(i, pos[3 * i]); m.setAtomY(i, pos[3 * i + 1]); m.setAtomZ(i, pos[3 * i + 2]); }
    }
    if (still >= 3) break;
  }
  setTorsion(m, t, moving, target);
  return { e: new ForceFieldMMFF94(m, ForceFieldMMFF94.MMFF94SPLUS).getTotalEnergy(), relaxed };
}

/**
 * Scan the torsion a–b–c–d (3-D model atoms) of the molecule `molblock`, starting from conformer
 * `xyz`. Returns null when the bond is in a ring (it can't turn) or nothing could be built.
 */
export function scanTorsion(molblock: string, xyz: number[], t: [number, number, number, number], opts: ScanOptions): ScanResult | null {
  const start = moleculeAt(molblock, xyz);
  if (!start) return null;
  const mol = describe(start);
  const moving = sideOf(mol, t[2], t[1]);
  if (!moving) return null;
  const step = Math.max(1, opts.step), rounds = opts.rounds ?? 80;
  const n = Math.round(360 / step);
  const phi0 = Math.round(torsion(xyz, ...t) / step) * step;
  const best: (ScanPoint & { raw: number })[] = [];
  let relaxed = true, done = 0;
  for (const dir of [1, -1]) {
    const m = start.getCompactCopy();
    m.ensureHelperArrays(Molecule.cHelperNeighbours);
    for (let i = 0; i <= n; i++) {
      const phi = ((phi0 + dir * i * step) % 360 + 360) % 360;
      const r = relaxAt(m, t, moving, phi, rounds);
      relaxed &&= r.relaxed;
      const k = Math.round(phi / step) % n;
      if (!best[k] || r.e < best[k].raw) best[k] = { phi: k * step, energy: 0, raw: r.e, xyz: coords(m) };
      opts.progress?.(++done, 2 * (n + 1));
    }
  }
  const e0 = Math.min(...best.map((p) => p.raw));
  return { points: best.map((p) => ({ phi: p.phi, energy: p.raw - e0, xyz: p.xyz })), relaxed, method: 'MMFF94s+' };
}

/**
 * The bond's other staggered rotamers, for a conformer search that may have missed some: each
 * starting conformer turned about b→c by 120° and 240° and relaxed freely (MMFF94s+). Returns
 * each new shape with its energy (kcal/mol); none for a bond in a ring.
 */
export function bondRotamers(molblock: string, starts: number[][], t: [number, number, number, number]): { xyz: number[]; energy: number }[] {
  const out: { xyz: number[]; energy: number }[] = [];
  for (const xyz of starts) {
    for (const turn of [120, 240]) {
      const m = moleculeAt(molblock, xyz);
      if (!m) return out;
      const moving = sideOf(describe(m), t[2], t[1]);
      if (!moving) return out;
      setTorsion(m, t, moving, torsion(xyz, ...t) + turn);
      try {
        const ff = new ForceFieldMMFF94(m, ForceFieldMMFF94.MMFF94SPLUS);
        const key = positionsKey(ff, m);
        const done = ff.minimise({ maxIts: 6000 });
        const energy = ff.getTotalEnergy();
        if (done !== 0) {
          const pos = key ? (ff as unknown as { a: Record<string, number[]> }).a[key] : null;
          if (pos) for (let i = 0; i < m.getAllAtoms(); i++) { m.setAtomX(i, pos[3 * i]); m.setAtomY(i, pos[3 * i + 1]); m.setAtomZ(i, pos[3 * i + 2]); }
        }
        out.push({ xyz: coords(m), energy });
      } catch {
        return out;
      }
    }
  }
  return out;
}
