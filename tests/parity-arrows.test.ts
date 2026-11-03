// @vitest-environment jsdom
//
// Arrow marks brought up to ChemDraw: a no-go arrow struck out with a cross or a hash, and a
// dipole arrow's crossed tail, on straight and curved arrows.

import { describe, it, expect } from 'vitest';
import { Doc, type Arrow } from '../src/model';
import { recordPicture } from '../src/render/picture';
import { arrowEllipseFrame, ellipseArrow, arrowEllipse, arrowHandles, dragArrowHandle, arrowMid } from '../src/objects';
import type { Item } from '../src/render/vector';

function ed<T>(doc: Doc, f: () => T): T { let r!: T; doc.edit('t', () => { r = f(); }); return r; }

/** The straight strokes of a picture of one arrow (leaving out the head's outline). */
function strokes(extra: Partial<Arrow>): [number, number, number, number][] {
  const doc = new Doc();
  ed(doc, () => doc.addArrow({ tail: { x: 0, y: 0 }, head: { x: 70, y: 0 }, headStyle: 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5, ...extra }));
  const out: [number, number, number, number][] = [];
  for (const i of recordPicture(doc)!.items as Item[]) {
    if (i.kind !== 'path' || !i.stroke) continue;
    let at: { x: number; y: number } | null = null;
    for (const s of i.segs) {
      if (s.k === 'M') at = s;
      else if (s.k === 'L' && at) { out.push([at.x, at.y, s.x, s.y]); at = s; }
    }
  }
  return out;
}
const across = (ls: [number, number, number, number][]) => ls.filter(([, y1, , y2]) => Math.abs(y2 - y1) > 1);

describe('arrow marks', () => {
  it('strikes a no-go arrow out with a cross in the middle', () => {
    const ls = across(strokes({ noGo: true }));
    expect(ls).toHaveLength(2);
    // the two strokes slope opposite ways and cross at the middle
    expect(Math.sign(ls[0][3] - ls[0][1]) * Math.sign(ls[0][2] - ls[0][0])).toBe(-Math.sign(ls[1][3] - ls[1][1]) * Math.sign(ls[1][2] - ls[1][0]));
    for (const [x1, , x2] of ls) expect((x1 + x2) / 2).toBeCloseTo(35, 3);
  });

  it('strikes a hashed no-go arrow out with two parallel strokes', () => {
    const ls = across(strokes({ noGo: true, noGoKind: 'hash' }));
    expect(ls).toHaveLength(2);
    const slope = ([x1, y1, x2, y2]: number[]) => (y2 - y1) / (x2 - x1);
    expect(slope(ls[0])).toBeCloseTo(slope(ls[1]), 6);
    expect(Math.abs(ls[0][0] - ls[1][0])).toBeGreaterThan(1);
  });

  it('crosses a dipole arrow near its tail, square to the shaft', () => {
    const ls = across(strokes({ dipole: true }));
    expect(ls).toHaveLength(1);
    expect(ls[0][0]).toBeCloseTo(ls[0][2], 6);
    expect(ls[0][0]).toBeGreaterThan(1);
    expect(ls[0][0]).toBeLessThan(70 * 0.2);
  });

  it('puts a curved arrow’s marks on its arc', () => {
    const doc = new Doc();
    const r = ed(doc, () => doc.addArrow({ tail: { x: 0, y: 0 }, head: { x: 70, y: 0 }, headStyle: 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: true, equilibrium: false, sweep: Math.PI / 2, headLength: 6, headWidth: 1.5 }));
    // the arc's middle is off the chord; the cross's strokes meet there, not on the chord
    const ls = strokes({ noGo: true, sweep: r.sweep });
    const mids = ls.filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) < 12 && Math.hypot(x2 - x1, y2 - y1) > 1).map(([x1, y1, x2, y2]) => (y1 + y2) / 2);
    expect(mids.length).toBe(2);
    for (const y of mids) expect(Math.abs(y)).toBeGreaterThan(5);
  });

  describe('elliptical arcs', () => {
    const arc = (sweep: number) => ({ tail: { x: 0, y: 0 }, head: { x: 60, y: 0 }, sweep, bez: undefined, ellipse: undefined } as unknown as Arrow);

    for (const sweep of [Math.PI / 2, -2]) {
      it(`reads a circular arc (sweep ${sweep.toFixed(2)}) as a circle and builds it back unchanged`, () => {
        const f = arrowEllipseFrame(arc(sweep))!;
        const back = ellipseArrow(f.c, f.u, f.v, f.t0, f.sweep);
        expect(back.tail.x).toBeCloseTo(0, 6); expect(back.tail.y).toBeCloseTo(0, 6);
        expect(back.head.x).toBeCloseTo(60, 6); expect(back.head.y).toBeCloseTo(0, 6);
        expect(back.sweep).toBeCloseTo(sweep, 6);
        expect(back.bez).toBeUndefined();
      });

      it(`stretches the arc (sweep ${sweep.toFixed(2)}) into an ellipse ChemDraw can keep`, () => {
        const r = arc(sweep);
        const f = arrowEllipseFrame(r)!;
        const e = { ...r, ...ellipseArrow(f.c, f.u, { x: f.v.x * 0.5, y: f.v.y * 0.5 }, f.t0, f.sweep) } as Arrow;
        expect(e.bez?.length).toBeGreaterThan(1);
        expect(arrowEllipse(e)).not.toBeNull();
        const g = arrowEllipseFrame(e)!;
        // the same ellipse, the same turn, and the arc's middle still on it
        expect(Math.hypot(g.u.x, g.u.y) / Math.hypot(g.v.x, g.v.y)).toBeCloseTo(2, 4);
        expect(Math.abs(g.sweep)).toBeCloseTo(Math.abs(sweep), 4);
        const m = arrowMid(e);
        const det = g.u.x * g.v.y - g.u.y * g.v.x, dx = m.x - g.c.x, dy = m.y - g.c.y;
        const a = (dx * g.v.y - dy * g.v.x) / det, b = (g.u.x * dy - g.u.y * dx) / det;
        expect(a * a + b * b).toBeCloseTo(1, 2);
      });
    }

    it('gives a curved arrow two axis diamonds that reshape it, snapping back to a circle', () => {
      const r = { ...arc(Math.PI / 2), id: 1 } as Arrow;
      const hs = arrowHandles(r).map((h) => h.which);
      expect(hs).toEqual(expect.arrayContaining(['ea', 'eb', 'mid']));
      const f = arrowEllipseFrame(r)!;
      const far = { x: f.c.x + f.u.x * 1.5, y: f.c.y + f.u.y * 1.5 };
      const wide = { ...r, ...dragArrowHandle(r, 'ea', far, false) } as Arrow;
      expect(wide.ellipse).toBeDefined();
      expect(arrowHandles(wide).map((h) => h.which)).toEqual(['tail', 'head', 'ea', 'eb']);
      const g = arrowEllipseFrame(wide)!;
      const near = { x: g.c.x + g.u.x / 1.5 * 1.02, y: g.c.y + g.u.y / 1.5 * 1.02 };
      const round = dragArrowHandle(wide, 'ea', near, false);
      expect(round.bez).toBeUndefined();
      expect(round.sweep).not.toBe(0);
    });
  });
});
