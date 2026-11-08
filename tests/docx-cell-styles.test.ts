// @vitest-environment jsdom
//
// Paragraphs in Word's table cells and text boxes keep their paragraph style (a journal
// template's TableBody and TableHead), and a table style's paragraph settings (Word's Table
// Grid: no space after, single lines) reach the paragraphs in its cells, under their own style.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import type { DocText } from '../src/document/document';
import type { TableData } from '../src/model';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DML = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };

/** Word's own defaults (8 pt after, 1.08 lines), Normal with none of its own, Table Grid's paragraph settings, and two paragraph styles for tables. */
const STYLES = `<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  `<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableBody"><w:name w:val="TableBody"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="18"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableHead"><w:name w:val="TableHead"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="18"/></w:rPr></w:style>` +
  `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/></w:style>` +
  `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
  `<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>`;

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/_rels/document.xml.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${R}styles" Target="styles.xml"/></Relationships>`)),
    'word/styles.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:styles ${W}>${STYLES}</w:styles>`)),
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W} ${DML}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`)),
  });
}

const p = (t: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
const tc = (...paras: string[]) => `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr>${paras.join('')}</w:tc>`;
const tbl = (style: string | null, rows: string[][]) => `<w:tbl><w:tblPr>${style ? `<w:tblStyle w:val="${style}"/>` : ''}<w:tblW w:w="5760" w:type="dxa"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
  `<w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/></w:tblGrid>${rows.map((r) => `<w:tr>${r.map((c) => tc(c)).join('')}</w:tr>`).join('')}</w:tbl>`;
const tableOf = (d: DocText): TableData => Object.values(d.objects).find((o) => o.kind === 'table')!.table as TableData;
const saved = async (d: DocText) => strFromU8(unzipSync(await writeDocx(d, deps))['word/document.xml']);

describe('paragraph styles in table cells and text boxes (W7)', () => {
  const body = tbl(null, [[p('Entry', 'TableHead'), p('Yield', 'TableHead')], [p('1', 'TableBody'), p('92%', 'TableBody')]]) + p('After');

  it('keeps each cell paragraph\'s style', async () => {
    const { doc } = await readDocx(wordFile(body));
    const t = tableOf(doc);
    expect(t.rows[0][0].paras?.[0]?.style).toBe('TableHead');
    expect(t.rows[1][1].paras?.[0]?.style).toBe('TableBody');
    expect(doc.styles.TableHead).toBeDefined();
    expect(doc.styles.TableBody).toBeDefined();
  });

  it('saves the cells\' paragraphs in their styles, and opens them so again', async () => {
    const { doc } = await readDocx(wordFile(body));
    const x = await saved(doc);
    const cells = [...x.matchAll(/<w:tc>(.*?)<\/w:tc>/g)].map((m) => m[1]);
    expect(cells).toHaveLength(4);
    expect(cells.slice(0, 2).every((c) => c.includes('<w:pStyle w:val="TableHead"/>'))).toBe(true);
    expect(cells.slice(2).every((c) => c.includes('<w:pStyle w:val="TableBody"/>'))).toBe(true);
    const back = tableOf((await readDocx(await writeDocx(doc, deps))).doc);
    expect(back.rows[0][1].paras?.[0]?.style).toBe('TableHead');
    expect(back.rows[1][0].paras?.[0]?.style).toBe('TableBody');
  });

  it('keeps a text box paragraph\'s style', async () => {
    const box = `<w:p><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>` +
      `<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1828800" cy="457200"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="1" name="Text Box 1"/><wp:cNvGraphicFramePr/>` +
      `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>` +
      `<wps:txbx><w:txbxContent>${p('Note', 'TableBody')}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r><w:r><w:t>Text</w:t></w:r></w:p>`;
    const { doc } = await readDocx(wordFile(box));
    const o = Object.values(doc.objects).find((x) => x.kind === 'textbox');
    expect(o?.kind === 'textbox' && o.paras?.[0]?.style).toBe('TableBody');
    const x = await saved(doc);
    expect(/<w:txbxContent>.*<w:pStyle w:val="TableBody"\/>.*<\/w:txbxContent>/.test(x)).toBe(true);
  });
});

describe('a table style\'s paragraph settings (W12)', () => {
  it('gives the cells\' paragraphs Table Grid\'s spacing (none after, single lines), not the document\'s', async () => {
    const { doc } = await readDocx(wordFile(tbl('TableGrid', [[p('a'), p('b')]]) + p('After')));
    const ps = tableOf(doc).rows[0][0].paras?.[0] ?? {};
    expect(ps.spaceAfter ?? 0).toBe(0);
    expect(ps.line ?? 1).toBe(1);
    // the text outside the table keeps the document's 8 pt after
    const after = doc.paras[doc.paras.length - 1];
    expect(after.spaceAfter).toBe(8);
  });

  it('leaves a paragraph style\'s own spacing over the table style\'s', async () => {
    const { doc } = await readDocx(wordFile(tbl('TableGrid', [[p('a', 'TableHead'), p('b', 'TableBody')]]) + p('After')));
    const row = tableOf(doc).rows[0];
    expect(row[0].paras?.[0]?.spaceBefore).toBe(2);
    expect(row[0].paras?.[0]?.spaceAfter).toBe(2);
    // TableBody sets no spacing: Table Grid's
    expect(row[1].paras?.[0]?.spaceAfter ?? 0).toBe(0);
  });

  it('saves the cells with the spacing Word shows them with', async () => {
    const { doc } = await readDocx(wordFile(tbl('TableGrid', [[p('a'), p('b')]]) + p('After')));
    const x = await saved(doc);
    const cell = /<w:tc>(.*?)<\/w:tc>/.exec(x)![1];
    expect(cell).toMatch(/<w:spacing [^>]*w:after="0"/);
  });
});

describe('a table in Word\'s Table Grid style (Word laptop check 6)', () => {
  it('keeps naming the style, with its lines the style\'s rather than the table\'s own', async () => {
    const { doc } = await readDocx(wordFile(tbl('TableGrid', [[p('Entry'), p('Yield')], [p('1'), p('92%')]]) + p('After')));
    expect(tableOf(doc).style).toBe('TableGrid');
    const files = unzipSync(await writeDocx(doc, deps));
    const x = strFromU8(files['word/document.xml']);
    expect(x).toContain('<w:tblStyle w:val="TableGrid"/>');
    expect(x).not.toContain('<w:tblBorders>');
    expect(x).not.toContain('<w:tcBorders>');
    // the style itself goes with the file, drawing every cell's lines
    const grid = /<w:style w:type="table" w:styleId="TableGrid">.*?<\/w:style>/.exec(strFromU8(files['word/styles.xml']))?.[0] ?? '';
    expect(grid).toContain('<w:name w:val="Table Grid"/>');
    expect(grid).toMatch(/<w:tblBorders><w:top w:val="single"[^>]*\/><w:left [^>]*\/><w:bottom [^>]*\/><w:right [^>]*\/><w:insideH w:val="single"[^>]*\/><w:insideV w:val="single"[^>]*\/><\/w:tblBorders>/);
    expect(tableOf((await readDocx(zipSync(files))).doc).style).toBe('TableGrid');
  });

  it('keeps lines the table takes off its style as the cells\' own', async () => {
    // Table Grid with no lines between the columns (the table's own borders over its style's)
    const body = tbl('TableGrid', [[p('Entry'), p('Yield')], [p('1'), p('92%')]]).replace('<w:tblLook', '<w:tblBorders><w:insideV w:val="nil"/></w:tblBorders><w:tblLook') + p('After');
    const { doc } = await readDocx(wordFile(body));
    const t = tableOf(doc);
    expect(t.style).toBe('TableGrid');
    expect(t.rows[0][0].borders?.right?.style).toBe('none');
    expect(t.rows[1][1].borders?.left?.style).toBe('none');
    expect(t.rows[0][0].borders?.left).toBeUndefined();
    const x = await saved(doc);
    expect(x).toContain('<w:tblStyle w:val="TableGrid"/>');
    expect(x).toMatch(/<w:tcBorders><w:right w:val="nil"\/><\/w:tcBorders>/);
  });
});
