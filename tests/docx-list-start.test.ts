// @vitest-environment jsdom
//
// Word lists number as Word counts them: a level's start value (w:start), a list's start
// override (Restart Numbering, Set Numbering Value), and lists sharing their levels counting on
// past other text. The numbers survive saving and opening again.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { editParas, listMarkers } from '../src/text/paragraphs';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };

function wordFile(body: string, numbering: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/_rels/document.xml.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${R}numbering" Target="numbering.xml"/></Relationships>`)),
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`)),
    'word/numbering.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:numbering ${W}>${numbering}</w:numbering>`)),
  });
}

const lvl = (i: number, start: number, fmt = 'decimal', text = `%${i + 1}.`) => `<w:lvl w:ilvl="${i}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/></w:lvl>`;
const item = (text: string, numId: number, ilvl = 0) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const para = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('Word list numbers', () => {
  it('starts a list at its level\'s start value, and keeps it on saving', async () => {
    const nb = `<w:abstractNum w:abstractNumId="0">${lvl(0, 3)}${lvl(1, 1, 'lowerLetter')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
    const { doc } = await readDocx(wordFile(item('Third', 1) + item('Fourth', 1), nb));
    expect(listMarkers(doc.paras)).toEqual(['3.', '4.']);
    const out = await writeDocx(doc, deps);
    expect(strFromU8(unzipSync(out)['word/numbering.xml'])).toContain('<w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride>');
    const again = await readDocx(out);
    expect(listMarkers(again.doc.paras)).toEqual(['3.', '4.']);
  });

  it('counts on past other text, and starts again where a list restarts', async () => {
    // lists 1 and 2 share their levels; list 2 starts again from 1 (Word's Restart Numbering)
    const nb = `<w:abstractNum w:abstractNumId="0">${lvl(0, 1)}${lvl(1, 1, 'lowerLetter')}</w:abstractNum>`
      + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
      + '<w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
    const body = item('A', 1) + item('B', 1) + para('Between') + item('C', 1) + item('D', 2) + item('E', 2) + item('E1', 2, 1);
    const { doc } = await readDocx(wordFile(body, nb));
    const want = ['1.', '2.', null, '3.', '1.', '2.', 'a.'];
    expect(listMarkers(doc.paras)).toEqual(want);
    const again = await readDocx(await writeDocx(doc, deps));
    expect(listMarkers(again.doc.paras)).toEqual(want);
  });

  it('starts a deeper level at its own number', async () => {
    const nb = `<w:abstractNum w:abstractNumId="0">${lvl(0, 1)}${lvl(1, 1, 'lowerLetter')}</w:abstractNum>`
      + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
      + '<w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="1"><w:startOverride w:val="4"/></w:lvlOverride></w:num>';
    const body = item('A', 1) + item('A1', 1, 1) + item('B', 1) + item('B1', 2, 1) + item('B2', 2, 1) + item('C', 2);
    const { doc } = await readDocx(wordFile(body, nb));
    const want = ['1.', 'a.', '2.', 'd.', 'e.', '3.'];
    expect(listMarkers(doc.paras)).toEqual(want);
    const again = await readDocx(await writeDocx(doc, deps));
    expect(listMarkers(again.doc.paras)).toEqual(want);
  });

  it('keeps a deeper level\'s own start in a list numbered 5. then c) d)', async () => {
    // one Word list whose levels are written differently (1. at the first, a) at the second), each with its own start
    const nb = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${lvl(0, 5)}${lvl(1, 3, 'lowerLetter', '%2)')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
    const body = item('Five', 1) + item('C', 1, 1) + item('D', 1, 1) + item('Six', 1) + item('C again', 1, 1);
    const { doc } = await readDocx(wordFile(body, nb));
    const want = ['5.', 'c)', 'd)', '6.', 'c)'];
    expect(listMarkers(doc.paras)).toEqual(want);
    const out = await writeDocx(doc, deps);
    const files = unzipSync(out);
    // saved as one Word list: every item's list has the same levels, the second written a)
    const numbering = strFromU8(files['word/numbering.xml']);
    const absOf = (numId: string) => new RegExp(`<w:num w:numId="${numId}"><w:abstractNumId w:val="(\\d+)"/>`).exec(numbering)?.[1];
    const used = [...strFromU8(files['word/document.xml']).matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => absOf(m[1]));
    expect(new Set(used).size).toBe(1);
    expect(numbering).toMatch(/<w:lvl w:ilvl="1"><w:start w:val="1"\/><w:numFmt w:val="lowerLetter"\/><w:lvlText w:val="%2\)"\/>/);
    expect(listMarkers((await readDocx(out)).doc.paras)).toEqual(want);
  });

  it('a new item made with Enter counts on from a number set on the item before', () => {
    const paras = editParas([{ list: 'number', startAt: 5 }], 'Five', 4, 4, '\n');
    expect(listMarkers(paras)).toEqual(['5.', '6.']);
  });
});
