// @vitest-environment jsdom
//
// DrawingML colour changes (ECMA-376 Part 1 §20.1.2.3), worked out as the standard's own
// examples and Office's colour picker give them: tint and shade in linear RGB, the HSL changes
// on the sRGB colour, and percentages with a percent sign (finding P9).

import { describe, it, expect } from 'vitest';
import { applyColorMods, dmlFraction, hslHex, linearHex } from '../src/io/dml-color';
import { drawingColour } from '../src/io/xlsx-print';
import { readPptx } from '../src/io/pptx-read';
import { Package, NS, REL } from '../src/io/ooxml';

/** A colour element with changes, as the file writes it ("<a:srgbClr val=...><a:tint val=.../></a:srgbClr>"). */
const clr = (inner: string): Element => new DOMParser().parseFromString(`<x xmlns:a="${NS.a}">${inner}</x>`, 'application/xml').documentElement.firstElementChild!;
const mods = (hex: string, changes: string) => applyColorMods(hex, Array.from(clr(`<a:srgbClr val="${hex}">${changes}</a:srgbClr>`).children));

describe('DrawingML colour changes (P9)', () => {
  it('works out the standard’s examples', () => {
    expect(mods('00FF00', '<a:tint val="50%"/>')).toBe('#bcffbc');
    expect(mods('00FF00', '<a:satMod val="20%"/>')).toBe('#669966');
    expect(mods('00FF00', '<a:lumOff val="-20%"/>')).toBe('#009900');
    expect(mods('00FF00', '<a:hueMod val="50%"/>')).toBe('#ffff00');
    expect(mods('0000FF', '<a:blueMod val="50%"/>')).toBe('#000080');
    expect(mods('00FF00', '<a:blue val="100%"/>')).toBe('#00ffff');
    expect(mods('FF0000', '<a:comp/>')).toBe('#00ffff');
    expect(mods('FF0000', '<a:inv/>')).toBe('#00ffff');
    expect(linearHex(0.5, 0.5, 0.5)).toBe('BCBCBC');
    expect(hslHex(0, 1, 0.5)).toBe('FF0000');
    expect(hslHex(7200000, 1, 0.5)).toBe('00FF00');
  });

  it('gives Office’s darker and lighter theme colours (lumMod and lumOff together)', () => {
    // Office's Blue, Accent 1 (4472C4): Darker 25%, Lighter 40%, Lighter 80%
    expect(mods('4472C4', '<a:lumMod val="75000"/>')).toBe('#2f5597');
    expect(mods('4472C4', '<a:lumMod val="60000"/><a:lumOff val="40000"/>')).toBe('#8faadc');
    expect(mods('4472C4', '<a:lumMod val="20000"/><a:lumOff val="80000"/>')).toBe('#dae3f3');
  });

  it('shades towards black and tints towards white in linear RGB', () => {
    expect(mods('FFFFFF', '<a:shade val="50000"/>')).toBe('#bcbcbc');
    expect(mods('000000', '<a:tint val="50000"/>')).toBe('#bcbcbc');
    // and applies changes in the order written
    expect(mods('808080', '<a:shade val="50000"/><a:satMod val="300000"/>')).toBe(mods('808080', '<a:shade val="50000"/>'));
    expect(mods('C00000', '<a:tint val="40000"/><a:satMod val="350000"/>')).not.toBe(mods('C00000', '<a:satMod val="350000"/><a:tint val="40000"/>'));
  });

  it('reads percentages written either way', () => {
    expect(dmlFraction('50000')).toBe(0.5);
    expect(dmlFraction('50%')).toBe(0.5);
    expect(dmlFraction('-20%')).toBe(-0.2);
    expect(dmlFraction(null, 1)).toBe(1);
  });

  it('works out shapes’ colours in Excel drawings with every change', () => {
    expect(drawingColour(clr('<a:srgbClr val="00FF00"><a:tint val="50000"/></a:srgbClr>'), [])).toBe('#bcffbc');
    expect(drawingColour(clr('<a:srgbClr val="4472C4"><a:lumMod val="75000"/></a:srgbClr>'), [])).toBe('#2f5597');
  });

  it('reads a slide’s tinted and shaded fills as PowerPoint shows them', () => {
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const X = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
    const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
    const sp = (id: number, fill: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${id * 1270000}" y="1270000"/><a:ext cx="1016000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill>${fill}</a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
    const pkg = new Package();
    const ct = (t: string) => `application/vnd.openxmlformats-officedocument.${t}+xml`;
    const P = 'ppt/presentation.xml';
    pkg.relate('', REL.officeDocument, P);
    const mRel = pkg.relate(P, REL.slideMaster, 'slideMasters/slideMaster1.xml');
    const sRel = pkg.relate(P, REL.slide, 'slides/slide1.xml');
    pkg.add(P, `${H}<p:presentation ${X}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${mRel}"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="${sRel}"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`, ct('presentationml.presentation.main'));
    pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.theme, '../theme/theme1.xml');
    pkg.add('ppt/theme/theme1.xml', `${H}<a:theme xmlns:a="${NS.a}" name="T"><a:themeElements><a:clrScheme name="T"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme><a:fontScheme name="T"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`, ct('theme'));
    const lRel = pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.slideLayout, '../slideLayouts/slideLayout1.xml');
    pkg.add('ppt/slideMasters/slideMaster1.xml', `${H}<p:sldMaster ${X}><p:cSld><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${lRel}"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`, ct('presentationml.slideMaster'));
    pkg.relate('ppt/slideLayouts/slideLayout1.xml', REL.slideMaster, '../slideMasters/slideMaster1.xml');
    pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="blank"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
    pkg.relate('ppt/slides/slide1.xml', REL.slideLayout, '../slideLayouts/slideLayout1.xml');
    pkg.add('ppt/slides/slide1.xml', `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}` +
      sp(1, '<a:srgbClr val="00FF00"><a:tint val="50000"/></a:srgbClr>') +
      sp(2, '<a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr>') +
      sp(3, '<a:scrgbClr r="50%" g="50%" b="50%"/>') +
      sp(4, '<a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr>') +
      '</p:spTree></p:cSld></p:sld>', ct('presentationml.slide'));
    const got = readPptx(pkg.build());
    const fills = [...got.slides[0].contents.shapes].sort((a, b) => a.x1 - b.x1).map((s) => s.fillColor ?? s.color);
    expect(fills).toEqual(['#bcffbc', mods('4472C4', '<a:shade val="50000"/>'), '#bcbcbc', '#8faadc']);
    // (PowerPoint's default shape outline, accent 1 shaded 50%, is 2F528F)
    expect(fills[1]).toBe('#2f528f');
  });
});
