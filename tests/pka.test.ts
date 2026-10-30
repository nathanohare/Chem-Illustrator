// Estimated pKa values against measured ones in water (Perrin, Dempsey and Serjeant's tables and
// the CRC Handbook): within about one unit, and the right group picked out.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { estimatePka, type PkaSite } from '../src/chem/pka';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const sites = (smiles: string): PkaSite[] => { const m = RDKit.get_mol(smiles); try { return estimatePka(m.get_json()); } finally { m.delete(); } };
const acid = (smiles: string) => sites(smiles).find((s) => s.kind === 'acid');
const base = (smiles: string) => sites(smiles).find((s) => s.kind === 'base');

// [SMILES, measured pKa of the most acidic proton]
const ACIDS: [string, number][] = [
  ['CC(=O)O', 4.76], ['OC=O', 3.75], ['OC(=O)CCl', 2.86], ['OC(=O)C(Cl)(Cl)Cl', 0.65], ['OC(=O)C(F)(F)F', 0.23],
  ['OC(=O)CC#N', 2.47], ['OC(=O)Cc1ccccc1', 4.31], ['OC(=O)CCCl', 4.0], ['CC(C)(C)C(=O)O', 5.03],
  ['OC(=O)c1ccccc1', 4.2], ['OC(=O)c1ccc(cc1)[N+](=O)[O-]', 3.44], ['OC(=O)c1cccc(c1)[N+](=O)[O-]', 3.45],
  ['COc1ccc(cc1)C(=O)O', 4.47], ['OC(=O)c1ccc(Cl)cc1', 3.98], ['Cc1ccccc1C(=O)O', 3.91], ['OC(=O)c1ccccc1Cl', 2.94],
  ['Oc1ccccc1', 9.99], ['Oc1ccc(cc1)[N+](=O)[O-]', 7.15], ['Cc1ccc(O)cc1', 10.26], ['Oc1ccc(Cl)cc1', 9.41],
  ['Oc1cccc(c1)[N+](=O)[O-]', 8.36], ['Oc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]', 4.09], ['CC(=O)c1ccc(O)cc1', 8.05],
  ['CO', 15.5], ['CCO', 15.9], ['OCC(F)(F)F', 12.4], ['OC(C(F)(F)F)C(F)(F)F', 9.3], ['OCCCl', 14.3],
  ['CCS', 10.6], ['Sc1ccccc1', 6.6],
  ['CC(=O)CC(C)=O', 8.99], ['CCOC(=O)CC(C)=O', 10.68], ['CCOC(=O)CC(=O)OCC', 13.0], ['O=C1CCCC(=O)C1', 5.26],
  ['CC1(C)OC(=O)CC(=O)O1', 4.83], ['C[N+](=O)[O-]', 10.2], ['N#CCC#N', 11.2],
  ['NS(=O)(=O)c1ccccc1', 10.1], ['CS(=O)(=O)O', -1.9], ['O=C1CCC(=O)N1', 9.62], ['O=C1NC(=O)c2ccccc12', 8.3],
  ['c1nn[nH]n1', 4.9], ['c1c[nH]cn1', 14.5], ['c1ccc2[nH]cnc2c1', 12.8], ['c1ccc2[nH]nnc2c1', 8.4],
  ['O=c1cc[nH]c(=O)[nH]1', 9.4], ['CC(=O)NO', 9.0], ['CC(C)=NO', 12.4], ['OB(O)c1ccccc1', 8.8], ['OP(O)(O)=O', 2.15],
  ['NCC(=O)O', 2.34], ['OC(=O)CC(=O)O', 2.83], ['O=C(O)CN(CC(=O)O)CC(=O)O', 1.9],
];

// [SMILES, measured pKa of the conjugate acid of the most basic atom]
const BASES: [string, number][] = [
  ['CN', 10.64], ['CNC', 10.73], ['CN(C)C', 9.8], ['CCN(CC)CC', 10.75], ['C1CCNCC1', 11.12], ['C1CCNC1', 11.27],
  ['C1COCCN1', 8.36], ['C1CNCCN1', 9.73], ['NCc1ccccc1', 9.34], ['NCCO', 9.5], ['NCC(F)(F)F', 5.7],
  ['NCC#N', 5.3], ['CN1CCOCC1', 7.4], ['C1CN2CCC1CC2', 11.0], ['NCCc1ccccc1', 9.83], ['C1CN1', 8.0], ['N', 9.25],
  ['Nc1ccccc1', 4.6], ['Nc1ccc(cc1)[N+](=O)[O-]', 1.0], ['COc1ccc(N)cc1', 5.34], ['Nc1ccc(Cl)cc1', 3.98],
  ['CN(C)c1ccccc1', 5.07], ['Nc1ccccc1Cl', 2.65], ['Cc1ccccc1N', 4.44],
  ['c1ccncc1', 5.23], ['Nc1ccncc1', 9.17], ['CN(C)c1ccncc1', 9.6], ['Clc1cccnc1', 2.84], ['Cc1ccncc1', 6.02],
  ['Nc1ccccn1', 6.86], ['c1ccc2ncccc2c1', 4.9], ['c1cncnc1', 1.3],
  ['c1c[nH]cn1', 6.95], ['Cn1ccnc1', 7.06], ['Cc1ncc[nH]1', 7.86], ['c1ccc2[nH]cnc2c1', 5.53], ['c1cscn1', 2.5],
  ['Nc1nccs1', 5.36], ['Cn1cnc2c1c(=O)n(C)c(=O)n2C', 0.6], ['c1ncc2nc[nH]c2n1', 2.4], ['CN1CCC[C@H]1c1cccnc1', 8.0], ['CC(=N)N', 12.4], ['NC(=N)N', 13.6], ['C1CCC2=NCCCN2CC1', 13.5], ['NC(=N)c1ccccc1', 11.6],
  ['ON', 5.9], ['NN', 8.1], ['NCC(=O)O', 9.6],
];

describe('estimated pKa', () => {
  it.each(ACIDS)('acid %s ≈ %f', (smiles, measured) => {
    const s = acid(smiles);
    expect(s, smiles).toBeDefined();
    expect(Math.abs(s!.pka - measured), `${smiles}: estimated ${s!.pka} (${s!.group}), measured ${measured}`).toBeLessThanOrEqual(1.0);
  });

  it.each(BASES)('base %s ≈ %f', (smiles, measured) => {
    const s = base(smiles);
    expect(s, smiles).toBeDefined();
    expect(Math.abs(s!.pka - measured), `${smiles}: estimated ${s!.pka} (${s!.group}), measured ${measured}`).toBeLessThanOrEqual(1.0);
  });

  it('gives no value where no rule fits', () => {
    expect(sites('CCCC')).toEqual([]);
    expect(sites('CC(=O)N(C)C').filter((s) => s.kind === 'base')).toEqual([]);
    expect(sites('c1cc[nH]c1')).toEqual([]);
  });

  it('reads a drawn salt as its neutral parent', () => {
    expect(acid('CC(=O)[O-]')!.pka).toBe(acid('CC(=O)O')!.pka);
    expect(base('C[NH3+]')!.pka).toBe(base('CN')!.pka);
  });
});
