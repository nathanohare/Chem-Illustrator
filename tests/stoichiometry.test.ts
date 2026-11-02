import { describe, expect, it } from 'vitest';
import { stoichiometryBook } from '../src/chem/stoichiometry';

describe('stoichiometry table', () => {
  it('works out millimoles, masses and volumes from the first starting material', () => {
    const wb = stoichiometryBook([
      { role: 'Starting material', name: 'C7H6O', formula: 'C7H6O', mw: 106.12 },
      { role: 'Reagent', name: 'NaBH4', formula: 'BH4Na', mw: 37.83 },
      { role: 'Conditions', name: 'MeOH, 0 °C' },
      { role: 'Product', name: 'C7H8O', formula: 'C7H8O', mw: 108.14 },
    ], 2);
    const sh = wb.sheets[0];
    wb.edit('Equiv', () => { sh.setInput(2, 4, '1.5'); sh.setInput(2, 7, '1.0'); });
    const v = (r: number, c: number) => Number(sh.value(r, c));
    expect(sh.value(0, 5)).toBe('mmol');
    expect(v(1, 5)).toBe(2);
    expect(v(1, 6)).toBeCloseTo(212.24, 2);
    expect(v(2, 5)).toBeCloseTo(3, 6);
    expect(v(2, 6)).toBeCloseTo(113.49, 2);
    expect(v(2, 8)).toBeCloseTo(113.49, 2);
    expect(sh.value(3, 5) ?? null).toBeNull();
    expect(v(4, 6)).toBeCloseTo(216.28, 2);
  });
});

describe('green metrics', () => {
  it('works out atom economy, yield, E-factor and PMI from the table', async () => {
    const { greenRows } = await import('../src/chem/stoichiometry');
    const wb = stoichiometryBook([
      { role: 'Starting material', name: 'benzaldehyde', formula: 'C7H6O', mw: 106.12 },
      { role: 'Reagent', name: 'NaBH4', formula: 'BH4Na', mw: 37.83 },
      { role: 'Product', name: 'benzyl alcohol', formula: 'C7H8O', mw: 108.14 },
    ], 2);
    const sh = wb.sheets[0];
    const g = greenRows(3);
    const v = (r: number) => Number(sh.value(r, 3));
    expect(sh.value(g.economy, 0)).toBe('Atom economy (%)');
    expect(v(g.economy)).toBeCloseTo((100 * 108.14) / (106.12 + 37.83), 3);
    expect(sh.value(g.eFactor, 3)).toBe('');
    // the borohydride is set not to count, and 190 mg of product were isolated
    wb.edit('Mass', () => { sh.setInput(2, 9, 'No'); sh.setInput(g.isolated, 3, '190'); });
    expect(v(g.economy)).toBeCloseTo((100 * 108.14) / 106.12, 3);
    const inMass = 2 * 106.12 + 2 * 37.83;
    expect(v(g.yield)).toBeCloseTo((100 * 190) / (2 * 108.14), 3);
    expect(v(g.eFactor)).toBeCloseTo((inMass - 190) / 190, 4);
    expect(v(g.pmi)).toBeCloseTo(inMass / 190, 4);
  });
});
