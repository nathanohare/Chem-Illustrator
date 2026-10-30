// Linear (sp) centres: a bond drawn from an alkyne carbon carries straight on (issue #269), a new
// triple or cumulated double bond goes straight on, and a bond made triple straightens its ends.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { angleOf, DEG } from '../src/geom';
import { sproutDir, sprout, straightenAt, straightenLinear } from '../src/chem/chemgeom';

const L = 14.4;

describe('new bond on an sp carbon', () => {
  it('runs straight on from a triple bond', () => {
    const doc = new Doc();
    let a = 0, b = 0;
    doc.edit('draw', () => {
      a = doc.addAtom(100, 100).id;
      b = doc.addAtom(100 + L * Math.cos(30 * DEG), 100 - L / 2).id;
      doc.addBond(a, b, 3);
    });
    const d = sproutDir(doc, b);
    expect(Math.abs(angleOf(d) - -30 * DEG)).toBeLessThan(1e-9);
  });

  it('still zig-zags off a single or double bond', () => {
    for (const order of [1, 2]) {
      const doc = new Doc();
      let a = 0, b = 0;
      doc.edit('draw', () => {
        a = doc.addAtom(100, 100).id;
        b = doc.addAtom(100 + L, 100).id;
        doc.addBond(a, b, order);
      });
      const turn = Math.abs(angleOf(sproutDir(doc, b))) / DEG;
      expect(turn).toBeCloseTo(60, 6);
    }
  });
});

describe('new triple or cumulated bond off a chain end', () => {
  const chainEnd = (order = 1) => {
    const doc = new Doc();
    let a = 0, b = 0;
    doc.edit('draw', () => {
      a = doc.addAtom(100, 100).id;
      b = doc.addAtom(100 + L * Math.cos(30 * DEG), 100 - L / 2).id;
      doc.addBond(a, b, order);
    });
    return { doc, a, b };
  };

  it('a triple bond carries straight on from the bond before it', () => {
    const { doc, b } = chainEnd();
    expect(Math.abs(angleOf(sproutDir(doc, b, 3)) - -30 * DEG)).toBeLessThan(1e-9);
    let c = 0;
    doc.edit('sprout', () => { c = sprout(doc, b, 3).id; });
    const at = doc.atoms.get(c)!, from = doc.atoms.get(b)!;
    expect(Math.abs(angleOf({ x: at.x - from.x, y: at.y - from.y }) - -30 * DEG)).toBeLessThan(1e-9);
  });

  it("an allene's second double bond carries straight on, but not on sulfur", () => {
    const { doc, b } = chainEnd(2);
    expect(Math.abs(angleOf(sproutDir(doc, b, 2)) - -30 * DEG)).toBeLessThan(1e-9);
    doc.edit('S', () => doc.updateAtom(b, { z: 16 }));
    expect(Math.abs(angleOf(sproutDir(doc, b, 2)) - -30 * DEG)).toBeGreaterThan(1);
  });

  it('a single bond still zig-zags', () => {
    const { doc, b } = chainEnd();
    expect(Math.abs(angleOf(sproutDir(doc, b, 1)) - -30 * DEG)).toBeGreaterThan(1);
  });
});

describe('a bond made triple straightens its ends', () => {
  // isobutyl-type branch C(a)(a2)–b–c drawn zig-zag, then b–c made triple
  const draw = () => {
    const doc = new Doc();
    const ids: number[] = [];
    doc.edit('draw', () => {
      const pts = [[0, 0], [12.47, 7.2], [24.94, 0], [37.41, 7.2]];
      for (const [x, y] of pts) ids.push(doc.addAtom(x, y).id);
      // a branch on the first atom makes that side heavier
      ids.push(doc.addAtom(0, -14.4).id);
      doc.addBond(ids[0], ids[1]);
      doc.addBond(ids[1], ids[2]);
      doc.addBond(ids[2], ids[3]);
      doc.addBond(ids[0], ids[4]);
    });
    return { doc, ids };
  };
  const angleAt = (doc: Doc, p: number, x: number, q: number) => {
    const P = doc.atoms.get(p)!, X = doc.atoms.get(x)!, Q = doc.atoms.get(q)!;
    const u = { x: P.x - X.x, y: P.y - X.y }, v = { x: Q.x - X.x, y: Q.y - X.y };
    return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)))) / DEG;
  };

  it('swings the lighter side round so the sp carbons are at 180°', () => {
    const { doc, ids } = draw();
    const fixed = { ...doc.atoms.get(ids[0])! };
    doc.edit('triple', () => { doc.updateBond(doc.bondBetween(ids[1], ids[2])!.id, { order: 3 }); straightenAt(doc, doc.bondBetween(ids[1], ids[2])!.id); });
    expect(angleAt(doc, ids[0], ids[1], ids[2])).toBeCloseTo(180, 6);
    expect(angleAt(doc, ids[1], ids[2], ids[3])).toBeCloseTo(180, 6);
    // the heavier side (with the branch) stays where it was, and bond lengths are kept
    expect(doc.atoms.get(ids[0])!.x).toBeCloseTo(fixed.x, 9);
    expect(doc.atoms.get(ids[0])!.y).toBeCloseTo(fixed.y, 9);
    const B = doc.atoms.get(ids[2])!, C = doc.atoms.get(ids[3])!;
    expect(Math.hypot(C.x - B.x, C.y - B.y)).toBeCloseTo(Math.hypot(12.47, 7.2), 6);
  });

  it('leaves a ring alone', () => {
    const doc = new Doc();
    const ids: number[] = [];
    doc.edit('ring', () => {
      for (let i = 0; i < 8; i++) ids.push(doc.addAtom(40 * Math.cos(i * Math.PI / 4), 40 * Math.sin(i * Math.PI / 4)).id);
      for (let i = 0; i < 8; i++) doc.addBond(ids[i], ids[(i + 1) % 8], i === 0 ? 3 : 1);
    });
    const before = ids.map((id) => ({ ...doc.atoms.get(id)! }));
    doc.edit('straighten', () => straightenAt(doc, doc.bondBetween(ids[0], ids[1])!.id));
    ids.forEach((id, i) => expect(doc.atoms.get(id)!.x).toBe(before[i].x));
  });

  it('does nothing when turned off', () => {
    const { doc, ids } = draw();
    straightenLinear.on = false;
    try {
      doc.edit('triple', () => { doc.updateBond(doc.bondBetween(ids[1], ids[2])!.id, { order: 3 }); straightenAt(doc, doc.bondBetween(ids[1], ids[2])!.id); });
      expect(angleAt(doc, ids[0], ids[1], ids[2])).toBeLessThan(170);
    } finally { straightenLinear.on = true; }
  });
});
