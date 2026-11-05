// @vitest-environment jsdom
//
// Word's pagination settings survive a round trip: Keep lines together (w:keepLines, often in
// heading and caption styles) and Widow/Orphan control turned off (w:widowControl w:val="0"),
// in a style or on a paragraph. Widow control is on by default, once, in the document defaults.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));

function wordFile(body: string, styles: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${R}styles" Target="styles.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/styles.xml': u8(`<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`),
  });
}

const STYLES = '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Loose"><w:name w:val="Loose"/><w:basedOn w:val="Normal"/><w:pPr><w:widowControl w:val="0"/></w:pPr></w:style>';
const BODY = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Results</w:t></w:r></w:p>'
  + '<w:p><w:pPr><w:widowControl w:val="0"/></w:pPr><w:r><w:t>Body text left free to break.</w:t></w:r></w:p>'
  + '<w:p><w:pPr><w:keepLines/></w:pPr><w:r><w:t>Kept together.</w:t></w:r></w:p>'
  + '<w:p><w:pPr><w:pStyle w:val="Loose"/></w:pPr><w:r><w:t>In a style without widow control.</w:t></w:r></w:p>';

describe('Word pagination settings', () => {
  it('reads Keep lines together and widow control off, in styles and paragraphs', async () => {
    const { doc } = await readDocx(wordFile(BODY, STYLES));
    expect(doc.styles.Heading1.keepLines).toBe(true);
    expect(doc.styles.Loose.noWidow).toBe(true);
    expect(doc.paras.map((p) => [!!p.keepLines, !!p.noWidow])).toEqual([[true, false], [false, true], [true, false], [false, true]]);
  });

  it('writes them back where they were, with widow control on once in the defaults', async () => {
    const { doc } = await readDocx(wordFile(BODY, STYLES));
    const files = unzipSync(await writeDocx(doc, deps));
    const styles = strFromU8(files['word/styles.xml']);
    const body = strFromU8(files['word/document.xml']);
    expect(styles).toMatch(/<w:style [^>]*w:styleId="Heading1">.*?<w:keepNext\/><w:keepLines\/>.*?<\/w:style>/);
    expect(styles).toMatch(/<w:style [^>]*w:styleId="Loose">.*?<w:widowControl w:val="0"\/>.*?<\/w:style>/);
    expect(styles.match(/<w:widowControl\/>/g)).toEqual(['<w:widowControl/>']);
    expect(styles).toContain('<w:pPrDefault><w:pPr><w:widowControl/>');
    const paras = body.split('</w:p>');
    expect(paras[0]).not.toContain('keepLines');
    expect(paras[1]).toContain('<w:widowControl w:val="0"/>');
    expect(paras[2]).toContain('<w:keepLines/>');
    expect(paras[3]).not.toContain('widowControl');
    const again = (await readDocx(new Uint8Array(zipSync(files)))).doc;
    expect(again.paras.map((p) => [!!p.keepLines, !!p.noWidow])).toEqual([[true, false], [false, true], [true, false], [false, true]]);
  });
});
