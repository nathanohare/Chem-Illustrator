// The look set by hand on each character of an atom's label: where it sits (as the label would
// put it, raised, lowered or on the line) and whether it is in italics, bold or underlined. One
// character of the marks string per character of the label, so the marks can be sliced, padded
// and spliced along with the text. The first eight marks are the ones labels have always used
// ("." "^" "_" "=" "/" "*" "," and "!"), so older drawings read the same.

/** Where a character sits: as the label would put it (counts down, charges up), raised, lowered or on the line. */
export type MarkPos = 'auto' | 'up' | 'down' | 'line';

export interface Mark {
  pos: MarkPos;
  italic: boolean;
  bold: boolean;
  underline: boolean;
}

const POS: MarkPos[] = ['auto', 'up', 'down', 'line'];

// index = position + 4·italic + 8·bold + 16·underline
const TABLE = '.^_=/*,|BCD!EFGHIJKLMNOPQRSTUVWX';

/** A character's mark, read (anything not a mark, or none, is the plain "."). */
export function readMark(ch: string | undefined): Mark {
  const i = ch ? TABLE.indexOf(ch) : 0;
  const k = i < 0 ? 0 : i;
  return { pos: POS[k & 3], italic: !!(k & 4), bold: !!(k & 8), underline: !!(k & 16) };
}

/** The mark character for a look. */
export function writeMark(m: Partial<Mark>): string {
  const k = POS.indexOf(m.pos ?? 'auto') + (m.italic ? 4 : 0) + (m.bold ? 8 : 0) + (m.underline ? 16 : 0);
  return TABLE[k];
}

/** Whether any character is marked (a string of plain marks need not be kept). */
export function anyMarks(marks: string | undefined): boolean {
  return !!marks && [...marks].some((c) => c !== '.' && TABLE.includes(c));
}

/** Change one part of a mark, keeping the rest. */
export function withMark(ch: string | undefined, patch: Partial<Mark>): string {
  return writeMark({ ...readMark(ch), ...patch });
}

/** A Bold, Italic, Underline, Subscript or Superscript button (or Formula, which puts characters back where the label puts them). */
export type MarkToggle = 'bold' | 'italic' | 'underline' | 'sub' | 'sup' | 'formula';

/**
 * Press a toggle on characters [s, e) of the marks: on for them all, or off if every one has it
 * already (as Word's buttons do). Subscript and superscript lower or raise them, or put them back
 * where the label puts them; Formula always puts them back.
 */
export function toggleMarks(marks: string, s: number, e: number, key: MarkToggle): string {
  const span = [...marks.slice(s, e)].map(readMark);
  if (!span.length) return marks;
  let patch: Partial<Mark>;
  if (key === 'sub' || key === 'sup') {
    const want: MarkPos = key === 'sub' ? 'down' : 'up';
    patch = { pos: span.every((m) => m.pos === want) ? 'auto' : want };
  } else if (key === 'formula') patch = { pos: 'auto' };
  else patch = { [key]: !span.every((m) => m[key]) };
  return marks.slice(0, s) + span.map((m) => writeMark({ ...m, ...patch })).join('') + marks.slice(e);
}

/** The look a toggle gives what is typed next, from the look there now. */
export function toggledMark(now: Mark, key: MarkToggle): Mark {
  if (key === 'sub' || key === 'sup') {
    const want: MarkPos = key === 'sub' ? 'down' : 'up';
    return { ...now, pos: now.pos === want ? 'auto' : want };
  }
  if (key === 'formula') return { ...now, pos: 'auto' };
  return { ...now, [key]: !now[key] };
}

const TOGGLES: readonly string[] = ['bold', 'italic', 'underline', 'sub', 'sup', 'formula'];
/** Whether a text toggle is one a label's marks can hold. */
export function isMarkToggle(key: string): key is MarkToggle {
  return TOGGLES.includes(key);
}

/** A mark as a text style (for showing which of the ribbon's buttons are on). */
export function styleOfMark(m: Mark): { bold?: boolean; italic?: boolean; underline?: boolean; sub?: boolean; sup?: boolean } {
  return { ...(m.bold ? { bold: true } : {}), ...(m.italic ? { italic: true } : {}), ...(m.underline ? { underline: true } : {}), ...(m.pos === 'up' ? { sup: true } : {}), ...(m.pos === 'down' ? { sub: true } : {}) };
}
