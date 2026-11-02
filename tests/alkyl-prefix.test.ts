// @vitest-environment jsdom
// The alkyl prefix style of Settings ▸ Preferences: the n-, i-, s- and t- of tBu, iPr, nBu… in
// italics, with a dash put in or taken out, in atom labels, CDXML and text typed in a box.

import { afterEach, describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { alkylPrefs, alkylShown, labelPieces } from '../src/chem/labels';
import { labelRuns, writeCdxml } from '../src/io/cdxml-write';
import { alkylEdits } from '../src/text/typing';
import { formulaDigits } from '../src/text/chemtext';

const set = (italic: boolean, dash: boolean | null) => Object.assign(alkylPrefs, { italic, dash });
afterEach(() => set(false, null));

/** A label as shown: italic letters as /x/. */
const shown = (label: string) => labelPieces(label, false).map((p) => (p.italic ? `/${p.text}/` : p.sub ? `_${p.text}` : p.text)).join('');

describe('alkyl prefixes in labels', () => {
  it('leaves labels alone with the style off', () => {
    expect(shown('OtBu')).toBe('OtBu');
    expect(shown('P(t-Bu)2')).toBe('P(t-Bu)_2');
    expect(alkylShown('OtBu')).toBeNull();
  });

  it('puts the prefix in italics wherever the group is', () => {
    set(true, null);
    expect(shown('OtBu')).toBe('O/t/Bu');
    expect(shown('N(iPr)2')).toBe('N(/i/Pr)_2');
    expect(shown('nBu')).toBe('/n/Bu');
    expect(shown('Si(iPr)3')).toBe('Si(/i/Pr)_3');
    expect(shown('t-Bu')).toBe('/t/-Bu');
    // not the s of a silyl group or the t of a tosyl group
    expect(shown('TBS')).toBe('TBS');
    expect(shown('Ts')).toBe('Ts');
  });

  it('adds a dash, or takes one out', () => {
    set(false, true);
    expect(shown('OtBu')).toBe('Ot-Bu');
    expect(shown('iPr2N')).toBe('i-Pr_2N');
    expect(shown('t-Bu')).toBe('t-Bu');
    set(false, false);
    expect(shown('P(t-Bu)2')).toBe('P(tBu)_2');
    expect(shown('OtBu')).toBe('OtBu');
  });

  it('never makes or breaks an element symbol with the dash', () => {
    set(true, true);
    // PtBu3 is tri-tert-butylphosphine; "Pt-Bu" would read as platinum
    expect(alkylShown('PtBu3')?.text).toBe('PtBu3');
    expect(alkylShown('PtBu3')?.italic[1]).toBe(true);
  });

  it('writes the shown text and an italic prefix to CDXML', () => {
    set(true, true);
    const runs = labelRuns('OtBu', { supDigits: false }, true);
    expect(runs.map((r) => r.text).join('')).toBe('Ot-Bu');
    expect(runs.find((r) => r.text === 't')?.italic).toBe(true);
    const doc = new Doc();
    doc.edit('build', () => { const a = doc.addAtom(100, 100, 6, { label: 'OtBu' }); doc.addBond(a.id, doc.addAtom(114, 100, 6).id, 1); });
    const xml = writeCdxml(doc);
    expect(xml).toMatch(/face="98"[^>]*>t</);
    expect(xml).toContain('>-Bu<');
  });
});

describe('alkyl prefixes in typed text', () => {
  const apply = (word: string) => {
    let text = word;
    const italic = new Set<number>();
    const edits = alkylEdits(word, () => false);
    for (const e of edits) if (e.italic) italic.add(e.start);
    for (const e of [...edits].filter((x) => x.text !== undefined).sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    return { text, italic: [...italic] };
  };

  it('does nothing with the style off', () => {
    expect(alkylEdits('nBuLi', () => false)).toEqual([]);
  });

  it('formats nBuLi, KOtBu and iPr2NEt', () => {
    set(true, true);
    expect(apply('nBuLi')).toEqual({ text: 'n-BuLi', italic: [0] });
    expect(apply('KOtBu')).toEqual({ text: 'KOt-Bu', italic: [2] });
    expect(apply('iPr2NEt')).toEqual({ text: 'i-Pr2NEt', italic: [0] });
    set(false, false);
    expect(apply('t-BuOK').text).toBe('tBuOK');
    expect(apply('tert-butyl').text).toBe('tert-butyl');
  });

  it('still reads KOt-Bu as a formula', () => {
    expect(formulaDigits('Ti(Ot-Bu)4').length).toBe(1);
  });
});
