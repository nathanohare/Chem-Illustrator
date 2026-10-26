// Structures imported from a picture or PDF go in the free space nearest the middle of the
// window, not on top of what is already drawn.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { freeSpace } from '../src/editor/free-space';

const L = 30;
/** A row of `n` bonded atoms from (x, y), one bond length apart. */
function chain(doc: Doc, x: number, y: number, n: number): void {
  doc.edit('chain', () => {
    let prev = doc.addAtom(x, y);
    for (let i = 1; i < n; i++) { const a = doc.addAtom(x + i * L, y); doc.addBond(prev.id, a.id); prev = a; }
  });
}
const clearOf = (doc: Doc, c: { x: number; y: number }, w: number, h: number) =>
  [...doc.atoms.values()].every((a) => a.x < c.x - w / 2 || a.x > c.x + w / 2 || a.y < c.y - h / 2 || a.y > c.y + h / 2);

describe('freeSpace', () => {
  it('is the place asked for in an empty drawing', () => {
    expect(freeSpace(new Doc(), 100, 50, { x: 10, y: 20 }, 2 * L)).toEqual({ x: 10, y: 20 });
  });

  it('is beside a structure in the middle of the window, not on it', () => {
    const doc = new Doc();
    chain(doc, 0, 0, 6);
    const near = { x: 75, y: 0 };
    const c = freeSpace(doc, 120, 60, near, 2 * L);
    expect(clearOf(doc, c, 120 + 2 * L, 60 + 2 * L)).toBe(true);
    // the nearest free place: just above or below the chain, not far away
    expect(Math.hypot(c.x - near.x, c.y - near.y)).toBeLessThan(150);
  });

  it('finds the gap between drawings when there is one', () => {
    const doc = new Doc();
    chain(doc, 0, 0, 4);
    chain(doc, 0, 400, 4);
    chain(doc, -400, 200, 4);
    chain(doc, 400, 200, 4);
    const c = freeSpace(doc, 90, 60, { x: 45, y: 200 }, 2 * L);
    expect(clearOf(doc, c, 90 + 2 * L, 60 + 2 * L)).toBe(true);
    expect(Math.hypot(c.x - 45, c.y - 200)).toBeLessThan(L);
  });
});
