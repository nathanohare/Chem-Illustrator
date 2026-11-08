// @vitest-environment jsdom
//
// Theme colors PowerPoint wrote (schemeClr, with lumMod, lumOff, tint, shade, satMod...) are saved
// as the same theme colors while they are not changed here, so they still follow a change of
// theme in PowerPoint; a color changed here is saved as a plain color.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Doc } from '../src/model';
import { writePptx, type DeckData, type PptxOptions } from '../src/io/pptx-write';
import { readPptx, type PptxRead } from '../src/io/pptx-read';
import { Package, NS, REL } from '../src/io/ooxml';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
const X = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const E = 12700;
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const xf = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x * E}" y="${y * E}"/><a:ext cx="${w * E}" cy="${h * E}"/></a:xfrm>`;
const ct = (t: string) => `application/vnd.openxmlformats-officedocument.${t}+xml`;

const TEXT_CLR = '<a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr>';
const FILL_CLR = '<a:schemeClr val="accent2"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr>';
const LINE_CLR = '<a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr>';
const SAT_CLR = '<a:schemeClr val="accent6"><a:satMod val="80000"/><a:tint val="60000"/></a:schemeClr>';

/** A deck as PowerPoint saves one: theme-colored text, a theme-colored box with a darker outline, a see-through theme fill, and a box to recolor. */
function deck(): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'ppt/presentation.xml');
  const P = 'ppt/presentation.xml';
  const mRel = pkg.relate(P, REL.slideMaster, 'slideMasters/slideMaster1.xml');
  const sRel = pkg.relate(P, REL.slide, 'slides/slide1.xml');
  pkg.add(P, `${H}<p:presentation ${X}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${mRel}"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="${sRel}"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`, ct('presentationml.presentation.main'));
  pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.theme, '../theme/theme1.xml');
  const accents = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'].map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join('');
  pkg.add('ppt/theme/theme1.xml', `${H}<a:theme xmlns:a="${NS.a}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>${accents}<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>` +
    `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`, ct('theme'));
  const lRel = pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  pkg.add('ppt/slideMasters/slideMaster1.xml', `${H}<p:sldMaster ${X}><p:cSld><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${lRel}"/></p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`, ct('presentationml.slideMaster'));
  pkg.relate('ppt/slideLayouts/slideLayout1.xml', REL.slideMaster, '../slideMasters/slideMaster1.xml');
  pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="blank"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
  const S = 'ppt/slides/slide1.xml';
  pkg.relate(S, REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  const box = (id: number, name: string, x: number, fill: string, ln = '<a:ln><a:noFill/></a:ln>') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xf(x, 300, 100, 80)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill>${fill}</a:solidFill>${ln}</p:spPr></p:sp>`;
  pkg.add(S, `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xf(40, 40, 400, 40)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill>${TEXT_CLR}</a:solidFill></a:rPr><a:t>Yields</a:t></a:r></a:p></p:txBody></p:sp>` +
    box(3, 'Rectangle 2', 40, FILL_CLR, `<a:ln w="25400"><a:solidFill>${LINE_CLR}</a:solidFill></a:ln>`) +
    box(4, 'Rectangle 3', 200, SAT_CLR.replace('</a:schemeClr>', '<a:alpha val="50000"/></a:schemeClr>')) +
    box(5, 'Rectangle 4', 360, '<a:schemeClr val="accent4"/>') +
    `</p:spTree></p:cSld></p:sld>`, ct('presentationml.slide'));
  return pkg.build();
}

async function resave(got: PptxRead, change?: (d: Doc) => void): Promise<Uint8Array> {
  const slides = got.slides.map((s) => {
    const d = new Doc();
    d.style = { ...got.master.drawing };
    d.restoreContents(s.contents);
    change?.(d);
    return { layout: s.layout, doc: d, notes: s.notes, notesKept: s.notesKept };
  });
  return writePptx({ size: got.size, master: got.master, slides } as DeckData, opts);
}
const slideXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml']);
const colorsOf = (got: PptxRead) => [...got.slides[0].contents.shapes.map((s) => [s.fillColor ?? s.color, s.color]), ...got.slides[0].contents.captions.map((c) => [c.runs[0]?.color])].flat().filter(Boolean).sort();

describe('theme colors', () => {
  it('saves theme colors PowerPoint wrote as those theme colors, with their changes', async () => {
    const got = readPptx(deck());
    const xml = slideXml(await resave(got));
    expect(xml).toContain(TEXT_CLR);
    expect(xml).toContain(FILL_CLR);
    expect(xml).toContain(LINE_CLR);
    // (the see-through amount read as transparency, written again inside the same theme color)
    expect(xml).toContain('<a:schemeClr val="accent6"><a:satMod val="80000"/><a:tint val="60000"/><a:alpha val="50000"/></a:schemeClr>');
    expect(xml).toContain('<a:schemeClr val="accent4"/>');
    expect(xml).not.toMatch(/<a:srgbClr val="(2F5597|F4B183|FFC000)"/);
  });

  it('keeps them through a second save, and the colors shown stay the same', async () => {
    const got = readPptx(deck());
    const once = await resave(got);
    const again = readPptx(once);
    expect(colorsOf(again)).toEqual(colorsOf(got));
    const xml = slideXml(await resave(again));
    for (const c of [TEXT_CLR, FILL_CLR, LINE_CLR, '<a:schemeClr val="accent4"/>']) expect(xml).toContain(c);
  });

  it('saves a color changed here as that color', async () => {
    const got = readPptx(deck());
    const xml = slideXml(await resave(got, (d) => {
      const s = [...d.shapes.values()].find((x) => (x.fillColor ?? x.color)?.toLowerCase() === '#ffc000')!;
      d.edit('recolor', () => d.updateShape(s.id, { color: '#123456', fillColor: undefined }));
    }));
    expect(xml).not.toContain('<a:schemeClr val="accent4"/>');
    expect(xml).toContain('<a:srgbClr val="123456"/>');
    expect(xml).toContain(TEXT_CLR);
  });
});
