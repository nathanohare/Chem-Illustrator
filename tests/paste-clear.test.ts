import { describe, it, expect } from 'vitest';
import { clearOffset } from '../src/editor/arrange';

const box = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

describe('clearOffset (where a paste goes so it does not sit on what is there)', () => {
  it('leaves a paste that is already clear where it is', () => {
    expect(clearOffset(box(0, 0, 50, 50), [box(100, 0, 150, 50)], 14)).toEqual({ x: 0, y: 0 });
  });

  it('moves a second paste beside the first, not on top of it', () => {
    const first = box(0, 0, 60, 40);
    const t = clearOffset(box(0, 0, 60, 40), [first], 14);
    expect(t.x !== 0 || t.y !== 0).toBe(true);
    expect(overlaps(box(t.x, t.y, 60 + t.x, 40 + t.y), first)).toBe(false);
    // the nearest clear side: the box is wider than tall, so below (or above) is nearer than beside
    expect(Math.hypot(t.x, t.y)).toBeLessThanOrEqual(40 + 14 + 0.01);
  });

  it('three pastes in a row each find their own place', () => {
    const placed = [box(0, 0, 50, 50)];
    for (let i = 0; i < 2; i++) {
      const t = clearOffset(box(0, 0, 50, 50), placed, 14);
      const b = box(t.x, t.y, 50 + t.x, 50 + t.y);
      for (const p of placed) expect(overlaps(b, p)).toBe(false);
      placed.push(b);
    }
  });

  it('stays on the page when there is one', () => {
    const t = clearOffset(box(10, 10, 60, 60), [box(10, 10, 60, 60)], 14, { w: 200, h: 80 });
    expect(10 + t.x).toBeGreaterThanOrEqual(0);
    expect(60 + t.y).toBeLessThanOrEqual(80);
    expect(60 + t.x).toBeLessThanOrEqual(200);
  });
});
