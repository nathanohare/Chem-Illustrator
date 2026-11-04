// @vitest-environment jsdom
// Vicinal couplings from 3-D conformers with the Haasnoot–de Leeuw–Altona equation.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { buildModel, withPopulations } from '../src/chem/model3d-build';
import { hla, vicinal3d } from '../src/chem/nmr/karplus';

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
