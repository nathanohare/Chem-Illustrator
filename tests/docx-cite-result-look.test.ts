// @vitest-environment jsdom
//
// A reference manager's citation shows as its field result looks: EndNote puts superscript on
// the result runs only, not on the run that starts the field.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';

const ENDNOTE = '<EndNote><Cite><Author>Fulmer</Author><Year>2010</Year><RecNum>12</RecNum><DisplayText><style face="superscript">1</style></DisplayText><record><rec-number>12</rec-number><foreign-keys><key app="EN" db-id="x0d2fdsr3">12</key></foreign-keys><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Fulmer, Gregory R.</author></authors></contributors><titles><title>NMR Chemical Shifts of Trace Impurities</title><secondary-title>Organometallics</secondary-title></titles><volume>29</volume><dates><year>2010</year></dates></record></Cite></EndNote>';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

/** An EndNote citation as EndNote writes it: plain begin, instruction and separator; superscript result. */
const endNoteField = (beginPr = '') => `<w:r>${beginPr}<w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ADDIN EN.CITE ${esc(ENDNOTE)}</w:instrText></w:r>`
  + '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
const para = (field: string) => `<w:p><w:r><w:t xml:space="preserve">Shifts</w:t></w:r>${field}<w:r><w:t>.</w:t></w:r></w:p>`;

describe('reference manager citations take the look of their result', () => {
  it('keeps an EndNote citation superscript when only its result is', async () => {
    const { doc } = await readDocx(wordFile(para(endNoteField())));
    const cite = doc.runs.find((r) => r.obj !== undefined && doc.objects[r.obj].kind === 'cite');
    expect(cite?.sup).toBe(true);
    // and it goes back to Word superscript
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    const result = /fldCharType="separate"\/><\/w:r>(<w:r>.*?<\/w:r>)/.exec(xml)?.[1] ?? '';
    expect(result).toMatch(/w:vertAlign w:val="superscript"/);
  });

  it('keeps a citation on the line when its result is', async () => {
    const { doc } = await readDocx(wordFile(para(endNoteField('<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>').replace('<w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1', '<w:t>1'))));
    const cite = doc.runs.find((r) => r.obj !== undefined && doc.objects[r.obj].kind === 'cite');
    expect(cite?.sup).toBeFalsy();
  });
});
