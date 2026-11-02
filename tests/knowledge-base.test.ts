// @vitest-environment jsdom
//
// The Knowledge Base: CAS numbers checked by their check digit, a typed shift finding the solvent
// it belongs to, tables the user imports from their own copies, and abbreviations explained on hover.

import { describe, expect, it } from 'vitest';
import { cellNumbers, findRows, isCas, parseUserTable, searchedShift, sortRows, tableTsv, filterValues } from '../src/kb/tables';
import { explainPieces, glossaryEntry, glossaryTip, GLOSSARY } from '../src/kb/glossary';
import { BUILT_IN_TABLES, GLOSSARY_TABLE, NMR_SOLVENTS } from '../src/kb/data';
import { explained, looksLikeSmiles } from '../src/ui/knowledge-base';

const names = (rows: { row: Record<string, unknown> }[]) => rows.map((m) => m.row.name);

describe('CAS numbers', () => {
  it('accepts numbers whose check digit is right', () => {
    expect(isCas('109-99-9')).toBe(true); // THF
    expect(isCas('7732-18-5')).toBe(true); // water
    expect(isCas('865-49-6')).toBe(true); // CDCl3
  });
  it('rejects a wrong check digit or a shape that is not a CAS number', () => {
    expect(isCas('109-99-8')).toBe(false);
    expect(isCas('109-9-9')).toBe(false);
    expect(isCas('7.26')).toBe(false);
  });
  it('every built-in CAS number is valid', () => {
    for (const t of BUILT_IN_TABLES) for (const r of t.rows) if (typeof r.cas === 'string') expect(isCas(r.cas), `${t.id} ${r.cas}`).toBe(true);
  });
});

describe('searching', () => {
  it('reads a number typed alone as a shift', () => {
    expect(searchedShift('7.26')).toBe(7.26);
    expect(searchedShift('2.50 ppm')).toBe(2.5);
    expect(searchedShift('δ 77.2')).toBe(77.2);
    expect(searchedShift('DMSO')).toBeNull();
    expect(cellNumbers('7.09, 7.01, 2.08')).toEqual([7.09, 7.01, 2.08]);
  });

  it('finds the solvent a peak belongs to, nearest first', () => {
    // pyridine-d5's 7.22 is within 0.05 too, and further away
    expect(names(findRows(NMR_SOLVENTS, '7.26'))).toEqual(['Chloroform-d', 'Pyridine-d5']);
    expect(names(findRows(NMR_SOLVENTS, '77.2'))).toEqual(['Chloroform-d']);
    // 1.56 is water in CDCl3; 1.52 water in CD2Cl2 is within 0.05 too, and further away
    // and CD3CN's 13C peak at 1.32 is within 0.5, ranked after the 1H matches
    expect(names(findRows(NMR_SOLVENTS, '1.55'))).toEqual(['Chloroform-d', 'Dichloromethane-d2', 'Acetonitrile-d3']);
    expect(findRows(NMR_SOLVENTS, '9.9')).toEqual([]);
  });

  it('finds by CAS number exactly, and by words in any column', () => {
    expect(names(findRows(NMR_SOLVENTS, '2206-27-1'))).toEqual(['Dimethyl sulfoxide-d6']);
    expect(names(findRows(NMR_SOLVENTS, 'cd3 methanol'))).toEqual(['Methanol-d4']);
  });

  it('matches structures the caller found equal', () => {
    const same = new Set(['[2H]C(Cl)(Cl)Cl']);
    expect(names(findRows(NMR_SOLVENTS, 'ClC([2H])(Cl)Cl', {}, same))).toEqual(['Chloroform-d']);
  });

  it('filters, sorts and copies', () => {
    expect(filterValues(GLOSSARY_TABLE, 'kind')).toContain('Safety');
    const safety = findRows(GLOSSARY_TABLE, '', { kind: 'Safety' });
    expect(safety.length).toBeGreaterThan(3);
    expect(safety.every((m) => m.row.kind === 'Safety')).toBe(true);
    const bp = NMR_SOLVENTS.columns.find((c) => c.key === 'bp')!;
    const sorted = sortRows(findRows(NMR_SOLVENTS, ''), bp, false);
    expect(sorted[0].row.name).toBe('Dichloromethane-d2');
    const tsv = tableTsv(NMR_SOLVENTS, findRows(NMR_SOLVENTS, '865-49-6')).split('\n');
    expect(tsv[0].split('\t')[0]).toBe('Solvent');
    expect(tsv[1].split('\t')[0]).toBe('Chloroform-d');
  });

  it('tells SMILES from names and CAS numbers', () => {
    expect(looksLikeSmiles('CC(=O)OCC')).toBe(true);
    expect(looksLikeSmiles('c1ccccc1')).toBe(true);
    expect(looksLikeSmiles('chloroform')).toBe(false);
    expect(looksLikeSmiles('109-99-9')).toBe(false);
  });
});

describe('tables imported by the user', () => {
  it('reads CSV with quotes, finds shift and filter columns, and stays personal', () => {
    const t = parseUserTable('Compound,Solvent,1H (ppm),13C (ppm),Note\n"Acetone, residual",CDCl3,2.17,30.6,"CH3"\nEthyl acetate,CDCl3,"2.05, 4.12",171.4,\nEthyl acetate,C6D6,1.65,170.4,', 'My impurities', 'user-1')!;
    expect(t.personal).toBe(true);
    expect(t.columns.map((c) => c.shift ?? null)).toEqual([null, null, '1H', '13C', null]);
    expect(t.columns.find((c) => c.key === 'solvent')!.filter).toBe(true);
    expect(t.rows[0].compound).toBe('Acetone, residual');
    expect(findRows(t, '2.17').map((m) => m.row.compound)).toEqual(['Acetone, residual']);
    expect(findRows(t, '4.12').map((m) => m.row.compound)).toEqual(['Ethyl acetate']);
    expect(findRows(t, '', { solvent: 'C6D6' })).toHaveLength(1);
  });

  it('reads tab-separated text pasted from a sheet', () => {
    const t = parseUserTable('Name\tbp\nTHF\t66\nEther\t35', 'Boiling points', 'user-2')!;
    expect(t.columns[1].numeric).toBe(true);
    expect(t.rows[1].bp).toBe(35);
  });

  it('refuses text that is not a table', () => {
    expect(parseUserTable('just one line', 'x', 'u')).toBeNull();
    expect(parseUserTable('one column\nvalue', 'x', 'u')).toBeNull();
  });
});

describe('abbreviations', () => {
  it('every entry says what it stands for, and terms are not repeated', () => {
    const seen = new Set<string>();
    for (const g of GLOSSARY) {
      expect(g.full, g.term).toBeTruthy();
      expect(seen.has(g.term.toLowerCase()), g.term).toBe(false);
      seen.add(g.term.toLowerCase());
    }
  });

  it('gives a one-line tip', () => {
    expect(glossaryEntry('idlh')?.term).toBe('IDLH');
    expect(glossaryTip('IDLH')).toMatch(/^IDLH: Immediately Dangerous to Life or Health\./);
  });

  it('explains the abbreviations in a line of text, and single letters only on their own', () => {
    const p = explainPieces('IDLH 50 ppm in DMSO');
    expect(p.filter((x) => x.tip).map((x) => x.text)).toEqual(['IDLH', 'ppm', 'DMSO']);
    expect(p.map((x) => x.text).join('')).toBe('IDLH 50 ppm in DMSO');
    expect(explainPieces('s')[0].tip).toMatch(/Singlet/);
    expect(explainPieces('is a solvent').some((x) => x.tip && x.text === 's')).toBe(false);
  });

  it('shows them as abbr elements with a title', () => {
    const div = document.createElement('div');
    div.append(explained('LD50 (rat, po)'));
    const abbr = [...div.querySelectorAll('abbr')].map((a) => a.textContent);
    // written LD₅₀ on screen (the data and a copy keep LD50)
    expect(abbr).toContain('LD₅₀');
    expect(div.textContent).toBe('LD₅₀ (rat, po)');
  });
});
