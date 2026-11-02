// @vitest-environment jsdom
// The alkyl look of Settings ▸ Preferences: the n-, i-, s- and t- of tBu, iPr, nBu… with or
// without a dash and in italics or not, given to labels and text as they are typed, to what is
// already in a drawing when asked, and kept through CDXML.

import { afterEach, describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { alkylPrefs, labelPieces, styleLabel, type AlkylLook } from '../src/chem/labels';
import { labelRuns, writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { alkylEdits } from '../src/text/typing';
import { restyleAlkyl, restyleRuns } from '../src/text/alkyl-restyle';
import { formulaDigits } from '../src/text/chemtext';

afterEach(() => { alkylPrefs.look = 'typed'; });

/** A label in a look, as shown: italic letters as /x/, counts as _n. */
const shown = (label: string, look: AlkylLook) => {
  const r = styleLabel(label, undefined, look);
  return labelPieces(r.label, false, r.marks).map((p) => (p.italic ? `/${p.text}/` : p.sub ? `_${p.text}` : p.text)).join('');
};

describe('alkyl look of labels', () => {
  it('leaves labels as typed by default', () => {
    expect(styleLabel('OtBu')).toEqual({ label: 'OtBu' });
    expect(shown('P(t-Bu)2', 'typed')).toBe('P(t-Bu)_2');
  });

  it('puts the prefix in italics wherever the group is', () => {
    expect(shown('OtBu', 'italic')).toBe('O/t/Bu');
    expect(shown('N(iPr)2', 'italic')).toBe('N(/i/Pr)_2');
    expect(shown('Si(iPr)3', 'italic')).toBe('Si(/i/Pr)_3');
    expect(shown('t-Bu', 'italic')).toBe('/t/Bu');
    // not the s of a silyl group or the t of a tosyl group
    expect(shown('TBS', 'italic')).toBe('TBS');
    expect(shown('Ts', 'italic')).toBe('Ts');
  });

  it('adds a dash, or takes one out', () => {
    expect(shown('OtBu', 'dash')).toBe('Ot-Bu');
    expect(shown('iPr2N', 'dash')).toBe('i-Pr_2N');
    expect(shown('OtBu', 'both')).toBe('O/t/-Bu');
    expect(shown('P(t-Bu)2', 'plain')).toBe('P(tBu)_2');
    // italics come off again with an upright look
    const it = styleLabel('OtBu', undefined, 'both');
    expect(styleLabel(it.label, it.marks, 'plain')).toEqual({ label: 'OtBu' });
  });

  it('keeps marks set by hand in their place', () => {
    expect(styleLabel('OtBuR1', '.....^', 'dash')).toEqual({ label: 'Ot-BuR1', marks: '......^' });
  });

  it('never makes or breaks an element symbol with the dash', () => {
    // PtBu3 is tri-tert-butylphosphine; "Pt-Bu" would read as platinum
    expect(styleLabel('PtBu3', undefined, 'both')).toEqual({ label: 'PtBu3', marks: './...' });
  });

  it('writes an italic prefix to CDXML and reads it back', () => {
    const r = styleLabel('OtBu', undefined, 'both');
    const runs = labelRuns(r.label, { supDigits: false, marks: r.marks });
    expect(runs.map((x) => x.text).join('')).toBe('Ot-Bu');
    expect(runs.find((x) => x.text === 't')?.italic).toBe(true);
    const doc = new Doc();
    doc.edit('build', () => { const a = doc.addAtom(100, 100, 6, { label: r.label, labelMarks: r.marks }); doc.addBond(a.id, doc.addAtom(114, 100, 6).id, 1); });
    const xml = writeCdxml(doc);
    expect(xml).toMatch(/face="98"[^>]*>t</);
    const back = [...readCdxml(xml).doc.atoms.values()].find((a) => a.label);
    expect(back?.label).toBe('Ot-Bu');
    expect(back?.labelMarks?.[1]).toBe('/');
  });
});

describe('alkyl look of text', () => {
  const apply = (word: string, look: AlkylLook) => {
    let text = word;
    const italic = new Set<number>();
    const edits = alkylEdits(word, () => false, look);
    for (const e of edits) if (e.italic) italic.add(e.start);
    for (const e of [...edits].filter((x) => x.text !== undefined).sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    return { text, italic: [...italic] };
  };

  it('does nothing as typed', () => {
    expect(alkylEdits('nBuLi', () => false)).toEqual([]);
  });

  it('formats nBuLi, KOtBu and iPr2NEt as they are typed', () => {
    expect(apply('nBuLi', 'both')).toEqual({ text: 'n-BuLi', italic: [0] });
    expect(apply('KOtBu', 'both')).toEqual({ text: 'KOt-Bu', italic: [2] });
    expect(apply('iPr', 'dash')).toEqual({ text: 'i-Pr', italic: [] });
    expect(apply('t-BuOK', 'plain').text).toBe('tBuOK');
    expect(apply('tert-butyl', 'plain').text).toBe('tert-butyl');
  });

  it('restyles text boxes, keeping the dash upright', () => {
    const runs = restyleRuns([{ text: 'nBuLi, KOtBu' }], 'both')!;
    expect(runs.map((r) => r.text).join('')).toBe('n-BuLi, KOt-Bu');
    expect(runs.filter((r) => r.italic).map((r) => r.text)).toEqual(['n', 't']);
  });

  it('counts, then changes, the labels and text already in a drawing', () => {
    const doc = new Doc();
    doc.edit('build', () => {
      const a = doc.addAtom(100, 100, 6, { label: 'OtBu' });
      doc.addBond(a.id, doc.addAtom(114, 100, 6).id, 1);
      doc.addCaption({ x: 0, y: 0, runs: [{ text: 'iPr2NEt' }], justify: 'left' });
      doc.addCaption({ x: 0, y: 40, runs: [{ text: 'THF' }], justify: 'left' });
    });
    expect(restyleAlkyl(doc, 'dash', false)).toEqual({ labels: 1, texts: 1 });
    expect([...doc.atoms.values()].find((a) => a.label)?.label).toBe('OtBu');
    restyleAlkyl(doc, 'dash', true);
    expect([...doc.atoms.values()].find((a) => a.label)?.label).toBe('Ot-Bu');
    expect([...doc.captions.values()].map((c) => c.runs.map((r) => r.text).join(''))).toContain('i-Pr2NEt');
    expect(restyleAlkyl(doc, 'dash', false)).toEqual({ labels: 0, texts: 0 });
  });

  it('still reads KOt-Bu as a formula', () => {
    expect(formulaDigits('Ti(Ot-Bu)4').length).toBe(1);
  });
});
