// @vitest-environment jsdom
//
// Word's and Excel's theme part is saved back as the file had it while the theme isn't changed
// here, so its fonts for each script (Japanese, Arabic...), effect styles and the rest survive
// (ECMA-376 Part 1 §20.1.6; finding P8). A theme changed here is written from the change.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { Workbook } from '../src/sheet/workbook';
import { WORKBOOK_THEMES } from '../src/sheet/themes';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const u8 = (s: string): Uint8Array => new Uint8Array(strToU8(s));
const parts = (bytes: Uint8Array): Record<string, string> => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };

/** A theme as Office writes one: colours, fonts with an entry for each script, and effect styles. */
const theme = (accent1 = '2E75B6') => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lab Theme"><a:themeElements>'
  + '<a:clrScheme name="Lab"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
  + `<a:accent1><a:srgbClr val="${accent1}"/></a:accent1><a:accent2><a:srgbClr val="C55A11"/></a:accent2><a:accent3><a:srgbClr val="7F7F7F"/></a:accent3><a:accent4><a:srgbClr val="BF9000"/></a:accent4><a:accent5><a:srgbClr val="2F5597"/></a:accent5><a:accent6><a:srgbClr val="538135"/></a:accent6>`
  + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
  + '<a:fontScheme name="Lab"><a:majorFont><a:latin typeface="Cambria" panose="02040503050406030204"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="Yu Mincho"/><a:font script="Arab" typeface="Times New Roman"/></a:majorFont>'
  + '<a:minorFont><a:latin typeface="Calibri" panose="020F0502020204030204"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="Yu Gothic"/><a:font script="Arab" typeface="Arial"/></a:minorFont></a:fontScheme>'
  + '<a:fmtScheme name="Lab"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
  + '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>'
  + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

/** A workbook written here, with the theme part replaced by `themeXml` (and pictures of its own when `withRels`). */
async function workbookWithTheme(themeXml: string, withRels = false): Promise<Uint8Array> {
  const book = new Workbook(['Sheet1']);
  book.setTheme(WORKBOOK_THEMES[1]);
  const files = unzipSync(await writeXlsx(book, pictures));
  files['xl/theme/theme1.xml'] = u8(themeXml);
  if (withRels) files['xl/theme/_rels/theme1.xml.rels'] = u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}image" Target="../media/image9.png"/></Relationships>`);
  return zipSync(files);
}

describe('the theme part kept on save (P8)', () => {
  it('writes a workbook’s theme back as it came', async () => {
    const { book } = await readXlsx(await workbookWithTheme(theme()));
    expect(book.theme?.colors[4]).toBe('#2e75b6');
    const out = parts(await writeXlsx(book, pictures));
    expect(out['xl/theme/theme1.xml']).toBe(theme());
    expect(out['xl/_rels/workbook.xml.rels']).toContain('theme/theme1.xml');
  });

  it('writes a workbook’s theme afresh once it is changed here', async () => {
    const { book } = await readXlsx(await workbookWithTheme(theme()));
    book.setTheme(WORKBOOK_THEMES[2]);
    const out = parts(await writeXlsx(book, pictures));
    expect(out['xl/theme/theme1.xml']).not.toContain('Yu Gothic');
    expect(out['xl/theme/theme1.xml']).toContain(WORKBOOK_THEMES[2].minor);
  });

  it('makes a theme with pictures of its own afresh (its pictures aren’t kept)', async () => {
    const { book } = await readXlsx(await workbookWithTheme(theme(), true));
    const out = parts(await writeXlsx(book, pictures));
    expect(out['xl/theme/theme1.xml']).not.toBe(theme());
    expect(out['xl/theme/theme1.xml']).toContain('2E75B6');
  });

  it('writes a Word document’s theme back, unless a Design theme is chosen here', async () => {
    const files: Record<string, string> = {
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
      '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`,
      'word/_rels/document.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}theme" Target="theme/theme1.xml"/></Relationships>`,
      'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>',
      'word/theme/theme1.xml': theme(),
    };
    const deps: DocxDeps = { async picture() { return null; }, async svgToPng() { return PNG; } };
    const { doc } = await readDocx(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, u8(v)]))), {});
    let out = parts(await writeDocx(doc, deps, 't'));
    expect(out['word/theme/theme1.xml']).toBe(theme());
    expect(out['word/_rels/document.xml.rels']).toContain('theme/theme1.xml');
    expect(out['[Content_Types].xml']).toContain('PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"');
    // Design > Themes here: the chosen theme is Word's
    out = parts(await writeDocx({ ...doc, design: { theme: 'Report' } }, deps, 't'));
    expect(out['word/theme/theme1.xml']).not.toContain('Yu Gothic');
    // and saved with that choice, the next save writes it from the choice again, not the original
    const { doc: again } = await readDocx(await writeDocx({ ...doc, design: { theme: 'Report' } }, deps, 't'), {});
    expect(again.kept?.theme).toBeUndefined();
  });
});
