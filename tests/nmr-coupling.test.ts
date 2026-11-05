import { describe, expect, it } from 'vitest';
import { multiplet, predictCouplings, protonGroups, type JGraph } from '../src/chem/nmr/coupling';

const C = (h: number, arom = false) => ({ el: 'C', arom, h });

describe('coupling constants and first-order multiplets', () => {
  it('ethyl acetate: CH2 quartet, CH3 triplet, acetyl singlet', () => {
    // C0H3-C1H2-O2-C3(=O4)-C5H3
    const g: JGraph = { atoms: [C(3), C(2), { el: 'O', arom: false, h: 0 }, C(0), { el: 'O', arom: false, h: 0 }, C(3)],
      bonds: [{ u: 0, v: 1, o: 1 }, { u: 1, v: 2, o: 1 }, { u: 2, v: 3, o: 1 }, { u: 3, v: 4, o: 2 }, { u: 3, v: 5, o: 1 }] };
    const gs = protonGroups(g, [1.26, 4.12, NaN, NaN, NaN, 2.05], ['a', 'b', 'c', 'd', 'e', 'f']);
    const by = (a: number) => gs.find((x) => x.atoms.includes(a))!;
    expect(by(1).mult).toBe('q');
    expect(by(0).mult).toBe('t');
    expect(by(1).j[0]).toBeGreaterThan(6);
    expect(by(1).j[0]).toBeLessThan(8);
    expect(by(5).mult).toBe('s');
  });

  it('para-disubstituted benzene: AA\'XX\' protons read as doublets near 8 Hz', () => {
    // ring C0..C5, substituents on C0 (Cl) and C3 (CH3)
    const g: JGraph = { atoms: [C(0, true), C(1, true), C(1, true), C(0, true), C(1, true), C(1, true), { el: 'Cl', arom: false, h: 0 }, C(3)],
      bonds: [0, 1, 2, 3, 4, 5].map((i) => ({ u: i, v: (i + 1) % 6, o: i % 2 ? 1 : 2 })).concat([{ u: 0, v: 6, o: 1 }, { u: 3, v: 7, o: 1 }]) };
    const gs = protonGroups(g, [NaN, 7.25, 7.1, NaN, 7.1, 7.25, NaN, 2.3], ['r0', 'o', 'm', 'r3', 'm', 'o', 'cl', 'me']);
    const o = gs.find((x) => x.atoms.includes(1))!;
    expect(o.mult).toBe('d');
    expect(o.j[0]).toBeCloseTo(7.9, 0);
  });

  it('merges near-equal couplings and drops unresolved ones', () => {
    expect(multiplet([[7.0, 2], [7.4, 1]]).mult).toBe('q');
    expect(multiplet([[8.0, 1], [0.5, 1]]).mult).toBe('d');
    expect(multiplet([[10.5, 1], [17.0, 1]]).mult).toBe('dd');
  });
  it('pyridine: 2,3 ~5 Hz, 3,4 ~8 Hz, 2,4 1.8 Hz, 3,5 1.4 Hz, nothing across the N; pyridinium 2,3 ~6.3 Hz', () => {
    // N0 C1 C2 C3 C4 C5 (ring), all CH
    const ring = (q: number): JGraph => ({ atoms: [{ el: 'N', arom: true, h: q ? 1 : 0, q }, C(1, true), C(1, true), C(1, true), C(1, true), C(1, true)],
      bonds: [0, 1, 2, 3, 4, 5].map((i) => ({ u: i, v: (i + 1) % 6, o: i % 2 ? 1 : 2 })) });
    const J = (g: JGraph, a: number, b: number) => predictCouplings(g).find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))?.j;
    const py = ring(0);
    expect(J(py, 1, 2)).toBeCloseTo(5.0, 1);
    expect(J(py, 2, 3)).toBeCloseTo(7.9, 1);
    expect(J(py, 1, 3)).toBeCloseTo(1.8, 1);
    expect(J(py, 2, 4)).toBeCloseTo(1.4, 1);
    expect(J(py, 1, 5)).toBeUndefined();
    expect(J(ring(1), 1, 2)).toBeCloseTo(6.3, 1);
  });
});
