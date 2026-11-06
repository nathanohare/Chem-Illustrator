import { describe, expect, it } from 'vitest';
import { Molecule, Resources } from 'openchemlib';
import { buildModel, searchModel } from '../src/chem/model3d-build';
import { finiteEnergies, mergeConformers, withPopulations } from '../src/chem/conformer-rank';

const xyz = (x: number) => [x, 0, 0, x + 1.5, 0, 0];

describe('conformers with a NaN force-field energy', () => {
  it('drops them so the others still get populations', () => {
    const out = withPopulations([{ xyz: xyz(0), energy: 1 }, { xyz: xyz(1), energy: Number.NaN }, { xyz: xyz(2), energy: 1 }]);
    expect(out).toHaveLength(2);
    for (const c of out) expect(c.population).toBeCloseTo(0.5, 9);
  });

  it('treats every energy as missing when none is finite', () => {
    const out = finiteEnergies([{ xyz: xyz(0), energy: Number.NaN }, { xyz: xyz(1), energy: Infinity }]);
    expect(out.map((c) => c.energy)).toEqual([null, null]);
    expect(withPopulations(out).every((c) => c.population === undefined)).toBe(true);
  });

  it('leaves out NaN extras when merging a torsion scan', () => {
    const atoms = [{ z: 6 }, { z: 6 }];
    const out = mergeConformers(atoms, [{ xyz: xyz(0), energy: 0 }], [{ xyz: [0, 0, 0, 0, 1.5, 0], energy: Number.NaN }]);
    expect(out).toHaveLength(1);
    expect(out[0].population).toBe(1);
  });

  it('gives bicyclo[1.1.1]pentane conformers real populations', () => {
    // OpenChemLib's MMFF94s+ returns NaN for one of its starting conformers (seed 1)
    Resources.registerFromNodejs();
    const m = buildModel(Molecule.fromSmiles('C1C2CC1C2').toMolfile(), 8, 1);
    expect(m!.conformers.length).toBeGreaterThan(0);
    for (const c of m!.conformers) {
      expect(Number.isFinite(c.energy)).toBe(true);
      expect(Number.isFinite(c.population)).toBe(true);
    }
  }, 30000);
});

describe('salts with a lone counterion', () => {
  it('builds triethylammonium chloride with the ion kept in molfile order', () => {
    Resources.registerFromNodejs();
    const mol = Molecule.fromSmiles('[Cl-].CC[NH+](CC)CC');
    const m = buildModel(mol.toMolfile(), 8, 1);
    expect(m).not.toBeNull();
    expect(m!.atoms[0]).toEqual({ z: 17, charge: -1 });
    expect(m!.atoms.slice(1, 8).map((a) => a.z)).toEqual([6, 6, 7, 6, 6, 6, 6]);
    expect(m!.atoms[3].charge).toBe(1);
    expect(m!.bonds.some((b) => b.a === 0 || b.b === 0)).toBe(false);
    expect(m!.conformers.length).toBeGreaterThan(0);
    for (const c of m!.conformers) {
      expect(c.xyz).toHaveLength(3 * m!.atoms.length);
      // the chloride sits near the nitrogen, not on top of anything
      const d = (i: number, j: number) => Math.hypot(c.xyz[3 * i] - c.xyz[3 * j], c.xyz[3 * i + 1] - c.xyz[3 * j + 1], c.xyz[3 * i + 2] - c.xyz[3 * j + 2]);
      expect(d(0, 3)).toBeCloseTo(3, 5);
      for (let k = 1; k < m!.atoms.length; k++) expect(d(0, k)).toBeGreaterThan(1.5);
    }
  }, 30000);

  it('runs a conformer search on an allyl ammonium bromide', () => {
    Resources.registerFromNodejs();
    const m = searchModel(Molecule.fromSmiles('C=CC[N+]1(CC2CO2)CCCCC1.[Br-]').toMolfile(), { starts: 20, window: 10, rmsd: 0.5 });
    expect(m!.conformers.length).toBeGreaterThan(0);
    expect(m!.atoms.filter((a) => a.z === 35)).toHaveLength(1);
  }, 60000);
});
