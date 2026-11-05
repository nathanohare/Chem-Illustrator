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
  parts?: { path: string; xml: string | Uint8Array; type?: string; from?: string; rel?: string; target?: string }[];
} = {}): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  const list = sheets.map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="${pkg.relate('xl/workbook.xml', WS, `worksheets/sheet${i + 1}.xml`)}"/>`).join('');
  sheets.forEach(([, body], i) => pkg.add(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="${MAIN}" xmlns:r="${R}">${body}</worksheet>`));
  for (const p of extra.parts ?? []) {
    pkg.add(p.path, p.xml, p.type);
    if (p.rel) pkg.relate(p.from ?? 'xl/workbook.xml', p.rel, p.target ?? p.path.replace(/^xl\//, p.from?.startsWith('xl/worksheets/') ? '../' : ''));
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

describe('tables (X11)', () => {
  const TABLE_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml';
  const file = () => excelBook([
    ['Members', '<sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>4</v></c><c r="C2" t="str"><f>Member_Data[[#This Row],[Gender ]]&amp;"!"</f><v>F!</v></c></row>' +
      '<row r="5"><c r="E5"><v>99</v></c></row>' +
      '</sheetData><tableParts count="2"><tablePart r:id="rId1"/><tablePart r:id="rId2"/></tableParts>'],
  ], {
    parts: [
      { path: 'xl/sharedStrings.xml', xml: `<sst xmlns="${MAIN}"><si><t xml:space="preserve">Gender </t></si><si><t xml:space="preserve">Handle
Bars</t></si><si><t>Shout</t></si><si><t>F</t></si></sst>`, rel: `${R}/sharedStrings` },
      { path: 'xl/tables/table1.xml', type: TABLE_CT, from: 'xl/worksheets/sheet1.xml', rel: `${R}/table`,
        xml: `<table xmlns="${MAIN}" id="1" name="Member_Data" displayName="Member_Data" ref="A1:C2" totalsRowShown="0"><autoFilter ref="A1:C2"/>` +
          '<sortState ref="A2:C2"><sortCondition descending="1" ref="B2:B2"/></sortState>' +
          '<tableColumns count="3"><tableColumn id="1" name="Gender "/><tableColumn id="2" name="Handle_x000a_Bars"/>' +
          '<tableColumn id="3" name="Shout"><calculatedColumnFormula>Member_Data[[#This Row],[Gender ]]&amp;"!"</calculatedColumnFormula></tableColumn></tableColumns>' +
          '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>' },
      { path: 'xl/tables/table2.xml', type: TABLE_CT, from: 'xl/worksheets/sheet1.xml', rel: `${R}/table`,
        xml: `<table xmlns="${MAIN}" id="2" name="Single" displayName="Single" ref="E5" headerRowCount="0" totalsRowShown="0">` +
          '<tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/></table>' },
    ],
  });

  it('keeps a table without a header row as one, with its first row as data', async () => {
    const { book } = await readXlsx(file());
    expect(book.sheet.tables[1]).toMatchObject({ name: 'Single', header: false });
    const saved = await writeXlsx(book, pictures);
    const sheet = part(saved, 'xl/worksheets/sheet1.xml');
    expect(cellXml(sheet, 'E5')).toBe('<c r="E5"><v>99</v></c>');
    const t2 = part(saved, 'xl/tables/table2.xml');
    expect(t2).toContain('ref="E5" headerRowCount="0" totalsRowShown="0">');
    expect(t2).toContain('<tableColumn id="1" name="Amount"/>');
    expect(t2).not.toContain('autoFilter');
    expect((await readXlsx(saved)).book.sheet.tables[1].header).toBe(false);
  });

  it('names columns exactly as their header cells, and keeps calculated columns and the sort', async () => {
    const { book } = await readXlsx(file());
    const saved = await writeXlsx(book, pictures);
    const t1 = part(saved, 'xl/tables/table1.xml');
    expect(t1).toContain('<tableColumn id="1" name="Gender "/><tableColumn id="2" name="Handle_x000a_Bars"/>' +
      '<tableColumn id="3" name="Shout"><calculatedColumnFormula>Member_Data[[#This Row],[Gender ]]&amp;&quot;!&quot;</calculatedColumnFormula></tableColumn>');
    expect(t1).toContain('<autoFilter ref="A1:C2"></autoFilter><sortState ref="A2:C2"><sortCondition descending="1" ref="B2:B2"/></sortState><tableColumns');
    // the header cells as they were
    const strings = part(saved, 'xl/sharedStrings.xml');
    expect(strings).toContain('<t xml:space="preserve">Gender </t>');
    expect(strings).toContain('<t xml:space="preserve">Handle\nBars</t>');
  });
});

describe('pictures placed in cells (X13)', () => {
  const RD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
  const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
  const PICTURE = new Uint8Array([...PNG, 1, 2, 3]);
  // as Excel 365 writes a picture placed in a cell
  const file = () => excelBook([['Structures', '<sheetData><row r="1"><c r="A1" t="e" vm="1"><v>#VALUE!</v></c><c r="C1"><v>5</v></c></row></sheetData>']], {
    parts: [
      { path: 'xl/metadata.xml', rel: `${R}/sheetMetadata`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml',
        xml: `<metadata xmlns="${MAIN}" xmlns:xlrd="${RD}"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes>` +
          '<futureMetadata name="XLRICHVALUE" count="1"><bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata>' +
          '<valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>' },
      { path: 'xl/richData/rdrichvaluestructure.xml', rel: 'http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure', type: 'application/vnd.ms-excel.rdrichvaluestructure+xml',
        xml: `<rvStructures xmlns="${RD}" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>` },
      { path: 'xl/richData/rdrichvalue.xml', rel: 'http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue', type: 'application/vnd.ms-excel.rdrichvalue+xml',
        xml: `<rvData xmlns="${RD}" count="1"><rv s="0"><v>0</v><v>5</v></rv></rvData>` },
      { path: 'xl/richData/richValueRel.xml', rel: 'http://schemas.microsoft.com/office/2022/10/relationships/richValueRel', type: 'application/vnd.ms-excel.richvaluerel+xml',
        xml: `<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="${R}"><rel r:id="rId1"/></richValueRels>` },
      { path: 'xl/media/image1.png', xml: PICTURE, type: 'image/png', from: 'xl/richData/richValueRel.xml', rel: `${R}/image`, target: '../media/image1.png' },
    ],
  });

  it('says so on opening, and keeps the picture and its cell for Excel', async () => {
    const { book, warnings } = await readXlsx(file());
    expect(warnings).toContain('1 cell holds a picture or other value placed in it in Excel: shown as #VALUE! here, and kept for Excel unless the cell is changed.');
    // a dynamic array formula and a floating picture of this program's own, beside it
    book.edit('type', () => book.sheet.setInput(0, 1, '=SEQUENCE(2)'));
    book.build(() => book.sheet.setObjects([{ id: 1, kind: 'picture', at: { row: 4, col: 4, dx: 0, dy: 0 }, w: 10, h: 10, src: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}` }]));
    book.recalc();
    const saved = await writeXlsx(book, pictures);
    const files = unzipSync(saved);
    expect(cellXml(part(saved, 'xl/worksheets/sheet1.xml'), 'A1')).toBe('<c r="A1" vm="1" t="e"><v>#VALUE!</v></c>');
    // the value metadata after Excel's dynamic array kind, pointing at the second kind
    const meta = part(saved, 'xl/metadata.xml');
    expect(meta).toMatch(/<metadataTypes count="2"><metadataType name="XLDAPR"[^>]*\/><metadataType name="XLRICHVALUE"[^>]*\/><\/metadataTypes>/);
    expect(meta).toContain(`<xlrd:rvb xmlns:xlrd="${RD}" i="0"/>`);
    expect(meta).toContain('<valueMetadata count="1"><bk><rc t="2" v="0"/></bk></valueMetadata>');
    expect(new DOMParser().parseFromString(meta, 'application/xml').getElementsByTagName('parsererror').length).toBe(0);
    // the rich value's parts, and its picture under a name of its own
    expect(part(saved, 'xl/richData/rdrichvalue.xml')).toContain('<rv s="0"><v>0</v><v>5</v></rv>');
    const relTarget = /Target="([^"]+)"/.exec(part(saved, 'xl/richData/_rels/richValueRel.xml.rels'))![1];
    expect(relTarget).not.toBe('../media/image1.png');
    expect(files[`xl/${relTarget.replace('../', '')}`]).toEqual(PICTURE);
    expect(files['xl/media/image1.png']).toEqual(PNG);
    const wbRels = part(saved, 'xl/_rels/workbook.xml.rels');
    expect(wbRels).toContain('relationships/rdRichValue" Target="richData/rdrichvalue.xml"');
    expect(wbRels).toContain('relationships/richValueRel" Target="richData/richValueRel.xml"');
    expect(part(saved, '[Content_Types].xml')).toContain('PartName="/xl/richData/rdrichvalue.xml" ContentType="application/vnd.ms-excel.rdrichvalue+xml"');
    // and again from this program's own file
    const again = await writeXlsx((await readXlsx(saved)).book, pictures);
    expect(cellXml(part(again, 'xl/worksheets/sheet1.xml'), 'A1')).toContain('vm="1"');
  });

  it('lets the pointer go when the cell is changed', async () => {
    const { book } = await readXlsx(file());
    book.edit('type', () => book.sheet.setInput(0, 0, 'replaced'));
    const xml = part(await writeXlsx(book, pictures), 'xl/worksheets/sheet1.xml');
    expect(xml).not.toContain('vm=');
  });
});

describe('features left out (X16)', () => {
  const SHEET = 'xl/worksheets/sheet1.xml';
  const vml = '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<v:shape id="a"><x:ClientData ObjectType="Checkbox"/></v:shape><v:shape id="b"><x:ClientData ObjectType="Checkbox"/></v:shape>' +
    '<v:shape id="c"><x:ClientData ObjectType="Note"><x:Row>0</x:Row><x:Column>0</x:Column></x:ClientData></v:shape></xml>';
  const file = () => excelBook([['Data', '<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData><picture r:id="rId5"/><tableParts count="1"><tablePart r:id="rId6"/></tableParts>']], {
    // (the macro sheet's relationship is the workbook's fourth)
    workbook: (list) => `<workbook xmlns="${MAIN}" xmlns:r="${R}"><sheets>${list}<sheet name="Macro1" sheetId="2" r:id="rId4"/></sheets></workbook>`,
    parts: [
      { path: 'xl/connections.xml', rel: `${R}/connections`, xml: `<connections xmlns="${MAIN}"><connection id="1" name="Assays" type="1"/><connection id="2" name="Web" type="4"/></connections>` },
      { path: 'xl/xmlMaps.xml', rel: `${R}/xmlMaps`, xml: `<MapInfo xmlns="${MAIN}" SelectionNamespaces=""/>` },
      { path: 'xl/macrosheets/sheet1.xml', rel: 'http://schemas.microsoft.com/office/2006/relationships/xlMacrosheet', xml: `<xm:macrosheet xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" xmlns="${MAIN}"><sheetData/></xm:macrosheet>` },
      { path: 'xl/drawings/vmlDrawing1.vml', from: SHEET, rel: `${R}/vmlDrawing`, xml: vml },
      { path: 'xl/media/image1.jpeg', from: SHEET, rel: `${R}/image`, xml: new Uint8Array([255, 216, 255]) },
      { path: 'xl/tables/table1.xml', from: SHEET, rel: `${R}/table`, xml: `<table xmlns="${MAIN}" id="1" name="Assays" displayName="Assays" ref="A1:A2" tableType="queryTable"><tableColumns count="1"><tableColumn id="1" name="n"/></tableColumns></table>` },
      { path: 'xl/queryTables/queryTable1.xml', from: 'xl/tables/table1.xml', rel: `${R}/queryTable`, target: '../queryTables/queryTable1.xml', xml: `<queryTable xmlns="${MAIN}" name="Assays" connectionId="1"/>` },
      { path: 'xl/ctrlProps/ctrlProp1.xml', from: SHEET, rel: `${R}/ctrlProp`, xml: `<formControlPr xmlns="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" objectType="CheckBox"/>` },
      { path: 'xl/ctrlProps/ctrlProp2.xml', from: SHEET, rel: `${R}/ctrlProp`, xml: `<formControlPr xmlns="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" objectType="CheckBox"/>` },
      { path: 'xl/activeX/activeX1.xml', from: SHEET, rel: `${R}/control`, xml: '<ax:ocx xmlns:ax="http://schemas.microsoft.com/office/2006/activeX" ax:classid="{8BD21D40-EC42-11CE-9E0D-00AA006002F3}"/>' },
    ],
  });

  it('names controls, connections, query tables, background pictures, macro sheets and XML maps on opening', async () => {
    const { warnings } = await readXlsx(file());
    const list = warnings.find((w) => w.startsWith('Not shown here'));
    expect(list).toBeDefined();
    for (const item of ['2 form controls (buttons, check boxes, lists)', '1 ActiveX control', '2 data connections', '1 query table\'s link to the data it was imported from',
      '1 sheet background picture', '1 Excel 4 macro sheet (opened as an ordinary sheet)', 'XML maps']) expect(list).toContain(item);
  });
});
