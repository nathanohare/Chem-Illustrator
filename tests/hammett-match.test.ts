// Hammett constants read off drawn rings: the group at each marked position of a core is found,
// placed (ortho, meta, para from the reaction centre) and looked up in Hansch, Leo and Taft's table.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { hammettSites, H_ROW, type HammettSite } from '../src/chem/hammett-match';
import { HAMMETT } from '../src/kb/hammett';
import { Doc } from '../src/model';
import { toMolfile } from '../src/chem/molfile';

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

describe('counted from an attachment point', () => {
  const at = (smiles: string, ref: string) => sites(smiles, ref);
  it('places every group on the nearest benzene ring', () => {
    const [x] = at('[102*]Nc1ccc(OC)cc1', 'wavy');
    expect([group(x), x.place, x.locant]).toEqual(['OCH3', 'para', 4]);
    const [y] = at('[102*]Nc1cccc(Cl)c1', 'wavy bond');
    expect([group(y), y.place, y.locant]).toEqual(['Cl', 'meta', 3]);
    // 3,4-dichloro: both, numbered the low way round
    expect(at('[101*]Nc1ccc(Cl)c(Cl)c1', 'star').map((s) => [group(s), s.place, s.locant])).toEqual([['Cl', 'meta', 3], ['Cl', 'para', 4]]);
  });

  it('gives hydrogen for a bare ring, and counts through a chain to the ring', () => {
    expect(at('[2*]Nc1ccccc1', '2').map(group)).toEqual(['H']);
    // a benzylic reference: the CH2 joins the ring
    expect(at('[102*]Cc1ccc(cc1)C(F)(F)F', 'wavy').map((s) => [group(s), s.place])).toEqual([['CF3', 'para']]);
    // the reference group on the ring itself isn't counted
    expect(at('[102*]C(=O)c1ccc([N+](=O)[O-])cc1', 'wavy').map(group)).toEqual(['NO2']);
  });

  it('reads a plain * typed in SMILES as the attachment point', () => {
    expect(at('*Nc1ccc(C)cc1', 'wavy').map(group)).toEqual(['CH3']);
  });

  it('says what is wrong', () => {
    expect(hammettSites(RDKit, '[101*]Nc1ccccc1', 'wavy')).toEqual({ error: expect.stringMatching(/no wavy-bond attachment point/) });
    expect(hammettSites(RDKit, '[102*]Nc1ccc(N[102*])cc1', 'wavy')).toEqual({ error: expect.stringMatching(/2 wavy-bond attachment points/) });
    expect(hammettSites(RDKit, '[102*]NC1CCCCC1', 'wavy')).toEqual({ error: expect.stringMatching(/no benzene ring/) });
  });
});

describe('attachment points drawn on a structure', () => {
  it('are written with their kinds, so the reference is found in the molfile', () => {
    // p-anisidine fragment, ArNH–, with a wavy bond on N and a star on the methoxy C
    const doc = new Doc();
    doc.edit('Draw', () => {
      const ring = Array.from({ length: 6 }, (_, i) => doc.addAtom(Math.cos((i * Math.PI) / 3) * 14.4, Math.sin((i * Math.PI) / 3) * 14.4));
      ring.forEach((a, i) => doc.addBond(a.id, ring[(i + 1) % 6].id, i % 2 ? 2 : 1));
      const n = doc.addAtom(28.8, 0, 7);
      doc.addBond(ring[0].id, n.id);
      const wavy = doc.addAtom(43.2, 0, 0, { attach: 'Wavy' });
      doc.addBond(n.id, wavy.id);
      const o = doc.addAtom(-28.8, 0, 8);
      doc.addBond(ring[3].id, o.id);
      const me = doc.addAtom(-43.2, 0);
      doc.addBond(o.id, me.id);
    });
    const { molblock } = toMolfile(doc, doc.atoms.keys(), '', { attachKinds: true });
    expect(molblock).toMatch(/M {2}ISO {2}1 +\d+ +102/);
    expect(sites(molblock, 'wavy').map((s) => [group(s), s.place])).toEqual([['OCH3', 'para']]);
    // the same drawing written plainly has no kinds: a wavy reference isn't found
    expect(hammettSites(RDKit, toMolfile(doc, doc.atoms.keys()).molblock, 'wavy')).toHaveProperty('error');
  });
});
