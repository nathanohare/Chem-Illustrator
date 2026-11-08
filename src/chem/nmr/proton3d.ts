// The two protons of a CH2 next to a stereocentre or in a ring (diastereotopic protons) sit in
// different surroundings and so at different shifts. The shift networks give one shift per carbon;
// this splits it from 3-D conformers. Each proton gets terms in the spirit of Abraham's CHARGE
// model (Abraham & Mobli, Magn. Reson. Chem. 2006, 44, S1; Abraham et al. 1999): ring currents
// (point dipole), the anisotropy of C=O, C=C and triple bonds (McConnell), the electric field of
// polar groups along the C–H bond (linear and quadratic, Buckingham), steric compression, and how
// electronegative groups on the next carbon sit relative to the proton (gauche or anti). Terms are
// averaged over the conformers' populations; the split is a weighted sum of the two protons'
// differences, with weights fitted on assigned spectra (scripts/nmr/proton3d_fit.py). The mean of
// the two shifts stays the networks' value.

import type { Model3d } from '../model3d-build';
import { DCHI, sameProtons, torsion } from './karplus';

export const PROTON_TERMS = ['ring', 'co', 'cc', 'triple', 'field', 'field2', 'steric', 'stericH', 'anti', 'syn', 'close', 'lonepair'] as const;

/** Partial charges on polar atoms (the bonded heavy atoms carry the opposite charge, shared). */
const Q: Record<number, number> = { 7: -0.3, 8: -0.4, 9: -0.3, 16: -0.1, 17: -0.15, 35: -0.1, 53: -0.05 };

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.sqrt(dot(a, a));

/** Rings of 5 or 6 atoms joined by aromatic bonds. */
function aromaticRings(n: number, nb: number[][], arom: (a: number, b: number) => boolean): number[][] {
  const seen = new Set<string>(), out: number[][] = [];
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    for (const k of nb[last]) {
      if (!arom(last, k)) continue;
      if (k === path[0] && path.length >= 5) {
        const key = [...path].sort((p, q) => p - q).join(',');
        if (!seen.has(key)) { seen.add(key); out.push([...path]); }
        continue;
      }
      if (path.length < 6 && k > path[0] && !path.includes(k)) walk([...path, k]);
    }
  };
  for (let a = 0; a < n; a++) walk([a]);
  return out;
}

/**
 * Terms (PROTON_TERMS order) for each hydrogen of every sp3 CH2, averaged over the conformers'
 * populations, keyed by the hydrogen's index in the model (as in the first conformer).
 */
export function protonTerms(model: Model3d): Map<number, number[]> {
  const nAt = model.atoms.length;
  const z = model.atoms.map((a) => a.z);
  const nb: number[][] = Array.from({ length: nAt }, () => []);
  const ord = new Map<string, { order: number; aromatic: boolean }>();
  for (const b of model.bonds) { nb[b.a].push(b.b); nb[b.b].push(b.a); ord.set(`${Math.min(b.a, b.b)},${Math.max(b.a, b.b)}`, b); }
  const bond = (a: number, b: number) => ord.get(`${Math.min(a, b)},${Math.max(a, b)}`);
  const isH = (i: number) => z[i] === 1;
  // bonds apart (up to 3), for leaving out near neighbours
  const near = (h: number): Map<number, number> => {
    const d = new Map([[h, 0]]);
    let front = [h];
    for (let s = 1; s <= 3; s++) {
      const next: number[] = [];
      for (const a of front) for (const k of nb[a]) if (!d.has(k)) { d.set(k, s); next.push(k); }
      front = next;
    }
    return d;
  };
  const rings = aromaticRings(nAt, nb, (a, b) => !!bond(a, b)?.aromatic);
  const multiple = model.bonds.filter((b) => !b.aromatic && b.order >= 2);
  const charge = new Array(nAt).fill(0);
  for (let i = 0; i < nAt; i++) {
    const q = Q[z[i]];
    if (!q) continue;
    charge[i] += q;
    const heavy = nb[i].filter((k) => !isH(k));
    for (const k of heavy) charge[k] -= q / heavy.length;
  }
  const targets: { h: number; c: number; d: Map<number, number> }[] = [];
  for (let c = 0; c < nAt; c++) {
    if (z[c] !== 6 || nb[c].length !== 4) continue;
    const hs = nb[c].filter(isH);
    if (hs.length !== 2) continue;
    for (const h of hs) targets.push({ h, c, d: near(h) });
  }
  const out = new Map<number, number[]>();
  if (!targets.length) return out;
  const at = sameProtons(model, nb, isH);
  const confs = model.conformers;
  const pops = confs.map((cf) => cf.population ?? 1 / confs.length);
  const tot = pops.reduce((a, b) => a + b, 0) || 1;
  for (const t of targets) out.set(t.h, PROTON_TERMS.map(() => 0));
  confs.forEach((cf, ci) => {
    const x = cf.xyz;
    const P = (i: number): V => [x[3 * i], x[3 * i + 1], x[3 * i + 2]];
    const w = pops[ci] / tot;
    for (const t of targets) {
      const h = at(ci, t.h), pH = P(h), pC = P(t.c);
      const f = PROTON_TERMS.map(() => 0);
      // ring currents: (1 - 3 cos^2) / r^3 from each ring's centre along its normal
      for (const r of rings) {
        const ps = r.map(P);
        const ctr: V = [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k], 0) / ps.length) as V;
        const nrm = cross(sub(ps[0], ctr), sub(ps[2], ctr));
        const v = sub(pH, ctr), rr = len(v), c = dot(v, nrm) / (rr * len(nrm));
        f[0] += (r.length === 6 ? 1 : 0.6) * (1 - 3 * c * c) / rr ** 3;
      }
      // bond anisotropy (McConnell): (3 cos^2 - 1) / r^3 about each multiple bond's midpoint
      for (const b of multiple) {
        if (b.a === t.c || b.b === t.c) continue;
        const pa = P(b.a), pb = P(b.b);
        const mid: V = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
        const v = sub(pH, mid), ax = sub(pb, pa), rr = len(v), c = dot(v, ax) / (rr * len(ax));
        const g = (3 * c * c - 1) / rr ** 3;
        if (b.order >= 3) f[3] += g;
        else if (z[b.a] === 8 || z[b.b] === 8) f[1] += g;
        else f[2] += g;
      }
      // electric field of the partial charges along C-H, and its square
      const u = sub(pH, pC), uu = len(u);
      const E: V = [0, 0, 0];
      for (let k = 0; k < nAt; k++) {
        if (!charge[k] || (t.d.get(k) ?? 9) < 3) continue;
        const v = sub(pH, P(k)), r3 = len(v) ** 3;
        for (let m = 0; m < 3; m++) E[m] += (charge[k] * v[m]) / r3;
      }
      f[4] = dot(E, u) / uu;
      f[5] = dot(E, E);
      // steric compression from atoms more than three bonds away; close contacts; lone pairs
      for (let k = 0; k < nAt; k++) {
        if (k === h || (t.d.get(k) ?? 9) <= 3) continue;
        const rr = len(sub(pH, P(k)));
        if (isH(k)) f[7] += 1 / rr ** 6; else f[6] += 1 / rr ** 6;
        if (!isH(k) && rr < 2.9) f[10] += 1;
        if (z[k] === 7 || z[k] === 8) f[11] += 1 / rr ** 3;
      }
      // electronegative groups on the next carbons: anti (cos^2 weighted) and syn/anti sign (cos)
      for (const c2 of nb[t.c]) {
        if (isH(c2)) continue;
        for (const s of nb[c2]) {
          if (s === t.c || isH(s)) continue;
          const tor = torsion(x, h, t.c, c2, s) * (Math.PI / 180);
          const dx = (DCHI[z[s]] ?? 0.4) - 0.4;
          f[8] += dx * Math.cos(tor) ** 2 * (Math.cos(tor) < 0 ? 1 : 0);
          f[9] += dx * Math.cos(tor);
        }
      }
      const acc = out.get(t.h)!;
      for (let k = 0; k < f.length; k++) acc[k] += w * f[k];
    }
  });
  return out;
}

/** Weights for the split, per term (scripts/nmr/proton3d_fit.py); null until fitted. */
export interface ProtonSplitWeights { w: number[]; max: number }

/** The two shifts of each CH2: the carbon's 1H value plus and minus half the split. */
export function splitPairs(terms: Map<number, number[]>, model: Model3d, weights: ProtonSplitWeights): Map<number, number> {
  const out = new Map<number, number>();
  const done = new Set<number>();
  for (const b of model.bonds) {
    for (const [c, h] of [[b.a, b.b], [b.b, b.a]]) {
      if (model.atoms[h].z !== 1 || !terms.has(h) || done.has(h)) continue;
      const other = model.bonds.map((x) => (x.a === c ? x.b : x.b === c ? x.a : -1)).find((k) => k >= 0 && k !== h && terms.has(k));
      if (other === undefined) continue;
      const fa = terms.get(h)!, fb = terms.get(other)!;
      let d = 0;
      for (let k = 0; k < weights.w.length; k++) d += weights.w[k] * (fa[k] - fb[k]);
      d = Math.max(-weights.max, Math.min(weights.max, d));
      out.set(h, d / 2); out.set(other, -d / 2);
      done.add(h); done.add(other);
    }
  }
  return out;
}

/** Structure features of a CH2 carbon for the split (heavy-atom graph of the model). */
export const CH2_TOPO = ['ring', 'ringSize', 'stereoDist', 'stereoCount', 'aromaticNb', 'carbonylNb', 'nosNb', 'halogenNb', 'heavy'] as const;

export function ch2Topology(model: Pick<Model3d, 'atoms' | 'bonds'>, c: number, stereo: number[]): number[] {
  const z = model.atoms.map((a) => a.z);
  const nb: number[][] = z.map(() => []);
  const arom = new Set<number>(), dbl = new Map<number, number[]>();
  for (const b of model.bonds) {
    if (z[b.a] === 1 || z[b.b] === 1) continue;
    nb[b.a].push(b.b); nb[b.b].push(b.a);
    if (b.aromatic) { arom.add(b.a); arom.add(b.b); }
    else if (b.order === 2) { dbl.set(b.a, [...(dbl.get(b.a) ?? []), b.b]); dbl.set(b.b, [...(dbl.get(b.b) ?? []), b.a]); }
  }
  // graph distances from c
  const dist = new Map([[c, 0]]);
  let front = [c];
  while (front.length) {
    const next: number[] = [];
    for (const a of front) for (const k of nb[a]) if (!dist.has(k)) { dist.set(k, dist.get(a)! + 1); next.push(k); }
    front = next;
  }
  // smallest ring through c: shortest path between two of its neighbours that avoids c
  let ring = 0;
  for (let i = 0; i < nb[c].length; i++) {
    const seen = new Map([[nb[c][i], 0]]);
    let f = [nb[c][i]];
    while (f.length && !ring) {
      const nx: number[] = [];
      for (const a of f) for (const k of nb[a]) {
        if (k === c || seen.has(k)) continue;
        seen.set(k, seen.get(a)! + 1);
        nx.push(k);
      }
      f = nx;
    }
    for (let j = i + 1; j < nb[c].length; j++) {
      const d = seen.get(nb[c][j]);
      if (d !== undefined && (!ring || d + 2 < ring)) ring = d + 2;
    }
  }
  const sd = stereo.filter((s) => s !== c).map((s) => dist.get(s) ?? 99);
  const ns = nb[c];
  return [
    ring ? 1 : 0, ring, sd.length ? Math.min(9, ...sd) : 9, stereo.length,
    ns.filter((k) => arom.has(k)).length,
    ns.filter((k) => z[k] === 6 && (dbl.get(k) ?? []).some((o) => z[o] === 8)).length,
    ns.filter((k) => z[k] === 7 || z[k] === 8 || z[k] === 16).length,
    ns.filter((k) => z[k] === 9 || z[k] === 17 || z[k] === 35 || z[k] === 53).length,
    z.filter((x) => x > 1).length,
  ];
}

/** Model input for one CH2: |difference| and mean of its two protons' terms, then its structure features. */
export function ch2Features(fa: number[], fb: number[], topo: number[]): number[] {
  return [...fa.map((v, k) => Math.abs(v - fb[k])), ...fa.map((v, k) => (v + fb[k]) / 2), ...topo];
}

/**
 * Gradient-boosted trees for the size of the split (scripts/nmr/proton3d_fit.py, NMRShiftDB2):
 * per tree, nodes as parallel arrays (feature, threshold, left, right, value; feature -1 = leaf).
 */
export interface Ch2SplitTrees { base: number; max: number; trees: { f: number[]; t: number[]; l: number[]; r: number[]; v: number[] }[] }

export function treeSplit(m: Ch2SplitTrees, x: number[]): number {
  let s = m.base;
  for (const t of m.trees) {
    let n = 0;
    while (t.f[n] >= 0) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n];
    s += t.v[n];
  }
  return Math.max(0, Math.min(m.max, s));
}

/**
 * The predicted gap (ppm) between the two protons of each diastereotopic sp3 CH2, keyed by model
 * atom. Which proton is downfield is not predicted (not reliable yet), only how far apart they are.
 */
export function ch2Splits(model: Model3d, trees: Ch2SplitTrees): Map<number, number> {
  const out = new Map<number, number>();
  if (!model.diaCH2?.length) return out;
  const terms = protonTerms(model);
  for (const c of model.diaCH2) {
    const hs = model.bonds.map((b) => (b.a === c ? b.b : b.b === c ? b.a : -1)).filter((k) => k >= 0 && model.atoms[k].z === 1);
    if (hs.length !== 2 || !terms.has(hs[0]) || !terms.has(hs[1])) continue;
    out.set(c, treeSplit(trees, ch2Features(terms.get(hs[0])!, terms.get(hs[1])!, ch2Topology(model, c, model.stereo ?? []))));
  }
  return out;
}
