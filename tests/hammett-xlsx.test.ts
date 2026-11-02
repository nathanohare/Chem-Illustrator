// @vitest-environment jsdom
//
// Hammett columns saved as .xlsx: Excel gets each σ, F, R and group as a plain value (it has no
// HAMMETT), and this program gets the formulas back from its own file and works them out again.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { unzipSync, strFromU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { Workbook } from '../src/sheet/workbook';
import { SheetChem } from '../src/sheet/sheet-chem';
import { molProps } from '../src/chem/props';
import { hammettSites } from '../src/chem/hammett-match';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => new Uint8Array() };

function withChem(wb: Workbook): SheetChem {
  const chem = new SheetChem({
    ready: true,
    props: async (mols) => mols.map((m) => molProps(RDKit, m)),
    substructure: async () => ({ results: [] }),
    hammett: async (core, mols) => mols.map((m) => hammettSites(RDKit, m, core)),
  }, () => ({ molblock: null }));
  wb.chem = chem;
  chem.onAnswers = () => wb.recalc();
  return chem;
}

const CORE = '[NH2:1]c1ccc(*)cc1';

describe('Hammett columns in .xlsx', () => {
  it('saves values for Excel and the formulas for this program', async () => {
    const wb = new Workbook();
    const chem = withChem(wb);
    wb.edit('Type', () => {
      const s = wb.sheet;
      s.setInput(0, 0, 'Nucleophile');
      s.setInput(0, 1, 'σ');
      s.setInput(0, 2, 'Group');
      s.setInput(1, 0, 'COc1ccc(N)cc1');
      s.setInput(2, 0, 'Clc1ccc(N)cc1');
      s.setColDef(1, { formula: `=HAMMETT(A2,"sigma","${CORE}")`, firstRow: 1, style: { numFmt: '0.00' } });
      s.setColDef(2, { formula: `=HAMMETT(A2,"group","${CORE}")`, firstRow: 1 });
    });
    await chem.settled();
    expect(wb.sheet.value(1, 1)).toBe(-0.27);
    expect(wb.sheet.value(2, 2)).toBe('Cl');
    const bytes = await writeXlsx(wb, pictures);
    const xml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
    expect(xml).toMatch(/<c r="B2" s="\d+"><v>-0\.27<\/v><\/c>/);
    expect(xml).not.toContain('HAMMETT');

    const { book, warnings } = await readXlsx(bytes);
    expect(warnings).toEqual([]);
    const again = withChem(book);
    book.recalc();
    await again.settled();
    expect(book.sheet.colDefs.get(1)?.formula).toBe(`=HAMMETT(A2,"sigma","${CORE}")`);
    expect(book.sheet.value(1, 1)).toBe(-0.27);
    expect(book.sheet.value(2, 1)).toBe(0.23);
    expect(book.sheet.value(1, 2)).toBe('OCH3');
  });
});
