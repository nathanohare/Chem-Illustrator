// @vitest-environment jsdom
//
// ChemDraw's arc arrows along an ellipse (found by the ChemDraw 25 round trip, 2026-11-03): the
// ellipse is kept so the arrow can go back as ChemDraw's arc arrow, and heads on curves point the
// way ChemDraw's do.

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { arrowEllipse } from '../src/objects';
import { arcHeadBack } from '../src/render/renderer';

const read = (body: string) => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1"><page id="1">${body}</page></CDXML>`).doc;


describe("ChemDraw's arc arrows along an ellipse", () => {
  const arc = '<arrow id="5" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="25.40 56.18 0" Tail3D="90.72 72.18 0" Center3D="60 60 0" MajorAxisEnd3D="95 60 0" MinorAxisEnd3D="60 85.4 0" AngularSize="200"/>';
  it('keep their ellipse, to go back to ChemDraw as the same arc arrow, while the curve is still its arc', () => {
    const r = read(arc).arrows.get(5)!;
    const e = arrowEllipse(r)!;
    expect(e.angularSize).toBe(200);
    for (const [p, x, y] of [[e.center, 60, 60], [e.major, 95, 60], [e.minor, 60, 85.4]] as const) { expect(p.x).toBeCloseTo(x, 6); expect(p.y).toBeCloseTo(y, 6); }
    // moved, it moves with the arrow
    const moved = arrowEllipse({ ...r, tail: { x: r.tail.x + 10, y: r.tail.y + 5 }, head: { x: r.head.x + 10, y: r.head.y + 5 } })!;
    expect(moved.center.x).toBeCloseTo(70, 6);
    expect(moved.center.y).toBeCloseTo(65, 6);
    // reshaped, it is a curve of its own
    expect(arrowEllipse({ ...r, bez: r.bez!.map((q, i) => (i ? q : { x: q.x + 0.1, y: q.y })) })).toBeNull();
  });
  it("point their heads from where the notch meets the curve, as ChemDraw does", () => {
    // ChemDraw's 50 pt circle, 10 pt head with a 7/8 notch: the notch sits 10.04° round from the point
    expect(arcHeadBack(10, 50, Math.PI / 2, 0.875)).toBeCloseTo(10.04 * Math.PI / 180, 3);
    expect(arcHeadBack(8, 10, 3)).toBeCloseTo(0.64);
  });
});
