// @vitest-environment jsdom
//
// Conditional formats from Excel that compare cells with another cell or a formula ("greater than
// $B$1"): kept as that comparison (a formula rule), not turned into a comparison with the text "$B$1".

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Workbook } from '../src/sheet/workbook';
import { isError } from '../src/sheet/values';
import { workOutLooks } from '../src/sheet/conditional';
import { keyOf } from '../src/sheet/refs';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const part = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** A one-sheet workbook as Excel writes it, with this sheet body (sheetData and after). */
function excelFile(sheetBody: string, dxfs = '<dxfs count="0"/>'): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(`${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8(`${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`${HEAD}<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>${dxfs}</styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(`${HEAD}<worksheet xmlns="${MAIN}">${sheetBody}</worksheet>`),
  });
}

describe('conditional formats compared with a cell', () => {
  const sheet = (rule: string) => excelFile(
    '<sheetData><row r="1"><c r="A1"><v>3</v></c><c r="B1"><v>5</v></c></row><row r="2"><c r="A2"><v>7</v></c></row><row r="3"><c r="A3"><v>5</v></c></row></sheetData>' +
    `<conditionalFormatting sqref="A1:A3">${rule}</conditionalFormatting>`,
    '<dxfs count="1"><dxf><fill><patternFill><bgColor rgb="FFFF0000"/></patternFill></fill></dxf></dxfs>');
  const hits = (wb: Workbook) => {
    const m = workOutLooks(wb.sheet.condFormats, { value: (r, c) => wb.sheet.value(r, c), formulaAt: (f, home, r, c) => wb.formulaAt(wb.sheet, f, home, r, c) }, wb.sheet.lastRow, wb.sheet.lastCol);
    return [0, 1, 2].filter((r) => m.has(keyOf(r, 0)));
  };

  it('keeps "greater than $B$1" comparing with the cell, not with the text "$B$1"', async () => {
    const { book } = await readXlsx(sheet('<cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>$B$1</formula></cfRule>'));
    book.recalc();
    expect(book.sheet.condFormats[0].rule).toMatchObject({ kind: 'formula', formula: '=A1>($B$1)' });
    expect(hits(book)).toEqual([1]);
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<cfRule type="expression" dxfId="0" priority="1"><formula>A1&gt;($B$1)</formula></cfRule>');
    expect(xml).not.toContain('&quot;$B$1&quot;');
  });

  it('turns "between" with a cell into a formula that takes the ends either way round', async () => {
    const { book } = await readXlsx(sheet('<cfRule type="cellIs" dxfId="0" priority="1" operator="between"><formula>$B$1</formula><formula>2*2</formula></cfRule>'));
    book.recalc();
    expect(book.sheet.condFormats[0].rule).toMatchObject({ kind: 'formula', formula: '=AND(A1>=MIN($B$1,2*2),A1<=MAX($B$1,2*2))' });
    expect(hits(book)).toEqual([2]);
  });

  it('leaves numbers and text as cell rules', async () => {
    const { book } = await readXlsx(sheet('<cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>"Ph"</formula></cfRule><cfRule type="cellIs" dxfId="0" priority="2" operator="lessThan"><formula>4</formula></cfRule>'));
    expect(book.sheet.condFormats.map((c) => c.rule)).toMatchObject([{ kind: 'cells', op: 'eq', value: 'Ph' }, { kind: 'cells', op: 'lt', value: 4 }]);
    expect(isError(book.sheet.value(0, 0))).toBe(false);
  });
});
