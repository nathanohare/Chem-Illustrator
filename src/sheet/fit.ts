// Fitted lines (Excel's trendlines) by least squares: straight line, polynomial, exponential,
// logarithmic and power, with the equation and R² worked out as Excel works them out (for the
// exponential and power fits, R² is that of the straight line through the logarithms).
//
// Chemistry fits, each a straight line through the data transformed as the textbooks plot it
// (and R² that line's), drawn back on the chart's own axes:
// - first order:  ln y = ln y₀ − k·x            (concentration against time)
// - second order: 1/y = 1/y₀ + k·x
// - Arrhenius:    ln k = ln A − Ea/(R·T)         (rate constant against temperature)
// - Eyring:       ln(k/T) = ln(kB/h) + ΔS‡/R − ΔH‡/(R·T)
// - Hammett:      log(kX/kH) = ρ·σ (+ c)          (against the substituent constant σ)

export type FitKind = 'linear' | 'poly2' | 'poly3' | 'exp' | 'log' | 'power' | ChemFitKind;
export type ChemFitKind = 'order1' | 'order2' | 'arrhenius' | 'eyring' | 'hammett';

export interface Fit {
  kind: FitKind;
  /**
   * Coefficients: linear and polynomial c0 + c1·x + c2·x²…; exp a·e^(b·x) as [a, b]; log a·ln(x) + b as [a, b]; power a·x^b as [a, b].
   * Chemistry: order1 and order2 [y₀, k]; arrhenius [A, Ea in J/mol]; eyring [ΔH‡ in J/mol, ΔS‡ in J/(mol·K)]; hammett [c, ρ].
   */
  coef: number[];
  /** Arrhenius and Eyring: the temperatures were in °C (273.15 is added to each x). */
  celsius?: boolean;
  r2: number;
  /** How many points it was fitted to. */
  n: number;
}

export const FIT_NAMES: Record<FitKind, string> = {
  linear: 'Straight line', poly2: 'Polynomial (x²)', poly3: 'Polynomial (x³)', exp: 'Exponential', log: 'Logarithmic', power: 'Power',
  order1: 'First-order decay', order2: 'Second-order decay', arrhenius: 'Arrhenius (k against T)', eyring: 'Eyring (k against T)', hammett: 'Hammett (against σ)',
};

/** The chemistry fits, in menu order (Excel has none of them). */
export const CHEM_FITS: readonly ChemFitKind[] = ['order1', 'order2', 'arrhenius', 'eyring', 'hammett'];
export const isChemFit = (k: FitKind): k is ChemFitKind => (CHEM_FITS as readonly string[]).includes(k);
/** Fits whose x is a temperature. */
export const isTemperatureFit = (k: FitKind): boolean => k === 'arrhenius' || k === 'eyring';

/** The gas constant (J/(mol·K)), Boltzmann's and Planck's constants (CODATA 2018, exact in SI). */
export const R_GAS = 8.314462618;
const KB = 1.380649e-23, H_PLANCK = 6.62607015e-34;

/** Solve a small linear system by Gaussian elimination with pivoting (null when singular). */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-300) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Polynomial least squares of a degree; `intercept` fixes the value at x = 0. */
function polyFit(xs: number[], ys: number[], degree: number, intercept?: number): number[] | null {
  const start = intercept === undefined ? 0 : 1;
  const terms = degree + 1 - start;
  const a = Array.from({ length: terms }, () => new Array<number>(terms).fill(0));
  const b = new Array<number>(terms).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i] - (intercept ?? 0);
    for (let j = 0; j < terms; j++) {
      const pj = Math.pow(xs[i], j + start);
      b[j] += pj * y;
      for (let k = 0; k < terms; k++) a[j][k] += pj * Math.pow(xs[i], k + start);
    }
  }
  const c = solve(a, b);
  if (!c) return null;
  return intercept === undefined ? c : [intercept, ...c];
}

const polyAt = (c: number[], x: number) => c.reduce((s, ci, i) => s + ci * Math.pow(x, i), 0);

/** R² of predictions against values. */
function rSquared(ys: number[], pred: number[], throughOrigin = false): number {
  const mean = throughOrigin ? 0 : ys.reduce((s, y) => s + y, 0) / ys.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < ys.length; i++) { ssRes += (ys[i] - pred[i]) ** 2; ssTot += (ys[i] - mean) ** 2; }
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

/**
 * Fit points. Points that can't be used (not numbers, or x ≤ 0 for log and power, y ≤ 0 for exp
 * and power) are left out, as Excel leaves them out. Null when too few are left.
 */
export function fitPoints(kind: FitKind, xs: number[], ys: number[], intercept?: number, celsius = false): Fit | null {
  const px: number[] = [], py: number[] = [];
  const shift = isTemperatureFit(kind) && celsius ? 273.15 : 0;
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i] + shift, y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if ((kind === 'log' || kind === 'power' || isTemperatureFit(kind)) && x <= 0) continue;
    if ((kind === 'exp' || kind === 'power' || kind === 'order1' || kind === 'order2' || isTemperatureFit(kind)) && y <= 0) continue;
    px.push(x); py.push(y);
  }
  if (isChemFit(kind)) return chemFit(kind, px, py, intercept, celsius);
  const degree = kind === 'poly2' ? 2 : kind === 'poly3' ? 3 : 1;
  if (px.length < degree + 1 - (intercept !== undefined && (kind === 'linear' || kind.startsWith('poly')) ? 1 : 0) || px.length < 2) return null;
  switch (kind) {
    case 'linear': case 'poly2': case 'poly3': {
      const c = polyFit(px, py, degree, intercept);
      if (!c) return null;
      return { kind, coef: c, r2: rSquared(py, px.map((x) => polyAt(c, x)), intercept !== undefined), n: px.length };
    }
    case 'exp': {
      const ly = py.map(Math.log);
      const c = polyFit(px, ly, 1, intercept !== undefined && intercept > 0 ? Math.log(intercept) : undefined);
      if (!c) return null;
      return { kind, coef: [Math.exp(c[0]), c[1]], r2: rSquared(ly, px.map((x) => c[0] + c[1] * x)), n: px.length };
    }
    case 'log': {
      const lx = px.map(Math.log);
      const c = polyFit(lx, py, 1);
      if (!c) return null;
      return { kind, coef: [c[1], c[0]], r2: rSquared(py, lx.map((x) => c[0] + c[1] * x)), n: px.length };
    }
    case 'power': {
      const lx = px.map(Math.log), ly = py.map(Math.log);
      const c = polyFit(lx, ly, 1);
      if (!c) return null;
      return { kind, coef: [Math.exp(c[0]), c[1]], r2: rSquared(ly, lx.map((x) => c[0] + c[1] * x)), n: px.length };
    }
  }
}

/** A chemistry fit of usable points (temperatures already in kelvin). */
function chemFit(kind: ChemFitKind, px: number[], py: number[], intercept: number | undefined, celsius: boolean): Fit | null {
  if (px.length < (intercept !== undefined && (kind === 'order1' || kind === 'hammett') ? 1 : 2) || px.length < 2) return null;
  const line = (xs: number[], ys: number[], icpt?: number) => {
    const c = polyFit(xs, ys, 1, icpt);
    return c ? { c, r2: rSquared(ys, xs.map((x) => c[0] + c[1] * x), icpt !== undefined && icpt === 0) } : null;
  };
  const extra = celsius && isTemperatureFit(kind) ? { celsius: true } : {};
  switch (kind) {
    case 'order1': {
      // ln y = ln y₀ − k·x; a fixed y₀ fixes the intercept
      const l = line(px, py.map(Math.log), intercept !== undefined && intercept > 0 ? Math.log(intercept) : undefined);
      return l ? { kind, coef: [Math.exp(l.c[0]), -l.c[1]], r2: l.r2, n: px.length } : null;
    }
    case 'order2': {
      // 1/y = 1/y₀ + k·x
      const l = line(px, py.map((y) => 1 / y));
      return l && l.c[0] !== 0 ? { kind, coef: [1 / l.c[0], l.c[1]], r2: l.r2, n: px.length } : null;
    }
    case 'arrhenius': {
      // ln k = ln A − (Ea/R)·(1/T)
      const l = line(px.map((t) => 1 / t), py.map(Math.log));
      return l ? { kind, coef: [Math.exp(l.c[0]), -l.c[1] * R_GAS], r2: l.r2, n: px.length, ...extra } : null;
    }
    case 'eyring': {
      // ln(k/T) = ln(kB/h) + ΔS‡/R − (ΔH‡/R)·(1/T)
      const l = line(px.map((t) => 1 / t), py.map((k, i) => Math.log(k / px[i])));
      return l ? { kind, coef: [-l.c[1] * R_GAS, (l.c[0] - Math.log(KB / H_PLANCK)) * R_GAS], r2: l.r2, n: px.length, ...extra } : null;
    }
    case 'hammett': {
      const l = line(px, py, intercept);
      return l ? { kind, coef: l.c, r2: l.r2, n: px.length } : null;
    }
  }
}

/** The fitted value at x. */
export function fitAt(f: Fit, x: number): number {
  const t = x + (f.celsius ? 273.15 : 0);
  switch (f.kind) {
    case 'order1': return f.coef[0] * Math.exp(-f.coef[1] * x);
    case 'order2': return f.coef[0] / (1 + f.coef[1] * f.coef[0] * x);
    case 'arrhenius': return t > 0 ? f.coef[0] * Math.exp(-f.coef[1] / (R_GAS * t)) : NaN;
    case 'eyring': return t > 0 ? ((KB * t) / H_PLANCK) * Math.exp(f.coef[1] / R_GAS) * Math.exp(-f.coef[0] / (R_GAS * t)) : NaN;
    case 'hammett': return f.coef[0] + f.coef[1] * x;
    case 'linear': case 'poly2': case 'poly3': return polyAt(f.coef, x);
    case 'exp': return f.coef[0] * Math.exp(f.coef[1] * x);
    case 'log': return x > 0 ? f.coef[0] * Math.log(x) + f.coef[1] : NaN;
    case 'power': return x > 0 ? f.coef[0] * Math.pow(x, f.coef[1]) : NaN;
  }
}

/** A number for an equation: 4 significant figures, as Excel shows them, with E notation for very big or small. */
export function fitNumber(v: number, digits = 4): string {
  if (v === 0 || !Number.isFinite(v)) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = v.toExponential(digits - 1).split('e');
    return `${Number(m)}E${Number(e) >= 0 ? '+' : '−'}${String(Math.abs(Number(e))).padStart(2, '0')}`.replace('-', '−');
  }
  return String(Number(v.toPrecision(digits))).replace('-', '−');
}

/** The equation of a fit as Excel writes it: "y = 0.0123x + 1.234". */
export function fitEquation(f: Fit, digits = 4): string {
  const n = (v: number) => fitNumber(v, digits);
  const signed = (v: number) => (v < 0 ? ` − ${n(-v)}` : ` + ${n(v)}`);
  switch (f.kind) {
    case 'linear': case 'poly2': case 'poly3': {
      const parts: string[] = [];
      for (let i = f.coef.length - 1; i >= 0; i--) {
        const c = f.coef[i];
        if (i > 0 && c === 0) continue;
        const term = i === 0 ? '' : i === 1 ? 'x' : `x${i === 2 ? '²' : '³'}`;
        if (!parts.length) parts.push(`${n(c)}${term}`);
        else parts.push(`${signed(c)}${term}`);
      }
      return `y = ${parts.join('')}`;
    }
    case 'exp': return `y = ${n(f.coef[0])}e^${n(f.coef[1])}x`;
    case 'order1': return `y = ${n(f.coef[0])}e^(−${n(f.coef[1])}x)`;
    case 'order2': return `1/y = ${n(1 / f.coef[0])}${signed(f.coef[1])}x`;
    case 'arrhenius': return `k = ${n(f.coef[0])}·e^(−Ea/RT)`;
    case 'eyring': return `k = (kB·T/h)·e^(ΔS‡/R)·e^(−ΔH‡/RT)`;
    case 'hammett': return f.coef[0] === 0 ? `log(kX/kH) = ${n(f.coef[1])}σ` : `log(kX/kH) = ${n(f.coef[1])}σ${signed(f.coef[0])}`;
    case 'log': return `y = ${n(f.coef[0])}ln(x)${signed(f.coef[1])}`;
    case 'power': return `y = ${n(f.coef[0])}x^${n(f.coef[1])}`;
  }
}

/**
 * What a chemistry fit works out, one line each: the rate constant and half-life, the activation
 * energy, ΔH‡, ΔS‡ and ΔG‡ at 298.15 K, or ρ. Units follow the data's own (time, concentration)
 * except energies, in kJ/mol and J/(mol·K). Empty for the other fits.
 */
export function fitResults(f: Fit, digits = 4): string[] {
  const n = (v: number) => fitNumber(v, digits);
  switch (f.kind) {
    case 'order1': return [`k = ${n(f.coef[1])}`, `t½ = ${f.coef[1] > 0 ? n(Math.LN2 / f.coef[1]) : '—'}`];
    case 'order2': return [`k = ${n(f.coef[1])}`, `y₀ = ${n(f.coef[0])}`, `t½ = ${f.coef[1] > 0 && f.coef[0] > 0 ? n(1 / (f.coef[1] * f.coef[0])) : '—'}`];
    case 'arrhenius': return [`Ea = ${n(f.coef[1] / 1000)} kJ/mol`, `A = ${n(f.coef[0])}`];
    case 'eyring': {
      const g = f.coef[0] - 298.15 * f.coef[1];
      return [`ΔH‡ = ${n(f.coef[0] / 1000)} kJ/mol`, `ΔS‡ = ${n(f.coef[1])} J/(mol·K)`, `ΔG‡(298 K) = ${n(g / 1000)} kJ/mol`];
    }
    case 'hammett': return [`ρ = ${n(f.coef[1])}`];
    default: return [];
  }
}

/** R² as Excel shows it: "R² = 0.9987". */
export const r2Text = (f: Fit, digits = 4): string => `R² = ${f.r2.toFixed(digits)}`;
