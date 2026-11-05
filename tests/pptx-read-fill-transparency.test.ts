// @vitest-environment jsdom
//
// A see-through fill set in PowerPoint (Format Shape > Fill > Transparency, saved as the fill
// colour's alpha) stays see-through: on a box, an oval and a star, and when saved again.

import { it, expect } from 'vitest';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { Package, PackageReader, NS, REL } from '../src/io/ooxml';
import { Doc } from '../src/model';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const X = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const E = 12700;
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const xf = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x * E}" y="${y * E}"/><a:ext cx="${w * E}" cy="${h * E}"/></a:xfrm>`;
const ph = (id: number, name: string, ph: string, spPr: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;

function deck(slide: string): Uint8Array {
  const pkg = new Package();
  const ct = (t: string) => `application/vnd.openxmlformats-officedocument.${t}+xml`;
  pkg.relate('', REL.officeDocument, 'ppt/presentation.xml');
  const P = 'ppt/presentation.xml';
  const mRel = pkg.relate(P, REL.slideMaster, 'slideMasters/slideMaster1.xml');
  const sRel = pkg.relate(P, REL.slide, 'slides/slide1.xml');
  pkg.add(P, `${H}<p:presentation ${X}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${mRel}"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="${sRel}"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`, ct('presentationml.presentation.main'));
  pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.theme, '../theme/theme1.xml');
  pkg.add('ppt/theme/theme1.xml', `${H}<a:theme xmlns:a="${NS.a}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`, ct('theme'));
  const lRel = pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  pkg.add('ppt/slideMasters/slideMaster1.xml', `${H}<p:sldMaster ${X}><p:cSld><p:spTree>${GRP}` +
    ph(2, 'Title Placeholder 1', '<p:ph type="title"/>', xf(36, 29, 648, 104)) + ph(3, 'Text Placeholder 2', '<p:ph type="body" idx="1"/>', xf(36, 144, 648, 343)) +
    `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${lRel}"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`, ct('presentationml.slideMaster'));
  pkg.relate('ppt/slideLayouts/slideLayout1.xml', REL.slideMaster, '../slideMasters/slideMaster1.xml');
  pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="picTx"><p:cSld name="Picture with Caption"><p:spTree>${GRP}` +
    ph(2, 'Title 1', '<p:ph type="title"/>', xf(40, 30, 200, 60)) + ph(3, 'Picture Placeholder 2', '<p:ph type="pic" idx="1"/>', xf(300, 50, 360, 400)) +
    `</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
  const S = 'ppt/slides/slide1.xml';
  pkg.relate(S, REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  pkg.add(S, `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}${slide}</p:spTree></p:cSld></p:sld>`, ct('presentationml.slide'));
  return pkg.build();
}

const sp = (id: number, prst: string, fill: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xf(100 * id, 100, 80, 60)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };

it('keeps a see-through fill on boxes, ovals and other shapes', async () => {
  const got = readPptx(deck(
    sp(1, 'rect', '<a:solidFill><a:schemeClr val="tx1"><a:alpha val="20000"/></a:schemeClr></a:solidFill>') +
    sp(2, 'ellipse', '<a:solidFill><a:srgbClr val="4472C4"><a:alpha val="50000"/></a:srgbClr></a:solidFill>') +
    sp(3, 'star5', '<a:solidFill><a:srgbClr val="FF0000"><a:alpha val="75000"/></a:srgbClr></a:solidFill>') +
    sp(4, 'rect', '<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>')));
  const shapes = [...got.slides[0].contents.shapes].sort((a, b) => a.x1 - b.x1);
  expect(shapes.map((s) => s.transparency ?? 0)).toEqual([0.8, 0.5, 0.25, 0]);
  expect(shapes[0].fillColor ?? shapes[0].color).toBe('#000000');
  // a solid box stays a plain box
  expect(shapes[3].kind).toBe('rect');
  // and saved again, PowerPoint gets the same transparency
  const doc = new Doc(); doc.restoreContents(got.slides[0].contents);
  const bytes = await writePptx({ size: got.size, master: got.master, slides: [{ layout: got.slides[0].layout, doc, notes: '' }] }, opts);
  const xml = new XMLSerializer().serializeToString(new PackageReader(bytes).xml('ppt/slides/slide1.xml')!);
  expect(xml.match(/<a:alpha val="(\d+)"\/>/g)).toEqual(['<a:alpha val="20000"/>', '<a:alpha val="50000"/>', '<a:alpha val="75000"/>']);
});
