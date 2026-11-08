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
    expect(s.lines.intensity.reduce((t, v) => t + v, 0)).toBeCloseTo(14, 3);
    // the CH3 keeps its triplet: the coupling to the next cluster stays, to first order
    const ch3 = [...s.lines.hz].map((f, k) => [f, s.lines.intensity[k]]).filter(([f, i]) => f < 0.95 * 400 && i > 0.02).map(([f]) => f);
    expect(new Set(ch3.map((f) => Math.round(f))).size).toBe(3);
  });

  it('simulates 12 coupled protons exactly on Accurate', () => {
    const g: JGraph = { atoms: [C(3), C(2), C(2), C(2), C(3)], bonds: [0, 1, 2, 3].map((i) => ({ u: i, v: i + 1, o: 1 })) };
    const t = performance.now();
    const s = predictSpectrum(g, [0.9, 1.31, 1.28, 1.33, 0.95], ['m', 'a', 'b', 'c', 'n'], 400, 'accurate');
    expect(s.lines.intensity.reduce((t, v) => t + v, 0)).toBeCloseTo(12, 3);
    expect(performance.now() - t).toBeLessThan(5000);
  });

  it('simulates long alkyl chains on Balanced and Accurate without failing or stalling', () => {
    // decyl chain with every CH2 a little apart: big clusters with many coupled neighbours (once
    // "15 spins: exact simulation is limited to 14" and the whole spectrum fell back to first order)
    const n = 10;
    const g: JGraph = { atoms: Array.from({ length: n }, (_, i) => C(i === 0 || i === n - 1 ? 3 : 2)), bonds: Array.from({ length: n - 1 }, (_, i) => ({ u: i, v: i + 1, o: 1 })) };
    const shifts = Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 0.88 : 1.25 + 0.012 * i));
    for (const q of ['balanced', 'accurate'] as const) {
      const t = performance.now();
      const s = predictSpectrum(g, shifts, shifts.map((_, i) => `c${i}`), 400, q);
      expect(s.lines.intensity.reduce((t, v) => t + v, 0)).toBeCloseTo(22, 2);
      expect(performance.now() - t).toBeLessThan(4000);
    }
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

describe('pasted multiplets and peak labels', () => {
  it('draws a pasted range "m" as a flat top with no dips', async () => {
    const { parsePeakLists, measuredLines } = await import('../src/chem/nmr/check');
    const { lorentzian } = await import('../src/chem/nmr/spin');
    const [list] = parsePeakLists('1H NMR (400 MHz, CDCl3) δ 7.40 – 7.20 (m, 5H)');
    const lines = measuredLines(list, 400);
    const hz = Float64Array.from({ length: 400 }, (_, k) => (7.18 + (k / 399) * 0.24) * 400);
    const y = lorentzian(lines, hz);
    const inside = [...y].filter((_, k) => hz[k] / 400 > 7.23 && hz[k] / 400 < 7.37);
    const max = Math.max(...inside), min = Math.min(...inside);
    expect(min / max).toBeGreaterThan(0.9);
  });

  it('labels predicted peaks with the chosen details', () => {
    const s = predictSpectrum(ea, h1, codes, 400);
    const d = { nuc: '1H' as const, spec: s, groupRows: s.groups.map((_, i) => i), rowLabels: s.groups.map((_, i) => `H${i + 1}`) };
    const r = autoRange(d);
    const all = { label: true, shift: true, mult: true, count: true, j: true, size: 10, place: 'above' as const, hover: false };
    const svg = spectrumSvg(d, { w: 400, h: 160, hi: r.hi, lo: r.lo, labels: true, peakLabels: all });
    expect(svg).toContain('H1');
    expect(svg).toMatch(/3H/);
    expect(svg).toMatch(/J = 7/);
    // hover mode: only the label until the row is hot
    const quiet = spectrumSvg(d, { w: 400, h: 160, hi: r.hi, lo: r.lo, labels: true, peakLabels: { ...all, hover: true } });
    expect(quiet).toContain('H1');
    expect(quiet).not.toMatch(/J = 7/);
  });
});
