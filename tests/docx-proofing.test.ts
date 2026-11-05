// @vitest-environment jsdom
//
// Word's proofing settings survive a round trip: the document's language (docDefaults' w:lang),
// text in another language (French quoted in an English paper), and text marked not to be
// checked (w:noProof, on chemical names and citations).

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));

function wordFile(body: string, docLang: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${R}styles" Target="styles.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/styles.xml': u8(`<?xml version="1.0"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="${docLang}" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`),
  });
}

const BODY = '<w:p><w:r><w:t xml:space="preserve">Le produit </w:t></w:r><w:r><w:rPr><w:noProof/></w:rPr><w:t>2-methylpyridine</w:t></w:r>'
  + '<w:r><w:rPr><w:lang w:val="en-GB"/></w:rPr><w:t xml:space="preserve"> (colourless)</w:t></w:r><w:r><w:rPr><w:lang w:val="fr-FR"/></w:rPr><w:t xml:space="preserve"> est pur.</w:t></w:r></w:p>';

describe('Word proofing language and no-proofing marks', () => {
  it('reads the document\'s language, a run in another one, and text not to be checked', async () => {
    const { doc } = await readDocx(wordFile(BODY, 'fr-FR'));
    expect(doc.lang).toBe('fr-FR');
    expect(doc.runs.find((r) => r.text === '2-methylpyridine')?.noProof).toBe(true);
    expect(doc.runs.find((r) => r.text === ' (colourless)')?.lang).toBe('en-GB');
    // (text in the document's own language carries none)
    expect(doc.runs.find((r) => r.text.includes('est pur'))?.lang).toBeUndefined();
  });

  it('writes them back', async () => {
    const { doc } = await readDocx(wordFile(BODY, 'fr-FR'));
    const files = unzipSync(await writeDocx(doc, deps));
    expect(strFromU8(files['word/styles.xml'])).toContain('<w:lang w:val="fr-FR" w:eastAsia="en-US" w:bidi="ar-SA"/>');
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toMatch(/<w:rPr>(?:(?!<\/w:rPr>).)*<w:noProof\/>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">2-methylpyridine</);
    expect(xml).toMatch(/<w:rPr>(?:(?!<\/w:rPr>).)*<w:lang w:val="en-GB"\/><\/w:rPr><w:t xml:space="preserve"> \(colourless\)</);
    const again = (await readDocx(new Uint8Array(zipSync(files)))).doc;
    expect(again.lang).toBe('fr-FR');
    expect(again.runs.find((r) => r.text === '2-methylpyridine')?.noProof).toBe(true);
    expect(again.runs.find((r) => r.text === ' (colourless)')?.lang).toBe('en-GB');
  });

  it('writes US English as the language of a document that has none of its own', async () => {
    const { doc } = await readDocx(wordFile('<w:p><w:r><w:t>Text</w:t></w:r></w:p>', 'en-US'));
    expect(doc.lang).toBeUndefined();
    expect(strFromU8(unzipSync(await writeDocx(doc, deps))['word/styles.xml'])).toContain('<w:lang w:val="en-US"');
  });
});
