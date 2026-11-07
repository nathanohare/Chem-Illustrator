// @vitest-environment jsdom
//
// A symbol from Wingdings or another symbol font (w:sym) stays that symbol: kept in its font at
// the code it has there, and saved back so, rather than shown as a Latin letter in the text's
// font (Wingdings' check mark F0FC is not "ü"). The Symbol font's Greek letters still become
// Greek letters.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

describe('symbols from symbol fonts', () => {
  const body = '<w:p><w:r><w:t xml:space="preserve">Done </w:t></w:r><w:r><w:sym w:font="Wingdings" w:char="F0FC"/></w:r><w:r><w:t xml:space="preserve"> at 25 </w:t></w:r><w:r><w:sym w:font="Symbol" w:char="F0B0"/></w:r><w:r><w:t>C, </w:t></w:r><w:r><w:sym w:font="Symbol" w:char="F061"/></w:r></w:p>';

  it('keeps a Wingdings symbol in Wingdings, and turns Symbol\'s into Unicode', async () => {
    const { doc } = await readDocx(wordFile(body));
    const check = doc.runs.find((r) => r.text.includes(''));
    expect(check).toMatchObject({ font: 'Wingdings', text: '' });
    expect(doc.runs.map((r) => r.text).join('')).toBe('Done  at 25 °C, α');
    expect(doc.runs.some((r) => r.text.includes('ü'))).toBe(false);
  });

  it('saves the Wingdings symbol back in its font', async () => {
    const { doc } = await readDocx(wordFile(body));
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(xml).toMatch(/<w:rFonts w:ascii="Wingdings"[^>]*\/>.*?<w:t xml:space="preserve"><\/w:t>/);
    const again = (await readDocx(await writeDocx(doc, deps))).doc;
    expect(again.runs.find((r) => r.text.includes(''))?.font).toBe('Wingdings');
  });
});
