// @vitest-environment jsdom
//
// The Text Formatting toolbox: the same bar as above text being typed, with italic stereodescriptors
// in one click, formula subscripts, symbols, spacing and links.

import { describe, it, expect } from 'vitest';
import { stereoLetters, stereoItalics } from '../src/text/chemtext';
import { TextEditing } from '../src/text/editing';
import { applyFormat, formatWhole, type TextFormat } from '../src/text/format';
import { buildTextToolbox } from '../src/ui/text-toolbox';
import { buildTextBar, TEXT_SYMBOL_ROWS, type TextBarState } from '../src/ui/text-bar';
import { savableChar } from '../src/richtext';

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

describe('the toolbox: the same bar as above text being typed', () => {
  const state: TextBarState = { style: { bold: true, sub: true }, align: 'center', list: 'bullet', line: 1.5, before: 6, after: 0, wrap: 200, link: false, defaultFont: 'Arial' };
  const make = (look: TextBarState | null = null, ok = true) => {
    const done: TextFormat[] = [];
    const typed: string[] = [];
    const said: string[] = [];
    let links = 0, backs = 0;
    const body = document.createElement('div');
    document.body.append(body);
    const box = buildTextToolbox(body, false, { format: (f) => { done.push(f); return ok; }, type: (c) => { typed.push(c); return ok; }, link: () => { links++; }, look: () => look, back: () => { backs++; }, say: (t) => said.push(t) });
    return { body, box, done, typed, said, links: () => links, backs: () => backs };
  };
  const btn = (body: HTMLElement, label: string) => [...body.querySelectorAll<HTMLButtonElement>('.cb-btn')].find((b) => b.title.startsWith(label))!;
  it('has exactly the buttons, boxes and panels of the bar shown while typing', () => {
    const { body } = make();
    const bar = document.createElement('div');
    buildTextBar(bar, { format: () => true, type: () => true, link: () => {}, state: () => null, back: () => {} });
    const shape = (el: HTMLElement) => [...el.querySelectorAll('button, input')].map((b) => `${b.tagName}:${b.className}:${b.getAttribute('aria-label')}`);
    expect(shape(body)).toEqual(shape(bar));
    expect(body.querySelectorAll('.cb-group').length).toBe(6);
    expect(body.querySelector('.caption-symbols')).not.toBeNull();
    expect(body.querySelector('.caption-spacing')).not.toBeNull();
    // a click in it keeps the text being typed open
    expect(body.closest('[data-keeps-typing]')).toBe(body);
  });
  it('sets the font and size, and shows the text\'s own', () => {
    const { body, done, box } = make();
    const font = body.querySelector<HTMLInputElement>('.cb-font')!, size = body.querySelector<HTMLInputElement>('.cb-size')!;
    font.value = 'Helvetica';
    font.dispatchEvent(new Event('change'));
    size.value = '9';
    size.dispatchEvent(new Event('change'));
    expect(done.slice(-2)).toEqual([{ kind: 'style', patch: { font: 'Helvetica' } }, { kind: 'style', patch: { size: 9 } }]);
    box.refresh();
    expect(size.value).toBe('');
  });
  it('sends every kind of change, and links and symbols', () => {
    const { body, done, typed, links, backs } = make();
    for (const t of ['Formula', 'Stereodescriptors', 'Center', 'Numbering', 'More indent', 'Link']) btn(body, t).click();
    btn(body, 'Greek').click();
    expect(body.querySelector<HTMLElement>('.caption-symbols')!.hidden).toBe(false);
    [...body.querySelectorAll<HTMLButtonElement>('.cs-row button')].find((b) => b.textContent === '‡')!.click();
    btn(body, 'Line and paragraph').click();
    expect(body.querySelector<HTMLElement>('.caption-symbols')!.hidden).toBe(true);
    const field = (label: string, v: string) => { const i = body.querySelector<HTMLInputElement>(`input[aria-label^="${label}"]`)!; i.value = v; i.dispatchEvent(new Event('change')); };
    field('Line spacing', '2');
    field('Space before', '4');
    field('Width the lines wrap', '');
    expect(done).toEqual([
      { kind: 'toggle', key: 'formula' }, { kind: 'stereo' }, { kind: 'align', j: 'center' }, { kind: 'list', list: 'number' }, { kind: 'indent', by: 1 },
      { kind: 'line', v: 2 }, { kind: 'para', patch: { spaceBefore: 4 } }, { kind: 'wrap', w: undefined },
    ]);
    expect(typed).toEqual(['‡']);
    expect(links()).toBe(1);
    expect(backs()).toBeGreaterThan(5);
  });
  it('shows which styles are on, and the spacing', () => {
    const { body } = make(state);
    const on = [...body.querySelectorAll('.cb-btn.on')].map((b) => b.getAttribute('aria-label')!.split(' ')[0]);
    expect(on).toEqual(['Bold', 'Subscript', 'Center', 'Bullets']);
    const val = (label: string) => body.querySelector<HTMLInputElement>(`input[aria-label^="${label}"]`)!.value;
    expect([val('Line spacing'), val('Space before'), val('Width the lines wrap')]).toEqual(['1.5', '6', '200']);
    expect(body.querySelector<HTMLInputElement>('.cb-font')!.placeholder).toBe('Arial');
  });
  it('says so when there is no text to change', () => {
    const { body, said } = make(null, false);
    btn(body, 'Bold').click();
    expect(said.length).toBe(1);
  });
  it('offers only symbols a ChemDraw file can keep', () => {
    const shown = [...make().body.querySelectorAll('.cs-row button')].map((b) => b.textContent!);
    expect(shown.every(savableChar)).toBe(true);
    expect(shown.length).toBe(TEXT_SYMBOL_ROWS.flat().length);
    for (const ch of ['‡', '°', 'α', 'β', 'Δ']) expect(shown).toContain(ch);
  });
});

describe('a whole picked caption', () => {
  it('takes paragraph spacing and a wrap width', () => {
    const t = { runs: [{ text: 'one\ntwo' }], paras: [{}, {}] };
    const spaced = formatWhole(t, { kind: 'para', patch: { spaceAfter: 6 } }, {}, 10);
    expect(spaced.paras?.every((p) => p.spaceAfter === 6)).toBe(true);
    expect(formatWhole(t, { kind: 'wrap', w: 120 }, {}, 10).wrap).toBe(120);
  });
});
