// @vitest-environment jsdom
//
// A hashed wedge has no hash on its stereocentre (issue #272): the first hash sits a spacing
// out from an atom with other bonds, as ChemDraw 25 draws it. A bond on its own (no other bonds
// at either end) has hashes from end to end, as in ChemDraw too.

import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/renderer';
import { Doc } from '../src/model';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;

/** A pretend Path2D that keeps the start of every line. */
function recPath() {
  const starts: { x: number; y: number }[] = [];
  return {
    starts,
    moveTo(x: number, y: number) { starts.push({ x, y }); },
    lineTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {},
  };
}

describe('hashed wedge', () => {
  it('starts its hashes away from the narrow end', () => {
    const doc = new Doc();
    let a = 0, b = 0;
    doc.edit('draw', () => {
      a = doc.addAtom(100, 100).id;
      b = doc.addAtom(100, 100 - doc.style.bondLength).id;
      doc.addBond(a, b, 1, 'hashWedge');
      doc.addBond(a, doc.addAtom(100 + doc.style.bondLength, 100).id, 1, 'solid');
    });
    const bond = [...doc.bonds.values()][0];
    const batch = { thin: recPath(), bold: recPath(), dashed: recPath(), fills: recPath(), tips: recPath() };
    (new Renderer(noCanvas, noCanvas) as any).bondPaths(doc, bond, doc.atoms.get(a), doc.atoms.get(b), batch);
    const ys = batch.thin.starts.map((p) => p.y);
    expect(ys.length).toBeGreaterThanOrEqual(2);
    // every hash sits clear of the stereocentre (y = 100), the last one ending at the wide end
    expect(Math.max(...ys)).toBeLessThan(100 - doc.style.hashSpacing * 0.5);
    expect(Math.min(...ys)).toBeCloseTo(100 - doc.style.bondLength + doc.style.lineWidth / 2, 3);
  });
});
