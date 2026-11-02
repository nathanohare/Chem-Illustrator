// @vitest-environment jsdom
//
// Clean Up Reaction on a whole scheme: every arrow on one line with the structures centred on it,
// evenly spaced, the arrows all the same length (their conditions centred on them), and a scheme
// wrapped onto a second row keeping its rows.

import { afterEach, describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure, schemeItems } from '../src/chem/reaction';
import { applySchemePlan, DEFAULT_SCHEME_PREFS, planCleanUp, setSchemePrefs, spacing } from '../src/chem/scheme-layout';

afterEach(() => setSchemePrefs(DEFAULT_SCHEME_PREFS));

/** A short chain of `n` atoms starting at x, y (a structure a few bonds wide). */
function chain(doc: Doc, x: number, y: number, n = 2, rise = 0): number[] {
  const L = doc.style.bondLength;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(doc.addAtom(x + i * L * 0.87, y + (i % 2 ? rise : 0), 6).id);
  for (let i = 1; i < n; i++) doc.addBond(ids[i - 1], ids[i], 1);
  return ids;
}
const arrow = (doc: Doc, x1: number, x2: number, y: number) => doc.addArrow({ tail: { x: x1, y }, head: { x: x2, y }, sweep: 0, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5 }).id;
const caption = (doc: Doc, text: string, x: number, y: number) => doc.addCaption({ x, y, runs: [{ text }], justify: 'left' }).id;

function boxes(doc: Doc) {
  const m = plainMeasure(doc);
  const items = schemeItems(doc, m);
  return {
    of: (atoms: number[]) => items.find((it) => it.atoms.includes(atoms[0]))!.box,
    cap: (id: number) => items.find((it) => it.caption === id)!.box,
  };
}
const midY = (b: { y1: number; y2: number }) => (b.y1 + b.y2) / 2;

/** A → B → C → D drawn roughly: wobbling up and down, gaps uneven, conditions of different widths. */
function threeSteps() {
  const doc = new Doc();
  const L = doc.style.bondLength;
  const ids = doc.edit('build', () => {
    const a = chain(doc, 0, 0, 3, -L / 2);
    const r1 = arrow(doc, 2.4 * L, 4.2 * L, 4);
    const t1 = caption(doc, 'NaBH4', 2.6 * L, -8);
    const b = chain(doc, 5 * L, 9, 2);
    const r2 = arrow(doc, 6.6 * L, 15 * L, -6);
    const t2 = caption(doc, 'Pd(PPh3)4, K2CO3', 6.8 * L, -18);
    const c = chain(doc, 16 * L, -3, 4, L / 2);
    const r3 = arrow(doc, 19.5 * L, 21 * L, 10);
    const d = chain(doc, 22 * L, 2, 2);
    return { a, r1, t1, b, r2, t2, c, r3, d };
  });
  return { doc, L, ...ids };
}

describe('Clean Up Reaction on a scheme', () => {
  it('puts every arrow on one line, centres the structures on it and spaces them evenly', () => {
    const { doc, L, a, r1, b, r2, c, r3, d } = threeSteps();
    const m = plainMeasure(doc);
    applySchemePlan(doc, m, planCleanUp(doc, m)!);
    const bx = boxes(doc);
    const line = doc.arrows.get(r1)!.tail.y;
    for (const r of [r1, r2, r3]) { expect(doc.arrows.get(r)!.tail.y).toBeCloseTo(line, 5); expect(doc.arrows.get(r)!.head.y).toBeCloseTo(line, 5); }
    for (const s of [a, b, c, d]) expect(midY(bx.of(s))).toBeCloseTo(line, 5);
    // the same gap between every arrow end and its structure
    const g = spacing(L).gap;
    const pairs: [number[], number, number[]][] = [[a, r1, b], [b, r2, c], [c, r3, d]];
    for (const [from, r, to] of pairs) {
      expect(doc.arrows.get(r)!.tail.x - bx.of(from).x2).toBeCloseTo(g, 5);
      expect(bx.of(to).x1 - doc.arrows.get(r)!.head.x).toBeCloseTo(g, 5);
    }
  });

  it('makes the arrows the same length, the longest one\'s, with their conditions centred on them', () => {
    const { doc, r1, t1, r2, t2, r3 } = threeSteps();
    const m = plainMeasure(doc);
    applySchemePlan(doc, m, planCleanUp(doc, m)!);
    const len = (r: number) => doc.arrows.get(r)!.head.x - doc.arrows.get(r)!.tail.x;
    expect(len(r1)).toBeCloseTo(len(r2), 5);
    expect(len(r3)).toBeCloseTo(len(r2), 5);
    // the long conditions fit their arrow
    const bx = boxes(doc);
    expect(len(r2)).toBeGreaterThan(bx.cap(t2).x2 - bx.cap(t2).x1);
    // the short ones moved along with theirs, and sit in the middle of it (the head is left out)
    const mid = (r: number) => { const a = doc.arrows.get(r)!; return (a.tail.x + a.head.x - a.headLength) / 2; };
    expect((bx.cap(t1).x1 + bx.cap(t1).x2) / 2).toBeCloseTo(mid(r1), 5);
    expect((bx.cap(t2).x1 + bx.cap(t2).x2) / 2).toBeCloseTo(mid(r2), 5);
    // and once tidy, it stays tidy
    expect(planCleanUp(doc, m)).toBeNull();
  });

  it('keeps each arrow its own length when the setting is off', () => {
    setSchemePrefs({ sameLength: false });
    const { doc, r1, r2 } = threeSteps();
    const m = plainMeasure(doc);
    applySchemePlan(doc, m, planCleanUp(doc, m)!);
    const len = (r: number) => doc.arrows.get(r)!.head.x - doc.arrows.get(r)!.tail.x;
    expect(len(r2)).toBeGreaterThan(len(r1) + 10);
  });

  it('keeps a scheme wrapped onto a second row in two rows, the second starting under the first', () => {
    const doc = new Doc();
    const L = doc.style.bondLength;
    const ids = doc.edit('build', () => {
      const a = chain(doc, 100, 100, 2);
      const r1 = arrow(doc, 100 + 1.6 * L, 100 + 4 * L, 103);
      const b = chain(doc, 100 + 4.6 * L, 96, 2);
      // the second row: its arrow goes on from b, at the end of the row above
      const r2 = arrow(doc, 100, 100 + 2.5 * L, 100 + 4 * L);
      const c = chain(doc, 100 + 3.1 * L, 100 + 4 * L + 5, 2);
      return { a, r1, b, r2, c };
    });
    const m = plainMeasure(doc);
    const plan = planCleanUp(doc, m)!;
    expect(plan).not.toBeNull();
    applySchemePlan(doc, m, plan);
    const bx = boxes(doc);
    const row1 = doc.arrows.get(ids.r1)!.tail.y, row2 = doc.arrows.get(ids.r2)!.tail.y;
    // two rows still, each tidy on its own line
    expect(row2 - row1).toBeGreaterThan(3 * L);
    expect(midY(bx.of(ids.b))).toBeCloseTo(row1, 5);
    expect(midY(bx.of(ids.c))).toBeCloseTo(row2, 5);
    // the second row starts where the first does
    expect(doc.arrows.get(ids.r2)!.tail.x).toBeCloseTo(bx.of(ids.a).x1, 5);
    // and its arrow matches the first row's
    const len = (r: number) => doc.arrows.get(r)!.head.x - doc.arrows.get(r)!.tail.x;
    expect(len(ids.r2)).toBeCloseTo(len(ids.r1), 5);
    expect(doc.arrows.get(ids.r2)!.step?.reactants).toEqual(['a' + ids.b[0]]);
    // pressed again, nothing changes
    expect(planCleanUp(doc, m)).toBeNull();
  });
});
