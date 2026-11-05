// @vitest-environment jsdom
//
// The Freeform pen (Frames ▸ Freeform): a shape through clicked points, smooth or straight,
// open or closed, kept as a design shape whose id holds its Bézier points.

import { describe, it, expect } from 'vitest';
import { Doc, type Shape } from '../src/model';
import { freeformShape, freeformAnchors, smoothThrough, straightThrough, isSmoothPath, reshapeFreeform } from '../src/design/freeform';
import { freeformPoints, geoDef } from '../src/design/geo';
import { recordPicture } from '../src/render/picture';

const pts = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 10, y: 40 }];
function ed<T>(doc: Doc, f: () => T): T { let r!: T; doc.edit('t', () => { r = f(); }); return r; }

describe('freeform shapes', () => {
  it('keeps straight sides through the points, open or closed', () => {
    for (const closed of [false, true]) {
      const s = freeformShape(straightThrough(pts, closed), closed) as Shape;
      const f = freeformPoints(s)!;
      expect(f.closed).toBe(closed);
      expect(isSmoothPath(f.pts)).toBe(false);
      const back = freeformAnchors(f.pts, closed);
      expect(back).toHaveLength(4);
      back.forEach((p, i) => { expect(p.x).toBeCloseTo(pts[i].x, 2); expect(p.y).toBeCloseTo(pts[i].y, 2); });
      const body = geoDef(s.geo).draw(40, 40).body;
      expect(body.some((st) => st[0] === 'Z')).toBe(closed);
    }
  });

  it('runs a closed smooth shape round smoothly through its start', () => {
    const p = smoothThrough(pts, true);
    expect(p).toHaveLength(3 * 4 + 1);
    expect(isSmoothPath(p)).toBe(true);
    // the handles either side of the start point are in line with it
    const a = p[1], b = p[p.length - 2], o = p[0];
    expect((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)).toBeCloseTo(0, 6);
  });

  it('switches Closed and Smooth through the same points', () => {
    const s = { ...freeformShape(straightThrough(pts, false), false), id: 1 } as Shape;
    const closed = { ...s, ...reshapeFreeform(s, { closed: true }) } as Shape;
    expect(freeformPoints(closed)!.closed).toBe(true);
    const smooth = { ...closed, ...reshapeFreeform(closed, { smooth: true }) } as Shape;
    const f = freeformPoints(smooth)!;
    expect(f.closed).toBe(true);
    expect(isSmoothPath(f.pts)).toBe(true);
    freeformAnchors(f.pts, true).forEach((p, i) => { expect(p.x).toBeCloseTo(pts[i].x, 2); expect(p.y).toBeCloseTo(pts[i].y, 2); });
  });

  it('draws an open freeform as a line, not a closed outline', () => {
    const doc = new Doc();
    ed(doc, () => doc.addShape(freeformShape(straightThrough(pts, false), false)));
    const items = recordPicture(doc)!.items.filter((i) => i.kind === 'path' && i.stroke) as { segs: { k: string }[] }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.segs.some((s) => s.k === 'Z'))).toBe(false);
  });
});
