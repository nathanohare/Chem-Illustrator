// @vitest-environment jsdom
//
// Excel files saved here as real Excel showed them (Office file audit, laptop checks in Excel 365):
// a table Power Query fills keeps its link to the query (the workbook's data connections, the
// table's query table and its columns' ids), so Excel can still refresh it; row heights written back as the file gave them, without asking Excel to work every formula out
// again when nothing has changed them (after which Excel fits rows again); and Excel 365's #SPILL!
// and #CALC! cells, which it writes as rich values, not counted as pictures placed in cells.

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

describe('row heights as Excel showed them (X21)', () => {
  const sheet = (formulas: string) => '<sheetFormatPr defaultRowHeight="15"/><sheetData>' +
    '<row r="1"><c r="A1"><v>2</v></c>' + formulas + '</row>' +
    '<row r="2" ht="40"><c r="A2" t="inlineStr"><is><t>fitted by Excel</t></is></c></row>' +
    '<row r="3" ht="14.4" customHeight="1"><c r="A3"><v>3</v></c></row></sheetData>';
  const calcPr = (bytes: Uint8Array) => /<calcPr[^>]*\/>/.exec(part(bytes, 'xl/workbook.xml'))?.[0];

  it('writes the heights back in the points the file gave', async () => {
    const { book } = await readXlsx(excelBook([['Data', sheet('')]]));
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<row r="2" ht="40">');
    expect(xml).toContain('<row r="3" ht="14.4" customHeight="1">');
  });

  it('asks Excel to work formulas out again only when there are some it needs to', async () => {
    // no formulas
    let book = (await readXlsx(excelBook([['Data', sheet('')]]))).book;
    expect(calcPr(await writeXlsx(book, pictures))).toBe('<calcPr calcId="191029"/>');
    // formulas with the values Excel saved, until something changes
    book = (await readXlsx(excelBook([['Data', sheet('<c r="B1"><f>A1*2</f><v>4</v></c><c r="C1" t="str"><f>"n"&amp;A1</f><v>n2</v></c>')]]))).book;
    expect(calcPr(await writeXlsx(book, pictures))).toBe('<calcPr calcId="191029"/>');
    book.edit('type', () => book.sheets[0].setInput(0, 0, '5'));
    expect(calcPr(await writeXlsx(book, pictures))).toBe('<calcPr calcId="191029" fullCalcOnLoad="1"/>');
    // a value that differs from the one worked out here, or none
    for (const f of ['<c r="B1"><f>A1*2</f><v>5</v></c>', '<c r="B1"><f>A1*2</f></c>']) {
      book = (await readXlsx(excelBook([['Data', sheet(f)]]))).book;
      expect(calcPr(await writeXlsx(book, pictures))).toBe('<calcPr calcId="191029" fullCalcOnLoad="1"/>');
    }
    // a file that asks for it itself
    book = (await readXlsx(excelBook([['Data', sheet('<c r="B1"><f>A1*2</f><v>4</v></c>')]], {
      workbook: (list) => `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets>${list}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    }))).book;
    expect(calcPr(await writeXlsx(book, pictures))).toBe('<calcPr calcId="191029" fullCalcOnLoad="1"/>');
  });
});

describe('a table Power Query fills (P3, X16)', () => {
  const SHEET = 'xl/worksheets/sheet1.xml';
  const CONNECTIONS = `<connections xmlns="${MAIN}"><connection id="1" keepAlive="1" name="Query - Assays" description="Connection to the 'Assays' query in the workbook." type="5" refreshedVersion="8" background="1" saveData="1">` +
    '<dbPr connection="Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=Assays;Extended Properties=&quot;&quot;" command="SELECT * FROM [Assays]"/></connection></connections>';
  const MODEL = `<connections xmlns="${MAIN}" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><connection id="1" name="ThisWorkbookDataModel" type="5" refreshedVersion="8" background="1">` +
    '<dbPr connection="Data Model Connection" command="Model" commandType="1"/><extLst><ext uri="{DE250136-89BD-433C-8126-D09CA5730AF9}"><x15:connection id="" model="1"/></ext></extLst></connection></connections>';
  // (a column the query no longer gives was taken out in Excel: the ids go 1, 3, 4)
  const QUERY = `<queryTable xmlns="${MAIN}" name="ExternalData_1" autoFormatId="16" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="0" connectionId="1">` +
    '<queryTableRefresh nextId="5"><queryTableFields count="3"><queryTableField id="1" name="Compound" tableColumnId="1"/><queryTableField id="3" name="Yield" tableColumnId="3"/><queryTableField id="4" name="Mass" tableColumnId="4"/></queryTableFields>' +
    '<queryTableDeletedFields count="1"><deletedField name="Notes"/></queryTableDeletedFields></queryTableRefresh></queryTable>';
  const TABLE = `<table xmlns="${MAIN}" id="1" name="Assays" displayName="Assays" ref="A1:C3" tableType="queryTable" totalsRowShown="0"><autoFilter ref="A1:C3"/>` +
    '<tableColumns count="3"><tableColumn id="1" uniqueName="1" name="Compound" queryTableFieldId="1"/><tableColumn id="3" uniqueName="3" name="Yield" queryTableFieldId="3"/>' +
    '<tableColumn id="4" uniqueName="4" name="Mass" queryTableFieldId="4"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>';
  const cells = '<sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Compound</t></is></c><c r="B1" t="inlineStr"><is><t>Yield</t></is></c><c r="C1" t="inlineStr"><is><t>Mass</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>2a</t></is></c><c r="B2"><v>0.81</v></c><c r="C2"><v>120.5</v></c></row>' +
    '<row r="3"><c r="A3" t="inlineStr"><is><t>2b</t></is></c><c r="B3"><v>0.64</v></c><c r="C3"><v>134.2</v></c></row>' +
    '</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts>';
  const file = (connections = CONNECTIONS) => excelBook([['Data', cells]], {
    workbook: (list) => `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets>${list}</sheets><definedNames><definedName name="ExternalData_1" localSheetId="0" hidden="1">Data!$A$1:$C$3</definedName></definedNames></workbook>`,
    parts: [
      { path: 'xl/tables/table1.xml', from: SHEET, rel: `${R}/table`, target: '../tables/table1.xml', xml: TABLE, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml' },
      { path: 'xl/queryTables/queryTable1.xml', from: 'xl/tables/table1.xml', rel: `${R}/queryTable`, target: '../queryTables/queryTable1.xml', xml: QUERY, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml' },
      { path: 'xl/connections.xml', rel: `${R}/connections`, xml: connections, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml' },
    ],
  });
  const tableOut = (bytes: Uint8Array) => part(bytes, 'xl/tables/table1.xml');

  it('keeps the connection, the query table and the table\'s link to it, and says nothing of them on opening', async () => {
    const { book, warnings } = await readXlsx(file());
    expect(warnings.join(' ')).not.toMatch(/connection|query/);
    const saved = await writeXlsx(book, pictures);
    expect(part(saved, 'xl/connections.xml')).toBe(CONNECTIONS);
    expect(part(saved, 'xl/_rels/workbook.xml.rels')).toContain('relationships/connections" Target="connections.xml"');
    expect(part(saved, '[Content_Types].xml')).toContain('PartName="/xl/connections.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"');
    const table = tableOut(saved);
    expect(table).toMatch(/^<\?xml[^>]*>\s*<table [^>]*ref="A1:C3" tableType="queryTable"/);
    expect(table).toContain('<tableColumn id="1" uniqueName="1" name="Compound" queryTableFieldId="1"/><tableColumn id="3" uniqueName="3" name="Yield" queryTableFieldId="3"/><tableColumn id="4" uniqueName="4" name="Mass" queryTableFieldId="4"/>');
    expect(part(saved, 'xl/tables/_rels/table1.xml.rels')).toContain('relationships/queryTable" Target="../queryTables/queryTable1.xml"');
    expect(part(saved, 'xl/queryTables/queryTable1.xml')).toBe(QUERY);
    expect(part(saved, '[Content_Types].xml')).toContain('PartName="/xl/queryTables/queryTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml"');
    expect(part(saved, 'xl/workbook.xml')).toContain('<definedName name="ExternalData_1" localSheetId="0" hidden="1">Data!$A$1:$C$3</definedName>');
    // (our own part doesn't hold a second copy)
    expect(part(saved, 'customXml/item1.xml')).not.toContain('queryTableField');
    // and again from this program's own file
    const again = await writeXlsx((await readXlsx(saved)).book, pictures);
    expect(tableOut(again)).toContain('tableType="queryTable"');
    expect(part(again, 'xl/queryTables/queryTable1.xml')).toBe(QUERY);
    expect(part(again, 'xl/connections.xml')).toBe(CONNECTIONS);
  });

  it('lets the table\'s link go when its place or columns change here', async () => {
    for (const change of ['rows', 'name'] as const) {
      const { book } = await readXlsx(file());
      const s = book.sheets[0];
      if (change === 'rows') book.edit('resize', () => s.setTables([{ ...s.tables[0], range: { ...s.tables[0].range, r2: 3 } }]));
      else book.edit('type', () => s.setInput(0, 1, 'Yield (%)'));
      const saved = await writeXlsx(book, pictures);
      expect(tableOut(saved), change).not.toContain('queryTable');
      expect(tableOut(saved), change).toContain('<tableColumn id="2" name="');
      expect(unzipSync(saved)['xl/queryTables/queryTable1.xml'], change).toBeUndefined();
      expect(unzipSync(saved)['xl/tables/_rels/table1.xml.rels'], change).toBeUndefined();
    }
  });

  it('leaves out connections to a Data Model, and says so', async () => {
    const { book, warnings } = await readXlsx(file(MODEL));
    expect(warnings.find((w) => w.startsWith('Not shown here'))).toMatch(/1 data connection.*1 query table's link/);
    const saved = await writeXlsx(book, pictures);
    expect(unzipSync(saved)['xl/connections.xml']).toBeUndefined();
    expect(tableOut(saved)).not.toContain('queryTable');
  });
});
