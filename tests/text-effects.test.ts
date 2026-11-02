// @vitest-environment jsdom
//
// The Font box's text effects (kerning off, no fill, see-through fill, an outline, a shadow): kept
// through the text engine, drawn on a canvas, and saved in PowerPoint and Word files as their own.

import { describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
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
  it('reads them back', async () => {
    const { doc: t } = await readDocx(await writeDocx(sample(), deps));
    const fx = t.runs.find((r) => r.text === 'effects');
    expect(fx).toMatchObject({ ...FX, spacing: 1.5 });
    expect(t.runs.find((r) => r.text === ' hollow')).toMatchObject({ noFill: true, outline: '#000000' });
  });
});
