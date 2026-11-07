// @vitest-environment jsdom
//
// Word comments on text in a table cell or a footnote (Office file audit W13): the text there
// keeps no comment marks here, so the comment goes on the whole table, or on the note's number,
// instead of being dropped, and goes back to Word round the table's text (or the number).

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { cmtIds } from '../src/document/comments';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));
const rels = (list: [string, string, string][]) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
const comment = (id: number, text: string) => `<w:comment w:id="${id}" w:author="Nate" w:date="2026-10-14T16:00:00Z"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:comment>`;
const MOVED = 'Comments on text in a table or a footnote were kept on the whole table or on the note\'s number.';

function wordFile(body: string, footnotes = ''): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'),
    '_rels/.rels': u8(rels([['rId1', `${R}officeDocument`, 'word/document.xml']])),
    'word/_rels/document.xml.rels': u8(rels([['rId4', `${R}comments`, 'comments.xml'], ['rId5', `${R}footnotes`, 'footnotes.xml']])),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/comments.xml': u8(`<?xml version="1.0"?><w:comments ${W}>${comment(0, 'Check the yield')}${comment(1, 'Which batch?')}${comment(2, 'Body comment')}</w:comments>`),
    'word/footnotes.xml': u8(`<?xml version="1.0"?><w:footnotes ${W}><w:footnote w:id="-1" w:type="separator"><w:p/></w:footnote>${footnotes}</w:footnotes>`),
  });
}

const cellBody = '<w:p><w:commentRangeStart w:id="2"/><w:r><w:t>Results</w:t></w:r><w:commentRangeEnd w:id="2"/><w:r><w:commentReference w:id="2"/></w:r></w:p>'
  + '<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>'
  + '<w:tr><w:tc><w:p><w:r><w:t>Entry</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Yield</w:t></w:r></w:p></w:tc></w:tr>'
  + '<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:commentRangeStart w:id="0"/><w:r><w:t>87%</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p></w:tc></w:tr>'
  + '</w:tbl><w:p><w:r><w:t>After.</w:t></w:r></w:p>';

describe('comments on text in table cells', () => {
  it('keeps the comment, on the whole table, and says so', async () => {
    const { doc, warnings } = await readDocx(wordFile(cellBody));
    expect(Object.keys(doc.comments ?? {}).map(Number).sort()).toEqual([0, 2]);
    const tableRun = doc.runs.find((r) => r.obj !== undefined && doc.objects[r.obj]?.kind === 'table');
    expect(cmtIds(tableRun?.cmt)).toEqual([0]);
    expect(warnings).toContain(MOVED);
  });

  it('saves it round the table\'s text, and it comes back on the table', async () => {
    const { doc } = await readDocx(wordFile(cellBody));
    const bytes = await writeDocx(doc, deps);
    const xml = strFromU8(unzipSync(bytes)['word/document.xml']);
    const tbl = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'));
    const id = Number(/<w:comment w:id="(\d+)"[^>]*>(?:(?!<\/w:comment>)[\s\S])*Check the yield/.exec(strFromU8(unzipSync(bytes)['word/comments.xml']))![1]);
    expect(tbl).toContain(`<w:commentRangeStart w:id="${id}"/>`);
    expect(tbl).toMatch(new RegExp(`<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r></w:p>`));
    expect(tbl.indexOf('commentRangeStart')).toBeLessThan(tbl.indexOf('Entry'));
    const again = (await readDocx(bytes)).doc;
    expect(Object.values(again.comments ?? {}).map((c) => c.text).sort()).toEqual(['Body comment', 'Check the yield']);
  });
});

describe('comments on text in footnotes', () => {
  const body = '<w:p><w:r><w:t>Made as before</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:t>.</w:t></w:r></w:p>';
  const notes = '<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> See </w:t></w:r><w:commentRangeStart w:id="1"/><w:r><w:t>batch 7</w:t></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r></w:p></w:footnote>';

  it('keeps the comment on the note\'s number', async () => {
    const { doc, warnings } = await readDocx(wordFile(body, notes));
    expect(doc.comments?.[1]?.text).toBe('Which batch?');
    const noteRun = doc.runs.find((r) => r.obj !== undefined && doc.objects[r.obj]?.kind === 'note');
    expect(cmtIds(noteRun?.cmt)).toEqual([1]);
    expect(warnings).toContain(MOVED);
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(xml).toMatch(/<w:commentRangeStart w:id="\d+"\/><w:r>(?:(?!<\/w:r>)[\s\S])*<w:footnoteReference/);
  });
});
