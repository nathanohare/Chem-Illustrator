// Cell addresses as Excel writes them: columns A, B … Z, AA …, rows from 1, "$" for a part that
// stays put when a formula is copied. Inside the program rows and columns count from 0.

/** Excel's limits: 16,384 columns (A to XFD) and 1,048,576 rows. */
export const MAX_COLS = 16384;
export const MAX_ROWS = 1048576;

/** One number for a cell, for maps keyed by cell. */
export const keyOf = (row: number, col: number): number => row * MAX_COLS + col;
export const rowOf = (key: number): number => Math.floor(key / MAX_COLS);
export const colOf = (key: number): number => key % MAX_COLS;

/** Column 0 → "A", 26 → "AA". */
export function colName(col: number): string {
  let s = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "A" → 0, "aa" → 26; −1 when not a column name. */
export function colIndex(name: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(name)) return -1;
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1 < MAX_COLS ? n - 1 : -1;
}

/** "B3" for row 2, column 1. */
export const cellName = (row: number, col: number): string => `${colName(col)}${row + 1}`;

/** A cell in a formula: where it is, and which parts are fixed with "$". */
export interface CellRef {
  row: number;
  col: number;
  absRow: boolean;
  absCol: boolean;
}

/** A block of cells, corners included (r1 ≤ r2, c1 ≤ c2). */
export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** "$B$3" → a reference; null when not a cell address. */
export function parseCellRef(s: string): CellRef | null {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})$/.exec(s);
  if (!m) return null;
  const col = colIndex(m[2]);
  const row = Number(m[4]) - 1;
  if (col < 0 || row < 0 || row >= MAX_ROWS) return null;
  return { row, col, absCol: m[1] === '$', absRow: m[3] === '$' };
}

export function formatCellRef(r: CellRef): string {
  return `${r.absCol ? '$' : ''}${colName(r.col)}${r.absRow ? '$' : ''}${r.row + 1}`;
}

/** "A1:C5" (or one cell, "B2") → a range, corners in order; null when not one. */
export function parseRange(s: string): Range | null {
  const [a, b = a] = s.split(':');
  const p = parseCellRef(a.replace(/\$/g, '')), q = parseCellRef(b.replace(/\$/g, ''));
  if (!p || !q) return null;
  return normRange({ r1: p.row, c1: p.col, r2: q.row, c2: q.col });
}

export function normRange(r: Range): Range {
  return { r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2) };
}

/** "A1:C5", or "B2" for a single cell. */
export function rangeName(r: Range): string {
  const a = cellName(r.r1, r.c1), b = cellName(r.r2, r.c2);
  return a === b ? a : `${a}:${b}`;
}

export const inRange = (r: Range, row: number, col: number): boolean => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;

export const rangesOverlap = (a: Range, b: Range): boolean => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

export const sameRange = (a: Range, b: Range): boolean => a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

/** Number of cells in a range. */
export const rangeSize = (r: Range): number => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);

/**
 * Why Excel would refuse a sheet name, or null when it takes it: 1 to 31 characters, none of
 * \ / ? * [ ] :, no apostrophe at the start or end, not "History" (Excel keeps it), and not the
 * name of another sheet in `others`, capitals or not.
 */
export function sheetNameProblem(name: string, others: readonly string[] = []): string | null {
  if (!name) return 'A sheet needs a name.';
  if (name.length > 31) return 'A sheet name can be at most 31 characters long.';
  if (/[\\/?*[\]:]/.test(name)) return 'A sheet name can\'t hold any of \\ / ? * [ ] :';
  if (/^'|'$/.test(name)) return 'A sheet name can\'t start or end with an apostrophe.';
  if (name.toLowerCase() === 'history') return 'Excel keeps the sheet name "History" for itself.';
  if (others.some((o) => o.toLowerCase() === name.toLowerCase())) return `There is already a sheet called "${name}".`;
  return null;
}

/** A sheet name Excel takes, made from any text (see sheetNameProblem): "Name (2)" when `others` has it already. */
export function fixSheetName(name: string, others: readonly string[] = []): string {
  const cut = (t: string, room = 31) => t.slice(0, room).replace(/^'+|'+$/g, '');
  let b = cut(name.replace(/[\\/?*[\]:]/g, '_')) || 'Sheet1';
  if (b.toLowerCase() === 'history') b += '_';
  if (!sheetNameProblem(b, others)) return b;
  for (let n = 2; ; n++) {
    const t = `${cut(b, 31 - String(n).length - 3)} (${n})`;
    if (!sheetNameProblem(t, others)) return t;
  }
}

/** A sheet name as a formula writes it: quoted when it has spaces or other characters. */
export function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !parseCellRef(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
