import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eighSym, lorentzian, transitions, type LineList, type SpinSystem } from '../src/chem/nmr/spin';

// Reference line lists from Open-NMR's nmrsuite.spin.transitions at 400 MHz (tests/fixtures/nmr-spin-parity.json).
const ref = JSON.parse(readFileSync(new URL('./fixtures/nmr-spin-parity.json', import.meta.url), 'utf8')) as Record<
  string, { sys: SpinSystem & { nuclei: string[] | null }; hz: number[]; intensity: number[]; width: number[] }>;

function spectrum(l: LineList, lo: number, hi: number, n = 4000) {
  const hz = Float64Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  return lorentzian(l, hz);
}

describe('spin simulation (port of nmrsuite.spin)', () => {
  it('diagonalizes symmetric matrices', () => {
    const a = Float64Array.from([4, 1, 2, 1, 3, 0, 2, 0, 1]);
    const { values, vectors } = eighSym(a, 3);
    for (let k = 0; k < 3; k++) {
      for (let r = 0; r < 3; r++) {
        let av = 0;
        for (let c = 0; c < 3; c++) av += a[r * 3 + c] * vectors[k * 3 + c];
        expect(av).toBeCloseTo(values[k] * vectors[k * 3 + r], 10);
      }
    }
    expect(values[0]).toBeLessThan(values[1]);
  });

  for (const [name, c] of Object.entries(ref)) {
    it(`matches nmrsuite for ${name}`, () => {
      const sys: SpinSystem = { shifts: c.sys.shifts, j: c.sys.j, nuclei: c.sys.nuclei ?? undefined, widths: c.sys.widths };
      const l = transitions(sys, 400);
      const total = l.intensity.reduce((t, v) => t + v, 0);
      expect(total).toBeCloseTo(c.intensity.reduce((t, v) => t + v, 0), 6);
      // lines at degenerate frequencies can be split differently, so compare the spectra they make
      const r: LineList = { hz: Float64Array.from(c.hz), intensity: Float64Array.from(c.intensity), width: Float64Array.from(c.width), sf: 400 };
      const lo = Math.min(...c.hz) - 20, hi = Math.max(...c.hz) + 20;
      const a = spectrum(l, lo, hi), b = spectrum(r, lo, hi);
      const peak = Math.max(...b);
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-6 * peak);
    });
  }

  it('gives a first-order triplet for a weakly coupled CH2-CH3', () => {
    const j = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    for (const a of [0, 1, 2]) for (const b of [3, 4]) { j[a][b] = 7; j[b][a] = 7; }
    const l = transitions({ shifts: [1.2, 1.2, 1.2, 4.1, 4.1], j }, 400);
    const ch3 = [...l.hz].map((f, i) => [f, l.intensity[i]]).filter(([f]) => f < 600);
    const merged = new Map<number, number>();
    for (const [f, i] of ch3) merged.set(Math.round(f), (merged.get(Math.round(f)) ?? 0) + i);
    const ints = [...merged.entries()].sort((x, y) => x[0] - y[0]).map(([, i]) => i);
    expect(ints.length).toBe(3);
    expect(ints[1] / ints[0]).toBeCloseTo(2, 1);
  });
});
