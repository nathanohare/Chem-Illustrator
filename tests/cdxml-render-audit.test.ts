// @vitest-environment jsdom
//
// Drawings from ChemDraw files the renderer used to get wrong: a double or aromatic bond drawn
// as a wedge (a ring in perspective), a wavy double bond (ChemDraw's crossed one), the radical
// and dagger symbols, and a shadowed oval.

import { describe, it, expect } from 'vitest';
import { recordPicture } from '../src/render/picture';
import { readCdxml } from '../src/io/cdxml';
import type { Item, Seg } from '../src/render/vector';

const cdxml = (body: string) => `<?xml version="1.0"?><CDXML BondLength="14.4" LineWidth="0.6" BoldWidth="2"><page>${body}</page></CDXML>`;
const pic = (body: string) => recordPicture(readCdxml(cdxml(body)).doc)!.items;
const fills = (items: Item[]) => items.filter((i) => i.kind === 'path' && i.fill && i.segs.length) as { segs: Seg[]; fill: string }[];
const strokes = (items: Item[]) => items.filter((i) => i.kind === 'path' && i.stroke) as { segs: Seg[] }[];
/** The straight pieces of the stroked paths. */
const lines = (items: Item[]) => {
  const out: [number, number, number, number][] = [];
  for (const p of strokes(items)) {
    let at: { x: number; y: number } | null = null;
    for (const s of p.segs) {
      if (s.k === 'M') at = s;
      else if (s.k === 'L' && at) { out.push([at.x, at.y, s.x, s.y]); at = s; }
    }
  }
  return out;
};
/** A ring of six, its first bond drawn as `display`, alternating double and single bonds (or all aromatic). */
const ring = (display: string, order: string) => {
  const pts = [...Array(6)].map((_, i) => [100 + 14.4 * Math.cos((i * Math.PI) / 3), 100 + 14.4 * Math.sin((i * Math.PI) / 3)]);
  const ns = pts.map(([x, y], i) => `<n id="${i + 1}" p="${x.toFixed(3)} ${y.toFixed(3)}"/>`).join('');
  const bs = pts.map((_, i) => {
    const o = order === '1.5' ? '1.5' : i % 2 ? '1' : '2';
    return `<b id="${i + 10}" B="${i + 1}" E="${((i + 1) % 6) + 1}" Order="${o}"${i === 0 && display ? ` Display="${display}"` : ''}/>`;
  }).join('');
  return `<fragment>${ns}${bs}</fragment>`;
};
const area = (segs: Seg[]) => {
  let a = 0, prev: { x: number; y: number } | null = null, first: { x: number; y: number } | null = null;
  for (const s of segs) {
    if (s.k === 'M') { prev = first = s; continue; }
    if (s.k === 'Z' && prev && first) { a += prev.x * first.y - first.x * prev.y; prev = first; continue; }
    if ((s.k === 'L' || s.k === 'C') && prev) { a += prev.x * s.y - s.x * prev.y; prev = s; }
  }
  return Math.abs(a / 2);
};

describe('ChemDraw drawings', () => {
  for (const order of ['2', '1.5']) {
    it(`draws a wedged bond of order ${order} as a filled wedge, with its second line`, () => {
      const plain = pic(ring('', order)), wedged = pic(ring('WedgeBegin', order));
      expect(fills(plain).reduce((a, f) => a + area(f.segs), 0)).toBeLessThan(0.01);
      const total = fills(wedged).reduce((a, f) => a + area(f.segs), 0);
      // about half the bond's length times its wide end
      expect(total).toBeGreaterThan(10);
      expect(total).toBeLessThan(40);
      // the second (inner) line is still drawn: one line fewer than in the plain ring, not two
      if (order === '2') expect(lines(plain).length - lines(wedged).length).toBe(1);
    });

    it(`draws a hashed wedge of order ${order} as hashes, with its second line`, () => {
      const plain = lines(pic(ring('', order))), hashed = lines(pic(ring('WedgedHashBegin', order)));
      expect(hashed.length).toBeGreaterThan(plain.length + 2);
    });
  }

  it('draws a wavy double bond as two crossed lines', () => {
    // (leaving out the lines' rounded end tips)
    const ls = lines(pic('<fragment><n id="1" p="100 100"/><n id="2" p="114.4 100"/><b id="3" B="1" E="2" Order="2" Display="Wavy"/></fragment>')).filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) > 2);
    expect(ls.length).toBe(2);
    const slope = ([x1, y1, x2, y2]: number[]) => (y2 - y1) / (x2 - x1);
    // each runs from one side at one end to the other side at the other end
    expect(Math.sign(slope(ls[0]))).toBe(-Math.sign(slope(ls[1])));
    expect(Math.abs(slope(ls[0]))).toBeGreaterThan(0.05);
    for (const l of ls) expect(Math.abs(l[1] - 100)).toBeCloseTo(Math.abs(l[3] - 100), 3);
  });

  const symbol = (type: string | null) => `<graphic id="9" BoundingBox="100 100 106 100" GraphicType="Symbol"${type ? ` SymbolType="${type}"` : ''}/>`;

  it('draws radical cations and anions as a dot and a sign', () => {
    for (const [type, n] of [['RadicalCation', 2], ['RadicalAnion', 1]] as const) {
      const items = pic(symbol(type));
      expect(lines(items).length).toBe(n);
      expect(fills(items).length).toBe(1);
    }
  });

  it('draws daggers as ChemDraw 25 does: a stem and one or two bars', () => {
    const moves = (sym: string) => pic(symbol(sym)).filter((i) => i.kind === 'path' && i.stroke).flatMap((i) => (i as unknown as { segs: { k: string }[] }).segs).filter((g) => g.k === 'M').length;
    expect(moves('Dagger')).toBe(2);
    expect(moves('DoubleDagger')).toBe(3);
  });

  it('draws a shadowed oval with its shadow', () => {
    const oval = (type: string, extra = '') => `<graphic id="9" BoundingBox="0 0 0 0" GraphicType="Oval" OvalType="${type}" Center3D="100 100 0" MajorAxisEnd3D="120 100 0" MinorAxisEnd3D="100 110 0"${extra}/>`;
    const { doc } = readCdxml(cdxml(oval('Circle Shadowed', ' LineWidth="1" ShadowSize="300"')));
    const s = [...doc.shapes.values()][0];
    expect(s.shadow).toBe(true);
    const grey = fills(pic(oval('Circle Shadowed', ' LineWidth="1" ShadowSize="300"'))).filter((f) => f.fill === '#c0c0c0');
    expect(grey.length).toBe(1);
    // only the crescent that sticks out: far less than the whole oval (pi * 20 * 10)
    const a = area(grey[0].segs);
    expect(a).toBeGreaterThan(20);
    expect(a).toBeLessThan(200);
    expect(fills(pic(oval('Circle'))).some((f) => f.fill === '#c0c0c0')).toBe(false);
  });
});
