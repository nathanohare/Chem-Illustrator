// @vitest-environment jsdom
//
// Symbols and labels brought up to ChemDraw: label alignment (Auto, Left, Center, Right, with
// ChemDraw's Above and Below as one Center choice), and ring-fusion H dots and dashes.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { labelAlignment, labelAlignPatch } from '../src/chem/label-align';
import { recordPicture } from '../src/render/picture';
import type { Item, Seg } from '../src/render/vector';

function ed<T>(doc: Doc, f: () => T): T { let r!: T; doc.edit('t', () => { r = f(); }); return r; }

describe('label alignment', () => {
  it('reads Left as a label running right (OMe) and Right as one running left (MeO)', () => {
    const doc = new Doc();
    const a = ed(doc, () => doc.addAtom(0, 0, 8, { label: 'OMe' }));
    expect(labelAlignment(a)).toBe('auto');
    expect(labelAlignPatch(doc, a, 'left')).toMatchObject({ just: 'right' });
    expect(labelAlignPatch(doc, a, 'right')).toMatchObject({ just: 'left' });
    expect(labelAlignment({ ...a, just: 'right' })).toBe('left');
    expect(labelAlignment({ ...a, just: 'left' })).toBe('right');
  });

  it('stacks a centered label away from its bonds: below an N whose ring is above it', () => {
    const doc = new Doc();
    const [n, up] = ed(doc, () => {
      const n = doc.addAtom(0, 0, 7, { label: 'NMe' });
      const c1 = doc.addAtom(-12, -8), c2 = doc.addAtom(12, -8);
      doc.addBond(n.id, c1.id); doc.addBond(n.id, c2.id);
      const m = doc.addAtom(50, 0, 7, { label: 'NMe' });
      const c3 = doc.addAtom(38, 8);
      doc.addBond(m.id, c3.id);
      return [n, m];
    });
    expect(labelAlignPatch(doc, n, 'center')).toMatchObject({ stacked: 'down', centred: true });
    expect(labelAlignPatch(doc, up, 'center')).toMatchObject({ stacked: 'up', centred: true });
    expect(labelAlignment({ ...n, stacked: 'down' })).toBe('center');
    // Auto takes the stacking and centering off again
    expect(labelAlignPatch(doc, n, 'auto')).toEqual({ just: 'auto', centred: undefined, stacked: undefined });
  });
});

describe('ring-fusion H', () => {
  // a round path (arcs are recorded as curves) right round the atom
  const arcsAt = (items: Item[], x: number, y: number, fill: boolean) => items.filter((i) => {
    if (i.kind !== 'path' || !(fill ? i.fill : i.stroke)) return false;
    const segs = i.segs as Seg[];
    const curves = segs.filter((s) => s.k === 'C') as { x: number; y: number }[];
    return curves.length >= 3 && curves.every((c) => Math.hypot(c.x - x, c.y - y) < 4);
  }).length;

  it('draws an H-Dot as a filled dot on the atom and an H-Dash as two short bars under it, as ChemDraw 25 does', () => {
    const doc = new Doc();
    const [a, b] = ed(doc, () => {
      const a = doc.addAtom(0, 0, 6, { hDot: 'dot' }), b = doc.addAtom(30, 0, 6, { hDot: 'dash' });
      doc.addBond(a.id, doc.addAtom(0, 14.4).id); doc.addBond(b.id, doc.addAtom(30, 14.4).id);
      return [a, b];
    });
    const items = recordPicture(doc)!.items;
    expect(arcsAt(items, a.x, a.y, true)).toBeGreaterThan(0);
    expect(arcsAt(items, b.x, b.y, true)).toBe(0);
  });
});

describe('lone pair as a bar', () => {
  it('draws a LonePairBar as one line through its ends and a little past them, as ChemDraw 25 does', () => {
    const doc = new Doc();
    ed(doc, () => doc.addShape({ kind: 'symbol', symbol: 'LonePairBar', x1: 10, y1: 10, x2: 14, y2: 10 }));
    const items = recordPicture(doc)!.items;
    const segs = items.filter((i) => i.kind === 'path' && i.stroke).flatMap((i) => (i as { segs: Seg[] }).segs);
    expect(segs.some((s) => s.k === 'M' && Math.abs(s.x - (12 - 26 / 9)) < 1e-6 && Math.abs(s.y - 10) < 1e-6)).toBe(true);
    expect(segs.some((s) => s.k === 'L' && Math.abs(s.x - (12 + 26 / 9)) < 1e-6)).toBe(true);
  });
});
