// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readBatchFile, splitSdf, splitSmilesList, uniqueName, writeBatchItem } from '../src/io/batch-convert';
import { ACS_1996 } from '../src/style';

const ETHANOL = `ethanol
  test

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
M  END`;

const deps = { style: ACS_1996, smilesToMol: async () => ETHANOL, molToSmiles: async () => 'CCO' };

describe('batch convert', () => {
  it('splits an SD file into records with their names', () => {
    const sdf = `${ETHANOL}\n> <MW>\n46.07\n\n$$$$\n${ETHANOL.replace('ethanol', '')}\n$$$$\n`;
    const recs = splitSdf(sdf);
    expect(recs.length).toBe(2);
    expect(recs[0].name).toBe('ethanol');
    expect(recs[0].molblock).not.toContain('<MW>');
    expect(recs[1].name).toBe('');
  });

  it('reads a SMILES list with names', () => {
    expect(splitSmilesList('SMILES Name\nCCO ethanol\n# note\nc1ccccc1\tbenzene ring\n\n')).toEqual([
      { smiles: 'CCO', name: 'ethanol' }, { smiles: 'c1ccccc1', name: 'benzene ring' },
    ]);
  });

  it('makes safe, different file names', () => {
    const used = new Set<string>();
    expect(uniqueName('a/b:c', 'mol', used)).toBe('a_b_c.mol');
    expect(uniqueName('A_b_c', 'mol', used)).toBe('A_b_c (2).mol');
    expect(uniqueName('', 'svg', used)).toBe('structure.svg');
  });

  it('turns an SD file into a molfile and CDXML per record', async () => {
    const sdf = `${ETHANOL}\n$$$$\n${ETHANOL}\n$$$$\n`;
    const { items, failed } = await readBatchFile('two.sdf', new TextEncoder().encode(sdf), deps);
    expect(failed).toBe(0);
    expect(items.map((i) => i.name)).toEqual(['ethanol', 'ethanol']);
    const mol = await writeBatchItem(items[0], 'mol');
    expect(String(mol)).toContain('M  END');
    const cdxml = await writeBatchItem(items[0], 'cdxml');
    expect(String(cdxml)).toContain('<CDXML');
    const back = await readBatchFile('back.cdxml', new TextEncoder().encode(String(cdxml)), deps);
    expect(back.items[0].doc.atoms.size).toBe(items[0].doc.atoms.size);
  });

  it('counts records it cannot read', async () => {
    const got = await readBatchFile('x.sdf', new TextEncoder().encode('junk\n$$$$\n'), deps);
    expect(got.items.length).toBe(0);
    const bad = await readBatchFile('x.txt', new Uint8Array(), deps);
    expect(bad.failed).toBe(1);
  });
});
