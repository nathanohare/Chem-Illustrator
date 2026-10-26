// @vitest-environment jsdom
//
// Dragging an atom onto another atom makes them one (issue #214): a chain's end dropped on its
// start closes a ring, an atom dropped on another structure joins the two, and Alt or a drop
// away from any atom just moves it.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';

window.requestAnimationFrame = () => 0;

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
  overlay.setPointerCapture = () => {};
  const ed = new Editor(doc, r, host);
  last = ed;
  ed.setTool('select');
  /** Drag from one drawing point to another (Alt held, if asked). */
  const drag = (from: { x: number; y: number }, to: { x: number; y: number }, altKey = false) => {
    const a = r.toScreen(from), b = r.toScreen(to);
    overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: a.x, clientY: a.y, bubbles: true }));
    overlay.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, buttons: 1, bubbles: true, altKey }));
    for (let i = 1; i <= 5; i++) {
      const x = a.x + (b.x - a.x) * i / 5, y = a.y + (b.y - a.y) * i / 5;
      overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, buttons: 1, bubbles: true, altKey }));
    }
    overlay.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, button: 0, bubbles: true, altKey }));
  };
  return { doc, ed, drag };
}

/** A zigzag chain of n atoms. */
function chain(doc: Doc, n: number, x0 = 100, y0 = 100) {
  const L = doc.style.bondLength;
  const ids: number[] = [];
  doc.edit('Chain', () => {
    for (let i = 0; i < n; i++) ids.push(doc.addAtom(x0 + i * L * 0.87, y0 + (i % 2 ? L / 2 : 0)).id);
    for (let i = 1; i < n; i++) doc.addBond(ids[i - 1], ids[i], 1);
  });
  return ids;
}

describe('dragging an atom onto another', () => {
  it('closes a ring when a chain end is dropped on its other end', () => {
    const { doc, drag } = setup();
    const ids = chain(doc, 7);
    const start = doc.atoms.get(ids[0])!, end = doc.atoms.get(ids[6])!;
    // dropped a little off the atom: near enough is enough
    drag(end, { x: start.x + 2, y: start.y - 2 });
    expect(doc.atoms.size).toBe(6);
    expect(doc.bonds.size).toBe(6);
    expect(doc.atoms.has(ids[0])).toBe(true);
    expect(doc.bondBetween(ids[0], ids[5])).toBeTruthy();
    // one step to undo
    doc.undo();
    expect(doc.atoms.size).toBe(7);
    expect(doc.bonds.size).toBe(6);
  });

  it('joins two structures', () => {
    const { doc, drag } = setup();
    const a = chain(doc, 3), b = chain(doc, 3, 100, 300);
    drag(doc.atoms.get(b[0])!, doc.atoms.get(a[2])!);
    expect(doc.atoms.size).toBe(5);
    expect(doc.fragmentOf(a[0]).size).toBe(5);
  });

  it('only moves the atom with Alt held, or when dropped away from any atom', () => {
    const { doc, drag } = setup();
    const ids = chain(doc, 7);
    const start = doc.atoms.get(ids[0])!;
    drag(doc.atoms.get(ids[6])!, start, true);
    expect(doc.atoms.size).toBe(7);
    drag(doc.atoms.get(ids[6])!, { x: 400, y: 400 });
    expect(doc.atoms.size).toBe(7);
  });

  it('does not fold a bond up when an atom is dropped on its own neighbour', () => {
    const { doc, drag } = setup();
    const ids = chain(doc, 3);
    drag(doc.atoms.get(ids[2])!, doc.atoms.get(ids[1])!);
    expect(doc.atoms.size).toBe(3);
    expect(doc.bonds.size).toBe(2);
  });
});
