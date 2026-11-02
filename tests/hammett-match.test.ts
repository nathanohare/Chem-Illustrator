// Hammett constants read off drawn rings: the group at each marked position of a core is found,
// placed (ortho, meta, para from the reaction centre) and looked up in Hansch, Leo and Taft's table.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { hammettSites, H_ROW, type HammettSite } from '../src/chem/hammett-match';
import { HAMMETT } from '../src/kb/hammett';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const sites = (smiles: string, core: string): HammettSite[] => {
  const r = hammettSites(RDKit, smiles, core);
  if ('error' in r) throw new Error(r.error);
  return r.sites;
};
const group = (s: HammettSite) => (s.row >= 0 ? HAMMETT[s.row].group : s.smiles);
const PARA = '[NH2:1]c1ccc(*)cc1';

describe('Hammett groups on a marked ring', () => {
  it('finds the para group of anilines', () => {
    const got = ['COc1ccc(N)cc1', 'Cc1ccc(N)cc1', 'Nc1ccccc1', 'Fc1ccc(N)cc1', 'Clc1ccc(N)cc1', 'FC(F)(F)c1ccc(N)cc1', 'Nc1ccc(cc1)[N+](=O)[O-]', 'N#Cc1ccc(N)cc1']
      .map((s) => sites(s, PARA)[0]);
    expect(got.map(group)).toEqual(['OCH3', 'CH3', 'H', 'F', 'Cl', 'CF3', 'NO2', 'CN']);
    expect(got.every((s) => s.place === 'para')).toBe(true);
    expect(got[2].row).toBe(H_ROW);
  });

  it('reads a meta position whichever way round the ring the group was drawn', () => {
    const META = '[NH2:1]c1cccc(*)c1';
    for (const s of ['Nc1cccc(Cl)c1', 'Nc1cc(Cl)ccc1', 'Clc1cccc(N)c1']) {
      const [x] = sites(s, META);
      expect(group(x)).toBe('Cl');
      expect(x.place).toBe('meta');
    }
  });

  it('finds the centre without a map when one ring atom carries it', () => {
    const [x] = sites('OC(=O)c1ccc(OC)cc1', 'OC(=O)c1ccc(*)cc1');
    expect(group(x)).toBe('OCH3');
    expect(x.place).toBe('para');
  });

  it('works where the reaction centre is further from the ring (benzylic) and on whole molecules', () => {
    const core = '[CH2:1](Br)c1ccc(*)cc1';
    expect(group(sites('BrCc1ccc(cc1)C(=O)OC', core)[0])).toBe('COOCH3');
    // an amide made from the aniline still matches the aniline core
    expect(group(sites('CC(=O)Nc1ccc(Br)cc1', PARA)[0])).toBe('Br');
  });

  it('gives each site of a disubstituted ring', () => {
    const got = sites('Nc1cc(Cl)cc(Cl)c1', '[NH2:1]c1cc(*)cc(*)c1');
    expect(got.map(group)).toEqual(['Cl', 'Cl']);
    expect(got.map((s) => s.place)).toEqual(['meta', 'meta']);
  });

  it('says when a group is not in the table, or closes a fused ring', () => {
    const [x] = sites('Nc1ccc(cc1)C1CCCCCCC1', PARA);
    expect(x.row).toBe(-1);
    expect(x.smiles).toBe('*C1CCCCCCC1');
    const [f] = sites('Nc1ccc2ccccc2c1', '[NH2:1]c1ccc(*)cc1');
    expect(f.fused).toBe(true);
  });

  it('explains what is wrong', () => {
    expect(hammettSites(RDKit, 'Nc1ccccc1', 'Nc1ccccc1')).toEqual({ error: expect.stringMatching(/\*/) });
    expect(hammettSites(RDKit, 'CCO', PARA)).toEqual({ error: expect.stringMatching(/core/) });
  });
});
