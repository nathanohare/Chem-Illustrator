// Issues #405 and #407 (Lauren). Align and Distribute treat a group (Format > Group) as one
// object, and a typed "NH" on a ring stacks its H below the N, off the bonds, as an automatic NH does.

import { describe, it, expect } from 'vitest';
import { Doc, Arrow } from '../src/model';
import { units, joinGroups, alignOffsets, distributeOffsets, POINTS, Selection } from '../src/editor/arrange';
import { labelSpec, labelDir, layoutLabel, typedH } from '../src/chem/labels';

const sel = (s: Partial<Selection>): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set(), ...s });

function arrowAt(doc: Doc, x: number, y: number, grp?: number): Arrow {
  return doc.addArrow({
    tail: { x, y }, head: { x: x + 40, y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid',
    noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5, ...(grp ? { grp } : {}),
  });
}

describe('Align with groups (#405)', () => {
  function scene() {
    const doc = new Doc();
    doc.bulk(() => {
      // objects 1 and 2 grouped, at different heights; object 3 on its own, lower down
      arrowAt(doc, 0, 0, 7);
      arrowAt(doc, 60, 30, 7);
      arrowAt(doc, 150, 100);
    });
    return { doc, all: sel({ arrows: new Set(doc.arrows.keys()) }) };
  }

  it('a group counts as one object', () => {
    const { doc, all } = scene();
    expect(units(doc, all, POINTS).length).toBe(3);
    const us = joinGroups(doc, units(doc, all, POINTS));
    expect(us.length).toBe(2);
    expect(us[0].arrows.length).toBe(2);
    expect(us[0].box).toEqual({ x1: 0, y1: 0, x2: 100, y2: 30 });
  });

  it('aligning tops moves the group as a whole, keeping its shape', () => {
    const { doc, all } = scene();
    const us = joinGroups(doc, units(doc, all, POINTS));
    const off = alignOffsets(us, 'top');
    expect(off[0]).toEqual({ x: 0, y: 0 });
    expect(off[1]).toEqual({ x: 0, y: -100 });
  });

  it('a structure and a caption grouped together line up as one', () => {
    const doc = new Doc();
    let ids: number[] = [];
    doc.bulk(() => {
      const a = doc.addAtom(0, 0), b = doc.addAtom(14, 0);
      doc.addBond(a.id, b.id);
      doc.updateAtom(a.id, { grp: 3 }); doc.updateAtom(b.id, { grp: 3 });
      arrowAt(doc, 0, 40, 3);
      arrowAt(doc, 100, 0);
      arrowAt(doc, 200, 0);
      ids = [a.id, b.id];
    });
    const us = joinGroups(doc, units(doc, sel({ atoms: new Set(ids), arrows: new Set(doc.arrows.keys()) }), POINTS));
    expect(us.length).toBe(3);
    expect(us[0].atoms.length).toBe(2);
    expect(us[0].arrows.length).toBe(1);
    expect(distributeOffsets(us, 'h').length).toBe(3);
  });
});

describe('typed NH in a ring (#407)', () => {
  // the N at the bottom of a ring: bonds up-left and up-right
  const dirs = [{ x: -0.89, y: -0.45 }, { x: 0.83, y: -0.55 }];

  it('stacks the H below, as an automatic NH does', () => {
    expect(labelDir(labelSpec(7, null, 0, 0, 2, 2)!, dirs)).toBe('down');
    expect(labelDir(labelSpec(7, 'NH', 0, 0, 2, 2)!, dirs)).toBe('down');
    const lay = layoutLabel(labelSpec(7, 'NH', 0, 0, 2, 2)!, dirs, 10, (t, s) => t.length * s * 0.6);
    const h = lay.runs.find((r) => r.text === 'H')!, n = lay.runs.find((r) => r.text === 'N')!;
    expect(h.dy).toBeGreaterThan(n.dy + 5);
  });

  it('a typed NH at the end of a chain still reads NH or HN', () => {
    expect(labelDir(labelSpec(7, 'NH2', 0, 0, 1, 1)!, [{ x: -1, y: 0 }])).toBe('right');
    expect(labelDir(labelSpec(7, 'NH2', 0, 0, 1, 1)!, [{ x: 1, y: 0 }])).toBe('left');
    const lay = layoutLabel(labelSpec(7, 'NH2', 0, 0, 1, 1)!, [{ x: 1, y: 0 }], 10, (t, s) => t.length * s * 0.6);
    expect(lay.runs.map((r) => r.text).join('')).toBe('H2N');
  });

  it('leaves other labels as typed', () => {
    for (const l of ['OMe', 'Ph', 'HN', 'NHBoc', 'CH3']) {
      const spec = labelSpec(6, l, 0, 0, 2, 2)!;
      if (l !== 'CH3') expect(typedH(spec)).toBe(spec);
    }
  });
});
