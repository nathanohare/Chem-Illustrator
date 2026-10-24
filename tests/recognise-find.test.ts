import { describe, expect, it } from 'vitest';
import { findDrawings, isProse, type Box } from '../src/recognise/find';

/** A blank page w × h with ink drawn by `draw`. */
function page(w: number, h: number, draw: (set: (x: number, y: number) => void) => void): Uint8Array {
  const ink = new Uint8Array(w * h);
  draw((x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) ink[y * w + x] = 1; });
  return ink;
}
const line = (set: (x: number, y: number) => void, x1: number, y1: number, x2: number, y2: number) => {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= n; i++) set(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n));
};
/** A hexagon of radius r at (cx, cy). */
const hexagon = (set: (x: number, y: number) => void, cx: number, cy: number, r: number) => {
  const p = [0, 1, 2, 3, 4, 5, 6].map((i) => [cx + r * Math.cos((Math.PI / 3) * i), cy + r * Math.sin((Math.PI / 3) * i)]);
  for (let i = 0; i < 6; i++) line(set, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
};

describe('isProse', () => {
  it('tells prose and compound numbers from atom labels', () => {
    expect(isProse('the reaction was')).toBe(true);
    expect(isProse('12')).toBe(true);
    expect(isProse('(3a)')).toBe(true);
    for (const s of ['O', 'OMe', 'CO2Et', 'Me', 'NH2', 'H']) expect(isProse(s)).toBe(false);
  });
});

describe('findDrawings', () => {
  it('finds two drawings apart and passes over a rule and prose', () => {
    const w = 600, h = 400;
    const ink = page(w, h, (set) => {
      hexagon(set, 100, 100, 40);
      hexagon(set, 400, 120, 40);
      line(set, 20, 300, 580, 300); // a rule across the page
      for (let x = 50; x < 550; x += 3) set(x, 350); // a line of "text"
    });
    const prose: Box[] = [{ x: 40, y: 340, w: 520, h: 20 }];
    const found = findDrawings(ink, w, h, prose, 5);
    expect(found).toHaveLength(2);
    expect(found[0].x).toBeLessThanOrEqual(60);
    expect(found[1].x).toBeGreaterThan(300);
  });

  it('keeps a label a little apart from its bonds with the drawing', () => {
    const w = 400, h = 300;
    const ink = page(w, h, (set) => {
      hexagon(set, 150, 150, 40);
      for (let y = 140; y < 150; y++) for (let x = 197; x < 203; x++) set(x, y); // "OH" just beyond the ring
    });
    const [box] = findDrawings(ink, w, h, [], 5);
    expect(box.x + box.w).toBeGreaterThanOrEqual(202);
  });
});
