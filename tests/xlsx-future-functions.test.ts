// @vitest-environment jsdom
//
// Excel writes functions newer than the 2006 standard with a prefix (_xlfn., or _xlfn._xlws.
// for FILTER and SORT) and needs it to know them. This program adds the prefix to the newer
// functions it knows; ones it doesn't know keep the prefix the file had, so a save doesn't turn
// them into #NAME? in Excel. Functions written without one (a macro's own) stay without.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Package, REL } from '../src/io/ooxml';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const part = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function book(sheetData: string, definedNames = ''): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  const rid = pkg.relate('xl/workbook.xml', `${R}/worksheet`, 'worksheets/sheet1.xml');
  pkg.add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${MAIN}" xmlns:r="${R}"><sheetData>${sheetData}</sheetData></worksheet>`);
  pkg.add('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="Data" sheetId="1" r:id="${rid}"/></sheets>${definedNames}</workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  return pkg.build();
}

const formulaOf = (xml: string, ref: string) => new RegExp(`<c r="${ref}"[^>]*><f>([^<]*)</f>`).exec(xml)?.[1];

describe('prefixes on newer Excel functions', () => {
  const file = () => book(
    '<row r="1"><c r="A1" t="inlineStr"><is><t>two words</t></is></c>' +
    '<c r="B1" t="str"><f>_xlfn.TEXTBEFORE(A1," ")</f><v>two</v></c>' +
    '<c r="C1" t="str"><f>_xlfn.TEXTAFTER(A1," ")&amp;"_xlfn.KEEP("</f><v>x</v></c>' +
    '<c r="D1"><f>_xlfn.XLOOKUP(1,E1:E2,F1:F2)</f><v>3</v></c>' +
    '<c r="E1"><f>MYMACRO(A1)</f><v>5</v></c></row>' +
    '<row r="2"><c r="A2" t="b"><f>_xlfn.REGEXTEST(A1,"t")</f><v>1</v></c></row>',
    '<definedNames><definedName name="firstWord">_xlfn.TEXTBEFORE(Data!$A$1," ")</definedName></definedNames>',
  );

  it('keeps the prefix the file had on functions this program doesn\'t know', async () => {
    const { book: wb } = await readXlsx(file());
    const out = await writeXlsx(wb, pictures);
    const sheet = part(out, 'xl/worksheets/sheet1.xml');
    expect(formulaOf(sheet, 'B1')).toBe('_xlfn.TEXTBEFORE(A1,&quot; &quot;)');
    expect(formulaOf(sheet, 'A2')).toBe('_xlfn.REGEXTEST(A1,&quot;t&quot;)');
    // text in quotes is left alone, and a function this program knows gets its own prefix
    expect(formulaOf(sheet, 'C1')).toBe('_xlfn.TEXTAFTER(A1,&quot; &quot;)&amp;&quot;_xlfn.KEEP(&quot;');
    expect(formulaOf(sheet, 'D1')).toBe('_xlfn.XLOOKUP(1,E1:E2,F1:F2)');
    // a function the file wrote without one stays without
    expect(formulaOf(sheet, 'E1')).toBe('MYMACRO(A1)');
    expect(part(out, 'xl/workbook.xml')).toContain('>_xlfn.TEXTBEFORE(Data!$A$1,&quot; &quot;)</definedName>');
  });

  it('keeps them through a second save', async () => {
    const { book: once } = await readXlsx(await writeXlsx((await readXlsx(file())).book, pictures));
    const sheet = part(await writeXlsx(once, pictures), 'xl/worksheets/sheet1.xml');
    expect(formulaOf(sheet, 'B1')).toBe('_xlfn.TEXTBEFORE(A1,&quot; &quot;)');
    expect(formulaOf(sheet, 'E1')).toBe('MYMACRO(A1)');
  });
});
