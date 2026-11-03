// @vitest-environment jsdom
//
// Format > Order for every object (issue #406): structures, text, arrows and shapes share one
// drawing order, as in PowerPoint. Nothing changes until something is reordered; ring fills stay
// behind their structure; clicks pick the object in front; the order is saved in CDXML.

import { describe, it, expect } from 'vitest';
import { Doc, Arrow } from '../src/model';
import { restack, stackItems, usesStacking } from '../src/editor/stacking';
import type { Selection } from '../src/editor/arrange';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

window.requestAnimationFrame = () => 0;

function editorWith(doc: Doc): Editor {
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  return ed;
}

const sel = (s: Partial<Selection>): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set(), ...s });

function arrowAt(doc: Doc, x: number, y: number): Arrow {
  return doc.addArrow({
    tail: { x, y }, head: { x: x + 40, y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid',
    noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
  });
}

/** A filled box, a two-atom structure over it, an arrow and a text box. */
function scene() {
  const doc = new Doc();
  const ids = doc.edit('scene', () => {
    const box = doc.addShape({ kind: 'rect', x1: 0, y1: -20, x2: 60, y2: 20, filled: true } as never).id;
    const a = doc.addAtom(10, 0).id, b = doc.addAtom(24, 0).id;
    doc.addBond(a, b);
    const r = arrowAt(doc, 80, 0).id;
    const c = doc.addCaption({ x: 150, y: 0, runs: [{ text: 'Product' }], justify: 'left' }).id;
    return { box, a, b, r, c };
  });
  return { doc, ...ids };
}

const kinds = (doc: Doc) => stackItems(doc).map((it) => it.kind);

describe('one drawing order for every object (#406)', () => {
  it('keeps the usual layers until something is reordered', () => {
    const { doc } = scene();
    expect(usesStacking(doc)).toBe(false);
    expect(kinds(doc)).toEqual(['shape', 'structure', 'arrow', 'caption']);
  });

  it('brings a box in front of a structure, and sends text to the back', () => {
    const { doc, box, c } = scene();
    doc.edit('front', () => expect(restack(doc, sel({ shapes: new Set([box]) }), 'front')).toBe(true));
    expect(usesStacking(doc)).toBe(true);
    expect(kinds(doc)).toEqual(['structure', 'arrow', 'caption', 'shape']);
    doc.edit('back', () => restack(doc, sel({ captions: new Set([c]) }), 'back'));
    expect(kinds(doc)).toEqual(['caption', 'structure', 'arrow', 'shape']);
  });

  it('moves a whole structure one step, but not when only a bond is picked', () => {
    const { doc, a, b } = scene();
    doc.edit('fwd', () => restack(doc, sel({ atoms: new Set([a, b]) }), 'forward'));
    expect(kinds(doc)).toEqual(['shape', 'arrow', 'structure', 'caption']);
    expect(restack(doc, sel({ atoms: new Set([a]) }), 'back')).toBe(false);
    doc.edit('back', () => restack(doc, sel({ atoms: new Set([a, b]) }), 'backward'));
    expect(kinds(doc)).toEqual(['shape', 'structure', 'arrow', 'caption']);
  });

  it('a new structure lands in front of reordered things; a new shape at the back', () => {
    const { doc, box } = scene();
    doc.edit('front', () => restack(doc, sel({ shapes: new Set([box]) }), 'front'));
    doc.edit('more', () => { doc.addAtom(300, 0); doc.addShape({ kind: 'rect', x1: 300, y1: 0, x2: 320, y2: 20 } as never); });
    expect(kinds(doc)).toEqual(['shape', 'structure', 'arrow', 'caption', 'shape', 'structure']);
  });

  it('a ring fill stays just behind its structure', () => {
    const doc = new Doc();
    const ids = doc.edit('ring', () => {
      const r = Array.from({ length: 6 }, (_, i) => doc.addAtom(100 + 14 * Math.cos((i * Math.PI) / 3), 100 + 14 * Math.sin((i * Math.PI) / 3)).id);
      for (let i = 0; i < 6; i++) doc.addBond(r[i], r[(i + 1) % 6]);
      const fill = doc.addShape({ kind: 'ring', ring: r, x1: 86, y1: 86, x2: 114, y2: 114, filled: true } as never).id;
      const box = doc.addShape({ kind: 'rect', x1: 50, y1: 50, x2: 150, y2: 150, filled: true } as never).id;
      return { r, fill, box };
    });
    doc.edit('back', () => restack(doc, sel({ atoms: new Set(ids.r) }), 'back'));
    expect(stackItems(doc).map((it) => it.kind === 'shape' ? `s${it.ids[0]}` : it.kind)).toEqual([`s${ids.fill}`, 'structure', `s${ids.box}`]);
  });

  it('is saved as ChemDraw Z order and read back', () => {
    const { doc, box } = scene();
    doc.edit('front', () => restack(doc, sel({ shapes: new Set([box]) }), 'front'));
    const xml = writeCdxml(doc);
    expect(xml).toContain('Chem Illustrator order');
    const back = readCdxml(xml).doc;
    expect(usesStacking(back)).toBe(true);
    expect(kinds(back)).toEqual(['structure', 'arrow', 'caption', 'shape']);
    // saved again unchanged: the same file
    expect(writeCdxml(back)).toBe(xml);
  });

  it('puts what is on the page in that order too, as ChemDraw paints in file order and not by Z', () => {
    const { doc, a, b, box } = scene();
    // the structure to the front, the box to the back: the box first in the file
    doc.edit('front', () => restack(doc, sel({ atoms: new Set([a, b]) }), 'front'));
    doc.edit('back', () => restack(doc, sel({ shapes: new Set([box]) }), 'back'));
    let xml = writeCdxml(doc);
    expect(xml.indexOf('<graphic')).toBeLessThan(xml.indexOf('<fragment'));
    // ChemDraw layers each atom and bond by its own Z: all of them above the box's
    const boxZ = Number(xml.match(/<graphic [^>]*Z="(\d+)"/)![1]);
    const parts = [...xml.matchAll(/<(n|b) [^>]*>/g)].map((m) => Number(m[0].match(/ Z="(\d+)"/)?.[1] ?? NaN));
    expect(parts.length).toBe(3);
    for (const z of parts) expect(z).toBeGreaterThan(boxZ);
    // and the other way round, saved over the same file
    const again = readCdxml(xml).doc;
    const box2 = [...again.shapes.keys()][0], atoms2 = new Set(again.atoms.keys());
    again.edit('front', () => restack(again, sel({ shapes: new Set([box2]) }), 'front'));
    xml = writeCdxml(again);
    expect(xml.indexOf('<graphic')).toBeGreaterThan(xml.indexOf('<fragment'));
    again.edit('front', () => restack(again, sel({ atoms: atoms2 }), 'front'));
    xml = writeCdxml(again);
    expect(xml.lastIndexOf('<fragment')).toBeGreaterThan(xml.lastIndexOf('<graphic'));
  });

  it('a drawing never reordered saves no order', () => {
    const { doc } = scene();
    const xml = writeCdxml(doc);
    expect(xml).not.toContain('Chem Illustrator order');
    expect(usesStacking(readCdxml(xml).doc)).toBe(false);
  });

  it('a click picks the object in front', () => {
    // (no text: measuring it needs a real canvas)
    const { doc, box, a, c } = scene();
    doc.edit('x', () => doc.removeCaption(c));
    const ed = editorWith(doc);
    expect(ed.hitTest({ x: 10, y: 0 })).toEqual({ kind: 'atom', id: a });
    doc.edit('front', () => restack(doc, sel({ shapes: new Set([box]) }), 'front'));
    expect(ed.hitTest({ x: 10, y: 0 })).toEqual({ kind: 'shape', id: box });
    // where the box isn't, the structure is still picked
    doc.edit('back', () => restack(doc, sel({ shapes: new Set([box]) }), 'back'));
    expect(ed.hitTest({ x: 10, y: 0 })).toEqual({ kind: 'atom', id: a });
  });
});
