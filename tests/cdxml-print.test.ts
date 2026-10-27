// @vitest-environment jsdom
//
// The paper in CDXML: ChemDraw takes the paper size and orientation only from its print record
// (MacPrintInfo). The records below are ChemDraw 25's own, saved after File > Page Setup.

import { describe, expect, it } from 'vitest';
import { macPrintInfo, paperOf } from '../src/io/cdxml-print';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';

const A4_LANDSCAPE = '00030000025802580000000013611B680000000013611B680365057B03E000020000025802580000000013611B68000100000064000000010001010100020001270F000100010000000000000000000000000002001901900000000000600000000000000000000100000000000000000000000000000000';
const A4_PORTRAIT = '0003000002580258000000001B681361000000001B6813610367057B03E00002000002580258000000001B681361000100000064000000010001010100020001270F000100010000000000000000000000000002001901900000000000600000000000000000000100000000000000000000000000000000';
const LETTER_LANDSCAPE = '00030000025802580000000013EC19C80000000013EC19C80365052803FC00020000025802580000000013EC19C8000100000064000000010001010100000001270F000100010000000000000000000000000002001901900000000000600000000000000000000100000000000000000000000000000000';
// a printer's Letter portrait record, at 72 dpi with the paper past the printable area
const LETTER_DEFAULT = '00030000004800480000000002DE0240FFEEFFEE030602520367052803FC00020000004800480000000002DE0240000100000064000000010001010100000001270F000100010000000000000000000000000002001901900000000000600000000000000000000100000000000000000000000000000000';

describe('the paper in CDXML', () => {
  it('writes the print record as ChemDraw does for A4 and Letter', () => {
    expect(macPrintInfo(841.89, 595.28, true)).toBe(A4_LANDSCAPE);
    expect(macPrintInfo(595.28, 841.89, true)).toBe(A4_PORTRAIT);
    expect(macPrintInfo(792, 612, false)).toBe(LETTER_LANDSCAPE);
  });

  it('reads the paper from a print record', () => {
    const p = paperOf(LETTER_DEFAULT)!;
    expect(p.w).toBeCloseTo(612, 0);
    expect(p.h).toBeCloseTo(792, 0);
    const l = paperOf(A4_LANDSCAPE)!;
    expect(l.w).toBeCloseTo(842, 0);
    expect(l.h).toBeCloseTo(595, 0);
  });

  it('saves A4 landscape from Page Setup so ChemDraw takes it, and reads it back as A4', () => {
    const doc = new Doc();
    doc.page = { w: 770, h: 523, name: 'a4', grow: true };
    const xml = writeCdxml(doc);
    expect(xml).toContain(`MacPrintInfo="${A4_LANDSCAPE}"`);
    expect(xml).toContain('PrintMargins="36 36 36 36"');
    expect(readCdxml(xml).doc.page?.name).toBe('a4');
  });

  it('keeps ChemDraw\'s own record and margins when the page is unchanged', () => {
    const file = `<?xml version="1.0" encoding="UTF-8" ?><CDXML CreationProgram="ChemDraw 25.0.2.14" PrintMargins="55.80 50.83 55.80 50.83" MacPrintInfo="${A4_LANDSCAPE}" BondLength="14.40"><page id="1" BoundingBox="0 0 730.32 493.66" HeightPages="1" WidthPages="1"><fragment id="2"><n id="3" p="100 100"/></fragment></page></CDXML>`;
    const doc = readCdxml(file).doc;
    expect(doc.page?.name).toBe('a4');
    doc.edit('move', () => doc.moveAtoms(new Set([...doc.atoms.keys()]), 5, 0));
    const xml = writeCdxml(doc);
    expect(xml).toContain('PrintMargins="55.80 50.83 55.80 50.83"');
  });
});

describe('the document size in pages', () => {
  it('keeps a ChemDraw document set to two pages tall when saved again', () => {
    const file = `<?xml version="1.0" encoding="UTF-8" ?><CDXML CreationProgram="ChemDraw 25.0.2.14" BondLength="14.40"><page id="1" BoundingBox="0 0 510.24 1360.63" HeightPages="2" WidthPages="1"><fragment id="2"><n id="3" p="100 100"/></fragment></page></CDXML>`;
    const doc = readCdxml(file).doc;
    expect(doc.page?.h).toBeCloseTo(680.3, 1);
    expect(doc.page?.down).toBe(2);
    doc.edit('move', () => doc.moveAtoms(new Set([...doc.atoms.keys()]), 5, 0));
    expect(writeCdxml(doc)).toMatch(/HeightPages="2"/);
  });
});
