// Bonds read from a computed geometry (a Gaussian or ORCA file's last coordinates), for the
// structures on an energy diagram: which atoms are bonded (by their covalent radii), a guess at
// each bond's order from its length (so a 2-D drawing has its double bonds), and, in a
// transition state, the bonds being made or broken (longer than a bond, shorter than a contact)
// with their lengths in Å.

import { COVALENT } from './crystal';
import type { QmAtom } from './qm-output';

export interface QmBond {
  i: number;
  j: number;
  /** 1, 2 or 3; a partial bond is 1. */
  order: number;
  /** Being made or broken (a transition state's long bond). */
  partial: boolean;
  /** Its length in Å. */
  d: number;
}

const rad = (el: string) => COVALENT[el] ?? 1.5;
const dist = (a: QmAtom, b: QmAtom) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A bond is up to this many times the two covalent radii; a partial bond up to PARTIAL times. */
const FULL = 1.18;
const PARTIAL = 1.75;

/** How many bonds an element makes at most (for the bond-order guess). */
const VALENCE: Record<string, number> = { H: 1, B: 3, C: 4, N: 3, O: 2, F: 1, Si: 4, P: 5, S: 6, Cl: 1, Se: 2, Br: 1, I: 1 };

/** [double, triple] upper lengths (Å) for a pair of elements, in alphabetical order. */
const MULTIPLE: Record<string, [number, number]> = {
  'C-C': [1.43, 1.26], 'C-N': [1.36, 1.20], 'C-O': [1.30, 1.17], 'C-S': [1.70, 0], 'N-N': [1.31, 1.15], 'N-O': [1.28, 0],
  'C-P': [1.72, 0], 'O-S': [1.50, 0], 'O-P': [1.52, 0], 'C-Se': [1.84, 0], 'O-Se': [1.66, 0], 'N-S': [1.60, 0],
};
const pairKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * The bonds of a geometry. `ts`: it is a transition state, so long bonds (being made or
 * broken) are found too; atoms that share a neighbour (1,3 pairs) never count as one.
 */
export function qmBonds(atoms: QmAtom[], ts = false): QmBond[] {
  const n = atoms.length;
  const out: QmBond[] = [];
  const nb: number[][] = atoms.map(() => []);
  const longer: { i: number; j: number; d: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(atoms[i], atoms[j]);
      if (d < 0.4) continue;
      const r = d / (rad(atoms[i].el) + rad(atoms[j].el));
      if (r < FULL) { out.push({ i, j, order: 1, partial: false, d }); nb[i].push(j); nb[j].push(i); }
      else if (ts && r < PARTIAL && !(atoms[i].el === 'H' && atoms[j].el === 'H')) longer.push({ i, j, d, r });
    }
  }
  if (ts) {
    // the long bonds of the reaction: not between neighbours' neighbours, the nearest few
    const kept = longer.filter(({ i, j }) => !nb[i].some((k) => nb[j].includes(k))).sort((a, b) => a.r - b.r).slice(0, 4);
    for (const { i, j, d } of kept) out.push({ i, j, order: 1, partial: true, d });
  }
  guessOrders(atoms, out, nb);
  return out;
}

/**
 * Double and triple bonds from their lengths: the shortest first, each where both atoms have a
 * bond to spare, then alternating paths so a ring of equal bonds (benzene) gets all three.
 */
function guessOrders(atoms: QmAtom[], bonds: QmBond[], nb: number[][]): void {
  const spare = atoms.map((a, i) => (VALENCE[a.el] ?? 0) - nb[i].length);
  const cands = bonds.filter((b) => !b.partial && MULTIPLE[pairKey(atoms[b.i].el, atoms[b.j].el)] && b.d < MULTIPLE[pairKey(atoms[b.i].el, atoms[b.j].el)][0])
    .sort((a, b) => a.d / (rad(atoms[a.i].el) + rad(atoms[a.j].el)) - b.d / (rad(atoms[b.i].el) + rad(atoms[b.j].el)));
  for (const b of cands) {
    const [, triple] = MULTIPLE[pairKey(atoms[b.i].el, atoms[b.j].el)];
    if (spare[b.i] < 1 || spare[b.j] < 1) continue;
    b.order = b.d < triple && spare[b.i] >= 2 && spare[b.j] >= 2 ? 3 : 2;
    spare[b.i] -= b.order - 1;
    spare[b.j] -= b.order - 1;
  }
  // an atom left with a bond to spare: an alternating path (single, double, single...) to
  // another such atom swaps over, so a ring of equal bonds (benzene) gets all its doubles
  const pool = cands.filter((b) => b.order !== 3);
  const other = (b: QmBond, k: number) => (b.i === k ? b.j : b.i);
  for (let start = 0; start < atoms.length; start++) {
    if (spare[start] < 1 || !pool.some((b) => b.i === start || b.j === start)) continue;
    const seen = new Set<number>([start]);
    const path: QmBond[] = [];
    // from k by a single bond to t: t spare ends it; else on by t's double bond
    const walk = (k: number): number => {
      for (const b of pool) {
        if ((b.i !== k && b.j !== k) || b.order !== 1) continue;
        const t = other(b, k);
        if (seen.has(t)) continue;
        seen.add(t);
        path.push(b);
        if (spare[t] >= 1) return t;
        const dbl = pool.find((c) => c.order === 2 && (c.i === t || c.j === t));
        if (dbl && !seen.has(other(dbl, t))) {
          const u = other(dbl, t);
          seen.add(u);
          path.push(dbl);
          const end = walk(u);
          if (end >= 0) return end;
          path.pop();
        }
        path.pop();
      }
      return -1;
    };
    const end = walk(start);
    if (end < 0) continue;
    for (const b of path) b.order = b.order === 2 ? 1 : 2;
    spare[start] -= 1;
    spare[end] -= 1;
  }
}

/** Hydrogens bonded to atom k (by the bonds given). */
export function hydrogensOn(atoms: QmAtom[], bonds: QmBond[], k: number): number {
  return bonds.filter((b) => !b.partial && (b.i === k || b.j === k) && atoms[b.i === k ? b.j : b.i].el === 'H').length;
}

/**
 * The atoms a 2-D drawing shows: every heavy atom, and a hydrogen only where it takes part in
 * a partial bond (a proton or hydride on the move). Its molfile (for the 2-D layout), in that
 * order, and which atom of the geometry each line is.
 */
export function skeletonMolfile(atoms: QmAtom[], bonds: QmBond[]): { molblock: string; index: number[] } {
  const moving = new Set(bonds.filter((b) => b.partial).flatMap((b) => [b.i, b.j]));
  const index = atoms.map((_, i) => i).filter((i) => atoms[i].el !== 'H' || moving.has(i));
  const at = new Map(index.map((k, n) => [k, n + 1]));
  const kept = bonds.filter((b) => at.has(b.i) && at.has(b.j));
  const f = (v: number, w: number) => v.toFixed(4).padStart(w);
  const lines = ['', '  Chemweave', '',
    `${String(index.length).padStart(3)}${String(kept.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...index.map((k) => `${f(atoms[k].x, 10)}${f(atoms[k].y, 10)}${f(atoms[k].z, 10)} ${atoms[k].el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...kept.map((b) => `${String(at.get(b.i)).padStart(3)}${String(at.get(b.j)).padStart(3)}${String(b.order).padStart(3)}  0`),
    'M  END'];
  return { molblock: lines.join('\n'), index };
}
