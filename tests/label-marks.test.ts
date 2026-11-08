// @vitest-environment jsdom
// Atom labels with characters raised or lowered by hand, and R numbers raised by themselves:
// how they are laid out, and how they go to and come back from CDXML.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { labelPieces, labelLook, labelPrefs, markPieces } from '../src/chem/labels';
import { writeCdxml, labelRuns } from '../src/io/cdxml-write';
import { readCdxml, labelLookOf } from '../src/io/cdxml';

const shown = (label: string, supDigits = false, marks?: string) =>
  labelPieces(label, supDigits, marks).map((p) => (p.sup ? `^${p.text}` : p.sub ? `_${p.text}` : p.text)).join('|');

function labelled(label: string, extra = {}): { doc: Doc; id: number } {
  const doc = new Doc();
  let id = 0;
  doc.edit('build', () => { const a = doc.addAtom(100, 100, 6, { label, ...extra }); id = a.id; doc.addBond(id, doc.addAtom(114, 100, 6).id, 1); });
  return { doc, id };
}

describe('label marks', () => {
  it('lowers counts and raises charges by themselves (and an R group\'s number, by the setting)', () => {
    expect(shown('CH2CO2R1')).toBe('C|H|_2|C|O|_2|R|^1');
  });

  it('raises, lowers or keeps on the line the marked characters', () => {
    expect(shown('CH2CO2R1', false, '...^^...')).toBe('C|H|_2|^C|^O|_2|R|^1');
    expect(shown('CH2CO2R1', false, '...^^..=')).toBe('C|H|_2|^C|^O|_2|R|1');
    expect(shown('CH2', false, '..=')).toBe('C|H|2');
    expect(shown('Rx', false, '._')).toBe('R|_x');
  });

  it('joins neighbouring characters that sit the same way', () => {
    expect(markPieces([{ text: 'abc', at: 0 }], '^^.')).toEqual([{ text: 'ab', at: 0, sup: true }, { text: 'c', at: 2 }]);
  });

  it('raises an R group\'s number wherever it is in the label by the setting, but not a count of R groups', () => {
    const up = (label: string, supDigits = false) => labelPieces(label, supDigits).filter((p) => p.sup).map((p) => p.text);
    expect(up('R1')).toEqual(['1']);
    expect(up('R12')).toEqual(['12']);
    expect(up('OR1')).toEqual(['1']);
    expect(up('CO2R1')).toEqual(['1']);
    expect(up('N(R1)2')).toEqual(['1']);
    expect(up('NR1R2')).toEqual(['1', '2']);
    expect(up('NR2')).toEqual([]);
    expect(up('PR3')).toEqual([]);
    expect(up('OR2')).toEqual(['2']);
    // the setting wins over a file that wrote R1 on the line
    expect(labelLook({ label: 'R1', supDigits: false }).supDigits).toBe(false);
    expect(up('R1', false)).toEqual(['1']);
    labelPrefs.superscriptR = false;
    try {
      expect(up('R1')).toEqual([]);
      expect(up('OR1')).toEqual([]);
      // a file's own raised digits stay raised
      expect(up('R1', true)).toEqual(['1']);
    } finally { labelPrefs.superscriptR = true; }
  });

  it('writes R numbers raised to CDXML when the label shows them so', () => {
    expect(labelRuns('CO2R1', { supDigits: false })).toEqual([{ text: 'CO2R', formula: true }, { text: '1', sup: true }]);
    labelPrefs.superscriptR = false;
    try { expect(labelRuns('CO2R1', { supDigits: false })).toEqual([{ text: 'CO2R1', formula: true }]); } finally { labelPrefs.superscriptR = true; }
  });
});

describe('label marks in CDXML', () => {
  it('writes marked characters as raised or lowered runs and reads them back', () => {
    expect(labelRuns('CH2CO2R1', { supDigits: false, marks: '...^^...' })).toEqual([{ text: 'CH2', formula: true }, { text: 'CO', sup: true }, { text: '2R', formula: true }, { text: '1', sup: true }]);
    const { doc, id } = labelled('CH2CO2R1', { labelMarks: '...^^...' });
    const xml = writeCdxml(doc);
    expect(xml).toContain('face="64">CO</s>');
    const back = readCdxml(xml).doc;
    const a = [...back.atoms.values()].find((x) => x.label === 'CH2CO2R1')!;
    expect(a.labelMarks).toBe('...^^...');
    expect(id).toBeGreaterThan(0);
  });

  it('writes R1 with its number raised, and keeps a file\'s lowered R1 lowered', () => {
    const xml = writeCdxml(labelled('R1').doc);
    expect(xml).toMatch(/face="96">R<\/s><s [^>]*face="64">1<\/s>/);
    expect(readCdxml(xml).doc.atoms.values().next().value!.supDigits).toBe(true);
    expect(labelLookOf([{ text: 'R1', formula: true }], 'R1')).toEqual({ supDigits: false });
    expect(labelLookOf([{ text: 'R' }, { text: '1', sup: true }], 'R1')).toEqual({ supDigits: true });
  });
});
