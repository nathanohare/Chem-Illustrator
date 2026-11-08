// Girolami's density estimate, checked against the worked examples of the method.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { panelProps } from '../src/chem/props';
import { densityFactor } from '../src/chem/density';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const density = (smiles: string) => {
  const m = RDKit.get_mol(smiles);
  try { return panelProps(RDKit, m).density; } finally { m.delete(); }
};

describe('Girolami density', () => {
  it('matches the method\'s worked examples', () => {
    expect(density('OC1CCCCC1')).toBeCloseTo(0.92, 2); // cyclohexanol: one ring and an OH, 120%
    expect(density('CCP(C)C')).toBeCloseTo(0.78, 2); // dimethylethylphosphine: no correction
    expect(density('NCCN')).toBeCloseTo(0.90, 2); // ethylenediamine: two NH2, 120%
    expect(density('O=S1(=O)CCCC1')).toBeCloseTo(1.30, 1); // sulfolane: ring and sulfone, 130%
    expect(density('Brc1cccc2ccccc12')).toBeCloseTo(1.49, 2); // 1-bromonaphthalene: two fused rings, 115%
  });

  it('caps the corrections at 30%', () => {
    expect(densityFactor({ hydroxyl: 4, acid: 0, amine: 0, amide: 0, sulfoxide: 0, sulfone: 0, loneRings: 1, fusedRings: 0 })).toBeCloseTo(1.3);
  });

  it('gives no estimate for an element outside the method', () => {
    expect(density('[U]')).toBeNull();
  });
});
