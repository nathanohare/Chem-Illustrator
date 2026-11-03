// @vitest-environment jsdom
//
// Hash and dash bonds, and turned boxes, as ChemDraw 25 draws them (counts measured from its own
// pictures of test drawings: tests/fixtures/chemdraw-clipboard/README.md).

import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/renderer';
import { Doc, type BondDisplay } from '../src/model';
import { readCdxml } from '../src/io/cdxml';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;
function recPath() {
  const starts: { x: number; y: number }[] = [];
  return { starts, moveTo(x: number, y: number) { starts.push({ x, y }); }, lineTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {} };
}
/** How many strokes a lone bond of this length is drawn with (ChemDraw's line width 1, hash spacing 2.7). */
function strokes(display: BondDisplay, length: number, hashSpacing = 2.7): number {
  const doc = new Doc();
  doc.style = { ...doc.style, lineWidth: 1, hashSpacing, boldWidth: 4, marginWidth: 1.6 };
  let id = 0;
  doc.edit('draw', () => { id = doc.addBond(doc.addAtom(0, 0).id, doc.addAtom(length, 0).id, 1, display).id; });
  const batch = { thin: recPath(), bold: recPath(), dashed: recPath(), fills: recPath(), tips: recPath() };
  const b = doc.bonds.get(id)!;
  (new Renderer(noCanvas, noCanvas) as any).bondPaths(doc, b, doc.atoms.get(b.a1), doc.atoms.get(b.a2), batch);
  return batch.thin.starts.length;
}

describe('bonds as ChemDraw 25 draws them', () => {
  it('hash bonds: floor((length − line width) / spacing) + 1 hashes', () => {
    expect(strokes('hash', 30)).toBe(11);
    expect(strokes('hash', 10)).toBe(4);
  });
  it('dashed bonds: floor(length / 2.5 spacings) + 1 dashes', () => {
    for (const [L, hs, n] of [[10, 2.7, 2], [14.4, 2.7, 3], [20, 2.7, 3], [45, 2.7, 7], [30, 2.7, 5], [30, 5, 3]]) expect(strokes('dash', L, hs)).toBe(n);
  });
});

describe('a turned box from ChemDraw', () => {
  it('keeps its turn (a diamond) instead of a flat line', () => {
    const { doc } = readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><graphic id="5" BoundingBox="65.36 601.53 58.58 601.75" GraphicType="Rectangle" RectangleType="Filled" Center3D="61.97 601.64 0" MajorAxisEnd3D="63.71 599.89 0" MinorAxisEnd3D="63.62 603.28 0"/></page></CDXML>`);
    const s = doc.shapes.get(5)!;
    expect(s.rot).toBeCloseTo(314.85 - 180, 0);
    expect(s.x2 - s.x1).toBeCloseTo(2 * Math.hypot(1.74, 1.75), 2);
    expect(s.y2 - s.y1).toBeCloseTo(2 * Math.hypot(1.65, 1.64), 2);
  });
});

describe('a stray carbon from ChemDraw', () => {
  it('is drawn as nothing, as ChemDraw draws it (not CH4)', () => {
    const { doc } = readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><fragment id="2"><n id="10" p="20 20"/></fragment><fragment id="3"><n id="11" p="60 20"/><n id="12" p="74.4 20"/><b id="13" B="11" E="12"/><n id="14" p="67 40"/></fragment></page></CDXML>`);
    const r = new Renderer(noCanvas, noCanvas) as any;
    for (const id of [10, 14]) {
      expect(doc.atoms.get(id)!.bare).toBe(true);
      expect(r.atomInfo(doc, doc.atoms.get(id)).layout).toBeNull();
    }
    expect(doc.atoms.get(11)!.bare).toBeUndefined();
  });
});

describe('the wavy line of a point of attachment', () => {
  it('is sized as ChemDraw sizes it: waves from the bold width, length from the label size', async () => {
    const { attachWave } = await import('../src/render/renderer');
    const pts: number[] = [];
    const path = { moveTo(x: number) { pts.push(x); }, quadraticCurveTo(_cx: number, _cy: number, x: number) { pts.push(x); } } as unknown as Path2D;
    attachWave(path, { x: 0, y: 0 }, { x: 1, y: 0 }, 10, 4);
    // 1.5 label sizes + 3 points, in half waves of half the bold width (ChemDraw: 19 pt, 10 half waves)
    expect(pts.length - 1).toBe(9);
    expect(Math.max(...pts) - Math.min(...pts)).toBeCloseTo(18, 6);
  });
});
