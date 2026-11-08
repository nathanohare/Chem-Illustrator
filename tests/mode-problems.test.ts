// The Problems box outside the Canvas: the structure checks run on every drawing in the file, each
// problem listed with where it is, and nothing to check when the file has no structures.
import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { checkDrawings, problemCount } from '../src/ui/mode-problems';

/** A carbon with five carbons on it (one valence problem). */
function fiveBonds(): Doc {
  const d = new Doc();
  d.bulk(() => {
    const c = d.addAtom(0, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i * 2 * Math.PI) / 5;
      d.addBond(c.id, d.addAtom(14.4 * Math.cos(a), 14.4 * Math.sin(a)).id);
    }
  });
  return d;
}

/** Propane (a lone single bond is flagged as ethane-or-a-line, so two). */
function propane(): Doc {
  const d = new Doc();
  d.bulk(() => {
    const a = d.addAtom(0, 0), b = d.addAtom(12.5, -7.2), c = d.addAtom(25, 0);
    d.addBond(a.id, b.id);
    d.addBond(b.id, c.id);
  });
  return d;
}

describe('Problems box outside the Canvas', () => {
  it('finds nothing to check in a file with no structures', () => {
    const got = checkDrawings([{ where: 'Slide 1', doc: new Doc() }]);
    expect(got.structures).toBe(0);
    expect(problemCount(got)).toBe(0);
  });

  it('lists each problem with where it is, and counts clean structures too', () => {
    const got = checkDrawings([{ where: 'Slide 1', doc: propane() }, { where: 'Slide 2', doc: fiveBonds() }]);
    expect(got.structures).toBe(2);
    expect(problemCount(got)).toBe(1);
    expect(got.problems[0].where).toBe('Slide 2');
    expect(got.problems[0].text).toMatch(/carbon has 5/);
  });

  it('checks a drawing again after it changes', () => {
    const d = propane();
    expect(problemCount(checkDrawings([{ where: 'A1', doc: d }]))).toBe(0);
    const five = fiveBonds();
    d.restoreContents(five.contents());
    expect(problemCount(checkDrawings([{ where: 'A1', doc: d }]))).toBe(1);
  });
});
