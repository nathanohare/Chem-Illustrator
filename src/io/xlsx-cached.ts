// The values Excel saved for formulas this program can't work out (a function it lacks, a 3D or
// table reference): each is kept from the file read, and written back as its formula's value
// while the formula and the cells it reads are as they were. Excel works every formula out
// again on opening, but previews, phone viewers and scripts show the saved value (ECMA-376
// part 1, 18.3.1.96: a cell's v is its last calculated value), and would otherwise see this
// program's #NAME? where Excel had a number.

import type { Sheet, Workbook, Cell } from '../sheet/workbook';
import { CellError, isError, type Value } from '../sheet/values';
import { formulaRefs, tokenize, type RefToken } from '../sheet/formula';
import { keyOf, rowOf, colOf, MAX_ROWS } from '../sheet/refs';

/** A formula cell's value as the file had it (an error by its code). */
export interface FileValue {
  v: number | string | boolean;
  error?: boolean;
}

interface Kept {
  value: Value;
  /** What the cells the formula reads held when the file was read (null: its references can't be read here). */
  sig: number | null;
}

/** Kept values by the cell they belong to: an edited cell is a new one, and has none. */
const kept = new WeakMap<Cell, Kept>();
/** For formulas whose references can't be read here: every cell's input when the file was read. */
const bookSigs = new WeakMap<Workbook, number>();

/** A number for a piece of text (FNV-1a). */
function hash(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const valueText = (v: Value): string =>
  v === null ? '' : isError(v) ? `e${v.code}` : typeof v === 'string' ? `s${v}` : typeof v === 'boolean' ? `b${v}` : `n${v}`;

/** Every cell's input in the workbook, as one number. */
function inputsSig(book: Workbook): number {
  let h = 0;
  book.sheets.forEach((s, i) => {
    for (const [k, c] of s.cells) h = (h + hash(`${i}|${k}|${c.input ?? ''}|${c.structure?.id ?? ''}`)) >>> 0;
  });
  return h;
}

/** The references a formula reads, with those of the names it uses (null when it can't be read here). */
function refsOf(book: Workbook, text: string, depth = 0): RefToken[] | null {
  let toks;
  try { toks = tokenize(text.startsWith('=') ? text.slice(1) : text); } catch { return null; }
  const refs = formulaRefs(text);
  for (const t of toks) {
    if (t.t !== 'name' && t.t !== 'fn') continue;
    // (what INDIRECT and OFFSET read is worked out, not written in the formula)
    if (t.t === 'fn' && (t.v === 'INDIRECT' || t.v === 'OFFSET')) return null;
    const n = book.names.find((x) => x.name.toLowerCase() === t.v.toLowerCase());
    if (!n) continue;
    const more = depth < 4 ? refsOf(book, n.formula, depth + 1) : null;
    if (!more) return null;
    refs.push(...more);
  }
  return refs;
}

/** What the cells a formula reads hold now, as one number; and the formula cells with kept values among them. */
class Reader {
  private ranges = new Map<string, number>();
  constructor(private book: Workbook) {}

  sig(s: Sheet, refs: RefToken[], keptIn?: (s: Sheet, r1: number, c1: number, r2: number, c2: number) => void): number {
    let h = 0;
    for (const r of refs) {
      const sheet = r.sheet ? this.book.sheetNamed(r.sheet) : s;
      if (!sheet) { h = (h + hash(`missing ${r.sheet}`)) >>> 0; continue; }
      const b = r.b ?? r.a;
      const r1 = Math.min(r.a.row, b.row), r2 = r.kind === 'cols' ? MAX_ROWS - 1 : Math.max(r.a.row, b.row);
      const c1 = Math.min(r.a.col, b.col), c2 = Math.max(r.a.col, b.col);
      const id = `${sheet.uid}|${r1}|${c1}|${r2}|${c2}`;
      let got = this.ranges.get(id);
      if (got === undefined) {
        got = 0;
        const add = (k: number, v: Value) => { if (v !== null) got = (got! + hash(`${k}|${valueText(v)}`)) >>> 0; };
        if ((r2 - r1 + 1) * (c2 - c1 + 1) <= sheet.values.size) {
          for (let row = r1; row <= r2; row++) for (let col = c1; col <= c2; col++) { const k = keyOf(row, col); add(k, sheet.values.get(k) ?? null); }
        } else {
          for (const [k, v] of sheet.values) { const row = rowOf(k), col = colOf(k); if (row >= r1 && row <= r2 && col >= c1 && col <= c2) add(k, v); }
        }
        this.ranges.set(id, got);
      }
      h = (h + hash(`${id}|${got}`)) >>> 0;
      keptIn?.(sheet, r1, c1, r2, c2);
    }
    return h;
  }
}

/**
 * After a file is read and worked out: keep the file's value for each formula that gives an
 * error here but had another value in the file. `values` are the formula cells' values in the file.
 */
export function keepFileValues(book: Workbook, values: Map<Sheet, Map<number, FileValue>>): void {
  const reader = new Reader(book);
  let unreadable = false;
  for (const [s, list] of values) {
    for (const [k, fv] of list) {
      const cell = s.cells.get(k);
      const now = s.values.get(k);
      if (!cell?.input?.startsWith('=') || !isError(now)) continue;
      const value: Value = fv.error ? new CellError(String(fv.v)) : fv.v;
      if (isError(value) && value.code === now.code) continue;
      const refs = refsOf(book, cell.input);
      if (!refs) unreadable = true;
      kept.set(cell, { value, sig: refs ? reader.sig(s, refs) : null });
    }
  }
  if (unreadable) bookSigs.set(book, inputsSig(book));
}

/**
 * For saving: the kept value of a formula cell, while its formula and what it reads are unchanged
 * and it still gives an error here (undefined otherwise: the cell's own value is saved).
 */
export function fileValues(book: Workbook): (s: Sheet, k: number) => Value | undefined {
  const reader = new Reader(book);
  const done = new Map<Cell, boolean>();
  let bookSig: number | undefined;
  // the cells with kept values, by sheet (a kept value read by another stays only while that one does)
  let keptKeys: Map<Sheet, number[]> | null = null;
  const keptCells = () => {
    if (keptKeys) return keptKeys;
    keptKeys = new Map();
    for (const s of book.sheets) {
      const list: number[] = [];
      for (const [k, c] of s.cells) if (kept.has(c)) list.push(k);
      if (list.length) keptKeys.set(s, list);
    }
    return keptKeys;
  };
  const valid = (s: Sheet, k: number): boolean => {
    const cell = s.cells.get(k);
    const entry = cell ? kept.get(cell) : undefined;
    if (!cell || !entry) return true;
    const had = done.get(cell);
    if (had !== undefined) return had;
    // (a formula reading itself in a loop counts as unchanged while the rest of it is)
    done.set(cell, true);
    let ok: boolean;
    if (entry.sig === null) {
      bookSig ??= inputsSig(book);
      ok = bookSig === bookSigs.get(book);
    } else {
      const refs = refsOf(book, cell.input ?? '') ?? [];
      const inside: [Sheet, number][] = [];
      ok = reader.sig(s, refs, (sheet, r1, c1, r2, c2) => {
        for (const x of keptCells().get(sheet) ?? []) {
          const row = rowOf(x), col = colOf(x);
          if (row >= r1 && row <= r2 && col >= c1 && col <= c2) inside.push([sheet, x]);
        }
      }) === entry.sig;
      ok &&= inside.every(([sheet, x]) => valid(sheet, x));
    }
    done.set(cell, ok);
    return ok;
  };
  return (s, k) => {
    const cell = s.cells.get(k);
    const entry = cell ? kept.get(cell) : undefined;
    if (!entry || !isError(s.values.get(k))) return undefined;
    return valid(s, k) ? entry.value : undefined;
  };
}
