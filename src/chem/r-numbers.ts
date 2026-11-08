// Numbered R groups (R1, R12, CO2R1, N(R1)R2) written with the number raised: R¹, R¹², CO₂R¹.
// Settings ▸ Drawing turns it on for chemically interpreted text (atom labels and text in formula
// style) and, as a second choice, for ordinary text as it is typed.

import { elementNumber } from './elements';

/** How many groups an atom written before R groups carries besides its bond to the structure (N and P may carry three: an amine or phosphine on a metal, or an onium ion). */
const R_ROOM: Record<string, number> = { C: 3, Si: 3, Ge: 3, Sn: 3, N: 3, P: 3, As: 3, B: 2, Al: 2, Ga: 2, O: 1, S: 1, Se: 1 };

export const rNumberPrefs = {
  /** Raise R numbers in atom labels and in text in formula style. */
  superscriptR: true,
  /** Raise them in ordinary text too, as each word is finished. */
  plainText: false,
};

/**
 * The places in `text` of the digits that number an R group: the 1 of R1, OR1, CO2R1, N(R1)R2.
 * Digits after an R that follows an atom able to carry that many R groups count them instead
 * (NR2, PR3, SiR3, CHR2: the number stays a subscript); OR2 is R² (oxygen has room for one).
 * An R at the end of a word that isn't atoms is left alone.
 */
export function rNumberDigits(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/R(\d+)(?![\d.])/g)) {
    const at = m.index!;
    // the letters just before the R: none (R1, CO2R1, N(R1)2), or the atoms it hangs on (OR1, NR2, CHR2)
    const letters = /[A-Za-z]*$/.exec(text.slice(0, at))![0];
    if (letters) {
      const atoms = /^(?:[A-Z][a-z]?)+$/.test(letters) ? letters.match(/[A-Z][a-z]?/g)! : null;
      // (a word, not atoms: left alone)
      if (!atoms || atoms.some((a) => elementNumber(a) === undefined)) continue;
      const heavy = [...atoms].reverse().find((a) => a !== 'H');
      const free = (heavy === undefined ? 0 : R_ROOM[heavy] ?? 0) - atoms.filter((a) => a === 'H').length;
      // a count of R groups on that atom (NR2, PR3, SiR3, CHR2), not R²
      const n = Number(m[1]);
      if (n >= 2 && n <= free) continue;
    }
    for (let i = 0; i < m[1].length; i++) out.push(at + 1 + i);
  }
  return out;
}
