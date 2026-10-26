// Text in a cell shown as chemistry (the cell's "Chemistry" look): the numbers of C9H8O4 and
// CH2Cl2 lowered, charges and NMR nuclei raised, the d of d6-DMSO in italics. The same rules
// as typing in a caption (src/text/chemtext.ts), applied to the whole text at once.

import { typingFormats, WORD_ENDS, CharLook } from '../text/chemtext';

export interface Piece {
  text: string;
  pos: 'base' | 'sub' | 'sup';
  italic?: boolean;
}

const HILL = /^((?:[A-Z][a-z]?\d*)+)((?:\s\d+)?[+\-−])?$/;

/**
 * How far back before a word its chemistry depends on the text: a formula is at most 100
 * characters, ends at most 30 before the word that shows it to be a gas ("N2 (1 atm)"), and
 * whether it is the gas looks 50 characters before it ("under an atmosphere of N2").
 */
const REACH = 200;

/** The text split into pieces that sit on the line, below it or above it. */
export function chemPieces(text: string): Piece[] {
  const looks: CharLook[] = Array.from({ length: text.length }, () => ({ pos: 'base' as const, italic: false }));
  const hill = HILL.exec(text);
  if (hill) {
    // a formula as the FORMULA function writes it, charge and all
    for (let i = 0; i < hill[1].length; i++) if (/\d/.test(text[i])) looks[i].pos = 'sub';
    for (let i = hill[1].length; i < text.length; i++) looks[i].pos = 'sup';
  } else {
    for (let end = 1; end <= text.length; end++) {
      if (end < text.length && !WORD_ENDS.includes(text[end])) continue;
      // each word end is looked at in the text just before it (a long paragraph read from the
      // start at every word took seconds)
      let word = end;
      while (word > 0 && end - word < 1000 && !/\s/.test(text[word - 1])) word--;
      const from = Math.max(0, word - REACH);
      const part = from ? text.slice(from, end + 1) : text;
      for (const e of typingFormats(part, end - from, (i) => looks[from + i] ?? { pos: 'base', italic: false })) {
        for (let i = from + e.start; i < from + e.end; i++) {
          if (!looks[i]) continue;
          if (e.pos) looks[i].pos = e.pos;
          if (e.italic !== undefined) looks[i].italic = e.italic;
        }
      }
    }
  }
  const out: Piece[] = [];
  for (let i = 0; i < text.length; i++) {
    const l = looks[i];
    const last = out[out.length - 1];
    if (last && last.pos === l.pos && !!last.italic === l.italic) last.text += text[i];
    else out.push({ text: text[i], pos: l.pos, ...(l.italic ? { italic: true } : {}) });
  }
  return out;
}

const seen = new Map<string, boolean>();

/**
 * Is a cell shown as chemistry: when its look says so (the C₉H₈ button), or, left unset, when
 * it holds text with a formula in it (Pd(PPh3)4, 1H NMR), as a caption would show it. A cell
 * the button turned off (false), and numbers, stay plain.
 */
export function showsChem(chem: boolean | undefined, v: unknown): boolean {
  if (chem !== undefined) return chem;
  if (typeof v !== 'string' || !/[A-Za-z]/.test(v)) return false;
  let got = seen.get(v);
  if (got === undefined) {
    got = chemPieces(v).some((p) => p.pos !== 'base');
    if (seen.size > 5000) seen.clear();
    seen.set(v, got);
  }
  return got;
}

