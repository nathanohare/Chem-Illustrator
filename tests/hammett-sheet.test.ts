// HAMMETT() in a sheet: σ, F, R and the group of each row's structure at the marked ring position,
// worked out by the chemistry engine (RDKit in Node here) and added up for several positions.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { molProps } from '../src/chem/props';
import { hammettSites } from '../src/chem/hammett-match';
import { SheetChem, ChemEngine } from '../src/sheet/sheet-chem';
import { Workbook } from '../src/sheet/workbook';
import { hammettValue, hammettWhat, orthoAsPara } from '../src/sheet/hammett-fn';
import { CellError } from '../src/sheet/values';
import { usesChemistry } from '../src/io/xlsx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

function engine(): ChemEngine {
  return {
    ready: true,
    props: async (mols) => mols.map((m) => molProps(RDKit, m)),
    substructure: async () => ({ results: [] }),
    hammett: async (core, mols) => mols.map((m) => hammettSites(RDKit, m, core)),
  };
}

async function sheetOf(rows: string[][]): Promise<Workbook> {
  const wb = new Workbook();
  const chem = new SheetChem(engine(), () => ({ molblock: null }));
  wb.chem = chem;
  chem.onAnswers = () => wb.recalc();
  wb.edit('Type', () => rows.forEach((r, i) => r.forEach((v, j) => wb.sheet.setInput(i, j, v))));
  await chem.settled();
  return wb;
}

const ANILINE = '"[NH2:1]c1ccc(*)cc1"';

describe('HAMMETT in a sheet', () => {
  it('gives σp, F, R and the group of para-substituted anilines', async () => {
    const wb = await sheetOf([
      ['COc1ccc(N)cc1', `=HAMMETT(A1,"sigma",${ANILINE})`, `=HAMMETT(A1,"F",${ANILINE})`, `=HAMMETT(A1,"R",${ANILINE})`, `=HAMMETT(A1,"group",${ANILINE})`],
      ['Nc1ccc(cc1)[N+](=O)[O-]', `=HAMMETT(A2,"σ",${ANILINE})`, `=HAMMETT(A2,"F",${ANILINE})`, `=HAMMETT(A2,"R",${ANILINE})`, `=HAMMETT(A2,"group",${ANILINE})`],
      ['Nc1ccccc1', `=HAMMETT(A3,"sigma",${ANILINE})`, `=HAMMETT(A3,"F",${ANILINE})`, `=HAMMETT(A3,"R",${ANILINE})`, `=HAMMETT(A3,"group",${ANILINE})`],
    ]);
    const s = wb.sheet;
    expect([s.value(0, 1), s.value(0, 2), s.value(0, 3), s.value(0, 4)]).toEqual([-0.27, 0.29, -0.56, 'OCH3']);
    expect([s.value(1, 1), s.value(1, 2), s.value(1, 3), s.value(1, 4)]).toEqual([0.78, 0.65, 0.13, 'NO2']);
    expect([s.value(2, 1), s.value(2, 2), s.value(2, 3), s.value(2, 4)]).toEqual([0, 0.03, 0, 'H']);
  });

  it('picks σm for a meta group and adds up several positions', async () => {
    const wb = await sheetOf([
      ['Nc1cccc(Cl)c1', '=HAMMETT(A1,"sigma","[NH2:1]c1cccc(*)c1")'],
      ['Nc1cc(Cl)cc(Cl)c1', '=HAMMETT(A2,"sigma","[NH2:1]c1cc(*)cc(*)c1")', '=HAMMETT(A2,"group","[NH2:1]c1cc(*)cc(*)c1")'],
    ]);
    expect(wb.sheet.value(0, 1)).toBe(0.37);
    expect(wb.sheet.value(1, 1)).toBe(0.74);
    expect(wb.sheet.value(1, 2)).toBe('m-Cl, m-Cl');
  });

  it('leaves ortho groups and unknown groups as #N/A with a reason', async () => {
    const wb = await sheetOf([
      ['Nc1ccccc1Cl', '=HAMMETT(A1,"sigma","[NH2:1]c1ccccc1*")', '=HAMMETT(A1,"sigma","[NH2:1]c1ccccc1*","ortho=sp")'],
      ['Nc1ccc(cc1)C1CCCCCCC1', `=HAMMETT(A2,"sigma",${ANILINE})`],
      ['CCO', `=HAMMETT(A3,"sigma",${ANILINE})`],
    ]);
    const err = (r: number, c: number) => wb.sheet.value(r, c) as CellError;
    expect(err(0, 1).code).toBe('#N/A');
    expect(err(0, 1).detail).toMatch(/ortho/);
    expect(wb.sheet.value(0, 2)).toBe(0.23);
    expect(err(1, 1).detail).toMatch(/isn't in the Hammett table/);
    expect(err(2, 1).detail).toMatch(/core/);
  });

  it('reads the ways the quantity may be written', () => {
    expect(['σ', 'sigma', 'SIGMA', 'σm', 'sigma_p', 'F', 'r', 'Group', 'what'].map(hammettWhat)).toEqual(['sigma', 'sigma', 'sigma', 'sm', 'sp', 'F', 'R', 'group', null]);
    expect(orthoAsPara('ortho=σp')).toBe(true);
    expect(orthoAsPara('blank')).toBe(false);
    expect(hammettValue({ error: 'x' }, 'F')).toBeInstanceOf(CellError);
  });

  it('is saved for Excel as its value (Excel has no HAMMETT)', () => {
    expect(usesChemistry('=HAMMETT(B2,"sigma","[NH2:1]c1ccc(*)cc1")')).toBe(true);
  });
});
