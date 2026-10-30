// Insert > Structure from Name or SMILES takes SMILES as well as names (the web check found
// CC(N)C(=O)O sent to the name readers only): a molfile or SMILES string is drawn as it is.

import { describe, it, expect } from 'vitest';
import { molfileOrSmiles } from '../src/chem/text-molfile';

// stands in for RDKit: only these read as SMILES
const known: Record<string, string> = { 'CC(N)C(=O)O': 'alanine molfile\nM  END', c1ccccc1: 'benzene molfile\nM  END' };
const smilesToMol = async (s: string) => known[s] ?? null;

describe('molfile or SMILES', () => {
  it('reads SMILES, trimmed', async () => {
    expect(await molfileOrSmiles('CC(N)C(=O)O', smilesToMol)).toBe(known['CC(N)C(=O)O']);
    expect(await molfileOrSmiles('  c1ccccc1\n', smilesToMol)).toBe(known.c1ccccc1);
  });

  it('leaves names (and text with spaces) for the name readers', async () => {
    expect(await molfileOrSmiles('caffeine', smilesToMol)).toBeNull();
    expect(await molfileOrSmiles('ethyl acetate', smilesToMol)).toBeNull();
    expect(await molfileOrSmiles('   ', smilesToMol)).toBeNull();
  });

  it('keeps a molfile whole, blank name line and all', async () => {
    const mol = '\n  RDKit          2D\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n';
    expect(await molfileOrSmiles(mol, smilesToMol)).toBe(mol);
  });

  it('treats a SMILES reader that fails as no SMILES', async () => {
    expect(await molfileOrSmiles('CCO', async () => { throw new Error('bad'); })).toBeNull();
  });
});
