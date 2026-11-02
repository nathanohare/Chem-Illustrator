// Chemistry > Stoichiometry Table: the amounts for a reaction step, as a sheet to fill in at the
// bench. Each starting material, reagent and product of the step is a row with its formula and
// molecular weight; the equivalents and the amount of the first starting material are typed in,
// and the millimoles, masses and (from a density) volumes follow by formulas, so the sheet works
// the numbers out again as they are changed.
//
// Under the table, green metrics follow from the same numbers: atom economy (Trost: the
// product's weight over the weights of the species counted in, column J, Yes or No), and once
// the isolated mass is typed in, the yield, E-factor (Sheldon: waste per mass of product) and
// PMI (process mass intensity: everything put in per mass of product, the ACS GCI's measure).

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

/** The column headings, in order (A to J). */
export const STOICH_HEADINGS = ['Role', 'Compound', 'Formula', 'MW (g/mol)', 'Equiv', 'mmol', 'Mass (mg)', 'Density (g/mL)', 'Volume (µL)', 'In atom economy'];

/** Where the green metrics sit (sheet row indexes) under a table of this many species. */
export function greenRows(n: number): { title: number; economy: number; isolated: number; yield: number; eFactor: number; pmi: number; note: number } {
  const t = n + 2;
  return { title: t, economy: t + 1, isolated: t + 2, yield: t + 3, eFactor: t + 4, pmi: t + 5, note: t + 6 };
}

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
      // counted in the atom economy: starting materials and reagents (set a catalyst or solvent to No)
      if (r.role !== 'Product') sh.setInput(y, 9, 'Yes');
    });
    // green metrics, from the first product
    const p = rows.findIndex((r) => r.role === 'Product' && r.mw);
    if (p >= 0 && rows.length) {
      const g = greenRows(rows.length), last = rows.length + 1, pr = p + 2;
      const col = (c: string) => `${c}$2:${c}$${last}`;
      const iso = `D${g.isolated + 1}`;
      sh.setInput(g.title, 0, 'Green metrics');
      sh.patchStyle({ r1: g.title, c1: 0, r2: g.title, c2: 0 }, { bold: true });
      const put = (r: number, label: string, f: string) => { sh.setInput(r, 0, label); if (f) sh.setInput(r, 3, f); };
      put(g.economy, 'Atom economy (%)', `=IFERROR(100*D${pr}/SUMIF(${col('J')},"Yes",${col('D')}),"")`);
      put(g.isolated, 'Product isolated (mg)', '');
      put(g.yield, 'Yield (%)', `=IF(${iso}="","",100*${iso}/G${pr})`);
      put(g.eFactor, 'E-factor', `=IF(${iso}="","",(SUMIF(${col('A')},"<>Product",${col('G')})-${iso})/${iso})`);
      put(g.pmi, 'PMI', `=IF(${iso}="","",SUMIF(${col('A')},"<>Product",${col('G')})/${iso})`);
      sh.setInput(g.note, 0, 'E-factor and PMI count the masses in column G: add solvents and work-up as rows (with a density and volume) to count them too.');
      sh.patchStyle({ r1: g.economy, c1: 3, r2: g.pmi, c2: 3 }, { numFmt: '0.0' });
      sh.patchStyle({ r1: g.note, c1: 0, r2: g.note, c2: 0 }, { italic: true });
    }
    sh.patchStyle({ r1: 1, c1: 3, r2: rows.length, c2: 3 }, { numFmt: '0.00' });
    sh.patchStyle({ r1: 1, c1: 5, r2: rows.length, c2: 6 }, { numFmt: '0.00' });
    sh.patchStyle({ r1: 1, c1: 8, r2: rows.length, c2: 8 }, { numFmt: '0.0' });
    [130, 200, 110, 90, 60, 70, 80, 100, 90, 110].forEach((w, c) => sh.setColWidth(c, w));
  });
  return wb;
}
