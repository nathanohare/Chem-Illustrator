// @vitest-environment jsdom
//
// A group holding an arrow, as ChemDraw 25 saves it: the arrow and, beside it, the old graphic it
// took over from. Found on real drawings (2026-11-03): the old graphic counted as a member nobody
// had, so every save rebuilt the group and left the graphic behind, and ChemDraw then drew the
// arrow twice.

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';

const file = `<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1"><page id="1"><group id="5"><graphic id="10" SupersededBy="11" BoundingBox="80 20 20 20" GraphicType="Line" ArrowType="FullHead" HeadSize="1000"/><arrow id="11" ArrowheadHead="Full" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="80 20 0" Tail3D="20 20 0"/><t id="12" p="30 40"><s size="10">text</s></t></group></page></CDXML>`;

describe('a group with an arrow in it', () => {
  it('is not rewritten by an unchanged save', () => {
    expect(writeCdxml(readCdxml(file).doc)).toBe(file);
  });
  it('keeps the arrow with its old graphic when the group has to be rebuilt', () => {
    const { doc } = readCdxml(file);
    doc.edit('Ungroup one', () => doc.updateCaption(12, { grp: undefined, grpPath: undefined }));
    const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    const arrow = out.querySelector('arrow')!, old = out.querySelector('graphic[SupersededBy]')!;
    expect(arrow).not.toBeNull();
    expect(old.parentElement).toBe(arrow.parentElement);
  });
});

describe('an unchanged save', () => {
  it("leaves ChemDraw's layers, crossing lists and page alone, even where we would work out something else", () => {
    // a shape in front of a structure (which turns on our drawing order), a crossing list ChemDraw
    // has that we wouldn't, and a drawing running past its page
    const text = '<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1" BondLength="30"><page id="1" BoundingBox="0 0 100 100" HeightPages="1" WidthPages="1"><fragment id="2" Z="9"><n id="10" p="10 10" Z="3"/><n id="11" p="40 10" Z="4"/><n id="12" p="10 80" Z="5"/><n id="13" p="40 80" Z="6"/><b id="20" B="10" E="11" Z="7" CrossingBonds="21"/><b id="21" B="12" E="13" Z="8" CrossingBonds="20"/></fragment><graphic id="30" BoundingBox="300 60 200 20" Z="50" GraphicType="Rectangle"/></page></CDXML>';
    expect(writeCdxml(readCdxml(text).doc)).toBe(text);
  });
});
