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
    expect(IMMISCIBLE).toHaveLength(42);
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
