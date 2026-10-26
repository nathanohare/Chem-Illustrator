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
