// Settings ▸ Analysis and the panel's Customize share one set of settings: bench values read
// from PubChem's text, lab calculations, the saved settings, and what the panel, ribbon box and
// attached descriptors show from them.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { panelProps } from '../src/chem/props';
import { readTemperature, readDensity, readPressure, readRefractiveIndex, labCalc, newCalc, sigFig } from '../src/chem/bench';
import { parseAnalysisPrefs, DEFAULT_ANALYSIS, pressureText, tempText } from '../src/chem/analysis-prefs';

describe('bench values from PubChem text', () => {
  it('reads temperatures in °C, °F and K, ranges by their first number', () => {
    expect(readTemperature(['115.2 °C'])).toBeCloseTo(115.2);
    expect(readTemperature(['239 °F (NTP, 1992)'])).toBeCloseTo(115, 0);
    expect(readTemperature(['388 K'])).toBeCloseTo(114.85, 2);
    expect(readTemperature(['-42 to -41 °C'])).toBe(-42);
    expect(readTemperature(['no number here'])).toBeNull();
  });
  it('reads densities in g/mL, kg/m³ and relative density', () => {
    expect(readDensity(['0.9819 g/cu cm at 20 °C'])).toBeCloseTo(0.9819);
    expect(readDensity(['982 kg/m3'])).toBeCloseTo(0.982);
    expect(readDensity(['Relative density (water = 1): 0.98'])).toBeCloseTo(0.98);
    expect(readDensity(['1.05'])).toBeCloseTo(1.05);
  });
  it('reads vapor pressures into kPa', () => {
    expect(readPressure(['20.8 mm Hg at 25 °C'])).toBeCloseTo(2.773, 2);
    expect(readPressure(['2.8 kPa'])).toBeCloseTo(2.8);
    expect(readPressure(['1.2X10-3 mm Hg at 25 °C'])).toBeCloseTo(1.6e-4, 5);
    expect(readPressure(['0.03 atm'])).toBeCloseTo(3.04, 2);
  });
  it('reads a refractive index', () => {
    expect(readRefractiveIndex(['1.5095 at 20 °C/D'])).toBeCloseTo(1.5095);
  });
});

describe('lab calculations', () => {
  it('gives the mass and neat volume of 0.5 mmol', () => {
    // pyridine: 79.10 g/mol, 0.982 g/mL
    expect(labCalc(newCalc('1'), { mw: 79.1, density: 0.982, liquid: true })).toEqual(['39.6 mg', '40.3 µL']);
  });
  it('gives no neat volume for a solid, and mmol for an amount by mass', () => {
    expect(labCalc({ ...newCalc('1'), unit: 'mg', amount: 100 }, { mw: 122.12, density: 1.27, liquid: false })).toEqual(['0.819 mmol']);
  });
  it('works an amount in equiv from the scale, and a solution volume', () => {
    const c = { ...newCalc('1'), unit: 'equiv' as const, amount: 1.2, scale: 2, volume: false, solution: 2 };
    expect(labCalc(c, { mw: 100, density: null, liquid: null })).toEqual(['2.40 mmol', '240 mg', '1.20 mL of 2 M']);
  });
  it('can\'t work a volume without a density', () => {
    expect(labCalc({ ...newCalc('1'), unit: 'uL', amount: 50 }, { mw: 100, density: null, liquid: true })).toEqual([]);
  });
  it('writes significant figures', () => {
    expect(sigFig(39.55, 3)).toBe('39.6');
    expect(sigFig(1234, 3)).toBe('1234');
    expect(sigFig(0.0123, 2)).toBe('0.012');
  });
});

describe('saved Analysis settings', () => {
  it('starts with the defaults', () => {
    const p = parseAnalysisPrefs(null);
    expect(p).toEqual(DEFAULT_ANALYSIS);
    expect(p.rows.find((r) => r.key === 'density')?.on).toBe(true);
    expect(p.rows.find((r) => r.key === 'vp')?.on).toBe(false);
    expect(p.ribbon).toEqual({ lines: ['mw', 'exact', 'mz'], simple: 'mw' });
  });
  it('keeps a saved order and adds rows that came later', () => {
    const p = parseAnalysisPrefs({ rows: [{ key: 'mw', on: true }, { key: 'exact', on: false }] });
    const at = (k: string) => p.rows.findIndex((r) => r.key === k);
    expect(at('mw')).toBeLessThan(at('exact'));
    expect(p.rows[at('exact')].on).toBe(false);
    expect(p.rows.length).toBe(DEFAULT_ANALYSIS.rows.length);
  });
  it('drops rows and ribbon lines it doesn\'t know', () => {
    const p = parseAnalysisPrefs({ rows: [{ key: 'nonsense', on: true }], ribbon: { lines: ['nonsense', 'mw', 'calc:9'], simple: 'exact' } });
    expect(p.rows.some((r) => (r.key as string) === 'nonsense')).toBe(false);
    expect(p.ribbon.lines).toEqual(['', 'mw', '']);
    expect(p.ribbon.simple).toBe('exact');
  });
  it('writes temperatures and pressures in the chosen units', () => {
    expect(tempText(100, '°F')).toContain('212');
    expect(tempText(25, 'K')).toContain('298');
    expect(pressureText(2.773, 'mmHg')).toBe('21 mmHg');
    expect(pressureText(1.6e-4, 'kPa')).toBe('1.6 × 10^-4 kPa');
  });
});

describe('what the settings show', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  beforeAll(async () => {
    const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
    const m = RDKit.get_mol('c1ccncc1');
    r = { formula: 'C5H5N', exact: 79.0422, mw: 79.1, charge: 0, smiles: 'c1ccncc1', props: panelProps(RDKit, m) };
    m.delete();
  }, 30000);
  const bench = { density: { v: 0.982, measured: true }, bp: { v: 115.2, measured: true } };

  it('puts the panel rows in the chosen order, and leaves hidden rows out', async () => {
    const { analysisHtml } = await import('../src/ui/analysis-panel');
    const prefs = structuredClone(DEFAULT_ANALYSIS);
    const at = (k: string) => prefs.rows.findIndex((x) => x.key === k);
    // Mol. wt. first, exact mass hidden
    prefs.rows.unshift(prefs.rows.splice(at('mw'), 1)[0]);
    prefs.rows[at('exact')].on = false;
    prefs.rows[at('calc:1')].on = true;
    const html = analysisHtml(r, 0, '[M+H]+', { prefs, bench, ions: ['[M+H]+'] });
    expect(html).not.toContain('Exact mass');
    expect(html.indexOf('Mol. wt.')).toBeLessThan(html.indexOf('m/z') >= 0 ? html.indexOf('data-adduct') : Infinity);
    expect(html).toContain('0.982 g/mL');
    expect(html).toContain('39.6 mg');
    expect(html).toContain('40.3 µL');
    // the HRMS and Anal. buttons sit at the ends of their rows
    expect(html).toMatch(/<td class="an-act-cell"><button[^>]*data-insert="hrms:0"/);
    expect(html).toMatch(/<td class="an-act-cell"><button[^>]*data-insert="ea:0"/);
    // customizing: hidden rows shown dimmed, with grips and boxes
    const edit = analysisHtml(r, 0, '[M+H]+', { prefs, bench, ions: ['[M+H]+'], customize: true });
    expect(edit).toMatch(/<tr data-row="exact" class="an-off">/);
    expect(edit).toContain('data-grip');
  });

  it('writes the ribbon box lines and the attached descriptors from the settings', async () => {
    const { ribbonRow, descriptorRuns } = await import('../src/ui/analysis-panel');
    const prefs = structuredClone(DEFAULT_ANALYSIS);
    expect(ribbonRow('mw', r, '[M+H]+', prefs, bench)).toEqual({ label: 'Mol. wt.', short: 'MW', value: '79.10' });
    expect(ribbonRow('mz', r, '[M+H]+', prefs, bench)?.value).toBe('80.0495');
    expect(ribbonRow('bp', r, '[M+H]+', prefs, bench)?.value).toBe('115 °C');
    expect(ribbonRow('calc:1', r, '[M+H]+', prefs, bench)?.value).toBe('39.6 mg · 40.3 µL');
    expect(ribbonRow('vp', r, '[M+H]+', prefs, bench)).toBeNull();
    prefs.dp.mw = 1;
    expect(ribbonRow('mw', r, '[M+H]+', prefs, bench)?.value).toBe('79.1');

    const d = structuredClone(DEFAULT_ANALYSIS);
    const mw = d.descriptors.find((x) => x.key === 'mw')!;
    mw.label = 'MW:';
    mw.dp = 1;
    const text = (runs: { text: string }[]) => runs.map((x) => x.text).join('');
    expect(text(descriptorRuns(r, ['mw', 'formula'], '[M+H]+', d, bench))).toBe('C5H5N\nMW: 79.1');
    expect(text(descriptorRuns(r, ['calc:1'], '[M+H]+', d, bench))).toBe('0.5 mmol: 39.6 mg, 40.3 µL');
  });
});
