// @vitest-environment jsdom
//
// Bond types brought up to ChemDraw: the crossed double bond's joins and label gap, hollow and
// wavy wedges, hydrogen and ionic bonds, a double bond's second-line style, and variable
// attachment points.

import { describe, it, expect } from 'vitest';
import { Doc, outsideValence, isWedge } from '../src/model';
import { stereoSense, stereoAnchor } from '../src/chem/stereo';
import { recordPicture } from '../src/render/picture';
import type { Item, Seg } from '../src/render/vector';

const strokes = (items: Item[]) => items.filter((i) => i.kind === 'path' && i.stroke) as { segs: Seg[] }[];
const fills = (items: Item[]) => items.filter((i) => i.kind === 'path' && i.fill && i.segs.length) as { segs: Seg[] }[];
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
/** Run f inside an edit (the document's changes must be). */
function ed<T>(doc: Doc, f: () => T): T { let r!: T; doc.edit('t', () => { r = f(); }); return r; }
const near = (x: number, y: number, p: { x: number; y: number }, d = 0.05) => Math.hypot(x - p.x, y - p.y) < d;

/** Acetone imine's skeleton: C2 with two methyls and a double bond up to N. */
function imine(nLabel: boolean): { doc: Doc; c: number; bond: number; me1: number; me2: number } {
  const doc = new Doc();
  const L = doc.style.bondLength;
  let out = { doc, c: 0, bond: 0, me1: 0, me2: 0 };
  doc.edit('t', () => {
    const c = doc.addAtom(100, 100);
    const n = doc.addAtom(100, 100 - L, nLabel ? 7 : 6);
    const m1 = doc.addAtom(100 - L * Math.cos(Math.PI / 6), 100 + L / 2);
    const m2 = doc.addAtom(100 + L * Math.cos(Math.PI / 6), 100 + L / 2);
    const bond = doc.addBond(c.id, n.id, 2, 'wavy').id;
    doc.addBond(c.id, m1.id); doc.addBond(c.id, m2.id);
    out = { doc, c: c.id, bond, me1: m1.id, me2: m2.id };
  });
  return out;
}

describe('crossed (either) double bond', () => {
  it('carries each line in to meet the bond beside it at a bare carbon', () => {
    const { doc, c, me1, me2 } = imine(true);
    const pc = doc.atoms.get(c)!, a1 = doc.atoms.get(me1)!, a2 = doc.atoms.get(me2)!;
    const ls = lines(recordPicture(doc)!.items);
    // a line end on each methyl bond, off the carbon (no gap where they meet)
    const onBond = (q: { x: number; y: number }) => ls.some(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]].some(([x, y]) => {
      const t = ((x - pc.x) * (q.x - pc.x) + (y - pc.y) * (q.y - pc.y)) / ((q.x - pc.x) ** 2 + (q.y - pc.y) ** 2);
      const px = pc.x + (q.x - pc.x) * t, py = pc.y + (q.y - pc.y) * t;
      return t > 0.01 && t < 0.3 && Math.hypot(px - x, py - y) < 0.05;
    }));
    expect(onBond(a1)).toBe(true);
    expect(onBond(a2)).toBe(true);
  });

  it('keeps both lines clear of the N label', () => {
    const { doc, bond } = imine(true);
    const b = doc.bonds.get(bond)!, n = doc.atoms.get(b.a2)!;
    // the two crossed lines (the methyls go down from the carbon)
    const ls = lines(recordPicture(doc)!.items).filter(([x1, y1, x2, y2]) => Math.min(y1, y2) < 95 && Math.hypot(x2 - x1, y2 - y1) > 1);
    expect(ls.length).toBe(2);
    // neither line gets nearer the N than the plain bond's end does
    const top = Math.min(...ls.flatMap(([, y1, , y2]) => [y1, y2]));
    expect(top).toBeGreaterThan(n.y + doc.style.labelSize * 0.35);
  });
});

describe('new bond styles', () => {
  it('reads hollow wedges as wedges and wavy wedges as unknown, both from a1', () => {
    const doc = new Doc();
    const [a, h] = ed(doc, () => { const a = doc.addAtom(0, 0), b = doc.addAtom(14, 0); return [a, doc.addBond(a.id, b.id, 1, 'hollowWedge')] as const; });
    expect(stereoSense(h)).toBe('up');
    expect(stereoAnchor(doc, h)).toBe(a.id);
    expect(stereoSense({ ...h, display: 'wavyWedge' })).toBe('either');
    expect(isWedge('hollowWedge') && isWedge('wavyWedge') && !isWedge('wavy')).toBe(true);
  });

  it('leaves hydrogen and ionic bonds out of valence', () => {
    expect(outsideValence({ order: 1, display: 'hydrogen' })).toBe(true);
    expect(outsideValence({ order: 1, display: 'ionic' })).toBe(true);
    expect(outsideValence({ order: 1, display: 'dash' })).toBe(false);
  });

  it('draws a hydrogen bond as dots and a hollow wedge as an outline', () => {
    const doc = new Doc();
    const c = ed(doc, () => {
      const a = doc.addAtom(0, 0), b = doc.addAtom(30, 0), c = doc.addAtom(0, 40), d = doc.addAtom(30, 40);
      doc.addBond(a.id, b.id, 1, 'hydrogen');
      doc.addBond(c.id, d.id, 1, 'hollowWedge');
      return c;
    });
    const items = recordPicture(doc)!.items;
    // the dots: one filled path of many closed circles along y = 0
    const dots = fills(items).flatMap((f) => f.segs.filter((s) => s.k === 'M')).filter((s) => Math.abs(s.y) < 1);
    expect(dots.length).toBeGreaterThan(4);
    // the outline: closed and stroked, a line width across at c as ChemDraw 25 draws it
    const tri = lines(items).filter(([x1, y1]) => y1 > 30 || x1 > 100);
    expect(tri.some(([x1, y1]) => Math.hypot(x1 - c.x, y1 - c.y) <= doc.style.lineWidth / 2 + 1e-6)).toBe(true);
  });

  it('draws a hashed second line as strokes across it', () => {
    const doc = new Doc();
    const bond = ed(doc, () => { const a = doc.addAtom(0, 0), b = doc.addAtom(14.4, 0); return doc.addBond(a.id, b.id, 2, 'solid'); });
    const plain = lines(recordPicture(doc)!.items).length;
    ed(doc, () => doc.updateBond(bond.id, { line2: 'hash' }));
    const hashed = lines(recordPicture(doc)!.items);
    expect(hashed.length).toBeGreaterThan(plain + 2);
    // the extra strokes run across the bond (straight up and down)
    expect(hashed.filter(([x1, , x2]) => Math.abs(x1 - x2) < 1e-6).length).toBeGreaterThan(2);
  });
});

describe('variable attachment', () => {
  function toluene(): { doc: Doc; ring: number[] } {
    const doc = new Doc();
    const L = doc.style.bondLength;
    let ring: number[] = [];
    doc.edit('t', () => {
      ring = [...Array(6)].map((_, i) => doc.addAtom(100 + L * Math.cos((i * Math.PI) / 3), 100 + L * Math.sin((i * Math.PI) / 3)).id);
      ring.forEach((id, i) => doc.addBond(id, ring[(i + 1) % 6], i % 2 ? 1 : 2));
    });
    return { doc, ring };
  }

  it('sits in the middle of its ring whichever atoms it stands for, and follows the ring', () => {
    const { doc, ring } = toluene();
    const v = ed(doc, () => doc.addAtom(100, 100, 0, { multi: ring.slice(1, 4), ringOf: ring.slice(), variable: true }));
    expect(near(v.x, v.y, { x: 100, y: 100 })).toBe(true);
    ed(doc, () => doc.moveAtoms(ring, 10, 5));
    const now = doc.atoms.get(v.id)!;
    expect(near(now.x, now.y, { x: 110, y: 105 })).toBe(true);
  });

  it('gives up an atom that is deleted, and goes when fewer than two are left', () => {
    const { doc, ring } = toluene();
    const v = ed(doc, () => doc.addAtom(0, 0, 0, { multi: ring.slice(0, 3), ringOf: ring.slice(), variable: true }));
    ed(doc, () => doc.removeAtom(ring[0]));
    expect(doc.atoms.get(v.id)!.multi).toEqual(ring.slice(1, 3));
    expect(doc.atoms.get(v.id)!.ringOf).toEqual(ring.slice(1));
    ed(doc, () => doc.removeAtom(ring[1]));
    expect(doc.atoms.has(v.id)).toBe(false);
  });

  it('does not draw its ring delocalized, as a hapto ring on a metal is', () => {
    const { doc, ring } = toluene();
    ed(doc, () => {
      const cl = doc.addAtom(150, 100, 17);
      const v = doc.addAtom(0, 0, 0, { multi: ring.slice(), ringOf: ring.slice(), variable: true });
      doc.addBond(cl.id, v.id);
    });
    const items = recordPicture(doc)!.items;
    // the ring's three inner double-bond lines are still drawn, and no arcs
    expect(strokes(items).flatMap((p) => p.segs).some((s) => s.k === 'A' || s.k === 'C')).toBe(false);
  });
});
