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
// Lines: nu = E_upper - E_lower, intensity = |<lower|F-|upper>|^2 / 2^(N-1), so a spectrum's
// intensities sum to the number of observed spins. Line width: mean of the involved spins' widths,
// weighted by |<lower|I-_k|upper>|^2.

export const MAX_SPINS = 14;
const MIN_RELATIVE = 1e-6;

export interface SpinSystem {
  /** Shift of each spin, ppm (heteronuclear shifts are unused). */
  shifts: number[];
  /** Symmetric couplings, Hz: j[a][b]. */
  j: number[][];
  /** Nucleus per spin, default all '1H'. */
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
  const V: Float64Array[] = [];
  for (let i = 0; i < n; i++) V.push(a.slice(i * n, i * n + n));
  const d = new Float64Array(n), e = new Float64Array(n);
  // tred2
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
    } else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j]; g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j]; V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i]; V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  if (n > 0) V[n - 1][n - 1] = 1;
  e[0] = 0;
  // tql2, on the transpose (Q[c] = column c of V) so the rotations run over contiguous memory
  const Q: Float64Array[] = [];
  for (let c = 0; c < n; c++) { const q = new Float64Array(n); for (let r = 0; r < n; r++) q[r] = V[r][c]; Q.push(q); }
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

const bit = (s: number, k: number) => (s >> k) & 1;

function buildBlocks(sys: SpinSystem, sf: number, obs: number[]): Map<string, Block> {
  const n = sys.shifts.length;
  const obsSet = new Set(obs);
  const het = [...Array(n).keys()].filter((k) => !obsSet.has(k));
  const groups = new Map<string, number[]>();
  for (let s = 0; s < 1 << n; s++) {
    let m2 = 0;
    for (const k of obs) m2 += 2 * bit(s, k) - 1;
    let hb = 0;
    het.forEach((k, pos) => { hb |= bit(s, k) << pos; });
    const key = `${m2},${hb}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(s);
  }
  const nu = sys.shifts.map((x) => x * sf);
  const out = new Map<string, Block>();
  for (const [key, states] of groups) {
    const m = states.length;
    const index = new Map(states.map((s, i) => [s, i] as [number, number]));
    const h = new Float64Array(m * m);
    states.forEach((s, r) => {
      let diag = 0;
      for (const k of obs) diag += nu[k] * (bit(s, k) - 0.5);
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const jab = sys.j[a][b];
        if (jab) diag += jab * (bit(s, a) - 0.5) * (bit(s, b) - 0.5);
      }
      h[r * m + r] = diag;
      for (let ai = 0; ai < obs.length; ai++) for (let bi = ai + 1; bi < obs.length; bi++) {
        const a = obs[ai], b = obs[bi], jab = sys.j[a][b];
        if (!jab || bit(s, a) === bit(s, b)) continue;
        h[r * m + index.get(s ^ ((1 << a) | (1 << b)))!] += 0.5 * jab;
      }
    });
    const { values, vectors } = eighSym(h, m);
    out.set(key, { states, index, values, vectors });
  }
  return out;
}

/** All transitions of the observed nucleus at spectrometer frequency sf (MHz). Frequencies in Hz
 *  from 0 ppm. */
export function transitions(sys: SpinSystem, sf: number, observed = '1H'): LineList {
  const n = sys.shifts.length;
  if (n === 0) return { hz: new Float64Array(0), intensity: new Float64Array(0), width: new Float64Array(0), sf };
  if (n > MAX_SPINS) throw new Error(`${n} spins: exact simulation is limited to ${MAX_SPINS}`);
  const nuclei = sys.nuclei ?? sys.shifts.map(() => '1H');
  const widths = typeof sys.widths === 'number' ? sys.shifts.map(() => sys.widths as number) : sys.widths ?? sys.shifts.map(() => 1);
  const obs = [...Array(n).keys()].filter((k) => nuclei[k] === observed);
  if (!obs.length) throw new Error(`no ${observed} spins in the system`);
  const blocks = buildBlocks(sys, sf, obs);
  const norm = 2 ** (n - 1);
  const obsMean = obs.reduce((t, k) => t + widths[k], 0) / obs.length;
  const sameWidth = obs.every((k) => widths[k] === widths[obs[0]]);
  const F: number[] = [], I: number[] = [], W: number[] = [];
  for (const [key, up] of blocks) {
    const [m2, hb] = key.split(',').map(Number);
    const low = blocks.get(`${m2 - 2},${hb}`);
    if (!low) continue;
    const nl = low.states.length, nu_ = up.states.length;
    const tTot = new Float64Array(nl * nu_), tW = new Float64Array(nl * nu_), tN = new Float64Array(nl * nu_);
    const tk = new Float64Array(nl * nu_);
    // upper eigenvectors by basis state (row su holds component su of every eigenvector), for
    // contiguous inner loops
    const upT = new Float64Array(nu_ * nu_);
    for (let j = 0; j < nu_; j++) for (let su = 0; su < nu_; su++) upT[su * nu_ + j] = up.vectors[j * nu_ + su];
    if (sameWidth) {
      // all observed spins share one width, so only <lower|F-|upper> is needed: G = F- Vup in the
      // lower block's basis, then Vlow^T G
      const G = new Float64Array(nl * nu_);
      for (let su = 0; su < nu_; su++) {
        const s = up.states[su], src = su * nu_;
        for (const k of obs) {
          if (!bit(s, k)) continue;
          const row = low.index.get(s ^ (1 << k))! * nu_;
          for (let j = 0; j < nu_; j++) G[row + j] += upT[src + j];
        }
      }
      for (let i = 0; i < nl; i++) {
        const row = i * nu_;
        for (let sl = 0; sl < nl; sl++) {
          const vl = low.vectors[i * nl + sl];
          if (vl === 0) continue;
          const g = sl * nu_;
          for (let j = 0; j < nu_; j++) tTot[row + j] += vl * G[g + j];
        }
      }
      tN.fill(1); tW.fill(obsMean);
    }
    for (const k of sameWidth ? [] : obs) {
      tk.fill(0);
      // <lower i|I-_k|upper j> = sum over upper basis states s with bit k set: Vlow[s^k, i] Vup[s, j]
      for (let su = 0; su < nu_; su++) {
        const s = up.states[su];
        if (!bit(s, k)) continue;
        const sl = low.index.get(s ^ (1 << k))!;
        for (let i = 0; i < nl; i++) {
          const vl = low.vectors[i * nl + sl];
          if (vl === 0) continue;
          const row = i * nu_, src = su * nu_;
          for (let j = 0; j < nu_; j++) tk[row + j] += vl * upT[src + j];
        }
      }
      for (let x = 0; x < tk.length; x++) {
        const t = tk[x], t2 = t * t;
        tTot[x] += t; tW[x] += t2 * widths[k]; tN[x] += t2;
      }
    }
    for (let i = 0; i < nl; i++) for (let j = 0; j < nu_; j++) {
      const x = i * nu_ + j;
      F.push(up.values[j] - low.values[i]);
      I.push((tTot[x] * tTot[x]) / norm);
      W.push(tN[x] > 0 ? tW[x] / tN[x] : obsMean);
    }
  }
  const max = I.reduce((m, v) => Math.max(m, v), 0);
  const keep = I.map((v, i) => [v, i] as [number, number]).filter(([v]) => v > MIN_RELATIVE * max).map(([, i]) => i);
  keep.sort((a, b) => F[a] - F[b]);
  return {
    hz: Float64Array.from(keep, (i) => F[i]),
    intensity: Float64Array.from(keep, (i) => I[i]),
    width: Float64Array.from(keep, (i) => W[i]),
    sf,
  };
}

/** Sum of area-normalized absorption Lorentzians on a frequency axis (Hz). */
export function lorentzian(lines: LineList, hz: ArrayLike<number>): Float64Array {
  const out = new Float64Array(hz.length);
  for (let l = 0; l < lines.hz.length; l++) {
    const f = lines.hz[l], a = lines.intensity[l] / Math.PI, hw = lines.width[l] / 2, hw2 = hw * hw;
    // only evaluate within 200 half-widths; the tail beyond holds < 0.4% of the area
    const reach = 200 * hw;
    for (let p = 0; p < hz.length; p++) {
      const x = hz[p] - f;
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
