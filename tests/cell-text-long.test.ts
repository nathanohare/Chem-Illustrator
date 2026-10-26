// @vitest-environment jsdom
//
// A long text cell shown as chemistry (a pasted SI paragraph): chemPieces looked at the whole
// text again at every word end, so saving a sheet with a 16,000-character cell took about 5 s.
// Each word end is now looked at in the text just before it, with the same result.

import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/sheet/workbook';
import { writeXlsx, type XlsxPictures } from '../src/io/xlsx';
import { chemPieces, type Piece } from '../src/sheet/cell-text';
import { typingFormats, WORD_ENDS, type CharLook } from '../src/text/chemtext';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };

/** chemPieces as it was: every word end looked at in the whole text. */
function wholeText(text: string): Piece[] {
  const looks: CharLook[] = Array.from({ length: text.length }, () => ({ pos: 'base' as const, italic: false }));
  for (let end = 1; end <= text.length; end++) {
    if (end < text.length && !WORD_ENDS.includes(text[end])) continue;
    for (const e of typingFormats(text, end, (i) => looks[i] ?? { pos: 'base', italic: false })) {
      for (let i = e.start; i < e.end; i++) {
        if (!looks[i]) continue;
        if (e.pos) looks[i].pos = e.pos;
        if (e.italic !== undefined) looks[i].italic = e.italic;
      }
    }
  }
  const out: Piece[] = [];
  for (let i = 0; i < text.length; i++) {
    const l = looks[i], last = out[out.length - 1];
    if (last && last.pos === l.pos && !!last.italic === l.italic) last.text += text[i];
    else out.push({ text: text[i], pos: l.pos, ...(l.italic ? { italic: true } : {}) });
  }
  return out;
}

const PHRASES = ['1H NMR (400 MHz, CDCl3) δ 7.26 (s, 1H), ', '13C{1H} NMR (101 MHz, DMSO-d6) δ 170.1, ', 'stirred under N2 for 2 h, ', 'under an atmosphere of H2 (1 atm), ',
  'Pd(PPh3)4 (5 mol%), ', 'in d6-DMSO, ', 'washed with Na2SO4/MgSO4. ', 'N2-alkylation of 2a gave ', 'chloroform-d; ', '[Ir(cod)Cl]2 and B2pin2 (1.2 equiv), ',
  'HRMS (ESI) m/z [M+Na]+ calcd for C10H12N2ONa 199.0842; ', 'iPr2NEt, ', 'x'.repeat(130) + ',CDCl3 ', 'SN2 at C2-3 ', '', '(', ')'];

describe('a long text cell as chemistry', () => {
  it('looks the same as when the whole text was read at every word', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let k = 0; k < 12; k++) {
      let text = '';
      while (text.length < 1500) text += PHRASES[Math.floor(rand() * PHRASES.length)];
      expect(chemPieces(text), `text ${k}`).toEqual(wholeText(text));
    }
  });

  it('a 16,000-character characterisation paragraph saves quickly', async () => {
    const wb = new Workbook();
    wb.edit('x', () => wb.sheet.setInput(0, 0, 'NMR: ' + 'δ 7.26 (s, 1H), '.repeat(1000)));
    const t = performance.now();
    await writeXlsx(wb, pictures);
    // about 5 s when every word end read the text from the start
    expect(performance.now() - t).toBeLessThan(1500);
  }, 120_000);
});
