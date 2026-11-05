// @vitest-environment jsdom
//
// A wedge behind a bond that crosses it is cut where the other passes in front, as ChemDraw
// draws it (Nate, 2026-11-03: a gray wedge drawn over the black bond it goes behind).

import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/renderer';
import { Doc, type BondDisplay } from '../src/model';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;

function recPath() {
  const starts: { x: number; y: number }[] = [];
  return { starts, moveTo(x: number, y: number) { starts.push({ x, y }); }, lineTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {} };
}

function pieces(display: BondDisplay, behind: boolean): { fills: number; thin: number } {
  const doc = new Doc();
  let id = 0;
  doc.edit('draw', () => {
    const a = doc.addAtom(0, 0).id, b = doc.addAtom(40, 0).id;
    id = doc.addBond(a, b, 1, display, { z: behind ? 1 : 3 }).id;
    doc.addBond(doc.addAtom(20, -20).id, doc.addAtom(20, 20).id, 1, 'solid', { z: 2 });
  });
  const batch = { thin: recPath(), bold: recPath(), dashed: recPath(), fills: recPath(), tips: recPath() };
  const bond = doc.bonds.get(id)!;
  (new Renderer(noCanvas, noCanvas) as any).bondPaths(doc, bond, doc.atoms.get(bond.a1), doc.atoms.get(bond.a2), batch);
  return { fills: batch.fills.starts.length, thin: batch.thin.starts.length };
}

describe('a wedge behind a crossing bond', () => {
  it('comes in two pieces, and whole in front', () => {
    expect(pieces('wedge', true).fills).toBe(2);
    expect(pieces('wedge', false).fills).toBe(1);
  });
  it('as a hashed wedge, has no hashes under the bond in front', () => {
    expect(pieces('hashWedge', true).thin).toBeLessThan(pieces('hashWedge', false).thin);
  });
});
