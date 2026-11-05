// @vitest-environment jsdom
//
// A Word table's place and size as Word keeps them: a floating table (w:tblpPr), its width
// in percent or auto (w:tblW), its indent (w:tblInd) and AutoFit (no fixed w:tblLayout) are
// read and saved again, and two floating tables side by side stay side by side (a label sheet).

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { DocLayouter } from '../src/document/doc-layout';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';
import type { TableData, TextRun } from '../src/model';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`)),
  });
}

const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const tbl = (tblPr: string, t = 'A') => `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/></w:tblGrid><w:tr>${cell(t)}${cell(t + '2')}</w:tr></w:tbl>`;
const para = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const tables = (d: DocText): TableData[] => Object.values(d.objects).flatMap((o) => (o.kind === 'table' ? [o.table] : []));
const saved = async (d: DocText) => strFromU8(unzipSync(await writeDocx(d, deps))['word/document.xml']);
const tblPrOf = (xml: string) => [...xml.matchAll(/<w:tblPr>(.*?)<\/w:tblPr>/g)].map((m) => m[1]);
/** The body's own blocks, in order (not the paragraphs in cells). */
const blocks = (xml: string) => {
  const body = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagNameNS('*', 'body')[0];
  return Array.from(body.children).map((e) => e.localName);
};

describe('floating tables, table widths, indents and AutoFit (W10)', () => {
  const FLOAT = '<w:tblpPr w:leftFromText="180" w:rightFromText="180" w:topFromText="72" w:bottomFromText="144" w:vertAnchor="text" w:horzAnchor="page" w:tblpX="2161" w:tblpY="-54"/><w:tblOverlap w:val="never"/>';

  it('reads a floating table, its width in percent, its indent and AutoFit', async () => {
    const { doc } = await readDocx(wordFile(tbl(`${FLOAT}<w:tblW w:w="5000" w:type="pct"/><w:tblInd w:w="360" w:type="dxa"/>`) + para('After')));
    const [t] = tables(doc);
    expect(t.float).toEqual({ hFrom: 'page', vFrom: 'text', x: 108.05, y: -2.7, left: 9, right: 9, top: 3.6, bottom: 7.2, noOverlap: true });
    expect(t.width).toEqual({ pct: 100 });
    expect(t.indent).toBe(18);
    expect(t.autofit).toBe(true);
  });

  it('saves them as Word had them, and opens them the same again', async () => {
    const { doc } = await readDocx(wordFile(tbl(`${FLOAT}<w:tblW w:w="5000" w:type="pct"/><w:tblInd w:w="360" w:type="dxa"/>`) + para('After')));
    const x = await saved(doc);
    const [pr] = tblPrOf(x);
    expect(pr).toContain('<w:tblpPr w:leftFromText="180" w:rightFromText="180" w:topFromText="72" w:bottomFromText="144" w:vertAnchor="text" w:horzAnchor="page" w:tblpX="2161" w:tblpY="-54"/><w:tblOverlap w:val="never"/>');
    expect(pr).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(pr).toContain('<w:tblInd w:w="360" w:type="dxa"/>');
    // AutoFit: no fixed layout
    expect(pr).not.toContain('tblLayout');
    // in Word's order (CT_TblPr): position, width, alignment, indent, ... margins, look
    const order = ['tblpPr', 'tblOverlap', 'tblW', 'jc', 'tblInd', 'tblBorders', 'tblCellMar', 'tblLook'].map((n) => pr.indexOf(`<w:${n}`));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    const [back] = tables((await readDocx(await writeDocx(doc, deps))).doc);
    expect(back.float).toEqual(tables(doc)[0].float);
    expect(back.width).toEqual({ pct: 100 });
    expect(back.indent).toBe(18);
    expect(back.autofit).toBe(true);
  });

  it('keeps a width set by the contents, and a fixed layout where the file has one', async () => {
    const { doc } = await readDocx(wordFile(tbl('<w:tblpPr w:vertAnchor="text" w:horzAnchor="page" w:tblpXSpec="center" w:tblpY="1"/><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>') + para('After')));
    const [t] = tables(doc);
    expect(t.width).toBe('auto');
    expect(t.autofit).toBeUndefined();
    expect(t.float).toEqual({ hFrom: 'page', vFrom: 'text', xAlign: 'center', y: 0.05 });
    const [pr] = tblPrOf(await saved(doc));
    expect(pr).toContain('<w:tblW w:w="0" w:type="auto"/>');
    expect(pr).toContain('<w:tblLayout w:type="fixed"/>');
    expect(pr).toContain('<w:tblpPr w:vertAnchor="text" w:horzAnchor="page" w:tblpXSpec="center" w:tblpY="1"/>');
  });

  it('takes a fixed layout from the table style', async () => {
    const styles = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="table" w:styleId="Fixed"><w:name w:val="Fixed"/><w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr></w:style></w:styles>';
    const file = unzipSync(wordFile(tbl('<w:tblStyle w:val="Fixed"/><w:tblW w:w="5760" w:type="dxa"/>') + para('After')));
    file['word/styles.xml'] = new Uint8Array(strToU8(styles));
    file['word/_rels/document.xml.rels'] = new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${R}styles" Target="styles.xml"/></Relationships>`));
    const { doc } = await readDocx(zipSync(file));
    expect(tables(doc)[0].autofit).toBeUndefined();
  });

  it('still saves a table made here with fixed columns, in its line', async () => {
    const d = newDocument();
    const n = runStyleOf(d.styles.Normal);
    const table: TableData = { cols: [100, 80], rows: [[{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }] }]], head: 0, lines: 'grid' };
    const N = paraFromStyle(d.styles.Normal, {});
    const t: DocText = { ...d, runs: rt.normalizeRuns([objectRun(1, n), { ...n, text: '\nAfter' }] as TextRun[]), paras: [N, N], objects: { 1: { kind: 'table', table } } };
    const [pr] = tblPrOf(await saved(t));
    expect(pr).toContain('<w:tblW w:w="3600" w:type="dxa"/>');
    expect(pr).toContain('<w:tblLayout w:type="fixed"/>');
    expect(pr).not.toContain('tblpPr');
    expect(pr).not.toContain('tblInd');
  });

  it('moves a table indented from the left margin over by its indent here too', async () => {
    const { doc } = await readDocx(wordFile(para('Before') + tbl('<w:tblW w:w="5760" w:type="dxa"/><w:tblInd w:w="720" w:type="dxa"/>') + para('After')));
    const lay = new DocLayouter({ measure: (s: string, size: number) => s.length * size * 0.5, drawingSize: () => ({ w: 10, h: 10 }) }).layout(doc);
    const id = Number(Object.entries(doc.objects).find(([, o]) => o.kind === 'table')![0]);
    const row = lay.text.lines.find((l) => l.block === id)!;
    const text = lay.text.lines.find((l) => l.block === undefined)!;
    expect(row.x - text.x).toBeCloseTo(36);
  });
});

describe('two tables with no paragraph between them (W24)', () => {
  const floating = (x: number) => `<w:tblpPr w:vertAnchor="text" w:horzAnchor="page" w:tblpX="${x}" w:tblpY="1"/><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>`;

  it('keeps two floating tables side by side, with nothing between them (as Word writes a label sheet)', async () => {
    const { doc } = await readDocx(wordFile(tbl(floating(270), 'L') + tbl(floating(6210), 'R') + '<w:p/>'));
    expect(tables(doc)).toHaveLength(2);
    expect(blocks(await saved(doc))).toEqual(['tbl', 'tbl', 'p', 'sectPr']);
  });

  it('keeps the paragraph a floating table is placed from, when the file has one before the next table', async () => {
    const { doc } = await readDocx(wordFile(tbl(floating(270), 'L') + '<w:p/>' + tbl(floating(6210), 'R') + '<w:p/>'));
    expect(blocks(await saved(doc))).toEqual(['tbl', 'p', 'tbl', 'p', 'sectPr']);
  });

  it('still puts a paragraph between two tables in their lines (Word would join them into one table)', async () => {
    const { doc } = await readDocx(wordFile(tbl('<w:tblW w:w="5760" w:type="dxa"/>', 'X') + '<w:p/>' + tbl('<w:tblW w:w="5760" w:type="dxa"/>', 'Y') + '<w:p/>'));
    expect(tables(doc)).toHaveLength(2);
    expect(blocks(await saved(doc))).toEqual(['tbl', 'p', 'tbl', 'p', 'sectPr']);
  });
});
