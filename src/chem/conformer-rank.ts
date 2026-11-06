// Ranking conformers without the 3-D library: the conformer search's settings, Boltzmann
// populations and the fitted RMSD that tells two conformers apart. Kept apart from
// model3d-build.ts (which loads OpenChemLib) so the window and xTB code can use them cheaply.

import type { Conformer } from './model3d-build';

/** Conformer Search settings. */
export interface SearchOptions {
  /** How many starting conformers to relax (more finds more, slower). */
  starts: number;
  /** Conformers more than this far above the lowest (kcal/mol) are dropped. */
  window: number;
  /** Two conformers closer than this (heavy-atom RMSD after fitting, Å) with nearly the same energy are one. */
  rmsd: number;
  /** Called now and then with how many have been relaxed. */
  progress?: (done: number, total: number) => void;
}

export const DEFAULT_SEARCH: SearchOptions = { starts: 200, window: 10, rmsd: 0.5 };

/** kcal/mol per kelvin (the gas constant), for Boltzmann populations. */
const R_KCAL = 0.0019872043;

/**
 * The conformers whose energies can be used. The force field sometimes gives NaN or Infinity
 * (OpenChemLib's MMFF94s+ does for some nitriles, alkynes, azides, allenes and isocyanides); such a
 * conformer is dropped when any other has a real energy, or else every energy is treated as missing.
 */
export function finiteEnergies(cs: Conformer[]): Conformer[] {
  const ok = (c: Conformer) => c.energy !== null && Number.isFinite(c.energy);
  if (cs.every(ok)) return cs;
  if (cs.some(ok)) return cs.filter(ok);
  return cs.map((c) => (c.energy === null ? c : { ...c, energy: null }));
}

/** Each conformer's Boltzmann population at `T` kelvin, from its energy (none when energies are missing). */
export function withPopulations(cs: Conformer[], T = 298.15): Conformer[] {
  cs = finiteEnergies(cs);
  if (!cs.length || cs.some((c) => c.energy === null)) return cs;
  const e0 = Math.min(...cs.map((c) => c.energy!));
  // a conformer found more than once in equivalent forms (degeneracy) counts that many times
  const w = cs.map((c) => (c.degeneracy ?? 1) * Math.exp(-(c.energy! - e0) / (R_KCAL * T)));
  const sum = w.reduce((a, b) => a + b, 0);
  return cs.map((c, i) => ({ ...c, population: w[i] / sum }));
}

/**
 * RMSD between two conformers over the atoms `idx`, after moving and turning one onto the other
 * (Kabsch's fit, by the quaternion method: the largest eigenvector of Horn's 4×4 matrix, found by
 * power iteration on a shifted matrix).
 */
export function fittedRmsd(p: number[], q: number[], idx: number[]): number {
  const n = idx.length;
  if (!n) return 0;
  const cp = [0, 0, 0], cq = [0, 0, 0];
  for (const i of idx) for (let k = 0; k < 3; k++) { cp[k] += p[3 * i + k] / n; cq[k] += q[3 * i + k] / n; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let gp = 0, gq = 0;
  for (const i of idx) {
    const a = [p[3 * i] - cp[0], p[3 * i + 1] - cp[1], p[3 * i + 2] - cp[2]], b = [q[3 * i] - cq[0], q[3 * i + 1] - cq[1], q[3 * i + 2] - cq[2]];
    for (let r = 0; r < 3; r++) { gp += a[r] * a[r]; gq += b[r] * b[r]; for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c]; }
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // the largest eigenvalue: shift so every eigenvalue is positive, then power iteration
  const shift = gp + gq;
  let v = [1, 0.1, 0.01, 0.001];
  for (let it = 0; it < 2000; it++) {
    const w = [0, 1, 2, 3].map((r) => N[r].reduce((s, x, c) => s + x * v[c], 0) + shift * v[r]);
    const len = Math.hypot(...w);
    if (!len) break;
    const next = w.map((x) => x / len);
    const done = next.every((x, k) => Math.abs(x - v[k]) < 1e-12);
    v = next;
    if (done) break;
  }
  // the eigenvalue, as the Rayleigh quotient (accurate even when the vector has not quite settled)
  const lambda = [0, 1, 2, 3].reduce((t, r) => t + v[r] * N[r].reduce((s, x, c) => s + x * v[c], 0), 0);
  const msd = Math.max(0, (gp + gq - 2 * lambda) / n);
  return Math.sqrt(msd);
}

/**
 * Conformers added to a search's (rotamers about one bond it may have missed): those already
 * found (energy within 0.1 kcal/mol and heavy atoms within 0.3 Å) are left out, the rest kept
 * within `window` kcal/mol of the lowest, and the shares worked out again.
 */
export function mergeConformers(atoms: { z: number }[], found: Conformer[], extra: { xyz: number[]; energy: number }[], window = 8): Conformer[] {
  const heavy = atoms.map((x, i) => (x.z === 1 ? -1 : i)).filter((i) => i >= 0);
  const all: Conformer[] = finiteEnergies(found.map((c) => ({ xyz: c.xyz, energy: c.energy })));
  for (const r of extra) {
    if (!Number.isFinite(r.energy)) continue;
    if (all.some((k) => k.energy !== null && Math.abs(k.energy - r.energy) < 0.1 && fittedRmsd(k.xyz, r.xyz, heavy) < 0.3)) continue;
    all.push(r);
  }
  all.sort((p, q) => (p.energy ?? 0) - (q.energy ?? 0));
  const e0 = all[0]?.energy ?? 0;
  return withPopulations(all.filter((c) => (c.energy ?? 0) - e0 <= window));
}
