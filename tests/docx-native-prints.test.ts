// @vitest-environment jsdom
//
// What Chem Illustrator keeps in its own part of a Word file (structures, tables, charts) is used
// only while Word has not changed the document's own markup for them:
// - a structure is recognised by its SVG, which Word keeps byte for byte (it makes the PNG beside
//   it afresh on every save, and the alt text is the person's to edit); a picture put in its
//   place (Change Picture) comes in as that picture, with a warning; a crop or recolour made in
//   Word is warned about;
// - a table is recognised by a hidden bookmark (not by its alt-text title, which Word shows and
//   reads out), and text bolded or shaded in Word with its words unchanged comes back as Word has it;
// - a chart changed to another type in Word comes back as that type.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText, type DocObject } from '../src/document/document';
import * as rt from '../src/richtext';
import { newChartBox } from '../src/sheet/chart-box';
import type { Contents, TableData, TextRun } from '../src/model';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
/** The PNG Word makes for the SVG when it saves the file. */
const PNG_WORD = new Uint8Array([...PNG, 9, 9, 9]);
const deps: DocxDeps = {
  async picture() { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>', w: 80, h: 40 }; },
  async svgToPng() { return PNG; },
  async smiles() { return null; },
};
const DRAWING: Contents = { atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, runs: [{ text: 'OH' }], justify: 'left' }], arrows: [], shapes: [] };
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
/** A picture's file in the package, by the relationship named in the document. */
const target = (p: Parts, re: RegExp) => 'word/' + new RegExp(`Id="${re.exec(text(p, 'word/document.xml'))![1]}"[^>]*Target="([^"]+)"`).exec(text(p, 'word/_rels/document.xml.rels'))![1];

describe('structures in Word', () => {
  const write = async () => unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: DRAWING }), deps));
  const kinds = async (bytes: Uint8Array) => {
    const { doc, warnings } = await readDocx(bytes);
    return { kinds: Object.values(doc.objects).map((o) => o.kind), warnings };
  };

  it('stay structures after a Word save with their alt text edited', async () => {
    const p = await write();
    const png = target(p, /<a:blip r:embed="([^"]+)"/);
    const got = await kinds(edited(p, (x) => x.replace(/descr="[^"]*"/, 'descr="Phenol, the starting material"'), { [png]: PNG_WORD }));
    expect(got.kinds).toEqual(['drawing']);
    expect(got.warnings).toEqual([]);
  });

  it('come in as the picture put in their place in Word, with a warning, though the alt text is kept', async () => {
    const p = await write();
    const png = target(p, /<a:blip r:embed="([^"]+)"/), svg = target(p, /<asvg:svgBlip [^>]*r:embed="([^"]+)"/);
    const got = await kinds(rezip({ ...p, [png]: PNG_WORD, [svg]: new Uint8Array(strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>')) }));
    expect(got.kinds).toEqual(['picture']);
    expect(got.warnings.join(' ')).toMatch(/structures were changed in Word/);
  });

  it('stay structures when cropped or recolored in Word, with a warning that it isn\'t shown here', async () => {
    const p = await write();
    for (const f of [(x: string) => x.replace('<a:stretch>', '<a:srcRect l="25000" r="25000"/><a:stretch>'), (x: string) => x.replace(/(<a:blip r:embed="[^"]+">)/, '$1<a:grayscl/>')]) {
      const got = await kinds(edited(p, f));
      expect(got.kinds).toEqual(['drawing']);
      expect(got.warnings.join(' ')).toMatch(/Cropping and color changes.*saved back to Word/);
    }
  });

  it('save Word\'s cropping and color changes back while the structure is unchanged', async () => {
    const p = await write();
    // Word: a quarter cut off each side (so shown half as wide), and Recolor > Grayscale
    const ext = (x: string) => /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(x)!.slice(1).map(Number);
    const [cx0, cy0] = ext(text(p, 'word/document.xml'));
    const cropped = edited(p, (x) => x.replace('<a:stretch>', '<a:srcRect l="25000" r="25000"/><a:stretch>').replace(/(<a:blip r:embed="[^"]+">)/, '$1<a:grayscl/>')
      .replace(/<wp:extent cx="(\d+)"/, (_m, cx) => `<wp:extent cx="${Math.round(Number(cx) / 2)}"`).replace(/(<pic:spPr><a:xfrm><a:off x="0" y="0"\/><a:ext cx=")(\d+)/, (_m, a, cx) => `${a}${Math.round(Number(cx) / 2)}`));
    const { doc } = await readDocx(cropped);
    const o = Object.values(doc.objects)[0];
    expect(o.kind === 'drawing' && o.wordLook).toMatchObject({ crop: { l: 0.25, r: 0.25, t: 0, b: 0 }, fx: { recolor: { kind: 'grey' } } });
    // shown here whole, at the size Word shows it at
    expect(o.kind === 'drawing' && o.scale).toBeUndefined();
    const again = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(again).toMatch(/<a:srcRect l="25000" t="0" r="25000" b="0"\/>/);
    expect(again).toContain('<a:grayscl/>');
    const [cx1, cy1] = ext(again);
    expect(Math.abs(cx1 - cx0 / 2)).toBeLessThan(2);
    expect(Math.abs(cy1 - cy0)).toBeLessThan(2);
    // changed here: drawn afresh, without them
    if (o.kind === 'drawing') o.contents = { ...o.contents, captions: [{ ...o.contents.captions[0], runs: [{ text: 'OMe' }] }] };
    const changed = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(changed).not.toContain('srcRect');
    expect(changed).not.toContain('<a:grayscl/>');
    expect(ext(changed)[0]).toBe(cx0);
  });
});

describe('tables in Word', () => {
  const write = async () => unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: TABLE_DRAWING }), deps));
  const table = async (bytes: Uint8Array) => {
    const { doc } = await readDocx(bytes);
    const o = Object.values(doc.objects).find((x) => x.kind === 'drawing');
    return o?.kind === 'drawing' ? o.contents.shapes.find((s) => s.kind === 'table')?.table ?? null : null;
  };

  it('are not titled with an id: their own title is their alt text, and a hidden bookmark says which they are', async () => {
    const p = await write();
    const x = text(p, 'word/document.xml');
    expect(x).not.toContain('Chem Illustrator table');
    expect(x).toContain('<w:tblCaption w:val="Table 1. Screening"/>');
    expect(x).toMatch(/<w:bookmarkStart w:id="\d+" w:name="_ChemTable_1"\/>/);
    // the alt-text title changed in Word: still ours (its title as saved)
    const t = await table(edited(p, (y) => y.replace('w:val="Table 1. Screening"', 'w:val="Yields of the screening reactions"')));
    expect(t?.title?.map((r) => r.text).join('')).toBe('Table 1. Screening');
  });

  it('written before the bookmark are still found by their old alt-text title', async () => {
    const p = await write();
    const old = edited(p, (y) => y.replace(/<w:bookmarkStart w:id="\d+" w:name="_ChemTable_1"\/><w:bookmarkEnd w:id="\d+"\/>/, '').replace(/<w:tblCaption w:val="[^"]*"\/>/, '<w:tblCaption w:val="Chem Illustrator table 1"/>'));
    expect((await table(old))?.title?.map((r) => r.text).join('')).toBe('Table 1. Screening');
  });

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

describe('our part of a Word file', () => {
  it('keeps numbers to nine significant figures', async () => {
    const atoms = [{ id: 1, x: 39.42107070546791, y: 12.000000000000002, el: 'C' }, { id: 2, x: 64.42107070546791, y: 26.433756729740646, el: 'O' }];
    const contents = { ...DRAWING, captions: [], atoms, bonds: [{ id: 3, a: 1, b: 2, order: 1 }] } as unknown as Contents;
    const p = unzipSync(await writeDocx(docOf({ kind: 'drawing', contents }), deps));
    const part = Object.keys(p).filter((n) => /^customXml\/item\d+\.xml$/.test(n)).map((n) => strFromU8(p[n])).find((x) => x.includes('chemIllustrator'))!;
    expect(part).toContain('39.4210707');
    expect(part).not.toMatch(/\d\.\d{10,}/);
    const { doc } = await readDocx(rezip(p));
    const o = Object.values(doc.objects)[0];
    const back = o.kind === 'drawing' ? o.contents.atoms : [];
    expect(back.map((a) => a.x)).toEqual([39.4210707, 64.4210707]);
    expect(Math.abs(back[1].y - 26.433756729740646)).toBeLessThan(1e-6);
  });
});
