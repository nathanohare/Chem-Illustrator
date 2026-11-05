// @vitest-environment jsdom
//
// What Chem Illustrator keeps in its own part of a Word file (tables, charts) is used only while
// Word has not changed the document's own markup for them:
// - text bolded or shaded in a table in Word, its words unchanged, comes back as Word has it;
// - a chart changed to another type in Word comes back as that type.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText, type DocObject } from '../src/document/document';
import * as rt from '../src/richtext';
import { newChartBox } from '../src/sheet/chart-box';
import type { Contents, TableData, TextRun } from '../src/model';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const deps: DocxDeps = {
  async picture() { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>', w: 80, h: 40 }; },
  async svgToPng() { return PNG; },
  async smiles() { return null; },
};
const TABLE: TableData = {
  cols: [60, 40], head: 1, lines: 'acs', title: [{ text: 'Table 1. Screening', bold: true }],
  rows: [[{ runs: [{ text: 'Entry' }] }, { runs: [{ text: 'Yield' }] }], [{ runs: [{ text: '1' }] }, { runs: [{ text: '95%' }] }]],
};
const TABLE_DRAWING: Contents = { atoms: [], bonds: [], captions: [], arrows: [], shapes: [{ id: 1, kind: 'table', x1: 0, y1: 0, x2: 100, y2: 40, table: TABLE }] };

function docOf(...objs: DocObject[]): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }];
  objs.forEach((_, i) => runs.push(objectRun(i + 1, n), { ...n, text: '\n' }));
  runs.push({ ...n, text: 'After' });
  const N = paraFromStyle(d.styles.Normal, {});
  return { ...d, runs: rt.normalizeRuns(runs), paras: Array(objs.length + 2).fill(N), objects: Object.fromEntries(objs.map((o, i) => [i + 1, o])) };
}

type Parts = Record<string, Uint8Array>;
const rezip = (p: Parts) => zipSync(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new Uint8Array(v)])));
const text = (p: Parts, n: string) => strFromU8(p[n]);
/** The file with its document's XML edited (as Word would save it). */
const edited = (p: Parts, f: (x: string) => string, more: Parts = {}): Uint8Array => {
  const was = text(p, 'word/document.xml');
  const now = f(was);
  expect(now).not.toBe(was);
  return rezip({ ...p, ...more, 'word/document.xml': new Uint8Array(strToU8(now)) });
};

describe('tables in Word', () => {
  const write = async () => unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: TABLE_DRAWING }), deps));
  const table = async (bytes: Uint8Array) => {
    const { doc } = await readDocx(bytes);
    const o = Object.values(doc.objects).find((x) => x.kind === 'drawing');
    return o?.kind === 'drawing' ? o.contents.shapes.find((s) => s.kind === 'table')?.table ?? null : null;
  };

  it('keep text bolded and cells shaded in Word, their words unchanged', async () => {
    const p = await write();
    expect((await table(rezip(p)))?.rows[1][1].runs.some((r) => r.bold)).toBe(false);
    const bold = edited(p, (x) => x.replace(/(<w:rPr>)(<w:rFonts [^>]*\/>)(<w:sz w:val="\d+"\/><w:szCs w:val="\d+"\/><\/w:rPr><w:t xml:space="preserve">95%)/, '$1$2<w:b/>$3'));
    const t = await table(bold);
    expect(t?.rows[1][1].runs.map((r) => r.text).join('')).toBe('95%');
    expect(t?.rows[1][1].runs.every((r) => r.bold)).toBe(true);
    // the rest as saved: its title, its rules
    expect(t?.title?.map((r) => r.text).join('')).toBe('Table 1. Screening');
    expect(t?.lines).toBe('acs');
    const shaded = await table(edited(p, (x) => x.replace(/(<w:tc><w:tcPr><w:tcW w:w="\d+" w:type="dxa"\/>)(<\/w:tcPr><w:p><w:pPr>(?:(?!<w:tc>)[\s\S])*?95%)/, '$1<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>$2')));
    expect(shaded?.rows[1][1].fill).toBe('#ffff00');
  });
});

describe('charts in Word', () => {
  it('come back as the type Word has', async () => {
    const box = newChartBox('column');
    const p = unzipSync(await writeDocx(docOf({ kind: 'picture', src: 'data:image/png;base64,AA==', w: 360, h: 216, chart: box }), deps));
    const path = Object.keys(p).find((n) => /word\/charts\/chart\d+\.xml$/.test(n))!;
    const kind = async (bytes: Uint8Array) => {
      const { doc } = await readDocx(bytes);
      const o = Object.values(doc.objects).find((x) => x.kind === 'picture');
      return o?.kind === 'picture' ? o.chart?.chart.kind : undefined;
    };
    expect(await kind(rezip(p))).toBe('column');
    const line = strFromU8(p[path]).replace(/<c:barChart>[\s\S]*?<c:grouping val="[^"]*"\/>/, (m) => m.replace('<c:barChart>', '<c:lineChart>').replace(/<c:barDir[^>]*\/>/, '')).replace('</c:barChart>', '</c:lineChart>').replace(/<c:gapWidth[^>]*\/>|<c:overlap[^>]*\/>/g, '');
    expect(await kind(rezip({ ...p, [path]: new Uint8Array(strToU8(line)) }))).toBe('line');
  });
});
