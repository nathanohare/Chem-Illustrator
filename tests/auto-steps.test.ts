// @vitest-environment jsdom
//
// Auto-Animate Steps (review item 48): a scheme on a slide built up a step at a time. Its pieces
// (first species; each arrow with its conditions; each product) move apart in the show and in
// PowerPoint, each click brings the next step, and on a canvas slide the view follows.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { chemRuns } from '../src/text/chemtext';
import type { Selection } from '../src/editor/arrange';
import { slideParts } from '../src/deck/animation';
import { splitSlide } from '../src/deck/split-slide';
import { AUTO_STEPS_DEFAULTS, markPieces, stepAnims, stepPieces } from '../src/deck/auto-steps';
import { buildOffer } from '../src/ui/build-hint';

const all = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

/** Benzene → (conditions) → text species → text species, close together as a scheme is. */
function scheme() {
  const doc = new Doc();
  const m = plainMeasure(doc);
  doc.edit('make', () => {
    const ring: number[] = [];
    for (let i = 0; i < 6; i++) ring.push(doc.addAtom(14 * Math.cos((i * Math.PI) / 3), 14 * Math.sin((i * Math.PI) / 3)).id);
    for (let i = 0; i < 6; i++) doc.addBond(ring[i], ring[(i + 1) % 6], i % 2 ? 2 : 1);
    const b = doc.addCaption({ x: 120, y: 4, runs: [{ text: 'PhBr' }], justify: 'center' });
    const c = doc.addCaption({ x: 240, y: 4, runs: [{ text: 'PhMgBr' }], justify: 'center' });
    const cond1 = doc.addCaption({ x: 62, y: -10, runs: chemRuns('Br2, FeBr3'), justify: 'center' });
    const cond2 = doc.addCaption({ x: 180, y: -10, runs: chemRuns('Mg, THF'), justify: 'center' });
    const arrow = (x: number, from: string, to: string, above: string) => doc.addArrow({
      headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
      tail: { x, y: 0 }, head: { x: x + 50, y: 0 }, step: { reactants: [from], products: [to], above: [above], below: [], manual: true },
    });
    arrow(35, 'a' + ring[0], 'c' + b.id, 'c' + cond1.id);
    arrow(155, 'c' + b.id, 'c' + c.id, 'c' + cond2.id);
  });
  return { doc, m };
}

describe('Auto-Animate Steps', () => {
  it('finds the first species, then each arrow with its conditions and the species it makes', () => {
    const { doc, m } = scheme();
    const pieces = stepPieces(doc, m, all())!;
    expect(pieces.map((p) => `${p.kind}${p.step}`)).toEqual(['first0', 'arrow1', 'product1', 'arrow2', 'product2']);
    expect(pieces[0].sel.atoms.size).toBe(6);
    expect(pieces[0].sel.bonds.size).toBe(6);
    expect(pieces[1].sel.arrows.size).toBe(1);
    expect(pieces[1].sel.captions.size).toBe(1);
    expect(pieces[1].from).toBe('left');
  });

  it('keeps each piece apart in the show and in PowerPoint', () => {
    const { doc, m } = scheme();
    const pieces = stepPieces(doc, m, all())!;
    doc.edit('mark', () => markPieces(doc, pieces));
    const split = splitSlide(doc);
    // the structure, and the two arrows with their conditions (the text species are text)
    expect(split.drawings.length).toBe(3);
    expect(split.drawings.every((d) => d.arrows.size <= 1)).toBe(true);
  });

  it('brings each step on a click: its arrow wipes in the way it points, then its product', () => {
    const { doc, m } = scheme();
    const pieces = stepPieces(doc, m, all())!;
    doc.edit('mark', () => markPieces(doc, pieces));
    const { anims } = stepAnims(doc, pieces, AUTO_STEPS_DEFAULTS, []);
    expect(anims.map((a) => a.start)).toEqual(['click', 'after', 'click', 'after']);
    expect(anims.every((a) => a.effect === 'wipe' && a.from === 'left')).toBe(true);
    // every animation names a part of its own
    const parts = slideParts(doc);
    expect(new Set(anims.map((a) => JSON.stringify(a.target))).size).toBe(4);
    expect(parts.length).toBeGreaterThanOrEqual(5);
  });

  it('can bring the first species on a click too, and products with their arrows', () => {
    const { doc, m } = scheme();
    const pieces = stepPieces(doc, m, all())!;
    doc.edit('mark', () => markPieces(doc, pieces));
    const { anims } = stepAnims(doc, pieces, { ...AUTO_STEPS_DEFAULTS, effect: 'fade', first: true, product: 'with' }, []);
    expect(anims.map((a) => a.start)).toEqual(['click', 'click', 'with', 'click', 'with']);
  });

  it('replaces its own earlier animations when run again, keeping others', () => {
    const { doc, m } = scheme();
    const pieces = stepPieces(doc, m, all())!;
    doc.edit('mark', () => markPieces(doc, pieces));
    const other = { target: { kind: 'caption' as const, id: 999 }, effect: 'fade' as const, start: 'click' as const, dur: 0.5, delay: 0 };
    const once = stepAnims(doc, pieces, AUTO_STEPS_DEFAULTS, [other]).anims;
    const again = stepAnims(doc, pieces, AUTO_STEPS_DEFAULTS, once).anims;
    expect(again.length).toBe(once.length);
    expect(again[0]).toEqual(other);
  });

  it('on a canvas slide, follows the steps with a keyframe each and moves the view before each step after the first', () => {
    const { doc, m } = scheme();
    const pieces = stepPieces(doc, m, all())!;
    doc.edit('mark', () => markPieces(doc, pieces));
    const size = { w: 720, h: 405 };
    const { anims, canvas } = stepAnims(doc, pieces, AUTO_STEPS_DEFAULTS, [], { data: { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }] }, size });
    expect(canvas!.keys.length).toBe(2);
    expect(new Set(canvas!.keys.map((k) => k.id)).size).toBe(2);
    expect(anims.map((a) => (a.effect === 'camera' ? 'camera' : a.start))).toEqual(['click', 'after', 'camera', 'after', 'after']);
    expect(anims.find((a) => a.effect === 'camera')!.target.id).toBe(canvas!.keys[1].id);
  });

  it('finds nothing to build without a step', () => {
    const doc = new Doc();
    doc.edit('a', () => doc.addCaption({ x: 0, y: 0, runs: [{ text: 'alone' }], justify: 'left' }));
    expect(stepPieces(doc, plainMeasure(doc), all())).toBeNull();
  });

  it('is offered for a selected scheme of two steps or more that is not animated yet', () => {
    const { doc, m } = scheme();
    const arrows = [...doc.arrows.keys()];
    const sel = (ids: number[]) => ({ atoms: new Set<number>(), captions: new Set<number>(), arrows: new Set(ids), shapes: new Set<number>() });
    const o = buildOffer(doc, m, sel(arrows), false, [])!;
    expect(o.steps).toBe(2);
    expect(o.box.x2).toBeGreaterThan(o.box.x1);
    // one step on its own is not a long scheme (a Smart Scheme of one step is)
    expect(buildOffer(doc, m, sel([arrows[0]]), false, [])).toBeNull();
    expect(buildOffer(doc, m, sel([arrows[0]]), true, [])!.steps).toBe(1);
    // once built, nothing more to offer
    const pieces = stepPieces(doc, m, all())!;
    doc.edit('mark', () => markPieces(doc, pieces));
    const { anims } = stepAnims(doc, pieces, AUTO_STEPS_DEFAULTS, []);
    expect(buildOffer(doc, m, sel(arrows), false, anims)).toBeNull();
  });
});
