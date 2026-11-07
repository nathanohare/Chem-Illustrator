// @vitest-environment jsdom
//
// Tracked changes that are kept only in part say so when the file opens: a move without a name
// (kept as a deletion and an insertion) and a tracked change to a paragraph's, section's or
// table's formatting (accepted: the new formatting stays, the record of the change goes). A move
// with its name (Word's own) is kept as a move: both ends go back to Word paired by that name.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { parseRev, changesIn } from '../src/document/revisions';
import * as rt from '../src/richtext';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const u8 = (s: string) => new Uint8Array(strToU8(s));

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

const MOVES = 'Text moved while changes were tracked, without a name for the move, shows as a deletion and an insertion.';
const deps: DocxDeps = { async picture() { return null; } };
const PROPS = 'Tracked changes to paragraph, section and table formatting were accepted (changes to text and its formatting are kept).';
const who = 'w:author="Nate" w:date="2026-10-14T16:00:00Z"';

describe('tracked changes kept in part', () => {
  const moveBody = `<w:p><w:moveFromRangeStart w:id="1" ${who} w:name="move1"/><w:moveFrom w:id="2" ${who}><w:r><w:t>Stir. </w:t></w:r></w:moveFrom><w:moveFromRangeEnd w:id="1"/><w:r><w:t>Heat.</w:t></w:r></w:p>`
    + `<w:p><w:moveToRangeStart w:id="3" ${who} w:name="move1"/><w:moveTo w:id="4" ${who}><w:r><w:t>Stir. </w:t></w:r></w:moveTo><w:moveToRangeEnd w:id="3"/></w:p>`;

  it('keeps a named move as a move: a deletion and an insertion paired by its name', async () => {
    const { doc, warnings } = await readDocx(wordFile(moveBody));
    expect(warnings).not.toContain(MOVES);
    expect(rt.plainText(doc.runs)).toBe('Stir. Heat.\nStir. ');
    const marks = changesIn(doc.runs).map((c) => [c.kind, c.text, parseRev(doc.runs.find((r) => r.rev && r.text.includes(c.text.trim()) && parseRev(r.rev)?.kind === c.kind)?.rev)?.move]);
    expect(marks).toEqual([['del', 'Stir. ', 'move1'], ['ins', 'Stir. ', 'move1']]);
  });

  it('saves a move back as Word\'s moveFrom and moveTo with named ranges round them', async () => {
    const { doc } = await readDocx(wordFile(moveBody));
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(xml).toMatch(/<w:moveFromRangeStart w:id="(\d+)" w:name="move1"[^>]*\/><w:moveFrom [^>]*><w:r>.*?<w:t[^>]*>Stir. <\/w:t><\/w:r><\/w:moveFrom><w:moveFromRangeEnd w:id="\1"\/>/);
    expect(xml).toMatch(/<w:moveToRangeStart w:id="(\d+)" w:name="move1"[^>]*\/><w:moveTo [^>]*>.*?<\/w:moveTo><w:moveToRangeEnd w:id="\1"\/>/);
    expect(xml).not.toContain('<w:del ');
    expect(xml).not.toContain('<w:delText');
    const again = (await readDocx(await writeDocx(doc, deps))).doc;
    expect(again.runs.filter((r) => parseRev(r.rev)?.move === 'move1').map((r) => parseRev(r.rev)!.kind)).toEqual(['del', 'ins']);
  });

  it('says a move without a name was kept as a deletion and an insertion', async () => {
    const body = `<w:p><w:moveFrom w:id="2" ${who}><w:r><w:t>Stir. </w:t></w:r></w:moveFrom><w:r><w:t>Heat.</w:t></w:r></w:p>`
      + `<w:p><w:moveTo w:id="4" ${who}><w:r><w:t>Stir. </w:t></w:r></w:moveTo></w:p>`;
    const { doc, warnings } = await readDocx(wordFile(body));
    expect(warnings).toContain(MOVES);
    expect(warnings).not.toContain(PROPS);
    expect(rt.plainText(doc.runs)).toBe('Stir. Heat.\nStir. ');
  });

  it('says a tracked change to a paragraph\'s formatting was accepted', async () => {
    const body = `<w:p><w:pPr><w:jc w:val="center"/><w:pPrChange w:id="1" ${who}><w:pPr/></w:pPrChange></w:pPr><w:r><w:t>Centred while tracking.</w:t></w:r></w:p>`;
    const { warnings } = await readDocx(wordFile(body));
    expect(warnings).toEqual([PROPS]);
  });

  it('says nothing for insertions, deletions and text formatting changes', async () => {
    const body = `<w:p><w:ins w:id="1" ${who}><w:r><w:t>New </w:t></w:r></w:ins><w:del w:id="2" ${who}><w:r><w:delText>old </w:delText></w:r></w:del>`
      + `<w:r><w:rPr><w:b/><w:rPrChange w:id="3" ${who}><w:rPr/></w:rPrChange></w:rPr><w:t>text</w:t></w:r></w:p>`;
    const { warnings } = await readDocx(wordFile(body));
    expect(warnings).toEqual([]);
  });
});
