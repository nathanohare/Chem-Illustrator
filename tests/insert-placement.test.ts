// @vitest-environment jsdom
//
// New diagrams (energy diagrams, MO diagrams, Newman projections) go down where they were asked
// for, moved only as far as the nearest free gap: not past the right edge of everything in the
// drawing, which put them far off screen in a busy drawing.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { selectionBox, withFrameContents } from '../src/editor/arrange';
import { ENERGY_DEFAULTS, type EnergyData } from '../src/design/energy';

window.requestAnimationFrame = () => 0;
const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    : k === 'getTransform' ? () => new DOMMatrix()
    : k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient' ? () => ({ addColorStop: noop })
    : noop),
  set: () => true,
});
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

function editorWith(doc: Doc): Editor {
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  return ed;
}

const energy: EnergyData = {
  ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol', w: 200, h: 120,
  paths: [{ name: '', color: '#000000', points: [{ label: 'SM', g: 0 }, { label: 'TS‡', g: 20 }, { label: 'P', g: -4 }] }],
};

/** A small structure (a two-atom chain) at (x, y). */
function chainAt(doc: Doc, x: number, y: number): void {
  const a = doc.addAtom(x, y), b = doc.addAtom(x + 14.4, y - 8);
  doc.addBond(a.id, b.id);
}

describe('placing a new diagram', () => {
  it('puts an energy diagram in the nearest free gap, not past the far right of the drawing', () => {
    const doc = new Doc();
    // a structure where the diagram is asked for, and others spread far to the right
    doc.edit('scene', () => {
      chainAt(doc, 300, 300);
      for (let k = 1; k <= 6; k++) chainAt(doc, 300 + k * 400, 300);
    });
    const ed = editorWith(doc);
    ed.putEnergyDiagram(energy, { x: 300, y: 300 });
    const frame = [...doc.shapes.values()].find((s) => s.energy)!;
    const box = selectionBox(doc, withFrameContents(doc, { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([frame.id]) }), ed.measure())!;
    const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
    // beside the structure it was put on, within a diagram's size of where it was asked for
    expect(Math.hypot(cx - 300, cy - 300)).toBeLessThan(260);
    expect(box.x2).toBeLessThan(300 + 6 * 400);
  });

  it('leaves a diagram where it was asked for when nothing is there', () => {
    const doc = new Doc();
    doc.edit('scene', () => chainAt(doc, 2000, 2000));
    const ed = editorWith(doc);
    ed.putEnergyDiagram(energy, { x: 300, y: 300 });
    const frame = [...doc.shapes.values()].find((s) => s.energy)!;
    const box = selectionBox(doc, withFrameContents(doc, { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([frame.id]) }), ed.measure())!;
    expect(Math.abs((box.x1 + box.x2) / 2 - 300)).toBeLessThan(40);
    expect(Math.abs((box.y1 + box.y2) / 2 - 300)).toBeLessThan(40);
  });
});
