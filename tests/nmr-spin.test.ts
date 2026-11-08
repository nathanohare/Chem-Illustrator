import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eighSym, lorentzian, MERGE_HZ, mergeLines, transitions, type LineList, type SpinSystem } from '../src/chem/nmr/spin';

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
      // (to 1e-5 of the peak: lines within MERGE_HZ are merged, which moves the curve by about 2e-6)
      const r: LineList = { hz: Float64Array.from(c.hz), intensity: Float64Array.from(c.intensity), width: Float64Array.from(c.width), sf: 400 };
      const lo = Math.min(...c.hz) - 20, hi = Math.max(...c.hz) + 20;
      const a = spectrum(l, lo, hi), b = spectrum(r, lo, hi);
      const peak = Math.max(...b);
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-5 * peak);
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

  it('gives the same spectrum with equivalent spins combined as without', () => {
    // CH3-CH2-CH (A3M2X, strongly coupled at 400 MHz); widths differing by 1e-9 Hz stop the grouping
    const shifts = [1.0, 1.0, 1.0, 1.08, 1.08, 1.3];
    const j = shifts.map((_, a) => shifts.map((_, b) => (a === b ? 0 : (a < 3) !== (b < 3) && Math.max(a, b) < 5 ? 7.2 : (a === 5) !== (b === 5) && (a >= 3 || b >= 3) && Math.min(a, b) >= 3 ? 6.5 : 0)));
    const grouped = transitions({ shifts, j, widths: 0.9 }, 400);
    const single = transitions({ shifts, j, widths: shifts.map((_, k) => 0.9 + k * 1e-9) }, 400);
    const a = spectrum(grouped, 350, 560), b = spectrum(single, 350, 560);
    const peak = Math.max(...b);
    for (let k = 0; k < a.length; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-5 * peak);
  });
});

describe('line merging and drawing', () => {
  /** The plain sum over every line and point (what lorentzian gave before it skipped ahead). */
  const brute = (l: LineList, hz: ArrayLike<number>) => Float64Array.from(hz, (x) => {
    let y = 0;
    for (let k = 0; k < l.hz.length; k++) {
      const hw = l.width[k] / 2, d = x - l.hz[k];
      if (Math.abs(d) <= 200 * hw) y += (l.intensity[k] / Math.PI) * hw / (hw * hw + d * d);
    }
    return y;
  });

  it('merges coincident lines of equal width and keeps the total intensity', () => {
    const F = [100, 100 + MERGE_HZ / 4, 100 + MERGE_HZ / 2, 100.5, 200, 200];
    const I = [1, 1, 2, 1, 3, 1];
    const W = [1, 1, 1, 1, 1, 2];
    const m = mergeLines(F, I, W, F.map((_, i) => i), 400);
    expect([...m.intensity]).toEqual([4, 1, 3, 1]);
    expect(m.hz[0]).toBeCloseTo((100 + (100 + MERGE_HZ / 4) + 2 * (100 + MERGE_HZ / 2)) / 4, 9);
    expect([...m.width]).toEqual([1, 1, 1, 2]);
    expect(m.intensity.reduce((t, v) => t + v, 0)).toBe(I.reduce((t, v) => t + v, 0));
  });

  it('draws many near-degenerate lines the same after merging, with far fewer lines', () => {
    // what a long chain gives: thousands of transitions piled within a few mHz of 300 frequencies
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const base = Array.from({ length: 300 }, () => 350 + rnd() * 250);
    const F: number[] = [], I: number[] = [], W: number[] = [];
    for (let k = 0; k < 20000; k++) { F.push(base[k % 300] + rnd() * 0.002); I.push(rnd()); W.push(0.8); }
    const raw: LineList = { hz: Float64Array.from(F), intensity: Float64Array.from(I), width: Float64Array.from(W), sf: 400 };
    const merged = mergeLines(F, I, W, F.map((_, k) => k), 400);
    expect(merged.hz.length).toBeLessThanOrEqual(300);
    const axis = Float64Array.from({ length: 4000 }, (_, k) => 340 + k * 0.07);
    const a = lorentzian(merged, axis), b = brute(raw, axis);
    const peak = Math.max(...b);
    for (let k = 0; k < axis.length; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-4 * peak);
  });

  it('draws the same on a rising, a falling and an unsorted axis', () => {
    const l: LineList = { hz: Float64Array.from([100, 103, 250]), intensity: Float64Array.from([1, 2, 1]), width: Float64Array.from([1, 1, 0.5]), sf: 400 };
    const up = Float64Array.from({ length: 900 }, (_, k) => 50 + k * 0.25);
    const down = up.slice().reverse();
    const shuffled = Float64Array.from(up.map((v, k) => (k % 2 ? v : up[up.length - 1 - k])));
    for (const axis of [up, down, shuffled]) {
      const a = lorentzian(l, axis), b = brute(l, axis);
      for (let k = 0; k < axis.length; k++) expect(a[k]).toBeCloseTo(b[k], 12);
    }
  });
});
