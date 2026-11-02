// Chemistry written properly in the Knowledge Base: formulas with subscript counts (CDCl₃, H₂O,
// Pd(PPh₃)₄), deuterated solvents as DMSO-d₆, LD₅₀, and NMR nuclei with superscript mass numbers
// (¹H, ¹³C). Only what is shown changes: the tables keep plain text, so searching "CDCl3" and
// copying a table still work as before.

import { SYMBOLS } from '../chem/elements';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sub = (d: string) => [...d].map((c) => SUB[Number(c)]).join('');
const sup = (d: string) => [...d].map((c) => SUP[Number(c)]).join('');

/** Element symbols, deuterium, and the group abbreviations written inside formulas (PPh₃, Et₃N). */
const PARTS = new Set([...SYMBOLS.filter(Boolean), 'D', 'Me', 'Et', 'Ph', 'Bu', 'Bn', 'Cy', 'Tf', 'Ms', 'Ac', 'Ts', 'Pr']);
/** One-element formulas worth writing with a subscript (N₂, Br₂); other lone ones are labels (C2, H3, S1). */
const LONE = new Set(['H2', 'D2', 'N2', 'O2', 'O3', 'F2', 'Cl2', 'Br2', 'I2', 'S8', 'P4']);
/** Look like formulas, aren't. */
const NOT = new Set(['SN1', 'SN2', 'E1', 'E2', 'SE2', 'SEAr', 'SNAr']);

/** Is this word a formula: element symbols (and groups) with counts, at least one of them, none over 99? */
function isFormula(word: string): boolean {
  if (NOT.has(word) || !/\d/.test(word) || /\d{3}/.test(word)) return false;
  if (LONE.has(word)) return true;
  const flat = word.replace(/[()[\]]/g, '');
  let i = 0, parts = 0;
  while (i < flat.length) {
    if (/\d/.test(flat[i])) {
      if (i === 0) return false;
      while (i < flat.length && /\d/.test(flat[i])) i++;
      continue;
    }
    const two = flat.slice(i, i + 2), one = flat[i];
    if (/^[A-Z][a-z]$/.test(two) && PARTS.has(two)) { i += 2; parts++; continue; }
    if (/^[A-Z]$/.test(one) && PARTS.has(one)) { i += 1; parts++; continue; }
    return false;
  }
  return parts >= 2;
}

/** A formula's counts as subscripts: the digits after a symbol or a closing bracket. */
function subscripted(word: string): string {
  return word.replace(/([A-Za-z)\]])(\d+)/g, (_, a: string, d: string) => a + sub(d));
}

/**
 * Text with its formulas written properly. `nuclei` also writes a bare nucleus (1H, 13C) with a
 * superscript mass number: for headings and Nucleus columns, where "2H" can't mean two protons.
 */
export function prettyChem(text: string, nuclei = false): string {
  let s = text
    // LD50, LC50, IC50, ED50
    .replace(/\b(LD|LC|IC|ED|EC)50\b/g, (_, a: string) => a + sub('50'))
    // DMSO-d6, acetone-d6, THF-d8
    .replace(/([A-Za-z)])-d(\d{1,2})\b/g, (_, a: string, d: string) => `${a}-d${sub(d)}`)
    // formulas: a word of symbols and counts, standing alone
    .replace(/(^|[^A-Za-z0-9])([A-Z(\[][A-Za-z0-9()[\]]*[A-Za-z0-9)\]])(?![A-Za-z0-9])/g, (all, pre: string, w: string) => (isFormula(w) ? pre + subscripted(w) : all));
  // nuclei: always when followed by NMR, and anywhere in a heading
  const nucleus = /(^|[^A-Za-z0-9.,])(1|2|3|6|7|10|11|13|14|15|17|19|23|27|29|31|33|35|77|103|109|113|119|125|129|183|195|199|205|207)(H|Li|B|C|N|O|F|Na|Al|Si|P|S|Cl|Se|Rh|Ag|Cd|Sn|Te|Xe|W|Pt|Hg|Tl|Pb)(?![a-z0-9])/g;
  s = nuclei
    ? s.replace(nucleus, (_, pre: string, m: string, el: string) => pre + sup(m) + el)
    : s.replace(new RegExp(nucleus.source + '(?=[ -]?(?:NMR|\\{))', 'g'), (_, pre: string, m: string, el: string) => pre + sup(m) + el);
  return s;
}
