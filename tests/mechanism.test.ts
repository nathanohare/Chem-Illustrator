// Electron-pushing arrows: where they start and stop, and which way they bend.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { arrowPath, bondMiddle, lonePairDir, pushArrow, symbolSpot } from '../src/chem/mechanism';
import { doubleBondGap } from '../src/style';
import { arcCenter, dist, dot, norm, sub } from '../src/geom';

/** Acetone with hydroxide up and to the left of it. */
function acetone() {
  const doc = new Doc();
  const ids = doc.edit('build', () => {
    const c = doc.addAtom(150, 100), o = doc.addAtom(150, 85.6, 8);
    const co = doc.addBond(c.id, o.id, 2);
    const m1 = doc.addAtom(137.5, 107.2), m2 = doc.addAtom(162.5, 107.2);
    doc.addBond(c.id, m1.id);
    doc.addBond(c.id, m2.id);
    const oh = doc.addAtom(90, 60, 8, { charge: -1 });
    return { c: c.id, o: o.id, co: co.id, oh: oh.id, m2: m2.id };
  });
  return { doc, ...ids };
}

/** Is a point on the arc, between its ends? */
const onArc = (r: { tail: { x: number; y: number }; head: { x: number; y: number }; sweep: number }, p: { x: number; y: number }) => {
  const { center, radius } = arcCenter(r.tail, r.head, r.sweep);
  return Math.abs(dist(p, center) - radius) < 1e-6;
};

describe('electron-pushing arrows', () => {
  it('runs from a lone pair to an atom, stopping clear of both labels', () => {
    const { doc, oh, c } = acetone();
    const m = plainMeasure(doc);
    const r = pushArrow(doc, m, { kind: 'atom', id: oh }, { kind: 'atom', id: c })!;
    const L = doc.style.bondLength;
    const O = doc.atoms.get(oh)!, C = doc.atoms.get(c)!;
    // starts outside the O⁻ label, ends just short of the carbon
    for (const b of m.atomBoxes(O)) expect(r.tail.x < b.x1 || r.tail.x > b.x2 || r.tail.y < b.y1 || r.tail.y > b.y2).toBe(true);
    expect(dist(r.head, C)).toBeGreaterThan(0.15 * L);
    expect(dist(r.head, C)).toBeLessThan(0.5 * L);
    expect(Math.abs(r.sweep)).toBeGreaterThan(0);
    expect(onArc(r, r.head)).toBe(true);
  });

  it('points a lone pair into open space, away from the bonds', () => {
    const { doc, o, oh } = acetone();
    // the carbonyl O's only bond points down, so its lone pairs point up-ish
    expect(lonePairDir(doc, o, doc.atoms.get(oh)!).y).toBeLessThan(0);
  });

  it('curls a bond\'s electrons onto its own atom in a small loop', () => {
    const { doc, co, o } = acetone();
    const L = doc.style.bondLength;
    const r = pushArrow(doc, plainMeasure(doc), { kind: 'bond', id: co }, { kind: 'atom', id: o })!;
    expect(r.small).toBe(true);
    expect(Math.abs(r.sweep)).toBeGreaterThan(Math.PI * 0.75);
    // from the middle of the π bond as drawn (a C=O to an end atom is drawn centred), to beside the O
    expect(dist(r.tail, { x: 150, y: (100 + 85.6) / 2 })).toBeLessThan(1e-6);
    expect(dist(r.head, doc.atoms.get(o)!)).toBeGreaterThan(0.2 * L);
  });

  it('starts a π bond\'s arrow half way between its two lines when the second line is drawn to one side', () => {
    // cyclohexene: the second line of the C=C is inside the ring
    const doc = new Doc();
    const L = doc.style.bondLength;
    const ids = doc.edit('build', () => Array.from({ length: 6 }, (_, k) => doc.addAtom(150 + L * Math.cos(k * Math.PI / 3), 100 + L * Math.sin(k * Math.PI / 3)).id));
    const cc = doc.edit('bonds', () => { let d = 0; for (let k = 0; k < 6; k++) { const b = doc.addBond(ids[k], ids[(k + 1) % 6], k === 0 ? 2 : 1); if (!k) d = b.id; } return d; });
    const e = doc.edit('E+', () => doc.addAtom(150 + 3 * L, 100, 35, { charge: 1 }).id);
    const m = plainMeasure(doc);
    const mid = bondMiddle(doc, m, cc);
    const plain = { x: (doc.atoms.get(ids[0])!.x + doc.atoms.get(ids[1])!.x) / 2, y: (doc.atoms.get(ids[0])!.y + doc.atoms.get(ids[1])!.y) / 2 };
    // half a line spacing in towards the ring's middle
    expect(dist(mid, plain)).toBeCloseTo(doubleBondGap(doc.style) / 2, 6);
    expect(dist(mid, { x: 150, y: 100 })).toBeLessThan(dist(plain, { x: 150, y: 100 }));
    const r = pushArrow(doc, m, { kind: 'bond', id: cc }, { kind: 'atom', id: e })!;
    expect(dist(r.tail, mid)).toBeLessThan(1e-6);
  });

  it('sets an arrow off straight from its lone pair and brings its head in clear of the bonds (methoxide onto acetone)', () => {
    const { doc, c, oh } = acetone();
    const m = plainMeasure(doc);
    const r = pushArrow(doc, m, { kind: 'atom', id: oh }, { kind: 'atom', id: c })!;
    const pts = arrowPath(r, 40);
    // leaves within 45° of straight out from the O
    const out = norm(sub(r.tail, doc.atoms.get(oh)!)), first = norm(sub(pts[1], pts[0]));
    expect(Math.acos(Math.min(1, out.x * first.x + out.y * first.y))).toBeLessThan(45 * Math.PI / 180);
    // the head comes in on the carbon through open space, not along one of its three bonds
    const d = norm(sub(r.head, doc.atoms.get(c)!));
    for (const n of doc.neighbors(c)) {
      const b = norm(sub(n, doc.atoms.get(c)!));
      expect(d.x * b.x + d.y * b.y).toBeLessThan(Math.cos(40 * Math.PI / 180));
    }
  });

  it('bends into the open angle between two bonds of one atom (an elimination)', () => {
    const doc = new Doc();
    const { ch, cc, c } = doc.edit('build', () => {
      const c = doc.addAtom(0, 0), c2 = doc.addAtom(-12.5, -7.2), h = doc.addAtom(12.5, -7.2, 1);
      return { cc: doc.addBond(c.id, c2.id).id, ch: doc.addBond(c.id, h.id).id, c: c.id };
    });
    const r = pushArrow(doc, plainMeasure(doc), { kind: 'bond', id: ch }, { kind: 'bond', id: cc })!;
    const { center } = arcCenter(r.tail, r.head, r.sweep);
    const mid = { x: (r.tail.x + r.head.x) / 2, y: (r.tail.y + r.head.y) / 2 };
    const bulge = sub(mid, center);
    // the arc bulges up, away from the shared carbon below
    expect(dot(bulge, sub(doc.atoms.get(c)!, mid))).toBeLessThan(0);
  });

  it('bends the way it is asked to', () => {
    const { doc, oh, c } = acetone();
    const m = plainMeasure(doc);
    const a = pushArrow(doc, m, { kind: 'atom', id: oh }, { kind: 'atom', id: c }, 1)!;
    const b = pushArrow(doc, m, { kind: 'atom', id: oh }, { kind: 'atom', id: c }, -1)!;
    expect(Math.sign(a.sweep)).not.toBe(Math.sign(b.sweep));
  });

  it('puts lone pairs and charges in the open space round an atom, one after another', () => {
    const { doc, o, m2 } = acetone();
    const m = plainMeasure(doc);
    const first = symbolSpot(doc, m, o, [], 2.6);
    // the C=O bond points down, so the first goes straight up, clear of the O
    expect(first.dir.y).toBeCloseTo(-1, 6);
    for (const b of m.atomBoxes(doc.atoms.get(o)!)) expect(first.at.y).toBeLessThan(b.y1);
    const second = symbolSpot(doc, m, o, [first.at], 2.6);
    expect(Math.abs(second.dir.x)).toBeGreaterThan(0.9);
    // on an end carbon, off to the side of its bond rather than straight on from it
    const end = symbolSpot(doc, m, m2, [], 1.4);
    const along = sub(doc.atoms.get(m2)!, { x: 150, y: 100 });
    const cos = dot(end.dir, along) / Math.hypot(along.x, along.y);
    expect(cos).toBeLessThan(0.9);
    expect(cos).toBeGreaterThan(-0.5);
  });
});
