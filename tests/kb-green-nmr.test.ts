// The Green Solvents in NMR table (Cseri et al. 2023, CC BY 4.0): its rows from the retyped tables,
// finding a stray peak by shift (inside a printed range too), and the solvents a compound would not
// dissolve in.

import { describe, expect, it } from 'vitest';
import { GREEN_NMR_TABLE as T, GREEN_SMILES, greenNmrRows } from '../src/kb/green-nmr';
import { cellShiftRanges, findRows } from '../src/kb/tables';
import { LATER_TABLES } from '../src/kb/data';

const row = (name: string, solvent: string, atom: string) => T.rows.find((r) => r.name === name && r.solvent === solvent && r.atom === atom);

describe('the table', () => {
  it('holds every compound in all eight solvents, 1H and 13C', () => {
    expect(new Set(T.rows.map((r) => r.name)).size).toBe(51);
    expect(new Set(T.rows.map((r) => r.solvent))).toEqual(new Set(['Acetone-d6', 'CD3CN', 'CDCl3', 'DMSO-d6', 'CD3OD', 'THF-d8', 'Toluene-d8', 'D2O']));
    expect(T.rows.length).toBeGreaterThan(4000);
    expect(T.sources[0].url).toBe('https://doi.org/10.1021/acssuschemeng.3c00244');
  });

  it('reads the printed values', () => {
    expect(row('γ-Valerolactone', 'CDCl3', 'H5')).toMatchObject({ nucleus: '1H', nh: '1H', h: '4.65', mult: 'dquint.', j: '7.8, 6.3' });
    expect(row('Cyrene', 'DMSO-d6', 'C4')).toMatchObject({ nucleus: '13C', c: '201.30' });
    expect(row('Choline L-lactate', 'Acetone-d6', 'C2')).toMatchObject({ c: '69.21', mult: 't', j: '2.6 (14N-13C)' });
    expect(row('bmim OAc', 'D2O', 'C5')?.c).toBe('125.04, 152.00');
  });

  it('loads with the window, not at start-up', async () => {
    const tables = await Promise.all(LATER_TABLES.map((f) => f()));
    expect(tables.some((t) => t.id === 'green-nmr')).toBe(true);
  });
});

describe('finding a peak', () => {
  it('finds the nearest signal in the solvent picked', () => {
    const hits = findRows(T, '4.65', { solvent: 'CDCl3', nucleus: '1H' });
    expect(hits[0].row.name).toBe('γ-Valerolactone');
    expect(hits[0].off).toBe(0);
  });

  it('counts a shift inside a printed multiplet range', () => {
    expect(cellShiftRanges('3.69–3.46')).toEqual([[3.46, 3.69]]);
    expect(cellShiftRanges('1.93–1.83, 1.80–1.72')).toEqual([[1.83, 1.93], [1.72, 1.8]]);
    const hits = findRows(T, '3.50', { solvent: 'DMSO-d6', nucleus: '1H' });
    expect(hits.find((h) => h.row.name === 'PPG 400' && h.row.atom === 'H5')?.off).toBe(0);
  });

  it('finds 13C peaks with the wider tolerance', () => {
    expect(findRows(T, '201.5', { solvent: 'DMSO-d6' })[0].row.name).toBe('Cyrene');
  });
});

describe('notes', () => {
  it('says where a compound would not dissolve', () => {
    expect(row('Glycerol', 'CDCl3', null as unknown as string)?.note).toMatch(/Not soluble/);
    expect(T.rows.some((r) => r.name === 'Glycerol' && r.solvent === 'CDCl3' && r.h !== null)).toBe(false);
  });

  it('never calls a reaction product insoluble where it simply is not made', () => {
    expect(T.rows.filter((r) => String(r.name).includes('(from ') && r.note === 'Not soluble enough to see.')).toEqual([]);
  });

  it('points from a compound to what it turns into', () => {
    expect(row('Diazabicycloundecene (DBU)', 'D2O', 'H2')?.note).toMatch(/azepanone/);
    expect(row('Cyclohexanone', 'CD3OD', 'H2')?.note).toMatch(/ketal/);
  });

  it('gives structures for the single compounds, none for mixtures', () => {
    expect(row('Limonene', 'CDCl3', 'H2')?.smiles).toBe(GREEN_SMILES.Limonene);
    expect(row('PEG 400', 'CDCl3', 'H3')?.smiles).toBeNull();
  });
});

describe('the transcription format', () => {
  it('reads a 1H line and a 13C line', () => {
    const rows = greenNmrRows([
      '# Table 1, page 1',
      'Testol|H1|3H|1.00|s|| N/A|N/A|| 2.00|d|7.0| 3.00–2.90|m|',
      '# Table 3 (13C), page 2',
      'Testol|C1|10.0|N/A|n.d.|11.0|12.0 (t; 3.0)|13.0|14.0|15.0/15.1',
    ].join('\n'));
    expect(rows.filter((r) => r.nucleus === '1H' && r.h).map((r) => [r.solvent, r.h])).toEqual([['Acetone-d6', '1.00'], ['CDCl3', '2.00'], ['DMSO-d6', '3.00–2.90']]);
    expect(rows.find((r) => r.solvent === 'CD3OD' && r.nucleus === '13C')).toMatchObject({ c: '12.0', mult: 't', j: '3.0 (14N-13C)' });
    expect(rows.find((r) => r.solvent === 'D2O' && r.nucleus === '13C')?.c).toBe('15.0, 15.1');
    // no 1H peak at all in CD3CN and no 13C in CD3CN or CDCl3: shown as not soluble
    expect(rows.filter((r) => r.note === 'Not soluble enough to see.').map((r) => `${r.solvent} ${r.nucleus}`)).toEqual(['CD3CN 1H', 'CD3CN 13C', 'CDCl3 13C']);
  });
});
