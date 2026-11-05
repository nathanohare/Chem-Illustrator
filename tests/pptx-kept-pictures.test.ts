// @vitest-environment jsdom
//
// Structure pictures in PowerPoint (audit S18, E14): an unchanged structure goes back with the
// picture the file had (not drawn again, so a save keeps the deck's size and takes no drawing
// time), and the drawing rides inside its SVG too, so a deck saved by a program that drops
// PowerPoint's tags (LibreOffice) still opens with its structures.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { drawingInSvg, svgWithDrawing } from '../src/io/ole-kept';
import { defaultMaster } from '../src/deck/deck';
import { boxOf } from '../src/objects';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);

/** Picture options that count the pictures drawn, each drawing a little different (as a newer version might). */
function counting(): { opts: PptxOptions; drawn: () => number } {
  let n = 0;
  return {
    drawn: () => n,
    opts: {
      async picture(doc) {
        const pts = [...doc.atoms.values()];
        if (!pts.length) return null;
        n++;
        const b = boxOf(pts);
        return { svg: `<svg xmlns="http://www.w3.org/2000/svg" data-n="${pts.length}" data-draw="${n}"><path d="M0 0"/></svg>`, png: new Uint8Array([...PNG, n]), box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
      },
      async svgToPng() { return PNG; },
    },
  };
}

function slideDoc(): Doc {
  const doc = new Doc();
  doc.edit('Draw', () => {
    const L = doc.style.bondLength;
    const a = doc.addAtom(300, 300), b = doc.addAtom(300 + L, 300), c = doc.addAtom(300 + L, 300 + L, 8);
    doc.addBond(a.id, b.id);
    doc.addBond(b.id, c.id);
  });
  return doc;
}

const save = (doc: Doc, opts: PptxOptions, got?: ReturnType<typeof readPptx>) =>
  writePptx({ size: got?.size ?? { w: 960, h: 540 }, master: defaultMaster(), slides: [{ layout: 'blank', doc, notes: '' }], ...(got?.picKept ? { picKept: got.picKept } : {}) }, opts);

const media = (bytes: Uint8Array) => Object.entries(unzipSync(bytes)).filter(([k]) => k.startsWith('ppt/media/')).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
const svgOf = (bytes: Uint8Array) => strFromU8(Object.entries(unzipSync(bytes)).find(([k]) => /^ppt\/media\/.*\.svg$/.test(k))![1]);

function reopen(bytes: Uint8Array): { got: ReturnType<typeof readPptx>; doc: Doc } {
  const got = readPptx(bytes);
  // (as a deck makes a slide's drawing: in the master's drawing style)
  const doc = new Doc();
  doc.style = { ...got.master.drawing };
  doc.restoreContents(got.slides[0].contents);
  return { got, doc };
}

describe('an unchanged structure keeps its picture', () => {
  it('saves the picture the file had, without drawing it again', async () => {
    const first = counting();
    const bytes = await save(slideDoc(), first.opts);
    expect(first.drawn()).toBe(1);
    const { got, doc } = reopen(bytes);
    expect(got.picKept?.size).toBe(1);
    const second = counting();
    const again = await save(doc, second.opts, got);
    expect(second.drawn()).toBe(0);
    expect(media(again)).toEqual(media(bytes));
    // and it is still a structure when read once more, and still kept
    const third = reopen(again);
    expect(third.got.slides[0].contents.atoms).toHaveLength(3);
    expect(third.got.picKept?.size).toBe(1);
  });

  it('moves with the structure when only moved', async () => {
    const bytes = await save(slideDoc(), counting().opts);
    const { got, doc } = reopen(bytes);
    const c = doc.contents();
    for (const a of c.atoms) { a.x += 36; a.y += 18; }
    doc.restoreContents(c);
    const second = counting();
    const again = await save(doc, second.opts, got);
    expect(second.drawn()).toBe(0);
    expect(media(again)).toEqual(media(bytes));
    const off = (b: Uint8Array) => /name="Structure[\s\S]*?<a:off x="(\d+)" y="(\d+)"/.exec(strFromU8(unzipSync(b)['ppt/slides/slide1.xml']))!.slice(1).map(Number);
    const [x0, y0] = off(bytes), [x1, y1] = off(again);
    expect(x1 - x0).toBe(36 * 12700);
    expect(y1 - y0).toBe(18 * 12700);
  });

  it('draws it again once it is changed here', async () => {
    const bytes = await save(slideDoc(), counting().opts);
    const { got, doc } = reopen(bytes);
    doc.edit('Change', () => doc.updateAtom([...doc.atoms.keys()][0], { z: 7 }));
    const second = counting();
    await save(doc, second.opts, got);
    expect(second.drawn()).toBe(1);
  });

  it('draws it again when the drawing style changed', async () => {
    const bytes = await save(slideDoc(), counting().opts);
    const { got, doc } = reopen(bytes);
    doc.edit('Style', () => doc.setStyle({ ...doc.style, lineWidth: doc.style.lineWidth * 2 }));
    const second = counting();
    await save(doc, second.opts, got);
    expect(second.drawn()).toBe(1);
  });

  it('is drawn again when PowerPoint turned it', async () => {
    const bytes = await save(slideDoc(), counting().opts);
    const all = unzipSync(bytes);
    all['ppt/slides/slide1.xml'] = strToU8(strFromU8(all['ppt/slides/slide1.xml']).replace(/(name="Structure[\s\S]*?)<a:xfrm>/, '$1<a:xfrm rot="5400000">'));
    expect(readPptx(zipSync(all)).picKept).toBeUndefined();
  });
});

describe('the drawing inside the structure\'s SVG', () => {
  it('rides in a metadata element, and reads back', () => {
    const svg = svgWithDrawing('<svg xmlns="http://www.w3.org/2000/svg" width="10"><path d="M0 0"/></svg>', '<CDXML a="1 & 2"><page/></CDXML>', '1 2 3 4');
    expect(svg).toMatch(/^<svg [^>]*><metadata>/);
    expect(drawingInSvg(strToU8(svg))).toEqual({ cdxml: '<CDXML a="1 & 2"><page/></CDXML>', box: '1 2 3 4' });
    // an empty <svg/> too
    expect(drawingInSvg(strToU8(svgWithDrawing('<svg xmlns="http://www.w3.org/2000/svg"/>', '<CDXML/>', '0 0 1 1')))?.cdxml).toBe('<CDXML/>');
    expect(drawingInSvg(strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('brings structures back when another program dropped the tags (LibreOffice)', async () => {
    const bytes = await save(slideDoc(), counting().opts);
    expect(svgOf(bytes)).toContain('urn:chem-illustrator:drawing');
    // LibreOffice's save: no custDataLst, no tag parts
    const all = unzipSync(bytes);
    for (const k of Object.keys(all)) if (k.startsWith('ppt/tags/')) delete all[k];
    all['ppt/slides/slide1.xml'] = strToU8(strFromU8(all['ppt/slides/slide1.xml']).replace(/<p:custDataLst>[\s\S]*?<\/p:custDataLst>/g, ''));
    const got = readPptx(zipSync(all));
    expect(got.slides[0].contents.atoms).toHaveLength(3);
    expect(got.slides[0].contents.shapes.filter((s) => s.kind === 'picture')).toHaveLength(0);
    expect(got.warnings.join(' ')).toMatch(/structures were read from their pictures/);
  });
});
