// @vitest-environment jsdom
//
// A structure named in the Selection Pane carries that name on its wp:docPr, so which of our
// drawings it is was kept in our part by the wp:docPr id. Word gives a figure a new id when it is
// copied, or when it numbers the ids afresh; the picture's own name inside (pic:cNvPr, written as
// "Chem Illustrator drawing N" and kept by Word as written) still says which drawing it is, so the
// structure stays a structure, with its name.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText, type Float } from '../src/document/document';
import * as rt from '../src/richtext';
import type { Contents, TextRun } from '../src/model';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const deps: DocxDeps = {
  async picture() { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>', w: 80, h: 40 }; },
  async svgToPng() { return PNG; },
  async smiles() { return 'c1ccccc1'; },
};
const DRAWING: Contents = { atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, runs: [{ text: 'OH' }], justify: 'left' }], arrows: [], shapes: [] };

function docWith(float?: Float): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }, objectRun(1, n), { ...n, text: '\nAfter' }];
  const N = paraFromStyle(d.styles.Normal, {});
  return { ...d, runs: rt.normalizeRuns(runs), paras: [N, N, N], objects: { 1: { kind: 'drawing', contents: DRAWING, ...(float ? { float } : {}) } } };
}

type Parts = Record<string, Uint8Array>;
const rezip = (p: Parts) => zipSync(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new Uint8Array(v)])));
const withDoc = (p: Parts, f: (xml: string) => string): Uint8Array => {
  const was = strFromU8(p['word/document.xml']);
  const now = f(was);
  expect(now).not.toBe(was);
  return rezip({ ...p, 'word/document.xml': new Uint8Array(strToU8(now)) });
};

describe('a structure named in the Selection Pane', () => {
  it('stays a structure, with its name, when Word gives its figure a new id', async () => {
    const files = unzipSync(await writeDocx(docWith({ wrap: 'square', x: 10, y: 10, name: 'Benzene' }), deps));
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toMatch(/<wp:docPr id="\d+" name="Benzene"/);
    expect(xml).toContain('<pic:cNvPr id="0" name="Chem Illustrator drawing 1"/>');
    const { doc } = await readDocx(withDoc(files, (x) => x.replace(/<wp:docPr id="\d+"/, '<wp:docPr id="1858601091"')));
    const objs = Object.values(doc.objects);
    expect(objs.map((o) => o.kind)).toEqual(['drawing']);
    const o = objs[0];
    expect(o.kind === 'drawing' && o.contents.captions[0].runs[0].text).toBe('OH');
    expect(o.kind === 'drawing' && o.float?.name).toBe('Benzene');
  });

  it('stays a structure when it was renamed in Word itself', async () => {
    const files = unzipSync(await writeDocx(docWith(), deps));
    const { doc } = await readDocx(withDoc(files, (x) => x.replace(/(<wp:docPr id="\d+" name=")Chem Illustrator drawing 1"/, '$1Benzene"')));
    expect(Object.values(doc.objects).map((o) => o.kind)).toEqual(['drawing']);
  });

  it('is still told apart from a copy of another file\'s structure (its picture and alt text differ)', async () => {
    const files = unzipSync(await writeDocx(docWith({ wrap: 'square', x: 10, y: 10, name: 'Benzene' }), deps));
    const rels = strFromU8(files['word/_rels/document.xml.rels']);
    const rid = /<a:blip r:embed="([^"]+)"/.exec(strFromU8(files['word/document.xml']))![1];
    const png = 'word/' + new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)![1];
    const other = { ...files, [png]: new Uint8Array([...PNG, 1, 2, 3]) };
    const { doc } = await readDocx(withDoc(other, (x) => x.replace(/<wp:docPr id="\d+"/, '<wp:docPr id="77"').replace(/descr="[^"]*"/, 'descr="Chemical structure (SMILES): c1ccncc1"')));
    expect(Object.values(doc.objects).map((o) => o.kind)).toEqual(['picture']);
  });
});
