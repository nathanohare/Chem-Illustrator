import { describe, expect, it } from 'vitest';
import { Molecule, Resources } from 'openchemlib';
import { buildModel } from '../src/chem/model3d-build';
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
