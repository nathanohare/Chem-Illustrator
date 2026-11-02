// Chemistry fits on charts (Fit Line > First-order decay, Second-order decay, Arrhenius, Eyring,
// Hammett) and the SIGMA sheet function.
import { describe, expect, it } from 'vitest';
import { fitAt, fitEquation, fitPoints, fitResults, R_GAS } from '../src/sheet/fit';
import { hammettSigma } from '../src/sheet/fn-chem';

const KB = 1.380649e-23, H = 6.62607015e-34;

describe('chemistry fits', () => {
  it('first-order decay gives k and the half-life', () => {
    const ts = [0, 10, 20, 30, 40, 60];
    const f = fitPoints('order1', ts, ts.map((t) => 0.5 * Math.exp(-0.023 * t)))!;
    expect(f.coef[0]).toBeCloseTo(0.5, 6);
    expect(f.coef[1]).toBeCloseTo(0.023, 6);
    expect(f.r2).toBeCloseTo(1, 9);
    expect(fitAt(f, 30)).toBeCloseTo(0.5 * Math.exp(-0.69), 6);
    expect(fitResults(f)).toEqual(['k = 0.023', 't½ = 30.14']);
    expect(fitEquation(f)).toBe('y = 0.5e^(−0.023x)');
  });

  it('second-order decay fits 1/y against time', () => {
    const ts = [0, 5, 10, 20, 40];
    const y0 = 0.2, k = 0.8;
    const f = fitPoints('order2', ts, ts.map((t) => y0 / (1 + k * y0 * t)))!;
    expect(f.coef[0]).toBeCloseTo(y0, 6);
    expect(f.coef[1]).toBeCloseTo(k, 6);
    expect(fitAt(f, 10)).toBeCloseTo(y0 / (1 + k * y0 * 10), 6);
    expect(fitResults(f)[2]).toBe('t½ = 6.25');
  });

  it('Arrhenius gives Ea and A, in kelvin or °C', () => {
    const Ea = 75000, A = 2.0e10;
    const T = [298.15, 308.15, 318.15, 328.15];
    const k = T.map((t) => A * Math.exp(-Ea / (R_GAS * t)));
    const f = fitPoints('arrhenius', T, k)!;
    expect(f.coef[1]).toBeCloseTo(Ea, 3);
    expect(f.coef[0] / A).toBeCloseTo(1, 6);
    expect(fitResults(f)[0]).toBe('Ea = 75 kJ/mol');
    const c = fitPoints('arrhenius', T.map((t) => t - 273.15), k, undefined, true)!;
    expect(c.coef[1]).toBeCloseTo(Ea, 3);
    expect(fitAt(c, 35)).toBeCloseTo(k[1], 9);
    // drawn back on the chart's own axes
    expect(fitAt(f, 308.15)).toBeCloseTo(k[1], 9);
  });

  it('Eyring gives ΔH‡, ΔS‡ and ΔG‡', () => {
    const dH = 60000, dS = -40;
    const T = [280, 300, 320, 340];
    const k = T.map((t) => ((KB * t) / H) * Math.exp(dS / R_GAS) * Math.exp(-dH / (R_GAS * t)));
    const f = fitPoints('eyring', T, k)!;
    expect(f.coef[0]).toBeCloseTo(dH, 3);
    expect(f.coef[1]).toBeCloseTo(dS, 6);
    expect(fitResults(f)).toEqual(['ΔH‡ = 60 kJ/mol', 'ΔS‡ = −40 J/(mol·K)', 'ΔG‡(298 K) = 71.93 kJ/mol']);
  });

  it('Hammett gives ρ, through the origin if asked', () => {
    const s = [-0.27, 0, 0.23, 0.45, 0.78];
    const f = fitPoints('hammett', s, s.map((x) => 2.4 * x + 0.05))!;
    expect(f.coef[1]).toBeCloseTo(2.4, 9);
    expect(fitResults(f)).toEqual(['ρ = 2.4']);
    const o = fitPoints('hammett', s, s.map((x) => 2.4 * x), 0)!;
    expect(o.coef).toEqual([0, expect.closeTo(2.4, 9)]);
    expect(fitEquation(o)).toBe('log(kX/kH) = 2.4σ');
  });

  it('leaves out points a fit cannot use', () => {
    expect(fitPoints('order1', [0, 1, 2], [1, 0, -1])).toBeNull();
    expect(fitPoints('arrhenius', [-300, 300, 310], [1, 2, 3])!.n).toBe(2);
  });
});

describe('SIGMA', () => {
  it('knows common groups by their usual names', () => {
    expect(hammettSigma('NO2')).toBe(0.78);
    expect(hammettSigma('NO2', 'meta')).toBe(0.71);
    expect(hammettSigma('no2', 'p-')).toBe(1.27);
    expect(hammettSigma('OMe')).toBe(-0.27);
    expect(hammettSigma('NMe2')).toBe(-0.83);
    expect(hammettSigma('CO2Me', 'm')).toBe(0.37);
    expect(hammettSigma('H')).toBe(0);
    expect(hammettSigma('Xx')).toBeNull();
    expect(hammettSigma('Cl', 'ortho')).toBeNull();
  });
});
