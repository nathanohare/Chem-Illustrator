// The template window over a new spreadsheet: our own starting points for reactions, reagents and
// stock, analysis, and running a lab. Written here for this app; none is taken from
// another program's templates.

import { Workbook } from './workbook';
import { fillReagentTable } from './reagents';
import { chartFromRange } from './chart';
import { newCondFormat } from './conditional';

/** The categories in the template window, in order. */
export const SHEET_CATEGORIES = [
  { id: 'reactions', name: 'Reactions' },
  { id: 'stock', name: 'Reagents and stock' },
  { id: 'analysis', name: 'Analysis' },
  { id: 'lab', name: 'Lab management' },
] as const;
export type SheetCategory = typeof SHEET_CATEGORIES[number]['id'];

export interface SheetTemplate {
  id: string;
  name: string;
  blurb: string;
  category: SheetCategory;
  make(): Workbook;
}

const REACTION_HEADS = ['Entry', 'Substrate', 'Catalyst', 'Loading (mol %)', 'Ligand', 'Additive', 'Solvent', 'Conc. (M)', 'Temp (°C)', 'Time (h)', 'Conv. (%)', 'Yield (%)', 'ee (%)', 'dr', 'Notes'];
const REACTION_WIDTHS = [48, 110, 110, 104, 96, 96, 88, 72, 76, 64, 72, 70, 56, 52, 200];

/** A reaction optimization table: one row per entry, the best yield picked out. */
function reactionTable(): Workbook {
  const wb = new Workbook(['Optimization']);
  wb.build(() => {
    const sh = wb.sheets[0];
    REACTION_HEADS.forEach((h, c) => { sh.setInput(0, c, h); sh.setColWidth(c, REACTION_WIDTHS[c]); });
    const last = REACTION_HEADS.length - 1;
    sh.patchStyle({ r1: 0, c1: 0, r2: 0, c2: last }, { bold: true, wrap: true, borders: { bottom: { style: 'thin' } } });
    for (let r = 1; r <= 12; r++) sh.setInput(r, 0, String(r));
    sh.patchStyle({ r1: 1, c1: 0, r2: 12, c2: 0 }, { align: 'center' });
    sh.patchStyle({ r1: 1, c1: 3, r2: 12, c2: 13 }, { align: 'center' });
    sh.patchStyle({ r1: 12, c1: 0, r2: 12, c2: last }, { borders: { bottom: { style: 'thin' } } });
    sh.setInput(14, 0, 'Best yield');
    sh.setInput(14, 11, '=IF(COUNT(L2:L13)=0,"",MAX(L2:L13))');
    sh.setInput(15, 0, 'Best entry');
    sh.setInput(15, 11, '=IF(L15="","",INDEX(A2:A13,MATCH(L15,L2:L13,0)))');
    sh.patchStyle({ r1: 14, c1: 0, r2: 15, c2: 0 }, { bold: true });
    sh.patchStyle({ r1: 14, c1: 11, r2: 15, c2: 11 }, { bold: true, align: 'center' });
    sh.frozen = { rows: 1, cols: 1 };
  });
  return wb;
}

/** A reagent table (structures give MW; equivalents give amounts) and the yield worked out from it. */
function reagentSheet(): Workbook {
  const wb = new Workbook(['Reagents', 'Yield']);
  wb.build(() => {
    fillReagentTable(wb.sheets[0]);
    wb.sheets[0].frozen = { rows: 1, cols: 0 };
    const y = wb.sheets[1];
    const rows: [string, string, string?][] = [
      ['Product', ''],
      ['Product structure', ''],
      ['Product MW (g/mol)', '=IF(B2="","",MW(B2))', '0.00'],
      ['Limiting reagent (mmol)', '=Reagents!E2', '0.00'],
      ['Theoretical yield (mg)', '=IF(OR(B3="",B4=""),"",B3*B4)', '0.0'],
      ['Isolated mass (mg)', ''],
      ['Yield (%)', '=IF(OR(B6="",B5="",B5=0),"",100*B6/B5)', '0'],
    ];
    rows.forEach(([label, input, fmt], r) => {
      y.setInput(r, 0, label);
      if (input) y.setInput(r, 1, input);
      if (fmt) y.patchStyle({ r1: r, c1: 1, r2: r, c2: 1 }, { numFmt: fmt });
    });
    y.setInput(0, 2, 'Type the product\'s name in B1, draw or type its SMILES in B2, and its isolated mass in B6.');
    y.patchStyle({ r1: 0, c1: 0, r2: rows.length - 1, c2: 0 }, { bold: true });
    y.patchStyle({ r1: 6, c1: 1, r2: 6, c2: 1 }, { bold: true });
    y.setColWidth(0, 170);
    y.setColWidth(1, 160);
  });
  return wb;
}

type Sheet = Workbook['sheets'][number];

/** A heading row in bold over a thin line, with the columns' widths; the heading row stays in view. */
function heads(sh: Sheet, row: number, names: string[], widths: number[], col = 0): void {
  names.forEach((h, c) => { sh.setInput(row, col + c, h); if (widths[c]) sh.setColWidth(col + c, widths[c]); });
  sh.patchStyle({ r1: row, c1: col, r2: row, c2: col + names.length - 1 }, { bold: true, wrap: true, borders: { bottom: { style: 'thin' } } });
}

/** Labels down column A (bold) with values or formulas beside them in B, and number formats. */
function labelled(sh: Sheet, row: number, rows: [string, string, string?][]): void {
  rows.forEach(([label, input, fmt], r) => {
    sh.setInput(row + r, 0, label);
    if (input) sh.setInput(row + r, 1, input);
    if (fmt) sh.patchStyle({ r1: row + r, c1: 1, r2: row + r, c2: 1 }, { numFmt: fmt });
  });
  sh.patchStyle({ r1: row, c1: 0, r2: row + rows.length - 1, c2: 0 }, { bold: true });
}

// ---------------------------------------------------------------- reactions

/** A substrate scope: one row per substrate, its MW from the structure, and the averages. */
function substrateScope(): Workbook {
  const wb = new Workbook(['Scope']);
  wb.build(() => {
    const sh = wb.sheets[0];
    heads(sh, 0, ['Entry', 'Substrate', 'MW (g/mol)', 'Product', 'Yield (%)', 'ee (%)', 'dr', 'Notebook', 'Notes'], [48, 150, 84, 150, 70, 60, 52, 90, 200]);
    for (let r = 1; r <= 20; r++) {
      sh.setInput(r, 0, String(r));
      sh.setInput(r, 2, `=IF(B${r + 1}="","",MW(B${r + 1}))`);
    }
    sh.patchStyle({ r1: 1, c1: 0, r2: 20, c2: 0 }, { align: 'center' });
    sh.patchStyle({ r1: 1, c1: 2, r2: 20, c2: 2 }, { numFmt: '0.00' });
    sh.patchStyle({ r1: 1, c1: 4, r2: 20, c2: 6 }, { align: 'center' });
    sh.patchStyle({ r1: 20, c1: 0, r2: 20, c2: 8 }, { borders: { bottom: { style: 'thin' } } });
    sh.setInput(22, 0, 'Average');
    sh.setInput(22, 4, '=IF(COUNT(E2:E21)=0,"",AVERAGE(E2:E21))');
    sh.setInput(22, 5, '=IF(COUNT(F2:F21)=0,"",AVERAGE(F2:F21))');
    sh.setInput(23, 0, 'Substrates');
    sh.setInput(23, 4, '=COUNT(E2:E21)');
    sh.patchStyle({ r1: 22, c1: 0, r2: 23, c2: 0 }, { bold: true });
    sh.patchStyle({ r1: 22, c1: 4, r2: 22, c2: 5 }, { numFmt: '0', bold: true, align: 'center' });
    sh.patchStyle({ r1: 23, c1: 4, r2: 23, c2: 4 }, { align: 'center' });
    sh.setInput(25, 0, 'Draw or type each substrate\'s SMILES in column B; its MW is worked out in C.');
    sh.patchStyle({ r1: 25, c1: 0, r2: 25, c2: 0 }, { italic: true, color: '#595959' });
    sh.frozen = { rows: 1, cols: 1 };
  });
  return wb;
}

/** A screening plate: the conditions in each well, and the yields in a matching grid shaded low to high. */
function plate(rows: number, cols: number): Workbook {
  const wb = new Workbook(['Plate map', 'Results']);
  wb.build(() => {
    const letters = 'ABCDEFGH';
    const [map, res] = wb.sheets;
    for (const [sh, title] of [[map, 'Conditions in each well (catalyst, ligand, solvent, base…)'], [res, 'Yield (%) in each well']] as const) {
      sh.setInput(0, 0, title);
      sh.patchStyle({ r1: 0, c1: 0, r2: 0, c2: 0 }, { bold: true });
      sh.setColWidth(0, 36);
      for (let c = 1; c <= cols; c++) { sh.setInput(1, c, String(c)); sh.setColWidth(c, sh === map ? 96 : 52); }
      for (let r = 0; r < rows; r++) sh.setInput(2 + r, 0, letters[r]);
      sh.patchStyle({ r1: 1, c1: 1, r2: 1, c2: cols }, { bold: true, align: 'center', borders: { bottom: { style: 'thin' } } });
      sh.patchStyle({ r1: 2, c1: 0, r2: 1 + rows, c2: 0 }, { bold: true, align: 'center' });
      const all = (side: 'top' | 'bottom' | 'left' | 'right') => ({ [side]: { style: 'thin' as const, color: '#bfbfbf' } });
      sh.patchStyle({ r1: 2, c1: 1, r2: 1 + rows, c2: cols }, { align: 'center', wrap: sh === map, borders: { ...all('top'), ...all('bottom'), ...all('left'), ...all('right') } });
    }
    for (let r = 0; r < rows; r++) map.setInput(2 + r, 1, r === 0 ? '[well A1]' : '');
    const grid = { r1: 2, c1: 1, r2: 1 + rows, c2: cols };
    res.condFormats = [newCondFormat([grid], { kind: 'scale', stops: [{ at: { type: 'num', value: 0 }, color: '#f8696b' }, { at: { type: 'num', value: 50 }, color: '#ffeb84' }, { at: { type: 'num', value: 100 }, color: '#63be7b' }] })];
    const col = (c: number) => String.fromCharCode(65 + c);
    const area = `B3:${col(cols)}${2 + rows}`;
    res.setInput(rows + 3, 0, 'Best');
    res.setInput(rows + 3, 1, `=IF(COUNT(${area})=0,"",MAX(${area}))`);
    res.setInput(rows + 4, 0, 'Mean');
    res.setInput(rows + 4, 1, `=IF(COUNT(${area})=0,"",AVERAGE(${area}))`);
    res.patchStyle({ r1: rows + 3, c1: 0, r2: rows + 4, c2: 0 }, { bold: true });
    res.patchStyle({ r1: rows + 3, c1: 1, r2: rows + 4, c2: 1 }, { numFmt: '0' });
  });
  return wb;
}

/** A kinetics run: concentration against time, ln[A] for a first-order fit, k and the half-life, and a chart. */
function kinetics(): Workbook {
  const wb = new Workbook(['Kinetics']);
  wb.build(() => {
    const sh = wb.sheets[0];
    heads(sh, 0, ['Time (min)', '[A] (M)', 'ln[A]'], [80, 80, 80]);
    for (let r = 1; r <= 15; r++) sh.setInput(r, 2, `=IF(B${r + 1}="","",LN(B${r + 1}))`);
    sh.patchStyle({ r1: 1, c1: 2, r2: 15, c2: 2 }, { numFmt: '0.000' });
    const at = 17;
    labelled(sh, at, [
      ['k (min⁻¹)', '=IF(COUNT(B2:B16)<2,"",-SLOPE(C2:C16,A2:A16))', '0.0000'],
      ['Half-life (min)', '=IF(B18="","",LN(2)/B18)', '0.0'],
      ['R² of ln[A] against time', '=IF(COUNT(B2:B16)<2,"",RSQ(C2:C16,A2:A16))', '0.000'],
    ]);
    sh.setColWidth(0, 170);
    sh.setInput(21, 0, 'Type times in A and concentrations (or integrals relative to a standard) in B. A straight ln[A] line (R² near 1) means first order.');
    sh.patchStyle({ r1: 21, c1: 0, r2: 21, c2: 0 }, { italic: true, color: '#595959' });
    // sample points so the chart shows its shape; type over them
    const t = [0, 5, 10, 20, 30, 45, 60], a = [0.5, 0.41, 0.335, 0.225, 0.15, 0.083, 0.045];
    t.forEach((x, i) => { sh.setInput(1 + i, 0, String(x)); sh.setInput(1 + i, 1, String(a[i])); });
    sh.frozen = { rows: 1, cols: 0 };
  });
  const sh = wb.sheets[0];
  const chart = chartFromRange(sh, { r1: 0, c1: 0, r2: 15, c2: 1 }, 'scatter');
  chart.title = 'Time course';
  chart.series[0].line = true;
  chart.series[0].marker = 'circle';
  chart.at = { row: 0, col: 4, dx: 0, dy: 0 };
  chart.w = 420;
  chart.h = 260;
  sh.charts = [chart];
  return wb;
}

// ---------------------------------------------------------------- reagents and stock

/** A chemical inventory: one row per bottle, with a filter on the headings. */
function inventory(): Workbook {
  const wb = new Workbook(['Inventory']);
  wb.build(() => {
    const sh = wb.sheets[0];
    const names = ['Name', 'Structure', 'MW (g/mol)', 'Amount', 'Unit', 'Location', 'Hazard class', 'Supplier', 'Catalog no.', 'Received', 'Opened', 'Owner', 'Notes'];
    heads(sh, 0, names, [150, 120, 80, 64, 44, 100, 110, 100, 90, 80, 80, 80, 180]);
    for (let r = 1; r <= 200; r++) sh.setInput(r, 2, `=IF(B${r + 1}="","",MW(B${r + 1}))`);
    sh.patchStyle({ r1: 1, c1: 2, r2: 200, c2: 2 }, { numFmt: '0.00' });
    sh.patchStyle({ r1: 1, c1: 9, r2: 200, c2: 10 }, { numFmt: 'yyyy-mm-dd' });
    sh.filter = { range: { r1: 0, c1: 0, r2: 200, c2: names.length - 1 }, conditions: {} };
    sh.frozen = { rows: 1, cols: 1 };
  });
  return wb;
}

/** Stock solutions: the mass of a solid, the volume of a liquid, or a stock diluted (C1V1 = C2V2). */
function stockSolution(): Workbook {
  const wb = new Workbook(['Stock solution']);
  wb.build(() => {
    const sh = wb.sheets[0];
    sh.setInput(0, 0, 'From a solid');
    labelled(sh, 1, [
      ['Compound', ''],
      ['Structure or MW', ''],
      ['MW (g/mol)', '=IF(B3="","",IF(ISNUMBER(B3),B3,MW(B3)))', '0.00'],
      ['Concentration wanted (M)', '0.1'],
      ['Volume wanted (mL)', '10'],
      ['Mass to weigh (mg)', '=IF(B4="","",B4*B5*B6)', '0.0'],
    ]);
    sh.setInput(8, 0, 'From a neat liquid');
    labelled(sh, 9, [
      ['Density (g/mL)', ''],
      ['Purity (%)', '100'],
      ['Volume to measure (µL)', '=IF(OR(B7="",B10=""),"",B7/(B10*B11/100))', '0.0'],
    ]);
    sh.setInput(13, 0, 'Diluting a stock');
    labelled(sh, 14, [
      ['Stock concentration (M)', ''],
      ['Concentration wanted (M)', ''],
      ['Final volume (mL)', ''],
      ['Stock to take (mL)', '=IF(OR(B15="",B15=0,B16="",B17=""),"",B16*B17/B15)', '0.000'],
      ['Solvent to add (mL)', '=IF(B18="","",B17-B18)', '0.000'],
    ]);
    for (const r of [0, 8, 13]) sh.patchStyle({ r1: r, c1: 0, r2: r, c2: 1 }, { bold: true, size: 12, borders: { bottom: { style: 'thin' } } });
    for (const r of [6, 11, 17]) sh.patchStyle({ r1: r, c1: 1, r2: r, c2: 1 }, { bold: true, fill: '#e2efda' });
    sh.setColWidth(0, 190);
    sh.setColWidth(1, 150);
  });
  return wb;
}

/** Gas cylinders and solvent stills: a log for each. */
function solventLog(): Workbook {
  const wb = new Workbook(['Gas cylinders', 'Solvents']);
  wb.build(() => {
    const [gas, sol] = wb.sheets;
    heads(gas, 0, ['Date', 'Gas', 'Cylinder no.', 'Location', 'Gauge (psi)', 'Changed?', 'By', 'Notes'], [80, 80, 90, 100, 80, 70, 70, 200]);
    heads(sol, 0, ['Date', 'Solvent', 'Still or column', 'Action', 'Volume (L)', 'Water (ppm)', 'Indicator', 'By', 'Notes'], [80, 90, 110, 140, 70, 80, 90, 70, 200]);
    sol.setInput(1, 3, '[Refilled / Regenerated / Checked]');
    for (const sh of [gas, sol]) {
      sh.patchStyle({ r1: 1, c1: 0, r2: 300, c2: 0 }, { numFmt: 'yyyy-mm-dd' });
      sh.frozen = { rows: 1, cols: 0 };
    }
  });
  return wb;
}

// ---------------------------------------------------------------- analysis

/** A calibration curve: standards' peak areas against concentration, the line, and unknowns read from it. */
function calibration(): Workbook {
  const wb = new Workbook(['Calibration']);
  wb.build(() => {
    const sh = wb.sheets[0];
    sh.setInput(0, 0, 'Standards');
    heads(sh, 1, ['Concentration (mM)', 'Peak area'], [130, 100]);
    const std = [[0.5, 10450], [1, 20980], [2, 41500], [5, 104300], [10, 207900]];
    std.forEach(([c, a], i) => { sh.setInput(2 + i, 0, String(c)); sh.setInput(2 + i, 1, String(a)); });
    labelled(sh, 13, [
      ['Slope', '=IF(COUNT(B3:B12)<2,"",SLOPE(B3:B12,A3:A12))', '0.000'],
      ['Intercept', '=IF(COUNT(B3:B12)<2,"",INTERCEPT(B3:B12,A3:A12))', '0.000'],
      ['R²', '=IF(COUNT(B3:B12)<2,"",RSQ(B3:B12,A3:A12))', '0.0000'],
    ]);
    sh.setInput(0, 4, 'Unknowns');
    heads(sh, 1, ['Sample', 'Peak area', 'Concentration (mM)'], [100, 90, 130], 4);
    for (let r = 2; r <= 21; r++) sh.setInput(r, 6, `=IF(OR(F${r + 1}="",$B$14=""),"",(F${r + 1}-$B$15)/$B$14)`);
    sh.patchStyle({ r1: 2, c1: 6, r2: 21, c2: 6 }, { numFmt: '0.000' });
    for (const c of [0, 4]) sh.patchStyle({ r1: 0, c1: c, r2: 0, c2: c }, { bold: true, size: 12 });
    sh.frozen = { rows: 2, cols: 0 };
  });
  const sh = wb.sheets[0];
  const chart = chartFromRange(sh, { r1: 1, c1: 0, r2: 11, c2: 1 }, 'scatter');
  chart.title = 'Calibration';
  chart.series[0].marker = 'circle';
  chart.series[0].fit = { kind: 'linear', showEq: true, showR2: true };
  chart.at = { row: 23, col: 0, dx: 0, dy: 0 };
  chart.w = 420;
  chart.h = 260;
  sh.charts = [chart];
  return wb;
}

/** ee and er from the two enantiomers' peak areas. */
function eeFromAreas(): Workbook {
  const wb = new Workbook(['ee']);
  wb.build(() => {
    const sh = wb.sheets[0];
    heads(sh, 0, ['Sample', 'Area, first peak', 'Area, second peak', 'er (first:second)', 'ee (%)', 'Major'], [110, 110, 120, 120, 70, 70]);
    for (let r = 1; r <= 30; r++) {
      const n = r + 1, a = `B${n}`, b = `C${n}`, ok = `AND(ISNUMBER(${a}),ISNUMBER(${b}),${a}+${b}>0)`;
      sh.setInput(r, 3, `=IF(${ok},TEXT(100*${a}/(${a}+${b}),"0.0")&":"&TEXT(100*${b}/(${a}+${b}),"0.0"),"")`);
      sh.setInput(r, 4, `=IF(${ok},100*ABS(${a}-${b})/(${a}+${b}),"")`);
      sh.setInput(r, 5, `=IF(${ok},IF(${a}>=${b},"first","second"),"")`);
    }
    sh.patchStyle({ r1: 1, c1: 3, r2: 30, c2: 5 }, { align: 'center' });
    sh.patchStyle({ r1: 1, c1: 4, r2: 30, c2: 4 }, { numFmt: '0.0' });
    sh.setInput(32, 0, 'Use areas at the same wavelength, from a run where the peaks are baseline-separated; check the racemate gives 50:50.');
    sh.patchStyle({ r1: 32, c1: 0, r2: 32, c2: 0 }, { italic: true, color: '#595959' });
    sh.frozen = { rows: 1, cols: 1 };
  });
  return wb;
}

/** An NMR yield from an internal standard: mmol of product = mmol standard × (I / H) ÷ (Istd / Hstd). */
function nmrYield(): Workbook {
  const wb = new Workbook(['NMR yield']);
  wb.build(() => {
    const sh = wb.sheets[0];
    labelled(sh, 0, [
      ['Internal standard', '1,3,5-Trimethoxybenzene'],
      ['Its MW (g/mol)', '168.19', '0.00'],
      ['Its mass (mg)', ''],
      ['Its protons in the integrated signal', '3'],
      ['mmol of standard', '=IF(OR(B2="",B3=""),"",B3/B2)', '0.0000'],
      ['Theoretical product (mmol)', ''],
    ]);
    heads(sh, 7, ['Sample', 'Standard integral', 'Product integral', 'Product protons', 'Product (mmol)', 'Yield (%)'], [190, 110, 110, 100, 100, 70]);
    for (let r = 8; r <= 27; r++) {
      const n = r + 1;
      sh.setInput(r, 4, `=IF(OR(B${n}="",B${n}=0,C${n}="",D${n}="",$B$5=""),"",$B$5*(C${n}/D${n})/(B${n}/$B$4))`);
      sh.setInput(r, 5, `=IF(OR(E${n}="",$B$6="",$B$6=0),"",100*E${n}/$B$6)`);
    }
    sh.patchStyle({ r1: 8, c1: 4, r2: 27, c2: 4 }, { numFmt: '0.0000' });
    sh.patchStyle({ r1: 8, c1: 5, r2: 27, c2: 5 }, { numFmt: '0', bold: true });
    sh.setInput(29, 0, 'Set the relaxation delay to at least 5 × T1 of the slowest signal, so the integrals are quantitative.');
    sh.patchStyle({ r1: 29, c1: 0, r2: 29, c2: 0 }, { italic: true, color: '#595959' });
  });
  return wb;
}

/** Titrating an organolithium against a weighed titrant (diphenylacetic acid, say): molarity = mmol ÷ mL. */
function titration(): Workbook {
  const wb = new Workbook(['Titration']);
  wb.build(() => {
    const sh = wb.sheets[0];
    labelled(sh, 0, [
      ['Reagent', '[n-BuLi in hexanes]'],
      ['Bottle and date', ''],
      ['Titrant', 'Diphenylacetic acid'],
      ['Titrant MW (g/mol)', '212.24', '0.00'],
      ['Equivalents of reagent per titrant', '1'],
    ]);
    heads(sh, 6, ['Run', 'Titrant (mg)', 'Titrant (mmol)', 'Reagent to endpoint (mL)', 'Molarity (M)'], [190, 90, 100, 150, 90]);
    for (let r = 7; r <= 11; r++) {
      const n = r + 1;
      sh.setInput(r, 0, String(r - 6));
      sh.setInput(r, 2, `=IF(B${n}="","",B${n}/$B$4)`);
      sh.setInput(r, 4, `=IF(OR(C${n}="",D${n}="",D${n}=0),"",C${n}*$B$5/D${n})`);
    }
    sh.patchStyle({ r1: 7, c1: 2, r2: 11, c2: 2 }, { numFmt: '0.0000' });
    sh.patchStyle({ r1: 7, c1: 4, r2: 11, c2: 4 }, { numFmt: '0.000' });
    labelled(sh, 13, [
      ['Average molarity (M)', '=IF(COUNT(E8:E12)=0,"",AVERAGE(E8:E12))', '0.000'],
      ['Spread (standard deviation)', '=IF(COUNT(E8:E12)<2,"",STDEV(E8:E12))', '0.000'],
    ]);
    sh.patchStyle({ r1: 13, c1: 1, r2: 13, c2: 1 }, { bold: true, fill: '#e2efda' });
  });
  return wb;
}

// ---------------------------------------------------------------- lab management

/** Orders: one row each, with a status to filter by. */
function orders(): Workbook {
  const wb = new Workbook(['Orders']);
  wb.build(() => {
    const sh = wb.sheets[0];
    const names = ['Requested', 'Requested by', 'Item', 'Supplier', 'Catalog no.', 'Qty', 'Unit price', 'Total', 'Account', 'Status', 'Ordered', 'Received', 'Notes'];
    heads(sh, 0, names, [80, 100, 180, 100, 90, 40, 76, 76, 90, 90, 80, 80, 180]);
    for (let r = 1; r <= 200; r++) sh.setInput(r, 7, `=IF(OR(F${r + 1}="",G${r + 1}=""),"",F${r + 1}*G${r + 1})`);
    sh.setInput(1, 9, 'Requested');
    sh.patchStyle({ r1: 1, c1: 6, r2: 200, c2: 7 }, { numFmt: '$#,##0.00' });
    sh.patchStyle({ r1: 1, c1: 0, r2: 200, c2: 0 }, { numFmt: 'yyyy-mm-dd' });
    sh.patchStyle({ r1: 1, c1: 10, r2: 200, c2: 11 }, { numFmt: 'yyyy-mm-dd' });
    sh.condFormats = [
      newCondFormat([{ r1: 1, c1: 9, r2: 200, c2: 9 }], { kind: 'text', op: 'begins', text: 'Received', look: { color: '#375623', fill: '#e2efda' } }),
      newCondFormat([{ r1: 1, c1: 9, r2: 200, c2: 9 }], { kind: 'text', op: 'begins', text: 'Backordered', look: { color: '#9c0006', fill: '#ffc7ce' } }),
    ];
    sh.setInput(0, 14, 'Status: Requested, Ordered, Backordered, Received');
    sh.patchStyle({ r1: 0, c1: 14, r2: 0, c2: 14 }, { italic: true, color: '#595959' });
    sh.frozen = { rows: 1, cols: 0 };
  });
  return wb;
}

/** A week of instrument slots: write your name in a slot. */
function booking(): Workbook {
  const wb = new Workbook(['Booking']);
  wb.build(() => {
    const sh = wb.sheets[0];
    sh.setInput(0, 0, 'Instrument');
    sh.setInput(0, 1, '[NMR 400 / HPLC / GC-MS / glove box]');
    sh.setInput(1, 0, 'Week of');
    sh.setInput(1, 1, '=TODAY()-WEEKDAY(TODAY(),3)');
    sh.patchStyle({ r1: 1, c1: 1, r2: 1, c2: 1 }, { numFmt: 'yyyy-mm-dd', align: 'left' });
    sh.patchStyle({ r1: 0, c1: 0, r2: 1, c2: 0 }, { bold: true });
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    heads(sh, 3, ['Time', ...days], [60, 100, 100, 100, 100, 100, 100, 100]);
    for (let h = 8; h <= 20; h++) sh.setInput(4 + h - 8, 0, `${String(h).padStart(2, '0')}:00`);
    sh.setInput(17, 0, 'Overnight');
    const grid = { r1: 4, c1: 1, r2: 17, c2: 7 };
    const line = { style: 'thin' as const, color: '#bfbfbf' };
    sh.patchStyle(grid, { borders: { top: line, bottom: line, left: line, right: line } });
    sh.patchStyle({ r1: 4, c1: 0, r2: 17, c2: 0 }, { bold: true });
    sh.condFormats = [newCondFormat([grid], { kind: 'blank', not: true, look: { fill: '#ddebf7' } })];
    sh.frozen = { rows: 4, cols: 1 };
  });
  return wb;
}

/** Group duties week by week. */
function rota(): Workbook {
  const wb = new Workbook(['Rota']);
  wb.build(() => {
    const sh = wb.sheets[0];
    const duties = ['Solvent system', 'Waste', 'Glassware and oven', 'NMR tubes', 'Gas cylinders', 'Orders', 'Group meeting snacks'];
    heads(sh, 0, ['Week of', ...duties], [90, ...duties.map(() => 110)]);
    sh.setInput(1, 0, '=TODAY()-WEEKDAY(TODAY(),3)');
    for (let r = 2; r <= 26; r++) sh.setInput(r, 0, `=A${r}+7`);
    sh.patchStyle({ r1: 1, c1: 0, r2: 26, c2: 0 }, { numFmt: 'yyyy-mm-dd', bold: true });
    sh.condFormats = [newCondFormat([{ r1: 1, c1: 0, r2: 26, c2: duties.length }], { kind: 'formula', formula: '=AND($A2<=TODAY(),TODAY()<$A2+7)', look: { fill: '#fff2cc' } })];
    sh.setInput(28, 0, 'Names');
    sh.setInput(28, 1, '[List the group here, then fill the weeks]');
    sh.patchStyle({ r1: 28, c1: 0, r2: 28, c2: 0 }, { bold: true });
    sh.frozen = { rows: 1, cols: 1 };
  });
  return wb;
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  { id: 'reaction-table', category: 'reactions', name: 'Reaction table', blurb: 'Optimization entries: catalyst, loading, solvent, temperature, time, conversion, yield, ee and dr, with the best entry found for you.', make: reactionTable },
  { id: 'substrate-scope', category: 'reactions', name: 'Substrate scope table', blurb: 'One row per substrate: structure, MW worked out, product, yield, ee and dr, with the averages below.', make: substrateScope },
  { id: 'plate-24', category: 'reactions', name: '24-well screening plate', blurb: 'A 4 × 6 plate map of conditions and a matching grid of yields shaded from low to high.', make: () => plate(4, 6) },
  { id: 'plate-96', category: 'reactions', name: '96-well screening plate', blurb: 'An 8 × 12 plate map of conditions and a matching grid of yields shaded from low to high.', make: () => plate(8, 12) },
  { id: 'kinetics', category: 'reactions', name: 'Kinetics time course', blurb: 'Time, concentration and ln[A], a chart of the time course, and the first-order rate constant and half-life.', make: kinetics },
  { id: 'reagent-sheet', category: 'stock', name: 'Reagent sheet', blurb: 'MW from each structure, amounts from equivalents, masses and volumes, and the percent yield from the isolated mass.', make: reagentSheet },
  { id: 'inventory', category: 'stock', name: 'Chemical inventory', blurb: 'Structure, MW, amount, location, hazard class, supplier, and dates received and opened, with a filter.', make: inventory },
  { id: 'stock-solution', category: 'stock', name: 'Stock solution calculator', blurb: 'The mass to weigh for a concentration and volume, the volume of a neat liquid, or a stock to dilute.', make: stockSolution },
  { id: 'solvent-log', category: 'stock', name: 'Gas cylinder and solvent still log', blurb: 'Cylinders: gauge pressure and changes. Stills and solvent systems: refills, regeneration and water checks.', make: solventLog },
  { id: 'calibration', category: 'analysis', name: 'HPLC/GC calibration curve', blurb: 'Standards against peak area, the fitted line with R², and unknowns worked out from it.', make: calibration },
  { id: 'ee-areas', category: 'analysis', name: 'ee and er from HPLC peak areas', blurb: 'The two enantiomers\' peak areas give er, ee and the major enantiomer for each sample.', make: eeFromAreas },
  { id: 'nmr-yield', category: 'analysis', name: 'NMR yield with an internal standard', blurb: 'From the standard\'s mass and protons and the integrals: the product in mmol and the yield.', make: nmrYield },
  { id: 'titration', category: 'analysis', name: 'Titration (organolithium)', blurb: 'Titrant mass and reagent volume at the endpoint for each run, and the average molarity.', make: titration },
  { id: 'orders', category: 'lab', name: 'Order tracker', blurb: 'What was ordered, from whom, price, account, and status from requested to received.', make: orders },
  { id: 'booking', category: 'lab', name: 'Instrument booking', blurb: 'A week of hourly slots for one instrument, to write your name in.', make: booking },
  { id: 'rota', category: 'lab', name: 'Group duties rota', blurb: 'Weekly duties (solvent system, waste, glassware, NMR tubes) with this week picked out.', make: rota },
];
