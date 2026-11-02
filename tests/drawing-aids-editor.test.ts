// @vitest-environment jsdom
//
// New arrows take their own line width and head size from Settings ▸ Drawing, and Alt held
// part-way through drawing a bond or arrow frees its angle from then on.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';

window.requestAnimationFrame = () => 0;

let last: Editor | null = null;
afterEach(() => { if (last) last.paused = true; });

function setup(tool: string) {
  document.body.innerHTML = '';
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const doc = new Doc();
  const r = new Renderer(scene, overlay);
  overlay.setPointerCapture = () => {};
  const ed = new Editor(doc, r, host);
  last = ed;
  ed.setTool(tool);
  /** Drag between drawing points; Alt is held from step `altFrom` of five on. */
  const drag = (from: { x: number; y: number }, to: { x: number; y: number }, altFrom = 99) => {
    const a = r.toScreen(from), b = r.toScreen(to);
    overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: a.x, clientY: a.y, bubbles: true }));
    overlay.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, buttons: 1, bubbles: true }));
    for (let i = 1; i <= 5; i++) {
      const x = a.x + (b.x - a.x) * i / 5, y = a.y + (b.y - a.y) * i / 5;
      overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, buttons: 1, bubbles: true, altKey: i >= altFrom }));
    }
    overlay.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, button: 0, bubbles: true, altKey: altFrom <= 5 }));
  };
  return { doc, ed, drag };
}

const deg = (a: { x: number; y: number }, b: { x: number; y: number }) => -Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;

describe('arrow sizes of their own', () => {
  it('gives new arrows the width and head size set, whatever the bonds\' width', () => {
    const { doc, ed, drag } = setup('arrow');
    ed.arrowLook = { width: 1.2, headLength: 9, headWidth: 3 };
    drag({ x: 100, y: 100 }, { x: 200, y: 100 });
    const r = [...doc.arrows.values()][0];
    expect(r.lineWidth).toBe(1.2);
    expect(r.headLength).toBe(9);
    expect(r.headWidth).toBe(3);
  });
  it('sizes the head from the arrow\'s own width when only that is set', () => {
    const { doc, ed, drag } = setup('arrow');
    ed.arrowLook = { width: 1, headLength: null, headWidth: null };
    drag({ x: 100, y: 100 }, { x: 200, y: 100 });
    const r = [...doc.arrows.values()][0];
    expect(r.headLength).toBeCloseTo(10);
    expect(r.headWidth).toBeCloseTo(2.5);
  });
  it('leaves arrows as they were with nothing set', () => {
    const { doc, drag } = setup('arrow');
    drag({ x: 100, y: 100 }, { x: 200, y: 100 });
    const r = [...doc.arrows.values()][0];
    expect(r.lineWidth).toBeUndefined();
    expect(r.headLength).toBeCloseTo(doc.style.lineWidth * 10);
  });
});

describe('Alt held part-way through a drag', () => {
  it('frees an arrow\'s angle from then on', () => {
    const { doc, drag } = setup('arrow');
    // 20° is not a 15° step
    const to = { x: 100 + 100 * Math.cos(20 * Math.PI / 180), y: 100 - 100 * Math.sin(20 * Math.PI / 180) };
    drag({ x: 100, y: 100 }, to, 3);
    const r = [...doc.arrows.values()][0];
    expect(deg(r.tail, r.head)).toBeCloseTo(20, 0);
  });
  it('snaps without it', () => {
    const { doc, drag } = setup('arrow');
    const to = { x: 100 + 100 * Math.cos(20 * Math.PI / 180), y: 100 - 100 * Math.sin(20 * Math.PI / 180) };
    drag({ x: 100, y: 100 }, to);
    const r = [...doc.arrows.values()][0];
    expect(deg(r.tail, r.head)).toBeCloseTo(15, 0);
  });
});
