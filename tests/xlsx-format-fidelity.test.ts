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

describe('built-in number formats', () => {
  const file = () => excelFile(
    '<sheetData><row r="1"><c r="A1" s="1"><v>46331</v></c><c r="B1" s="2"><v>46331</v></c><c r="C1" s="3"><v>0.5</v></c></row></sheetData>',
    { styles: styles(['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>', '<xf numFmtId="20" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'],
    { numFmts: '<numFmts count="1"><numFmt numFmtId="164" formatCode="d-mmm-yy"/></numFmts>' }) },
  );

  it('writes the short date and other built-in formats by their numbers, so Excel shows them as the system has them', async () => {
    const { book } = await readXlsx(file());
    expect(book.sheet.shownText(0, 0)).toBe('11/5/2026');
    const bytes = await writeXlsx(book, pictures);
    const st = part(bytes, 'xl/styles.xml');
    expect(st).toMatch(/<xf numFmtId="14" /);
    expect(st).toMatch(/<xf numFmtId="20" /);
    expect(st).not.toContain('formatCode="m/d/yyyy"');
    expect(st).not.toContain('formatCode="h:mm"');
  });

  it("keeps a file's own code that is also a built-in one's as its own", async () => {
    const st = part(await writeXlsx((await readXlsx(file())).book, pictures), 'xl/styles.xml');
    expect(st).toMatch(/<numFmt numFmtId="16\d" formatCode="d-mmm-yy"\/>/);
  });

  it('gives a date typed here the short date', async () => {
    const wb = new Workbook();
    wb.edit('type', () => wb.sheet.setInput(0, 0, '11/5/2026'));
    expect(wb.sheet.styleAt(0, 0)?.numFmt).toBe('m/d/yyyy');
    expect(part(await writeXlsx(wb, pictures), 'xl/styles.xml')).toMatch(/<xf numFmtId="14" /);
  });
});

describe('formatting shown here as the nearest thing', () => {
  const file = () => excelFile(
    '<sheetData><row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="2"><v>2</v></c><c r="C1" s="3"><v>3</v></c><c r="D1" s="4"><v>4</v></c></row></sheetData>',
    { styles: styles([
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="centerContinuous" vertical="distributed" shrinkToFit="1" readingOrder="2"/></xf>',
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    ], {
      fonts: [FONT, '<font><strike/><vertAlign val="superscript"/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'],
      fills: '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="darkGrid"><fgColor rgb="FFFF0000"/><bgColor rgb="FFFFFF00"/></patternFill></fill></fills>',
      borders: '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="hair"><color rgb="FF000000"/></left><right style="dashDot"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border></borders>',
    }) },
  );

  it('shows a pattern as its color, hairlines as thin, and centered across the selection as centered', async () => {
    const s = (await readXlsx(file())).book.sheet;
    expect(s.styleAt(0, 0)?.fill).toBe('#ff0000');
    expect(s.styleAt(0, 1)?.borders).toMatchObject({ left: { style: 'thin' }, right: { style: 'dashed' }, top: { style: 'thin' } });
    expect(s.styleAt(0, 2)).toMatchObject({ align: 'center', valign: 'middle' });
  });

  it('writes them back as the file had them', async () => {
    const st = part(await writeXlsx((await readXlsx(file())).book, pictures), 'xl/styles.xml');
    expect(st).toContain('<patternFill patternType="darkGrid"><fgColor rgb="FFFF0000"/><bgColor rgb="FFFFFF00"/></patternFill>');
    expect(st).toMatch(/<left style="hair">.*?<right style="dashDot">.*?<top style="thin">/);
    expect(st).toContain('<alignment horizontal="centerContinuous" vertical="distributed" shrinkToFit="1" readingOrder="2"/>');
    expect(st).toMatch(/<font><strike\/><vertAlign val="superscript"\/><sz val="11"\/>/);
  });

  it('writes what was changed here as it now shows', async () => {
    const { book } = await readXlsx(file());
    const s = book.sheet;
    book.edit('look', () => {
      s.patchStyle({ r1: 0, c1: 0, r2: 0, c2: 0 }, { fill: '#00ff00' });
      s.setBorders({ r1: 0, c1: 1, r2: 0, c2: 1 }, 'all', 'medium');
      s.patchStyle({ r1: 0, c1: 2, r2: 0, c2: 2 }, { align: 'left' });
    });
    const st = part(await writeXlsx(book, pictures), 'xl/styles.xml');
    expect(st).toContain('<patternFill patternType="solid"><fgColor rgb="FF00FF00"/>');
    expect(st).toMatch(/<left style="medium">.*?<right style="medium">/);
    expect(st).toContain('<alignment horizontal="left" vertical="distributed" shrinkToFit="1" readingOrder="2"/>');
  });
});

describe('named cell styles', () => {
  const file = (normalName = 'Normal') => excelFile(
    '<sheetData><row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="2"><v>2</v></c><c r="C1" s="3"><v>3</v></c></row></sheetData>',
    { styles: styles([
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="1" applyFont="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="2" applyFill="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="3" applyFill="1"/>',
    ], {
      fonts: [FONT, '<font><u/><sz val="11"/><color theme="10"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'],
      fills: '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEEFF"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill></fills>',
      cellStyleXfs: '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyNumberFormat="0" applyFill="0" applyBorder="0" applyAlignment="0" applyProtection="0"/>' +
        '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyNumberFormat="0" applyBorder="0" applyAlignment="0" applyProtection="0"/>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',
      cellStyles: `<cellStyles count="5"><cellStyle name="Good" xfId="3" builtinId="26"/><cellStyle name="Hyperlink" xfId="1" builtinId="8"/><cellStyle name="${normalName}" xfId="0" builtinId="0"/>` +
        '<cellStyle name="Sample ID" xfId="2"/><cellStyle name="Unused" xfId="4" customBuiltin="1"/></cellStyles>',
    }).replace('<cellStyleXfs count="1">', '<cellStyleXfs count="5">') },
  );

  it('keeps every one, built-in, the file\'s own and unused, with the cells that use them', async () => {
    const { book } = await readXlsx(file());
    expect(book.sheet.styleAt(0, 0)?.cellStyle).toBe('Hyperlink');
    expect(book.sheet.styleAt(0, 1)?.cellStyle).toBe('Sample ID');
    expect(book.sheet.styleAt(0, 2)?.cellStyle).toBe('Good');
    const st = part(await writeXlsx(book, pictures), 'xl/styles.xml');
    const xfIdOf = (name: string) => Number(new RegExp(`<cellStyle name="${name}" xfId="(\\d+)"`).exec(st)?.[1]);
    expect(st).toMatch(/<cellStyle name="Hyperlink" xfId="\d+" builtinId="8"\/>/);
    expect(st).toMatch(/<cellStyle name="Sample ID" xfId="\d+"\/>/);
    expect(st).toMatch(/<cellStyle name="Unused" xfId="\d+" customBuiltin="1"\/>/);
    expect(st).toMatch(/<cellStyle name="Good" xfId="\d+" builtinId="26"\/>/);
    // the style's own look, with what it applies
    const styleXfs = /<cellStyleXfs count="\d+">(.*?)<\/cellStyleXfs>/.exec(st)![1].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/g)!;
    expect(styleXfs[xfIdOf('Sample ID')]).toMatch(/applyNumberFormat="0" applyBorder="0" applyAlignment="0"><alignment horizontal="center"\/><\/xf>/);
    // the cells point at their style
    const cellXfs = /<cellXfs count="\d+">(.*?)<\/cellXfs>/.exec(st)![1].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/g)!;
    expect(cellXfs.some((x) => x.includes(`xfId="${xfIdOf('Hyperlink')}"`))).toBe(true);
    expect(cellXfs.some((x) => x.includes(`xfId="${xfIdOf('Sample ID')}"`))).toBe(true);
    expect(st).toContain('<cellStyle name="Normal" xfId="0" builtinId="0"/>');
  });

  it("keeps the Normal style's name in the language the file had it", async () => {
    const { book } = await readXlsx(file('Standard'));
    const st = part(await writeXlsx(book, pictures), 'xl/styles.xml');
    expect(st).toContain('<cellStyle name="Standard" xfId="0" builtinId="0"/>');
    expect(st).not.toContain('name="Normal"');
  });
});

describe('row heights', () => {
  it("keeps the sheet's default row height", async () => {
    const { book } = await readXlsx(excelFile('<sheetFormatPr defaultRowHeight="14.25"/><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>'));
    expect(part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml')).toContain('<sheetFormatPr defaultRowHeight="14.25"/>');
    expect(part(await writeXlsx(new Workbook(), pictures), 'xl/worksheets/sheet1.xml')).toContain('<sheetFormatPr defaultRowHeight="15"/>');
  });

  it('writes a row grown to fit its wrapped text as one Excel fits again, and a row set by hand as set', async () => {
    const wb = new Workbook();
    wb.edit('rows', () => { wb.sheet.setInput(0, 0, 'long text'); wb.sheet.setInput(1, 0, 'x'); wb.sheet.setRowHeight(1, 40); });
    const xml = part(await writeXlsx(wb, { ...pictures, rowHeights: () => new Map([[0, 40]]) }), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<row r="1" ht="30">');
    expect(xml).toContain('<row r="2" ht="30" customHeight="1">');
  });
});

describe('chart anchors', () => {
  const chartXml = '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>' +
    '<c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numRef><c:f>Data!$A$1:$A$2</c:f></c:numRef></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:crossAx val="1"/></c:valAx></c:plotArea></c:chart></c:chartSpace>';
  const anchor = (editAs: string) => '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<xdr:twoCellAnchor${editAs}><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>15</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
  const file = (editAs: string) => {
    const pkg = new Package();
    pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
    pkg.add('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
    pkg.relate('xl/workbook.xml', `${R}/worksheet`, 'worksheets/sheet1.xml');
    pkg.add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row></sheetData><drawing r:id="rId1"/></worksheet>`);
    pkg.relate('xl/worksheets/sheet1.xml', `${R}/drawing`, '../drawings/drawing1.xml');
    pkg.add('xl/drawings/drawing1.xml', anchor(editAs));
    pkg.relate('xl/drawings/drawing1.xml', `${R}/chart`, '../charts/chart1.xml');
    pkg.add('xl/charts/chart1.xml', chartXml);
    return pkg.build();
  };
  const editAsOf = async (bytes: Uint8Array) => {
    const { book } = await readXlsx(bytes);
    expect(book.sheet.charts).toHaveLength(1);
    const dr = part(await writeXlsx(book, pictures), 'xl/drawings/drawing1.xml');
    return dr.includes('<xdr:twoCellAnchor>') ? 'twoCell' : /<xdr:twoCellAnchor editAs="(\w+)">/.exec(dr)?.[1];
  };

  it('keeps how a chart follows its cells, as the file had it', async () => {
    expect(await editAsOf(file(''))).toBe('twoCell');
    expect(await editAsOf(file(' editAs="oneCell"'))).toBe('oneCell');
    expect(await editAsOf(file(' editAs="absolute"'))).toBe('absolute');
  });
});
