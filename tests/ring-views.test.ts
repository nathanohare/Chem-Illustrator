// @vitest-environment jsdom
//
// One cyclohexane drawn flat, as a chair, as the flipped chair and as a boat, and walked round:
// the molecule the chemistry engine reads, stereocentres and all, never changes.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import type { BondDisplay } from '../src/model';
import { toMolfile } from '../src/chem/molfile';
import { facesOf, stepRing, viewNow, viewRingOf, type RingStep, type ViewRing } from '../src/chem/ring-views';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const canon = (doc: Doc): string => {
  const m = RDKit.get_mol(toMolfile(doc, doc.atoms.keys()).molblock);
  try { return m.get_smiles(); } finally { m.delete(); }
};

/** A flat cyclohexane (corner at the top), with substituents: ring place, how the bond is drawn, element. */
function flat(subs: [number, BondDisplay, number?][]): { doc: Doc; ring: number[] } {
  const doc = new Doc();
  const L = doc.style.bondLength;
  const ring: number[] = [];
  doc.bulk(() => {
    for (let k = 0; k < 6; k++) {
      const t = (-90 + 60 * k) * Math.PI / 180;
      ring.push(doc.addAtom(200 + L * Math.cos(t), 200 + L * Math.sin(t)).id);
    }
    ring.forEach((id, k) => doc.addBond(id, ring[(k + 1) % 6], 1));
    const count = new Map<number, number>();
    for (const [k, display, z] of subs) {
      const n = count.get(k) ?? 0;
      count.set(k, n + 1);
      const t = (-90 + 60 * k + (subs.filter((s) => s[0] === k).length === 2 ? (n ? 30 : -30) : 0)) * Math.PI / 180;
      const a = doc.atoms.get(ring[k])!;
      const s = doc.addAtom(a.x + L * Math.cos(t), a.y + L * Math.sin(t), z ?? 6);
      doc.addBond(ring[k], s.id, 1, display);
    }
  });
  return { doc, ring };
}

const vrOf = (doc: Doc, ring: number[]): ViewRing => {
  const got = viewRingOf(doc, ring);
  if (!('ring' in got)) throw new Error(got.why);
  return got.ring;
};
const step = (doc: Doc, ring: number[], s: RingStep) => { let v = ''; doc.edit('ring', () => { v = stepRing(doc, vrOf(doc, ring), s); }); return v; };

const CASES: [string, [number, BondDisplay, number?][]][] = [
  ['trans-1,2-dimethyl', [[0, 'wedge'], [1, 'hashWedge']]],
  ['cis-1,2-dimethyl', [[0, 'wedge'], [1, 'wedge']]],
  ['cis-1,3-dimethyl', [[0, 'hashWedge'], [2, 'hashWedge']]],
  ['trans-1,4 (no stereocentres)', [[0, 'wedge'], [3, 'hashWedge']]],
  ['menthol-like, three centres', [[0, 'wedge', 8], [1, 'hashWedge'], [4, 'wedge']]],
  ['a quaternary carbon', [[0, 'wedge'], [0, 'hashWedge', 8], [2, 'wedge']]],
];

describe('each shape is the same molecule', () => {
  for (const [name, subs] of CASES) {
    it(name, () => {
      const { doc, ring } = flat(subs);
      const want = canon(doc);
      expect(want).toContain('@');
      for (const s of ['next', 'next', 'next', 'next'] as const) {
        step(doc, ring, s);
        expect(canon(doc), `after ${viewNow(doc, vrOf(doc, ring)).view}`).toBe(want);
      }
      expect(viewNow(doc, vrOf(doc, ring)).view).toBe('flat');
    });
  }
  it('cycles flat, chair, flipped chair, boat and back to flat', () => {
    const { doc, ring } = flat([[0, 'wedge'], [1, 'hashWedge']]);
    expect(['next', 'next', 'next', 'next'].map(() => step(doc, ring, 'next'))).toEqual(['chair', 'chair-flip', 'boat', 'flat']);
  });
});

describe('on a chair', () => {
  it('walks round and back, flips, and never changes the molecule', () => {
    const { doc, ring } = flat([[0, 'wedge', 8], [1, 'hashWedge'], [4, 'wedge']]);
    const want = canon(doc);
    step(doc, ring, 'chair');
    const start = ring.map((id) => ({ ...doc.atoms.get(id)! }));
    // axial or equatorial, for each substituent: a walk turns the picture, not the conformer
    const axial = () => vrOf(doc, ring).subs.map((x) => { const a = doc.atoms.get(x.at)!, b = doc.atoms.get(x.first)!; return Math.abs(b.x - a.x) < 0.2 * Math.abs(b.y - a.y); });
    const conformer = axial();
    expect(conformer).toEqual([false, false, false]);
    for (let i = 0; i < 6; i++) {
      step(doc, ring, 'cw');
      expect(canon(doc)).toBe(want);
      expect(viewNow(doc, vrOf(doc, ring)).view).toBe(i % 2 ? 'chair' : 'chair-flip');
      expect(axial()).toEqual(conformer);
    }
    // six steps round: every atom back where it was
    ring.forEach((id, k) => { expect(doc.atoms.get(id)!.x).toBeCloseTo(start[k].x, 6); expect(doc.atoms.get(id)!.y).toBeCloseTo(start[k].y, 6); });
    step(doc, ring, 'cw');
    const one = ring.map((id) => doc.atoms.get(id)!.x);
    step(doc, ring, 'ccw');
    ring.forEach((id, k) => expect(doc.atoms.get(id)!.x).toBeCloseTo(start[k].x, 6));
    expect(one).not.toEqual(start.map((a) => a.x));
    expect(step(doc, ring, 'flip')).toBe('chair-flip');
    expect(canon(doc)).toBe(want);
    expect(axial()).toEqual([true, true, true]);
    expect(step(doc, ring, 'flip')).toBe('chair');
    expect(canon(doc)).toBe(want);
  });
  it('puts a ring flip\'s axial groups equatorial', () => {
    const { doc, ring } = flat([[0, 'wedge']]);
    // a lone methyl has no face to keep: equatorial in either chair
    step(doc, ring, 'chair');
    const vr = vrOf(doc, ring);
    const me = vr.subs[0].first;
    const upright = () => { const a = doc.atoms.get(ring[0])!, b = doc.atoms.get(me)!; return Math.abs(b.x - a.x) < 0.2 * Math.abs(b.y - a.y); };
    expect(upright()).toBe(false);
    // two on the same face 1,3: one chair has both axial (upright), the flipped one both equatorial
    const t = flat([[0, 'wedge'], [2, 'wedge']]);
    step(t.doc, t.ring, 'chair');
    const axial = (d: Doc, r: number[]) => vrOf(d, r).subs.map((s) => { const a = d.atoms.get(s.at)!, b = d.atoms.get(s.first)!; return Math.abs(b.x - a.x) < 0.2 * Math.abs(b.y - a.y); });
    const one = axial(t.doc, t.ring);
    step(t.doc, t.ring, 'flip');
    const two = axial(t.doc, t.ring);
    expect(one[0]).toBe(one[1]);
    expect(two[0]).toBe(two[1]);
    expect(one[0]).not.toBe(two[0]);
  });
  it('reads the faces back from the drawing alone, after saving and opening', () => {
    const { doc, ring } = flat([[0, 'wedge'], [1, 'hashWedge'], [3, 'wedge']]);
    const want = canon(doc);
    const faces = facesOf(doc, vrOf(doc, ring));
    step(doc, ring, 'chair');
    expect([...facesOf(doc, vrOf(doc, ring)).values()]).toEqual([...faces.values()]);
    const back = readCdxml(writeCdxml(doc)).doc;
    expect(canon(back)).toBe(want);
  });
});

describe('which rings', () => {
  it('needs one ring of single bonds, on its own', () => {
    const benzene = new Doc();
    const ids: number[] = [];
    benzene.bulk(() => {
      for (let k = 0; k < 6; k++) ids.push(benzene.addAtom(100 + 20 * Math.cos(k), 100 + 20 * Math.sin(k)).id);
      ids.forEach((id, k) => benzene.addBond(id, ids[(k + 1) % 6], k % 2 ? 2 : 1));
    });
    expect('why' in viewRingOf(benzene, ids)).toBe(true);
    // decalin: a fused ring keeps its shape
    const { doc, ring } = flat([[0, 'solid'], [1, 'solid']]);
    const subs = vrOf(doc, ring).subs.map((s) => s.first);
    doc.bulk(() => doc.addBond(subs[0], subs[1], 1));
    expect('why' in viewRingOf(doc, ring)).toBe(true);
  });

  it('looks only at the structure picked, so big drawings stay quick', () => {
    // many methylcyclohexanes side by side, as in the desktop self-test's 2,000-molecule drawing
    const doc = new Doc();
    const rings: number[][] = [];
    const L = doc.style.bondLength;
    doc.bulk(() => {
      for (let m = 0; m < 300; m++) {
        const ring: number[] = [];
        for (let k = 0; k < 6; k++) {
          const t = (-90 + 60 * k) * Math.PI / 180;
          ring.push(doc.addAtom(200 + 5 * L * m + L * Math.cos(t), 200 + L * Math.sin(t)).id);
        }
        ring.forEach((id, k) => doc.addBond(id, ring[(k + 1) % 6], 1));
        doc.addBond(ring[0], doc.addAtom(200 + 5 * L * m, 200 - 2 * L).id, 1, 'wedge');
        rings.push(ring);
      }
    });
    const whole = vi.spyOn(doc, 'fragments');
    // one atom picked: its ring, though the drawing holds 300
    const got = viewRingOf(doc, [rings[7][2]]);
    expect('ring' in got && [...got.ring.ring].sort((a, b) => a - b)).toEqual([...rings[7]].sort((a, b) => a - b));
    // a molfile of everything checks every ring without walking the whole drawing each time
    const t0 = performance.now();
    toMolfile(doc, doc.atoms.keys());
    expect(whole).not.toHaveBeenCalled();
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
