// @vitest-environment jsdom
//
// Alt text typed with line breaks (the Alt Text box takes several lines) is written so the
// breaks survive: as character references in the descr attribute, as Word and PowerPoint write
// them. A raw line break in an attribute is read back as a space (XML attribute-value
// normalization), which lost the breaks and, once Word had stored the picture afresh, kept a
// structure from being known by its alt text: it opened as a plain picture.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';
import { Doc, type Contents, type TextRun } from '../src/model';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { defaultMaster } from '../src/deck/deck';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const ALT = 'Starting material\nand product';

const deps: DocxDeps = {
  async picture() { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>', w: 80, h: 40 }; },
  async svgToPng() { return PNG; },
};
const DRAWING: Contents = { atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, runs: [{ text: 'OH' }], justify: 'left' }], arrows: [], shapes: [] };

function docWith(alt: string): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }, objectRun(1, n), { ...n, text: '\nAfter' }];
  const N = paraFromStyle(d.styles.Normal, {});
  return { ...d, runs: rt.normalizeRuns(runs), paras: [N, N, N], objects: { 1: { kind: 'drawing', contents: DRAWING, alt } } };
}

describe('alt text with line breaks', () => {
  it('is written with the breaks as character references (Word)', async () => {
    const files = unzipSync(await writeDocx(docWith(ALT), deps));
    const doc = strFromU8(files['word/document.xml']);
    expect(doc).toContain('descr="Starting material&#10;and product"');
    expect(doc).not.toMatch(/descr="[^"]*\n/);
  });

  it('comes back with its breaks, and the structure stays a structure after Word stores the picture afresh', async () => {
    const files = unzipSync(await writeDocx(docWith(ALT), deps));
    // Word makes its own PNG for an SVG picture when it saves (other bytes, the same alt text)
    const rels = strFromU8(files['word/_rels/document.xml.rels']);
    const rid = /<a:blip r:embed="([^"]+)"/.exec(strFromU8(files['word/document.xml']))![1];
    const png = 'word/' + new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)![1];
    const resaved = zipSync({ ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)])), [png]: new Uint8Array([...PNG, 7, 7, 7]) });
    for (const bytes of [zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)]))), resaved]) {
      const { doc } = await readDocx(bytes);
      const objs = Object.values(doc.objects);
      expect(objs.map((o) => o.kind)).toEqual(['drawing']);
      expect(objs[0].kind === 'drawing' && objs[0].alt).toBe(ALT);
    }
  });

  it('keeps its breaks on a picture in PowerPoint', async () => {
    const doc = new Doc();
    doc.edit('p', () => { doc.addShape({ kind: 'picture', x1: 100, y1: 100, x2: 200, y2: 150, src: DOT, px: { w: 1, h: 1 }, alt: ALT }); });
    const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
    const bytes = await writePptx({ size: { w: 960, h: 540 }, master: defaultMaster(), slides: [{ layout: 'blank', doc, notes: '' }] }, opts);
    expect(strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml'])).toContain('descr="Starting material&#10;and product"');
    const pic = readPptx(bytes).slides[0].contents.shapes.find((s) => s.kind === 'picture');
    expect(pic?.alt).toBe(ALT);
  });
});
