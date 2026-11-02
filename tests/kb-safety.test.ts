// The bench hazard rating: numbers first, so OsO4 and Me2SO4 come out Tier 1 and solvents Tier 3,
// whatever the merged supplier labels say; and the tables built from the shipped data.

import { describe, expect, it } from 'vitest';
import { badges, haveReady, idlhPpm, lethalByRoute, oralLd50, rate, vapourRatio, vpMmHg, type SafetyRecord } from '../src/kb/safety';
import { PHYSICAL_CONSTANTS, REAGENT_SAFETY, SAFETY_RECORDS } from '../src/kb/safety-tables';
import { findRows, isCas, PRESENT } from '../src/kb/tables';

const base = (over: Partial<SafetyRecord>): SafetyRecord => ({
  name: 'x', cid: 1, cas: null, formula: null, mw: 100, smiles: null, idlh: null, lethal: [], vp: null, bp: null, mp: null,
  density: null, flash: null, ghs: null, alerts: [], skin: false, incompatible: null, niosh: null, ...over,
});

describe('numbers', () => {
  it('reads vapour pressures in any unit', () => {
    expect(vpMmHg('0.677 mm Hg at 25 °C')).toBeCloseTo(0.677);
    expect(vpMmHg('Vapor pressure, Pa at 20 °C: 65')).toBeNull(); // the number must come before its unit
    expect(vpMmHg('65 Pa')).toBeCloseTo(0.4875, 3);
    expect(vpMmHg('1.2 kPa at 20 °C')).toBeCloseTo(9.0, 1);
    expect(vpMmHg('5.6X10-3 mm Hg at 25 °C')).toBeCloseTo(0.0056, 5);
    expect(vpMmHg('1 atm')).toBe(760);
    expect(vpMmHg('5.83X10+3 mm Hg at 25 °C')).toBeCloseTo(5830);
  });

  it('converts an IDLH in mg/m3 to ppm', () => {
    const os = base({ mw: 254.2, idlh: { value: 1, unit: 'mg/m3', source: 'NIOSH' }, vp: { text: '7 mm Hg at 20 °C', source: 'HSDB' } });
    expect(idlhPpm(os)).toBeCloseTo(0.096, 3);
    expect(vapourRatio(os)!).toBeGreaterThan(50000);
  });

  it('gives the lowest LD50 by route', () => {
    const r = base({ lethal: [
      { kind: 'LD50', species: 'rat', route: 'oral', value: 440, unit: 'mg/kg', time: '', source: 'HSDB' },
      { kind: 'LD50', species: 'mouse', route: 'oral', value: 0.2, unit: 'g/kg', time: '', source: 'HSDB' },
      { kind: 'LC50', species: 'guinea pig', route: 'inhalation', value: 32, unit: 'ppm', time: '60 min', source: 'HSDB' },
    ] });
    expect(oralLd50(r)).toBe(200);
    expect(lethalByRoute(r)).toEqual({ oral: 'rat 440 mg/kg', inhalation: 'guinea pig 32 ppm / 60 min' });
  });
});

describe('tiers', () => {
  it('puts a low IDLH, fatal-by-skin or a named case in Tier 1', () => {
    const vp = (t: string) => ({ text: t, source: 'HSDB' });
    expect(rate(base({ idlh: { value: 7, unit: 'ppm', source: 'NIOSH' }, vp: vp('100 mm Hg at 25 °C') })).tier).toBe(1);
    // a low IDLH for something that hardly evaporates, or whose volatility isn't known, is Tier 2
    expect(rate(base({ idlh: { value: 2, unit: 'ppm', source: 'NIOSH' }, vp: vp('0.23 mm Hg at 25 °C') })).tier).toBe(2);
    expect(rate(base({ idlh: { value: 7, unit: 'ppm', source: 'NIOSH' } })).tier).toBe(2);
    // a dust or mist: an IDLH in mg/m3 for a solid that doesn't evaporate doesn't raise the tier
    expect(rate(base({ idlh: { value: 10, unit: 'mg/m3', source: 'NIOSH' }, vp: vp('0 mm Hg') })).tier).toBe(3);
    expect(rate(base({ ghs: { codes: ['H310'], classes: '' } })).tier).toBe(1);
    expect(rate(base({ ghs: { codes: ['H301+H311+H331'], classes: '' } })).tier).toBe(3);
    expect(rate(base({ cas: '7664-39-3' })).tier).toBe(1);
  });

  it('puts IDLH up to 100 ppm, potent oral poisons, pyrophorics and volatile carcinogens in Tier 2', () => {
    expect(rate(base({ idlh: { value: 100, unit: 'ppm', source: 'NIOSH' }, vp: { text: '400 mm Hg', source: 'HSDB' } })).tier).toBe(2);
    expect(rate(base({ idlh: { value: 50, unit: 'ppm', source: 'NIOSH' }, vp: { text: '0.7 mm Hg', source: 'HSDB' } })).tier).toBe(3);
    expect(rate(base({ lethal: [{ kind: 'LD50', species: 'rat', route: 'oral', value: 5, unit: 'mg/kg', time: '', source: 'HSDB' }] })).tier).toBe(2);
    expect(rate(base({ ghs: { codes: ['H250'], classes: '' } })).tier).toBe(2);
    // CAMEO's pyrophoric alert alone (it marks sodium and metal powders) doesn't
    expect(rate(base({ alerts: ['Strong Reducing Agent Water-Reactive Pyrophoric'] })).tier).toBe(3);
    expect(rate(base({ ghs: { codes: ['H350'], classes: '' }, vp: { text: '95 mm Hg', source: 'HSDB' } })).tier).toBe(2);
    // a carcinogen that hardly evaporates is not
    expect(rate(base({ ghs: { codes: ['H350'], classes: '' }, vp: { text: '0.0001 mm Hg', source: 'HSDB' } })).tier).toBe(3);
  });

  it('keeps a suspected carcinogen solvent in Tier 3 and salts in Tier 4', () => {
    expect(rate(base({ idlh: { value: 2300, unit: 'ppm', source: 'NIOSH' }, ghs: { codes: ['H351'], classes: '' } })).tier).toBe(3);
    expect(rate(base({ cas: '7647-14-5' })).tier).toBe(4);
  });

  it('adds bench badges and what to have ready', () => {
    expect(badges(base({ cas: '109-99-9', skin: false }))).toContain('Peroxide former');
    expect(badges(base({ skin: true, cas: '77-78-1' }))).toEqual(expect.arrayContaining(['Skin', 'No warning']));
    expect(haveReady(base({ cas: '7664-39-3' }))?.what).toMatch(/calcium gluconate/i);
  });
});

describe('the shipped data', () => {
  const byName = new Map(SAFETY_RECORDS.map((r) => [r.name, r]));
  const tier = (n: string) => { const r = byName.get(n); expect(r, n).toBeTruthy(); return rate(r!).tier; };

  it('rates the examples the plan names', () => {
    expect(tier('Osmium tetroxide')).toBe(1);
    expect(tier('Dimethyl sulfate')).toBe(1);
    expect(tier('Hydrofluoric acid')).toBe(1);
    expect(tier('Iodomethane')).toBe(2);
    expect(tier('tert-Butyllithium')).toBe(2);
    expect(tier('Trimethylsilyldiazomethane')).toBe(1);
    for (const s of ['Sodium hydroxide', 'Sulfuric acid', 'Acetic acid', 'Sodium hydride']) expect(tier(s), s).toBe(3);
    for (const s of ['Dichloromethane', 'Tetrahydrofuran', 'Acetone', 'Ethyl acetate', 'Methanol', 'Toluene', 'Hexane']) expect(tier(s), s).toBe(3);
    expect(tier('Sodium chloride')).toBe(4);
  });

  it('has a valid CAS number and a source for every value', () => {
    for (const r of SAFETY_RECORDS) {
      if (r.cas) expect(isCas(r.cas), `${r.name} ${r.cas}`).toBe(true);
      for (const v of [r.vp, r.bp, r.mp, r.density, r.flash]) if (v) expect(['HSDB', 'NIOSH', 'CAMEO', 'OSHA', 'DOE PAC']).toContain(v.source);
    }
  });

  it('builds searchable tables with links', () => {
    expect(REAGENT_SAFETY.rows.length).toBe(SAFETY_RECORDS.length);
    expect(PHYSICAL_CONSTANTS.rows.length).toBe(SAFETY_RECORDS.length);
    const [os] = findRows(REAGENT_SAFETY, '20816-12-0');
    expect(os.row.tier).toBe(1);
    expect(REAGENT_SAFETY.links!(os.row).map((l) => l.label)).toContain('PubChem');
    expect(findRows(REAGENT_SAFETY, '', { incident: PRESENT }).length).toBeGreaterThanOrEqual(3);
    expect(findRows(REAGENT_SAFETY, '', { tier: '1' }).every((m) => m.row.tier === 1)).toBe(true);
  });
});
