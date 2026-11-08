// @vitest-environment jsdom
//
// The template window over a new file: our own document and sheet templates, slide starter decks,
// that they save to Word and Excel and come back, and the window itself.

import { describe, it, expect } from 'vitest';
import { DOC_TEMPLATES, DOC_CATEGORIES } from '../src/document/templates';
import { SHEET_TEMPLATES, SHEET_CATEGORIES } from '../src/sheet/templates';
import { STARTER_DECKS } from '../src/deck/starters';
import { Deck } from '../src/deck/deck';
import { Doc } from '../src/model';
import { showTemplateWindow, type TemplateCard } from '../src/ui/template-window';
import { documentCategories } from '../src/ui/file-templates';
import { checkDocument } from '../src/accessibility';
import { keyOf } from '../src/sheet/refs';
import { writeXlsx, readXlsx } from '../src/io/xlsx';

const textOf = (t: { runs: { text: string }[] }) => t.runs.map((r) => r.text).join('');

describe('document templates', () => {
  it('each has a paragraph per line, headings in the heading styles, and no accessibility errors', () => {
    expect(new Set(DOC_TEMPLATES.map((t) => t.id)).size).toBe(DOC_TEMPLATES.length);
    expect(DOC_TEMPLATES.length).toBeGreaterThanOrEqual(22);
    for (const c of DOC_CATEGORIES) expect(DOC_TEMPLATES.some((t) => t.category === c.id)).toBe(true);
    for (const tpl of DOC_TEMPLATES) {
      const t = tpl.make();
      expect(textOf(t).split('\n').length).toBe(t.paras.length);
      // (letters, and the one-page specific aims with its aims in bold, have no headings)
      if (!['specific-aims', 'editor-letter', 'job-letter'].includes(tpl.id)) expect(t.paras.some((p) => p.style === 'Heading1')).toBe(true);
      expect(t.paras[0].style).toBe('Title');
      expect(checkDocument(t).filter((i) => i.level === 'error')).toEqual([]);
    }
  });
  it('the lab report has a reagent table with a heading row, and the SI a contents list', () => {
    const lab = DOC_TEMPLATES.find((t) => t.id === 'lab-report')!.make();
    const tables = Object.values(lab.objects).filter((o) => o.kind === 'table');
    expect(tables).toHaveLength(1);
    expect(tables[0].kind === 'table' && tables[0].table.head).toBe(1);
    const si = DOC_TEMPLATES.find((t) => t.id === 'si')!.make();
    expect(Object.values(si.objects).some((o) => o.kind === 'toc')).toBe(true);
    expect(textOf(si)).toContain('General Information');
  });
  it('the thesis chapter has a binding margin and 1.5 line spacing', () => {
    const t = DOC_TEMPLATES.find((x) => x.id === 'thesis-chapter')!.make();
    expect(t.page.left).toBe(108);
    expect(t.styles.Normal.line).toBe(1.5);
  });
});

const sheet = (id: string) => SHEET_TEMPLATES.find((t) => t.id === id)!.make();

describe('sheet templates', () => {
  it('has the four categories, distinct ids, and every template saves to .xlsx and opens again', async () => {
    expect(new Set(SHEET_TEMPLATES.map((t) => t.id)).size).toBe(SHEET_TEMPLATES.length);
    expect(SHEET_TEMPLATES.length).toBeGreaterThanOrEqual(16);
    for (const c of SHEET_CATEGORIES) expect(SHEET_TEMPLATES.some((t) => t.category === c.id)).toBe(true);
    for (const t of SHEET_TEMPLATES) {
      const wb = t.make();
      const bytes = await writeXlsx(wb, { structurePng: async () => null } as never);
      const { book } = await readXlsx(bytes);
      expect(book.sheets.map((s) => s.name)).toEqual(wb.sheets.map((s) => s.name));
      expect(book.sheets[0].charts.length).toBe(wb.sheets[0].charts.length);
    }
  });
  it('works out a calibration, ee, NMR yield, titration, stock solution and rate constant', () => {
    const cal = sheet('calibration'), c = cal.sheets[0];
    expect(c.values.get(keyOf(15, 1)) as number).toBeGreaterThan(0.999);
    cal.edit('unknown', () => { c.setInput(2, 5, '62400'); });
    expect(c.values.get(keyOf(2, 6)) as number).toBeCloseTo(3, 1);
    expect(c.charts[0].series[0].fit?.kind).toBe('linear');

    const ee = sheet('ee-areas'), e = ee.sheets[0];
    ee.edit('areas', () => { e.setInput(1, 1, '95'); e.setInput(1, 2, '5'); });
    expect(e.values.get(keyOf(1, 3))).toBe('95.0:5.0');
    expect(e.values.get(keyOf(1, 4))).toBe(90);
    expect(e.values.get(keyOf(1, 5))).toBe('first');

    const nmr = sheet('nmr-yield'), n = nmr.sheets[0];
    // 16.82 mg of trimethoxybenzene is 0.1 mmol; its 3 H against the product's 1 H
    nmr.edit('run', () => { n.setInput(2, 1, '16.82'); n.setInput(5, 1, '0.2'); n.setInput(8, 1, '3'); n.setInput(8, 2, '1.5'); n.setInput(8, 3, '1'); });
    expect(n.values.get(keyOf(8, 4)) as number).toBeCloseTo(0.15, 4);
    expect(n.values.get(keyOf(8, 5)) as number).toBeCloseTo(75, 1);

    const tit = sheet('titration'), ti = tit.sheets[0];
    tit.edit('runs', () => { ti.setInput(7, 1, '212.24'); ti.setInput(7, 3, '0.625'); ti.setInput(8, 1, '106.12'); ti.setInput(8, 3, '0.3125'); });
    expect(ti.values.get(keyOf(13, 1)) as number).toBeCloseTo(1.6, 6);

    const st = sheet('stock-solution'), s = st.sheets[0];
    st.edit('mw', () => { s.setInput(2, 1, '100'); });
    expect(s.values.get(keyOf(6, 1))).toBe(100);
    st.edit('dilute', () => { s.setInput(14, 1, '1'); s.setInput(15, 1, '0.1'); s.setInput(16, 1, '10'); });
    expect(s.values.get(keyOf(17, 1)) as number).toBeCloseTo(1);
    expect(s.values.get(keyOf(18, 1)) as number).toBeCloseTo(9);

    const k = sheet('kinetics').sheets[0];
    expect(k.values.get(keyOf(17, 1)) as number).toBeCloseTo(0.04, 2);
    expect(k.charts).toHaveLength(1);
  });
  it('shades a screening plate\'s yields and finds the best well', () => {
    const wb = sheet('plate-96'), res = wb.sheets[1];
    expect(res.cells.get(keyOf(9, 0))?.input).toBe('H');
    expect(res.cells.get(keyOf(1, 12))?.input).toBe('12');
    expect(res.condFormats[0].rule.kind).toBe('scale');
    wb.edit('yields', () => { res.setInput(2, 1, '40'); res.setInput(9, 12, '91'); });
    expect(res.values.get(keyOf(11, 1))).toBe(91);
  });
  it('the reaction table picks out the best entry', () => {
    const wb = sheet('reaction-table');
    const sh = wb.sheets[0];
    expect(sh.cells.get(keyOf(0, 11))?.input).toBe('Yield (%)');
    wb.edit('yields', () => { sh.setInput(1, 11, '62'); sh.setInput(2, 11, '88'); sh.setInput(3, 11, '71'); });
    expect(sh.values.get(keyOf(14, 11))).toBe(88);
    expect(sh.values.get(keyOf(15, 11))).toBe(2);
    expect(sh.frozen).toEqual({ rows: 1, cols: 1 });
  });
  it('the reagent sheet works out the yield from the limiting reagent', () => {
    const wb = sheet('reagent-sheet');
    const [reagents, y] = wb.sheets;
    expect(reagents.name).toBe('Reagents');
    expect(y.values.get(keyOf(3, 1))).toBe(1);
    wb.edit('amounts', () => { reagents.setInput(1, 4, '2'); y.setInput(2, 1, '150'); y.setInput(5, 1, '240'); });
    expect(y.values.get(keyOf(4, 1))).toBe(300);
    expect(y.values.get(keyOf(6, 1))).toBe(80);
  });
  it('saves to .xlsx and opens again', async () => {
    const wb = sheet('reaction-table');
    const bytes = await writeXlsx(wb, { structurePng: async () => null } as never);
    const { book } = await readXlsx(bytes);
    const sh = book.sheets[0];
    expect(sh.name).toBe('Optimization');
    expect(sh.cells.get(keyOf(15, 11))?.input).toMatch(/^=IF\(L15=""/);
    expect(sh.cells.get(keyOf(0, 0))?.input).toBe('Entry');
  });
});

describe('starter decks', () => {
  it('fill a new deck\'s placeholders, bullets in the body, and leave it unchanged', () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    for (const s of STARTER_DECKS) {
      d.startWith(s.slides);
      expect(d.slides).toHaveLength(s.slides.length);
      expect(d.edits).toBe(0);
      const title = [...d.docOf(0).captions.values()].find((c) => c.ph === 'title')!;
      expect(title.runs.map((r) => r.text).join('')).toBe(s.slides[0].text[0]);
      const body = [...d.docOf(1).captions.values()].find((c) => c.ph === 'body')!;
      expect(body.paras?.length).toBe(s.slides[1].text[1].split('\n').length);
      expect(body.paras?.every((p) => p.list === 'bullet')).toBe(true);
    }
  });
});

describe('the template window', () => {
  const card = (id: string, picked: string[]): TemplateCard => ({ id, name: id.toUpperCase(), preview: (h) => { h.textContent = id; }, pick: () => { picked.push(id); } });

  it('lists the categories, shows the first one\'s cards, and closes with the card picked', async () => {
    const picked: string[] = [];
    let pref = true;
    const w = showTemplateWindow({
      mode: 'document', title: 'New Document',
      categories: [{ id: 'a', name: 'First', cards: () => [card('one', picked), card('two', picked)] }, { id: 'b', name: 'Second', cards: () => [card('three', picked)] }],
      showPref: { label: 'Show templates when creating new documents', get: () => pref, set: (on) => { pref = on; } },
    });
    await new Promise((r) => setTimeout(r, 0));
    const root = document.querySelector('.template-window') as HTMLElement;
    expect(root.classList.contains('tw-document')).toBe(true);
    expect([...root.querySelectorAll('.tw-cat')].map((b) => b.firstChild!.textContent)).toEqual(['First', 'Second']);
    expect([...root.querySelectorAll('.tw-card strong')].map((b) => b.textContent)).toEqual(['ONE', 'TWO']);
    (root.querySelectorAll('.tw-cat')[1] as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect([...root.querySelectorAll('.tw-card strong')].map((b) => b.textContent)).toEqual(['THREE']);
    const box = root.querySelector('.tw-foot input') as HTMLInputElement;
    box.click();
    expect(pref).toBe(false);
    (root.querySelector('.tw-card') as HTMLButtonElement).click();
    expect(await w.closed).toBe(true);
    expect(picked).toEqual(['three']);
    expect(document.querySelector('.template-window')).toBeNull();
  });

  it('closes, keeping the blank file, on a click outside it or Esc', async () => {
    const w = showTemplateWindow({ mode: 'sheet', title: 'New Spreadsheet', categories: [{ id: 'a', name: 'A', cards: () => [] }] });
    await new Promise((r) => setTimeout(r, 0));
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(await w.closed).toBe(false);
    const w2 = showTemplateWindow({ mode: 'sheet', title: 'New Spreadsheet', categories: [{ id: 'a', name: 'A', cards: () => [] }] });
    const root = document.querySelector('.template-window') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await w2.closed).toBe(false);
  });

  it('offers every document template, by category', async () => {
    const cats = documentCategories(() => {});
    expect(cats.map((c) => c.name)).toEqual(DOC_CATEGORIES.map((c) => c.name));
    const n = (await Promise.all(cats.map((c) => c.cards()))).flat().length;
    expect(n).toBe(DOC_TEMPLATES.length);
  });
});
