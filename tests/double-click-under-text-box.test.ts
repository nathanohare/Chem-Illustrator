// @vitest-environment jsdom
//
// Laptop bench (pp-hidden-equation): on a slide, double-clicking the left half of an equation
// edited the title instead of opening the equation, because the title placeholder's box covers
// it. A double-click goes to the topmost thing with something drawn under the pointer.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';

window.requestAnimationFrame = () => 0;
// canvases that draw nothing and measure every character 5 units wide per 10 pt
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
  const r = new Renderer(scene, overlay);
  const ed = new Editor(doc, r, host);
  last = ed;
  ed.setTool('select');
  return { doc, ed };
}

describe('double-click under a text box', () => {
  it('opens the shape under the pointer where none of the text box\'s text is', () => {
    const { doc, ed } = setup();
    let cap = 0, eq = 0;
    doc.edit('Slide', () => {
      // a short title, left aligned, in a wide placeholder box 100 pt tall
      cap = doc.addCaption({ x: 50, y: 80, runs: [{ text: 'Title', size: 24 }], justify: 'left', wrap: 600, ph: 'title', boxH: 100 }).id;
      eq = doc.addShape({ kind: 'geo', geo: 'rect', x1: 300, y1: 90, x2: 400, y2: 130, filled: true, color: '#000000' }).id;
    });
    // the equation is under the title's box, away from its text
    expect(ed.contentHit({ x: 320, y: 100 })).toEqual({ kind: 'shape', id: eq });
    // (and a single click picks it too)
    expect(ed.hitTest({ x: 320, y: 100 })).toEqual({ kind: 'shape', id: eq });
    // on the title's own words the title still wins
    expect(ed.contentHit({ x: 60, y: 75 })).toEqual({ kind: 'caption', id: cap });
    // in the box with nothing else there: still the title
    expect(ed.contentHit({ x: 500, y: 100 })).toEqual({ kind: 'caption', id: cap });
  });

  it('picks a picture put over an empty title placeholder (laptop bench pp-table-text-options)', () => {
    const { doc, ed } = setup();
    let cap = 0, pic = 0;
    doc.edit('Slide', () => {
      cap = doc.addCaption({ x: 50, y: 80, runs: [], justify: 'left', wrap: 600, ph: 'title', boxH: 100 }).id;
      pic = doc.addShape({ kind: 'geo', geo: 'rect', x1: 60, y1: 60, x2: 160, y2: 140, filled: true, color: '#000000' }).id;
    });
    expect(ed.hitTest({ x: 100, y: 100 })).toEqual({ kind: 'shape', id: pic });
    // elsewhere in the empty placeholder: the placeholder, to type into
    expect(ed.hitTest({ x: 400, y: 100 })).toEqual({ kind: 'caption', id: cap });
  });

  it('keeps a slide text box selected when typing in it stops, for the ribbon to change it', () => {
    const { doc, ed } = setup();
    doc.textStyles = { title: { size: 44 } };
    let cap = 0;
    doc.edit('Slide', () => { cap = doc.addCaption({ x: 50, y: 80, runs: [{ text: 'Title' }], justify: 'left', wrap: 600, ph: 'title', boxH: 100 }).id; });
    ed.typeInto(cap);
    expect(ed.textLook()).not.toBeNull();
    ed.closeCaption();
    expect([...ed.sel.captions]).toEqual([cap]);
    expect(ed.textLook()).not.toBeNull();
  });
});
