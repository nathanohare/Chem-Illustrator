// @vitest-environment jsdom
//
// The Font box's text effects (kerning off, no fill, see-through fill, an outline, a shadow): kept
// through the text engine, drawn on a canvas, and saved in PowerPoint and Word files as their own.

import { describe, it, expect, vi } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc, type Caption, type TextRun } from '../src/model';
import { defaultMaster } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, runStyleOf, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';
import { layoutText } from '../src/text/layout';
import { drawLayout } from '../src/text/draw';
import { arialWidth } from '../src/text-metrics';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
const measure = (t: string, s: number, _f: string, st: string) => arialWidth(t, s, /bold/.test(st));
const FX: Partial<TextRun> = { noKern: true, transparency: 0.3, outline: '#ff0000', outlineW: 1.5, shadow: true };

describe('text effects in the text engine', () => {
  it('keeps runs with different effects apart, and joins the same', () => {
    const runs = rt.normalizeRuns([{ text: 'a', shadow: true }, { text: 'b', shadow: true }, { text: 'c' }]);
    expect(runs).toEqual([{ text: 'ab', shadow: true }, { text: 'c' }]);
    expect(rt.applyStyle([{ text: 'abc' }], 0, 3, { outline: '#00ff00' })[0].outline).toBe('#00ff00');
  });
  it('puts them on every piece of the run when laid out', () => {
    const lay = layoutText({ runs: [{ text: 'hollow', noFill: true, outline: '#000000' }, { text: ' plain' }], justify: 'left' }, 20, measure);
    expect(lay.lines[0].pieces[0].fx).toEqual({ noFill: true, outline: '#000000' });
    expect(lay.lines[0].pieces[1].fx).toBeUndefined();
  });
  it('draws the outline and leaves out the fill', () => {
    const lay = layoutText({ runs: [{ text: 'hollow', noFill: true, outline: '#ff0000', shadow: true }], justify: 'left' }, 20, measure);
    const ctx = {
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: 'miter', globalAlpha: 1, shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
      fillText: vi.fn(), strokeText: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), getTransform: () => ({ a: 1, b: 0 }),
    };
    drawLayout(ctx as unknown as CanvasRenderingContext2D, lay, 0, 0);
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.strokeText).toHaveBeenCalledWith('hollow', 0, expect.any(Number));
    expect(ctx.strokeStyle).toBe('#ff0000');
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});

describe('text effects in PowerPoint files', () => {
  async function save(runs: TextRun[]): Promise<Uint8Array> {
    const doc = new Doc();
    doc.style = { ...defaultMaster().drawing } as Doc['style'];
    doc.edit('text', () => { doc.addCaption({ x: 100, y: 100, justify: 'left', runs } as Omit<Caption, 'id'>); });
    return writePptx({ size: { w: 960, h: 540 }, master: defaultMaster(), slides: [{ layout: 'blank', doc, notes: '' }] }, opts);
  }
  const runs: TextRun[] = [{ text: 'effects', color: '#0000ff', ...FX }, { text: ' hollow', noFill: true, outline: '#000000' }];
  it('writes PowerPoint\'s own markup', async () => {
    const xml = strFromU8(unzipSync(await save(runs))['ppt/slides/slide1.xml']);
    expect(xml).toContain('kern="0"');
    expect(xml).toContain('<a:ln w="19050"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>');
    expect(xml).toContain('<a:srgbClr val="0000FF"><a:alpha val="70000"/></a:srgbClr>');
    expect(xml).toContain('<a:outerShdw');
    expect(xml).toContain('<a:noFill/>');
  });
  it('reads them back', async () => {
    const c = readPptx(await save(runs)).slides[0].contents.captions[0];
    expect(c.runs[0]).toMatchObject({ text: 'effects', color: '#0000ff', ...FX });
    expect(c.runs[1]).toMatchObject({ text: ' hollow', noFill: true, outline: '#000000' });
    expect(c.runs[1].outlineW).toBeUndefined();
  });
});

describe('text effects in Word files', () => {
  const deps: DocxDeps = {
    async picture() { return { png: new Uint8Array(), svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', w: 1, h: 1 }; },
    async svgToPng() { return new Uint8Array(); },
  };
  const sample = (): DocText => {
    const d = newDocument();
    const n = runStyleOf(d.styles.Normal);
    return { ...d, runs: [{ ...n, text: 'plain ' }, { ...n, text: 'effects', ...FX, spacing: 1.5 }, { ...n, text: ' hollow', noFill: true, outline: '#000000' }] };
  };
  it('writes Word 2010\'s own markup', async () => {
    const body = strFromU8(unzipSync(await writeDocx(sample(), deps))['word/document.xml']);
    expect(body).toContain('<w:kern w:val="0"/>');
    expect(body).toContain('<w:spacing w:val="30"/>');
    expect(body).toMatch(/<w14:textOutline [^>]*w14:w="19050"/);
    expect(body).toMatch(/<w14:shadow /);
    expect(body).toContain('<w14:alpha w14:val="30000"/>');
    expect(body).toMatch(/<w14:textFill [^>]*><w14:noFill\/>/);
  });
  it('marks them ignorable, as Word does, so a program that doesn\'t know them skips them', async () => {
    const body = strFromU8(unzipSync(await writeDocx(sample(), deps))['word/document.xml']);
    expect(body).toMatch(/^[^]*?<w:document [^>]*xmlns:w14="http:\/\/schemas\.microsoft\.com\/office\/word\/2010\/wordml"[^>]*mc:Ignorable="w14 w15"/);
  });
  it('reads them back', async () => {
    const { doc: t } = await readDocx(await writeDocx(sample(), deps));
    const fx = t.runs.find((r) => r.text === 'effects');
    expect(fx).toMatchObject({ ...FX, spacing: 1.5 });
    expect(t.runs.find((r) => r.text === ' hollow')).toMatchObject({ noFill: true, outline: '#000000' });
  });
});

describe('Word 2010 text effects kept as Word wrote them (Word laptop check 4)', () => {
  const deps: DocxDeps = { async picture() { return null; } };
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const u8 = (s: string) => new Uint8Array(strToU8(s));
  const GLOW = '<w14:glow w14:rad="63500"><w14:schemeClr w14:val="accent1"><w14:alpha w14:val="60000"/><w14:satMod w14:val="175000"/></w14:schemeClr></w14:glow>';
  const SHADOW = '<w14:shadow w14:blurRad="50800" w14:dist="38100" w14:dir="5400000" w14:sx="100000" w14:sy="100000" w14:kx="0" w14:ky="0" w14:algn="t"><w14:srgbClr w14:val="C00000"><w14:alpha w14:val="40000"/></w14:srgbClr></w14:shadow>';
  const REFLECTION = '<w14:reflection w14:blurRad="6350" w14:stA="55000" w14:stPos="0" w14:endA="300" w14:endPos="45500" w14:dist="0" w14:dir="5400000" w14:fadeDir="5400000" w14:sx="100000" w14:sy="-100000" w14:kx="0" w14:ky="0" w14:algn="bl"/>';
  const OUTLINE = '<w14:textOutline w14:w="9525" w14:cap="flat" w14:cmpd="sng" w14:algn="ctr"><w14:solidFill><w14:srgbClr w14:val="1F4E79"/></w14:solidFill><w14:prstDash w14:val="solid"/><w14:round/></w14:textOutline>';
  const FILL = '<w14:textFill><w14:gradFill><w14:gsLst><w14:gs w14:pos="0"><w14:srgbClr w14:val="FF0000"/></w14:gs><w14:gs w14:pos="100000"><w14:srgbClr w14:val="0000FF"/></w14:gs></w14:gsLst><w14:lin w14:ang="5400000" w14:scaled="0"/></w14:gradFill></w14:textFill>';
  const PROPS3D = '<w14:props3d w14:extrusionH="0" w14:contourW="0" w14:prstMaterial="warmMatte"/>';
  const LIGATURES = '<w14:ligatures w14:val="standard"/>';
  const ALL = GLOW + SHADOW + REFLECTION + OUTLINE + FILL + PROPS3D + LIGATURES;
  const file = () => zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t xml:space="preserve">plain </w:t></w:r><w:r><w:rPr><w:b/>${ALL}</w:rPr><w:t>Glowing</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`),
  });
  const effectsOf = (xml: string) => /<w:r><w:rPr>((?:(?!<\/w:rPr>).)*)<\/w:rPr><w:t xml:space="preserve">Glowing<\/w:t>/.exec(xml)?.[1] ?? '';

  it('writes back a glow, reflection, 3-D and ligatures, and the exact shadow, outline and fill, in Word\'s order', async () => {
    const { doc } = await readDocx(file());
    // what is drawn here is read from them
    expect(doc.runs.find((r) => r.text === 'Glowing')).toMatchObject({ shadow: true, outline: '#1f4e79' });
    const body = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    const fx = effectsOf(body);
    expect(fx).toContain(ALL);
    expect(body).toMatch(/<w:document [^>]*mc:Ignorable="w14 w15"/);
    // and opens again the same
    const again = (await readDocx(new Uint8Array(await writeDocx(doc, deps)))).doc;
    expect(again.runs.find((r) => r.text === 'Glowing')?.wfx).toBe(ALL);
  });

  it('leaves a style\'s effects (ligatures for the whole document) off the runs', async () => {
    const files = unzipSync(file());
    files['word/_rels/document.xml.rels'] = u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${R}styles" Target="styles.xml"/></Relationships>`);
    files['word/styles.xml'] = u8(`<?xml version="1.0"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${LIGATURES}</w:rPr></w:rPrDefault></w:docDefaults></w:styles>`);
    const { doc } = await readDocx(zipSync(files));
    expect(doc.runs.find((r) => r.text === 'plain ')?.wfx).toBeUndefined();
    expect(doc.runs.find((r) => r.text === 'Glowing')?.wfx).toBe(ALL);
  });

  it('makes the shadow, outline or fill afresh once changed here, keeping the rest', async () => {
    const { doc } = await readDocx(file());
    doc.runs = doc.runs.map((r) => (r.text === 'Glowing' ? { ...r, shadow: undefined, outline: '#00ff00' } : r));
    const fx = effectsOf(strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']));
    expect(fx).toContain(GLOW);
    expect(fx).not.toContain('<w14:shadow');
    expect(fx).toMatch(/<w14:textOutline [^>]*><w14:solidFill><w14:srgbClr w14:val="00FF00"\/>/);
    expect(fx).toContain(FILL);
    expect(fx.indexOf('<w14:glow')).toBeLessThan(fx.indexOf('<w14:reflection'));
    expect(fx.indexOf('<w14:textOutline')).toBeLessThan(fx.indexOf('<w14:textFill'));
    expect(fx.indexOf('<w14:textFill')).toBeLessThan(fx.indexOf('<w14:props3d'));
  });
});

