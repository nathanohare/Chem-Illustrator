// The sums of a bench calculator: mass, moles and volume of a compound (neat or as a solution),
// how much to weigh out to make a solution, and dilutions (c1·V1 = c2·V2). Pure arithmetic, so the
// window and the tests share it. Units inside are mg, mmol, mL, mol/L (M) and g/mL.

export type Given = 'mass' | 'mmol' | 'volume' | 'solution';

export interface AmountInput {
  /** Molecular weight, g/mol. */
  mw: number;
  /** Density of the neat liquid, g/mL (for the volume to measure out). */
  density?: number;
  /** Concentration of a solution of it, mol/L (for the volume of solution). */
  molarity?: number;
  /** Purity or weight percent, 1–100 (100 when left out): a 95 % reagent needs 1/0.95 the mass. */
  purity?: number;
  /** Which quantity was typed, and its value (mg, mmol, mL neat or mL of solution). */
  given: Given;
  value: number;
  /** Equivalents relative to a limiting reagent (with limitingMmol, gives the mmol). */
  equiv?: number;
}

export interface Amounts {
  /** Mass to weigh, mg (of the reagent as bought, so purity included). */
  massMg: number;
  mmol: number;
  /** Volume of the neat liquid, mL, when a density is known. */
  neatMl?: number;
  /** Volume of the solution, mL, when a molarity is known. */
  solutionMl?: number;
}

const ok = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x) && x > 0;

/** Every quantity from the one typed. Null when it can't be worked out (no MW for a mass, say). */
export function amounts(a: AmountInput): Amounts | null {
  const purity = ok(a.purity) ? Math.min(a.purity, 100) / 100 : 1;
  if (!Number.isFinite(a.value) || a.value < 0) return null;
  let mmol: number;
  switch (a.given) {
    case 'mmol': mmol = a.value; break;
    case 'mass': if (!ok(a.mw)) return null; mmol = (a.value * purity) / a.mw; break;
    case 'volume': if (!ok(a.mw) || !ok(a.density)) return null; mmol = (a.value * a.density * 1000 * purity) / a.mw; break;
    case 'solution': if (!ok(a.molarity)) return null; mmol = a.value * a.molarity; break;
  }
  const out: Amounts = { massMg: ok(a.mw) ? (mmol * a.mw) / purity : NaN, mmol };
  if (ok(a.density) && ok(a.mw)) out.neatMl = out.massMg / 1000 / a.density;
  if (ok(a.molarity)) out.solutionMl = mmol / a.molarity;
  return out;
}

/** Millimoles of a reagent used at these equivalents of a limiting reagent. */
export const equivMmol = (limitingMmol: number, equiv: number): number => limitingMmol * equiv;

/** Mass (mg) to weigh out for this volume (mL) of a solution at this molarity (M). */
export function solutionMass(molarity: number, volumeMl: number, mw: number, purity = 100): number {
  return (molarity * volumeMl * mw) / (Math.min(purity, 100) / 100);
}

export interface Dilution { c1?: number; v1?: number; c2?: number; v2?: number }

/**
 * c1·V1 = c2·V2 with one of the four left out: returns all four, or null when not exactly one is
 * missing, or the result is not positive. Any units, as long as each pair matches.
 */
export function dilution(d: Dilution): Required<Dilution> | null {
  const keys = ['c1', 'v1', 'c2', 'v2'] as const;
  const missing = keys.filter((k) => !ok(d[k]));
  if (missing.length !== 1) return null;
  const { c1, v1, c2, v2 } = d;
  const solved: Required<Dilution> = { c1: c1 ?? 0, v1: v1 ?? 0, c2: c2 ?? 0, v2: v2 ?? 0 };
  switch (missing[0]) {
    case 'c1': solved.c1 = (c2! * v2!) / v1!; break;
    case 'v1': solved.v1 = (c2! * v2!) / c1!; break;
    case 'c2': solved.c2 = (c1! * v1!) / v2!; break;
    case 'v2': solved.v2 = (c1! * v1!) / c2!; break;
  }
  return Number.isFinite(solved[missing[0]]) && solved[missing[0]] > 0 ? solved : null;
}

/** A number for a box: 4 significant figures, without trailing zeros or exponent for lab sizes. */
export function show(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return '';
  if (x === 0) return '0';
  const digits = Math.max(0, 3 - Math.floor(Math.log10(Math.abs(x))));
  return String(Number(x.toFixed(Math.min(digits, 8))));
}
