// @vitest-environment jsdom
//
// Highlights go through CDX, ChemDraw's clipboard format (tag 0x0308, found by saving one drawing
// with and without highlights from ChemDraw 25 as CDX and comparing the files; Nate, 2026-11-03).

import { describe, it, expect } from 'vitest';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';
import { readCdxml } from '../src/io/cdxml';

const cdxml = `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.4"><colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="1" g="0.2706" b="0.2706"/><color r="0" g="0.6" b="0.2"/></colortable><page id="1"><fragment id="2"><n id="10" p="50 50" highlightColor="4"/><n id="11" p="64.4 50"/><b id="20" B="10" E="11" highlightColor="5"/></fragment></page></CDXML>`;

describe('highlights in CDX', () => {
  it('are written and read as ChemDraw 25 writes them', () => {
    const cdx = cdxmlToCdx(cdxml);
    // the atom's: tag 0x0308, two bytes, colour table index 4
    expect(Buffer.from(cdx).toString('hex')).toContain('080302000400');
    const back = cdxToCdxml(cdx);
    expect(back).toMatch(/<n [^>]*highlightColor="4"/);
    expect(back).toMatch(/<b [^>]*highlightColor="5"/);
    const doc = readCdxml(back).doc;
    expect(doc.atoms.get(10)!.highlight).toBe('#ff4545');
    expect(doc.bonds.get(20)!.highlight).toBe('#009933');
  });
});
