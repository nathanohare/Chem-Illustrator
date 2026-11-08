// @vitest-environment jsdom
//
// Excel files saved here as real Excel showed them (Office file audit, laptop checks in Excel 365):
// Excel 365's #SPILL! and #CALC! cells, which it writes as rich values, are not counted as
// pictures placed in cells.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Package, REL } from '../src/io/ooxml';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const part = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WS = `${R}/worksheet`;

interface Extra {
  workbook?: (sheetsXml: string) => string;
  parts?: { path: string; xml: string | Uint8Array; type?: string; from?: string; rel?: string; target?: string }[];
}

/** A workbook made the way Excel writes it: sheets (name and body), and any other parts with their relationships. */
function excelBook(sheets: [string, string][], extra: Extra = {}): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  const list = sheets.map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="${pkg.relate('xl/workbook.xml', WS, `worksheets/sheet${i + 1}.xml`)}"/>`).join('');
  sheets.forEach(([, body], i) => pkg.add(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="${MAIN}" xmlns:r="${R}">${body}</worksheet>`));
  for (const p of extra.parts ?? []) {
    pkg.add(p.path, p.xml, p.type);
    if (p.rel) pkg.relate(p.from ?? 'xl/workbook.xml', p.rel, p.target ?? p.path.replace(/^xl\//, ''));
  }
  pkg.add('xl/workbook.xml', extra.workbook?.(list) ?? `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets>${list}</sheets></workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  return pkg.build();
}

const cellXml = (sheetXml: string, ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>.*?</c>)`).exec(sheetXml)?.[0] ?? '';

describe('#SPILL! and #CALC! cells are not pictures', () => {
  const RD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
  const RD_REL = 'http://schemas.microsoft.com/office/2017/06/relationships';
  const rvb = (i: number) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${i}"/></ext></extLst></bk>`;
  const TYPE = 'minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"';
  // as Excel 365 writes a spilled formula that is blocked (#SPILL!), a FILTER with nothing to show
  // (#CALC!) and, with `picture`, a picture placed in a cell
  const file = (picture: boolean) => excelBook([['Data', '<sheetData>' +
    `<row r="1"><c r="A1"><v>1</v></c><c r="B1" cm="1" vm="1" t="e"><f t="array" ref="B1">SEQUENCE(3)</f><v>#VALUE!</v></c>` +
    `<c r="C1" cm="1" vm="2" t="e"><f t="array" ref="C1">_xlfn._xlws.FILTER(A1:A1,A1:A1&gt;5)</f><v>#VALUE!</v></c>${picture ? '<c r="D1" vm="3" t="e"><v>#VALUE!</v></c>' : ''}</row>` +
    '<row r="2"><c r="B2"><v>5</v></c></row></sheetData>']], {
    parts: [
      { path: 'xl/metadata.xml', rel: `${R}/sheetMetadata`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml',
        xml: `<metadata xmlns="${MAIN}" xmlns:xlrd="${RD}" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">` +
          `<metadataTypes count="2"><metadataType name="XLDAPR" ${TYPE} cellMeta="1"/><metadataType name="XLRICHVALUE" ${TYPE}/></metadataTypes>` +
          '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>' +
          `<futureMetadata name="XLRICHVALUE" count="3">${rvb(0)}${rvb(1)}${rvb(2)}</futureMetadata>` +
          '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata>' +
          '<valueMetadata count="3"><bk><rc t="2" v="0"/></bk><bk><rc t="2" v="1"/></bk><bk><rc t="2" v="2"/></bk></valueMetadata></metadata>' },
      { path: 'xl/richData/rdrichvaluestructure.xml', rel: `${RD_REL}/rdRichValueStructure`, type: 'application/vnd.ms-excel.rdrichvaluestructure+xml',
        xml: `<rvStructures xmlns="${RD}" count="3"><s t="_error"><k n="colOffset" t="i"/><k n="errorType" t="i"/><k n="rwOffset" t="i"/><k n="subType" t="i"/></s>` +
          '<s t="_error"><k n="errorType" t="i"/></s><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>' },
      { path: 'xl/richData/rdrichvalue.xml', rel: `${RD_REL}/rdRichValue`, type: 'application/vnd.ms-excel.rdrichvalue+xml',
        xml: `<rvData xmlns="${RD}" count="3"><rv s="0"><v>0</v><v>8</v><v>1</v><v>1</v></rv><rv s="1"><v>13</v></rv><rv s="2"><v>0</v><v>5</v></rv></rvData>` },
    ],
  });

  it('gives no notice for error values', async () => {
    const { book, warnings } = await readXlsx(file(false));
    expect(warnings.filter((w) => /placed in/.test(w))).toEqual([]);
    // (and the cells keep their pointers for Excel)
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(cellXml(xml, 'B1')).toContain('vm="1"');
    expect(cellXml(xml, 'C1')).toContain('vm="2"');
  });

  it('counts only the picture beside them', async () => {
    const { warnings } = await readXlsx(file(true));
    expect(warnings).toContain('1 cell holds a picture placed in it in Excel: shown as #VALUE! here, and kept for Excel unless the cell is changed.');
  });
});
