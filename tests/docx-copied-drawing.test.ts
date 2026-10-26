// @vitest-environment jsdom
//
// A structure Word copied from one of our files into another keeps its picture's name
// ("Chem Illustrator drawing 1"), which the file it went into may use for another structure.
// The copy is told apart by its picture and its alt text (the SMILES), so it doesn't open as
// the other structure.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';
import { fromDataUrl } from '../src/render/images';
import type { Contents, TextRun } from '../src/model';

/** A drawing of one label: benzene or pyridine stand-ins, told apart by the label. */
const drawing = (label: string): Contents => ({ atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, runs: [{ text: label }], justify: 'left' }], arrows: [], shapes: [] });
const BENZENE = drawing('benzene'), PYRIDINE = drawing('pyridine');
const labelOf = (c: Contents) => c.captions[0]?.runs[0]?.text;

/** Each drawing's picture differs, as real ones do; and its SMILES. */
const png = (c: Contents) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...strToU8(labelOf(c) ?? '')]);
const deps: DocxDeps = {
  async picture(c) { return { png: png(c), w: 80, h: 40 }; },
  async svgToPng() { return png(BENZENE); },
  async smiles(c) { return labelOf(c) === 'benzene' ? 'c1ccccc1' : 'c1ccncc1'; },
};

/** A document of one structure. */
function docOf(c: Contents): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }, objectRun(1, n), { ...n, text: '\nAfter' }];
  const N = paraFromStyle(d.styles.Normal, {});
  return { ...d, runs: rt.normalizeRuns(runs), paras: [N, N, N], objects: { 1: { kind: 'drawing', contents: c } } };
}

type Parts = Record<string, Uint8Array>;
const text = (p: Parts, name: string) => strFromU8(p[name]);
const drawingXml = (doc: string) => /<w:drawing>[\s\S]*?<\/w:drawing>/.exec(doc)![0];

/** What Word does on Insert > Text from File (or copy and paste) of A's structure into B: the same name, a new docPr id, the picture copied in. */
function copyInto(a: Parts, b: Parts, { sameAlt = false } = {}): Uint8Array {
  const out: Parts = { ...b };
  const aDoc = text(a, 'word/document.xml');
  const aRels = text(a, 'word/_rels/document.xml.rels');
  const pic = drawingXml(aDoc);
  const rid = /r:embed="([^"]+)"/.exec(pic)![1];
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(aRels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(aRels)![1];
  out['word/media/copied.png'] = new Uint8Array(a[`word/${target}`]);
  out['word/_rels/document.xml.rels'] = new Uint8Array(strToU8(text(b, 'word/_rels/document.xml.rels').replace('</Relationships>', '<Relationship Id="rIdCopied" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/copied.png"/></Relationships>')));
  let copied = pic.replace(/r:embed="[^"]+"/, 'r:embed="rIdCopied"').replace(/<wp:docPr id="\d+"/, '<wp:docPr id="777"');
  if (sameAlt) copied = copied.replace(/descr="[^"]*"/, /descr="[^"]*"/.exec(drawingXml(text(b, 'word/document.xml')))![0]);
  // in the paragraph after B's structure
  const doc = text(b, 'word/document.xml');
  expect(doc).toContain('<w:r><w:t xml:space="preserve">After');
  out['word/document.xml'] = new Uint8Array(strToU8(doc.replace('<w:r><w:t xml:space="preserve">After', `<w:r>${copied}</w:r><w:r><w:t xml:space="preserve">After`)));
  return zipSync(out);
}

const drawings = (d: DocText) => Object.values(d.objects).filter((o) => o.kind === 'drawing').map((o) => (o.kind === 'drawing' ? labelOf(o.contents) : ''));
const pictures = (d: DocText) => Object.values(d.objects).filter((o) => o.kind === 'picture');

describe('a structure Word copied in from another of our files', () => {
  it('is not taken for the structure of the same name already in the file', async () => {
    const a = unzipSync(await writeDocx(docOf(BENZENE), deps));
    const b = unzipSync(await writeDocx(docOf(PYRIDINE), deps));
    const both = copyInto(a, b);
    expect(strFromU8(unzipSync(both)['word/document.xml']).match(/<wp:docPr id="\d+" name="Chem Illustrator drawing 1"/g)?.length).toBe(2);
    const { doc } = await readDocx(both);
    // B's own pyridine is still its structure; A's benzene comes in as its picture (still benzene), not as pyridine
    expect(drawings(doc)).toEqual(['pyridine']);
    expect(pictures(doc)).toHaveLength(1);
    const p = pictures(doc)[0];
    expect(p.kind === 'picture' && [...fromDataUrl(p.src).bytes]).toEqual([...png(BENZENE)]);
  });

  it('still opens our own structure when Word has stored its picture afresh', async () => {
    const b = unzipSync(await writeDocx(docOf(PYRIDINE), deps));
    const rels = text(b, 'word/_rels/document.xml.rels');
    const rid = /r:embed="([^"]+)"/.exec(drawingXml(text(b, 'word/document.xml')))![1];
    const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)![1];
    // Word compressed the picture on saving: other bytes, the same alt text
    const resaved: Parts = { ...b, [`word/${target}`]: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) };
    const { doc } = await readDocx(zipSync(resaved));
    expect(drawings(doc)).toEqual(['pyridine']);
  });

  it('a copy of the same molecule (the same alt text) may open as the structure', async () => {
    const a = unzipSync(await writeDocx(docOf(BENZENE), deps));
    const b = unzipSync(await writeDocx(docOf(PYRIDINE), deps));
    const { doc } = await readDocx(copyInto(a, b, { sameAlt: true }));
    expect(drawings(doc)).toEqual(['pyridine', 'pyridine']);
  });

  it('files saved before the pictures were fingerprinted open by the name, as before', async () => {
    const b = unzipSync(await writeDocx(docOf(PYRIDINE), deps));
    const old: Parts = { ...b };
    for (const [name, bytes] of Object.entries(b)) {
      const s = name.startsWith('customXml/item') ? strFromU8(bytes) : '';
      if (s.includes('&quot;drawings&quot;')) old[name] = new Uint8Array(strToU8(s.replace(/,&quot;(png|alt)&quot;:&quot;.*?&quot;/g, '')));
    }
    const model = Object.entries(b).find(([n]) => n === 'customXml/item1.xml')![1];
    expect(strFromU8(model)).toContain('&quot;png&quot;');
    expect(strFromU8(old['customXml/item1.xml'])).not.toMatch(/&quot;(png|alt)&quot;/);
    const { doc } = await readDocx(zipSync(old));
    expect(drawings(doc)).toEqual(['pyridine']);
  });
});
