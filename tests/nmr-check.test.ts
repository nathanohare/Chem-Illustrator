import { describe, expect, it } from 'vitest';
import { checkData, parsePeakLists, type PredictedRow } from '../src/chem/nmr/check';

const SI = '1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.7 Hz, 2H), 6.85 (d, J = 8.7 Hz, 2H), 6.45 (d, J = 15.9 Hz, 1H), 6.13 (dt, J = 15.9, 7.1 Hz, 1H), 4.17 (q, J = 7.1 Hz, 2H), 3.80 (s, 3H), 3.20 (dd, J = 7.1, 1.4 Hz, 2H), 2.05 (s, 0.4H), 1.27 (t, J = 7.1 Hz, 3H); 13C NMR (101 MHz, CDCl3) δ 171.6, 159.2, 133.1, 129.9, 127.4 (2C), 120.0, 114.0 (2C), 60.8, 55.3, 38.4, 14.3.';

// ethyl (E)-4-(4-methoxyphenyl)but-3-enoate, predicted
const H: PredictedRow[] = [
  { shift: 7.28, spread: 0.09, n: 2, mult: 'd', j: [7.9], label: 'C8, C9' },
  { shift: 6.85, spread: 0.10, n: 2, mult: 'd', j: [7.9], label: 'C10, C12' },
  { shift: 6.47, spread: 0.15, n: 1, mult: 'd', j: [15.5], label: 'C6' },
  { shift: 6.31, spread: 0.08, n: 1, mult: 'dt', j: [15.5, 6.8], label: 'C5' },
  { shift: 4.15, spread: 0.09, n: 2, mult: 'q', j: [7.1], label: 'C2' },
  { shift: 3.81, spread: 0.08, n: 3, mult: 's', label: 'C13' },
  { shift: 3.23, spread: 0.14, n: 2, mult: 'd', j: [6.8], label: 'C4' },
  { shift: 1.25, spread: 0.09, n: 3, mult: 't', j: [7.1], label: 'C1' },
];

describe('Check Data', () => {
  it('reads 1H and 13C lists from one SI paragraph', () => {
    const [h, c] = parsePeakLists(SI);
    expect(h.nuc).toBe('1H');
    expect(h.sf).toBe(400);
    expect(h.solvent).toBe('CDCl3');
    expect(h.peaks.length).toBe(9);
    expect(h.peaks[3]).toMatchObject({ value: 6.13, mult: 'dt', j: [15.9, 7.1], n: 1 });
    expect(h.peaks[7]).toMatchObject({ value: 2.05, mult: 's', n: 0.4 });
    expect(c.nuc).toBe('13C');
    expect(c.peaks.length).toBe(11);
    expect(c.peaks[4]).toMatchObject({ value: 127.4, n: 2 });
  });

  it('reads ranges, broad and apparent multiplets', () => {
    const [h] = parsePeakLists('1H NMR (500 MHz, DMSO-d6) δ 7.40–7.28 (m, 5H), 5.10 (br s, 1H), 2.50 (app t, J = 7.0 Hz, 2H), 1.95 (quint, J = 7.0 Hz, 2H)');
    expect(h.solvent).toBe('DMSO-d6');
    expect(h.peaks[0]).toMatchObject({ lo: 7.28, hi: 7.4, mult: 'm', n: 5 });
    expect(h.peaks[1].mult).toBe('br s');
    expect(h.peaks[2].mult).toBe('app t');
    expect(h.peaks[3].mult).toBe('p');
  });

  it('matches peaks to atoms and flags what does not fit', () => {
    const [h] = parsePeakLists(SI);
    const r = checkData(h, H, [{ name: 'Water', shift: 1.56 }, { name: 'CHCl3', shift: 7.26 }]);
    expect(r.found).toBe(8);
    expect(r.rows.map((m) => m.peak)).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
    expect(r.rows[3].status).toBe('off'); // 6.13 vs 6.31 ±0.08
    expect(r.rows.filter((m) => m.status === 'off').length).toBe(1);
    expect(r.rows[6].pattern).toBe('predicted d, J = 6.8 Hz');
    expect(r.extras).toEqual([{ peak: 7, n: 0.4, maybe: undefined }]);
    const text = r.findings.map((f) => f.text).join('\n');
    expect(text).toContain('8 of 8 predicted signals found');
    expect(text).toContain('2.05 (s, 0.4H) has no match');
    expect(text).toContain('0.18 ppm from C5');
  });

  it('names a solvent peak and notes a missing signal', () => {
    const [h] = parsePeakLists('1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.7 Hz, 2H), 6.85 (d, J = 8.7 Hz, 2H), 4.17 (q, J = 7.1 Hz, 2H), 3.80 (s, 3H), 1.56 (s, 0.8H), 1.27 (t, J = 7.1 Hz, 3H)');
    const r = checkData(h, H, [{ name: 'Water', shift: 1.56 }]);
    expect(r.extras[0].maybe).toBe('Water');
    expect(r.rows.filter((m) => m.status === 'missing').length).toBe(3);
    expect(r.findings.some((f) => f.text.startsWith('No peak for C5'))).toBe(true);
  });

  it('checks a 13C list', () => {
    const [, c] = parsePeakLists(SI);
    const rows: PredictedRow[] = [171.2, 158.9, 132.6, 129.6, 127.3, 120.5, 114.0, 60.7, 55.3, 38.1, 14.2].map((v, k) => ({ shift: v, spread: 1.5, n: 1, label: `C${k + 1}` }));
    const r = checkData(c, rows, [{ name: 'CDCl3', shift: 77.16 }]);
    expect(r.found).toBe(11);
    expect(r.extras.length).toBe(0);
  });
});
