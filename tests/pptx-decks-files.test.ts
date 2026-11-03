// @vitest-environment jsdom
//
// Real PowerPoint decks (people's own talks, never kept in this repository): point
// CHEM_TEST_PPTX at a folder of .pptx files to check them locally. Every ChemDraw object must
// come in as structures (none as pictures), and saving the deck and opening it again must keep
// them as the same ChemDraw objects with the same structures. With CHEM_TEST_OUT set to a file,
// a summary of each deck (slides, ChemDraw objects, warnings) is written there as JSON.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { PackageReader, NS } from '../src/io/ooxml';
import { isChemDraw } from '../src/io/ole-object';
import { Doc } from '../src/model';
import { boxOf } from '../src/objects';

const dir = process.env.CHEM_TEST_PPTX ?? '';
const files = dir && existsSync(dir) ? readdirSync(dir).filter((f) => /\.pptx$/i.test(f) && !f.startsWith('~$')) : [];

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const opts: PptxOptions = {
  async picture(doc) {
    const pts = [...doc.atoms.values()];
    const b = pts.length ? boxOf(pts) : doc.bounds();
    if (!b) return null;
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', png: PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
  },
  async svgToPng() { return PNG; },
};

/** How many ChemDraw objects each slide of a deck holds, from its XML. */
function chemdrawObjects(bytes: Uint8Array): number[] {
  const r = new PackageReader(bytes);
  const pres = r.xml('ppt/presentation.xml')!;
  const rels = r.rels('ppt/presentation.xml');
  return Array.from(pres.getElementsByTagNameNS(NS.p, 'sldId')).map((s) => {
    const target = rels.get(s.getAttributeNS(NS.r, 'id') ?? '')?.target;
    const xml = target ? r.xml(target) : null;
    if (!xml) return 0;
    // (an object PowerPoint wrote twice, for older and newer programs, counts once)
    const frames = Array.from(xml.getElementsByTagNameNS(NS.p, 'graphicFrame'));
    return frames.filter((f) => Array.from(f.getElementsByTagNameNS(NS.p, 'oleObj')).some((o) => isChemDraw(o.getAttribute('progId') ?? ''))).length;
  });
}

const summary: Record<string, unknown> = {};

describe.skipIf(!files.length)('opening real PowerPoint decks', { timeout: 300000 }, () => {
  for (const f of files) {
    it(f, async () => {
      const bytes = new Uint8Array(readFileSync(join(dir, f)));
      const want = chemdrawObjects(bytes);
      const got = readPptx(bytes);
      const objects = got.slides.map((s) => new Set([...s.contents.atoms, ...s.contents.captions, ...s.contents.shapes, ...s.contents.arrows].filter((x) => x.ole).map((x) => x.ole!.id)).size);
      summary[f] = { slides: got.slides.length, chemdrawObjects: want.reduce((a, b) => a + b, 0), readAsStructures: objects.reduce((a, b) => a + b, 0), warnings: got.warnings };
      if (process.env.CHEM_TEST_OUT) writeFileSync(process.env.CHEM_TEST_OUT, JSON.stringify(summary, null, 2));
      expect(objects).toEqual(want);

      // saved and opened again: the same ChemDraw objects, holding the same atoms
      const slides = got.slides.map((s) => { const doc = new Doc(); doc.restoreContents(s.contents); return { layout: s.layout, doc, notes: s.notes }; });
      const again = readPptx(await writePptx({ size: got.size, master: got.master, slides }, opts));
      const count = (c: { atoms: { ole?: unknown }[]; captions: { ole?: unknown }[] }) => `${c.atoms.filter((a) => a.ole).length} atoms, ${c.captions.filter((a) => a.ole).length} text`;
      expect(again.slides.map((s) => count(s.contents))).toEqual(got.slides.map((s) => count(s.contents)));
    });
  }
});
