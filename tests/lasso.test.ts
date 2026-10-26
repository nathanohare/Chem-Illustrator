import { describe, expect, it } from 'vitest';
import { insideLoop } from '../src/editor/editor';

describe('lasso select', () => {
  it('knows what is inside a freehand loop, even a concave one', () => {
    // a U shape: the notch in the middle is outside
    const u = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }];
    expect(insideLoop(u, 0.5, 2)).toBe(true);
    expect(insideLoop(u, 2.5, 2)).toBe(true);
    expect(insideLoop(u, 1.5, 2)).toBe(false);
    expect(insideLoop(u, 1.5, 0.5)).toBe(true);
    expect(insideLoop(u, 4, 1)).toBe(false);
  });
});
