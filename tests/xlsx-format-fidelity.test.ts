// @vitest-environment jsdom
//
// Excel files, formatting kept as the file had it, where this program shows it another way or
// not at all.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Package, REL } from '../src/io/ooxml';
import { Workbook } from '../src/sheet/workbook';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const part = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const FILLS = '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>';
const BORDERS = '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>';
const FONT = '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>';

/** A one-sheet workbook made the way Excel writes it, with these parts. */
function excelFile(sheet: string, extra: { styles?: string; theme?: string; parts?: Record<string, string>; sheetRels?: [string, string][] } = {}): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  pkg.add('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  pkg.relate('xl/workbook.xml', `${R}/worksheet`, 'worksheets/sheet1.xml');
  pkg.add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${MAIN}" xmlns:r="${R}">${sheet}</worksheet>`);
  if (extra.styles) {
    pkg.relate('xl/workbook.xml', `${R}/styles`, 'styles.xml');
    pkg.add('xl/styles.xml', `<styleSheet xmlns="${MAIN}">${extra.styles}</styleSheet>`);
  }
  if (extra.theme) {
    pkg.relate('xl/workbook.xml', `${R}/theme`, 'theme/theme1.xml');
    pkg.add('xl/theme/theme1.xml', extra.theme);
  }
  for (const [name, text] of Object.entries(extra.parts ?? {})) pkg.add(name, text);
  for (const [type, target] of extra.sheetRels ?? []) pkg.relate('xl/worksheets/sheet1.xml', type, target);
  return pkg.build();
}

const styles = (cellXfs: string[], o: { fonts?: string[]; fills?: string; numFmts?: string; cellStyleXfs?: string; cellStyles?: string; borders?: string } = {}) =>
  `${o.numFmts ?? ''}<fonts count="${(o.fonts ?? [FONT]).length}">${(o.fonts ?? [FONT]).join('')}</fonts>${o.fills ?? FILLS}${o.borders ?? BORDERS}` +
  `<cellStyleXfs count="1">${o.cellStyleXfs ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'}</cellStyleXfs>` +
  `<cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>${o.cellStyles ?? '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'}`;

describe("a cell's own format", () => {
  // column A: 0% and a gray fill; A1 has no style (style 0), A2 the column's, A3 empty in style 0
  const file = () => excelFile(
    '<cols><col min="1" max="1" width="9.140625" style="1"/></cols>' +
    '<sheetData><row r="1"><c r="A1"><v>5</v></c></row><row r="2"><c r="A2" s="1"><v>5</v></c></row><row r="3"><c r="A3"/></row></sheetData>',
    { styles: styles(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="9" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>'],
      { fills: '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD0CECE"/><bgColor indexed="64"/></patternFill></fill></fills>' }) },
  );

  it("is all of it: a General cell in a formatted column doesn't take the column's format or fill", async () => {
    const { book } = await readXlsx(file());
    const s = book.sheet;
    expect(s.styleAt(0, 0)?.numFmt).toBeUndefined();
    expect(s.styleAt(0, 0)?.fill).toBeUndefined();
    expect(s.shownText(0, 0)).toBe('5');
    expect(s.styleAt(1, 0)).toMatchObject({ numFmt: '0%', fill: '#d0cece' });
    expect(s.shownText(1, 0)).toBe('500%');
    // the empty cell stays plain, and cells with nothing in them take the column's format
    expect(s.styleAt(2, 0)?.fill).toBeUndefined();
    expect(s.styleAt(9, 0)).toMatchObject({ fill: '#d0cece' });
  });

  it('is saved as it was: the plain cells say style 0, so they keep it in every program', async () => {
    const { book } = await readXlsx(file());
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).toMatch(/<c r="A1" s="0"><v>5<\/v><\/c>/);
    expect(xml).toMatch(/<c r="A2" s="[1-9]\d*"><v>5<\/v><\/c>/);
    expect(xml).toContain('<c r="A3" s="0"/>');
    expect(xml).toMatch(/<col min="1" max="1" [^>]*style="[1-9]/);
    const { book: back } = await readXlsx(await writeXlsx(book, pictures));
    expect(back.sheet.styleAt(0, 0)?.numFmt).toBeUndefined();
    expect(back.sheet.styleAt(2, 0)?.fill).toBeUndefined();
    expect(back.sheet.styleAt(1, 0)?.numFmt).toBe('0%');
  });

  it("starts a cell formatted here from its column's format", () => {
    const wb = new Workbook();
    const s = wb.sheet;
    wb.edit('format column', () => s.patchStyle({ r1: 0, c1: 1, r2: 1048575, c2: 1 }, { fill: '#ffff00', numFmt: '0.00' }));
    wb.edit('bold', () => s.patchStyle({ r1: 4, c1: 1, r2: 4, c2: 1 }, { bold: true }));
    wb.edit('border', () => s.setBorders({ r1: 6, c1: 1, r2: 6, c2: 1 }, 'all'));
    wb.edit('type', () => s.setInput(8, 1, '3'));
    expect(s.styleAt(4, 1)).toMatchObject({ fill: '#ffff00', numFmt: '0.00', bold: true });
    expect(s.styleAt(6, 1)).toMatchObject({ fill: '#ffff00', numFmt: '0.00', borders: { top: { style: 'thin' } } });
    expect(s.styleAt(8, 1)).toMatchObject({ fill: '#ffff00', numFmt: '0.00' });
  });
});

describe("the workbook's Normal style", () => {
  const arial = '<font><sz val="10"/><name val="Arial"/><family val="2"/></font>';
  const file = () => excelFile(
    '<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" s="1"><v>2</v></c></row></sheetData>',
    { styles: styles(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>', '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'],
      { fonts: [arial, '<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>'] }) },
  );

  it('shows cells with no format of their own in its font, size and alignment (Arial 10, not the theme font)', async () => {
    const { book } = await readXlsx(file());
    expect(book.sheet.styleAt(0, 0)).toMatchObject({ font: 'Arial', size: 10, valign: 'middle' });
    expect(book.sheet.styleAt(0, 1)).toMatchObject({ font: 'Arial', size: 10, bold: true });
    // an empty cell, and one typed here
    expect(book.sheet.styleAt(5, 5)).toMatchObject({ font: 'Arial', size: 10 });
    book.edit('type', () => book.sheet.setInput(3, 3, 'new'));
    expect(book.sheet.styleAt(3, 3)).toMatchObject({ font: 'Arial', size: 10 });
  });

  it('is saved back as style 0 with its own font, and a cell in the plain look gets a style of its own', async () => {
    const { book } = await readXlsx(file());
    book.edit('plain', () => book.sheet.setCell(4, 0, { input: 'plain', style: {} }));
    const bytes = await writeXlsx(book, pictures);
    const st = part(bytes, 'xl/styles.xml');
    expect(st).toMatch(/<fonts count="\d+"><font><sz val="10"\/><name val="Arial"\/><family val="2"\/><\/font>/);
    expect(st).toMatch(/<cellXfs count="\d+"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"[^>]*><alignment vertical="center"\/><\/xf>/);
    const xml = part(bytes, 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<c r="A1"><v>1</v></c>');
    expect(xml).toMatch(/<c r="A5" s="[1-9]\d*" t="s">/);
    const { book: back } = await readXlsx(bytes);
    expect(back.sheet.styleAt(0, 0)).toMatchObject({ font: 'Arial', size: 10, valign: 'middle' });
    expect(back.sheet.styleAt(0, 1)).toMatchObject({ font: 'Arial', size: 10, bold: true });
    expect(back.sheet.styleAt(4, 0)?.font).toBeUndefined();
  });

  it('keeps a Normal font that is not the theme font (Calibri in an Aptos Narrow theme)', async () => {
    const theme = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1></a:clrScheme>' +
      '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos Narrow"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
    const { book } = await readXlsx(excelFile('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>',
      { theme, styles: styles(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], { fonts: ['<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>'] }) }));
    expect(book.sheet.styleAt(0, 0)?.font).toBe('Calibri');
    const st = part(await writeXlsx(book, pictures), 'xl/styles.xml');
    expect(st).toMatch(/<fonts count="\d+"><font><sz val="11"\/><color rgb="FF000000"\/><name val="Calibri"\/><\/font>/);
  });
});

describe('columns to the end of the sheet', () => {
  const file = () => excelFile(
    '<cols><col min="1" max="2" width="12.7109375" customWidth="1"/><col min="4" max="16384" width="9.140625" hidden="1"/></cols>' +
    '<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData>',
    { styles: styles(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']) },
  );

  it('hides every column of a range that runs to the end, not only its first', async () => {
    const { book } = await readXlsx(file());
    const s = book.sheet;
    expect(s.hiddenCols.has(3)).toBe(true);
    expect(s.hiddenCols.has(300)).toBe(true);
    expect(s.hiddenCols.has(16383)).toBe(true);
    expect(s.hiddenCols.has(2)).toBe(false);
  });

  it('writes neighboring columns set the same way as one range, to the end of the sheet', async () => {
    const { book } = await readXlsx(file());
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).toMatch(/<cols><col min="1" max="2" width="[\d.]+" customWidth="1"\/><col min="4" max="16384" width="[\d.]+" hidden="1"\/><\/cols>/);
  });
});

describe('columns to the end of the sheet, after inserting one', () => {
  it('stops at the last column of the sheet', async () => {
    const { book } = await readXlsx(excelFile('<cols><col min="4" max="16384" width="9.140625" hidden="1"/></cols><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>'));
    book.edit('insert', () => book.sheet.insertCols(1, 2));
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).toMatch(/<col min="6" max="16384" width="[\d.]+" hidden="1"\/>/);
  });
});
