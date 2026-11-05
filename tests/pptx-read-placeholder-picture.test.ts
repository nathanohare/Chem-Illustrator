// @vitest-environment jsdom
//
// A picture put into a placeholder in PowerPoint (the picture button in a content or picture
// placeholder) is saved with no place of its own: it fills the layout's placeholder.

import { it, expect } from 'vitest';
import { readPptx } from '../src/io/pptx-read';
import { Package, NS, REL } from '../src/io/ooxml';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const X = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const E = 12700;
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const xf = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x * E}" y="${y * E}"/><a:ext cx="${w * E}" cy="${h * E}"/></a:xfrm>`;
const ph = (id: number, name: string, ph: string, spPr: string) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;

function deck(): Uint8Array {
  const pkg = new Package();
  const ct = (t: string) => `application/vnd.openxmlformats-officedocument.${t}+xml`;
  pkg.defaultType('png', 'image/png');
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
  // Picture with Caption: the picture placeholder has its place on the layout
  pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="picTx"><p:cSld name="Picture with Caption"><p:spTree>${GRP}` +
    ph(2, 'Title 1', '<p:ph type="title"/>', xf(40, 30, 200, 60)) + ph(3, 'Picture Placeholder 2', '<p:ph type="pic" idx="1"/>', xf(300, 50, 360, 400)) +
    `</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
  const S = 'ppt/slides/slide1.xml';
  pkg.relate(S, REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  const img = pkg.relate(S, REL.image, '../media/image1.png');
  pkg.add('ppt/media/image1.png', PNG);
  pkg.add(S, `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}` +
    `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture Placeholder 3"/><p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr><p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${img}"/><a:srcRect t="10000" b="10000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/></p:pic>` +
    `</p:spTree></p:cSld></p:sld>`, ct('presentationml.slide'));
  return pkg.build();
}

it('places a picture put in a placeholder where its layout\'s placeholder is', () => {
  const pics = readPptx(deck()).slides[0].contents.shapes.filter((s) => s.kind === 'picture');
  expect(pics).toHaveLength(1);
  const p = pics[0];
  expect([p.x1, p.y1, p.x2, p.y2].map((v) => Math.round(v))).toEqual([300, 50, 660, 450]);
  expect(p.crop).toBeTruthy();
});
