// @vitest-environment jsdom
//
// Review item 79, for the things this round of the review added: a Smart Scheme, an energy
// diagram with brackets between any two species and a dotted pathway, and a complete look
// given by a Format Favorite (fill, pattern, see-through, shadow, glow, line). Each is saved
// and opened again in every file it can go into: CDXML, PowerPoint, Word and Excel. ChemDraw
// and Office see ordinary text, arrows, lines and shapes.

import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Doc, type Contents } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { formatSmart, makeSmart, readSmart, slotName } from '../src/chem/smart-scheme';
import { chemRuns } from '../src/text/chemtext';
import { ENERGY_DEFAULTS, putEnergy, type EnergyData } from '../src/design/energy';
import { paintObjects, pickObjectLook } from '../src/format-painter';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, objectRun, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';
import { Workbook } from '../src/sheet/workbook';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const pptx: PptxOptions = { async picture(d) { const b = d.bounds(); return b ? { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', box: b } : null; }, async svgToPng() { return PNG; } };
const docx: DocxDeps = { async picture() { return { png: PNG, w: 80, h: 40 }; }, async svgToPng() { return PNG; } };
const xlsx: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => PNG };

/** A Smart Scheme: three species, two arrows, a condition. */
function smartScheme(doc: Doc): void {
  const m = plainMeasure(doc);
  doc.edit('scheme', () => {
    const caps = ['ArBr', 'ArAr′', 'ArCHO'].map((t, i) => doc.addCaption({ x: 400 + i * 120, y: 50, runs: [{ text: t }], justify: 'center' }));
    const cond = doc.addCaption({ x: 460, y: 40, runs: chemRuns('Pd(PPh3)4'), justify: 'center' });
    const arrows = [0, 1].map((i) => doc.addArrow({
      headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
      tail: { x: 400 + i * 120 + 35, y: 50 }, head: { x: 400 + i * 120 + 85, y: 50 },
      step: { reactants: ['c' + caps[i].id], products: ['c' + caps[i + 1].id], above: i === 0 ? ['c' + cond.id] : [], below: [], manual: true },
    }).id);
    const id = makeSmart(doc, m, { atoms: new Set(), bonds: new Set(), shapes: new Set(), captions: new Set([...caps.map((c) => c.id), cond.id]), arrows: new Set(arrows) })!;
    // its own look, from the gear on its species list
    formatSmart(doc, m, id, { font: 'Lato', textSize: 9, arrowWidth: 1.25 });
  });
}

/** An energy diagram: a dotted second pathway and a ΔG‡ bracket from the intermediate. */
function energy(doc: Doc): void {
  const data: EnergyData = {
    ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol', w: 240, h: 150,
    paths: [
      { name: 'A', color: '#000000', points: [{ label: 'SM', g: 0 }, { label: 'TS1‡', g: 21.4 }, { label: 'Int', g: 5.1 }, { label: 'TS2‡', g: 18.0 }, { label: 'P', g: -7.2 }] },
      { name: 'B', color: '#c00000', dash: 'dotted', points: [{ label: 'SM', g: 0 }, { label: 'TS1‡', g: 24 }, { label: 'P', g: -7.2 }] },
    ],
    brackets: [{ path: 0, from: 2, to: 3 }],
  };
  doc.edit('energy', () => putEnergy(doc, plainMeasure(doc), data, { x: 60, y: 200 }));
}

/** A box with a full look, and a plain one given that look as a Format Favorite would. */
function favoriteLook(doc: Doc): void {
  doc.edit('look', () => {
    const a = doc.addShape({ kind: 'geo', geo: 'roundRect', x1: 400, y1: 200, x2: 500, y2: 250, filled: true, fillColor: '#ffd966', color: '#c00000' });
    doc.updateShape(a.id, { lineWidth: 2, dashed: true, transparency: 0.25, shadow: true, pattern: 'dkDnDiag', glow: { color: '#00b050', size: 4 } } as never);
    const look = JSON.parse(JSON.stringify(pickObjectLook(doc, { atoms: [], bonds: [], captions: [], arrows: [], shapes: [a.id] })));
    const b = doc.addShape({ kind: 'geo', geo: 'ellipse', x1: 520, y1: 200, x2: 600, y2: 250 });
    doc.updateShape(b.id, { text: { runs: [{ text: 'Key' }] } } as never);
    paintObjects(doc, { atoms: [], bonds: [], captions: [], arrows: [], shapes: [b.id] }, look);
  });
}

function everything(): Doc {
  const doc = new Doc();
  smartScheme(doc);
  energy(doc);
  favoriteLook(doc);
  return doc;
}

/** What should come back, whatever the file. */
function expectKept(c: Contents | Doc): void {
  const doc = c instanceof Doc ? c : (() => { const d = new Doc(); d.restoreContents(c); return d; })();
  // the Smart Scheme, in its order
  const frame = [...doc.shapes.values()].find((s) => s.smart);
  expect(frame).toBeTruthy();
  const read = readSmart(doc, plainMeasure(doc), frame!.id)!;
  expect(read.slots.map((sl) => slotName(doc, sl))).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
  expect(frame!.smart!.fmt).toEqual({ font: 'Lato', textSize: 9, arrowWidth: 1.25 });
  // the energy diagram: still editable, its bracket and dotted pathway kept
  const e = [...doc.shapes.values()].find((s) => s.energy);
  expect(e?.energy?.brackets).toEqual([{ path: 0, from: 2, to: 3 }]);
  expect(e?.energy?.paths[1].dash).toBe('dotted');
  expect([...doc.shapes.values()].some((s) => s.kind === 'line' && s.dotted && s.color === '#c00000')).toBe(true);
  expect([...doc.captions.values()].some((x) => rt.plainText(x.runs).startsWith('ΔG‡ = 12.9'))).toBe(true);
  // the favorite's look, on the ellipse as on the box
  const ell = [...doc.shapes.values()].find((s) => s.geo === 'ellipse')!;
  expect(ell).toMatchObject({ fillColor: '#ffd966', color: '#c00000', lineWidth: 2, dashed: true, transparency: 0.25, shadow: true, pattern: 'dkDnDiag' });
  expect(ell.glow?.color).toBe('#00b050');
}

describe('the new things through every file', () => {
  it('CDXML: kept, and ChemDraw gets ordinary text, arrows, dashes and shapes', () => {
    const doc = everything();
    const xml = writeCdxml(doc);
    expect(xml).toContain('Name="Chem Illustrator dotted" Value="yes"');
    expectKept(readCdxml(xml).doc);
  });

  it('PowerPoint: kept on the slide; PowerPoint sees a picture of the drawing', async () => {
    const doc = everything();
    const d = Deck.design(new Doc(), { w: 720, h: 405 });
    const slide = d.docOf(0);
    slide.restoreContents(doc.contents());
    const bytes = await writePptx({ size: d.size, master: d.master, slides: [{ layout: 'blank', doc: slide, notes: '' }] }, pptx);
    expect(strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml'])).toContain('<p:pic>');
    expectKept(readPptx(bytes).slides[0].contents);
  });

  it('Word: kept in the figure; Word sees its picture', async () => {
    const fig = everything();
    const base = newDocument();
    const n = runStyleOf(base.styles.Normal);
    const N = paraFromStyle(base.styles.Normal, {});
    const t: DocText = { ...base, runs: rt.normalizeRuns([{ ...n, text: 'Scheme\n' }, objectRun(1, n)]), paras: [N, N], objects: { 1: { kind: 'drawing', contents: fig.contents() } } };
    const bytes = await writeDocx(t, docx);
    expect(strFromU8(unzipSync(bytes)['word/document.xml'])).toContain('<pic:pic');
    const back = (await readDocx(bytes)).doc;
    const o = Object.values(back.objects).find((x) => x.kind === 'drawing');
    expect(o && o.kind === 'drawing').toBe(true);
    expectKept((o as { contents: Contents }).contents);
  });

  it('Excel: kept in the cell\'s drawing', async () => {
    const fig = everything();
    const wb = new Workbook(['Schemes']);
    wb.build(() => { wb.sheet.setInput(0, 0, 'Route'); wb.sheet.setStructure(1, 0, fig.contents()); });
    const bytes = await writeXlsx(wb, xlsx);
    const back = (await readXlsx(bytes)).book;
    const s = back.sheet.cell(1, 0)?.structure;
    expect(s).toBeTruthy();
    expectKept(s!.contents);
  });
});
