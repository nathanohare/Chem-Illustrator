// Curved arrows edited as paths: joins that stay smooth, bends added and taken out, Shift steps,
// and curves fitted to points.

import { describe, expect, it } from 'vitest';
import { dragCurveAt, dragPathPoint, fitPath, throughPoints, insertJoin, joinKind, nearestOnPath, pathPoints, removeJoin, setJoin, bezFrom } from '../src/arrow-path';
import { arrowPoints, bezPathAt, bezPoints } from '../src/objects';
import { angleOf, dist, sub, DEG, type Vec } from '../src/geom';

const S = { tail: { x: 0, y: 0 }, head: { x: 100, y: 0 }, sweep: 0, bez: [{ x: 0.25, y: 0.8 }, { x: 0.75, y: -0.8 }] };
const along = (pts: Vec[], k = 40) => { const n = (pts.length - 1) / 3; return Array.from({ length: k + 1 }, (_, i) => bezPathAt(pts, (n * i) / k)); };
/** The furthest any point of path a is from path b. */
const gap = (a: Vec[], b: Vec[]) => Math.max(...along(a, 120).map((p) => nearestOnPath(b, p).d));
const turn = (u: Vec, v: Vec) => { const d = Math.abs(angleOf(u) - angleOf(v)) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };

describe('adding and taking out bends', () => {
  it('adds a join without changing the shape', () => {
    const pts = bezPoints(S)!;
    const two = insertJoin(pts, 0.4)!;
    expect(two).toHaveLength(7);
    expect(gap(two, pts)).toBeLessThan(1e-4);
    // the new join is on the old curve, at 0.4
    expect(dist(two[3], bezPathAt(pts, 0.4))).toBeLessThan(1e-9);
    // and is smooth
    expect(joinKind(two, 3)).not.toBe('corner');
  });

  it('will not add a join on top of an end', () => {
    expect(insertJoin(bezPoints(S)!, 0.001)).toBeNull();
    expect(insertJoin(bezPoints(S)!, 0.999)).toBeNull();
  });

  it('takes a join out again, back to (very nearly) the curve it came from', () => {
    const pts = bezPoints(S)!;
    const back = removeJoin(insertJoin(pts, 0.6)!, 3)!;
    expect(back).toHaveLength(4);
    expect(gap(back, pts)).toBeLessThan(0.5);
  });

  it('only takes out joins', () => {
    const two = insertJoin(bezPoints(S)!, 0.5)!;
    expect(removeJoin(two, 2)).toBeNull();
    expect(removeJoin(two, 0)).toBeNull();
    expect(removeJoin(two, 6)).toBeNull();
  });

  it('turns a single-curve arrow into the same arc as curves', () => {
    for (const sweep of [60 * DEG, -120 * DEG, 270 * DEG]) {
      const arc = { tail: { x: 0, y: 0 }, head: { x: 80, y: 20 }, sweep };
      const pts = pathPoints(arc);
      expect((pts.length - 1) % 3).toBe(0);
      expect(dist(pts[0], arc.tail)).toBeLessThan(1e-9);
      expect(dist(pts[pts.length - 1], arc.head)).toBeLessThan(1e-9);
      // every point of the arc as drawn is on the curves
      const drawn = arrowPoints(arc, 48);
      expect(Math.max(...drawn.map((p) => nearestOnPath(pts, p).d))).toBeLessThan(0.1);
      // and round trips through an arrow's bez
      const r = { ...arc, sweep: 0, bez: bezFrom(arc.tail, arc.head, pts) };
      expect(gap(bezPoints(r)!, pts)).toBeLessThan(1e-4);
    }
  });
});

describe('dragging handles and joins', () => {
  const two = insertJoin(bezPoints(S)!, 0.5)!; // joins at 3, symmetric

  it('turns the handle across a smooth join with the one dragged', () => {
    const before = joinKind(two, 3);
    const out = dragPathPoint(two, 4, { x: two[4].x + 10, y: two[4].y + 25 });
    expect(joinKind(out, 3)).toBe(before);
    expect(turn(sub(out[4], out[3]), sub(out[3], out[2]))).toBeLessThan(1e-6);
  });

  it('keeps a smooth (not symmetric) join\'s other handle its own length', () => {
    // the handle after the join twice as long as the one before: in line, but not symmetric
    const out = two.slice();
    out[4] = { x: two[3].x + 2 * (two[4].x - two[3].x), y: two[3].y + 2 * (two[4].y - two[3].y) };
    expect(joinKind(out, 3)).toBe('smooth');
    const l = dist(out[4], out[3]);
    const moved = dragPathPoint(out, 2, { x: out[3].x - 5, y: out[3].y + 20 });
    expect(dist(moved[4], moved[3])).toBeCloseTo(l, 6);
    expect(turn(sub(moved[4], moved[3]), sub(moved[3], moved[2]))).toBeLessThan(1e-6);
  });

  it('with Alt leaves the other handle alone: a corner', () => {
    const out = dragPathPoint(two, 4, { x: two[3].x, y: two[3].y + 30 }, { corner: true });
    expect(out[2]).toEqual(two[2]);
    expect(joinKind(out, 3)).toBe('corner');
    // and from then on the handles move on their own
    const again = dragPathPoint(out, 4, { x: two[3].x + 20, y: two[3].y + 30 });
    expect(again[2]).toEqual(two[2]);
  });

  it('takes the handles with a join that moves', () => {
    const out = dragPathPoint(two, 3, { x: two[3].x + 7, y: two[3].y - 4 });
    for (const i of [2, 3, 4]) expect(dist(out[i], { x: two[i].x + 7, y: two[i].y - 4 })).toBeLessThan(1e-9);
    for (const i of [0, 1, 5, 6]) expect(out[i]).toEqual(two[i]);
  });

  it('with Shift turns a handle in 15° steps round its join', () => {
    const out = dragPathPoint(two, 4, { x: two[3].x + 30, y: two[3].y + 11 }, { step: true });
    const a = angleOf(sub(out[4], out[3])) / DEG;
    expect(Math.abs(a / 15 - Math.round(a / 15))).toBeLessThan(1e-9);
  });

  it('with Shift slides a join along its handles', () => {
    const out = dragPathPoint(two, 3, { x: two[3].x + 10, y: two[3].y + 50 }, { step: true });
    const u = sub(two[4], two[2]);
    const m = sub(out[3], two[3]);
    expect(Math.abs(u.x * m.y - u.y * m.x)).toBeLessThan(1e-6);
  });

  it('makes a corner smooth or symmetric again', () => {
    const corner = dragPathPoint(two, 4, { x: two[3].x, y: two[3].y + 30 }, { corner: true });
    expect(joinKind(setJoin(corner, 3, 'smooth'), 3)).not.toBe('corner');
    expect(joinKind(setJoin(corner, 3, 'symmetric'), 3)).toBe('symmetric');
  });
});

describe('fitting curves to points', () => {
  it('follows a wavy stroke closely with a few curves', () => {
    const pts: Vec[] = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 30 * Math.sin(i / 20) }));
    const fit = fitPath(pts, 1);
    expect((fit.length - 1) % 3).toBe(0);
    expect((fit.length - 1) / 3).toBeLessThan(8);
    expect(Math.max(...pts.map((p) => nearestOnPath(fit, p).d))).toBeLessThan(1.5);
    expect(dist(fit[0], pts[0])).toBe(0);
    expect(dist(fit[fit.length - 1], pts[199])).toBe(0);
  });

  it('is one curve for a straight stroke', () => {
    const pts: Vec[] = Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: i }));
    expect(fitPath(pts, 0.5)).toHaveLength(4);
  });
});

describe('drawing through points and reshaping by the line', () => {
  it('runs smoothly through every point clicked', () => {
    const at: Vec[] = [{ x: 0, y: 0 }, { x: 40, y: -30 }, { x: 90, y: -20 }, { x: 120, y: 10 }];
    const pts = throughPoints(at);
    expect(pts).toHaveLength(10);
    at.forEach((q, i) => expect(pts[3 * i]).toEqual(q));
    for (const j of [3, 6]) expect(joinKind(pts, j)).not.toBe('corner');
  });

  it('runs through a point the way it was dragged out', () => {
    const at: Vec[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }];
    const pts = throughPoints(at, [null, { x: 0, y: 1 }, null]);
    // going straight down through the middle point
    expect(Math.abs(pts[4].x - pts[3].x)).toBeLessThan(1e-9);
    expect(pts[4].y).toBeGreaterThan(pts[3].y);
  });

  it('moves the place grabbed on to the pointer, leaving ends and joins where they were', () => {
    const two = insertJoin(bezPoints(S)!, 0.5)!;
    const t = 1.3;
    const target = { x: bezPathAt(two, t).x + 6, y: bezPathAt(two, t).y - 12 };
    const out = dragCurveAt(two, t, target);
    expect(dist(bezPathAt(out, t), target)).toBeLessThan(1e-6);
    for (const i of [0, 3, 6]) expect(out[i]).toEqual(two[i]);
    // the join it touches stays smooth
    expect(joinKind(out, 3)).not.toBe('corner');
  });
});
