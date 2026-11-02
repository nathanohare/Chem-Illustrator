// The Solvents, pKa in Water and Solubility tables, and the skin permeability estimate.

import { describe, expect, it } from 'vitest';
import { CHEM21, PKA_TABLE, SOLVENTS_TABLE } from '../src/kb/property-tables';
import { gramsPerLitre, SOLUBILITY_TABLE } from '../src/kb/solubility';
import { logKowOf, skinKp, type SafetyRecord } from '../src/kb/safety';
import { REAGENT_SAFETY, SAFETY_RECORDS } from '../src/kb/safety-tables';
import { findRows, isCas } from '../src/kb/tables';
import { LATER_TABLES } from '../src/kb/data';

const base = (over: Partial<SafetyRecord>): SafetyRecord => ({
  name: 'x', cid: 1, cas: null, formula: null, mw: 100, smiles: 'CCO', idlh: null, lethal: [], vp: null, bp: null, mp: null,
  density: null, flash: null, ghs: null, alerts: [], skin: false, incompatible: null, niosh: null, ...over,
});

describe('skin permeability estimate', () => {
  it('follows Potts–Guy and prefers a measured log Kow', () => {
    const r = base({ mw: 100, logKow: { text: 'log Kow = 2.0', source: 'HSDB' }, xlogp: 5 });
    expect(logKowOf(r)).toEqual({ value: 2, source: 'HSDB' });
    expect(Math.log10(skinKp(r)!.kp)).toBeCloseTo(-2.72 + 1.42 - 0.61, 5);
    expect(logKowOf(base({ xlogp: 1.5 }))!.source).toMatch(/XLogP3/);
  });

  it('leaves out salts, metals and big molecules', () => {
    expect(skinKp(base({ smiles: '[Na+].[Cl-]', xlogp: 0 }))).toBeNull();
    expect(skinKp(base({ smiles: 'CC[Zn]CC', xlogp: 2 }))).toBeNull();
    expect(skinKp(base({ mw: 700, xlogp: 2 }))).toBeNull();
  });

  it('puts small lipophilic compounds that go through skin in the high band', () => {
    const named = (n: string) => SAFETY_RECORDS.find((r) => r.name === n)!;
    expect(skinKp(named('Toluene'))?.band).toBe('high');
    expect(skinKp(named('Methanol'))?.band).toBe('low');
    expect(REAGENT_SAFETY.columns.map((c) => c.key)).toContain('kp');
  });
});

describe('solvents', () => {
  it('ranks solvents by CHEM21 and finds each in the safety data', () => {
    expect(Object.keys(CHEM21).length).toBeGreaterThan(30);
    expect(SOLVENTS_TABLE.rows.length).toBeGreaterThanOrEqual(Object.keys(CHEM21).length);
    const rank = (n: string) => SOLVENTS_TABLE.rows.find((r) => r.name === n)?.chem21;
    expect(rank('Ethanol')).toBe('Recommended');
    expect(rank('Tetrahydrofuran')).toBe('Problematic');
    expect(rank('Dichloromethane')).toBe('Hazardous');
    expect(rank('Chloroform')).toBe('Highly hazardous');
    expect(findRows(SOLVENTS_TABLE, '', { chem21: 'Recommended' }).every((m) => m.row.chem21 === 'Recommended')).toBe(true);
    for (const r of SOLVENTS_TABLE.rows) if (r.cas) expect(isCas(String(r.cas)), String(r.name)).toBe(true);
  });
});

describe('pKa in water', () => {
  it('lists recorded values', () => {
    expect(PKA_TABLE.rows.length).toBeGreaterThan(30);
    expect(String(findRows(PKA_TABLE, 'acetic acid')[0].row.pka)).toMatch(/4\.7/);
  });
});

describe('solubility', () => {
  it('holds AqSolDB with canonical SMILES and works out g/L', () => {
    expect(SOLUBILITY_TABLE.rows.length).toBe(9982);
    expect(SOLUBILITY_TABLE.canonicalSmiles).toBe(true);
    expect(gramsPerLitre(-1, 100)).toBeCloseTo(10);
    // the window compares RDKit's SMILES of what was typed with these as they are
    expect(SOLUBILITY_TABLE.rows.find((r) => r.smiles === 'O=Cc1ccc(Cl)cc1')?.name).toBe('4-chlorobenzaldehyde');
    expect(findRows(SOLUBILITY_TABLE, '', { reliability: 'Three or more, agreeing' }).length).toBeGreaterThan(100);
  });

  it('is loaded only when the window opens', async () => {
    const tables = await Promise.all(LATER_TABLES.map((f) => f()));
    expect(tables.map((t) => t.id)).toEqual(['solubility']);
  });
});
