// The Solvents table (Murov, Table 1), the Miscibility chart and the Acids and Bases tables.

import { describe, expect, it } from 'vitest';
import { SOLVENTS_TABLE, SOLVENT_SMILES, solventPicture } from '../src/kb/solvents';
import { ACIDS_TABLE, IMMISCIBLE, MISCIBILITY_TABLE, MISCIBLE_SOLVENTS, immiscible } from '../src/kb/lab-tables';
import { BUILT_IN_TABLES } from '../src/kb/data';
import { findRows, sortRows, tableTsv } from '../src/kb/tables';

describe('Solvents', () => {
  it('holds all 64 solvents of Murov Table 1, each with a drawing for the pointer', () => {
    expect(SOLVENTS_TABLE.rows).toHaveLength(64);
    expect(new Set(SOLVENT_SMILES).size).toBe(64);
    for (const r of SOLVENTS_TABLE.rows) expect(solventPicture(r), String(r.name)).not.toBeNull();
    expect(SOLVENTS_TABLE.columns.map((c) => c.key)).not.toContain('formula');
  });

  it('copies the values as printed', () => {
    const row = (n: string) => SOLVENTS_TABLE.rows.find((r) => r.name === n)!;
    expect(row('Water')).toMatchObject({ bp: '100.00', mp: '0.00', polarity: '1.000' });
    expect(row('Acetone').water).toBe('Miscible');
    // corrected from the measured value: Murov repeats the solubility figure (0.59) here
    expect(row('1-Hexanol').viscosity).toBe('4.6');
  });

  it('finds solvents by their other names', () => {
    expect(findRows(SOLVENTS_TABLE, 'DMF').map((m) => m.row.name)).toContain('N,N-Dimethylformamide');
    expect(findRows(SOLVENTS_TABLE, 'methylene chloride').map((m) => m.row.name)).toEqual(['Dichloromethane']);
  });

  it('sorts "Miscible" above every number in the water column', () => {
    const water = SOLVENTS_TABLE.columns.find((c) => c.key === 'water')!;
    const sorted = sortRows(findRows(SOLVENTS_TABLE, ''), water, true);
    expect(String(sorted[0].row.water)).toMatch(/^Miscible/);
    const polarity = SOLVENTS_TABLE.columns.find((c) => c.key === 'polarity')!;
    expect(sortRows(findRows(SOLVENTS_TABLE, ''), polarity, true)[0].row.name).toBe('Water');
  });
});

describe('Miscibility', () => {
  it('names only solvents on the chart, each pair once', () => {
    expect(MISCIBLE_SOLVENTS).toHaveLength(31);
    expect(IMMISCIBLE).toHaveLength(41);
    expect(immiscible('Xylene', 'Trichloroethylene')).toBe(false);
    const seen = new Set<string>();
    for (const [a, b] of IMMISCIBLE) {
      expect(MISCIBLE_SOLVENTS).toContain(a);
      expect(MISCIBLE_SOLVENTS).toContain(b);
      const key = [a, b].sort().join('|');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('answers either way round', () => {
    expect(immiscible('Water', 'Hexane')).toBe(true);
    expect(immiscible('Hexane', 'Water')).toBe(true);
    expect(immiscible('Water', 'Methanol')).toBe(false);
    expect(MISCIBILITY_TABLE.rows.find((r) => r.name === 'Acetone')?.immiscible).toBe('Mixes with all the others');
    expect(MISCIBILITY_TABLE.matrix?.names).toBe(MISCIBLE_SOLVENTS);
  });
});

describe('Acids and Bases', () => {
  const MW: Record<string, number> = {
    'Acetic acid': 60.05, 'Ammonia (ammonium hydroxide)': 17.03, 'Formic acid': 46.03, 'Hydrochloric acid': 36.46,
    'Nitric acid': 63.01, 'Perchloric acid': 100.46, 'Phosphoric acid': 98.0, 'Sulfuric acid': 98.08,
  };
  const conc = ACIDS_TABLE.rows.filter((r) => r.part === 'conc');

  it('gives molarities that agree with % × specific gravity × 10 ÷ molar mass', () => {
    expect(conc).toHaveLength(11);
    for (const r of conc) {
      const m = Number(r.molarity);
      const calc = (Number(r.percent) * Number(r.sg) * 10) / MW[String(r.name)];
      expect(Math.abs(calc - m) / m, `${r.name} ${r.percent}%`).toBeLessThan(0.02);
      expect(Math.abs(1000 / m - Number(r.ml)), `${r.name} ${r.percent}%`).toBeLessThan(0.5);
    }
  });

  it('keeps one decimal as printed, and copies each part under its own title', () => {
    expect(conc.find((r) => r.name === 'Phosphoric acid')?.molarity).toBe('16.0');
    expect(conc.find((r) => r.name === 'Hydrochloric acid')?.sg).toBe(1.18);
    expect(ACIDS_TABLE.rows.find((r) => r.name === 'Tartaric acid')?.ph).toBe('2.0');
    expect(ACIDS_TABLE.rows.filter((r) => r.part === 'ph')).toHaveLength(33);
    const tsv = tableTsv(ACIDS_TABLE, findRows(ACIDS_TABLE, '')).split('\n');
    expect(tsv[0]).toBe('Concentrated reagents');
    expect(tsv).toContain('pH of solutions');
  });

  it('sits in the window after Solvents and Miscibility', () => {
    const ids = BUILT_IN_TABLES.map((t) => t.id);
    expect(ids.slice(1, 4)).toEqual(['solvents', 'miscibility', 'acids-bases']);
    for (const gone of ['nmr-solvents', 'handling', 'techniques', 'solubility', 'green-nmr']) expect(ids).not.toContain(gone);
  });
});

describe('Hammett original sources', () => {
  it('names the paper behind each value, as Tables I and V cite them', async () => {
    const { HAMMETT, originalSources } = await import('../src/kb/hammett');
    const { HAMMETT_TABLE } = await import('../src/kb/hammett-table');
    const row = (g: string) => HAMMETT_TABLE.rows.find((r) => r.group === g)!;
    expect(row('CH3').refs).toBe('σm, σp: McDaniel and Brown, J. Org. Chem. 1958, 23, 420. σp⁺: Brown and Okamoto, J. Am. Chem. Soc. 1958, 80, 4979. σp⁻: Shabarov et al., Zh. Org. Khim. 1968, 4, 1131');
    expect(row('H').refs).toBe('Definition');
    expect(row('BF2').refs).toBe('Sheppard and Sharts, Organic Fluorine Chemistry (Benjamin, 1969), p 348');
    for (const x of HAMMETT) expect(originalSources(x), x.group).not.toMatch(/undefined|ref\. \d/);
    expect(HAMMETT.filter((x) => originalSources(x) === 'Definition').map((x) => x.group)).toEqual(['H']);
  });
});

describe('Hammett Tables I and V', () => {
  it('holds all 530 groups of Table I and the σp⁺ and σp⁻ of Table V', async () => {
    const { HAMMETT } = await import('../src/kb/hammett');
    expect(HAMMETT.filter((x) => x.row !== null)).toHaveLength(530);
    expect(new Set(HAMMETT.map((x) => x.row).filter((r) => r !== null)).size).toBe(530);
    expect(HAMMETT.filter((x) => x.vrow !== undefined)).toHaveLength(222);
    const g = (s: string) => HAMMETT.find((x) => x.group === s)!;
    expect([g('NO2').spPlus, g('NO2').spMinus]).toEqual([0.79, 1.27]);
    expect([g('OCH3').spPlus, g('OCH3').spMinus]).toEqual([-0.78, -0.26]);
    // a group Table V has and Table I doesn't
    expect(g('SeC6H5')).toMatchObject({ sm: null, sp: null, spPlus: -0.47, spMinus: 0.13, row: null });
  });

  it('agrees with the paper\'s own equations: F from eq 8, R = σp − F', async () => {
    const { HAMMETT } = await import('../src/kb/hammett');
    for (const x of HAMMETT) {
      if (x.sm === null || x.sp === null || x.uncertain || x.group === 'H') continue;
      expect(Math.abs(1.297 * x.sm - 0.385 * x.sp + 0.033 - x.F!), `${x.group} F`).toBeLessThan(0.015);
      expect(Math.abs(x.sp - x.F! - x.R!), `${x.group} R`).toBeLessThan(0.025);
    }
  });

  it('keeps the brackets on the values the paper marks, one by one', async () => {
    const { HAMMETT_TABLE } = await import('../src/kb/hammett-table');
    const row = (g: string) => HAMMETT_TABLE.rows.find((r) => r.group === g)!;
    expect(row('SO2Cl')).toMatchObject({ sm: '1.20', sp: '1.11', F: '1.16', R: '(-0.05)' });
    expect(row('Sn(C6H5)3')).toMatchObject({ sm: '(0.53)', sp: '(0.27)', F: '(0.62)', R: '(-0.35)' });
    expect(String(row('P(CH3)(C6H4-4-Me)2⁺').refs)).toContain('R corrected');
  });

  it('can be filtered by the atom that joins the ring', async () => {
    const { HAMMETT_TABLE } = await import('../src/kb/hammett-table');
    const joins = (g: string) => HAMMETT_TABLE.rows.find((r) => r.group === g)!.joins;
    expect([joins('NO2'), joins('OCH3'), joins('CF3'), joins('SF5'), joins('Cl'), joins('OCH2O'), joins('Si(CH3)3')]).toEqual(['Nitrogen', 'Oxygen', 'Carbon', 'Sulfur', 'Halogen', 'Fused ring (3,4-)', 'Silicon']);
  });
});
