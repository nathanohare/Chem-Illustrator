// @vitest-environment jsdom
//
// Excel files with very long text: a hostile workbook (one shared string of a megabyte, used in
// thousands of cells) opens in moments. Typed text is read as a number or date only when it is
// short enough to be one, so long text isn't run through those checks for every cell.

import { describe, it, expect } from 'vitest';
import { readXlsx } from '../src/io/xlsx';
import { readTyped } from '../src/sheet/values';
import { Package, REL } from '../src/io/ooxml';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** A workbook whose cells all show one long shared string. */
function longStringBook(chars: number, cells: number): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  pkg.add('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  pkg.relate('xl/workbook.xml', `${R}/worksheet`, 'worksheets/sheet1.xml');
  pkg.relate('xl/workbook.xml', `${R}/sharedStrings`, 'sharedStrings.xml');
  const rows: string[] = [];
  for (let r = 1; r <= cells / 10; r++) rows.push(`<row r="${r}">${Array.from({ length: 10 }, () => '<c t="s"><v>0</v></c>').join('')}</row>`);
  pkg.add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${MAIN}"><sheetData>${rows.join('')}</sheetData></worksheet>`);
  // digits and spaces: text that each typed-value check has to look at
  pkg.add('xl/sharedStrings.xml', `<sst xmlns="${MAIN}"><si><t xml:space="preserve">${'1 2 '.repeat(chars / 4)}</t></si></sst>`);
  return pkg.build();
}

describe('very long text', () => {
  it('opens a workbook of one long string in many cells quickly', async () => {
    const bytes = longStringBook(100_000, 2000);
    const t0 = performance.now();
    const { book } = await readXlsx(bytes);
    const ms = performance.now() - t0;
    expect(book.sheet.cells.size).toBe(2000);
    expect((book.sheet.value(0, 0) as string).length).toBe(100_000);
    // (each cell's text was read as a number and a date, twice: about 10 seconds before)
    expect(ms).toBeLessThan(4000);
  }, 60000);

  it('still reads short typed numbers, dates and units', () => {
    expect(readTyped('  1,234.5 ').value).toBe(1234.5);
    expect(readTyped('10/22/2026').format).toBe('m/d/yyyy');
    expect(readTyped('5 mol%').value).toBe(5);
    expect(readTyped('1 2 '.repeat(100)).value).toBe('1 2 '.repeat(100));
  });
});
