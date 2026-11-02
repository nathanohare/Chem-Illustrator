// A torsion scan's energies as a smooth curve: a Fourier series (constant plus cosines and sines
// up to 6φ, fitted by least squares), which is how torsion profiles are usually written, and its
// minima and maxima with the barriers between them. No 3-D library here.

export interface Profile {
  /** a0 + Σ (a[n] cos nφ + b[n] sin nφ), n = 1…N, φ in radians. */
  a0: number;
  a: number[];
  b: number[];
}

export interface Extremum {
  phi: number;
  energy: number;
  kind: 'min' | 'max';
}

const RAD = Math.PI / 180;

/** Fit the series (up to `order` terms each) to points (φ in degrees, energy). */
export function fitProfile(pts: { phi: number; energy: number }[], order = 6): Profile {
  const N = Math.min(order, Math.max(1, Math.floor((pts.length - 1) / 2)));
  const cols = 1 + 2 * N;
  const row = (phi: number) => {
    const r = [1];
    for (let n = 1; n <= N; n++) r.push(Math.cos(n * phi * RAD), Math.sin(n * phi * RAD));
    return r;
  };
  // normal equations, solved by Gaussian elimination
  const A = Array.from({ length: cols }, () => new Array(cols + 1).fill(0));
  for (const p of pts) {
    const r = row(p.phi);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < cols; j++) A[i][j] += r[i] * r[j];
      A[i][cols] += r[i] * p.energy;
    }
  }
  for (let c = 0; c < cols; c++) {
    let piv = c;
    for (let r = c + 1; r < cols; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < cols; r++) {
      if (r === c) continue;
      const f = A[r][c] / d;
      for (let k = c; k <= cols; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = A.map((r, i) => r[cols] / (r[i] || 1e-12));
  const a: number[] = [], b: number[] = [];
  for (let n = 1; n <= N; n++) { a.push(x[2 * n - 1]); b.push(x[2 * n]); }
  return { a0: x[0], a, b };
}

/** The curve's energy at φ degrees. */
export function profileAt(p: Profile, phi: number): number {
  let e = p.a0;
  for (let n = 1; n <= p.a.length; n++) e += p.a[n - 1] * Math.cos(n * phi * RAD) + p.b[n - 1] * Math.sin(n * phi * RAD);
  return e;
}

/**
 * The curve's minima and maxima from 0° up to 360°, energies measured from its lowest point,
 * found on a fine grid and sharpened by halving. Bumps smaller than `minDrop` kcal/mol are left out.
 */
export function extrema(p: Profile, minDrop = 0.05): Extremum[] {
  const step = 0.5;
  const raw: Extremum[] = [];
  for (let phi = 0; phi < 360; phi += step) {
    const l = profileAt(p, phi - step), c = profileAt(p, phi), r = profileAt(p, phi + step);
    if (c <= l && c < r) raw.push({ phi, energy: c, kind: 'min' });
    else if (c >= l && c > r) raw.push({ phi, energy: c, kind: 'max' });
  }
  // sharpen each to a tenth of a degree
  for (const x of raw) {
    let lo = x.phi - step, hi = x.phi + step;
    for (let i = 0; i < 20; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const f1 = profileAt(p, m1), f2 = profileAt(p, m2);
      if ((x.kind === 'min') === (f1 < f2)) hi = m2; else lo = m1;
    }
    x.phi = ((((lo + hi) / 2) % 360) + 360) % 360;
    x.energy = profileAt(p, x.phi);
  }
  // drop a shallow min–max pair (wobbles of the fit)
  let list = raw.sort((s, t) => s.phi - t.phi);
  for (let changed = true; changed && list.length > 2;) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const s = list[i], t = list[(i + 1) % list.length];
      if (s.kind !== t.kind && Math.abs(s.energy - t.energy) < minDrop) {
        list = list.filter((_, k) => k !== i && k !== (i + 1) % list.length);
        changed = true;
        break;
      }
    }
  }
  const lo = Math.min(...list.map((x) => x.energy), ...sample(p));
  return list.map((x) => ({ ...x, energy: x.energy - lo }));
}

function sample(p: Profile): number[] {
  const out: number[] = [];
  for (let phi = 0; phi < 360; phi += 1) out.push(profileAt(p, phi));
  return out;
}
