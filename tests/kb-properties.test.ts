// The ICH Q3C classes, the pKa in Water table, Hammett constants and the skin permeability estimate.

import { describe, expect, it } from 'vitest';
import { ICH_Q3C, PKA_TABLE } from '../src/kb/property-tables';
import { SOLVENTS_TABLE } from '../src/kb/solvents';
import { logKowOf, skinKp, type SafetyRecord } from '../src/kb/safety';
import { REAGENT_SAFETY, SAFETY_RECORDS } from '../src/kb/safety-tables';
import { findRows } from '../src/kb/tables';

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
  it('gives each solvent its ICH Q3C class', () => {
    expect(Object.keys(ICH_Q3C).length).toBeGreaterThan(30);
    const row = (n: string) => SOLVENTS_TABLE.rows.find((r) => r.name === n);
    expect(row('Benzene')?.ich).toBe('Class 1 (avoid)');
    expect(row('Dichloromethane')?.ich).toBe('Class 2 (limit)');
    expect(row('Ethanol')?.ich).toBe('Class 3 (low toxicity)');
    expect(row('Water')?.ich).toBe('Not listed');
    expect(findRows(SOLVENTS_TABLE, '', { ich: 'Class 2 (limit)' }).every((m) => m.row.ich === 'Class 2 (limit)')).toBe(true);
  });
});

describe('pKa in water', () => {
  it('lists recorded values', () => {
    expect(PKA_TABLE.rows.length).toBeGreaterThan(30);
    expect(String(findRows(PKA_TABLE, 'acetic acid')[0].row.pka)).toMatch(/4\.7/);
  });
});

describe('Hammett constants', () => {
  it('lists common groups with valid SMILES on benzene and finds them by group or name', async () => {
    const { HAMMETT, onBenzene, hammettId } = await import('../src/kb/hammett');
    const { HAMMETT_TABLE } = await import('../src/kb/hammett-table');
    expect(HAMMETT.length).toBeGreaterThan(500);
    expect(new Set(HAMMETT.map(hammettId)).size).toBe(HAMMETT.length);
    const nitro = findRows(HAMMETT_TABLE, 'nitro').find((m) => m.row.group === 'NO2')!.row;
    expect([nitro.sm, nitro.sp, nitro.F, nitro.R]).toEqual(['0.71', '0.78', '0.65', '0.13']);
    expect(findRows(HAMMETT_TABLE, 'OCH3').find((m) => m.row.group === 'OCH3')!.row.sp).toBe('-0.27');
    expect(onBenzene(HAMMETT.find((x) => x.name.startsWith('methylenedioxy'))!)).toBe('c1ccc2c(c1)OCO2');
    // σp = F + R within rounding, as the Swain–Lupton split requires (bracketed values aside)
    for (const x of HAMMETT) if (!x.uncertain && x.sp !== null && x.group !== 'H') expect(Math.abs(x.F! + x.R! - x.sp), x.group).toBeLessThan(0.025);
  });
});
