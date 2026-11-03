// A predicted 1H spectrum for one structure: predicted shifts per atom, couplings from coupling.ts,
// and an exact simulation (spin.ts) of each group of coupled protons. Protons that couple to nothing
// are single lines; larger coupled groups are split at their weakest couplings until each fits the
// quality setting's size limit.

import { predictCouplings, protonGroups, type JGraph, type ProtonGroup } from './coupling';
import { lorentzian, transitions, type LineList } from './spin';

export type NmrQuality = 'fast' | 'balanced' | 'accurate';
/** Most protons simulated together per quality setting (fast: first-order lines only). */
export const CLUSTER_CAP: Record<NmrQuality, number> = { fast: 1, balanced: 8, accurate: 10 };

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
  // one spin per hydrogen on an atom with a predicted shift
  const spins: { atom: number; shift: number }[] = [];
  g.atoms.forEach((a, i) => { if (!Number.isNaN(h1[i])) for (let k = 0; k < a.h; k++) spins.push({ atom: i, shift: h1[i] }); });
  const J = spins.map(() => new Float64Array(spins.length));
  for (const c of cs) {
    spins.forEach((s, x) => spins.forEach((t, y) => {
      if (x === y) return;
      if (c.a === c.b ? s.atom === c.a && t.atom === c.a : (c.a === s.atom && c.b === t.atom) || (c.b === s.atom && c.a === t.atom)) J[x][y] = c.j;
    }));
  }
  // groups of coupled spins; drop the weakest couplings inside a group until it fits the cap
  let cut = 0.3;
  const comps = (): number[][] => {
    const seen = new Set<number>(), out: number[][] = [];
    spins.forEach((_, x) => {
      if (seen.has(x)) return;
      const comp = [x]; seen.add(x);
      for (let q = 0; q < comp.length; q++) spins.forEach((_, y) => { if (!seen.has(y) && Math.abs(J[comp[q]][y]) >= cut) { seen.add(y); comp.push(y); } });
      out.push(comp);
    });
    return out;
  };
  const done: { comp: number[]; cut: number }[] = [];
  let todo = comps();
  for (;;) {
    const big = todo.filter((c) => c.length > cap);
    for (const c of todo) if (c.length <= cap) done.push({ comp: c, cut });
    if (!big.length) break;
    if (cut > 30) { for (const c of big) done.push({ comp: c.slice(0, cap), cut }); break; }
    cut = cut < 1 ? 1 : cut * 1.5;
    const keep = new Set(big.flat());
    todo = comps().filter((c) => keep.has(c[0]));
  }
  for (const { comp, cut: k } of done) {
    if (comp.length === 1) { push({ hz: [spins[comp[0]].shift * sf], int: [1], w: [width] }); continue; }
    // couplings weaker than the cut that split this group are left out (they were the weakest)
    push(transitions({ shifts: comp.map((x) => spins[x].shift), j: comp.map((x) => comp.map((z) => (Math.abs(J[x][z]) >= k ? J[x][z] : 0))), widths: width }, sf));
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
