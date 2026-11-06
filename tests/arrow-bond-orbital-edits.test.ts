// @vitest-environment jsdom
//
// Fixes from Nate's Nov 6 list: a radical dot drawn by Draw Next Intermediate lands clear of a
// label that moved (the Cl of a homolysis), a curved arrow's end dragged onto an atom keeps the
// curve it had (not an S), the ring tool's preview shows the double bonds it will draw, dragging
// the end of a bond keeps its length (Alt: any length; Shift: straight across or down), and an
// orbital's lobes stay on their atom when the bond that frames them is stretched.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc, type Atom } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { plainMeasure } from '../src/chem/reaction';
import { cleanUpArrow, isSBez, pushArrow, pushPins, type PushEnd } from '../src/chem/mechanism';
import { productDrawing, pushArrowsOf, readPushes } from '../src/chem/push-electrons';
import { followPins, makePin } from '../src/chem/pins';
import { freeRing, placeRing, ringAtomsAt, ringDoubles } from '../src/chem/chemgeom';
import { modifierHints, type HintState } from '../src/editor/cursor-aids';
import { arrowHandles } from '../src/objects';
import { dist } from '../src/geom';

window.requestAnimationFrame = () => 0;
const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (t: string) => ({ width: t.length * 50, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 })
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
  overlay.setPointerCapture = () => {};
  const ed = new Editor(doc, r, host);
  last = ed;
  ed.setTool('select');
  const mods = (k: { shiftKey?: boolean; altKey?: boolean }) => ({ shiftKey: !!k.shiftKey, altKey: !!k.altKey });
  /** Drag from one drawing point to another, with Shift or Alt held. */
  const drag = (from: { x: number; y: number }, to: { x: number; y: number }, keys: { shiftKey?: boolean; altKey?: boolean } = {}) => {
    const a = r.toScreen(from), b = r.toScreen(to);
    overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: a.x, clientY: a.y, bubbles: true }));
    overlay.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, buttons: 1, bubbles: true, ...mods(keys) }));
    for (let i = 1; i <= 5; i++) {
      const x = a.x + (b.x - a.x) * i / 5, y = a.y + (b.y - a.y) * i / 5;
      overlay.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, buttons: 1, bubbles: true, ...mods(keys) }));
    }
    overlay.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, button: 0, bubbles: true, ...mods(keys) }));
  };
  return { doc, ed, drag };
}

const L = new Doc().style.bondLength;

describe('radical dots drawn by Draw Next Intermediate', () => {
  it('sit clear of a label that moved off, and stay with their atom', () => {
    // 2-chloropropane, its C–Cl bond broken evenly by two fishhooks
    const doc = new Doc();
    const { c, cl } = doc.edit('build', () => {
      const c = doc.addAtom(100, 100).id;
      const m1 = doc.addAtom(100 - 0.87 * L, 100 - L / 2).id, m2 = doc.addAtom(100, 100 + L).id;
      const cl = doc.addAtom(100 + 0.87 * L, 100 - L / 2, 17).id;
      doc.addBond(c, m1, 1); doc.addBond(c, m2, 1); doc.addBond(c, cl, 1);
      return { c, cl };
    });
    const plain = plainMeasure(doc);
    const bond: PushEnd = { kind: 'bond', id: doc.bondBetween(c, cl)!.id };
    for (const to of [c, cl]) {
      const p = pushArrow(doc, plain, bond, { kind: 'atom', id: to })!;
      doc.edit('arrow', () => doc.addArrow({ tail: p.tail, head: p.head, sweep: p.sweep, pin: pushPins(doc, p), headStyle: 'halfLeft', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5 }));
    }
    // the app's measure remembers each label by atom (where it was drawn), as the renderer does
    const m = { ...plain, atomBoxes: (a: Atom) => plain.atomBoxes(doc.atoms.get(a.id) ?? a) };
    const reading = readPushes(doc, m, pushArrowsOf(doc, doc.arrows.keys()));
    const out = productDrawing(doc, m, reading)!;
    expect(out.atoms.get(cl)!.radical).toBe('doublet');
    const clNow = out.atoms.get(cl)!;
    // the Cl came away from the carbon
    expect(dist(clNow, doc.atoms.get(cl)!)).toBeGreaterThan(0.3 * L);
    const dots = [...out.shapes.values()].filter((s) => s.symbol === 'Electron');
    expect(dots.length).toBe(2);
    const near = (s: { x1: number; y1: number }) => dist({ x: s.x1, y: s.y1 }, clNow);
    const onCl = dots.sort((p, q) => near(p) - near(q))[0];
    const at = { x: onCl.x1, y: onCl.y1 };
    const boxes = plainMeasure(out).atomBoxes(clNow);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.some((b) => at.x >= b.x1 && at.x <= b.x2 && at.y >= b.y1 && at.y <= b.y2)).toBe(false);
    // stuck to their atoms, so they can be picked and go with them
    expect(dots.every((s) => s.pin?.on === 'atom')).toBe(true);
    expect(onCl.pin!.ref[0]).toBe(cl);
  });
});

describe('dragging a curved arrow’s end', () => {
  /** Propen-2-ol beside acetone, with a single-curve (Bézier) arrow drawn from one to the other. */
  function scene() {
    const doc = new Doc();
    const ids = doc.edit('build', () => {
      const o = doc.addAtom(100, 80, 8).id, c1 = doc.addAtom(100, 100).id, ch2 = doc.addAtom(117, 110).id, me = doc.addAtom(83, 110).id;
      doc.addBond(o, c1, 1); doc.addBond(c1, ch2, 2); doc.addBond(c1, me, 1);
      const k = doc.addAtom(250, 100).id, ko = doc.addAtom(250, 80, 8).id, k1 = doc.addAtom(233, 110).id, k2 = doc.addAtom(267, 110).id;
      doc.addBond(k, ko, 2); doc.addBond(k, k1, 1); doc.addBond(k, k2, 1);
      return { c1, ch2, k, k1 };
    });
    return { doc, ...ids };
  }

  it('tells an S from a single curve or a longer path', () => {
    expect(isSBez([{ x: 0.25, y: 0.8 }, { x: 0.75, y: -0.8 }])).toBe(true);
    expect(isSBez([{ x: 0.25, y: 0.6 }, { x: 0.75, y: 0.5 }])).toBe(false);
    expect(isSBez([{ x: 0.2, y: 0.5 }, { x: 0.4, y: 0.6 }, { x: 0.5, y: 0.7 }, { x: 0.6, y: 0.4 }, { x: 0.8, y: 0.3 }])).toBe(false);
    expect(isSBez(undefined)).toBe(false);
  });

  it('keeps a single curve a single curve when its head is dropped on an atom', () => {
    const { doc, c1, ch2, k1 } = scene();
    const m = plainMeasure(doc);
    const keep = [{ x: 0.2, y: 0.5 }, { x: 0.75, y: 0.45 }];
    const p = pushArrow(doc, m, { kind: 'bond', id: doc.bondBetween(c1, ch2)!.id }, { kind: 'atom', id: k1 }, { side: 1, keep })!;
    expect(p.bez).toBeTruthy();
    expect(isSBez(p.bez)).toBe(false);
    // both bends to the same side, about as far out as before
    expect(p.bez!.every((q) => q.y > 0.2)).toBe(true);
  });

  it('keeps its curve when its head is dragged onto another atom in the editor', () => {
    const { doc, drag, ed } = setup();
    const s = scene();
    // rebuild the scene in the editor's drawing
    const ids = doc.edit('build', () => {
      const map = new Map<number, number>();
      for (const a of s.doc.atoms.values()) map.set(a.id, doc.addAtom(a.x, a.y, a.z).id);
      for (const b of s.doc.bonds.values()) doc.addBond(map.get(b.a1)!, map.get(b.a2)!, b.order);
      return { c1: map.get(s.c1)!, ch2: map.get(s.ch2)!, k: map.get(s.k)!, k1: map.get(s.k1)! };
    });
    const m = plainMeasure(doc);
    const p = pushArrow(doc, m, { kind: 'bond', id: doc.bondBetween(ids.c1, ids.ch2)!.id }, { kind: 'atom', id: ids.k }, { side: -1, keep: [{ x: 0.2, y: -0.5 }, { x: 0.75, y: -0.45 }] })!;
    const id = doc.edit('arrow', () => doc.addArrow({ tail: p.tail, head: p.head, sweep: 0, bez: p.bez, pin: pushPins(doc, p), headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5 }).id);
    expect(isSBez(doc.arrows.get(id)!.bez)).toBe(false);
    ed.sel = { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set([id]), shapes: new Set() };
    const head = arrowHandles(doc.arrows.get(id)!).find((h) => h.which === 'head')!;
    drag(head.at, doc.atoms.get(ids.k1)!);
    const r = doc.arrows.get(id)!;
    expect(r.bez?.length).toBe(2);
    expect(isSBez(r.bez)).toBe(false);
    // and it now points at the atom it was dropped on
    expect(dist(r.head, doc.atoms.get(ids.k1)!)).toBeLessThan(0.5 * L);
  });

  it('cleans up a single curve without making it an S', () => {
    const { doc, c1, ch2, k1 } = scene();
    const m = plainMeasure(doc);
    const p = pushArrow(doc, m, { kind: 'bond', id: doc.bondBetween(c1, ch2)!.id }, { kind: 'atom', id: k1 }, { side: -1, keep: [{ x: 0.2, y: -0.5 }, { x: 0.75, y: -0.45 }] })!;
    const r = cleanUpArrow(doc, m, { tail: p.tail, head: p.head, sweep: 0, bez: p.bez });
    expect(r).toBeTruthy();
    expect(isSBez(r!.bez)).toBe(false);
  });
});

describe('the ring tool’s preview', () => {
  it('knows where the double bonds of an aromatic ring go, and Shift moves them round', () => {
    const doc = new Doc();
    const pts = freeRing({ x: 100, y: 100 }, 6, L);
    const ids = ringAtomsAt(doc, pts);
    expect(ids.every((x) => x === undefined)).toBe(true);
    const a = ringDoubles(doc, ids, { aromatic: true }), b = ringDoubles(doc, ids, { aromatic: true, shiftPhase: true });
    expect(a.filter(Boolean).length).toBe(3);
    expect(b.filter(Boolean).length).toBe(3);
    expect(a.map((x, i) => x !== b[i]).every(Boolean)).toBe(true);
    expect(ringDoubles(doc, ids, { aromatic: false }).some(Boolean)).toBe(false);
    // the same as the ring drawn
    const made = doc.edit('ring', () => placeRing(doc, pts, { aromatic: true, shiftPhase: true }));
    const drawn = made.map((id, i) => doc.bondBetween(id, made[(i + 1) % 6])!.order === 2);
    expect(drawn).toEqual(b);
  });

  it('finds the atoms a ring fused on would share', () => {
    const doc = new Doc();
    const pts = freeRing({ x: 100, y: 100 }, 6, L);
    const made = doc.edit('ring', () => placeRing(doc, pts, { aromatic: true }));
    const ids = ringAtomsAt(doc, pts);
    expect(ids).toEqual(made);
    // an atom already carrying a double bond gets none from the new ring's preview there
    const d = ringDoubles(doc, ids, { aromatic: true });
    expect(d.filter(Boolean).length).toBe(3);
  });
});

describe('dragging the end of a bond', () => {
  function bond(doc: Doc) {
    return doc.edit('bond', () => {
      const a = doc.addAtom(100, 100).id, b = doc.addAtom(100 + L, 100).id;
      doc.addBond(a, b, 1);
      return { a, b };
    });
  }

  it('keeps the bond’s length, swinging round the other end', () => {
    const { doc, drag } = setup();
    const { a, b } = bond(doc);
    drag(doc.atoms.get(b)!, { x: 100 + 2 * L, y: 100 + 2 * L });
    expect(dist(doc.atoms.get(a)!, doc.atoms.get(b)!)).toBeCloseTo(L, 3);
    // pointing where the pointer went
    const bb = doc.atoms.get(b)!;
    expect(Math.abs(Math.atan2(bb.y - 100, bb.x - 100) - Math.PI / 4)).toBeLessThan(0.02);
  });

  it('goes anywhere with Alt', () => {
    const { doc, drag } = setup();
    const { a, b } = bond(doc);
    drag(doc.atoms.get(b)!, { x: 100 + 2 * L, y: 100 + 2 * L }, { altKey: true });
    expect(dist(doc.atoms.get(a)!, doc.atoms.get(b)!)).toBeGreaterThan(2 * L);
  });

  it('goes straight across or down with Shift', () => {
    const { doc, drag } = setup();
    const { b } = bond(doc);
    drag(doc.atoms.get(b)!, { x: 100 + 2.5 * L, y: 102 }, { shiftKey: true });
    const bb = doc.atoms.get(b)!;
    expect(bb.y).toBeCloseTo(100, 3);
    expect(bb.x).toBeGreaterThan(100 + 2 * L);
  });

  it('moves an atom with more than one bond as before', () => {
    const { doc, drag } = setup();
    const ids = doc.edit('chain', () => {
      const a = doc.addAtom(100, 100).id, b = doc.addAtom(100 + L, 100).id, c = doc.addAtom(100 + 2 * L, 100).id;
      doc.addBond(a, b, 1); doc.addBond(b, c, 1);
      return { a, b, c };
    });
    drag(doc.atoms.get(ids.b)!, { x: 100 + L, y: 100 + 2 * L });
    expect(doc.atoms.get(ids.b)!.y).toBeGreaterThan(100 + 1.5 * L);
  });

  it('says what Alt does while dragging one', () => {
    const base: HintState = { tool: 'select', drag: 'move', fixedAngles: true, fixedLength: true, snapping: false, asksChain: false };
    const none = { shift: false, alt: false, ctrl: false };
    expect(modifierHints({ ...base, bondEnd: true }, none).map((h) => `${h.key}: ${h.text}`)).toEqual(['Shift: straight across or down', 'Alt: any length']);
    expect(modifierHints({ ...base, bondEnd: true, snapping: true }, none).map((h) => h.text)).toContain('any length, no snapping');
    expect(modifierHints(base, none).map((h) => h.key)).toEqual(['Shift']);
  });
});

describe('orbital lobes and lone pairs on a stretched bond', () => {
  it('stay the same distance from their atom', () => {
    const doc = new Doc();
    const { a, b, lobe } = doc.edit('build', () => {
      const a = doc.addAtom(100, 100).id, b = doc.addAtom(100 + L, 100).id;
      doc.addBond(a, b, 1);
      // a lobe above atom a, pinned to it
      const lobe = doc.addShape({ kind: 'oval', x1: 96, y1: 82, x2: 104, y2: 98 });
      doc.updateShape(lobe.id, { pin: makePin(doc, 'atom', [a], { x: 100, y: 90 }) ?? undefined });
      return { a, b, lobe: lobe.id };
    });
    const centre = () => { const s = doc.shapes.get(lobe)!; return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }; };
    expect(dist(centre(), doc.atoms.get(a)!)).toBeCloseTo(10, 3);
    // the other end of the bond pulled out to three bond lengths
    doc.edit('stretch', () => doc.updateAtom(b, { x: 100 + 3 * L }));
    followPins(doc);
    expect(dist(centre(), doc.atoms.get(a)!)).toBeCloseTo(10, 3);
    // and swung round: the lobe turns with the bond, still 10 from the atom
    doc.edit('swing', () => doc.updateAtom(b, { x: 100, y: 100 + 2 * L }));
    followPins(doc);
    const c = centre();
    expect(dist(c, doc.atoms.get(a)!)).toBeCloseTo(10, 3);
    expect(c.x).toBeGreaterThan(105);
  });
});
