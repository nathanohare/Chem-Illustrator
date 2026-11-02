// @vitest-environment jsdom
//
// Turn in 3-D (a slide show emphasis effect): key views a structure turns between smoothly,
// one per click; drawn turned in the show (wedges follow), and kept through PowerPoint.

import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { writePptx } from '../src/io/pptx-write';
import { readPptx, withTurns } from '../src/io/pptx-read';
import { newAnim, partStates, slideParts, partOf, animName, EFFECTS, isEmphasis, type Anim } from '../src/deck/animation';
import { SAME_VIEW, axisView, isSameView, viewAngle, viewBetween, viewTimes } from '../src/deck/turn3d';
import { Turner } from '../src/deck/turn-render';
import type { PptxOptions } from '../src/io/pptx-write';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', box: { x1: 90, y1: 70, x2: 140, y2: 110 } }; }, async svgToPng() { return PNG; } };

/** A small structure: a chain with a wedge. */
function chain(doc: Doc): number[] {
  const ids: number[] = [];
  doc.edit('chain', () => {
    const a = doc.addAtom(100, 100), b = doc.addAtom(112.5, 92.8), c = doc.addAtom(125, 100), o = doc.addAtom(112.5, 78.4, 8);
    doc.addBond(a.id, b.id);
    doc.addBond(b.id, c.id);
    const w = doc.addBond(b.id, o.id);
    doc.updateBond(w.id, { display: 'wedge' });
    ids.push(a.id, b.id, c.id, o.id);
  });
  return ids;
}

describe('views', () => {
  it('turns the shortest way round, easing between two views', () => {
    const a = SAME_VIEW, b = axisView('y', 90);
    expect(isSameView(viewBetween(a, b, 0))).toBe(true);
    expect(viewAngle(viewBetween(a, b, 1), b)).toBeLessThan(1e-4);
    expect(viewAngle(viewBetween(a, b, 0.5), a)).toBeCloseTo(45, 3);
    // 270° one way is 90° the other
    expect(viewAngle(a, axisView('y', 270))).toBeCloseTo(90, 3);
    expect(viewAngle(viewTimes(axisView('x', 30), axisView('x', 60)), axisView('x', 90))).toBeLessThan(1e-4);
  });

  it('is an emphasis effect named Turn in 3-D', () => {
    expect(EFFECTS.some((e) => e.id === 'turn3d' && e.emph)).toBe(true);
    expect(isEmphasis('turn3d')).toBe(true);
    expect(animName(newAnim({ kind: 'atom', id: 1 }, 'turn3d'))).toBe('Turn in 3-D');
  });

  it('plays each key view on its own click, from the view before', () => {
    const doc = new Doc();
    const [a] = chain(doc);
    const parts = slideParts(doc);
    const t = { kind: 'atom' as const, id: a };
    const v1 = axisView('y', 90), v2 = viewTimes(axisView('x', 90), v1);
    const anims: Anim[] = [{ ...newAnim(t, 'turn3d'), view: v1, dur: 1 }, { ...newAnim(t, 'turn3d'), view: v2, dur: 1 }];
    const p = partOf(parts, t)!;
    // before the first click: as drawn
    expect(partStates(parts, anims, 0, -1).get(p)?.emph?.view ?? SAME_VIEW).toEqual(SAME_VIEW);
    // half way through the first turn: half way round
    expect(viewAngle(partStates(parts, anims, 0, 0.5).get(p)!.emph!.view!, SAME_VIEW)).toBeCloseTo(45, 1);
    // after it: at the first view; half way through the second: between the two
    expect(viewAngle(partStates(parts, anims, 1, -1).get(p)!.emph!.view!, v1)).toBeLessThan(1e-3);
    const mid = partStates(parts, anims, 1, 0.5).get(p)!.emph!.view!;
    expect(viewAngle(mid, v1)).toBeCloseTo(45, 1);
    expect(viewAngle(partStates(parts, anims, 2, -1).get(p)!.emph!.view!, v2)).toBeLessThan(1e-3);
  });
});

describe('drawing it turned', () => {
  it('turns copies of the drawing about its middle, wedges following, the drawing itself untouched', () => {
    const doc = new Doc();
    const [a, b, c, o] = chain(doc);
    const turner = new Turner(doc);
    expect(turner.empty).toBe(false);
    // half a turn about the up-down line: left and right swap, and the wedge now points away
    const back = turner.at(axisView('y', 180));
    expect(back.atoms.get(a)!.x).toBeCloseTo(doc.atoms.get(c)!.x, 3);
    expect(back.atoms.get(c)!.x).toBeCloseTo(doc.atoms.get(a)!.x, 3);
    const wedge = [...back.bonds.values()].find((x) => (x.a1 === b && x.a2 === o) || (x.a1 === o && x.a2 === b))!;
    expect(wedge.display).toBe('hashWedge');
    expect(doc.atoms.get(a)!.x).toBe(100);
    // as drawn: the same places
    expect(turner.at(SAME_VIEW).atoms.get(o)!.y).toBeCloseTo(78.4, 6);
    // room for any angle
    expect(turner.reach).toBeGreaterThan(12);
  });
});

describe('Turn in 3-D through PowerPoint', () => {
  it('gives PowerPoint a Spin of next to nothing and keeps the views in a tag', async () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.setLayout('blank');
    const [a] = chain(host);
    const v1 = axisView('y', 120);
    const list: Anim[] = [
      { ...newAnim({ kind: 'atom', id: a }, 'turn3d'), view: v1, dur: 1.5 },
      { ...newAnim({ kind: 'atom', id: a }, 'spin'), turn: 90 },
      { ...newAnim({ kind: 'atom', id: a }, 'turn3d'), view: SAME_VIEW, dur: 1.5 },
    ];
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes, anims: list })) }, opts);
    const files = unzipSync(bytes);
    expect(strFromU8(files['ppt/slides/slide1.xml'])).toContain('<p:animRot by="1">');
    const got = readPptx(bytes).slides[0].anims!;
    expect(got.map((x) => x.effect)).toEqual(['turn3d', 'spin', 'turn3d']);
    expect(viewAngle(got[0].view!, v1)).toBeLessThan(1e-3);
    expect(got[1].turn).toBeCloseTo(90);
    expect(got[0].dur).toBeCloseTo(1.5);
  });

  it('leaves a real Spin alone and copes with a broken tag', () => {
    const spin: Anim = { ...newAnim({ kind: 'shape', id: 1 }, 'spin'), turn: 0 };
    expect(withTurns([spin], 'not json')).toEqual([spin]);
    expect(withTurns([{ ...spin, turn: 360 }], '[[1,0,0,0,1,0,0,0,1]]')[0].effect).toBe('spin');
    const back = withTurns([spin], '[null]')[0];
    expect(back.effect).toBe('turn3d');
    expect(back.view).toBeUndefined();
  });
});
