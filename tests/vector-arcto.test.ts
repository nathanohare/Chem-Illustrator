// Rounded corners (arcTo) in recorded pictures: the warning marks' round looks use them.
import { test, expect } from 'vitest';
import { VecPath } from '../src/render/vector';
test('arcTo', () => {
  // square corner at (10,0), from (0,0) to (10,10): arc centre (8,2), r 2, ends (8,0) and (10,2)
  const p = new VecPath(); p.moveTo(0, 0); p.arcTo(10, 0, 10, 10, 2);
  const last = p.segs[p.segs.length - 1] as { x: number; y: number };
  expect(last.x).toBeCloseTo(10); expect(last.y).toBeCloseTo(2);
  // mid of the curve: control points should lie between
  const c = p.segs[2] as { x1: number; y1: number };
  expect(c.x1).toBeGreaterThan(8); expect(c.y1).toBeLessThan(0.5);
});
