// @vitest-environment jsdom
//
// Which side of a double bond its second line goes on, when the file doesn't say: as ChemDraw 25
// draws it, measured from its SVG of 3,684 double bonds in real files (13 still differ).

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';

const fake = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5 }) : k === 'font' ? '' : () => undefined), set: () => true });
const canvas = { getContext: () => fake } as unknown as HTMLCanvasElement;

type Pt = [number, number];
/** A drawing from points and bonds (from, to, order); the first double bond's side. */
function sideOf(points: Pt[], bonds: [number, number, number][], labels: Record<number, number> = {}): number {
  const doc = new Doc();
  let id = 0;
  doc.edit('Draw', () => {
    const atoms = points.map(([x, y], i) => doc.addAtom(x, y, labels[i] ?? 6));
    for (const [a, c, order] of bonds) {
      const b = doc.addBond(atoms[a].id, atoms[c].id, order);
      if (order === 2 && !id) id = b.id;
    }
  });
  const r = new Renderer(canvas, canvas);
  return r.doubleSide(doc, doc.bonds.get(id)!);
}

// the shared bond runs down from (0, 0) to (0, 20): its right on screen is -x, its left +x
const a = [0, 0] as Pt, c = [0, 20] as Pt;
const hexagon = (sign: number): Pt[] => [[sign * 17, -10], [sign * 34, 0], [sign * 34, 20], [sign * 17, 30]];
const pentagon = (sign: number): Pt[] => [[sign * 19, -6], [sign * 31, 10], [sign * 19, 26]];

describe('a double bond between two rings', () => {
  it('goes to the ring with more double bonds, big or small', () => {
    // the five-membered ring on the left has another double bond; the six-membered ring has none
    const pts = [a, c, ...hexagon(-1), ...pentagon(1)];
    const six: [number, number, number][] = [[0, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 1, 1]];
    const five: [number, number, number][] = [[0, 6, 2], [6, 7, 1], [7, 8, 1], [8, 1, 1]];
    expect(sideOf(pts, [[0, 1, 2], ...six, ...five])).toBe(-1);
    const fiveAgain: [number, number, number][] = [[0, 6, 1], [6, 7, 1], [7, 8, 1], [8, 1, 1]];
    const sixMore: [number, number, number][] = [[0, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 1, 1]];
    expect(sideOf(pts, [[0, 1, 2], ...sixMore, ...fiveAgain])).toBe(1);
  });
  it('then to the smaller ring', () => {
    const pts = [a, c, ...hexagon(-1), ...pentagon(1)];
    const six: [number, number, number][] = [[0, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 1, 1]];
    const five: [number, number, number][] = [[0, 6, 1], [6, 7, 1], [7, 8, 1], [8, 1, 1]];
    expect(sideOf(pts, [[0, 1, 2], ...six, ...five])).toBe(-1);
  });
  it('then to the left', () => {
    const pts = [a, c, ...hexagon(-1), ...hexagon(1)];
    const r1: [number, number, number][] = [[0, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 1, 1]];
    const r2: [number, number, number][] = [[0, 6, 1], [6, 7, 1], [7, 8, 1], [8, 9, 1], [9, 1, 1]];
    expect(sideOf(pts, [[0, 1, 2], ...r1, ...r2])).toBe(-1);
  });
});

describe('a double bond outside rings', () => {
  it('goes toward a lone substituent, with or without a label at the end', () => {
    expect(sideOf([a, c, [-17, -10]], [[0, 1, 2], [0, 2, 1]])).toBe(1);
    expect(sideOf([a, c, [17, -10]], [[0, 1, 2], [0, 2, 1]], { 1: 8 })).toBe(-1);
  });
  it('is centred at the end of a chain with two bonds at one atom, or none', () => {
    expect(sideOf([a, c, [-17, -10], [17, -10]], [[0, 1, 2], [0, 2, 1], [0, 3, 1]], { 1: 8 })).toBe(0);
    expect(sideOf([a, c], [[0, 1, 2]])).toBe(0);
  });
  it('goes to the side with more substituents, and to the left if even', () => {
    expect(sideOf([a, c, [-17, -10], [-17, 30]], [[0, 1, 2], [0, 2, 1], [1, 3, 1]])).toBe(1);
    expect(sideOf([a, c, [-17, -10], [17, 30]], [[0, 1, 2], [0, 2, 1], [1, 3, 1]])).toBe(-1);
  });
});
