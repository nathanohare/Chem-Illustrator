// @vitest-environment jsdom
//
// The Text Formatting toolbox: italic stereodescriptors in one click, formula subscripts, symbols.

import { describe, it, expect } from 'vitest';
import { stereoLetters, stereoItalics } from '../src/text/chemtext';
import { TextEditing } from '../src/text/editing';
import { applyFormat, formatWhole, type TextFormat } from '../src/text/format';
import { buildTextToolbox, TEXT_SYMBOLS } from '../src/ui/text-toolbox';
import { savableChar, type RunStyle } from '../src/richtext';

const letters = (t: string) => stereoLetters(t).map((i) => t[i]).join('');

describe('which letters are stereodescriptors', () => {
  it('finds CIP and double-bond sets before a name', () => {
    expect(letters('(2R,3S)-2-amino-3-hydroxybutanoic acid')).toBe('RS');
    expect(letters('(E)-but-2-enal and (2E,4Z)-hexadienal')).toBe('EEZ');
    expect(letters('(1R*,2S*)-1')).toBe('RS');
    expect(letters("(4aS,8aR)-decalin")).toBe('aSaR');
    expect(letters('(Ra)-BINOL')).toBe('Ra');
  });
  it('takes (R) and (S) anywhere, but not a lone (E) that labels a panel', () => {
    expect(letters('the (S) isomer')).toBe('S');
    expect(letters('see panel (E) and (a)')).toBe('');
    expect(letters('yield (85%) after 2 h (rt)')).toBe('');
  });
  it('finds prefixes printed in italics', () => {
    expect(letters('cis-stilbene, trans-decalin, tert-butyl, sec-BuLi')).toBe('cistranstertsec');
    expect(letters('n-BuLi, t-BuOK, i-Pr2NH, s-Bu')).toBe('ntis');
    expect(letters('p-TsOH and o-xylene')).toBe('po');
    expect(letters('rac-1 and rel-(R,R)')).toBe('racrelRR');
  });
  it('leaves words that only look like one', () => {
    expect(letters('E-factor, X-ray, N-H bond, anti')).toBe('');
    expect(letters('transition, Boc-protected, ent')).toBe('');
  });
});

describe('the italic stereodescriptor button', () => {
  it('puts the letters in italics, then takes them out again', () => {
    const t = '(S)-1 from cis-2';
    const on = stereoItalics(t, () => false);
    expect(on).toEqual([{ start: 1, end: 2, italic: true }, { start: 11, end: 14, italic: true }]);
    expect(stereoItalics(t, () => true).every((e) => e.italic === false)).toBe(true);
  });
  it('works on the text being typed, its selection only when there is one', () => {
    const ed = new TextEditing({ runs: [{ text: '(R)-1 and (S)-2' }] }, {}, (s) => s.length, 10);
    ed.select(9, 15);
    applyFormat(ed, { kind: 'stereo' });
    expect(ed.looks().map((l, i) => (l.italic ? ed.text[i] : '')).join('')).toBe('S');
    ed.select(0, 0);
    applyFormat(ed, { kind: 'stereo' });
    // not all were italic: now they all are
    expect(ed.looks().map((l, i) => (l.italic ? ed.text[i] : '')).join('')).toBe('RS');
  });
  it('works on the whole of a picked caption', () => {
    const res = formatWhole({ runs: [{ text: '(E)-3 and p-TsOH' }] }, { kind: 'stereo' }, {}, 10);
    const italic = res.runs.filter((r) => r.italic).map((r) => r.text).join('');
    expect(italic).toBe('Ep');
  });
});

describe('the toolbox', () => {
  const make = (look: RunStyle | null = null) => {
    const done: TextFormat[] = [];
    const typed: string[] = [];
    const said: string[] = [];
    const body = document.createElement('div');
    document.body.append(body);
    const box = buildTextToolbox(body, false, { format: (f) => { done.push(f); return true; }, type: (c) => { typed.push(c); return true; }, look: () => look, moreSymbols: () => typed.push('more'), say: (t) => said.push(t) });
    return { body, box, done, typed, said };
  };
  it('has the format buttons, the symbols and More', () => {
    const { body } = make();
    expect(body.querySelectorAll('.tt-btn').length).toBe(7);
    for (const ch of ['‡', '°', 'α', 'β', 'Δ']) expect([...body.querySelectorAll('.tt-sym')].some((b) => b.textContent === ch)).toBe(true);
    expect(body.querySelector('.tt-more')).not.toBeNull();
    // a click in it keeps the text being typed open
    expect(body.closest('[data-keeps-typing]')).toBe(body);
  });
  it('sends formula, stereo and symbols', () => {
    const { body, done, typed } = make();
    const btn = (title: string) => [...body.querySelectorAll<HTMLButtonElement>('.tt-btn')].find((b) => b.title.startsWith(title))!;
    btn('Formula').click();
    btn('Stereodescriptors').click();
    [...body.querySelectorAll<HTMLButtonElement>('.tt-sym')].find((b) => b.textContent === '‡')!.click();
    expect(done).toEqual([{ kind: 'toggle', key: 'formula' }, { kind: 'stereo' }]);
    expect(typed).toEqual(['‡']);
  });
  it('shows which styles are on', () => {
    const { body } = make({ bold: true, sub: true });
    const on = [...body.querySelectorAll('.tt-btn.on')].map((b) => b.getAttribute('aria-label')!.split(' ')[0]);
    expect(on).toEqual(['Bold', 'Subscript']);
  });
  it('offers only symbols a ChemDraw file can keep', () => {
    const shown = [...make().body.querySelectorAll('.tt-sym')].map((b) => b.textContent!);
    expect(shown.every(savableChar)).toBe(true);
    expect(shown.length).toBeGreaterThan(TEXT_SYMBOLS[1].chars.length);
  });
});
