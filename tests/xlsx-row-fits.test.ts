// @vitest-environment jsdom
//
// Excel's row heights kept (Office file audit X21, X8): a row Excel fitted to its contents (a
// height without customHeight) shows at that height and goes back as one Excel fits again, until
// something in the row changes; and a sheet whose unlisted rows are hidden (zeroHeight, everything
// below a table hidden) keeps them hidden after a save.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Package, REL } from '../src/io/ooxml';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const plain: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const sheetXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);

function excelFile(sheet: string): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  pkg.add('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${RNS}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  pkg.relate('xl/workbook.xml', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet', 'worksheets/sheet1.xml');
  pkg.add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${MAIN}" xmlns:r="${RNS}">${sheet}</worksheet>`);
  return pkg.build();
}

describe('rows Excel fitted itself (X21)', () => {
  const file = excelFile('<sheetFormatPr defaultRowHeight="14.25"/><sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row>'
    + '<row r="2" ht="42.75"><c r="A2" t="inlineStr"><is><t>wrapped over three lines</t></is></c></row>'
    + '<row r="3" ht="14.25"><c r="A3"><v>1</v></c></row>'
    + '<row r="4" ht="30" customHeight="1"><c r="A4"><v>2</v></c></row>'
    + '</sheetData>');

  it('reads the fitted height apart from heights set by hand', async () => {
    const s = (await readXlsx(file)).book.sheets[0];
    expect(s.fittedRows.get(1)).toBe(57);
    // a height equal to the sheet's usual one is no fit of its own
    expect(s.fittedRows.has(2)).toBe(false);
    expect(s.rowHeights.get(3)).toBe(40);
    expect(s.fittedRows.has(3)).toBe(false);
  });

  it('saves it back at the height Excel showed, marked as set, while the row is unchanged', async () => {
    // (Excel fits a row without customHeight again when it opens our save: laptop check 51 saw a
    // 40 pt row come back at the default height)
    const book = (await readXlsx(file)).book;
    let xml = sheetXml(await writeXlsx(book, plain));
    expect(xml).toMatch(/<row r="2" ht="42.75" customHeight="1">/);
    expect(xml).toMatch(/<row r="4" ht="30" customHeight="1">/);
    // once something in it changes, Excel fits it to what it holds
    book.edit('Type', () => book.sheets[0].setCell(1, 0, { input: 'short' }));
    xml = sheetXml(await writeXlsx(book, plain));
    expect(xml).not.toMatch(/<row r="2" ht="42.75"/);
  });

  it('lets the row fit what it holds once something in it changes, or its height is set', async () => {
    const book = (await readXlsx(file)).book;
    const s = book.sheets[0];
    book.edit('Type', () => s.setCell(1, 0, { input: 'short' }));
    expect(s.fittedRows.has(1)).toBe(false);
    book.undo();
    expect(s.fittedRows.get(1)).toBe(57);
    book.edit('Row height', () => s.setRowHeight(1, undefined));
    expect(s.fittedRows.has(1)).toBe(false);
  });

  it('moves with its row when rows are put in above it', async () => {
    const book = (await readXlsx(file)).book;
    const s = book.sheets[0];
    book.edit('Insert', () => s.insertRows(0, 2));
    expect(s.fittedRows.get(3)).toBe(57);
    expect(s.fittedRows.has(1)).toBe(false);
  });
});

describe('sheets with rows hidden unless listed (X8, zeroHeight)', () => {
  const file = excelFile('<sheetFormatPr defaultRowHeight="15" zeroHeight="1"/><sheetData>'
    + '<row r="1"><c r="A1"><v>1</v></c></row>'
    + '<row r="2"><c r="A2"><v>2</v></c></row>'
    + '<row r="4" ht="15"/>'
    + '<row r="5" hidden="1"><c r="A5"><v>5</v></c></row>'
    + '</sheetData>');

  it('hides the rows the file leaves out, up to the last it lists', async () => {
    const s = (await readXlsx(file)).book.sheets[0];
    expect(s.fileRowHeight?.zero).toBe(true);
    expect(s.hiddenRows.has(2)).toBe(true);
    expect(s.hiddenRows.has(4)).toBe(true);
    expect(s.hiddenRows.has(0) || s.hiddenRows.has(1) || s.hiddenRows.has(3)).toBe(false);
  });

  it('writes zeroHeight back with every shown row listed', async () => {
    const book = (await readXlsx(file)).book;
    const xml = sheetXml(await writeXlsx(book, plain));
    expect(xml).toContain('zeroHeight="1"');
    for (const r of [1, 2, 4]) expect(xml).toMatch(new RegExp(`<row r="${r}"[^>]*>`));
    expect(xml).toMatch(/<row r="3" hidden="1"/);
    expect(xml).toMatch(/<row r="5" hidden="1"/);
    // and it reads back the same
    const again = (await readXlsx(await writeXlsx(book, plain))).book.sheets[0];
    expect([...again.hiddenRows.keys()].sort()).toEqual([2, 4]);
    expect(again.fileRowHeight?.zero).toBe(true);
  });

  it('lists a row typed in below the old last row, so Excel shows it', async () => {
    const book = (await readXlsx(file)).book;
    const s = book.sheets[0];
    book.edit('Type', () => s.setCell(8, 0, { input: 'new' }));
    const xml = sheetXml(await writeXlsx(book, plain));
    expect(xml).toMatch(/<row r="9"[^>]*>/);
    expect(xml).toMatch(/<row r="7" ht="15">/);
  });
});
