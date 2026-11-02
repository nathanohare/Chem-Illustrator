import { describe, expect, it } from 'vitest';
import { amounts, dilution, show, solutionMass } from '../src/chem/lab-calc';

describe('lab calculator', () => {
  it('turns a mass into mmol and volumes', () => {
    // benzaldehyde, 106.12 g/mol, 1.044 g/mL; 1.00 g
    const a = amounts({ mw: 106.12, density: 1.044, molarity: 2, given: 'mass', value: 1000 })!;
    expect(a.mmol).toBeCloseTo(9.423, 3);
    expect(a.neatMl).toBeCloseTo(0.9579, 4);
    expect(a.solutionMl).toBeCloseTo(4.712, 3);
  });

  it('turns a volume of neat liquid into mass and mmol', () => {
    const a = amounts({ mw: 106.12, density: 1.044, given: 'volume', value: 0.5 })!;
    expect(a.massMg).toBeCloseTo(522, 1);
    expect(a.mmol).toBeCloseTo(4.919, 3);
  });

  it('turns a volume of solution into mmol (n-BuLi, 2.5 M)', () => {
    const a = amounts({ mw: 64.06, molarity: 2.5, given: 'solution', value: 4 })!;
    expect(a.mmol).toBe(10);
    expect(a.massMg).toBeCloseTo(640.6, 1);
  });

  it('counts purity in the mass to weigh', () => {
    const a = amounts({ mw: 100, purity: 95, given: 'mmol', value: 1 })!;
    expect(a.massMg).toBeCloseTo(105.26, 2);
    const back = amounts({ mw: 100, purity: 95, given: 'mass', value: a.massMg })!;
    expect(back.mmol).toBeCloseTo(1, 6);
  });

  it('needs a molecular weight for a mass', () => {
    expect(amounts({ mw: 0, given: 'mass', value: 10 })).toBeNull();
    expect(amounts({ mw: 0, molarity: 1, given: 'solution', value: 2 })!.mmol).toBe(2);
  });

  it('weighs out a solution', () => {
    // 100 mL of 0.1 M NaCl (58.44): 584.4 mg
    expect(solutionMass(0.1, 100, 58.44)).toBeCloseTo(584.4, 1);
  });

  it('solves a dilution for the missing value', () => {
    expect(dilution({ c1: 12, c2: 1, v2: 250 })!.v1).toBeCloseTo(20.83, 2);
    expect(dilution({ c1: 2, v1: 5, v2: 50 })!.c2).toBeCloseTo(0.2, 6);
    expect(dilution({ c1: 2, v1: 5 })).toBeNull();
  });

  it('shows four significant figures', () => {
    expect(show(9.42292)).toBe('9.423');
    expect(show(522.0)).toBe('522');
    expect(show(0.0012346)).toBe('0.001235');
    expect(show(12345.6)).toBe('12346');
  });
});
