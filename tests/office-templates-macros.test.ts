// @vitest-environment jsdom
//
// Templates (.dotx, .potx, .xltx) and macro-enabled files (.docm, .pptm, .xltm...) open from
// File > Open, say when their macros can't be kept, and save as the usual kind of file with
// that kind's content types (finding P5).

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { Doc } from '../src/model';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { defaultMaster, WIDE } from '../src/deck/deck';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { Workbook } from '../src/sheet/workbook';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { SHEET_OPEN_ONLY, SLIDES_OPEN_ONLY } from '../src/io/files';
import { DOC_OPEN_ONLY } from '../src/io/doc-sniff';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const u8 = (s: string): Uint8Array => new Uint8Array(strToU8(s));
const parts = (bytes: Uint8Array): Record<string, string> => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const VBA_REL = 'http://schemas.microsoft.com/office/2006/relationships/vbaProject';
const VBA = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

/** The package with macros (a VBA project) added to its main part, and the main part's content type changed. */
function withMacros(bytes: Uint8Array, main: string, vbaPath: string, mainType: string): Uint8Array {
  const files = unzipSync(bytes);
  const relsPath = main.replace(/([^/]+)$/, '_rels/$1.rels');
  const rels = files[relsPath] ? strFromU8(files[relsPath]) : '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  files[relsPath] = u8(rels.replace('</Relationships>', `<Relationship Id="rIdVba" Type="${VBA_REL}" Target="vbaProject.bin"/></Relationships>`));
  files[vbaPath] = VBA;
  files['[Content_Types].xml'] = u8(strFromU8(files['[Content_Types].xml'])
    .replace(new RegExp(`(PartName="/${main}" ContentType=")[^"]*"`), `$1${mainType}"`)
    .replace('</Types>', `<Override PartName="/${vbaPath}" ContentType="application/vnd.ms-office.vbaProject"/></Types>`));
  return zipSync(files);
}

const wordFile = (mainType: string): Uint8Array => zipSync(Object.fromEntries(Object.entries({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + `<Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`,
  '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>',
}).map(([k, v]) => [k, u8(v)])));

const docxDeps: DocxDeps = { async picture() { return null; }, async svgToPng() { return PNG; } };
const pptxOpts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };

describe('templates and macro-enabled files (P5)', () => {
  it('offers them in File > Open', () => {
    expect(DOC_OPEN_ONLY).toEqual(expect.arrayContaining(['docm', 'dotx', 'dotm']));
    expect(SLIDES_OPEN_ONLY).toEqual(expect.arrayContaining(['pptm', 'potx', 'potm', 'ppsx', 'ppsm']));
    expect(SHEET_OPEN_ONLY).toEqual(expect.arrayContaining(['xltx', 'xltm']));
  });

  it('says a Word document’s macros are left out, and saves it as a .docx', async () => {
    const docm = withMacros(wordFile('application/vnd.ms-word.document.macroEnabled.main+xml'), 'word/document.xml', 'word/vbaProject.bin', 'application/vnd.ms-word.document.macroEnabled.main+xml');
    const { doc, warnings } = await readDocx(docm, {});
    expect(warnings.join(' ')).toMatch(/macros \(VBA\).*left out when it is saved/);
    const out = parts(await writeDocx(doc, docxDeps, 't'));
    expect(out['[Content_Types].xml']).toContain('PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"');
    expect(out['[Content_Types].xml']).not.toContain('macroEnabled');
    expect(Object.keys(out).some((k) => /vbaProject/.test(k))).toBe(false);
  });

  it('saves a Word template as a document, with no warning', async () => {
    const { doc, warnings } = await readDocx(wordFile('application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml'), {});
    expect(warnings.join(' ')).not.toMatch(/macros/);
    const out = parts(await writeDocx(doc, docxDeps, 't'));
    expect(out['[Content_Types].xml']).toContain('wordprocessingml.document.main+xml');
    expect(out['[Content_Types].xml']).not.toContain('template.main');
  });

  it('says a presentation’s macros are left out, and saves it as a .pptx', async () => {
    const slides = [{ layout: 'blank' as const, doc: new Doc(), notes: '' }];
    const pptm = withMacros(await writePptx({ size: WIDE, master: defaultMaster(), slides }, pptxOpts), 'ppt/presentation.xml', 'ppt/vbaProject.bin', 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml');
    const got = readPptx(pptm);
    expect(got.warnings.join(' ')).toMatch(/macros \(VBA\).*left out when it is saved/);
    const out = parts(await writePptx({ size: got.size, master: got.master, slides, kept: got.kept }, pptxOpts));
    expect(out['[Content_Types].xml']).toContain('PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"');
    expect(Object.keys(out).some((k) => /vbaProject/.test(k))).toBe(false);
  });

  it('says a workbook’s Excel 4.0 macro sheets come in as ordinary sheets', async () => {
    const files = unzipSync(await writeXlsx(new Workbook(['Macro1', 'Data']), pictures));
    files['xl/_rels/workbook.xml.rels'] = u8(strFromU8(files['xl/_rels/workbook.xml.rels'])
      .replace(/(<Relationship [^>]*Type=")[^"]*worksheet("[^>]*Target="worksheets\/sheet1\.xml")/, '$1http://schemas.microsoft.com/office/2006/relationships/xlMacrosheet$2'));
    const { warnings } = await readXlsx(zipSync(files));
    expect(warnings.join(' ')).toContain('1 Excel 4 macro sheet (opened as an ordinary sheet)');
  });

  it('saves a macro-enabled workbook template as .xlsm with its macros, or as .xlsx without', async () => {
    const xltm = withMacros(await writeXlsx(new Workbook(['Sheet1']), pictures), 'xl/workbook.xml', 'xl/vbaProject.bin', 'application/vnd.ms-excel.template.macroEnabled.main+xml');
    const { book } = await readXlsx(xltm);
    expect(book.macros).toBeTruthy();
    const asXlsm = parts(await writeXlsx(book, pictures, { macros: true }));
    expect(asXlsm['[Content_Types].xml']).toContain('PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"');
    expect(asXlsm['xl/_rels/workbook.xml.rels']).toContain('vbaProject.bin');
    const asXlsx = parts(await writeXlsx(book, pictures));
    expect(asXlsx['[Content_Types].xml']).toContain('PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"');
    expect(asXlsx['[Content_Types].xml']).not.toContain('template');
    expect(Object.keys(asXlsx).some((k) => /vbaProject/.test(k))).toBe(false);
  });
});
