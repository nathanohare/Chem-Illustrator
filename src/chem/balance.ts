// Chemistry > Reactions and Schemes > Check Balance: are the atoms on the two sides of a reaction
// arrow the same? Each side's species are added up element by element (with their charges); what
// the products are short of, or have too much of, is given as a formula, with its everyday name
// when it is a common by-product (H2O, HCl, CO2, N2…), since a drawn scheme seldom shows those.

import { formulaCounts } from './analysis';
import { hillFormula } from './formula';

export interface BalanceSpecies {
  /** Hill formula without its charge, as the chemistry engine gives it (C7H6O2). */
  formula: string;
  charge?: number;
  /** How many of it (a stoichiometric coefficient); 1 when left out. */
  count?: number;
}

export interface BalanceRow { element: string; left: number; right: number }

export interface Balance {
  rows: BalanceRow[];
  leftCharge: number;
  rightCharge: number;
  balanced: boolean;
  /** What the products are short of (on the left, not on the right), as a formula; '' when nothing. */
  missing: string;
  /** What the products have that the left side does not; '' when nothing. */
  extra: string;
  /** The everyday name of `missing` or `extra` when it is a common small molecule (water). */
  missingName?: string;
  extraName?: string;
}

/** Small molecules a scheme often leaves out, by Hill formula. */
const BY_PRODUCTS: Record<string, string> = {
  H2O: 'water', H2: 'hydrogen', HCl: 'HCl', HBr: 'HBr', HI: 'HI', HF: 'HF', CO2: 'CO₂', CO: 'CO', N2: 'nitrogen',
  O2: 'oxygen', H3N: 'ammonia', CH4O: 'methanol', C2H6O: 'ethanol', C2H4O2: 'acetic acid', SO2: 'SO₂',
  ClNa: 'NaCl', BrNa: 'NaBr', ClK: 'KCl', BrK: 'KBr', IK: 'KI', INa: 'NaI', CH2O: 'formaldehyde',
  C4H10O: 't-butanol or diethyl ether', C3H6O: 'acetone', C4H8: 'isobutene', C2H4: 'ethylene', CH4: 'methane',
};

/** The everyday name of a formula when it is a common by-product, or a whole number of them ("2 × water"). */
export function byProductName(formula: string): string | undefined {
  if (BY_PRODUCTS[formula]) return BY_PRODUCTS[formula];
  const c = formulaCounts(formula);
  if (!c) return undefined;
  for (let k = 2; k <= 6; k++) {
    if ([...c.values()].some((n) => n % k)) continue;
    const part: Record<string, number> = {};
    for (const [el, n] of c) part[el] = n / k;
    const name = BY_PRODUCTS[hillFormula(part)];
    if (name) return `${k} × ${name}`;
  }
  return undefined;
}

const add = (into: Map<string, number>, sp: BalanceSpecies): boolean => {
  const c = formulaCounts(sp.formula);
  if (!c) return false;
  const k = sp.count ?? 1;
  for (const [el, n] of c) into.set(el, (into.get(el) ?? 0) + n * k);
  return true;
};

/** Compare the two sides. Species whose formula can't be read are left out (the caller says so). */
export function checkBalance(left: readonly BalanceSpecies[], right: readonly BalanceSpecies[]): Balance {
  const L = new Map<string, number>(), R = new Map<string, number>();
  for (const s of left) add(L, s);
  for (const s of right) add(R, s);
  const leftCharge = left.reduce((q, s) => q + (s.charge ?? 0) * (s.count ?? 1), 0);
  const rightCharge = right.reduce((q, s) => q + (s.charge ?? 0) * (s.count ?? 1), 0);
  const els = [...new Set([...L.keys(), ...R.keys()])];
  // Hill order: C, H, then the rest alphabetically
  const rank = (e: string) => (e === 'C' ? 0 : e === 'H' ? 1 : 2);
  els.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const rows = els.map((element) => ({ element, left: L.get(element) ?? 0, right: R.get(element) ?? 0 }));
  const short: Record<string, number> = {}, over: Record<string, number> = {};
  for (const r of rows) {
    if (r.left > r.right) short[r.element] = r.left - r.right;
    if (r.right > r.left) over[r.element] = r.right - r.left;
  }
  const missing = hillFormula(short), extra = hillFormula(over);
  const out: Balance = { rows, leftCharge, rightCharge, balanced: !missing && !extra && leftCharge === rightCharge, missing, extra };
  const mn = missing && byProductName(missing), en = extra && byProductName(extra);
  if (mn) out.missingName = mn;
  if (en) out.extraName = en;
  return out;
}
