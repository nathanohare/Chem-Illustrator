// @vitest-environment jsdom
//
// File > Import Structures from PDF on big pages (posters): a page is drawn no larger than a canvas
// can be, and how big a drawing must be to count doesn't grow with the page's width.

import { describe, expect, it } from 'vitest';
import { pageRender } from '../src/ui/import-structures';
import { findDrawings } from '../src/recognise/find';

const line = (set: (x: number, y: number) => void, x1: number, y1: number, x2: number, y2: number) => {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= n; i++) set(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n));
};

describe('PDF pages drawn for finding structures', () => {
  it('a letter or A4 page is drawn at twice its size, as before', () => {
    expect(pageRender(612, 792)).toEqual({ scale: 2, gap: 10 });
    expect(pageRender(595, 842)).toEqual({ scale: 2, gap: 10 });
  });

  it('a poster page (200 × 200 in, the largest a PDF allows) is drawn on a canvas a browser can make', () => {
    const { scale } = pageRender(14400, 14400);
    const side = Math.ceil(14400 * scale);
    expect(side).toBeLessThanOrEqual(8000);
    expect(side * side).toBeLessThanOrEqual(16e6);
    // a long thin page too
    const thin = pageRender(14400, 720).scale;
    expect(14400 * thin).toBeLessThanOrEqual(8000);
  });

  it('finds an ordinary ring on a 48 × 36 in poster page', () => {
    const wPt = 3456, hPt = 2592;
    const { scale, gap } = pageRender(wPt, hPt);
    const w = Math.ceil(wPt * scale), h = Math.ceil(hPt * scale);
    const ink = new Uint8Array(w * h);
    const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < w && y < h) ink[y * w + x] = 1; };
    // a ring 28 pt in radius (journal size), at the middle of the page
    const cx = w / 2, cy = h / 2, r = 28 * scale;
    const p = [0, 1, 2, 3, 4, 5, 6].map((i) => [cx + r * Math.cos((Math.PI / 3) * i + Math.PI / 6), cy + r * Math.sin((Math.PI / 3) * i + Math.PI / 6)]);
    for (let i = 0; i < 6; i++) line(set, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
    expect(findDrawings(ink, w, h, [], gap)).toHaveLength(1);
  });
});
