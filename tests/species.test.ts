// Text boxes read as chemistry: the curated list of ions, reagents and ligands, condensed
// formulas and salts, what is left as plain text, and counting them with a drawing.

import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { toMolfile } from '../src/chem/molfile';
import { readSpecies, speciesFormula, speciesSmiles } from '../src/chem/species';
import { SPECIES_ENTRIES } from '../src/chem/species-list';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); }, 60000);

/** Canonical SMILES of what the chemistry engine reads from a species counted on its own. */
function engineSmiles(text: string): string | null {
  const sp = readSpecies(text);
  if (!sp) return null;
  const doc = new Doc();
  const { molblock } = toMolfile(doc, [], '', { species: [{ graph: sp.graph, x: 0, y: 0 }] });
  const mol = RDKit.get_mol(molblock);
  if (!mol?.is_valid()) return null;
  const s = mol.get_smiles();
  mol.delete();
  return s;
}

function canonical(smiles: string): string {
  const mol = RDKit.get_mol(smiles);
  expect(mol?.is_valid(), smiles).toBe(true);
  const s = mol.get_smiles();
  mol.delete();
  return s;
}

describe('the list of ions, reagents and ligands', () => {
  it('is read by the chemistry engine as the molecule each entry names', () => {
    for (const e of SPECIES_ENTRIES) {
      const name = e.names[0];
      const sign = e.needsSign ? (canonical(e.smiles).includes('+') && !canonical(e.smiles).includes('-') ? '+' : '−') : '';
      expect(engineSmiles(name + sign), name).toBe(canonical(e.smiles));
      // the SMILES written out again means the same
      expect(canonical(speciesSmiles(readSpecies(name + sign)!)), name).toBe(canonical(e.smiles));
    }
  });
  it('has no name twice with the same charge', () => {
    const seen = new Map<string, string>();
    for (const e of SPECIES_ENTRIES) for (const n of e.names) {
      const key = n + '|' + (e.needsSign ? 'sign' : 'plain');
      expect(seen.get(key), `${n} in ${e.name} and ${seen.get(key)}`).toBeUndefined();
      seen.set(key, e.name);
    }
  });
});

describe('reading a text box', () => {
  it('reads counterions with and without their charge', () => {
    for (const t of ['BF4−', 'BF4-', '[BF4]−', 'BF₄⁻', 'BF4 −']) {
      const sp = readSpecies(t)!;
      expect(sp.name, t).toBe('tetrafluoroborate');
      expect(sp.expected, t).toBeUndefined();
    }
    const bare = readSpecies('BF4')!;
    expect(bare.name).toBe('tetrafluoroborate');
    expect(bare.charge).toBe(-1);
    expect(bare.expected).toBe(-1);
    expect(speciesFormula(bare)).toBe('BF4−');
    expect(readSpecies('PF6−')!.name).toBe('hexafluorophosphate');
    expect(readSpecies('OTf')!.expected).toBe(-1);
    expect(readSpecies('OTf−')!.expected).toBeUndefined();
    for (const t of ['NTf2−', 'ClO4−', 'SbF6−', 'BArF−', 'OTs−', 'B(C6F5)4−', 'NBu4+', 'PPh4+', 'NH4+']) expect(readSpecies(t)?.expected, t).toBeUndefined();
    // the wrong charge is flagged too
    expect(readSpecies('BF4+')!.expected).toBe(-1);
    expect(readSpecies('SO4 2−')!.charge).toBe(-2);
    expect(readSpecies('SO₄²⁻')!.expected).toBeUndefined();
    expect(readSpecies('SO4')!.expected).toBe(-2);
  });
  it('reads one element with a charge, but not a lone element', () => {
    expect(readSpecies('Na+')!.charge).toBe(1);
    expect(readSpecies('Fe3+')!.charge).toBe(3);
    expect(readSpecies('Cl−')!.charge).toBe(-1);
    for (const t of ['Cl', 'A', 'B', 'C', 'N', 'I', 'K', 'H', 'In', 'No', 'He']) expect(readSpecies(t), t).toBeNull();
  });
  it('reads names that mean something else without a charge only with it', () => {
    expect(readSpecies('CN')).toBeNull();
    expect(readSpecies('CN−')!.name).toBe('cyanide');
    expect(readSpecies('OH')).toBeNull();
    expect(readSpecies('OH−')!.name).toBe('hydroxide');
    expect(readSpecies('NO2')).toBeNull();
    expect(readSpecies('NO2−')!.name).toBe('nitrite');
    expect(readSpecies('TFA')!.name).toBe('trifluoroacetic acid');
    expect(readSpecies('TFA−')!.name).toBe('trifluoroacetate');
  });
  it('reads reagents, solvents and ligands written as abbreviations', () => {
    for (const [t, f] of [['DMAP', 'C7H10N2'], ['THF', 'C4H8O'], ['mCPBA', 'C7H5ClO3'], ['DIPEA', 'C8H19N'], ['n-BuLi', 'C4H9Li'], ['PPh3', 'C18H15P'],
      ['dppe', 'C26H24P2'], ['COD', 'C8H12'], ['XPhos', 'C33H49P'], ['BINAP', 'C44H32P2'], ['9-BBN', 'C8H15B'], ['DMSO-d6', 'C2D6OS'], ['TBAF', 'C16H36FN']] as const) {
      expect(speciesFormula(readSpecies(t)!), t).toBe(f);
    }
  });
  it('reads condensed formulas that are whole molecules', () => {
    for (const [t, f] of [['CH2Cl2', 'CH2Cl2'], ['MeOH', 'CH4O'], ['H2O', 'H2O'], ['HCl', 'ClH'], ['CHCl3', 'CHCl3'], ['Pd(OAc)2', 'C4H6O4Pd'], ['CuI', 'CuI'],
      ['PdCl2', 'Cl2Pd'], ['NaH', 'HNa'], ['Et3N', 'C6H15N'], ['HNEt3+', 'C6H16N+'], ['PhCH2Br', 'C7H7Br'], ['Me3SiCl', 'C3H9ClSi']] as const) {
      expect(speciesFormula(readSpecies(t)!), t).toBe(f);
    }
  });
  it('reads salts written as one formula', () => {
    expect(speciesSmiles(readSpecies('NaBF4')!)).toBe('[Na+].F[B-](F)(F)F');
    expect(speciesFormula(readSpecies('Cs2CO3')!)).toBe('CCs2O3');
    expect(speciesFormula(readSpecies('K3PO4')!)).toBe('K3O4P');
    expect(speciesFormula(readSpecies('Mg(OTf)2')!)).toBe('C2F6MgO6S2');
    expect(speciesFormula(readSpecies('AgSbF6')!)).toBe('AgF6Sb');
    expect(speciesFormula(readSpecies('NBu4PF6')!)).toBe('C16H36F6NP');
    expect(speciesSmiles(readSpecies('NH4Cl')!)).toBe('[NH4+].[Cl-]');
    expect(speciesSmiles(readSpecies('LiCl')!)).toBe('[Li+].[Cl-]');
    expect(speciesFormula(readSpecies('BF3·OEt2')!)).toBe('C4H10BF3O');
  });
  it('leaves ordinary captions, groups and look-alike words as text', () => {
    for (const t of ['Step 2', 'rt, 12 h', '12 h', '1a', '2', '(±)-3', 'A', 'Ph', 'Me', 'Boc', 'OMe', 'OTBS', 'NHBoc', 'CO2Me', 'CF3', 'CHO', 'COOH',
      'PhD', 'TS1', 'TS', 'SN2', 'NMR', 'HPLC', 'IC50', 'Yes', 'No', 'OFF', 'Ar', 'R', 'R1', 'X', 'rt', 'hν', 'Δ', 'reflux', 'quant.', '85%', 'Scheme 1', 'Table S1',
      'BF4 and PF6', 'BF4\nPF6', 'Cl2 (g)']) {
      expect(readSpecies(t), JSON.stringify(t)).toBeNull();
    }
  });
});

describe('counting text boxes with a drawing', () => {
  it('adds each one as its own molecule', () => {
    const doc = new Doc();
    doc.edit('n', () => { doc.addAtom(0, 0, 7, { charge: 1 }); });
    const n = [...doc.atoms.keys()];
    const bf4 = readSpecies('BF4−')!;
    const { molblock, map } = toMolfile(doc, n, '', { species: [{ graph: bf4.graph, x: 30, y: 0 }] });
    expect(map.filter((m) => m === -1).length).toBe(5);
    const mol = RDKit.get_mol(molblock);
    expect(mol.get_smiles()).toBe(canonical('[NH4+].F[B-](F)(F)F'));
    mol.delete();
  });
  it('keeps a radical or a free carbene as one', () => {
    expect(engineSmiles('TEMPO')).toBe(canonical('CC1(C)CCCC(C)(C)N1[O]'));
    expect(engineSmiles('IMes')).toBe(canonical('[C]1N(c2c(C)cc(C)cc2C)C=CN1c1c(C)cc(C)cc1C'));
  });
});
