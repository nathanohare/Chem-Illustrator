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
