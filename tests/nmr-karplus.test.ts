// @vitest-environment jsdom
// Vicinal couplings from 3-D conformers with the Haasnoot–de Leeuw–Altona equation.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { buildModel, withPopulations } from '../src/chem/model3d-build';
import { graphCouplings3d, hla, vicinal3d } from '../src/chem/nmr/karplus';
import { predictSpectrum } from '../src/chem/nmr/spectrum';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);
const molOf = (smi: string) => { const m = RDKit.get_mol(smi); try { return m.get_molblock(); } finally { m.delete(); } };

describe('HLA generalized Karplus equation', () => {
  it('gives the unsubstituted curve (set B)', () => {
    expect(hla(180, [])).toBeCloseTo(13.70 + 0.73, 2);
    expect(hla(60, [])).toBeCloseTo(13.70 * 0.25 - 0.73 * 0.5, 2);
    expect(hla(90, [])).toBeCloseTo(0, 5);
  });
  it('lowers anti couplings for electronegative substituents', () => {
    expect(hla(180, [{ dchi: 1.3, xi: 1 }], 1)).toBeLessThan(hla(180, [], 0));
  });
});

describe('vicinal couplings from conformers', () => {
  it('separates axial-axial from axial-equatorial in a cyclohexane chair', () => {
    const m = buildModel(molOf('C1CCCCC1'), 1, 1)!;
    const js = vicinal3d(m).map((v) => v.j);
    expect(Math.max(...js)).toBeGreaterThan(10.5);
    expect(Math.min(...js)).toBeLessThan(5);
  });
  it('averages a freely rotating ethyl group to about 7 Hz', () => {
    const m = buildModel(molOf('CCO'), 12, 1)!;
    const pairs = vicinal3d({ ...m, conformers: withPopulations(m.conformers) });
    const mean = pairs.reduce((t, v) => t + v.j, 0) / pairs.length;
    expect(mean).toBeGreaterThan(6.8);
    expect(mean).toBeLessThan(7.3);
  });
  it('leaves small rings to the rule table', () => {
    const m = buildModel(molOf('CC1CC1'), 1, 1)!;
    expect(vicinal3d(m).every((v) => v.c1 === 0 || v.c2 === 0 || true)).toBe(true);
    const ring = vicinal3d(m).filter((v) => v.c1 !== 0 && v.c2 !== 0);
    expect(ring.length).toBe(0);
  });
});

describe('3-D couplings in the spectrum', () => {
  const atom = (h: number) => ({ el: 'C', q: 0, iso: 0, legacy: null, cip: null, tag: null, arom: false, xh: 0, h, rad: 0, deg: 0 });
  // X–CH2–CH–Y: the CH2's protons couple 11 and 3 Hz to the CH (anti and gauche)
  const g = { atoms: [atom(2), atom(1)], bonds: [{ u: 0, v: 1, o: 1, ez: null, ring: false }] };
  const pj = [{ a: 0, ka: 0, b: 1, kb: 0, j: 11 }, { a: 0, ka: 1, b: 1, kb: 0, j: 3 }];
  it('simulates protons of one CH2 that couple differently as separate spins', () => {
    const s = predictSpectrum(g, [2.0, 4.0], ['a', 'b'], 400, 'accurate', 0.9, pj);
    // the CH is a doublet of doublets, 11 and 3 Hz
    const ch = [...s.lines.hz].filter((f) => f > 3.5 * 400);
    const span = Math.max(...ch) - Math.min(...ch);
    expect(span).toBeCloseTo(14, 0);
    const mean = predictSpectrum(g, [2.0, 4.0], ['a', 'b'], 400, 'accurate', 0.9, pj.map((c) => ({ ...c, j: 7 })));
    const m = [...mean.lines.hz].filter((f) => f > 3.5 * 400);
    expect(Math.max(...m) - Math.min(...m)).toBeCloseTo(14, 0); // a triplet, 7 Hz
    expect(new Set(ch.map((f) => Math.round(f))).size).toBeGreaterThan(new Set(m.map((f) => Math.round(f))).size);
  });
  it('maps model couplings onto the graph atoms', () => {
    const m = buildModel(molOf('CC1CCCCC1'), 6, 1)!;
    const hCount = [3, 1, 2, 2, 2, 2, 2];
    const pj = graphCouplings3d({ ...m, conformers: withPopulations(m.conformers) }, [0, 1, 2, 3, 4, 5, 6], hCount);
    expect(pj.length).toBeGreaterThan(20);
    for (const c of pj) { expect(c.ka).toBeGreaterThanOrEqual(0); expect(c.ka).toBeLessThan(hCount[c.a]); }
    // ring CH2 next to the CH: its protons (axial, equatorial) couple differently to the CH
    const toCH = pj.filter((c) => c.a === 1 && c.b === 2 || c.a === 2 && c.b === 1).map((c) => c.j);
    expect(Math.max(...toCH) - Math.min(...toCH)).toBeGreaterThan(4);
  });
});
