// A bond drawn from an alkyne carbon carries straight on (issue #269).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { angleOf, DEG } from '../src/geom';
import { sproutDir } from '../src/chem/chemgeom';

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
