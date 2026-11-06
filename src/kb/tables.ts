// The Knowledge Base's tables: each one a list of rows with named columns, its sources, and how
// it is searched. A search box finds rows by any text (name, CAS number, formula, note); a number
// typed alone (2.17, or "2.17 ppm") finds rows whose chemical shift columns are near it, which is
// how a stray NMR peak is looked up. Columns of a few repeated values (Solvent, Nucleus) can be
// filtered to one value.

import type { Template } from '../chem/templates';

export type Cell = string | number | null;

export interface KbColumn {
  key: string;
  label: string;
  /** Numbers: sorted as numbers, right-aligned. */
  numeric?: boolean;
  /** A chemical shift column (ppm): a number typed in the search box is matched against it. */
  shift?: '1H' | '13C';
  /** Offer a filter list of this column's values ('present': only "with one" or all). */
  filter?: boolean | 'present';
  /** Narrow column (multiplicity, units). */
  narrow?: boolean;
  /** A column of sentences: given more room. */
  prose?: boolean;
  /** Searched but not shown or copied (SMILES, a CAS number kept for searching). */
  hidden?: boolean;
  /** What the column's scale or class means and where it comes from, behind an "i" by its heading (by its filter list, for a hidden column). */
  info?: string;
  /** A picture of the row's structure (the table's `picture`), not text. */
  picture?: boolean;
}

export interface KbSource {
  label: string;
  url?: string;
}

export interface KbTable {
  id: string;
  title: string;
  /** One line under the title: what the table holds. */
  about: string;
  columns: KbColumn[];
  rows: Record<string, Cell>[];
  sources: KbSource[];
  /** Kept on this computer only (imported by the user from their own copy): never part of the program. */
  personal?: boolean;
  /** Links shown at the end of each row (the compound's PubChem page, its NIOSH entry…). */
  links?: (row: Record<string, Cell>) => KbSource[];
  /** Its rows' SMILES are RDKit's canonical form already (no need to work them out to compare). */
  canonicalSmiles?: boolean;
  /** The drawing shown in a `picture` column (a Hammett group with its attachment point). */
  picture?: (row: Record<string, Cell>) => Template | null;
  /** How big those drawings are, in pixels (48 when not given): whole molecules need more room than groups. */
  pictureSize?: number;
  /** Fit the window's width, wrapping its sentences, instead of scrolling sideways (tall rows with notes and sources). */
  fit?: boolean;
  /** Read whole, not searched: the search box and Draw… are hidden on it, and a search typed elsewhere leaves it as it is. */
  noSearch?: boolean;
  /**
   * A table of groups (substituents): Draw… starts from an attachment point (a wavy line, as its
   * `picture` column draws them) to build the group out from, and in the search the attachment
   * point is joined to this structure, by its first atom (the benzene ring the groups sit on).
   */
  drawOn?: string;
  /** The structure shown when the pointer rests on a row's name (a solvent's), when it has one. */
  structure?: (row: Record<string, Cell>) => Template | null;
  /**
   * Shown as a chart of which pairs mix instead of a list: `names` along both sides (in this
   * order), `pairs` the ones marked (two phases form). The rows stay one a name, for searching and
   * copying.
   */
  matrix?: { names: string[]; pairs: [string, string][]; mark: string; markInfo: string; other: string };
  /**
   * Shown as several tables one under another, each with its own columns: a row belongs to the
   * part named in its `part` cell. The table's own `columns` are all of them, for searching.
   */
  parts?: { key: string; title: string; columns: KbColumn[] }[];
}

/** The filter value meaning "has something in this column". */
export const PRESENT = '\u0000present';

/** How near a typed shift must be to match: 1H peaks within 0.05 ppm, 13C within 0.5 ppm. */
export const SHIFT_TOLERANCE = { '1H': 0.05, '13C': 0.5 } as const;

/** A number typed alone in the search box ("2.17", "2.17 ppm", "δ 77.2"), or null. */
export function searchedShift(q: string): number | null {
  const m = /^\s*(?:δ|delta)?\s*(-?\d+(?:\.\d+)?)\s*(?:ppm)?\s*$/i.exec(q);
  return m ? Number(m[1]) : null;
}

/** Every number in a cell: "3.76, 1.85" or "7.09 (m), 2.08 (quint)" give each shift. */
export function cellNumbers(c: Cell): number[] {
  if (c === null) return [];
  if (typeof c === 'number') return [c];
  return [...c.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** A shift cell's peaks as ranges: "3.69–3.46" is one multiplet spanning both, a lone number a point. */
export function cellShiftRanges(c: Cell): [number, number][] {
  if (c === null) return [];
  if (typeof c === 'number') return [[c, c]];
  const out: [number, number][] = [];
  for (const m of c.matchAll(/(-?\d+(?:\.\d+)?)(?:\s*–\s*(-?\d+(?:\.\d+)?))?/g)) {
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    out.push([Math.min(a, b), Math.max(a, b)]);
  }
  return out;
}

const ROW_TEXT = new WeakMap<Record<string, Cell>, string>();

/** A row's text for searching: every cell, lower case (kept, so a long table searches quickly). */
/** Rows whose SMILES is already RDKit's canonical form (the big tables, made so when built). */
export const CANONICAL_ROWS = new WeakSet<Record<string, Cell>>();

export function rowText(row: Record<string, Cell>): string {
  let s = ROW_TEXT.get(row);
  if (s === undefined) {
    s = Object.values(row).filter((v) => v !== null).join(' • ').toLowerCase();
    ROW_TEXT.set(row, s);
  }
  return s;
}

/** Is this a CAS Registry Number with a correct check digit (109-99-9)? */
export function isCas(text: string): boolean {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(text.trim());
  if (!m) return false;
  const digits = (m[1] + m[2]).split('').reverse();
  const sum = digits.reduce((s, d, i) => s + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]);
}

/** Does this look like SMILES rather than a word or number (has ring digits, bonds or brackets)? */
export function looksLikeSmiles(q: string): boolean {
  const s = q.trim();
  if (!s || /\s/.test(s) || isCas(s) || searchedShift(s) !== null) return false;
  return /[=#()[\]@]|[a-z]\d|\d[A-Za-z]/.test(s) && /^[A-Za-z0-9@+\-[\]()=#$/\\%.:*]+$/.test(s);
}

export interface RowMatch {
  row: Record<string, Cell>;
  /** For a shift search: how far the nearest shift is from the one typed (ppm). */
  off?: number;
  /** For a shift search: which nucleus's peak matched. */
  nucleus?: '1H' | '13C';
  /** For a structure search: the same compound (true) or one containing it (false). */
  same?: boolean;
}

/**
 * The rows of a table that match a search and the filters picked, in the table's order (a shift
 * search: nearest first). Words must all be found (in any column); a CAS number matches its row
 * exactly; extra SMILES the caller found equal (canonical forms) match too.
 */
export function findRows(t: KbTable, query: string, filters: Record<string, string> = {}, sameSmiles?: Set<string>): RowMatch[] {
  const rows = t.rows.filter((r) => Object.entries(filters).every(([k, v]) => !v || (v === PRESENT ? r[k] !== null && r[k] !== undefined && r[k] !== '' : String(r[k] ?? '') === v)));
  const q = query.trim();
  if (!q) return rows.map((row) => ({ row }));
  const shift = searchedShift(q);
  const shiftCols = t.columns.filter((c) => c.shift);
  if (shift !== null && shiftCols.length) {
    const out: RowMatch[] = [];
    for (const row of rows) {
      // the nearest shift, a 1H peak before a 13C one (a number under 12 is far more often a proton)
      let best: { nucleus: '1H' | '13C'; off: number } | null = null;
      for (const c of shiftCols) {
        for (const [lo, hi] of cellShiftRanges(row[c.key])) {
          const d = shift < lo ? lo - shift : shift > hi ? shift - hi : 0;
          if (d > SHIFT_TOLERANCE[c.shift!]) continue;
          if (!best || (c.shift === '1H' && best.nucleus === '13C') || (c.shift === best.nucleus && d < best.off)) best = { nucleus: c.shift!, off: d };
        }
      }
      if (best) out.push({ row, off: best.off, nucleus: best.nucleus });
    }
    return out.sort((a, b) => (a.nucleus === b.nucleus ? 0 : a.nucleus === '1H' ? -1 : 1) || a.off! - b.off!);
  }
  if (sameSmiles?.size) {
    const hit = rows.filter((r) => typeof r.smiles === 'string' && sameSmiles.has(r.smiles));
    if (hit.length) return hit.map((row) => ({ row }));
  }
  if (isCas(q) && t.columns.some((c) => c.key === 'cas')) return rows.filter((r) => r.cas === q).map((row) => ({ row }));
  const words = q.toLowerCase().split(/\s+/);
  return rows.filter((r) => { const s = rowText(r); return words.every((w) => s.includes(w)); }).map((row) => ({ row }));
}

/** The values a filter list offers for a column: each value once, in order of first appearance. */
export function filterValues(t: KbTable, key: string): string[] {
  const seen = new Set<string>();
  for (const r of t.rows) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== '') seen.add(String(v));
  }
  return [...seen];
}

/** Rows sorted by a column (numbers as numbers, blanks last). */
export function sortRows(rows: RowMatch[], col: KbColumn, down: boolean): RowMatch[] {
  const key = (m: RowMatch): number | string | null => {
    const v = m.row[col.key];
    if (v === null || v === undefined || v === '') return null;
    // "Miscible" in a solubility column sorts above every number
    if (col.numeric || col.shift) { if (/^miscible/i.test(String(v))) return Infinity; const n = cellNumbers(v)[0]; return n ?? null; }
    return String(v).toLowerCase();
  };
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return down ? -c : c;
  });
}

/** The rows as tab-separated text with a header line: to paste into a sheet, a Word table or Excel. */
export function tableTsv(t: KbTable, rows: RowMatch[]): string {
  const clean = (v: Cell) => (v === null || v === undefined ? '' : String(v).replace(/[\t\n]+/g, ' '));
  const block = (columns: KbColumn[], rs: RowMatch[]) => {
    const cols = columns.filter((c) => !c.hidden && !c.picture);
    return [cols.map((c) => c.label).join('\t'), ...rs.map((m) => cols.map((c) => clean(m.row[c.key])).join('\t'))].join('\n');
  };
  // a table in parts: each part under its title, a blank line between
  if (t.parts) return t.parts.map((p) => ({ p, rs: rows.filter((m) => m.row.part === p.key) })).filter((x) => x.rs.length).map(({ p, rs }) => `${p.title}\n${block(p.columns, rs)}`).join('\n\n');
  return block(t.columns, rows);
}

/**
 * A table typed or pasted by the user, or saved from a spreadsheet as CSV or tab-separated text:
 * the first line names the columns. Columns named like "1H", "δH", "13C" or "shift" are searched as
 * shifts; a column called Solvent, Nucleus or Kind gets a filter list.
 */
export function parseUserTable(text: string, title: string, id: string): KbTable | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = (l: string): string[] => {
    if (sep === '\t') return l.split('\t').map((s) => s.trim());
    const out: string[] = [];
    let cur = '', quoted = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (quoted) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const heads = split(lines[0]);
  if (heads.length < 2 || heads.some((h) => !h)) return null;
  const used = new Set<string>();
  const columns: KbColumn[] = heads.map((h, i) => {
    let key = h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `c${i}`;
    while (used.has(key)) key += '_';
    used.add(key);
    const c: KbColumn = { key, label: h };
    if (/^(1h|δ ?h|h shift|1h shift|1h \(ppm\))/i.test(h)) c.shift = '1H';
    else if (/^(13c|δ ?c|c shift|13c shift|13c \(ppm\))/i.test(h)) c.shift = '13C';
    else if (/shift|ppm|δ/i.test(h)) c.shift = '1H';
    if (/^(solvent|nucleus|kind|type|class|group)$/i.test(h)) c.filter = true;
    return c;
  });
  if (columns.some((c) => c.key === 'cas')) { /* searched as CAS */ }
  const rows = lines.slice(1).map((l) => {
    const cells = split(l);
    const r: Record<string, Cell> = {};
    columns.forEach((c, i) => {
      const v = cells[i] ?? '';
      r[c.key] = v === '' ? null : /^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v;
    });
    return r;
  });
  for (const c of columns) if (!c.shift && rows.every((r) => r[c.key] === null || typeof r[c.key] === 'number')) c.numeric = true;
  return { id, title, about: 'Your own table, kept on this computer.', columns, rows, sources: [{ label: 'Imported by you' }], personal: true };
}

/**
 * A group's SMILES with its one attachment point (* or [*]) joined to `on` (by `on`'s first atom,
 * or its last when the point comes first): "*C(F)(F)F" on benzene is trifluoromethylbenzene.
 * Null when the SMILES has no attachment point or more than one.
 */
export function joinAttachment(smiles: string, on: string): string | null {
  const star = /\[\d*\*(?:[@H\d+-]*)(?::\d+)?\]|\*/g;
  const found = smiles.match(star) ?? [];
  if (found.length !== 1) return null;
  // `on`'s ring closures numbered out of the way of the group's own (%91 for 1)
  const ring = on.replace(/\[[^\]]*\]|%\d\d|\d/g, (t) => (/^\d$/.test(t) ? `%9${t}` : t));
  return smiles.replace(star, ring);
}
