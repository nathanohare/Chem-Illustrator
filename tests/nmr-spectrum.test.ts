import { describe, expect, it } from 'vitest';
import type { JGraph } from '../src/chem/nmr/coupling';
import { predictSpectrum } from '../src/chem/nmr/spectrum';
import { autoRange, rowAt, spectrumSvg } from '../src/ui/nmr-spectrum';
import { multSi, nmrRows, siText } from '../src/ui/nmr-panel';

const C = (h: number) => ({ el: 'C', arom: false, h });
// ethyl acetate: C0H3-C1H2-O2-C3(=O4)-C5H3
const ea: JGraph = { atoms: [C(3), C(2), { el: 'O', arom: false, h: 0 }, C(0), { el: 'O', arom: false, h: 0 }, C(3)],
  bonds: [{ u: 0, v: 1, o: 1 }, { u: 1, v: 2, o: 1 }, { u: 2, v: 3, o: 1 }, { u: 3, v: 4, o: 2 }, { u: 3, v: 5, o: 1 }] };
const h1 = [1.26, 4.12, NaN, NaN, NaN, 2.05];
const codes = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('predicted 1H spectrum', () => {
  for (const q of ['fast', 'balanced', 'accurate'] as const) {
    it(`integrates to the proton count (${q})`, () => {
      const s = predictSpectrum(ea, h1, codes, 400, q);
      const total = s.lines.intensity.reduce((t, v) => t + v, 0);
      expect(total).toBeCloseTo(8, 3);
      // CH2 quartet: lines within 4.12 ± 3J/2
      // CH2 quartet: four line positions (lines closer than 1 Hz merged, traces under 1% left out)
      const ch2 = [...s.lines.hz].map((f, k) => [f, s.lines.intensity[k]]).filter(([f, i]) => Math.abs(f / 400 - 4.12) < 0.05 && i > 0.01).map(([f]) => f).sort((a, b) => a - b);
      const pos = ch2.filter((f, k) => k === 0 || f - ch2[k - 1] > 1);
      expect(pos.length).toBe(4);
    });
  }

  it('splits coupled groups larger than the quality limit at their weakest couplings', () => {
    // hexyl chain: 13 protons coupled in one chain, more than Balanced's 8
    const g: JGraph = { atoms: [C(3), C(2), C(2), C(2), C(2), C(3)], bonds: [0, 1, 2, 3, 4].map((i) => ({ u: i, v: i + 1, o: 1 })) };
    const s = predictSpectrum(g, [0.9, 1.3, 1.3, 1.3, 1.3, 0.9], ['m', 'a', 'b', 'b', 'a', 'm'], 400, 'balanced');
    expect(s.lines.intensity.reduce((t, v) => t + v, 0)).toBeGreaterThan(5);
  });

  it('draws an SVG and finds the row under the pointer', () => {
    const s = predictSpectrum(ea, h1, codes, 400);
    const d = { nuc: '1H' as const, spec: s, groupRows: s.groups.map((_, i) => i) };
    const r = autoRange(d);
    expect(r.hi).toBeGreaterThan(4.12);
    const svg = spectrumSvg(d, { w: 300, h: 90, hi: r.hi, lo: r.lo, labels: true, hotRow: 1 });
    expect(svg).toContain('<path');
    expect(svg).toContain('sp-hot');
    const q = s.groups.findIndex((g) => g.mult === 'q');
    expect(rowAt(d, 4.13, 0.02)).toBe(q);
  });
});

describe('multiplicities in SI text', () => {
  it('writes mult and J as an SI does', () => {
    expect(multSi({ mult: 'dd', j: [15.5, 6.8] })).toBe('dd, J = 15.5, 6.8 Hz');
    expect(multSi({ mult: 'm', j: [7] })).toBe('m');
    const hit = (value: number) => ({ value, spread: 0.1, radius: 3, n: 12 });
    const g = { atoms: [{ el: 'C', q: 0, iso: 0, legacy: null, cip: null, tag: null, arom: false, xh: 0, h: 3, rad: 0, deg: 0 }, { el: 'C', q: 0, iso: 0, legacy: null, cip: null, tag: null, arom: false, xh: 0, h: 2, rad: 0, deg: 0 }], bonds: [{ u: 0, v: 1, o: 1, ez: null, ring: false }] };
    const rows = nmrRows(g, [{ atom: 0, c13: hit(15), h1: hit(1.2), hCount: 3 }, { atom: 1, c13: hit(60), h1: hit(4.1), hCount: 2 }]);
    rows[0].mult = 't'; rows[0].j = [7.1]; rows[1].mult = 'q'; rows[1].j = [7.1];
    expect(siText(rows, 'CDCl3')).toBe('1H NMR (400 MHz, CDCl3) δ 4.10 (q, J = 7.1 Hz, 2H), 1.20 (t, J = 7.1 Hz, 3H); 13C NMR (101 MHz, CDCl3) δ 60.0, 15.0.');
  });
});
