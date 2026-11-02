// @vitest-environment jsdom
//
// Bring to Front, Send to Back, Bring Forward and Send Backward work on selected bonds as well as
// shapes: where bonds cross, the one behind gets the gap. And a selected bond has no dashed box
// drawn inside its blue highlight.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { crossingGaps } from '../src/chem/crossing';

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

let last: Editor | null = null;
afterEach(() => { if (last) last.paused = true; });

function setup() {
  document.body.innerHTML = '';
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const doc = new Doc();
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  last = ed;
  ed.setTool('select');
  return { doc, ed };
}

/** A ring bond drawn across, then an axial bond drawn down through it (in front, as drawn last). */
function axial(doc: Doc) {
  return doc.edit('Draw', () => {
    const a = doc.addAtom(0, 40), b = doc.addAtom(60, 50), top = doc.addAtom(30, 0), bottom = doc.addAtom(30, 80);
    const ring = doc.addBond(a.id, b.id, 1);
    const ax = doc.addBond(top.id, bottom.id, 1);
    return { ring: ring.id, ax: ax.id, top: top.id, bottom: bottom.id };
  });
}

const gapped = (doc: Doc, id: number) => crossingGaps(doc, doc.bonds.get(id)!, 2).length > 0;
const pick = (ed: Editor, bonds: number[], atoms: number[] = []) => { ed.sel = { atoms: new Set(atoms), bonds: new Set(bonds), captions: new Set(), arrows: new Set(), shapes: new Set() }; };

describe('bond order', () => {
  it('sends a selected bond behind the bond it covers, and brings it back', () => {
    const { doc, ed } = setup();
    const { ring, ax, top, bottom } = axial(doc);
    expect(gapped(doc, ring)).toBe(true);
    expect(gapped(doc, ax)).toBe(false);
    pick(ed, [ax], [top, bottom]);
    expect(ed.setBondLayer('back')).toBe(true);
    expect(gapped(doc, ax)).toBe(true);
    expect(gapped(doc, ring)).toBe(false);
    expect(ed.setBondLayer('front')).toBe(true);
    expect(gapped(doc, ax)).toBe(false);
    expect(gapped(doc, ring)).toBe(true);
    // one undo step each
    doc.undo();
    expect(gapped(doc, ax)).toBe(true);
  });

  it('steps a bond one bond forward or back at a time', () => {
    const { doc, ed } = setup();
    // three bonds crossing at different places: the axial one in front of both ring bonds
    const ids = doc.edit('Draw', () => {
      const p = doc.addAtom(0, 20), q = doc.addAtom(60, 20), r = doc.addAtom(0, 60), s = doc.addAtom(60, 60);
      const t = doc.addAtom(30, 0), u = doc.addAtom(30, 80);
      return { upper: doc.addBond(p.id, q.id, 1).id, lower: doc.addBond(r.id, s.id, 1).id, ax: doc.addBond(t.id, u.id, 1).id };
    });
    doc.edit('Layer', () => doc.updateBond(ids.lower, { z: 1000 }));
    // now: upper < ax < lower
    pick(ed, [ids.ax]);
    expect(gapped(doc, ids.ax)).toBe(true);
    expect(ed.setBondLayer('backward')).toBe(true);
    // behind the upper one too now
    expect(gapped(doc, ids.upper)).toBe(false);
    expect(gapped(doc, ids.lower)).toBe(false);
    expect(ed.setBondLayer('forward')).toBe(true);
    expect(gapped(doc, ids.upper)).toBe(true);
    expect(gapped(doc, ids.lower)).toBe(false);
    expect(ed.setBondLayer('forward')).toBe(true);
    expect(gapped(doc, ids.lower)).toBe(true);
    expect(gapped(doc, ids.ax)).toBe(false);
  });

  it('says when a bond crosses nothing, and does nothing with no bond selected', () => {
    const { doc, ed } = setup();
    const id = doc.edit('Draw', () => doc.addBond(doc.addAtom(0, 0).id, doc.addAtom(30, 0).id, 1).id);
    pick(ed, [id]);
    expect(ed.setBondLayer('back')).toBe('none');
    pick(ed, []);
    expect(ed.setBondLayer('back')).toBe(false);
  });

  it('draws no dashed box inside a selected bond\'s highlight', () => {
    const { doc, ed } = setup();
    const { ax, top, bottom, ring } = axial(doc);
    const inside = (b: { x1: number; y1: number; x2: number; y2: number }) => (ed as unknown as { boxInsideHighlight(b: unknown): boolean }).boxInsideHighlight(b);
    pick(ed, [ax], [top, bottom]);
    expect(inside({ x1: 30, y1: 0, x2: 30, y2: 80 })).toBe(true);
    // a whole structure keeps its box
    const r = doc.bonds.get(ring)!;
    pick(ed, [ax, ring], [top, bottom, r.a1, r.a2]);
    expect(inside({ x1: 0, y1: 0, x2: 60, y2: 80 })).toBe(false);
  });
});
