// @vitest-environment jsdom
//
// ChemDraw objects in PowerPoint: pasting one copied in PowerPoint gives its structures (the
// clipboard holds the object, whose CONTENTS stream is ChemDraw's CDX, and no ChemDraw data of
// its own); opening a deck brings them in as structures where PowerPoint showed them; saving
// writes them back as ChemDraw objects that PowerPoint opens in ChemDraw. The test files are in
// tests/fixtures/chemdraw-clipboard (see its README).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Doc } from '../src/model';
import { chemdrawObjectDrawing } from '../src/io/clipboard';
import { chemdrawInObject, chemdrawObject, packageObject, progIdOf, CHEMDRAW_CLASS } from '../src/io/ole-object';
import { cfbClass, cfbStreams } from '../src/io/cfb';
import { cdxToCdxml, isCdx } from '../src/io/cdx';
import { readCdxml } from '../src/io/cdxml';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, splitSlide, TAG, type PptxOptions } from '../src/io/pptx-write';
import { PackageReader, NS, fromEmu, bytesHash } from '../src/io/ooxml';
import { emfToSvg } from '../src/render/emf-read';
import { insetWalls, crossesWalls, clampMove } from '../src/page-grid';
import { boxOf } from '../src/objects';
import { defaultMaster } from '../src/deck/deck';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const DIR = join(__dirname, 'fixtures', 'chemdraw-clipboard');
const fixture = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));
const fromPowerPoint = () => fixture('from-powerpoint/embedded-object.bin');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const opts: PptxOptions = {
  async picture(doc) {
    const pts = [...doc.atoms.values()];
    if (!pts.length) return null;
    const b = boxOf(pts);
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', png: PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
  },
  async svgToPng() { return PNG; },
};

/** The drawing ChemDraw put in the object, read straight from its CDX. */
function chemdrawsOwn(): Doc {
  return readCdxml(cdxToCdxml(chemdrawInObject(fromPowerPoint())!)).doc;
}

describe('pasting a ChemDraw object copied in PowerPoint', () => {
  it('finds the CDX in the object PowerPoint puts on the clipboard', () => {
    const obj = fromPowerPoint();
    expect(progIdOf(obj)).toBe('ChemDraw_x64.Document.6.0');
    expect(cfbClass(obj)).toBe(CHEMDRAW_CLASS);
    const cdx = chemdrawInObject(obj);
    expect(cdx && isCdx(cdx)).toBe(true);
  });

  it('pastes the structures, not a picture', () => {
    const doc = chemdrawObjectDrawing(fromPowerPoint());
    expect(doc).not.toBeNull();
    const own = chemdrawsOwn();
    expect(doc!.atoms.size).toBe(own.atoms.size);
    expect(doc!.bonds.size).toBe(own.bonds.size);
    expect(doc!.captions.size).toBe(own.captions.size);
    expect(doc!.shapes.size).toBe(own.shapes.size);
    // the test drawing: two rings, a ruthenium complex, captions and frames
    expect(doc!.atoms.size).toBeGreaterThan(15);
    expect([...doc!.atoms.values()].some((a) => a.z === 44)).toBe(true); // ruthenium
    expect([...doc!.shapes.values()].some((s) => s.kind === 'rect' && s.rounded && s.shadow)).toBe(true);
  });

  it('leaves other programs\' objects alone', () => {
    const pkg = packageObject('notes.txt', new TextEncoder().encode('hello'));
    expect(chemdrawInObject(pkg)).toBeNull();
    expect(chemdrawObjectDrawing(pkg)).toBeNull();
    expect(chemdrawObjectDrawing(new Uint8Array(600))).toBeNull();
  });

  it('can still show the picture PowerPoint copied with it', () => {
    const svg = emfToSvg(fixture('from-powerpoint/picture.emf'));
    expect(svg).not.toBeNull();
    expect(svg!.vectors).toBeGreaterThan(20);
    expect(svg!.svg).toContain('PCy');
  });
});

describe('ChemDraw objects in PowerPoint files', () => {
  it('opens one as structures where PowerPoint shows it', () => {
    const got = readPptx(fixture('chemdraw-object.pptx'));
    expect(got.warnings.join(' ')).not.toMatch(/ChemDraw/);
    const c = got.slides[0].contents;
    expect(c.shapes.some((s) => s.kind === 'picture')).toBe(false);
    const own = chemdrawsOwn();
    expect(c.atoms.length).toBe(own.atoms.size);
    expect(c.bonds.length).toBe(own.bonds.size);
    for (const x of [...c.atoms, ...c.captions, ...c.shapes, ...c.arrows]) expect(x.ole).toEqual({ id: 1, prog: 'ChemDraw_x64.Document.6.0' });
    // PowerPoint's frame: 508000, 762000 EMU, 5156200 × 2560638 EMU, at the size ChemDraw made it
    const frame = { x1: fromEmu(508000), y1: fromEmu(762000), x2: fromEmu(508000 + 5156200), y2: fromEmu(762000 + 2560638) };
    const b = boxOf(c.atoms);
    expect(b.x1).toBeGreaterThan(frame.x1);
    expect(b.x2).toBeLessThan(frame.x2);
    expect(b.y1).toBeGreaterThan(frame.y1);
    expect(b.y2).toBeLessThan(frame.y2);
    // where ChemDraw has them, moved by the frame's place (the object is at its own size)
    const ob = boxOf([...own.atoms.values()]);
    expect(b.x2 - b.x1).toBeCloseTo(ob.x2 - ob.x1, 0);
    expect(b.y2 - b.y1).toBeCloseTo(ob.y2 - ob.y1, 0);
  });

  it('sizes a shrunken object\'s drawing as PowerPoint shows it', () => {
    const src = unzipSync(fixture('chemdraw-object.pptx'));
    const slide = strFromU8(src['ppt/slides/slide1.xml']).replace(/<a:ext cx="5156200" cy="2560638"\/>/, '<a:ext cx="2578100" cy="1280319"/>');
    src['ppt/slides/slide1.xml'] = strToU8(slide);
    const half = readPptx(zipSync(src)).slides[0].contents;
    const full = readPptx(fixture('chemdraw-object.pptx')).slides[0].contents;
    const w = (atoms: typeof full.atoms) => { const b = boxOf(atoms); return b.x2 - b.x1; };
    expect(w(half.atoms) / w(full.atoms)).toBeCloseTo(0.5, 2);
  });

  it('saves it back as a ChemDraw object PowerPoint opens in ChemDraw, and reads that back', async () => {
    const got = readPptx(fixture('chemdraw-object.pptx'));
    const doc = new Doc();
    doc.restoreContents(got.slides[0].contents);
    // a structure drawn beside it stays a picture of its own
    doc.edit('Draw', () => {
      const a = doc.addAtom(700, 500), b = doc.addAtom(720, 500);
      doc.addBond(a.id, b.id, 1);
    });
    const parts = splitSlide(doc);
    expect(parts.drawings.length).toBe(2);
    expect([...parts.chemdraw.values()]).toEqual(['ChemDraw_x64.Document.6.0']);

    const bytes = await writePptx({ size: got.size, master: defaultMaster(), slides: [{ layout: 'blank', doc, notes: '' }] }, opts);
    const r = new PackageReader(bytes);
    const xml = r.xml('ppt/slides/slide1.xml')!;
    const oles = Array.from(xml.getElementsByTagNameNS(NS.p, 'oleObj'));
    expect(oles.length).toBe(1);
    expect(oles[0].getAttribute('progId')).toBe('ChemDraw_x64.Document.6.0');
    expect(xml.getElementsByTagNameNS(NS.p, 'pic').length).toBe(2); // the object's picture, and the other structure's
    const rel = [...r.rels('ppt/slides/slide1.xml').values()].find((x) => /oleObject$/.test(x.type))!;
    const bin = r.bytes(rel.target)!;
    expect(progIdOf(bin)).toBe('ChemDraw_x64.Document.6.0');
    expect(cfbClass(bin)).toBe(CHEMDRAW_CLASS);
    expect(cfbStreams(bin).has('CONTENTS')).toBe(true);
    expect(strFromU8(unzipSync(bytes)['[Content_Types].xml'])).toMatch(/Extension="bin" ContentType="application\/vnd.openxmlformats-officedocument.oleObject"/);
    const cdx = chemdrawInObject(bin)!;
    const inside = readCdxml(cdxToCdxml(cdx)).doc;
    expect(inside.atoms.size).toBe(got.slides[0].contents.atoms.length);

    // read back: the same structures, still one ChemDraw object, and the other structure on its own
    const back = readPptx(bytes).slides[0].contents;
    expect(back.atoms.length).toBe(doc.atoms.size);
    expect(back.atoms.filter((x) => x.ole).length).toBe(got.slides[0].contents.atoms.length);
    expect(new Set(back.atoms.filter((x) => x.ole).map((x) => x.ole!.prog))).toEqual(new Set(['ChemDraw_x64.Document.6.0']));
  });

  it('reads the ChemDraw data, not the drawing kept beside it, once the object was changed in ChemDraw', async () => {
    const got = readPptx(fixture('chemdraw-object.pptx'));
    const doc = new Doc();
    doc.restoreContents(got.slides[0].contents);
    const bytes = await writePptx({ size: got.size, master: defaultMaster(), slides: [{ layout: 'blank', doc, notes: '' }] }, opts);
    const files = unzipSync(bytes);
    // "edited in ChemDraw": the object now holds another drawing (one carbon-carbon bond)
    const bond = '<?xml version="1.0"?><CDXML BoundingBox="0 0 20 0"><page><fragment><n id="1" p="0 0"/><n id="2" p="20 0"/><b B="1" E="2"/></fragment></page></CDXML>';
    const { cdxmlToCdx } = await import('../src/io/cdx');
    const name = Object.keys(files).find((k) => k.startsWith('ppt/embeddings/'))!;
    files[name] = chemdrawObject(cdxmlToCdx(bond), 'ChemDraw_x64.Document.6.0');
    const back = readPptx(zipSync(files)).slides[0].contents;
    expect(back.atoms.length).toBe(2);
    expect(back.bonds.length).toBe(1);
    // and while unchanged, the kept drawing is used (its fingerprint matches)
    const tags = Object.entries(files).filter(([k]) => /ppt\/tags\//.test(k)).map(([, v]) => strFromU8(v)).join('');
    expect(tags).toContain(TAG.oleCdx);
    expect(bytesHash(new Uint8Array(4))).not.toBe(bytesHash(new Uint8Array(5)));
  });
});

describe('a margin when pasting near a fixed page edge', () => {
  const walls = { x1: 0, y1: 0, x2: Infinity, y2: Infinity };
  it('keeps a paste a little way in from the left and top edges', () => {
    const box = { x1: 0, y1: 40, x2: 100, y2: 80 };
    const inner = insetWalls(walls, 18, box);
    expect(crossesWalls(box, walls)).toBe(false);
    expect(crossesWalls(box, inner)).toBe(true);
    expect(clampMove(box, { x: 0, y: 0 }, inner)).toEqual({ x: 18, y: 0 });
  });
  it('shrinks the margin when the room is only just big enough', () => {
    const box = { x1: -5, y1: 0, x2: 95, y2: 50 };
    const inner = insetWalls({ x1: 0, y1: 0, x2: 110, y2: Infinity }, 18, box);
    expect(inner.x1).toBe(5);
    expect(inner.x2).toBe(105);
    expect(clampMove(box, { x: 0, y: 0 }, inner).x).toBe(10);
  });
});
