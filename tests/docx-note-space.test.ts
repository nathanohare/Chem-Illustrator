// @vitest-environment jsdom
//
// A footnote or endnote is saved with what it had after its number: Word's one space for a note
// typed in Word, nothing for one written without it (EndNote's), or a tab.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));

function wordFile(notes: string[]): Uint8Array {
  const body = `<w:p><w:r><w:t>Text</w:t></w:r>${notes.map((_, i) => `<w:r><w:endnoteReference w:id="${i + 1}"/></w:r>`).join('')}</w:p>`;
  const end = notes.map((n, i) => `<w:endnote w:id="${i + 1}"><w:p><w:r><w:endnoteRef/></w:r>${n}</w:p></w:endnote>`).join('');
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${R}endnotes" Target="endnotes.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/endnotes.xml': u8(`<?xml version="1.0"?><w:endnotes ${W}>${end}</w:endnotes>`),
  });
}

describe('the space after a note\'s number', () => {
  const notes = ['<w:r><w:t xml:space="preserve"> Typed in Word.</w:t></w:r>', '<w:r><w:t>Written without a space.</w:t></w:r>', '<w:r><w:tab/><w:t>After a tab.</w:t></w:r>'];

  it('is written back only where the note had it', async () => {
    const { doc } = await readDocx(wordFile(notes));
    const texts = Object.values(doc.objects).map((o) => (o.kind === 'note' ? o.runs.map((r) => r.text).join('') : ''));
    expect(texts).toEqual(['Typed in Word.', 'Written without a space.', 'After a tab.']);
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/endnotes.xml']);
    const after = (n: number) => new RegExp(`<w:endnote w:id="${n}">.*?<w:endnoteRef/></w:r>(.*?)</w:p>`).exec(xml)?.[1] ?? '';
    expect(after(1)).toMatch(/^<w:r><w:t xml:space="preserve"> <\/w:t><\/w:r><w:r>.*Typed in Word\./);
    expect(after(2)).toMatch(/^<w:r>(<w:rPr>.*?<\/w:rPr>)?<w:t xml:space="preserve">Written without a space\./);
    expect(after(3)).toMatch(/^<w:r><w:tab\/><\/w:r><w:r>.*After a tab\./);
  });
});
