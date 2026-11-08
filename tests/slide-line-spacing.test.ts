// @vitest-environment jsdom
//
// PowerPoint spaces lines at the percentage times 1.2 times the text size (90% of 20 pt is
// 21.6 pt, 120% is 28.8 pt). Text on slides is laid out that way; drawings keep their own
// spacing (1.15 times the size) and Word documents theirs.

import { describe, it, expect } from 'vitest';
import { strToU8, strFromU8, unzipSync } from 'fflate';
import { layoutText, PPT_SINGLE, SINGLE, type TextFrame } from '../src/text/layout';
import { Doc, type Caption } from '../src/model';
import { Renderer, withMeasure } from '../src/render/renderer';
import { defaultMaster, textStyles } from '../src/deck/deck';
import { readPptx } from '../src/io/pptx-read';
import { writePptx, type DeckData, type PptxOptions } from '../src/io/pptx-write';
import { Package, NS, REL } from '../src/io/ooxml';

window.requestAnimationFrame = () => 0;
const measure = (t: string, s: number) => t.length * s * 0.5;
const frame = (more: Partial<TextFrame>): TextFrame => ({ runs: [{ text: 'one\ntwo\nthree', size: 20 }], justify: 'left', ...more });
const step = (f: TextFrame) => { const l = layoutText(f, 20, measure).lines; return +(l[1].y - l[0].y).toFixed(3); };

describe('line spacing on slides', () => {
  it('lays percent spacing out as PowerPoint does', () => {
    expect(step(frame({ single: PPT_SINGLE, lineSpacing: 0.9 }))).toBe(21.6);
    expect(step(frame({ single: PPT_SINGLE, lineSpacing: 1.2 }))).toBe(28.8);
    expect(step(frame({ single: PPT_SINGLE }))).toBe(24);
    // drawings and Word documents as before
    expect(step(frame({ lineSpacing: 0.9 }))).toBe(+(SINGLE * 0.9 * 20).toFixed(3));
    expect(step(frame({ boxes: true, paras: [{ line: 1 }, { line: 1 }, { line: 1 }] }))).toBe(+(SINGLE * 20).toFixed(3));
  });

  it('draws a slide\'s text that way, and a drawing\'s as before', () => {
    const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
    const r = new Renderer(scene, overlay);
    const caption = (doc: Doc): Caption => {
      let id = 0;
      doc.edit('text', () => { id = doc.addCaption({ x: 10, y: 30, justify: 'left', wrap: 400, lineSpacing: 0.9, runs: [{ text: 'one\ntwo\nthree', size: 20 }] }).id; });
      return doc.captions.get(id)!;
    };
    const slide = new Doc();
    slide.textStyles = textStyles(defaultMaster());
    r.useStyle(slide);
    const a = withMeasure(measure, () => r.captionLayout(caption(slide)).lines);
    expect(a[1].y - a[0].y).toBeCloseTo(21.6, 3);
    const drawing = new Doc();
    r.useStyle(drawing);
    const b = withMeasure(measure, () => r.captionLayout(caption(drawing)).lines);
    expect(b[1].y - b[0].y).toBeCloseTo(SINGLE * 0.9 * 20, 3);
  });

  it('places PowerPoint text anchored at the bottom by PowerPoint\'s spacing, and saves the percentage back', async () => {
    const X = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const E = 12700;
    const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
    const ct = (t: string) => `application/vnd.openxmlformats-officedocument.${t}+xml`;
    const pkg = new Package();
    pkg.relate('', REL.officeDocument, 'ppt/presentation.xml');
    const P = 'ppt/presentation.xml';
    const mRel = pkg.relate(P, REL.slideMaster, 'slideMasters/slideMaster1.xml');
    const sRel = pkg.relate(P, REL.slide, 'slides/slide1.xml');
    pkg.add(P, `${H}<p:presentation ${X}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="${mRel}"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="${sRel}"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`, ct('presentationml.presentation.main'));
    pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.theme, '../theme/theme1.xml');
    pkg.add('ppt/theme/theme1.xml', `${H}<a:theme xmlns:a="${NS.a}" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`, ct('theme'));
    const lRel = pkg.relate('ppt/slideMasters/slideMaster1.xml', REL.slideLayout, '../slideLayouts/slideLayout1.xml');
    pkg.add('ppt/slideMasters/slideMaster1.xml', `${H}<p:sldMaster ${X}><p:cSld><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${lRel}"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`, ct('presentationml.slideMaster'));
    pkg.relate('ppt/slideLayouts/slideLayout1.xml', REL.slideMaster, '../slideMasters/slideMaster1.xml');
    pkg.add('ppt/slideLayouts/slideLayout1.xml', `${H}<p:sldLayout ${X} type="blank"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld></p:sldLayout>`, ct('presentationml.slideLayout'));
    const S = 'ppt/slides/slide1.xml';
    pkg.relate(S, REL.slideLayout, '../slideLayouts/slideLayout1.xml');
    const para = (t: string) => `<a:p><a:pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="2000"/><a:t>${t}</a:t></a:r></a:p>`;
    pkg.add(S, `${H}<p:sld ${X}><p:cSld><p:spTree>${GRP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${100 * E}" y="${100 * E}"/><a:ext cx="${300 * E}" cy="${200 * E}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
      `<p:txBody><a:bodyPr wrap="square" anchor="b"><a:noAutofit/></a:bodyPr><a:lstStyle/>${para('one')}${para('two')}${para('three')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`, ct('presentationml.slide'));
    const got = readPptx(pkg.build());
    const c = got.slides[0].contents.captions[0];
    expect(c.lineSpacing).toBe(0.9);
    // the last line's bottom on the bottom inset: two steps of 21.6 pt, the first line's ascent and the last's descent
    const height = 2 * 21.6 + 0.8 * 20 + 0.25 * 20;
    expect(c.y).toBeCloseTo(100 + 3.6 + (200 - 7.2 - height) + 0.905 * 20, 1);
    // and the percentage written back as it came
    const doc = new Doc();
    doc.style = { ...got.master.drawing };
    doc.restoreContents(got.slides[0].contents);
    const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return new Uint8Array(strToU8('')); } };
    const bytes = await writePptx({ size: got.size, master: got.master, slides: [{ layout: got.slides[0].layout, doc, notes: '' }] } as DeckData, opts);
    expect(strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml'])).toContain('<a:lnSpc><a:spcPct val="90000"/></a:lnSpc>');
    expect(readPptx(bytes).slides[0].contents.captions[0].lineSpacing).toBe(0.9);
  });
});
