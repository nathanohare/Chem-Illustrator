// @vitest-environment jsdom
//
// Settings ▸ General: structures in Word and PowerPoint files saved as ChemDraw objects (they
// open in ChemDraw from Word or PowerPoint) instead of pictures. Our own drawing goes with each,
// so it opens here again as it was, until the object is changed in ChemDraw.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocObject, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';
import type { Contents, TextRun } from '../src/model';
import { Doc } from '../src/model';
import { chemdrawInObject, chemdrawObject, progIdOf, CHEMDRAW_CLASS, CHEMDRAW_PROG } from '../src/io/ole-object';
import { cfbClass } from '../src/io/cfb';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { PackageReader, NS, bytesHash } from '../src/io/ooxml';
import { boxOf } from '../src/objects';
import { defaultMaster } from '../src/deck/deck';
import { parseSettings } from '../src/settings';

// ---------------------------------------------------------------- Word

/** A structure: two carbons, told apart by where the second one is. */
const structure = (x: number): Contents => ({
  atoms: [{ id: 1, x: 0, y: 0, element: 'C' } as Contents['atoms'][number], { id: 2, x, y: 0, element: 'C' } as Contents['atoms'][number]],
  bonds: [{ id: 1, a1: 1, a2: 2, order: 1 } as Contents['bonds'][number]],
  captions: [], arrows: [], shapes: [],
});
const ETHANE = structure(20), LONGER = structure(30);
const CDX_HEAD = [0x56, 0x6a, 0x43, 0x44, 0x30, 0x31, 0x30, 0x30, 0x04, 0x03, 0x02, 0x01];
/** Stand-in CDX: the header ChemDraw's files start with, then something of the drawing's own. */
const cdxOf = (c: Contents) => new Uint8Array([...CDX_HEAD, ...strToU8(`x=${c.atoms[1].x}`), 0, 0, 0, 0]);
const PNG = (c: Contents) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, c.atoms[1]?.x ?? 0]);

const deps = (chemdrawObjects: boolean): DocxDeps => ({
  async picture(c) { return { png: PNG(c), svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', w: 80, h: 40 }; },
  async svgToPng(_s, _w, _h) { return PNG(ETHANE); },
  async smiles() { return 'CC'; },
  cdx: (c) => cdxOf(c),
  chemdrawObjects,
});

function docOf(o: DocObject): DocText {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const runs: TextRun[] = [{ ...n, text: 'Before\n' }, objectRun(1, n), { ...n, text: '\nAfter' }];
  const N = paraFromStyle(d.styles.Normal, {});
  return { ...d, runs: rt.normalizeRuns(runs), paras: [N, N, N], objects: { 1: o } };
}

const objects = (d: DocText) => Object.values(d.objects);
type Parts = Record<string, Uint8Array>;
const oleParts = (p: Parts) => Object.keys(p).filter((k) => /^word\/embeddings\/oleObject\d+\.bin$/.test(k));

describe('structures in Word files saved as ChemDraw objects', () => {
  it('writes each as a ChemDraw object holding its CDX, with its picture for Word to show', async () => {
    const parts = unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: ETHANE }), deps(true)));
    const doc = strFromU8(parts['word/document.xml']);
    expect(doc).toMatch(/<w:object [^>]*>/);
    expect(doc).toContain(`ProgID="${CHEMDRAW_PROG}"`);
    expect(doc).toContain('DrawAspect="Content"');
    expect(doc).not.toContain('<w:drawing>');
    // the shape's alt text, as on a picture
    expect(doc).toMatch(/<v:shape [^>]*alt="Chemical structure \(SMILES\): CC"/);
    const [bin] = oleParts(parts);
    expect(bin).toBeDefined();
    expect(progIdOf(parts[bin])).toBe(CHEMDRAW_PROG);
    expect(cfbClass(parts[bin])).toBe(CHEMDRAW_CLASS);
    expect([...chemdrawInObject(parts[bin])!]).toEqual([...cdxOf(ETHANE)]);
    expect(strFromU8(parts['[Content_Types].xml'])).toMatch(/oleObject/);
  });

  it('opens one again as our structure, which the setting saves either way next time', async () => {
    const bytes = await writeDocx(docOf({ kind: 'drawing', contents: ETHANE, alt: 'Ethane' }), deps(true));
    const { doc } = await readDocx(bytes);
    const [o] = objects(doc);
    expect(o.kind).toBe('drawing');
    if (o.kind !== 'drawing') return;
    expect(o.contents.atoms.map((a) => a.x)).toEqual([0, 20]);
    expect(o.ole).toBeUndefined();
    expect(o.alt).toBe('Ethane');
    // Save As with pictures chosen: a picture again
    const pictures = unzipSync(await writeDocx(doc, deps(false)));
    expect(oleParts(pictures)).toHaveLength(0);
    expect(strFromU8(pictures['word/document.xml'])).toContain('<w:drawing>');
    expect(oleParts(unzipSync(await writeDocx(doc, deps(true))))).toHaveLength(1);
  });

  it('keeps one from ChemDraw a ChemDraw object through saves, whatever is chosen', async () => {
    const prog = 'ChemDraw_x64.Document.6.0';
    const first = await writeDocx(docOf({ kind: 'drawing', contents: ETHANE, ole: prog }), deps(false));
    const { doc } = await readDocx(first);
    const [o] = objects(doc);
    expect(o.kind === 'drawing' && o.ole).toBe(prog);
    const parts = unzipSync(await writeDocx(doc, deps(false)));
    expect(oleParts(parts).map((k) => progIdOf(parts[k]))).toEqual([prog]);
    // and one saved as a picture (floating, which Word objects can't be) keeps the mark too
    const floating = await writeDocx(docOf({ kind: 'drawing', contents: ETHANE, ole: prog, float: { wrap: 'square', x: 10, y: 10 } }), deps(false));
    const back = objects((await readDocx(floating)).doc)[0];
    expect(back.kind === 'drawing' && back.ole).toBe(prog);
  });

  it('takes ChemDraw\'s drawing once the object was changed in ChemDraw', async () => {
    const parts = unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: ETHANE }), deps(true)));
    const [bin] = oleParts(parts);
    const changed: Parts = { ...parts, [bin]: chemdrawObject(cdxOf(LONGER)) };
    const { doc } = await readDocx(zipSync(changed));
    const [o] = objects(doc);
    // kept as ChemDraw had it (its picture and object), not our drawing from before the change
    expect(o.kind).toBe('picture');
    expect(o.kind === 'picture' && o.embed?.prog).toBe(CHEMDRAW_PROG);
  });

  it('writes pictures when the setting is off', async () => {
    const parts = unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: ETHANE }), deps(false)));
    expect(oleParts(parts)).toHaveLength(0);
    expect(strFromU8(parts['word/document.xml'])).toContain('<w:drawing>');
  });

  it('keeps a structure that came from a ChemDraw object one, with the setting off', async () => {
    const parts = unzipSync(await writeDocx(docOf({ kind: 'drawing', contents: ETHANE, ole: 'ChemDraw_x64.Document.6.0' }), deps(false)));
    const [bin] = oleParts(parts);
    expect(progIdOf(parts[bin])).toBe('ChemDraw_x64.Document.6.0');
    expect(strFromU8(parts['word/document.xml'])).toContain('ProgID="ChemDraw_x64.Document.6.0"');
  });

  it('saves floating and turned structures, and drawings without atoms, as pictures', async () => {
    for (const o of [
      { kind: 'drawing', contents: ETHANE, float: { wrap: 'square', x: 10, y: 10 } },
      { kind: 'drawing', contents: ETHANE, rot: 90 },
      { kind: 'drawing', contents: { ...ETHANE, atoms: [], bonds: [] } },
    ] as DocObject[]) {
      const parts = unzipSync(await writeDocx(docOf(o), deps(true)));
      expect(oleParts(parts)).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------- PowerPoint

const PPT_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pptOpts = (chemdrawObjects: boolean): PptxOptions => ({
  async picture(doc) {
    const pts = [...doc.atoms.values()];
    if (!pts.length) return null;
    const b = boxOf(pts);
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', png: PPT_PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
  },
  async svgToPng() { return PPT_PNG; },
  chemdrawObjects,
});

function slideDoc(): Doc {
  const doc = new Doc();
  doc.edit('Draw', () => {
    const a = doc.addAtom(300, 300), b = doc.addAtom(320, 300);
    doc.addBond(a.id, b.id, 1);
  });
  return doc;
}
const size = { w: 960, h: 540 };

describe('structures in PowerPoint files saved as ChemDraw objects', () => {
  it('writes a ChemDraw object for each structure, and opens it again as the structure', async () => {
    const bytes = await writePptx({ size, master: defaultMaster(), slides: [{ layout: 'blank', doc: slideDoc(), notes: '' }] }, pptOpts(true));
    const r = new PackageReader(bytes);
    const xml = r.xml('ppt/slides/slide1.xml')!;
    const oles = Array.from(xml.getElementsByTagNameNS(NS.p, 'oleObj'));
    expect(oles.map((o) => o.getAttribute('progId'))).toEqual([CHEMDRAW_PROG]);
    const rel = [...r.rels('ppt/slides/slide1.xml').values()].find((x) => /oleObject$/.test(x.type))!;
    expect(cfbClass(r.bytes(rel.target)!)).toBe(CHEMDRAW_CLASS);

    const got = readPptx(bytes);
    const atoms = got.slides[0].contents.atoms;
    expect(atoms).toHaveLength(2);
    // a plain structure again (not one from ChemDraw): the setting decides next time
    expect(atoms.some((a) => a.ole)).toBe(false);
    const doc = new Doc();
    doc.restoreContents(got.slides[0].contents);
    const save = (on: boolean) => writePptx({ size: got.size, master: defaultMaster(), slides: [{ layout: 'blank', doc, notes: '' }], oleKept: got.oleKept }, pptOpts(on));
    const pictures = new PackageReader(await save(false)).xml('ppt/slides/slide1.xml')!;
    expect(pictures.getElementsByTagNameNS(NS.p, 'oleObj').length).toBe(0);
    // saved again as a ChemDraw object: the same object as before
    const r2 = new PackageReader(await save(true));
    const rel2 = [...r2.rels('ppt/slides/slide1.xml').values()].find((x) => /oleObject$/.test(x.type))!;
    expect(bytesHash(r2.bytes(rel2.target)!)).toBe(bytesHash(r.bytes(rel.target)!));
  });

  it('writes pictures when the setting is off', async () => {
    const bytes = await writePptx({ size, master: defaultMaster(), slides: [{ layout: 'blank', doc: slideDoc(), notes: '' }] }, pptOpts(false));
    const xml = new PackageReader(bytes).xml('ppt/slides/slide1.xml')!;
    expect(xml.getElementsByTagNameNS(NS.p, 'oleObj').length).toBe(0);
    expect(xml.getElementsByTagNameNS(NS.p, 'pic').length).toBe(1);
  });
});

describe('the setting', () => {
  it('is pictures for both unless chosen, and reads back per file type', () => {
    expect(parseSettings(null).officeStructures).toEqual({ docx: 'pictures', pptx: 'pictures' });
    expect(parseSettings(JSON.stringify({ officeStructures: { docx: 'chemdraw', pptx: 'nonsense' } })).officeStructures).toEqual({ docx: 'chemdraw', pptx: 'pictures' });
  });
});
