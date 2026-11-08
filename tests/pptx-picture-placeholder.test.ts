// @vitest-environment jsdom
//
// A slide with PowerPoint's Picture with Caption layout whose picture was put in with the
// placeholder's picture button: the picture stays that placeholder's picture (p:pic with
// p:ph type="pic"), the slide keeps its layout, and the empty caption stays as the layout has it
// (its own text styles, no bullets or sizes invented on the slide).

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
const ph = (id: number, name: string, p: string, spPr: string, lst = '', body = '<a:bodyPr/>') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${p}</p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody>${body}<a:lstStyle>${lst}</a:lstStyle><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody></p:sp>`;
const CAPTION_LST = '<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="1600"/></a:lvl1pPr>';

/** A deck as PowerPoint saves one: Title and Content and Picture with Caption layouts, one slide of the second with its picture put in by the placeholder's button. */
function deck(): Uint8Array {
  const pkg = new Package();
  pkg.defaultType('png', 'image/png');
  pkg.relate('', REL.officeDocument, 'ppt/presentation.xml');
  const P = 'ppt/presentation.xml';
  const mRel = pkg.relate(P, REL.slideMaster, 'slideMasters/slideMaster1.xml');
  const sRel = pkg.relate(P, REL.slide, 'slides/slide1.xml');
  pkg.add(P, `${H}<p:presentation ${X}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${mRel}"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="${sRel}"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`, ct('presentationml.presentation.main'));
  const M = 'ppt/slideMasters/slideMaster1.xml';
  pkg.relate(M, REL.theme, '../theme/theme1.xml');
  pkg.add('ppt/theme/theme1.xml', `${H}<a:theme xmlns:a="${NS.a}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`, ct('theme'));
  const l1 = pkg.relate(M, REL.slideLayout, '../slideLayouts/slideLayout1.xml');
  const l2 = pkg.relate(M, REL.slideLayout, '../slideLayouts/slideLayout2.xml');
  pkg.add(M, `${H}<p:sldMaster ${X}><p:cSld><p:spTree>${GRP}` +
    ph(2, 'Title Placeholder 1', '<p:ph type="title"/>', xf(60, 30, 840, 110)) + ph(3, 'Text Placeholder 2', '<p:ph type="body" idx="1"/>', xf(60, 150, 840, 350)) +
    `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${l1}"/><p:sldLayoutId id="2147483650" r:id="${l2}"/></p:sldLayoutIdLst>` +
    `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600"><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`, ct('presentationml.slideMaster'));
  for (const l of ['slideLayout1.xml', 'slideLayout2.xml']) pkg.relate(`ppt/slideLayouts/${l}`, REL.slideMaster, '../slideMasters/slideMaster1.xml');
  pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="obj" preserve="1"><p:cSld name="Title and Content"><p:spTree>${GRP}` +
    ph(2, 'Title 1', '<p:ph type="title"/>', '') + ph(3, 'Content Placeholder 2', '<p:ph idx="1"/>', '') + `</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
  pkg.add('ppt/slideLayouts/slideLayout2.xml', `${H}<p:sldLayout ${X} type="picTx" preserve="1"><p:cSld name="Picture with Caption"><p:spTree>${GRP}` +
    ph(2, 'Title 1', '<p:ph type="title"/>', xf(60, 36, 340, 120), '<a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr>', '<a:bodyPr anchor="b"/>') +
    ph(3, 'Picture Placeholder 2', '<p:ph type="pic" idx="1"/>', xf(450, 60, 450, 420), '<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="3200"/></a:lvl1pPr>') +
    ph(4, 'Text Placeholder 3', '<p:ph type="body" sz="half" idx="2"/>', xf(60, 162, 340, 300), CAPTION_LST) +
    `</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
  const S = 'ppt/slides/slide1.xml';
  pkg.relate(S, REL.slideLayout, '../slideLayouts/slideLayout2.xml');
  const img = pkg.relate(S, REL.image, '../media/image1.png');
  pkg.add('ppt/media/image1.png', PNG);
  pkg.add(S, `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}` +
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>Spectrum</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture Placeholder 3"/><p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr><p:nvPr><p:ph type="pic" idx="1"/></p:nvPr></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${img}"/><a:srcRect t="12000" b="12000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/></p:pic>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="half" idx="2"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld></p:sld>`, ct('presentationml.slide'));
  return pkg.build();
}

async function resave(got: PptxRead): Promise<Uint8Array> {
  const slides = got.slides.map((s) => {
    const d = new Doc();
    d.style = { ...got.master.drawing };
    d.restoreContents(s.contents);
    return { layout: s.layout, doc: d, notes: s.notes };
  });
  return writePptx({ size: got.size, master: got.master, slides } as DeckData, opts);
}

/** The saved slide and its layout part. */
function parts(bytes: Uint8Array): { slide: string; layout: string } {
  const files = unzipSync(bytes);
  const rels = strFromU8(files['ppt/slides/_rels/slide1.xml.rels']);
  const target = /Target="\.\.\/slideLayouts\/([^"]+)"/.exec(rels)![1];
  return { slide: strFromU8(files['ppt/slides/slide1.xml']), layout: strFromU8(files[`ppt/slideLayouts/${target}`]) };
}
const phIdx = (xml: string, type: string) => new RegExp(`<p:ph type="${type}"(?: sz="half")? idx="(\\d+)"/>`).exec(xml)?.[1];

describe('a picture put in a picture placeholder', () => {
  it('reads the slide with its own layout, the picture in its placeholder, and the caption without bullets', () => {
    const got = readPptx(deck());
    const s = got.slides[0];
    const def = got.master.layouts?.find((l) => l.id === s.layout);
    expect(def?.name).toBe('Picture with Caption');
    expect(def?.pics).toHaveLength(1);
    const pic = s.contents.shapes.find((x) => x.kind === 'picture')!;
    expect(pic.phPic).toBe(0);
    expect(pic.crop).toBeTruthy();
    const caption = s.contents.captions.find((c) => c.ph === 'body')!;
    expect(caption.runs).toEqual([]);
    expect(caption.paras).toBeUndefined();
  });

  it('saves it as the placeholder\'s picture, on the slide\'s own layout, with the empty caption as the layout has it', async () => {
    const { slide, layout } = parts(await resave(readPptx(deck())));
    // the picture is the picture placeholder's, with its cropping
    const pic = /<p:pic>.*?<\/p:pic>/.exec(slide)![0];
    const k = phIdx(pic, 'pic');
    expect(k).toBeTruthy();
    expect(pic).toContain('<a:srcRect l="0" t="12000" r="0" b="12000"/>');
    // the layout is Picture with Caption, with that picture placeholder and the caption's own text styles
    expect(layout).toContain('type="picTx"');
    expect(layout).toContain('name="Picture with Caption"');
    expect(phIdx(layout, 'pic')).toBe(k);
    const captionIdx = phIdx(layout, 'body');
    expect(captionIdx).toBeTruthy();
    expect(layout).toContain('<a:buNone/><a:defRPr sz="1600"/>');
    // the empty caption on the slide is the layout's placeholder, with no styles of its own
    const caption = new RegExp(`<p:sp>(?:(?!</p:sp>).)*<p:ph type="body"(?: sz="half")? idx="${captionIdx}"/>.*?</p:sp>`).exec(slide)![0];
    expect(caption).not.toMatch(/buChar|sz="\d+"[^>]*>(?!<\/a:p>)|Click to add/);
    expect(caption).toContain('<a:lstStyle/><a:p><a:endParaRPr');
  });

  it('comes back the same after a second save', async () => {
    const again = readPptx(await resave(readPptx(deck())));
    const s = again.slides[0];
    expect(again.master.layouts?.find((l) => l.id === s.layout)?.name).toBe('Picture with Caption');
    expect(s.contents.shapes.find((x) => x.kind === 'picture')?.phPic).toBe(0);
    const { slide, layout } = parts(await resave(again));
    expect(phIdx(slide, 'pic')).toBe(phIdx(layout, 'pic'));
    expect(layout).toContain('type="picTx"');
  });
});
