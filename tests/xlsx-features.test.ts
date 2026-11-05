// @vitest-environment jsdom
//
// Excel files: what the file says that this program doesn't use is kept and saved back, or
// named on opening. Excel's values for formulas worked out here as errors; protection; tables
// without a header row, their exact column names and calculated columns; pictures placed in
// cells; sheet views and settings; and the workbook features that are left out.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Package, REL } from '../src/io/ooxml';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const part = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WS = `${R}/worksheet`;

/** A workbook made the way Excel writes it: sheets (name and body), and any other parts with their relationships. */
function excelBook(sheets: [string, string][], extra: {
  workbook?: (sheetsXml: string) => string;
  parts?: { path: string; xml: string | Uint8Array; type?: string; from?: string; rel?: string }[];
} = {}): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  const list = sheets.map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="${pkg.relate('xl/workbook.xml', WS, `worksheets/sheet${i + 1}.xml`)}"/>`).join('');
  sheets.forEach(([, body], i) => pkg.add(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="${MAIN}" xmlns:r="${R}">${body}</worksheet>`));
  for (const p of extra.parts ?? []) {
    pkg.add(p.path, p.xml, p.type);
    if (p.rel) pkg.relate(p.from ?? 'xl/workbook.xml', p.rel, p.path.replace(/^xl\//, p.from?.startsWith('xl/worksheets/') ? '../' : ''));
  }
  pkg.add('xl/workbook.xml', extra.workbook?.(list) ?? `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets>${list}</sheets></workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  return pkg.build();
}

const cellXml = (sheetXml: string, ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>.*?</c>)`).exec(sheetXml)?.[0] ?? '';

describe('values of formulas this program can\'t work out (X17)', () => {
  const file = () => excelBook([
    ['Data', '<sheetData>' +
      '<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>CUBEVALUE("Sales",A1)</f><v>42</v></c><c r="C1"><f>B1+1</f><v>43</v></c><c r="D1"><v>9</v></c></row>' +
      '<row r="2"><c r="A2"><f>SUM(Data:Other!A1)</f><v>7</v></c><c r="B2" t="str"><f>PHONETIC(A1)</f><v>two x</v></c><c r="C2"><f>A1/2</f><v>1</v></c><c r="D2" t="e"><f>CUBEMEMBER("Sales",0)</f><v>#N/A</v></c></row>' +
      '</sheetData>'],
    ['Other', '<sheetData><row r="1"><c r="A1"><v>5</v></c></row></sheetData>'],
  ]);

  it('saves the value Excel had, not the error worked out here', async () => {
    const { book } = await readXlsx(file());
    expect(book.sheet.value(0, 1)).toMatchObject({ code: '#NAME?' });
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(cellXml(xml, 'B1')).toBe('<c r="B1"><f>CUBEVALUE(&quot;Sales&quot;,A1)</f><v>42</v></c>');
    // a formula reading it, and a 3D reference this program can't read
    expect(cellXml(xml, 'C1')).toBe('<c r="C1"><f>B1+1</f><v>43</v></c>');
    expect(cellXml(xml, 'A2')).toBe('<c r="A2"><f>SUM(Data:Other!A1)</f><v>7</v></c>');
    // text and error values keep their kinds
    expect(cellXml(xml, 'B2')).toBe('<c r="B2" t="str"><f>PHONETIC(A1)</f><v>two x</v></c>');
    expect(cellXml(xml, 'D2')).toBe('<c r="D2" t="e"><f>CUBEMEMBER(&quot;Sales&quot;,0)</f><v>#N/A</v></c>');
    // a formula worked out here has its own value
    expect(cellXml(xml, 'C2')).toBe('<c r="C2"><f>A1/2</f><v>1</v></c>');
  });

  it('keeps it while what the formula reads is unchanged, and lets it go when that changes', async () => {
    const { book } = await readXlsx(file());
    const s = book.sheet;
    // an edit elsewhere: the formulas that can be read keep Excel's values, the 3D one can't tell
    book.edit('type', () => s.setInput(3, 3, '1'));
    book.recalc();
    let xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(cellXml(xml, 'B1')).toContain('<v>42</v>');
    expect(cellXml(xml, 'C1')).toContain('<v>43</v>');
    expect(cellXml(xml, 'A2')).toBe('<c r="A2" t="e"><f>SUM(Data:Other!A1)</f><v>#NAME?</v></c>');
    // the cell it reads changed: Excel's value is out of date, and so is the one reading it
    book.edit('type', () => s.setInput(0, 0, '3'));
    book.recalc();
    xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(cellXml(xml, 'B1')).toContain('<v>#NAME?</v>');
    expect(cellXml(xml, 'C1')).toContain('<v>#NAME?</v>');
    expect(cellXml(xml, 'B2')).toContain('<v>#NAME?</v>');
    // the formula changed
    book.edit('type', () => s.setInput(1, 3, '=CUBEMEMBER("Sales",1)'));
    book.recalc();
    xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(cellXml(xml, 'D2')).toContain('<v>#NAME?</v>');
  });
});

describe('protection (X10)', () => {
  const XR = 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision';
  const styles = '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection hidden="1"/></xf></cellXfs>';
  const file = () => excelBook([
    ['Inventory', '<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" s="1"><v>2</v></c><c r="C1" s="2"><f>A1+B1</f><v>3</v></c></row></sheetData>' +
      '<sheetProtection algorithmName="SHA-512" hashValue="aGFzaA==" saltValue="c2FsdA==" spinCount="100000" sheet="1" objects="1" scenarios="1" formatColumns="0"/>' +
      `<protectedRanges><protectedRange xmlns:xr="${XR}" xr:uid="{00000000-0001-0000-0000-000000000000}" sqref="B1:B9" name="Amounts"/></protectedRanges>` +
      '<autoFilter ref="A1:C1"/>'],
  ], {
    workbook: (list) => `<workbook xmlns="${MAIN}" xmlns:r="${R}"><fileSharing readOnlyRecommended="1" userName="Lab"/><workbookPr/>` +
      `<workbookProtection workbookAlgorithmName="SHA-512" workbookHashValue="d2I=" workbookSaltValue="c2FsdA==" workbookSpinCount="100000" lockStructure="1"/><sheets>${list}</sheets></workbook>`,
    parts: [{ path: 'xl/styles.xml', xml: `<styleSheet xmlns="${MAIN}">${styles}</styleSheet>`, rel: `${R}/styles` }],
  });

  it('keeps sheet and workbook protection, edit ranges, and unlocked and hidden cells', async () => {
    const { book } = await readXlsx(file());
    expect(book.sheet.styleAt(0, 1)).toEqual({ unlocked: true });
    expect(book.sheet.styleAt(0, 2)).toEqual({ formulaHidden: true });
    const saved = await writeXlsx(book, pictures);
    const sheet = part(saved, 'xl/worksheets/sheet1.xml');
    // in their places: after the cells, before the filter
    expect(sheet).toContain('</sheetData><sheetProtection algorithmName="SHA-512" hashValue="aGFzaA==" saltValue="c2FsdA==" spinCount="100000" sheet="1" objects="1" scenarios="1" formatColumns="0"/>' +
      '<protectedRanges><protectedRange sqref="B1:B9" name="Amounts"/></protectedRanges><autoFilter ');
    const wb = part(saved, 'xl/workbook.xml');
    expect(wb).toMatch(/<workbook [^>]*><fileSharing readOnlyRecommended="1" userName="Lab"\/><workbookPr\/><workbookProtection workbookAlgorithmName="SHA-512" workbookHashValue="d2I=" workbookSaltValue="c2FsdA==" workbookSpinCount="100000" lockStructure="1"\/><bookViews>/);
    const st = part(saved, 'xl/styles.xml');
    const xfs = /<cellXfs[^>]*>(.*?)<\/cellXfs>/.exec(st)![1].match(/<xf [^>]*\/>|<xf [^>]*>.*?<\/xf>/g)!;
    const xfOf = (ref: string) => xfs[Number(new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(sheet)?.[1] ?? 0)];
    expect(xfOf('B1')).toMatch(/applyProtection="1"><protection locked="0"\/><\/xf>$/);
    expect(xfOf('C1')).toMatch(/applyProtection="1"><protection hidden="1"\/><\/xf>$/);
    // and again from our own file
    const again = await writeXlsx((await readXlsx(saved)).book, pictures);
    expect(part(again, 'xl/worksheets/sheet1.xml')).toContain('<sheetProtection algorithmName="SHA-512"');
    expect(part(again, 'xl/workbook.xml')).toContain('lockStructure="1"');
  });
});
