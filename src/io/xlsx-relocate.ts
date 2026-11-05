// Finding this program's own data in an Excel file again after Excel moved the cells about.
//
// What only this program reads (structures, property columns, chemistry formulas) is kept in a
// custom XML part, by row and column (see xlsx.ts). Excel never changes that part, but inserting,
// deleting or sorting rows and columns there moves the cells it describes. Two things find them:
//
// - A hidden name for each sheet (_ChemIllustrator_Grid) lists the columns and rows the part
//   points at, as whole columns and rows (B:B, 5:5). Excel moves a name's references when rows
//   and columns are put in or taken out, as it does a formula's (ECMA-376 Part 1, 18.2.5), and
//   leaves them when sorting, so the name says where each of those columns and rows is now.
// - Each cell is then looked for by what was saved in it: where it should be now, under its
//   picture (a structure's, which Excel moves with its cell), or after a sort by the same value
//   in its column (a structure's SMILES, a property column's numbers).

import { Sheet, Filter, Condition, makeStructure, type CellStyle } from '../sheet/workbook';
import { cellName, colName, colOf, keyOf, quoteSheet, rowOf, MAX_COLS, MAX_ROWS } from '../sheet/refs';
import { formulaRefs, mapRefs, type RefToken } from '../sheet/formula';
import type { CellRef } from '../sheet/refs';
import { isCard } from '../sheet/compound';
import { xml } from './ooxml';
import type { ModelSheet, Wrote } from './xlsx';

/** The hidden name, one for each sheet (scoped to it), listing the columns and rows its part points at. */
export const GRID_NAME = '_ChemIllustrator_Grid';

/** The columns and rows a sheet's part points at, in the order the hidden name lists them (columns first). */
export interface Grid { cols: number[]; rows: number[] }

/** A name's formula Excel takes at most this long (Excel's specifications and limits). */
const MAX_NAME_FORMULA = 8000;

const onSheet = (r: RefToken, sheet: string) => !r.sheet || r.sheet.toLowerCase() === sheet.toLowerCase();

/** The columns and rows a sheet's part points at (null when it points at none). */
export function gridOf(ms: ModelSheet, sheet: string): Grid | null {
  const cols = new Set<number>(), rows = new Set<number>();
  const refsOf = (formula: string) => {
    for (const r of formulaRefs(formula)) {
      if (!onSheet(r, sheet) || r.broken) continue;
      for (const c of [r.a, r.b]) {
        if (!c) continue;
        cols.add(c.col);
        if (c.absRow && r.kind !== 'cols') rows.add(c.row);
      }
    }
  };
  for (const { col, def } of ms.defs) {
    cols.add(col);
    rows.add(def.firstRow);
    if (def.firstRow > 0) rows.add(def.firstRow - 1);
    refsOf(def.formula);
  }
  for (const m of ms.cells) {
    cols.add(m.c);
    if (m.formula) refsOf(m.formula);
  }
  for (const c of ms.chemCols) cols.add(c);
  if (ms.filter) {
    rows.add(ms.filter.range.r1);
    cols.add(ms.filter.range.c1);
    cols.add(ms.filter.range.c2);
    for (const c of Object.keys(ms.filter.conditions)) cols.add(Number(c));
  }
  const grid = { cols: [...cols].sort((a, b) => a - b), rows: [...rows].sort((a, b) => a - b) };
  // within what a name's formula can hold: rows go first, then columns, from the far end
  const q = quoteSheet(sheet);
  let len = grid.cols.reduce((n, c) => n + q.length + 2 * colName(c).length + 5, 0) + grid.rows.reduce((n, r) => n + q.length + 2 * String(r + 1).length + 5, 0);
  while (len > MAX_NAME_FORMULA && (grid.rows.length || grid.cols.length)) {
    if (grid.rows.length) { const r = grid.rows.pop()!; len -= q.length + 2 * String(r + 1).length + 5; }
    else { const c = grid.cols.pop()!; len -= q.length + 2 * colName(c).length + 5; }
  }
  return grid.cols.length || grid.rows.length ? grid : null;
}

/** The hidden name holding a sheet's grid, for the workbook's definedNames (`si` is the sheet's place in the list). */
export function gridNameXml(grid: Grid, sheet: string, si: number): string {
  const q = quoteSheet(sheet);
  const areas = [...grid.cols.map((c) => `${q}!$${colName(c)}:$${colName(c)}`), ...grid.rows.map((r) => `${q}!$${r + 1}:$${r + 1}`)];
  return `<definedName name="${GRID_NAME}" localSheetId="${si}" hidden="1">${xml(areas.join(','))}</definedName>`;
}

/** Where a sheet's columns and rows are now: null for one Excel took out. */
export interface Mover {
  row(r: number): number | null;
  col(c: number): number | null;
}

export const STILL: Mover = { row: (r) => r, col: (c) => c };

/** A map from where some rows (or columns) were to where they are now, guessing the rest from the nearest one before them. */
function axisMap(pairs: Map<number, number | null>, max: number): (i: number) => number | null {
  const known = [...pairs].filter((p): p is [number, number] => p[1] !== null).sort((a, b) => a[0] - b[0]);
  return (i) => {
    if (pairs.has(i)) return pairs.get(i)!;
    let near: [number, number] | undefined;
    for (const p of known) { if (p[0] <= i) near = p; else break; }
    // before the first one, the way it moved (most often rows put in above a table)
    near ??= known[0];
    const to = near ? i + near[1] - near[0] : i;
    return to < 0 || to >= max ? null : to;
  };
}

/**
 * Where the grid's columns and rows are now, from the hidden name's formula as the file has it
 * (B:B, 5:5, or #REF! for one taken out). STILL when the name doesn't list as many as the grid.
 */
export function readGridName(text: string | null | undefined, grid: Grid | undefined): Mover {
  if (!text || !grid) return STILL;
  const areas = text.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map((a) => a.slice(a.lastIndexOf('!') + 1).trim());
  if (areas.length !== grid.cols.length + grid.rows.length) return STILL;
  const cols = new Map<number, number | null>(), rows = new Map<number, number | null>();
  let moved = false;
  areas.forEach((a, i) => {
    const isCol = i < grid.cols.length;
    const was = isCol ? grid.cols[i] : grid.rows[i - grid.cols.length];
    const m = isCol ? /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(a) : /^\$?(\d{1,7}):\$?(\d{1,7})$/.exec(a);
    let now: number | null = null;
    if (m && m[1].toUpperCase() === m[2].toUpperCase()) now = isCol ? colNumber(m[1]) : Number(m[1]) - 1;
    (isCol ? cols : rows).set(was, now);
    if (now !== was) moved = true;
  });
  if (!moved) return STILL;
  return { row: axisMap(rows, MAX_ROWS), col: axisMap(cols, MAX_COLS) };
}

function colNumber(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/**
 * A formula of this sheet that was in one cell and is now in another, its references moved as
 * Excel moved the cells: rows relative to the cell go with it, columns and fixed rows go where
 * the grid says. Null when a cell it points at was taken out. References to other sheets stay.
 */
export function moveFormula(text: string, sheet: string, from: { row: number; col: number }, to: { row: number; col: number }, m: Mover): string | null {
  if (m === STILL && from.row === to.row && from.col === to.col) return text;
  let lost = false;
  const move = (c: CellRef, wholeCol: boolean): CellRef => {
    const row = wholeCol ? c.row : c.absRow ? m.row(c.row) : c.row + to.row - from.row;
    const col = m.col(c.col);
    if (row === null || col === null || row < 0 || row >= MAX_ROWS) { lost = true; return c; }
    return { ...c, row, col };
  };
  const out = mapRefs(text, (r) => {
    if (!onSheet(r, sheet) || r.broken) return r;
    return { ...r, a: move(r.a, r.kind === 'cols'), ...(r.b ? { b: move(r.b, r.kind === 'cols') } : {}) };
  });
  return lost ? null : out;
}

/** A filter with its range and columns moved as the grid says (null when its columns were taken out). */
export function moveFilter(f: Filter, m: Mover): Filter | null {
  const r1 = m.row(f.range.r1), c1 = m.col(f.range.c1), c2 = m.col(f.range.c2), r2 = m.row(f.range.r2);
  if (r1 === null || c1 === null || c2 === null) return null;
  const conditions: Record<number, Condition> = {};
  for (const [c, cond] of Object.entries(f.conditions)) {
    const to = m.col(Number(c));
    if (to !== null) conditions[to] = cond;
  }
  return { range: { r1, c1, c2, r2: Math.max(r1, r2 ?? r1) }, conditions };
}

/** A value as a key for finding cells holding it (numbers to 12 significant figures, as files round them). */
const valueKey = (v: Wrote): string => (typeof v === 'number' ? 'n' + Number(v.toPrecision(12)) : typeof v + ':' + String(v));

/** What restoring a sheet's part did. */
export interface Restored {
  structures: number;
  /** Structures, calculated cells and chemistry formulas changed (or taken out) in Excel: they show what Excel saved. */
  changed: number;
}

/**
 * Put a sheet's part back on the cells Excel saved: each piece only where its cell still holds
 * what was saved, wherever Excel moved that cell. `raw` is each cell's value as the file has it;
 * `pictures` the cell each structure's picture is over now, by the cell it was saved over.
 */
export function restoreSheet(
  s: Sheet, ms: ModelSheet, raw: Map<number, Wrote>, m: Mover, pictures: Map<string, { r: number; c: number }>,
  same: (a: Wrote, b: Wrote) => boolean, hidden: string,
): Restored {
  const out: Restored = { structures: 0, changed: 0 };
  for (const col of ms.chemCols) {
    const c = m.col(col);
    if (c !== null) s.setColStyle(c, { ...s.colStyles.get(c), chem: true });
  }
  // property columns, with their formulas' references moved as Excel moved the cells
  for (const { col, def } of ms.defs) {
    // it starts under its header row, wherever that went (rows put in under the header are in the table)
    const head = def.firstRow > 0 ? m.row(def.firstRow - 1) : null;
    const c = m.col(col), first = head !== null ? head + 1 : m.row(def.firstRow);
    const formula = c === null || first === null ? null : moveFormula(def.formula, s.name, { row: def.firstRow, col }, { row: first, col: c }, m);
    if (c !== null && first !== null && formula !== null) s.setColDef(c, { ...def, firstRow: first, formula });
  }

  // where each cell is now: first where the grid says it is (or under its picture), then by its value
  const at = new Map<number, { r: number; c: number }>();
  const claimed = new Set<number>();
  const holds = (i: number, r: number, c: number) => !claimed.has(keyOf(r, c)) && same(raw.get(keyOf(r, c)) ?? null, ms.cells[i].wrote);
  const claim = (i: number, r: number, c: number) => { at.set(i, { r, c }); claimed.add(keyOf(r, c)); };
  ms.cells.forEach((x, i) => {
    const r = m.row(x.r), c = m.col(x.c);
    if (r !== null && c !== null && holds(i, r, c)) return claim(i, r, c);
    const p = x.structure ? pictures.get(cellName(x.r, x.c)) : undefined;
    if (p && holds(i, p.r, p.c)) claim(i, p.r, p.c);
  });
  const wanted = new Set(ms.cells.filter((x, i) => !at.has(i) && x.wrote !== null && x.wrote !== '').map((x) => valueKey(x.wrote)));
  if (wanted.size) {
    const byValue = new Map<string, number[]>();
    for (const [k, v] of raw) {
      if (v === null || v === '') continue;
      const key = valueKey(v);
      if (!wanted.has(key)) continue;
      const list = byValue.get(key);
      if (list) list.push(k); else byValue.set(key, [k]);
    }
    ms.cells.forEach((x, i) => {
      if (at.has(i) || x.wrote === null || x.wrote === '') return;
      const r0 = m.row(x.r) ?? x.r, c0 = m.col(x.c);
      let best: number | null = null, bestD = Infinity;
      for (const k of byValue.get(valueKey(x.wrote)) ?? []) {
        const r = rowOf(k), c = colOf(k);
        if (!holds(i, r, c)) continue;
        // in its own column; a structure's SMILES (hidden by its format) anywhere
        const inCol = c === c0;
        if (!inCol && !(x.structure && s.cell(r, c)?.style?.numFmt === hidden)) continue;
        const d = Math.abs(r - r0) + (inCol ? 0 : MAX_ROWS);
        if (d < bestD) { best = k; bestD = d; }
      }
      if (best !== null) claim(i, rowOf(best), colOf(best));
    });
  }

  const autoPx = new Set((ms.autoRows ?? []).map(([, px]) => px));
  for (const [r, px] of ms.autoRows ?? []) {
    const to = m.row(r);
    if (to !== null && s.rowHeights.get(to) === px) s.setRowHeight(to, undefined);
  }
  const structureCols = new Set<number>();
  ms.cells.forEach((x, i) => {
    const p = at.get(i);
    if (x.structure) { const c = p?.c ?? m.col(x.c); if (c !== null) structureCols.add(c); }
    if (!p) { if (x.structure || x.computed || x.formula) out.changed++; return; }
    const cur = s.cell(p.r, p.c);
    // Excel's formatting, with what it couldn't hold put back
    const style = x.fix ? tidy({ ...cur?.style, ...x.fix } as Record<string, unknown>) : cur?.style;
    if (x.structure) {
      s.setCell(p.r, p.c, { structure: makeStructure(x.structure), style });
      out.structures++;
      // a row grown to fit it here (Excel was given a set height): it keeps fitting
      const h = s.rowHeights.get(p.r);
      if (h !== undefined && autoPx.has(h)) s.setRowHeight(p.r, undefined);
    } else if (x.computed) {
      // worked out by its property column again (if that column is still there)
      if (s.colDefs.has(p.c)) s.setCell(p.r, p.c, { style });
      else out.changed++;
    } else if (x.formula) {
      const formula = moveFormula(x.formula, s.name, { row: x.r, col: x.c }, { row: p.r, col: p.c }, m);
      if (formula === null) { out.changed++; return; }
      s.setCell(p.r, p.c, { input: formula, style });
      // the array it spilled was saved as values: the formula fills those cells again
      if (x.spill) {
        for (let r = p.r; r <= p.r + x.spill[0] - x.r; r++) for (let c = p.c; c <= p.c + x.spill[1] - x.c; c++) {
          const y = s.cell(r, c);
          if ((r !== p.r || c !== p.c) && y?.input && !y.input.startsWith('=')) s.setCell(r, c, { style: y.style });
        }
      }
    } else s.setCell(p.r, p.c, { ...cur, style });
    if (x.compound && isCard(x.compound)) { const y = s.cell(p.r, p.c); s.setCell(p.r, p.c, { ...y, compound: x.compound }); }
  });
  // a structure's SMILES that couldn't be put back is shown (its cell's format hid it under the picture)
  const shown = [...s.cells].filter(([k, cell]) => !cell.structure && cell.style?.numFmt === hidden && structureCols.has(colOf(k)) && typeof raw.get(k) === 'string');
  for (const [k, cell] of shown) s.setCell(rowOf(k), colOf(k), { ...cell, style: tidy({ ...cell.style, numFmt: undefined }) });
  return out;
}

/** A style without its unset parts (undefined when nothing is set). */
export function tidy(st: Record<string, unknown>): CellStyle | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(st)) if (v !== undefined && v !== null && v !== false) out[k] = v;
  return Object.keys(out).length ? (out as CellStyle) : undefined;
}

