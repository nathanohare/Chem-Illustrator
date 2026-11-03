// A predicted 1H spectrum for one structure: predicted shifts per atom, couplings from coupling.ts,
// and an exact simulation (spin.ts) of each group of coupled protons. Protons that couple to nothing
// are single lines; larger coupled groups are split into clusters that fit the quality setting's
// size limit, with the couplings between clusters kept to first order.

import { predictCouplings, protonGroups, type JGraph, type ProtonGroup } from './coupling';
import { lorentzian, transitions, type LineList } from './spin';

export type NmrQuality = 'fast' | 'balanced' | 'accurate';
/** Size of the largest cluster simulated exactly, in spin-1/2 equivalents (2^cap states); fast:
 *  first-order lines only. */
export const CLUSTER_CAP: Record<NmrQuality, number> = { fast: 1, balanced: 8, accurate: 12 };

/** |J| / shift difference below which two atoms' protons are left to first order. */
const WEAK = 0.02;

export interface PredictedSpectrum {
  sf: number;
  /** All lines, Hz from 0 ppm. */
  lines: LineList;
  groups: ProtonGroup[];
}

/** Lines for a first-order multiplet: each partner set splits by binomial weights. */
function firstOrder(shiftHz: number, partners: [number, number][], n: number, width: number): { hz: number[]; int: number[]; w: number[] } {
  let hz = [shiftHz], int = [n];
  for (const [j, k] of partners) {
    const nh: number[] = [], ni: number[] = [];
    const binom = [1];
    for (let a = 0; a < k; a++) binom.push((binom[a] * (k - a)) / (a + 1));
    const tot = 2 ** k;
    hz.forEach((f, i) => binom.forEach((b, m) => { nh.push(f + (m - k / 2) * j); ni.push((int[i] * b) / tot); }));
    hz = nh; int = ni;
  }
  return { hz, int, w: hz.map(() => width) };
}

/** The structure's predicted 1H spectrum at sf MHz. h1: predicted shift per heavy atom (NaN when none). */
export function predictSpectrum(g: JGraph, h1: number[], codes: string[], sf = 400, quality: NmrQuality = 'balanced', width = 0.9): PredictedSpectrum {
  const groups = protonGroups(g, h1, codes);
  const cs = predictCouplings(g).filter((c) => g.atoms[c.a].el !== 'F' && g.atoms[c.b].el !== 'F');
  const HZ: number[] = [], INT: number[] = [], W: number[] = [];
  const push = (l: { hz: ArrayLike<number>; intensity?: ArrayLike<number>; int?: ArrayLike<number>; width?: ArrayLike<number>; w?: ArrayLike<number> }) => {
    const ii = (l.intensity ?? l.int)!, ww = (l.width ?? l.w)!;
    for (let k = 0; k < l.hz.length; k++) { HZ.push(l.hz[k]); INT.push(ii[k]); W.push(ww[k]); }
  };
  const cap = CLUSTER_CAP[quality];
  if (cap <= 1) {
    // fast: each group as its first-order multiplet
    for (const gr of groups) {
      const rep = gr.atoms[0], same = new Set(gr.atoms);
      const partners: [number, number][] = [];
      for (const c of cs) {
        if (c.a !== rep && c.b !== rep) continue;
        const o = c.a === rep ? c.b : c.a;
        if (o === rep) { partners.push([c.j, 1]); continue; }
        if (!same.has(o)) partners.push([c.j, g.atoms[o].h]);
      }
      push(firstOrder(gr.shift * sf, partners, gr.n, width));
    }
    return { sf, lines: sorted(HZ, INT, W, sf), groups };
  }
  // Clusters of atoms simulated together. The H on one atom share a shift and couplings, so the
  // simulation treats them as one composite particle; a cluster's size is the dimension of its
  // largest composite state space, prod (nH + 1), held to 2^cap (the same as cap separate spins).
  // Atoms join along their strongest couplings first (|J| / shift difference: how far from first
  // order the pair is); couplings left between clusters are kept as weak couplings (J Iz Iz),
  // which is exact to first order, so every multiplet keeps all its splittings.
  const hAtoms = g.atoms.map((_, i) => i).filter((i) => !Number.isNaN(h1[i]) && g.atoms[i].h > 0);
  const jAt = new Map<string, number>();
  for (const c of cs) if (c.a !== c.b) jAt.set(`${Math.min(c.a, c.b)},${Math.max(c.a, c.b)}`, c.j);
  const J = (a: number, b: number) => jAt.get(`${Math.min(a, b)},${Math.max(a, b)}`) ?? 0;
  const parent = new Map(hAtoms.map((i) => [i, i] as [number, number]));
  const size = new Map(hAtoms.map((i) => [i, g.atoms[i].h + 1] as [number, number]));
  const root = (i: number): number => { let r = i; while (parent.get(r)! !== r) r = parent.get(r)!; parent.set(i, r); return r; };
  const limit = 2 ** cap;
  const pairs = [...jAt.entries()].map(([k, j]) => { const [a, b] = k.split(',').map(Number); return { a, b, j }; })
    .filter((p) => parent.has(p.a) && parent.has(p.b))
    .map((p) => ({ ...p, strength: Math.abs(p.j) / Math.max(1e-9, Math.abs(h1[p.a] - h1[p.b]) * sf) }))
    .sort((x, y) => y.strength - x.strength);
  for (const p of pairs) {
    // shifts more than 50 J apart: first order is within 1% of J, no need to simulate them together
    if (p.strength < WEAK) break;
    const ra = root(p.a), rb = root(p.b);
    if (ra === rb) continue;
    const merged = size.get(ra)! * size.get(rb)!;
    if (merged > limit) continue;
    parent.set(rb, ra); size.set(ra, merged);
  }
  const clusters = new Map<number, number[]>();
  for (const i of hAtoms) { const r = root(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r)!.push(i); }
  for (const atoms of clusters.values()) {
    const inC = new Set(atoms);
    const xs = hAtoms.filter((x) => !inC.has(x) && atoms.some((a) => J(a, x) !== 0));
    const spinAtoms: { atom: number; obs: boolean }[] = [];
    for (const a of atoms) for (let k = 0; k < g.atoms[a].h; k++) spinAtoms.push({ atom: a, obs: true });
    for (const x of xs) for (let k = 0; k < g.atoms[x].h; k++) spinAtoms.push({ atom: x, obs: false });
    if (spinAtoms.length === 1 || !xs.length && atoms.length === 1 && g.atoms[atoms[0]].h === 1) {
      push({ hz: [h1[atoms[0]] * sf], int: [1], w: [width] });
      continue;
    }
    const jm = spinAtoms.map((p) => spinAtoms.map((q) => (p.atom === q.atom ? 0 : J(p.atom, q.atom))));
    push(transitions({ shifts: spinAtoms.map((p) => h1[p.atom]), j: jm, nuclei: spinAtoms.map((p) => (p.obs ? '1H' : 'X')), widths: width }, sf));
  }
  return { sf, lines: sorted(HZ, INT, W, sf), groups };
}

function sorted(hz: number[], int: number[], w: number[], sf: number): LineList {
  const o = hz.map((_, i) => i).sort((a, b) => hz[a] - hz[b]);
  return { hz: Float64Array.from(o, (i) => hz[i]), intensity: Float64Array.from(o, (i) => int[i]), width: Float64Array.from(o, (i) => w[i]), sf };
}

/** The spectrum on an axis from hi to lo ppm (n points). */
export function sampleSpectrum(s: PredictedSpectrum, hi: number, lo: number, n: number): { ppm: Float64Array; y: Float64Array } {
  const ppm = Float64Array.from({ length: n }, (_, i) => hi - ((hi - lo) * i) / (n - 1));
  return { ppm, y: lorentzian(s.lines, ppm.map((p) => p * s.sf)) };
}

/** How far a group's multiplet reaches either side of its shift, ppm. */
export function multipletHalfWidth(gr: ProtonGroup, sf: number): number {
  return (gr.j.reduce((t, j) => t + j, 0) / 2 + 2) / sf;
}
