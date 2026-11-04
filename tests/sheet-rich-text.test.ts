// @vitest-environment jsdom
//
// Part of a cell's text bold, italic or underlined (issue #503): the looks kept as runs, made in
// the typing box with Ctrl+B and the like, and kept through Excel files both ways.

import { describe, it, expect } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Workbook } from '../src/sheet/workbook';
import { canHoldRuns, looksForInput, looksOf, runsForInput, runsFrom, runsOf, spliceLooks, toggleLooks } from '../src/sheet/rich-text';
import { RichInput, textOf } from '../src/ui/rich-input';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };

describe('runs of a cell', () => {
  it('turns a look on for part of the text, and off when all of it has it', () => {
    const text = 'Yield 95%';
    let looks = looksOf(text, undefined);
    looks = toggleLooks(looks, 6, 9, 'bold');
    expect(runsFrom(text, looks)).toEqual([{ text: 'Yield ' }, { text: '95%', bold: true }]);
    looks = toggleLooks(looks, 6, 9, 'bold');
    expect(runsFrom(text, looks)).toBeUndefined();
  });

  it('leaves part of a bold cell plain with bold: false', () => {
    const looks = toggleLooks(looksOf('ab', undefined), 1, 2, 'bold', true);
    expect(runsFrom('ab', looks)).toEqual([{ text: 'a' }, { text: 'b', bold: false }]);
  });

  it('gives typed characters the look of the one before them', () => {
    const before = 'ab';
    const looks = [{ bold: true }, {}];
    expect(spliceLooks(before, 'aXb', looks)).toEqual([{ bold: true }, { bold: true }, {}]);
    expect(spliceLooks(before, 'Xab', looks)[0]).toEqual({ bold: true });
    // Bold pressed with nothing selected, then typing
    expect(spliceLooks(before, 'abX', looks, { italic: true })[2]).toEqual({ italic: true });
    expect(spliceLooks('abc', 'ac', [{}, { bold: true }, { italic: true }])).toEqual([{}, { italic: true }]);
  });

  it('holds runs only for text, and over the text without its apostrophe', () => {
    expect(canHoldRuns('Yield 95%')).toBe(true);
    expect(canHoldRuns('=A1')).toBe(false);
    expect(canHoldRuns('12.5')).toBe(false);
    const looks = looksForInput("'0123", [{ text: '01', bold: true }, { text: '23' }]);
    expect(looks).toEqual([{}, { bold: true }, { bold: true }, {}, {}]);
    expect(runsForInput("'0123", looks)).toEqual([{ text: '01', bold: true }, { text: '23' }]);
  });

  it('keeps runs on a sheet, drops them when the text is typed over, and copies them', () => {
    const wb = new Workbook(['Sheet1']);
    const s = wb.sheet;
    wb.edit('Typing', () => s.setRichInput(0, 0, 'Yield 95%', [{ text: 'Yield ' }, { text: '95%', bold: true }]));
    expect(runsOf(s.cell(0, 0))).toEqual([{ text: 'Yield ' }, { text: '95%', bold: true }]);
    // runs that don't fit the text, or on a number, aren't kept
    wb.edit('Typing', () => s.setRichInput(1, 0, '42', [{ text: '4', bold: true }, { text: '2' }]));
    expect(s.cell(1, 0)?.runs).toBeUndefined();
    const block = s.copy({ r1: 0, c1: 0, r2: 0, c2: 0 });
    wb.edit('Paste', () => s.paste({ row: 0, col: 2 }, block));
    expect(runsOf(s.cell(0, 2))).toEqual([{ text: 'Yield ' }, { text: '95%', bold: true }]);
    wb.edit('Typing', () => s.setInput(0, 0, 'Yield 96%'));
    expect(runsOf(s.cell(0, 0))).toBeUndefined();
    wb.undo();
    expect(runsOf(s.cell(0, 0))).toEqual([{ text: 'Yield ' }, { text: '95%', bold: true }]);
  });

  it('counts a change of runs alone as a change (Undo has something to undo)', () => {
    const wb = new Workbook(['Sheet1']);
    const s = wb.sheet;
    wb.edit('Typing', () => s.setInput(0, 0, 'ab'));
    wb.edit('Typing', () => s.setRichInput(0, 0, 'ab', [{ text: 'a', bold: true }, { text: 'b' }]));
    expect(runsOf(s.cell(0, 0))).toHaveLength(2);
    wb.undo();
    expect(runsOf(s.cell(0, 0))).toBeUndefined();
    expect(s.cell(0, 0)?.input).toBe('ab');
  });
});

describe('Excel files', () => {
  it('writes part of the text bold and reads it back', async () => {
    const wb = new Workbook(['Sheet1']);
    const s = wb.sheet;
    wb.build(() => {
      s.setRichInput(0, 0, 'Yield 95% (2 steps)', [{ text: 'Yield ' }, { text: '95%', bold: true }, { text: ' (2 steps)', italic: true }]);
      s.setRichInput(1, 0, 'plain and bold', [{ text: 'plain and ' }, { text: 'bold', bold: true }]);
      s.patchStyle({ r1: 1, c1: 0, r2: 1, c2: 0 }, { font: 'Arial', size: 14 });
    });
    const bytes = await writeXlsx(wb, pictures);
    const sst = strFromU8(unzipSync(bytes)['xl/sharedStrings.xml']);
    expect(sst).toContain('<r><rPr><b/><sz val="11"/>');
    expect(sst).toContain('<t>95%</t>');
    // each run with the cell's font and size, as Excel writes them
    expect(sst).toContain('<sz val="14"/><color theme="1"/><rFont val="Arial"/>');
    const back = (await readXlsx(bytes)).book.sheet;
    expect(runsOf(back.cell(0, 0))).toEqual([{ text: 'Yield ' }, { text: '95%', bold: true }, { text: ' (2 steps)', italic: true }]);
    expect(runsOf(back.cell(1, 0))).toEqual([{ text: 'plain and ' }, { text: 'bold', bold: true }]);
  });

  it("reads Excel's rich text, where every run has its whole look", async () => {
    const wb = new Workbook(['Sheet1']);
    wb.build(() => wb.sheet.setInput(0, 0, 'placeholder'));
    const files = unzipSync(await writeXlsx(wb, pictures));
    // Excel names the workbook's own font in each run
    const base = /<font>.*?<name val="([^"]+)"/.exec(strFromU8(files['xl/styles.xml']))![1];
    const pr = (b: string) => `<rPr>${b}<sz val="11"/><color theme="1"/><rFont val="${base}"/><family val="2"/><scheme val="minor"/></rPr>`;
    files['xl/sharedStrings.xml'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si>' +
      `<r>${pr('<b/>')}<t>12</t></r><r>${pr('')}<t xml:space="preserve"> (95%)</t></r><r><rPr><sz val="11"/><color rgb="FFFF0000"/><rFont val="${base}"/></rPr><t>!</t></r><r><rPr><sz val="11"/><rFont val="Courier New"/></rPr><t>x</t></r>` +
      '</si></sst>');
    const back = (await readXlsx(zipSync(files))).book.sheet;
    expect(back.cell(0, 0)?.input).toBe('12 (95%)!x');
    expect(runsOf(back.cell(0, 0))).toEqual([{ text: '12', bold: true }, { text: ' (95%)' }, { text: '!', color: '#ff0000' }, { text: 'x', font: 'Courier New' }]);
  });
});

describe('the typing box', () => {
  const box = () => {
    const b = new RichInput();
    document.body.append(b.el);
    b.el.focus();
    return b;
  };

  it('makes the selected text bold, and shows it bold', () => {
    const b = box();
    b.setText('Yield 95%');
    b.setSelectionRange(6, 9);
    b.toggle('bold');
    expect(b.runs).toEqual([{ text: 'Yield ' }, { text: '95%', bold: true }]);
    const spans = b.el.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[1].style.fontWeight).toBe('bold');
    expect(textOf(b.el)).toBe('Yield 95%');
    // the selection stays on what was made bold
    expect([b.selectionStart, b.selectionEnd]).toEqual([6, 9]);
  });

  it('keeps the looks when the text is typed in elsewhere (the formula bar), and when typed into', () => {
    const b = box();
    b.setText('ab', [{ bold: true }, {}]);
    b.value = 'aXb';
    expect(b.runs).toEqual([{ text: 'aX', bold: true }, { text: 'b' }]);
    b.setRangeText('Y', 3, 3, 'end');
    expect(b.runs).toEqual([{ text: 'aX', bold: true }, { text: 'bY' }]);
    expect(b.selectionStart).toBe(4);
  });

  it('types in the look Bold was pressed for with nothing selected', () => {
    const b = box();
    b.setText('ab');
    b.setSelectionRange(2, 2);
    b.toggle('bold');
    expect(b.has('bold')).toBe(true);
    b.setRangeText('c', 2, 2, 'end');
    expect(b.runs).toEqual([{ text: 'ab' }, { text: 'c', bold: true }]);
  });

  it("reads back what the browser typed into the box's markup", () => {
    const b = box();
    b.setText('ab', [{ bold: true }, {}]);
    // the browser puts a typed letter into the bold span
    (b.el.firstChild!.firstChild as Text).data = 'aZ';
    b.el.dispatchEvent(new Event('input'));
    expect(b.value).toBe('aZb');
    expect(b.runs).toEqual([{ text: 'aZ', bold: true }, { text: 'b' }]);
  });

  it('reads a new line the browser put in as a <br>', () => {
    const b = box();
    b.setText('ab');
    b.el.firstChild!.after(document.createElement('br'), document.createTextNode('c'));
    b.el.dispatchEvent(new Event('input'));
    expect(b.value).toBe('ab\nc');
  });
});
