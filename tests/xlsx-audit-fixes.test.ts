// @vitest-environment jsdom
//
// Excel files, small fixes from the file audit: only the error values Excel's file format holds,
// SORTBY's prefix, no copy of style 0 for plain cells, chemistry subscripts with their cell's whole
// look, and a clear message for a workbook with a password.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, excelFunctionNames, XlsxPictures } from '../src/io/xlsx';
import { writeCfb } from '../src/io/cfb';
import { Workbook } from '../src/sheet/workbook';
import { CellError } from '../src/sheet/values';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const part = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);

describe('error values', () => {
  it('writes the newer errors as #VALUE!, as Excel keeps them in the cell', async () => {
    const wb = new Workbook();
    const s = wb.sheet;
    wb.edit('fill', () => {
      s.setInput(0, 0, '=SEQUENCE(3)');
      s.setInput(1, 0, 'in the way');
      s.setInput(0, 1, '=1/0');
    });
    wb.recalc();
    expect((s.value(0, 0) as CellError).code).toBe('#SPILL!');
    const xml = part(await writeXlsx(wb, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).toMatch(/<c r="A1"[^>]* t="e">.*?<v>#VALUE!<\/v><\/c>/);
    expect(xml).not.toContain('#SPILL!</v>');
    // the classic ones as they are
    expect(xml).toMatch(/<c r="B1"[^>]* t="e"><f>1\/0<\/f><v>#DIV\/0!<\/v><\/c>/);
  });
});

describe('newer functions', () => {
  it('prefixes SORTBY as Excel does (_xlfn. only), SORT and FILTER with _xlws. too', () => {
    expect(excelFunctionNames('SORTBY(A1:A3,B1:B3)')).toBe('_xlfn.SORTBY(A1:A3,B1:B3)');
    expect(excelFunctionNames('SORT(FILTER(A1:A3,B1:B3>0))')).toBe('_xlfn._xlws.SORT(_xlfn._xlws.FILTER(A1:A3,B1:B3>0))');
  });
});

describe('plain cells', () => {
  it('gives cells with no formatting no style (not a copy of style 0)', async () => {
    const wb = new Workbook();
    wb.edit('fill', () => { wb.sheet.setInput(0, 0, '1'); wb.sheet.setInput(0, 1, 'text'); });
    const bytes = await writeXlsx(wb, pictures);
    const xml = part(bytes, 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<c r="A1"><v>1</v></c>');
    expect(xml).toMatch(/<c r="B1" t="s">/);
    expect(part(bytes, 'xl/styles.xml')).toContain('<cellXfs count="1">');
  });
});

describe('chemistry subscripts', () => {
  const book = () => {
    const wb = new Workbook();
    wb.edit('fill', () => {
      wb.sheet.setCell(0, 0, { input: 'H2O', style: { chem: true, bold: true, size: 14, color: '#c00000', font: 'Arial' } });
      wb.sheet.setCell(1, 0, { input: 'H2O', style: { chem: true } });
    });
    return wb;
  };

  it('gives a lowered number its cell\'s whole look, as Excel would otherwise fill in its own', async () => {
    const strings = part(await writeXlsx(book(), pictures), 'xl/sharedStrings.xml');
    // the bold, red, 14 pt Arial cell
    expect(strings).toContain('<r><t>H</t></r><r><rPr><b/><vertAlign val="subscript"/><sz val="14"/><color rgb="FFC00000"/><rFont val="Arial"/><family val="2"/></rPr><t>2</t></r>');
    // the plain cell: its own string, in the workbook's font and size
    expect(strings).toMatch(/<r><t>H<\/t><\/r><r><rPr><vertAlign val="subscript"\/><sz val="11"\/><color theme="1"\/><rFont val="[^"]+"\/><family val="2"\/><scheme val="minor"\/><\/rPr><t>2<\/t><\/r>/);
    expect(strings).toContain('uniqueCount="2"');
  });

  it('comes back without making the lowered number plain in a bold cell', async () => {
    const { book: back } = await readXlsx(await writeXlsx(book(), pictures));
    const runs = back.sheet.cell(0, 0)?.runs ?? [];
    expect(runs.some((r) => r.bold === false || r.size !== undefined || r.color !== undefined || r.font !== undefined)).toBe(false);
    expect(back.sheet.cell(0, 0)?.style).toMatchObject({ bold: true, size: 14, color: '#c00000', font: 'Arial' });
  });
});

describe('a workbook with a password', () => {
  it('says so, instead of calling it damaged', async () => {
    const bytes = writeCfb([['EncryptionInfo', new Uint8Array(64)], ['EncryptedPackage', new Uint8Array(600)]]);
    await expect(readXlsx(bytes)).rejects.toThrow(/protected with a password/);
  });
  it('still calls other files damaged', async () => {
    await expect(readXlsx(writeCfb([['Something', new Uint8Array(64)]]))).rejects.toThrow(/not an Excel workbook/);
  });
});
