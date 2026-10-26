// @vitest-environment jsdom
//
// Excel's rules for sheet names: 1 to 31 characters, none of \ / ? * [ ] :, no apostrophe at the
// start or end, not "History", and not another sheet's name apart from capitals. Excel refuses
// (or "repairs") a workbook that breaks them, so the Data Analysis output box and the tab rename
// refuse such names, imports put them right, and saving to .xlsx puts right any that got through.

import { describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Workbook } from '../src/sheet/workbook';
import { sheetNameProblem, fixSheetName } from '../src/sheet/refs';
import { writeXlsx, readXlsx } from '../src/io/xlsx';
import { safeSheetName } from '../src/io/sheet-files';
import { SheetAnalysis } from '../src/ui/sheet-analysis-ui';

const D = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
D.show ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
D.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
D.close ??= function (this: HTMLDialogElement) { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };

const pictures = { box: () => ({ w: 1, h: 1 }), async picture() { return 'data:image/png;base64,'; } } as never;
const BAD = ['Yields: run 3 [crude] vs purified/recrystallised', "'Crude NMR'", "Students'", 'History', 'a'.repeat(40)];

async function savedNames(bytes: Uint8Array): Promise<string[]> {
  const xml = strFromU8(unzipSync(bytes)['xl/workbook.xml']);
  return [...xml.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1].replace(/&apos;/g, "'").replace(/&amp;/g, '&'));
}
const allFine = (names: string[]) => names.map((n, i) => sheetNameProblem(n, names.filter((_, j) => j !== i)));

describe('sheet names', () => {
  it('sheetNameProblem knows Excel\'s rules', () => {
    for (const n of BAD) expect(sheetNameProblem(n), n).not.toBeNull();
    expect(sheetNameProblem('')).not.toBeNull();
    expect(sheetNameProblem('history')).not.toBeNull();
    expect(sheetNameProblem('DATA', ['Data'])).toMatch(/already/);
    for (const n of ['Data', "a'b", 'Crude NMR', 'Histories', 'a'.repeat(31)]) expect(sheetNameProblem(n, ['Other']), n).toBeNull();
  });

  it('imports (safeSheetName) put a name right', () => {
    expect(safeSheetName("'Crude NMR'")).toBe('Crude NMR');
    expect(safeSheetName("Students'")).toBe('Students');
    expect(safeSheetName('History')).toBe('History_');
    expect(safeSheetName('a:b')).toBe('a_b');
    expect(safeSheetName("''")).toBe('Sheet1');
    expect(safeSheetName('a'.repeat(30) + "'x")).toBe('a'.repeat(30));
    // unique ignoring capitals, still at most 31 characters
    expect(safeSheetName('data', ['Data'])).toBe('data (2)');
    expect(safeSheetName('b'.repeat(40), ['b'.repeat(31)])).toBe('b'.repeat(27) + ' (2)');
    for (const n of BAD) expect(sheetNameProblem(fixSheetName(n)), n).toBeNull();
  });

  it('Data Analysis > New Worksheet Ply shows the problem with a name Excel refuses', async () => {
    const wb = new Workbook(['Data']);
    const s = wb.sheet;
    wb.edit('fill', () => { for (let r = 0; r < 5; r++) s.setInput(r, 0, String(r + 1)); });
    const view = {
      wb, sheet: s, sel: { range: { r1: 0, c1: 0, r2: 4, c2: 0 }, active: { r: 0, c: 0 } },
      commitEdit() {}, goSheet() {}, select() {}, refresh() {}, focus() {}, place: () => undefined,
    };
    const ui = new SheetAnalysis({ view: view as never, edit: (l, fn) => wb.edit(l, () => fn(s)), flash: vi.fn() });
    (ui as unknown as { openTool(t: string): void }).openTool('Descriptive Statistics');
    const d = document.querySelector('dialog.tool-window')!;
    const boxes = [...d.querySelectorAll('input')] as HTMLInputElement[];
    boxes.find((b) => b.classList.contains('ref-box'))!.value = '$A$1:$A$5';
    boxes.filter((b) => b.type === 'radio' && b.name === 'out')[1].checked = true;
    const ply = boxes.find((b) => !b.classList.contains('ref-box') && b.type !== 'checkbox' && b.type !== 'radio' && b.inputMode !== 'decimal')!;
    const submit = async (name: string) => {
      ply.value = name;
      d.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    };
    for (const name of [BAD[0], BAD[1], 'History', 'data']) {
      await submit(name);
      expect(wb.sheets.length, name).toBe(1);
      expect(d.querySelector('.tool-error')!.textContent, name).not.toBe('');
    }
    await submit('Yields run 3');
    expect(wb.sheets.map((x) => x.name)).toEqual(['Data', 'Yields run 3']);
  });

  it('saving to .xlsx puts right a name that got through, and the formulas that use it', async () => {
    const wb = new Workbook(['Data']);
    wb.edit('sheets', () => {
      for (const n of [...BAD, 'DATA']) wb.addSheet(n).setInput(0, 0, '5');
      BAD.forEach((n, i) => wb.sheet.setInput(i, 1, `='${n.replace(/'/g, "''")}'!A1*${i + 1}`));
    });
    expect(wb.sheet.value(0, 1)).toBe(5);
    const bytes = await writeXlsx(wb, pictures);
    const names = await savedNames(bytes);
    expect(names.length).toBe(BAD.length + 2);
    expect(allFine(names)).toEqual(names.map(() => null));
    // the book being saved is left as it was
    expect(wb.sheets.map((x) => x.name)).toEqual(['Data', ...BAD, 'DATA']);
    const back = (await readXlsx(bytes)).book;
    BAD.forEach((_, i) => expect(back.sheet.value(i, 1)).toBe(5 * (i + 1)));
    expect(back.sheet.cell(0, 1)?.input).toBe(`='${names[1]}'!A1*1`);
  });
});
