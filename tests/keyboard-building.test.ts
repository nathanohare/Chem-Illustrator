// @vitest-environment jsdom
//
// Typing molecules from the keyboard in the real editor: the user guide's typed examples, the
// highlight after 1 on the atom under the mouse (ChemDraw's way), the highlight staying put while
// the mouse only passes over things, and Undo putting the highlight back.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { placeRing, freeRing } from '../src/chem/chemgeom';

type Hit = ReturnType<Editor['hotspot']>;

// no painting here (jsdom has no canvas): only what the keys do to the drawing and the highlight
window.requestAnimationFrame = () => 0;
// a canvas that measures text (a label's size, for what the mouse points at) and draws nothing
const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }) : noop),
  set: () => true,
});
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

let last: Editor | null = null;

function setup() {
  // each editor listens for keys on the window: the last test's one stops
  if (last) last.paused = true;
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
  overlay.dispatchEvent(new PointerEvent('pointerenter'));
  const L = doc.style.bondLength;
  /** Move the mouse to a drawing point. */
  const pointAt = (p: { x: number; y: number }) => {
    const s = r.toScreen(p);
    overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: s.x, clientY: s.y, bubbles: true }));
  };
  const atom = (id: number) => doc.atoms.get(id)!;
  /** Press keys as the guide writes them: arrows as ← → ↑ ↓, capitals with Shift. */
  const type = (keys: string) => {
    const ARROW: Record<string, string> = { '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown' };
    for (const ch of keys) {
      const key = ARROW[ch] ?? ch;
      const shiftKey = /^[A-Z]$/.test(key);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, shiftKey, bubbles: true, cancelable: true }));
    }
  };
  /** A level bond, left to right; returns its two atoms. */
  const levelBond = (x = 100, y = 100): [number, number] => {
    let ids: [number, number] = [0, 0];
    doc.edit('Draw', () => { const a = doc.addAtom(x, y), b = doc.addAtom(x + L, y); doc.addBond(a.id, b.id); ids = [a.id, b.id]; });
    ed.changed();
    return ids;
  };
  return { doc, ed, r, L, pointAt, atom, type, levelBond, overlay };
}

/** Element counts, such as { C: 13, B: 1, O: 2 } (labelled atoms by their label). */
function formula(doc: Doc): Record<string, number> {
  const SYM: Record<number, string> = { 5: 'B', 6: 'C', 7: 'N', 8: 'O' };
  const out: Record<string, number> = {};
  for (const a of doc.atoms.values()) {
    const s = a.label ?? SYM[a.z] ?? String(a.z);
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

const sym = (doc: Doc, id: number) => { const a = doc.atoms.get(id)!; return a.label ?? ({ 5: 'B', 6: 'C', 7: 'N', 8: 'O' } as Record<number, string>)[a.z]; };
const nbrs = (doc: Doc, id: number) => doc.neighbors(id).map((a) => a.id);
const ringCount = (doc: Doc) => doc.bonds.size - doc.atoms.size + 1;

let env: ReturnType<typeof setup>;
beforeEach(() => { env = setup(); });
afterEach(() => { vi.useRealTimers(); });

describe("the user guide's typed examples", () => {
  it('builds the pinacol boronate from a phenyl made with 3 on a level bond', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [, end] = levelBond();
    pointAt(atom(end));
    type('3');
    // the highlight is on the phenyl's far atom, and stays there while the mouse stays still
    expect(ed.hotspot()?.kind).toBe('atom');
    type('1B79←←←←o↓↓↓↓o→→9');
    // CH3–C6H4–B(pin): 4-tolyl pinacol boronate
    expect(formula(doc)).toEqual({ C: 13, B: 1, O: 2 });
    expect(ringCount(doc)).toBe(2);
    const b = [...doc.atoms.keys()].find((id) => sym(doc, id) === 'B')!;
    expect(nbrs(doc, b).map((id) => sym(doc, id)).sort()).toEqual(['C', 'O', 'O']);
    for (const o of nbrs(doc, b).filter((id) => sym(doc, id) === 'O')) {
      const c = nbrs(doc, o).find((id) => id !== b)!;
      // each ring O is on a CMe2
      expect(nbrs(doc, c).length).toBe(4);
    }
  });

  it('builds the NHS ester of acetic acid from the end of a bond drawn with one click', () => {
    const { doc, ed, r, type, overlay } = env;
    ed.setTool('bond-single');
    const s = r.toScreen({ x: 100, y: 100 });
    overlay.dispatchEvent(new PointerEvent('pointerdown', { clientX: s.x, clientY: s.y, button: 0, bubbles: true }));
    overlay.dispatchEvent(new PointerEvent('pointerup', { clientX: s.x, clientY: s.y, button: 0, bubbles: true }));
    expect(doc.atoms.size).toBe(2);
    expect(ed.hotspot()?.kind).toBe('atom');
    type('2o1n1←5←2↓↓→→2');
    expect(formula(doc)).toEqual({ C: 6, O: 4, N: 1 });
    expect(ringCount(doc)).toBe(1);
    const n = [...doc.atoms.keys()].find((id) => sym(doc, id) === 'N')!;
    // N bonded to the ester O and two ring C=O carbons
    const around = nbrs(doc, n);
    expect(around.map((id) => sym(doc, id)).sort()).toEqual(['C', 'C', 'O']);
    for (const c of around.filter((id) => sym(doc, id) === 'C')) {
      expect([...doc.adj.get(c)!].some((bid) => doc.bonds.get(bid)!.order === 2)).toBe(true);
    }
  });

  it('makes indene with a then z on a bond', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [a, b] = levelBond();
    const mid = { x: (atom(a).x + atom(b).x) / 2, y: (atom(a).y + atom(b).y) / 2 };
    pointAt(mid);
    expect(ed.hotspot()?.kind).toBe('bond');
    type('az');
    expect(formula(doc)).toEqual({ C: 9 });
    expect(ringCount(doc)).toBe(2);
  });
});

describe('1 on the atom under the mouse', () => {
  const ring = () => {
    const { doc, ed } = env;
    const ids = doc.edit('Ring', () => placeRing(doc, freeRing({ x: 100, y: 100 }, 6, env.L), { aromatic: true }));
    ed.changed();
    return ids;
  };

  it('keeps the highlight on that atom (ChemDraw), even after the mouse moves off it', () => {
    const { doc, ed, pointAt, atom, type } = env;
    ed.options.stickyHotspot = true;
    const [r0] = ring();
    pointAt(atom(r0));
    type('1');
    expect(doc.atoms.size).toBe(7);
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: r0 });
    pointAt({ x: 300, y: 300 });
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: r0 });
    // the highlight is no longer under the mouse, so 1 now moves it to the new atom
    type('1');
    const hot = ed.hotspot() as NonNullable<Hit>;
    expect(hot.kind).toBe('atom');
    expect(hot.id).not.toBe(r0);
    expect(nbrs(doc, hot.id)).toEqual([r0]);
  });

  it('adds three bonds when pressed three times with the mouse still there', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [, end] = levelBond();
    pointAt(atom(end));
    type('111');
    expect(nbrs(doc, end).length).toBe(4);
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: end });
  });

  it('follows the new atom with the Hotkeys window box turned off', () => {
    const { doc, ed, pointAt, atom, type } = env;
    ed.options.keepHotspotOnBond = false;
    const [r0] = ring();
    pointAt(atom(r0));
    type('1B');
    const b = [...doc.atoms.keys()].find((id) => sym(doc, id) === 'B')!;
    expect(nbrs(doc, b)).toEqual([r0]);
  });
});

describe('the keyboard highlight and the mouse', () => {
  /** Move the mouse by a few screen pixels. */
  const nudge = (p: { x: number; y: number }, px: number) => {
    const s = env.r.toScreen(p);
    env.overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: s.x + px, clientY: s.y, bubbles: true }));
  };

  it('follows the mouse once it moves after 1 on an atom', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [a, b] = levelBond();
    pointAt(atom(b));
    type('1');
    expect(doc.atoms.size).toBe(3);
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: b });
    // straight onto the other atom: no wait
    pointAt(atom(a));
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: a });
    // and into empty space: no highlight
    type('1');
    pointAt({ x: 300, y: 300 });
    expect(ed.hotspot()).toBeNull();
  });

  it('holds a highlight that moved to a new atom while the mouse stays still (a nudge of the hand too)', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [, b] = levelBond();
    pointAt(atom(b));
    type('8');
    const hot = ed.hotspot() as NonNullable<Hit>;
    expect(hot.kind).toBe('atom');
    expect(hot.id).not.toBe(b);
    nudge(atom(b), Editor.FOLLOW_PX - 1);
    expect(ed.hotspot()).toEqual(hot);
    // 8 then 1 still grows from the new atom
    type('1');
    expect(nbrs(doc, hot.id).length).toBe(2);
    // a real move: the highlight goes back to what is under the mouse
    nudge(atom(b), Editor.FOLLOW_PX * 3);
    pointAt(atom(b));
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: b });
  });

  it('follows the mouse after a ring fused onto a bond', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [a, b] = levelBond();
    pointAt({ x: (atom(a).x + atom(b).x) / 2, y: atom(a).y });
    type('6');
    expect(doc.atoms.size).toBe(6);
    pointAt(atom(a));
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: a });
  });

  it('looks again at what is under the mouse after a key deletes what it pointed at', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [a, b] = levelBond();
    pointAt({ x: (atom(a).x + atom(b).x) / 2, y: atom(a).y });
    expect(ed.hotspot()?.kind).toBe('bond');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true }));
    expect(doc.bonds.size).toBe(0);
    expect(ed.hotspot()).toBeNull();
  });

  it("in ChemDraw's way, stays while the mouse passes over a bond, and gives way once the mouse rests on one", () => {
    vi.useFakeTimers();
    const { ed, pointAt, atom, type, levelBond } = env;
    ed.options.stickyHotspot = true;
    const [a, b] = levelBond();
    pointAt({ x: 300, y: 300 });
    const [c, d] = levelBond(100, 160);
    // a keyboard highlight on a (an arrow key from the bond's end)
    pointAt(atom(b));
    type('←←');
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: a });
    // the mouse crosses the other bond on its way
    pointAt({ x: (atom(c).x + atom(d).x) / 2, y: atom(c).y });
    vi.advanceTimersByTime(Editor.TAKEOVER_MS / 3);
    pointAt({ x: 300, y: 300 });
    vi.advanceTimersByTime(Editor.TAKEOVER_MS * 2);
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: a });
    // resting on the bond: it takes over
    pointAt({ x: (atom(c).x + atom(d).x) / 2, y: atom(c).y });
    vi.advanceTimersByTime(Editor.TAKEOVER_MS + 10);
    expect(ed.hotspot()?.kind).toBe('bond');
  });
});

describe('the arrow keys', () => {
  it('step from an atom to a bond, then to the atom at its far end', () => {
    const { ed, pointAt, atom, type, levelBond } = env;
    const [a, b] = levelBond();
    pointAt(atom(b));
    type('←');
    expect(ed.hotspot()?.kind).toBe('bond');
    type('←');
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: a });
  });
});

describe('Undo while typing a molecule', () => {
  it('puts the highlight back on the atom, selecting nothing, so the next letter labels just that atom', () => {
    const { doc, ed, pointAt, atom, type } = env;
    const ids = doc.edit('Ring', () => placeRing(doc, freeRing({ x: 100, y: 100 }, 6, env.L), { aromatic: true }));
    ed.changed();
    pointAt(atom(ids[0]));
    type('B');
    expect(atom(ids[0]).label ?? atom(ids[0]).z).not.toBe(6);
    pointAt({ x: 300, y: 300 });
    ed.undo();
    expect(atom(ids[0]).z).toBe(6);
    expect(atom(ids[0]).label).toBeNull();
    expect(ed.sel.atoms.size).toBe(0);
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: ids[0] });
    type('O');
    const labelled = ids.filter((id) => sym(doc, id) !== 'C');
    expect(labelled).toEqual([ids[0]]);
    // Redo puts the B back and the highlight where the key left it
    ed.undo();
    ed.redo();
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: ids[0] });
  });

  it('goes back to the atom a grown bond came from', () => {
    const { doc, ed, pointAt, atom, type, levelBond } = env;
    const [, end] = levelBond();
    pointAt(atom(end));
    type('2');
    pointAt({ x: 300, y: 300 });
    ed.undo();
    expect(doc.atoms.size).toBe(2);
    expect(ed.hotspot()).toEqual({ kind: 'atom', id: end });
    expect(ed.sel.atoms.size).toBe(0);
  });

  it('still selects what changed after an undo of a drawing step', () => {
    const { doc, ed } = env;
    doc.edit('Ring', () => placeRing(doc, freeRing({ x: 100, y: 100 }, 6, env.L), {}));
    doc.edit('Move', () => { for (const a of doc.atoms.values()) doc.updateAtom(a.id, { x: a.x + 5 }); });
    ed.undo();
    expect(ed.sel.atoms.size).toBe(6);
  });
});
