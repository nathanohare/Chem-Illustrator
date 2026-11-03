// @vitest-environment jsdom
//
// Finds where a real deck loses something between opening and saving again, for decks that can't
// leave the computer they're on. Opt-in: CHEM_TEST_PPTX=<deck.pptx or folder> CHEM_PROBE_DECK=<file
// name, when a folder> CHEM_PROBE_SLIDE=<slide number, from 1> CHEM_TEST_OUT=<report.json>.
// The report names each atom that goes missing, its neighbours, and which step loses it: the
// slide split, the drawing taken out for saving, our CDXML, or the CDX written into the object.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { splitSlide } from '../src/deck/split-slide';
import { extractDrawing } from '../src/io/clipboard';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';
import { Doc, type Atom } from '../src/model';
import { boxOf } from '../src/objects';

const where = process.env.CHEM_TEST_PPTX ?? '';
const deck = where && existsSync(where) ? (statSync(where).isDirectory() ? join(where, process.env.CHEM_PROBE_DECK ?? '') : where) : '';
const slideNo = Number(process.env.CHEM_PROBE_SLIDE ?? '0');

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

describe.skipIf(!deck || !existsSync(deck) || !slideNo)('probing one slide of a real deck', { timeout: 300000 }, () => {
  it(`${deck} slide ${slideNo}`, async () => {
    const got = readPptx(new Uint8Array(readFileSync(deck)));
    const s = got.slides[slideNo - 1];
    const doc = new Doc();
    doc.restoreContents(s.contents);
    const report: Record<string, unknown> = { atoms: doc.atoms.size, oleAtoms: [...doc.atoms.values()].filter((a) => a.ole).length };
    const describeAtom = (a: Atom) => ({ ...a, bonds: [...(doc.adj.get(a.id) ?? [])].map((b) => { const bd = doc.bonds.get(b)!; const o = doc.atoms.get(bd.a1 === a.id ? bd.a2 : bd.a1); return { ...bd, other: o && { id: o.id, z: o.z, label: o.label, x: o.x, y: o.y, multi: o.multi } }; }) });

    // 1. the slide split: every atom in exactly one drawing
    const parts = splitSlide(doc);
    const inDrawing = new Map<number, number>();
    parts.drawings.forEach((sel, i) => { for (const id of sel.atoms) inDrawing.set(id, i); });
    report.notInAnyDrawing = [...doc.atoms.values()].filter((a) => !inDrawing.has(a.id)).map(describeAtom);

    // 2-4. each drawing as saved: taken out, as our CDXML, and as the CDX in a ChemDraw object
    report.drawings = parts.drawings.map((sel, i) => {
      const part = extractDrawing(doc, sel);
      const out: Record<string, unknown> = { index: i, chemdraw: parts.chemdraw.get(sel) ?? null, selected: sel.atoms.size, extracted: part.atoms.size };
      const lostOut = [...sel.atoms].filter((id) => !part.atoms.has(id));
      if (lostOut.length) out.lostTakingOut = lostOut.map((id) => describeAtom(doc.atoms.get(id)!));
      try {
        const cdxml = writeCdxml(part, { name: 'probe.cdxml' });
        const back = readCdxml(cdxml).doc;
        out.cdxml = back.atoms.size;
        if (back.atoms.size !== part.atoms.size) {
          const near = (a: Atom) => [...back.atoms.values()].some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5);
          out.lostInCdxml = [...part.atoms.values()].filter((a) => !near(a)).map((a) => describeAtom(doc.atoms.get(a.id) ?? a));
          out.cdxmlAround = (out.lostInCdxml as { id: number }[]).map((a) => { const m = new RegExp(`<n id="${a.id}"[\\s\\S]{0,600}`).exec(cdxml); return m ? m[0] : null; });
        }
        if (out.chemdraw) out.cdx = readCdxml(cdxToCdxml(cdxmlToCdx(cdxml))).doc.atoms.size;
      } catch (e) {
        out.error = String(e);
      }
      return out;
    });

    // 5. the whole slide saved and opened again
    const again = readPptx(await writePptx({ size: got.size, master: got.master, slides: [{ layout: s.layout, doc, notes: s.notes }] }, opts));
    const back = again.slides[0].contents;
    report.reopened = back.atoms.length;
    report.lostReopening = [...doc.atoms.values()].filter((a) => !back.atoms.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5 && b.z === a.z)).map(describeAtom);
    report.warnings = again.warnings;
    if (process.env.CHEM_TEST_OUT) writeFileSync(process.env.CHEM_TEST_OUT, JSON.stringify(report, null, 2));
    expect(report).toBeTruthy();
  });
});
