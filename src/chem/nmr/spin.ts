// Exact simulation of coupled spin-1/2 spectra (1H observed; 19F, 31P, ... as weakly coupled
// heteronuclei). Ported from Open-NMR's nmrsuite.spin (hamiltonian.py, simulate.py).
//
// Copyright (c) 2026, Open-NMR contributors (Lauren Rodriguez). BSD 3-Clause License, full text in
// THIRD-PARTY-NOTICES.md. Ported from github.com/laurennicrodriguez/Open-NMR at commit 2149d6a.
// Port and changes: Chem Illustrator contributors, same licence for this file.
//
// H = sum_i nu_i Iz_i + sum_{i<j} J_ij (Ix Ix + Iy Iy + Iz Iz) between observed spins,
// J Iz Iz only to heteronuclei. H commutes with Fz of the observed spins and with Iz of every
// heteronucleus, so it splits into blocks (2 M_obs, heteronuclear bits), each diagonalized alone.
// Magnetically equivalent spins (e.g. the H of one CH3) are combined into composite particles of
// total spin I, one run per combination, each weighted by how often it occurs.
// Lines: nu = E_upper - E_lower, intensity = |<lower|F-|upper>|^2 / 2^(N-1), so a spectrum's
// intensities sum to the number of observed spins. Line width: mean of the involved spins' widths,
// weighted by |<lower|I-_k|upper>|^2.

/** Exact simulation is held to the state space of this many separate spin-1/2 nuclei. */
export const MAX_SPINS = 14;
const MIN_RELATIVE = 1e-6;

export interface SpinSystem {
  /** Shift of each spin, ppm (heteronuclear shifts are unused). */
  shifts: number[];
  /** Symmetric couplings, Hz: j[a][b]. */
  j: number[][];
  /** Nucleus per spin, default all '1H'. Spins of any other label are coupled only through J Iz Iz
   *  (weak coupling), which also serves for protons of a neighboring cluster ('X'). */
  nuclei?: string[];
  /** Lorentzian full width at half height per spin, Hz (default 1). */
  widths?: number[] | number;
}

export interface LineList { hz: Float64Array; intensity: Float64Array; width: Float64Array; sf: number }

interface Block { states: number[]; index: Map<number, number>; values: Float64Array; vectors: Float64Array /* column-major n x n */ }

/** Eigen-decomposition of a symmetric matrix (row-major n x n): Householder tridiagonalization then
 *  implicit QL (the public-domain JAMA / EISPACK tred2 + tql2). Eigenvalues ascending; vectors
 *  returned column-major (column k = eigenvector k). */
export function eighSym(a: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  // w holds V transposed (w[c*n + r] = V[r][c]) so the inner loops, which walk down columns of V,
  // run over contiguous memory. a is symmetric, so the starting w is a itself.
  const w = a.slice(0, n * n);
  const d = new Float64Array(n), e = new Float64Array(n);
  // tred2
  for (let j = 0; j < n; j++) d[j] = w[j * n + n - 1];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = w[j * n + i - 1]; w[j * n + i] = 0; w[i * n + j] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        const cj = j * n;
        f = d[j]; w[i * n + j] = f; g = e[j] + w[cj + j] * f;
        for (let k = j + 1; k <= i - 1; k++) { const v = w[cj + k]; g += v * d[k]; e[k] += v * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        const cj = j * n;
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) w[cj + k] -= f * e[k] + g * d[k];
        d[j] = w[cj + i - 1]; w[cj + i] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    const ci = i * n, c1 = (i + 1) * n;
    w[ci + n - 1] = w[ci + i]; w[ci + i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = w[c1 + k] / h;
      for (let j = 0; j <= i; j++) {
        const cj = j * n;
        let g = 0;
        for (let k = 0; k <= i; k++) g += w[c1 + k] * w[cj + k];
        for (let k = 0; k <= i; k++) w[cj + k] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) w[c1 + k] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = w[j * n + n - 1]; w[j * n + n - 1] = 0; }
  if (n > 0) w[n * n - 1] = 1;
  e[0] = 0;
  // tql2 (Q[c] = column c of V, a row of w) so the rotations run over contiguous memory
  const Q: Float64Array[] = [];
  for (let c = 0; c < n; c++) Q.push(w.subarray(c * n, c * n + n));
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  if (n > 0) e[n - 1] = 0;
  let f = 0, tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
    if (m > l) {
      do {
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1, c2 = c, c3 = c, s = 0, s2 = 0;
        const el1 = e[l + 1];
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s;
          g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]);
          e[i + 1] = s * r; s = e[i] / r; c = p / r;
          p = c * d[i] - s * g; d[i + 1] = h + s * (c * g + s * d[i]);
          const qa = Q[i + 1], qb = Q[i];
          for (let k = 0; k < n; k++) {
            h = qa[k];
            qa[k] = s * qb[k] + c * h;
            qb[k] = c * qb[k] - s * h;
          }
        }
        p = -s * s2 * c3 * el1 * e[l] / dl1;
        e[l] = s * p; d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1);
    }
    d[l] += f; e[l] = 0;
  }
  // sort ascending
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => d[x] - d[y]);
  const values = new Float64Array(n), vectors = new Float64Array(n * n);
  order.forEach((src, k) => {
    values[k] = d[src];
    vectors.set(Q[src], k * n);
  });
  return { values, vectors };
}

/** One particle of the simulation: a spin-1/2 nucleus, or a group of magnetically equivalent
 *  observed nuclei taken together at one total spin (i2 = 2I). */
interface Site { i2: number; nu: number; obs: boolean; width: number }

/** Spins that are magnetically equivalent: same nucleus, shift and width, same coupling to every
 *  spin outside the group. Couplings inside such a group never show in the spectrum. */
function equivalentGroups(sys: SpinSystem, nuclei: string[], widths: number[]): number[][] {
  const n = sys.shifts.length, used = new Set<number>(), out: number[][] = [];
  for (let a = 0; a < n; a++) {
    if (used.has(a)) continue;
    let g = [...Array(n).keys()].filter((b) => b === a || (!used.has(b) && nuclei[b] === nuclei[a] && sys.shifts[b] === sys.shifts[a] && widths[b] === widths[a]));
    for (let changed = true; changed;) {
      changed = false;
      const inG = new Set(g);
      const bad = g.find((b) => b !== a && [...Array(n).keys()].some((x) => !inG.has(x) && sys.j[b][x] !== sys.j[a][x]));
      if (bad !== undefined) { g = g.filter((b) => b !== bad); changed = true; }
    }
    g.forEach((b) => used.add(b));
    out.push(g);
  }
  return out;
}

const binom = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

/** Lines of one set of sites (weight = how many copies of this total-spin combination there are). */
function siteLines(sites: Site[], J: number[][], weight: number, norm: number, out: { F: number[]; I: number[]; W: number[] }): void {
  const n = sites.length;
  const dim = sites.map((t) => t.i2 + 1);
  const stride: number[] = [];
  let total = 1;
  for (let k = 0; k < n; k++) { stride.push(total); total *= dim[k]; }
  const obs = sites.map((t, k) => (t.obs ? k : -1)).filter((k) => k >= 0);
  const het = sites.map((t, k) => (t.obs ? -1 : k)).filter((k) => k >= 0);
  const digit = (s: number, k: number) => Math.floor(s / stride[k]) % dim[k];
  const mOf = (s: number, k: number) => digit(s, k) - sites[k].i2 / 2;
  const I = (k: number) => sites[k].i2 / 2;
  const cMinus = (k: number, m: number) => Math.sqrt(I(k) * (I(k) + 1) - m * (m - 1));
  const cPlus = (k: number, m: number) => Math.sqrt(I(k) * (I(k) + 1) - m * (m + 1));
  // blocks by 2 M_obs and the heteronuclear states
  const groups = new Map<string, number[]>();
  for (let s = 0; s < total; s++) {
    let m2 = 0;
    for (const k of obs) m2 += 2 * mOf(s, k);
    let hb = 0;
    for (const k of het) hb = hb * dim[k] + digit(s, k);
    const key = `${m2},${hb}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(s);
  }
  const blocks = new Map<string, Block>();
  for (const [key, states] of groups) {
    const m = states.length;
    const index = new Map(states.map((s, i) => [s, i] as [number, number]));
    const h = new Float64Array(m * m);
    states.forEach((s, r) => {
      let diag = 0;
      for (const k of obs) diag += sites[k].nu * mOf(s, k);
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (J[a][b]) diag += J[a][b] * mOf(s, a) * mOf(s, b);
      h[r * m + r] = diag;
      // flip-flop terms 1/2 J (I+a I-b + I-a I+b) between observed sites
      for (let ai = 0; ai < obs.length; ai++) for (let bi = 0; bi < obs.length; bi++) {
        if (ai === bi) continue;
        const a = obs[ai], b = obs[bi], jab = J[a][b];
        if (!jab || digit(s, a) === dim[a] - 1 || digit(s, b) === 0) continue;
        const ma = mOf(s, a), mb = mOf(s, b);
        h[r * m + index.get(s + stride[a] - stride[b])!] += 0.5 * jab * cPlus(a, ma) * cMinus(b, mb);
      }
    });
    const { values, vectors } = eighSym(h, m);
    blocks.set(key, { states, index, values, vectors });
  }
  const sameWidth = obs.every((k) => sites[k].width === sites[obs[0]].width);
  const obsMean = obs.reduce((t, k) => t + sites[k].width, 0) / obs.length;
  for (const [key, up] of blocks) {
    const [m2, hb] = key.split(',').map(Number);
    const low = blocks.get(`${m2 - 2},${hb}`);
    if (!low) continue;
    const nl = low.states.length, nu_ = up.states.length;
    const tTot = new Float64Array(nl * nu_), tW = new Float64Array(nl * nu_), tN = new Float64Array(nl * nu_);
    // upper eigenvectors by basis state (row su holds component su of every eigenvector)
    const upT = new Float64Array(nu_ * nu_);
    for (let j = 0; j < nu_; j++) for (let su = 0; su < nu_; su++) upT[su * nu_ + j] = up.vectors[j * nu_ + su];
    // G_k = I-_k Vup in the lower block's basis; all of F- at once when every width is the same
    const lowered = (ks: number[]) => {
      const G = new Float64Array(nl * nu_);
      for (let su = 0; su < nu_; su++) {
        const s = up.states[su], src = su * nu_;
        for (const k of ks) {
          if (digit(s, k) === 0) continue;
          const c = cMinus(k, mOf(s, k)), row = low.index.get(s - stride[k])! * nu_;
          for (let j = 0; j < nu_; j++) G[row + j] += c * upT[src + j];
        }
      }
      const T = new Float64Array(nl * nu_);
      for (let i = 0; i < nl; i++) {
        const row = i * nu_;
        for (let sl = 0; sl < nl; sl++) {
          const vl = low.vectors[i * nl + sl];
          if (vl === 0) continue;
          const g = sl * nu_;
          for (let j = 0; j < nu_; j++) T[row + j] += vl * G[g + j];
        }
      }
      return T;
    };
    if (sameWidth) {
      tTot.set(lowered(obs));
      tN.fill(1); tW.fill(obsMean);
    } else {
      for (const k of obs) {
        const tk = lowered([k]);
        for (let x = 0; x < tk.length; x++) {
          const t = tk[x], t2 = t * t;
          tTot[x] += t; tW[x] += t2 * sites[k].width; tN[x] += t2;
        }
      }
    }
    for (let i = 0; i < nl; i++) for (let j = 0; j < nu_; j++) {
      const x = i * nu_ + j;
      out.F.push(up.values[j] - low.values[i]);
      out.I.push((weight * tTot[x] * tTot[x]) / norm);
      out.W.push(tN[x] > 0 ? tW[x] / tN[x] : obsMean);
    }
  }
}

/** All transitions of the observed nucleus at spectrometer frequency sf (MHz). Frequencies in Hz
 *  from 0 ppm. Magnetically equivalent spins are simulated as composite particles (one run per
 *  combination of their total spins), which gives the same spectrum from much smaller matrices. */
export function transitions(sys: SpinSystem, sf: number, observed = '1H'): LineList {
  const n = sys.shifts.length;
  if (n === 0) return { hz: new Float64Array(0), intensity: new Float64Array(0), width: new Float64Array(0), sf };
  const nuclei = sys.nuclei ?? sys.shifts.map(() => '1H');
  const widths = typeof sys.widths === 'number' ? sys.shifts.map(() => sys.widths as number) : sys.widths ?? sys.shifts.map(() => 1);
  const obs = [...Array(n).keys()].filter((k) => nuclei[k] === observed);
  if (!obs.length) throw new Error(`no ${observed} spins in the system`);
  const groups = equivalentGroups(sys, nuclei, widths);
  // the work grows with the composite state space (a group of k equivalent spins has at most k + 1
  // states), not with the raw number of spins: hold it to what MAX_SPINS separate spins would need
  const states = groups.reduce((t, g) => t * (g.length + 1), 1);
  if (states > 2 ** MAX_SPINS) throw new Error(`${n} spins (${states} composite states): exact simulation is limited to ${2 ** MAX_SPINS}`);
  // every group of k spins splits into total spins I = k/2, k/2 - 1, ... with multiplicities
  // C(k, t) - C(k, t - 1), t = k/2 - I
  const choices = groups.map((g) => {
    const k = g.length, c: { i2: number; mult: number }[] = [];
    for (let t = 0; 2 * t <= k; t++) c.push({ i2: k - 2 * t, mult: binom(k, t) - binom(k, t - 1) });
    return c;
  });
  const norm = 2 ** (n - 1);
  const out = { F: [] as number[], I: [] as number[], W: [] as number[] };
  const pick = new Array(groups.length).fill(0);
  for (;;) {
    let weight = 1;
    const sites: Site[] = [], who: number[] = [];
    groups.forEach((g, gi) => {
      const ch = choices[gi][pick[gi]];
      weight *= ch.mult;
      if (ch.i2 === 0) return; // total spin 0: no lines, no couplings
      const o = nuclei[g[0]] === observed;
      sites.push({ i2: ch.i2, nu: o ? sys.shifts[g[0]] * sf : 0, obs: o, width: widths[g[0]] });
      who.push(g[0]);
    });
    if (sites.some((t) => t.obs)) siteLines(sites, who.map((a) => who.map((b) => (a === b ? 0 : sys.j[a][b]))), weight, norm, out);
    let gi = 0;
    while (gi < groups.length && ++pick[gi] === choices[gi].length) pick[gi++] = 0;
    if (gi === groups.length) break;
  }
  const { F, I, W } = out;
  let max = 0;
  for (const v of I) if (v > max) max = v;
  const keep: number[] = [];
  for (let i = 0; i < I.length; i++) if (I[i] > MIN_RELATIVE * max) keep.push(i);
  return mergeLines(F, I, W, keep, sf);
}

/** Lines closer than this (Hz) with the same width are one line: far below any line width, so the
 *  drawn spectrum is the same, but a long chain's hundreds of thousands of degenerate transitions
 *  shrink to a few thousand. */
export const MERGE_HZ = 0.005;

/** The lines `idx` of F/I/W sorted by frequency, with near-coincident lines of equal width merged
 *  (intensities added, frequency their intensity-weighted mean). */
export function mergeLines(F: ArrayLike<number>, I: ArrayLike<number>, W: ArrayLike<number>, idx: number[], sf: number): LineList {
  idx.sort((a, b) => F[a] - F[b]);
  const hz: number[] = [], int: number[] = [], wd: number[] = [];
  let first = -Infinity; // the lowest frequency in the line being merged, so a run can't drift
  for (const i of idx) {
    const last = hz.length - 1;
    if (last >= 0 && wd[last] === W[i] && F[i] - first < MERGE_HZ) {
      const t = int[last] + I[i];
      if (t > 0) hz[last] = (hz[last] * int[last] + F[i] * I[i]) / t;
      int[last] = t;
      continue;
    }
    hz.push(F[i]); int.push(I[i]); wd.push(W[i]);
    first = F[i];
  }
  return { hz: Float64Array.from(hz), intensity: Float64Array.from(int), width: Float64Array.from(wd), sf };
}

/** Sum of area-normalized absorption Lorentzians on a frequency axis (Hz). */
export function lorentzian(lines: LineList, hz: ArrayLike<number>): Float64Array {
  const n = hz.length, out = new Float64Array(n);
  // on a sorted axis (the usual case: ppm high to low, or Hz low to high) each line only visits
  // the points within its reach, found by bisection, rather than the whole axis
  let dir = 0;
  if (n > 1) {
    dir = hz[n - 1] >= hz[0] ? 1 : -1;
    for (let p = 1; p < n; p++) if ((hz[p] - hz[p - 1]) * dir < 0) { dir = 0; break; }
  }
  // first index whose value is past v (ascending axis) or below it (descending)
  const bisect = (v: number) => {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (dir > 0 ? hz[m] < v : hz[m] > v) lo = m + 1; else hi = m; }
    return lo;
  };
  for (let l = 0; l < lines.hz.length; l++) {
    const f = lines.hz[l], a = lines.intensity[l] / Math.PI, hw = lines.width[l] / 2, hw2 = hw * hw;
    // only evaluate within 200 half-widths; the tail beyond holds < 0.4% of the area
    const reach = 200 * hw;
    const from = dir ? bisect(dir > 0 ? f - reach : f + reach) : 0;
    for (let p = from; p < n; p++) {
      const x = hz[p] - f;
      if (dir && (dir > 0 ? x > reach : x < -reach)) break;
      if (x > reach || x < -reach) continue;
      out[p] += (a * hw) / (hw2 + x * x);
    }
  }
  return out;
}

/** Spectrum between two shifts: ppm axis from high to low, intensity. */
export function simulate(sys: SpinSystem, sf: number, ppmFrom: number, ppmTo: number, points = 16384): { ppm: Float64Array; y: Float64Array } {
  const hi = Math.max(ppmFrom, ppmTo), lo = Math.min(ppmFrom, ppmTo);
  const ppm = Float64Array.from({ length: points }, (_, i) => hi - ((hi - lo) * i) / (points - 1));
  const lines = transitions(sys, sf);
  return { ppm, y: lorentzian(lines, ppm.map((p) => p * sf)) };
}
