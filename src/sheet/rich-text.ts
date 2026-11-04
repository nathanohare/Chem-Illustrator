// Formatting on part of a cell's text (issue #503): a word or two bold, italic or underlined, as
// Excel keeps it when part of the text is selected while typing and made bold. The text is kept
// as runs, each with its own look on top of the cell's; only typed text has them (a formula's or
// a number's answer has one look throughout, as in Excel).

import { readTyped } from './values';

/**
 * How a run differs from the rest of its cell: bold: true on a plain cell, or bold: false for
 * a word left plain in a bold cell. Unset parts are the cell's.
 */
export interface RunLook {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text colour, "#rrggbb". */
  color?: string;
  /** Lowered or raised (Format Cells > Font > Subscript, Superscript). */
  pos?: 'sub' | 'sup';
  font?: string;
  /** Font size in points. */
  size?: number;
}

export interface TextRun extends RunLook {
  text: string;
}

/** The looks a selection can be given while typing, with a key. */
export type ToggleLook = 'bold' | 'italic' | 'underline' | 'strike';

const KEYS: (keyof RunLook)[] = ['bold', 'italic', 'underline', 'strike', 'color', 'pos', 'font', 'size'];

/** A look without its unset parts. */
export function cleanLook(l: RunLook | undefined): RunLook {
  const out: RunLook = {};
  if (!l) return out;
  for (const k of KEYS) {
    const v = l[k];
    if (v === undefined || v === null || v === '') continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const unset = (v: unknown) => (v === '' || v === null ? undefined : v);

export function sameLook(a: RunLook | undefined, b: RunLook | undefined): boolean {
  for (const k of KEYS) if (unset(a?.[k]) !== unset(b?.[k])) return false;
  return true;
}

const plain = (l: RunLook | undefined) => !l || KEYS.every((k) => unset(l[k]) === undefined);

/** A run's look over its cell's: what shows (bold where either says so, unless the run says not). */
export function lookOver<T extends { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; font?: string; size?: number }>(cell: T | undefined, run: RunLook | undefined): T & { strike?: boolean; pos?: 'sub' | 'sup' } {
  const out = { ...(cell ?? {}) } as T & { strike?: boolean; pos?: 'sub' | 'sup' };
  if (!run) return out;
  for (const k of KEYS) {
    const v = unset(run[k]);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** The text a cell shows for what was typed: without the apostrophe that keeps 0123 as text. */
export function typedText(input: string): string {
  return input.startsWith("'") ? input.slice(1) : input;
}

/** Can typing like this keep formatting on part of it? Only text does: not a formula, number, date or TRUE. */
export function canHoldRuns(input: string | undefined): boolean {
  if (!input || input.startsWith('=')) return false;
  return typeof readTyped(input).value === 'string';
}

/** A cell's runs when they still fit its text (undefined for a cell with one look throughout). */
export function runsOf(cell: { input?: string; runs?: TextRun[] } | undefined): TextRun[] | undefined {
  const runs = cell?.runs;
  if (!runs?.length || !cell?.input || !canHoldRuns(cell.input)) return undefined;
  let joined = '';
  for (const r of runs) joined += r.text;
  return joined === typedText(cell.input) ? runs : undefined;
}

/** One look for each character (UTF-16 unit) of the text. */
export function looksOf(text: string, runs: TextRun[] | undefined): RunLook[] {
  const out: RunLook[] = [];
  if (runs) for (const r of runs) { const l = cleanLook(r); for (let i = 0; i < r.text.length; i++) out.push(l); }
  while (out.length < text.length) out.push({});
  out.length = text.length;
  return out;
}

/** Runs from a look for each character: undefined when nothing differs from the cell's own look. */
export function runsFrom(text: string, looks: RunLook[]): TextRun[] | undefined {
  if (!text || looks.slice(0, text.length).every(plain)) return undefined;
  const out: TextRun[] = [];
  for (let i = 0; i < text.length; i++) {
    const l = cleanLook(looks[i]);
    const last = out[out.length - 1];
    // never split a surrogate pair between runs
    const low = i > 0 && /[\uDC00-\uDFFF]/.test(text[i]) && /[\uD800-\uDBFF]/.test(text[i - 1]);
    if (last && (low || sameLook(last, l))) last.text += text[i];
    else out.push({ ...l, text: text[i] });
  }
  return out;
}

/**
 * The looks after the text changed from `before` to `after`: what stayed keeps its look, and
 * typed characters take the look of the one before them (as in Excel), or `typing` when set
 * (Bold pressed with nothing selected, then typing).
 */
export function spliceLooks(before: string, after: string, looks: RunLook[], typing?: RunLook | null): RunLook[] {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const added = after.length - p - s;
  const like = typing ?? looks[p - 1] ?? looks[p + (before.length - p - s)] ?? {};
  return [...looks.slice(0, p), ...Array.from({ length: added }, () => ({ ...like })), ...looks.slice(before.length - s)];
}

/**
 * Turn a look on for the characters from `start` to `end`, or off when all of them have it
 * (`base`: whether the cell itself has it, as a bold cell does).
 */
export function toggleLooks(looks: RunLook[], start: number, end: number, key: ToggleLook, base = false): RunLook[] {
  const on = !looks.slice(start, end).every((l) => l[key] ?? base);
  return looks.map((l, i) => (i >= start && i < end ? cleanLook({ ...l, [key]: on === base ? undefined : on }) : l));
}

/** The look Bold, Italic… give what is typed next, when pressed with nothing selected. */
export function toggledLook(look: RunLook, key: ToggleLook, base = false): RunLook {
  const on = !(look[key] ?? base);
  return cleanLook({ ...look, [key]: on === base ? undefined : on });
}

/** The runs written over a cell's typed text (without its leading apostrophe), from the typing box's looks. */
export function runsForInput(input: string, looks: RunLook[]): TextRun[] | undefined {
  if (!canHoldRuns(input)) return undefined;
  const skip = input.startsWith("'") ? 1 : 0;
  return runsFrom(input.slice(skip), looks.slice(skip));
}

/** The typing box's looks for a cell's typed text (the apostrophe, if any, plain). */
export function looksForInput(input: string, runs: TextRun[] | undefined): RunLook[] {
  const skip = input.startsWith("'") ? 1 : 0;
  return [...(skip ? [{}] : []), ...looksOf(input.slice(skip), runs)];
}

export function sameRuns(a: TextRun[] | undefined, b: TextRun[] | undefined): boolean {
  if (!a?.length || !b?.length) return !a?.length && !b?.length;
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.text === b[i].text && sameLook(r, b[i]));
}
