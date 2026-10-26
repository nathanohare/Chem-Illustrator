// @vitest-environment jsdom
//
// Laptop bench (xl-finishing): headers "Q1" and "Q2" in an Excel file were drawn as Q₁ and Q₂ and
// saved back as rich text with a subscript run. A letter that isn't an element and a number is
// not a formula; text from another program's file is shown as it was written; and formulas in
// typed text are spotted only while the workbook's Spot Formulas in Typed Text is on.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
import { Workbook } from '../src/sheet/workbook';
import { readXlsx, writeXlsx, type XlsxPictures } from '../src/io/xlsx';
import { bookFromText } from '../src/io/sheet-files';
import { chemPieces, showsChem } from '../src/sheet/cell-text';

const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const lowered = (t: string) => chemPieces(t).filter((p) => p.pos === 'sub').map((p) => p.text).join('');

/** A workbook saved here, then with our own part taken out: as Excel would have written it. */
async function fromExcel(book: Workbook): Promise<Uint8Array> {
  const files = unzipSync(await writeXlsx(book, pictures));
  for (const n of Object.keys(files)) if (n.startsWith('customXml/')) delete files[n];
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)])));
}

const sharedStrings = async (book: Workbook) => strFromU8(unzipSync(await writeXlsx(book, pictures))['xl/sharedStrings.xml']);

describe('text in cells shown as chemistry', () => {
  it('reads a Hill formula only where every capital starts an element', () => {
    expect(lowered('Q1')).toBe('');
    expect(lowered('X2')).toBe('');
    expect(lowered('C9H8O4')).toBe('984');
    expect(lowered('CH2Cl2')).toBe('22');
  });

  it("doesn't spot a formula in a label like Q1 or B2", () => {
    for (const t of ['Q1', 'Q2', 'B2', 'C3', 'Heading 1']) expect(showsChem(undefined, t)).toBe(false);
    expect(showsChem(undefined, 'CH2Cl2')).toBe(true);
    expect(showsChem(undefined, 'Pd(PPh3)4')).toBe(true);
    // the C₉H₈ button still lowers them when chosen
    expect(showsChem(true, 'Q1')).toBe(true);
  });

  it('spots formulas in typed text only while the workbook says so', () => {
    expect(showsChem(undefined, 'CH2Cl2', false)).toBe(false);
    expect(showsChem(true, 'CH2Cl2', false)).toBe(true);
  });

  it("shows an Excel file's text as written, and saves it back plain", async () => {
    const made = new Workbook(['Data']);
    made.autoChem = false;
    made.edit('t', () => { made.sheets[0].setInput(0, 0, 'Q1'); made.sheets[0].setInput(0, 1, 'CH2Cl2'); });
    const { book } = await readXlsx(await fromExcel(made));
    expect(book.autoChem).toBe(false);
    expect(book.sheets[0].styleAt(0, 1)?.chem).toBeUndefined();
    const sst = await sharedStrings(book);
    expect(sst).not.toContain('vertAlign');
    expect(sst).toContain('<t>Q1</t>');
    expect(sst).toContain('<t>CH2Cl2</t>');
  });

  it('keeps subscripts Excel wrote, and the C₉H₈ button, in an imported file', async () => {
    const made = new Workbook(['Data']);
    made.edit('t', () => { made.sheets[0].setInput(0, 0, 'CH2Cl2'); });
    const { book } = await readXlsx(await fromExcel(made));
    expect(book.sheets[0].styleAt(0, 0)?.chem).toBe(true);
    expect(await sharedStrings(book)).toContain('<vertAlign val="subscript"/>');
  });

  it("keeps the workbook's choice in files saved here, and spots formulas in new workbooks", async () => {
    const fresh = new Workbook(['Data']);
    expect(fresh.autoChem).toBe(true);
    expect((await readXlsx(await writeXlsx(fresh, pictures))).book.autoChem).toBe(true);
    fresh.edit('off', () => fresh.setAutoChem(false));
    expect((await readXlsx(await writeXlsx(fresh, pictures))).book.autoChem).toBe(false);
    // one undoable step
    fresh.undo();
    expect(fresh.autoChem).toBe(true);
  });

  it('shows text from a CSV file as written', () => {
    expect(bookFromText('Q1,CH2Cl2\n1,2', 'data').autoChem).toBe(false);
  });
});
