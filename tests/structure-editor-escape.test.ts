// @vitest-environment jsdom
//
// Esc in the structure editor (a document's structure drawn in place, a spreadsheet cell's, the
// pop-out one): the drawing tools let go of what they hold first, the highlight left on the atom
// last drawn included; only then does Esc cancel, and it asks before throwing a drawing away.
// (Review 2026-11-03: one Esc after drawing a bond cancelled the whole edit, with no Undo.)

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { escapeAction } from '../src/ui/in-place';

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
  return { doc, ed, overlay };
}

const esc = (target: EventTarget) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

describe('Esc in the structure editor', () => {
  it('lets the drawing tools drop the highlight on the atom last drawn before anything else', () => {
    const { doc, ed, overlay } = setup();
    const b = doc.edit('Draw', () => { const a1 = doc.addAtom(0, 0), a2 = doc.addAtom(14.4, 0); doc.addBond(a1.id, a2.id); return a2.id; });
    expect(ed.escapeHasWork()).toBe(false);
    // drawing leaves the highlight on the atom last drawn (the next key grows from it)
    ed.setKeyHot({ kind: 'atom', id: b });
    expect(ed.escapeHasWork()).toBe(true);
    expect(escapeAction({ toolsBusy: ed.escapeHasWork(), changed: true })).toBe('tools');
    // the first Esc is the tools': it drops the highlight and leaves the drawing as it is
    esc(overlay);
    expect(ed.escapeHasWork()).toBe(false);
    expect(doc.atoms.size).toBe(2);
  });

  it('a selection, a path being drawn or a crop also come first', () => {
    const { doc, ed } = setup();
    const id = doc.edit('Draw', () => doc.addAtom(0, 0).id);
    ed.sel.atoms.add(id);
    expect(ed.escapeHasWork()).toBe(true);
    ed.sel.atoms.clear();
    ed.route = { from: { x: 0, y: 0 } as never, at: [{ x: 0, y: 0 }], dirs: [null] };
    expect(ed.escapeHasWork()).toBe(true);
    ed.route = null;
    ed.cropping = 1;
    expect(ed.escapeHasWork()).toBe(true);
    ed.cropping = null;
    expect(ed.escapeHasWork()).toBe(false);
  });

  it('a highlight left from another drawing (an atom no longer there) is nothing to let go of', () => {
    const { doc, ed } = setup();
    ed.setKeyHot({ kind: 'atom', id: 42 });
    expect(doc.atoms.has(42)).toBe(false);
    expect(ed.escapeHasWork()).toBe(false);
  });

  it('then cancels at once when nothing was drawn, and asks first when something was', () => {
    expect(escapeAction({ toolsBusy: false, changed: false })).toBe('cancel');
    expect(escapeAction({ toolsBusy: false, changed: true })).toBe('ask');
  });
});
