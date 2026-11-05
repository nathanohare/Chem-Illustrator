// @vitest-environment jsdom
//
// Word's raised and lowered text (w:position, in half-points) and its optional hyphens
// (w:softHyphen) come in, show, and save back: a run raised 3 pt sits 3 pt higher, and a soft
// hyphen has no width unless a line breaks at it, where it shows as a hyphen.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { layoutText, type TextFrame } from '../src/text/layout';
import { arialWidth } from '../src/text-metrics';
import { textPieces } from '../src/io/pdf';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));
const measure = (t: string, s: number, _f: string, style: string) => arialWidth(t, s, /bold/.test(style));

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

describe('raised and lowered text (w:position)', () => {
  const body = '<w:p><w:r><w:t xml:space="preserve">base </w:t></w:r><w:r><w:rPr><w:position w:val="6"/></w:rPr><w:t>up</w:t></w:r><w:r><w:rPr><w:position w:val="-4"/></w:rPr><w:t>down</w:t></w:r></w:p>';

  it('reads the raise in points', async () => {
    const { doc } = await readDocx(wordFile(body));
    expect(doc.runs.find((r) => r.text === 'up')?.raise).toBe(3);
    expect(doc.runs.find((r) => r.text === 'down')?.raise).toBe(-2);
    expect(doc.runs.find((r) => r.text === 'base ')?.raise).toBeUndefined();
  });

  it('saves it back in half-points', async () => {
    const { doc } = await readDocx(wordFile(body));
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(xml).toMatch(/<w:position w:val="6"\/>.*?<w:t[^>]*>up<\/w:t>/);
    expect(xml).toMatch(/<w:position w:val="-4"\/>.*?<w:t[^>]*>down<\/w:t>/);
    const again = (await readDocx(await writeDocx(doc, deps))).doc;
    expect(again.runs.find((r) => r.text === 'up')?.raise).toBe(3);
  });

  it('moves the text up or down on its line', () => {
    const f: TextFrame = { runs: [{ text: 'a' }, { text: 'b', raise: 3 }, { text: 'c', raise: -2 }], justify: 'left' };
    const dy = (ch: string) => layoutText(f, 10, measure).lines[0].pieces.find((g) => g.text === ch)!.dy;
    expect(dy('a')).toBe(0);
    expect(dy('b')).toBe(-3);
    expect(dy('c')).toBe(2);
  });
});

describe('soft hyphens (w:softHyphen)', () => {
  const body = '<w:p><w:r><w:t>hydro</w:t></w:r><w:r><w:softHyphen/></w:r><w:r><w:t>boration</w:t></w:r></w:p>';

  it('reads a soft hyphen as U+00AD and saves it back as w:softHyphen', async () => {
    const { doc } = await readDocx(wordFile(body));
    expect(doc.runs.map((r) => r.text).join('')).toBe('hydro­boration');
    const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
    expect(xml).toContain('<w:softHyphen/>');
    expect(xml).not.toContain('­');
    const again = (await readDocx(await writeDocx(doc, deps))).doc;
    expect(again.runs.map((r) => r.text).join('')).toBe('hydro­boration');
  });

  const text = 'the hydro­boration';
  const plainW = (t: string) => arialWidth(t, 10, false);

  it('has no width where the line does not break at it', () => {
    const lay = layoutText({ runs: [{ text }], justify: 'left' }, 10, measure);
    expect(lay.lines).toHaveLength(1);
    expect(lay.lines[0].width).toBeCloseTo(plainW('the hydroboration'), 5);
  });

  it('breaks a word that does not fit there, with a hyphen, hyphenation off', () => {
    const wrap = plainW('the hydro-') + 1;
    const lay = layoutText({ runs: [{ text }], justify: 'left', wrap }, 10, measure);
    expect(lay.lines.map((l) => text.slice(l.start, l.end))).toEqual(['the hydro­', 'boration']);
    const hyphen = lay.lines[0].pieces.find((g) => g.decor);
    expect(hyphen?.text).toBe('-');
  });

  it('leaves the word whole when even its first part does not fit', () => {
    const wrap = plainW('the hyd');
    const lay = layoutText({ runs: [{ text }], justify: 'left', wrap }, 10, measure);
    expect(lay.lines.map((l) => text.slice(l.start, l.end))).toEqual(['the ', 'hydro­boration']);
  });

  it('writes nothing for it in a PDF', () => {
    const pieces = textPieces('ab­c', [1, 1, 0, 1]);
    expect(pieces.flatMap((p) => p.codes)).toEqual([0x61, 0x62, 0x63]);
  });
});
