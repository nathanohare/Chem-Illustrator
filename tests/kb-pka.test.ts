// The Knowledge Base's big pKa table: Bordwell's DMSO values (Reich's compilation) and the water
// values of Williams' compilation, only those the compilations credit to a paper or book, each with
// its drawing, the hydrogen that comes off, and links to the paper and PubChem.

import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { PKA_VALUES, PKA_VALUES_TABLE, pkaPicture } from '../src/kb/pka';
import { LATER_TABLES } from '../src/kb/data';
import { findRows } from '../src/kb/tables';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const rows = PKA_VALUES_TABLE.rows;
const find = (name: string, solvent: string) => rows.filter((r) => r.name === name && r.solvent === solvent).map((r) => r.pka);
const firstNumber = (s: unknown) => Number(/-?\d+(?:\.\d+)?/.exec(String(s))?.[0]);

describe('the pKa Values table', () => {
  it('is one of the tables loaded when the Knowledge Base opens', async () => {
    const tables = await Promise.all(LATER_TABLES.map((t) => t()));
    expect(tables.map((t) => t.id)).toContain('pka');
  });

  it('holds both compilations, and only values with a source', () => {
    const reich = PKA_VALUES.filter((v) => v.from === 'reich');
    const williams = PKA_VALUES.filter((v) => v.from === 'williams');
    expect(reich.length).toBeGreaterThan(400);
    expect(williams.length).toBeGreaterThan(1600);
    expect(reich.every((v) => v.solvent === 'DMSO')).toBe(true);
    for (const v of PKA_VALUES) expect(v.papers.length, v.name).toBeGreaterThan(0);
    for (const r of rows) expect(String(r.refs), String(r.name)).not.toMatch(/unpublished|no reference/i);
    expect(PKA_VALUES_TABLE.about).toContain(rows.length.toLocaleString('en-US'));
  });

  it('has the values as the compilations give them, in each solvent', () => {
    expect(find('Acetic acid', 'DMSO')).toEqual(['12.6']);
    expect(find('Acetic acid', 'Water')).toContain('4.76');
    expect(find('Benzoic acid', 'DMSO')).toEqual(['11.1']);
    expect(find('Glycine', 'Water')).toContain('2.34, 9.6');
    expect(find('Water', 'DMSO')).toEqual(['31.4']);
    const solvents = new Set(rows.map((r) => r.solvent));
    expect([...solvents]).toEqual(expect.arrayContaining(['DMSO', 'Water', '50% ethanol']));
  });

  it('lists the most acidic first, with approximate values marked ~', () => {
    const n = rows.map((r) => firstNumber(r.pka));
    expect(n.every((x, i) => i === 0 || x >= n[i - 1])).toBe(true);
    expect(rows.some((r) => String(r.pka).startsWith('~'))).toBe(true);
    for (const r of rows) expect(String(r.pka), String(r.name)).toMatch(/^~?\(?-?\d/);
  });

  it('names the hydrogen that comes off for every row', () => {
    const sites = new Set(rows.map((r) => String(r.site)));
    for (const s of sites) expect(s).toMatch(/^(C|N|O|S|Se|Te|Ge|F|Cl|Br|I)–H((, | or )(C|N|O|S|Se|Te)–H)*$/);
    expect(rows.find((r) => r.name === 'Glycine' && r.pka === '2.34, 9.6')?.site).toBe('N–H, O–H');
  });

  it('draws every compound, and keeps its SMILES in canonical form for the structure search', () => {
    for (const r of rows) {
      expect(pkaPicture(r), String(r.smiles)).not.toBeNull();
      const m = RDKit.get_mol(String(r.smiles));
      try { expect(m.get_smiles(), String(r.name)).toBe(r.smiles); } finally { m.delete(); }
    }
  });

  it('links each row to PubChem and to its papers that have a DOI', () => {
    const benzoic = rows.find((r) => r.name === 'Benzoic acid' && r.solvent === 'DMSO')!;
    const links = PKA_VALUES_TABLE.links!(benzoic);
    expect(links[0]).toEqual({ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${benzoic.cid}` });
    expect(links[1]).toEqual({ label: 'Olmstead 1980', url: 'https://doi.org/10.1021/jo01304a033' });
    const withDoi = rows.filter((r) => PKA_VALUES_TABLE.links!(r).some((l) => l.url?.startsWith('https://doi.org/')));
    expect(withDoi.length).toBeGreaterThan(rows.length / 2);
  });

  it('is found by name and by the words of its notes', () => {
    expect(findRows(PKA_VALUES_TABLE, 'glycine').length).toBeGreaterThan(5);
    expect(findRows(PKA_VALUES_TABLE, 'conjugate acid').length).toBeGreaterThan(10);
  });
});
