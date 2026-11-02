// @vitest-environment jsdom
//
// Review item 79: the new things kept through every file they can go into. Guides and the
// drawing style's arrow text and sizes belong to a canvas (CDXML); an η ligand's Kekulé choice
// belongs to the structure, so it also goes into slides (PowerPoint keeps each drawing as CDXML)
// and into Word and Excel files (which keep each drawing's contents in our own part).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { bondHapto } from '../src/chem/hapto';
import { boxOf } from '../src/objects';
import { DEFAULT_GUIDES } from '../src/editor/guides';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = {
  async picture(doc) {
    const pts = [...doc.atoms.values()];
    if (!pts.length) return null;
    const b = boxOf(pts);
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', png: PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
  },
  async svgToPng() { return PNG; },
};

/** A Cp ring bonded η⁵ to iron, switched to its Kekulé form. */
function kekuleCp(doc: Doc, x = 300, y = 300): void {
  const L = doc.style.bondLength;
  const ring: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = (-90 + i * 72) * Math.PI / 180;
    ring.push(doc.addAtom(x + Math.cos(t) * L * 0.85, y + Math.sin(t) * L * 0.85 - 30).id);
  }
  ring.forEach((id, i) => doc.addBond(id, ring[(i + 1) % 5], i === 0 || i === 2 ? 2 : 1));
  const fe = doc.addAtom(x, y, 26).id;
  bondHapto(doc, fe, ring);
  const c = [...doc.atoms.values()].find((a) => a.multi)!;
  doc.updateAtom(c.id, { kekule: true });
}
const kekuleKept = (atoms: Iterable<{ multi?: number[]; kekule?: boolean }>) => [...atoms].some((a) => a.multi && a.kekule === true);

describe('a canvas saved as CDXML', () => {
  it('keeps guides, arrow text and sizes, and the Kekulé choice together; ChemDraw sees none of them', () => {
    const doc = new Doc();
    doc.bulk(() => kekuleCp(doc));
    doc.guides = { ...DEFAULT_GUIDES, list: [{ kind: 'cross', x: 100, y: 100 }], grid: true };
    doc.style = { ...doc.style, arrowTextSize: 9, arrowWidth: 1, arrowHeadLength: 8 };
    const text = writeCdxml(doc);
    // ChemDraw passes over hidden objecttags
    for (const name of ['Chem Illustrator guides', 'Chem Illustrator arrows', 'Chem Illustrator Kekule']) {
      expect(text).toMatch(new RegExp(`<objecttag[^>]*Name="${name}"[^>]*Visible="no"|<objecttag[^>]*Visible="no"[^>]*Name="${name}"`));
    }
    // and the η bond is ChemDraw's own multicentre attachment
    expect(text).toContain('MultiAttachment');
    const back = readCdxml(text).doc;
    expect(back.guides?.grid).toBe(true);
    expect(back.style.arrowTextSize).toBe(9);
    expect(back.style.arrowHeadLength).toBe(8);
    expect(kekuleKept(back.atoms.values())).toBe(true);
  });
});

describe('a slide saved as PowerPoint', () => {
  it('keeps the Kekulé choice of a structure on it', async () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide('blank');
    host.edit('Draw', () => kekuleCp(host));
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    const back = readPptx(bytes);
    expect(kekuleKept(back.slides[1].contents.atoms)).toBe(true);
  });
});

describe('a drawing kept in Word or Excel', () => {
  it('keeps the Kekulé choice in its contents', () => {
    const doc = new Doc();
    doc.bulk(() => kekuleCp(doc));
    // Word and Excel files keep each drawing's contents as JSON in our own part
    const again = new Doc();
    again.restoreContents(JSON.parse(JSON.stringify(doc.contents())));
    expect(kekuleKept(again.atoms.values())).toBe(true);
  });
});
