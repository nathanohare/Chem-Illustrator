// @vitest-environment jsdom
//
// File fix from the 26 October code review: two long sheet names that share their first 31
// characters (normal in LibreOffice) made readOds loop for ever, because the " (2)" it added to
// make the second one unique was cut off again.

import { describe, it, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

// count the calls, so a loop that never ends fails the test instead of hanging it
let calls = 0;
vi.mock('../src/io/sheet-files', async (orig) => {
  const real = await orig<typeof import('../src/io/sheet-files')>();
  return {
    ...real,
    safeSheetName: (n: string, others?: readonly string[]) => {
      if (++calls > 10_000) throw new Error('safeSheetName called over 10,000 times: stuck in a loop');
      return real.safeSheetName(n, others);
    },
  };
});

const { readOds } = await import('../src/io/ods');
const { uniqueSheetName } = await import('../src/io/sheet-files');

const OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
const TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';

function ods(names: string[]): Uint8Array {
  const tables = names.map((n) => `<table:table table:name="${n}"><table:table-row><table:table-cell office:value-type="string"><text:p>x</text:p></table:table-cell></table:table-row></table:table>`).join('');
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="${OFFICE}" xmlns:table="${TABLE}" xmlns:text="${TEXT}" office:version="1.3"><office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document-content>`;
  return zipSync({ mimetype: new Uint8Array(strToU8('application/vnd.oasis.opendocument.spreadsheet')), 'content.xml': new Uint8Array(strToU8(content)) });
}

describe('unique sheet names', () => {
  it('opens an .ods whose two long sheet names share their first 31 characters', () => {
    calls = 0;
    const { book } = readOds(ods(['Calibration data for compound 12a', 'Calibration data for compound 12b']));
    expect(book.sheets.map((s) => s.name)).toEqual(['Calibration data for compound 1', 'Calibration data for compou (2)']);
  });

  it('keeps the number within 31 characters, ignoring capitals', () => {
    expect(uniqueSheetName('Sheet1', ['sheet1'])).toBe('Sheet1 (2)');
    const long = 'x'.repeat(40);
    const taken = [uniqueSheetName(long, [])];
    for (let k = 0; k < 12; k++) taken.push(uniqueSheetName(long, taken));
    expect(new Set(taken).size).toBe(13);
    expect(taken.every((n) => n.length <= 31)).toBe(true);
    expect(taken.at(-1)).toBe(`${'x'.repeat(26)} (13)`);
  });
});
