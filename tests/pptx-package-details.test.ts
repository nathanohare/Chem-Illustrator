// @vitest-environment jsdom
//
// The package details PowerPoint fills in on a save, filled in here too (finding S19): default
// content types only for the kinds of parts in the file, the counts in docProps/app.xml, the
// author of a new deck, and the slide size's name (Letter, A4...) kept from the file read.

import { afterEach, describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { defaultMaster, WIDE, STANDARD } from '../src/deck/deck';
import { setReviewAuthor } from '../src/document/revisions';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const parts = (bytes: Uint8Array): Record<string, string> => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; }, title: 'Talk' };
const blank = (extra: object = {}) => ({ layout: 'blank' as const, doc: new Doc(), notes: '', ...extra });
const defaults = (ct: string) => [...ct.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]).sort();

afterEach(() => setReviewAuthor(''));

describe('package details PowerPoint fills in (S19)', () => {
  it('lists a default content type only for the kinds of parts the deck has', async () => {
    const out = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides: [blank()] }, opts));
    expect(defaults(out['[Content_Types].xml'])).toEqual(['rels', 'xml']);
    // a picture on a slide brings its own
    const doc = new Doc();
    doc.edit('Picture', () => doc.addShape({ kind: 'picture', x1: 10, y1: 10, x2: 110, y2: 60, src: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`, px: { w: 2, h: 1 } }));
    const withPicture = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides: [blank({ doc })] }, opts));
    expect(defaults(withPicture['[Content_Types].xml'])).toEqual(['png', 'rels', 'xml']);
    expect(Object.keys(withPicture).some((k) => /^ppt\/media\/.*\.png$/.test(k))).toBe(true);
  });

  it('counts slides, notes and hidden slides in docProps/app.xml', async () => {
    const out = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides: [blank(), blank({ hidden: true, notes: 'Say this' }), blank({ hidden: true })] }, opts));
    const app = out['docProps/app.xml'];
    expect(app).toContain('<Slides>3</Slides>');
    expect(app).toContain('<Notes>1</Notes>');
    expect(app).toContain('<HiddenSlides>2</HiddenSlides>');
  });

  it('names whoever saves a new deck as its author', async () => {
    setReviewAuthor('C. Reviewer');
    const core = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides: [blank()] }, opts))['docProps/core.xml'];
    expect(core).toContain('<dc:creator>C. Reviewer</dc:creator>');
    expect(core).toContain('<cp:lastModifiedBy>C. Reviewer</cp:lastModifiedBy>');
  });

  it('keeps the slide size’s name (Letter, portrait) while the size stays', async () => {
    const files = unzipSync(await writePptx({ size: { w: 540, h: 720 }, master: defaultMaster(), slides: [blank()] }, opts));
    files['ppt/presentation.xml'] = new Uint8Array(strToU8(strFromU8(files['ppt/presentation.xml']).replace(/<p:sldSz cx="6858000" cy="9144000"\/>/, '<p:sldSz cx="6858000" cy="9144000" type="letter"/>')));
    const got = readPptx(zipSync(files));
    expect(got.size).toEqual({ w: 540, h: 720, type: 'letter' });
    const again = parts(await writePptx({ size: got.size, master: got.master, slides: [blank()] }, opts));
    expect(again['ppt/presentation.xml']).toContain('<p:sldSz cx="6858000" cy="9144000" type="letter"/>');
    // a size changed here is a size of its own
    const resized = parts(await writePptx({ size: { w: 600, h: 720 }, master: got.master, slides: [blank()] }, opts));
    expect(resized['ppt/presentation.xml']).toMatch(/<p:sldSz cx="7620000" cy="9144000"\/>/);
    // 10 x 7.5 in is still written as 4:3, and read back plainly
    const four3 = await writePptx({ size: STANDARD, master: defaultMaster(), slides: [blank()] }, opts);
    expect(parts(four3)['ppt/presentation.xml']).toContain('type="screen4x3"');
    expect(readPptx(four3).size).toEqual({ w: 720, h: 540 });
  });
});
