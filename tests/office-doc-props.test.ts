// @vitest-environment jsdom
//
// A file's document properties (File > Info: title, author, when it was made, comments, company)
// survive a save here as Office keeps them: only the time modified, who modified it and the
// revision number change (ECMA-376 Part 2 §8; finding P4).

import { afterEach, describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { defaultMaster, WIDE } from '../src/deck/deck';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { Workbook } from '../src/sheet/workbook';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { setReviewAuthor } from '../src/document/revisions';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const u8 = (s: string): Uint8Array => new Uint8Array(strToU8(s));
const parts = (bytes: Uint8Array): Record<string, string> => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const CORE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
  + '<dc:title>Aldol screen</dc:title><dc:subject>Catalysis</dc:subject><dc:creator>A. Chemist</dc:creator><cp:keywords>aldol; proline</cp:keywords><dc:description>Group meeting notes &amp; results</dc:description>'
  + '<cp:lastModifiedBy>B. Student</cp:lastModifiedBy><cp:revision>7</cp:revision><cp:lastPrinted>2024-03-01T09:00:00Z</cp:lastPrinted>'
  + '<dcterms:created xsi:type="dcterms:W3CDTF">2024-02-14T10:30:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2024-05-01T08:00:00Z</dcterms:modified>'
  + '<cp:category>Research</cp:category><cp:contentStatus>Draft</cp:contentStatus></cp:coreProperties>';
const APP = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
  + '<Template>Normal.dotm</Template><TotalTime>95</TotalTime><Words>1234</Words><Application>Microsoft Office PowerPoint</Application><Manager>P. I.</Manager><Company>Some University</Company><HyperlinkBase>https://example.org/</HyperlinkBase><AppVersion>16.0000</AppVersion></Properties>';

/** The package with Office's document properties in place of the ones written here. */
function withOfficeProps(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  files['docProps/core.xml'] = u8(CORE);
  files['docProps/app.xml'] = u8(APP);
  return zipSync(files);
}

/** The text of an element in a part, or null. */
const el = (part: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`).exec(part);
  return m ? m[1] : null;
};

/** The properties Office keeps on a save, as this app should keep them too. */
function expectKept(core: string, app: string): void {
  expect(el(core, 'dc:title')).toBe('Aldol screen');
  expect(el(core, 'dc:creator')).toBe('A. Chemist');
  expect(el(core, 'dc:subject')).toBe('Catalysis');
  expect(el(core, 'cp:keywords')).toBe('aldol; proline');
  expect(el(core, 'dc:description')).toBe('Group meeting notes &amp; results');
  expect(el(core, 'cp:category')).toBe('Research');
  expect(el(core, 'cp:contentStatus')).toBe('Draft');
  expect(el(core, 'cp:lastPrinted')).toBe('2024-03-01T09:00:00Z');
  expect(el(core, 'dcterms:created')).toBe('2024-02-14T10:30:00Z');
  expect(core).toContain('<dcterms:created xsi:type="dcterms:W3CDTF">');
  // brought up to date, as Office does on each save
  expect(el(core, 'cp:revision')).toBe('8');
  expect(el(core, 'cp:lastModifiedBy')).toBe('C. Reviewer');
  expect(el(core, 'dcterms:modified')).not.toBe('2024-05-01T08:00:00Z');
  expect(Date.now() - Date.parse(el(core, 'dcterms:modified')!)).toBeLessThan(60_000);
  // app.xml: what a person typed in is kept; Office's counts and its name are not
  expect(el(app, 'Manager')).toBe('P. I.');
  expect(el(app, 'Company')).toBe('Some University');
  expect(el(app, 'HyperlinkBase')).toBe('https://example.org/');
  expect(el(app, 'Template')).toBe('Normal.dotm');
  expect(el(app, 'Application')).toBe('Chemweave');
  expect(app).not.toContain('<Words>');
  expect(app).not.toContain('<TotalTime>');
  expect(app).not.toContain('AppVersion');
}

afterEach(() => setReviewAuthor(''));

describe('document properties kept on save (P4)', () => {
  it('keeps a deck’s properties', async () => {
    setReviewAuthor('C. Reviewer');
    const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; }, title: 'file name' };
    const slides = [{ layout: 'blank' as const, doc: new Doc(), notes: '' }];
    const got = readPptx(withOfficeProps(await writePptx({ size: WIDE, master: defaultMaster(), slides }, opts)));
    const out = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides, kept: got.kept }, opts));
    expectKept(out['docProps/core.xml'], out['docProps/app.xml']);
    expect(el(out['docProps/app.xml'], 'Slides')).toBe('1');
  });

  it('keeps a workbook’s properties', async () => {
    setReviewAuthor('C. Reviewer');
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };
    const { book } = await readXlsx(withOfficeProps(await writeXlsx(new Workbook(['Sheet1']), pictures)));
    const out = parts(await writeXlsx(book, pictures));
    expectKept(out['docProps/core.xml'], out['docProps/app.xml']);
  });

  it('keeps a Word document’s properties, with the ones edited here as they are now', async () => {
    setReviewAuthor('C. Reviewer');
    const files: Record<string, string> = {
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/>`
        + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${R}extended-properties" Target="docProps/app.xml"/></Relationships>`,
      'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>',
      'docProps/core.xml': CORE,
      'docProps/app.xml': APP,
    };
    const deps: DocxDeps = { async picture() { return null; }, async svgToPng() { return PNG; } };
    const { doc } = await readDocx(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, u8(v)]))), {});
    let out = parts(await writeDocx(doc, deps, 'file name'));
    expectKept(out['docProps/core.xml'], out['docProps/app.xml']);
    // File > Properties here: a title changed and the company taken out
    out = parts(await writeDocx({ ...doc, props: { ...doc.props, title: 'New title', company: undefined } }, deps, 'file name'));
    expect(el(out['docProps/core.xml'], 'dc:title')).toBe('New title');
    expect(el(out['docProps/core.xml'], 'dc:description')).toBe('Group meeting notes &amp; results');
    expect(el(out['docProps/app.xml'], 'Company')).toBeNull();
  });

  it('leaves out who modified the file when no name is set, rather than naming someone else', async () => {
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };
    const { book } = await readXlsx(withOfficeProps(await writeXlsx(new Workbook(['Sheet1']), pictures)));
    const core = parts(await writeXlsx(book, pictures))['docProps/core.xml'];
    expect(el(core, 'cp:lastModifiedBy')).toBeNull();
    expect(el(core, 'dc:creator')).toBe('A. Chemist');
  });

  it('gives a new deck its name as the title, and made and modified now', async () => {
    const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; }, title: 'Seminar' };
    const core = parts(await writePptx({ size: WIDE, master: defaultMaster(), slides: [{ layout: 'blank', doc: new Doc(), notes: '' }] }, opts))['docProps/core.xml'];
    expect(el(core, 'dc:title')).toBe('Seminar');
    expect(el(core, 'cp:revision')).toBe('1');
    expect(el(core, 'dcterms:created')).toBe(el(core, 'dcterms:modified'));
  });
});
