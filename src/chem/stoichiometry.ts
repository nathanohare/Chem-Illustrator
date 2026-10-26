// Chemistry > Stoichiometry Table: the amounts for a reaction step, as a sheet to fill in at the
// bench. Each starting material, reagent and product of the step is a row with its formula and
// molecular weight; the equivalents and the amount of the first starting material are typed in,
// and the millimoles, masses and (from a density) volumes follow by formulas, so the sheet works
// the numbers out again as they are changed.

import { Workbook } from '../sheet/workbook';

export type StoichRole = 'Starting material' | 'Reagent' | 'Product' | 'Conditions';

export interface StoichRow {
  role: StoichRole;
  /** What the drawing calls it: the text of a reagent, or the structure's formula. */
  name: string;
  formula?: string;
  /** Molecular weight (average, g/mol). */
  mw?: number;
}

/** The column headings, in order (A to I). */
export const STOICH_HEADINGS = ['Role', 'Compound', 'Formula', 'MW (g/mol)', 'Equiv', 'mmol', 'Mass (mg)', 'Density (g/mL)', 'Volume (µL)'];

/**
 * A workbook with one sheet, "Stoichiometry": a heading row, then a row for each species. The
 * first starting material (or the first row with a weight) is the reference: 1 equivalent and
 * `mmol` millimoles, typed in; every other row's millimoles are its equivalents times that.
 */
export function stoichiometryBook(rows: readonly StoichRow[], mmol = 1): Workbook {
  const wb = new Workbook(['Stoichiometry']);
  const sh = wb.sheets[0];
  wb.edit('Stoichiometry table', () => {
    STOICH_HEADINGS.forEach((h, c) => sh.setInput(0, c, h));
    sh.patchStyle({ r1: 0, c1: 0, r2: 0, c2: STOICH_HEADINGS.length - 1 }, { bold: true });
    // the reference row (sheet row index): the first starting material with a weight, else the first row with one
    const first = rows.findIndex((r) => r.role === 'Starting material' && r.mw);
    const refRow = (first >= 0 ? first : rows.findIndex((r) => r.mw)) + 1;
    rows.forEach((r, i) => {
      const y = i + 1, n = y + 1;
      sh.setInput(y, 0, r.role);
      sh.setInput(y, 1, r.name);
      if (r.formula) sh.setInput(y, 2, r.formula);
      if (!r.mw) return;
      sh.setInput(y, 3, r.mw.toFixed(2));
      if (y === refRow) { sh.setInput(y, 4, '1'); sh.setInput(y, 5, String(mmol)); }
      else { sh.setInput(y, 4, '1'); sh.setInput(y, 5, `=E${n}*$F$${refRow + 1}`); }
      sh.setInput(y, 6, `=F${n}*D${n}`);
      sh.setInput(y, 8, `=IF(H${n}="","",G${n}/H${n})`);
    });
    sh.patchStyle({ r1: 1, c1: 3, r2: rows.length, c2: 3 }, { numFmt: '0.00' });
    sh.patchStyle({ r1: 1, c1: 5, r2: rows.length, c2: 6 }, { numFmt: '0.00' });
    sh.patchStyle({ r1: 1, c1: 8, r2: rows.length, c2: 8 }, { numFmt: '0.0' });
    [130, 200, 110, 90, 60, 70, 80, 100, 90].forEach((w, c) => sh.setColWidth(c, w));
  });
  return wb;
}
