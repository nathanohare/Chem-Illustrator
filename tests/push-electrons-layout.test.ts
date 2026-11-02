// @vitest-environment jsdom
//
// Draw Next Intermediate (follow-ups from review): the product keeps the starting drawing's
// layout away from the reaction centre, and its reaction centre sits on the same level as the
// starting material's, with the reaction arrow between them on that line. (Settings ▸ Drawing can
// turn the command off; that is in main.ts.)

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { pushArrow, pushPins, type PushEnd } from '../src/chem/mechanism';
import { plainMeasure } from '../src/chem/reaction';
import { isCurved } from '../src/objects';
import { dist } from '../src/geom';

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

function push(doc: Doc, from: PushEnd, to: PushEnd): void {
  const p = pushArrow(doc, plainMeasure(doc), from, to)!;
  doc.edit('arrow', () => doc.addArrow({
    tail: p.tail, head: p.head, sweep: p.sweep, ...(p.bez ? { bez: p.bez } : {}), pin: pushPins(doc, p),
    headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5,
  }));
}

/** Methoxide and acetone (a carbonyl addition), with the arrows. */
function addition(doc: Doc) {
  const L = doc.style.bondLength;
  const ids = doc.edit('build', () => {
    const c = doc.addAtom(200, 100).id, o = doc.addAtom(200, 100 - L, 8).id;
    const m1 = doc.addAtom(200 + 0.87 * L, 100 + 0.5 * L).id, m2 = doc.addAtom(200 - 0.87 * L, 100 + 0.5 * L).id;
    doc.addBond(c, o, 2); doc.addBond(c, m1); doc.addBond(c, m2);
    const nu = doc.addAtom(200 - 2.2 * L, 100 - 0.2 * L, 8, { charge: -1 }).id;
    const me = doc.addAtom(200 - 3.07 * L, 100 + 0.3 * L).id;
    doc.addBond(nu, me);
    return { c, o, m1, m2, nu, me };
  });
  push(doc, { kind: 'atom', id: ids.nu }, { kind: 'atom', id: ids.c });
  push(doc, { kind: 'bond', id: doc.bondBetween(ids.c, ids.o)!.id }, { kind: 'atom', id: ids.o });
  return ids;
}

describe('the drawn intermediate', () => {
  it('keeps the starting structure\'s layout, and lines its reaction centre up with the starting one', () => {
    const { doc, ed } = setup();
    const ids = addition(doc);
    const before = new Map([...doc.atoms.values()].map((a) => [a.id, { x: a.x, y: a.y }]));
    const r = ed.drawFromArrows();
    expect(r).not.toBe('many');
    expect(r).not.toBe('none');
    expect((r as { drawn: boolean }).drawn).toBe(true);
    const made = [...doc.atoms.values()].filter((a) => !before.has(a.id));
    expect(made.length).toBe(6);
    // the copy of acetone is the same shape, moved along: each atom where it was, shifted the same
    const c = made.find((a) => a.z === 6 && doc.degree(a.id) === 4)!;
    const dx = c.x - before.get(ids.c)!.x, dy = c.y - before.get(ids.c)!.y;
    const copyOf = (id: number) => made.find((a) => dist(a, { x: before.get(id)!.x + dx, y: before.get(id)!.y + dy }) < 1e-6)!;
    for (const id of [ids.c, ids.o, ids.m1, ids.m2]) expect(copyOf(id), `atom ${id}`).toBeDefined();
    expect(Math.abs(dy)).toBeLessThan(1e-6);
    // the new C–O bond to the methoxide: a bond long, out in the open
    const nu = made.find((a) => a.z === 8 && a.id !== copyOf(ids.o).id)!;
    expect(dist(c, nu)).toBeCloseTo(doc.style.bondLength, 3);
    // the reaction arrow on the level of the reaction centre (the carbonyl C and O)
    const arrow = [...doc.arrows.values()].find((x) => !isCurved(x))!;
    const level = (before.get(ids.c)!.y + before.get(ids.o)!.y) / 2;
    expect(arrow.tail.y).toBeCloseTo(level, 6);
    expect(arrow.head.y).toBeCloseTo(level, 6);
    expect((c.y + copyOf(ids.o).y) / 2).toBeCloseTo(level, 6);
    expect(arrow.tail.x).toBeGreaterThan(Math.max(...[...before.values()].map((p) => p.x)));
    expect(c.x).toBeGreaterThan(arrow.head.x);
  });

});
