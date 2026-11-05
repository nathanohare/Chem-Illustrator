// @vitest-environment jsdom
//
// EndNote's field data (w:fldData, base64) usually ends with a NUL after </EndNote>: the
// citation must still be read, not dropped to plain text.

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readDocx } from '../src/io/docx';
import { readCiteField, toBase64 } from '../src/document/live-cites';

const ENDNOTE = '<EndNote><Cite><Author>Fulmer</Author><Year>2010</Year><RecNum>12</RecNum><DisplayText><style face="superscript">1</style></DisplayText><record><rec-number>12</rec-number><foreign-keys><key app="EN" db-id="x0d2fdsr3">12</key></foreign-keys><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Fulmer, Gregory R.</author></authors></contributors><titles><title>NMR Chemical Shifts of Trace Impurities</title><secondary-title>Organometallics</secondary-title></titles><volume>29</volume><dates><year>2010</year></dates></record></Cite></EndNote>';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

describe('EndNote field data ending in NUL', () => {
  const data = toBase64(`${ENDNOTE}\0`);

  it('reads the citation from the field data', () => {
    const got = readCiteField(' ADDIN EN.CITE ', data);
    expect(got?.items[0].ref.title).toBe('NMR Chemical Shifts of Trace Impurities');
  });

  it('opens the Word file with the citation live, and no warning', async () => {
    const begin = `<w:fldChar w:fldCharType="begin"><w:fldData xml:space="preserve">${data}</w:fldData></w:fldChar>`;
    const field = `<w:r>${begin}</w:r><w:r><w:instrText xml:space="preserve"> ADDIN EN.CITE </w:instrText></w:r>`
      + `<w:r>${begin}</w:r><w:r><w:instrText xml:space="preserve"> ADDIN EN.CITE.DATA </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`
      + '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const { doc, warnings } = await readDocx(wordFile(`<w:p><w:r><w:t xml:space="preserve">Shifts</w:t></w:r>${field}</w:p>`));
    expect(warnings).toEqual([]);
    expect(doc.references?.[0]).toMatchObject({ title: 'NMR Chemical Shifts of Trace Impurities', live: { app: 'endnote', id: '12' } });
    expect(Object.values(doc.objects).filter((o) => o.kind === 'cite').length).toBe(1);
  });
});
