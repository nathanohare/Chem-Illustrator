// @vitest-environment jsdom
//
// A Word table's rows: their heights (w:trHeight, at least or exactly; a form's or a label
// sheet's rows) read, laid out and saved again, and Repeat Header Rows (w:tblHeader) kept apart
// from a table style's heading row, so a table that had no repeated heading row gets none.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { DocLayouter, SINGLE_ROW, CELL_PAD } from '../src/document/doc-layout';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import { deleteRow, insertRow } from '../src/table';
import { sortTableRows } from '../src/document/sort';
import * as rt from '../src/richtext';
import type { TableData, TextRun } from '../src/model';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };

function wordFile(body: string, styles?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`)),
  };
  if (styles) {
    files['word/styles.xml'] = new Uint8Array(strToU8(`<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`));
    files['word/_rels/document.xml.rels'] = new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${R}styles" Target="styles.xml"/></Relationships>`));
  }
  return zipSync(files);
}

const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const row = (trPr: string, t: string) => `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}${cell(t)}${cell(t)}</w:tr>`;
const tbl = (tblPr: string, rows: string) => `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/></w:tblGrid>${rows}</w:tbl><w:p/>`;
const tableOf = (d: DocText): TableData => Object.values(d.objects).find((o) => o.kind === 'table')!.table as TableData;
const saved = async (d: DocText) => strFromU8(unzipSync(await writeDocx(d, deps))['word/document.xml']);
const trPrs = (xml: string) => [...xml.matchAll(/<w:tr>(?:<w:trPr>(.*?)<\/w:trPr>)?/g)].map((m) => m[1] ?? '');

describe('row heights (W5)', () => {
  const ROWS = row('<w:trHeight w:val="1440"/>', 'a') + row('<w:trHeight w:val="720" w:hRule="exact"/>', 'b') + row('<w:trHeight w:val="400" w:hRule="auto"/>', 'c') + row('', 'd');

  it('reads each row\'s height: at least (Word\'s default rule), exactly, or none', async () => {
    const t = tableOf((await readDocx(wordFile(tbl('<w:tblW w:w="5760" w:type="dxa"/>', ROWS)))).doc);
    expect(t.rowH).toEqual([{ h: 72 }, { h: 36, exact: true }, null, null]);
  });

  it('saves them with their rule, and opens them the same again', async () => {
    const { doc } = await readDocx(wordFile(tbl('<w:tblW w:w="5760" w:type="dxa"/>', ROWS)));
    const x = await saved(doc);
    expect(trPrs(x)).toEqual(['<w:trHeight w:val="1440" w:hRule="atLeast"/>', '<w:trHeight w:val="720" w:hRule="exact"/>', '', '']);
    expect(tableOf((await readDocx(await writeDocx(doc, deps))).doc).rowH).toEqual([{ h: 72 }, { h: 36, exact: true }, null, null]);
  });

  it('lays out a row at least or exactly its height', async () => {
    const { doc } = await readDocx(wordFile(tbl('<w:tblW w:w="5760" w:type="dxa"/>', ROWS)));
    const lay = new DocLayouter({ measure: (s: string, size: number) => s.length * size * 0.5, drawingSize: () => ({ w: 10, h: 10 }) }).layout(doc);
    const tb = [...lay.tables.values()][0];
    const plain = SINGLE_ROW * doc.styles.Normal.size + 2 * CELL_PAD.y;
    expect(tb.hs[0]).toBeCloseTo(72);
    expect(tb.hs[1]).toBeCloseTo(36);
    expect(tb.hs[2]).toBeCloseTo(plain);
    expect(tb.hs[3]).toBeCloseTo(plain);
  });

  it('keeps each row\'s height with its row when rows are put in, taken out or sorted', () => {
    const t: TableData = { cols: [50, 50], rows: [['h'], ['b'], ['a']].map((r) => [{ runs: [{ text: r[0] }] }, { runs: [] }]), head: 1, lines: 'grid', rowH: [null, { h: 30 }, { h: 40, exact: true }] };
    expect(insertRow(t, 1).rowH).toEqual([null, null, { h: 30 }, { h: 40, exact: true }]);
    expect(deleteRow(t, 1).rowH).toEqual([null, { h: 40, exact: true }]);
    expect(sortTableRows(t, { keys: [{ field: 0, type: 'text' }], header: true }).rowH).toEqual([null, { h: 40, exact: true }, { h: 30 }]);
  });
});

describe('repeated heading rows (W8)', () => {
  const STYLE = '<w:style w:type="table" w:styleId="Fancy"><w:name w:val="Fancy"/><w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="4472C4"/></w:tcPr></w:tblStylePr></w:style>';
  const LOOK = '<w:tblStyle w:val="Fancy"/><w:tblW w:w="5760" w:type="dxa"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';

  it('does not make a styled heading row repeat on each page when the file had no Repeat Header Rows', async () => {
    const { doc } = await readDocx(wordFile(tbl(LOOK, row('', 'Head') + row('', 'x')), STYLE));
    const t = tableOf(doc);
    expect(t.head).toBe(1);
    expect(t.noRepeat).toBe(true);
    expect(await saved(doc)).not.toContain('tblHeader');
  });

  it('keeps Repeat Header Rows where the file has it', async () => {
    const { doc } = await readDocx(wordFile(tbl(LOOK, row('<w:tblHeader/>', 'Head') + row('', 'x')), STYLE));
    const t = tableOf(doc);
    expect(t.head).toBe(1);
    expect(t.noRepeat).toBeUndefined();
    expect(trPrs(await saved(doc))).toEqual(['<w:tblHeader/>', '']);
  });

  it('still repeats the heading rows of a table made here', async () => {
    const d = newDocument();
    const n = runStyleOf(d.styles.Normal);
    const table: TableData = { cols: [100, 80], rows: [[{ runs: [{ text: 'Entry' }] }, { runs: [{ text: 'Yield' }] }], [{ runs: [{ text: '1' }] }, { runs: [{ text: '92' }] }]], head: 1, lines: 'acs' };
    const N = paraFromStyle(d.styles.Normal, {});
    const t: DocText = { ...d, runs: rt.normalizeRuns([objectRun(1, n), { ...n, text: '\nAfter' }] as TextRun[]), paras: [N, N], objects: { 1: { kind: 'table', table } } };
    expect(trPrs(await saved(t))).toEqual(['<w:tblHeader/>', '']);
  });
});
