// @vitest-environment jsdom
//
// Word's line breaks inside a paragraph (Shift+Enter, w:br) stay line breaks: the line after one
// carries on the paragraph (no space between, no first-line indent), Shift+Enter in a document
// makes one, and they save back to Word in the same paragraph, not as paragraphs of their own.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { layoutText } from '../src/text/layout';
import { laidParas } from '../src/text/paragraphs';
import { TextEditing } from '../src/text/editing';
import type { ParaStyle } from '../src/model';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const deps: DocxDeps = { async picture() { return null; } };
const u8 = (s: string) => new Uint8Array(strToU8(s));
const measure = (t: string, s: number) => t.length * s * 0.5;

function wordFile(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': u8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': u8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': u8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

/** The body's paragraphs as Word would see them. */
async function wordParas(doc: Parameters<typeof writeDocx>[0]): Promise<string[]> {
  const xml = strFromU8(unzipSync(await writeDocx(doc, deps))['word/document.xml']);
  const body = xml.slice(xml.indexOf('<w:body>'), xml.indexOf('<w:sectPr'));
  return body.match(/<w:p[ >].*?<\/w:p>/g) ?? [];
}

const BODY = '<w:p><w:pPr><w:spacing w:before="120" w:after="240"/><w:ind w:firstLine="360"/></w:pPr><w:r><w:t>first line</w:t><w:br/><w:t>second line</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>next paragraph</w:t></w:r></w:p>';

describe('line breaks inside a Word paragraph', () => {
  it('reads the line after a break as carrying on the paragraph, keeping its spacing', async () => {
    const { doc } = await readDocx(wordFile(BODY));
    expect(doc.paras[1].soft).toBe(true);
    expect(doc.paras[2].soft).toBeUndefined();
    // the paragraph's own spacing is kept on its lines, and the layout leaves it out between them
    expect(doc.paras[1].spaceAfter).toBe(12);
    const laid = laidParas(doc.paras);
    expect(laid[0].spaceBefore).toBe(6);
    expect(laid[0].spaceAfter).toBe(0);
    expect(laid[1].spaceBefore).toBe(0);
    expect(laid[1].firstLine).toBe(0);
    expect(laid[1].spaceAfter).toBe(12);
  });

  it('saves the two lines back in one Word paragraph with a break between', async () => {
    const { doc } = await readDocx(wordFile(BODY));
    const ps = await wordParas(doc);
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatch(/first line<\/w:t>.*<w:br\/>.*second line/);
    expect(ps[0]).toMatch(/w:after="240"/);
    // and back again
    const again = (await readDocx(await writeDocx(doc, deps))).doc;
    expect(again.paras.map((p) => !!p.soft)).toEqual([false, true, false]);
  });

  it('keeps a list item\'s line break in the item', async () => {
    const doc = (await readDocx(wordFile('<w:p><w:r><w:t>x</w:t></w:r></w:p>'))).doc;
    doc.runs = [{ text: 'item\nmore of it\nnext item' }];
    doc.paras = [{ list: 'bullet' }, { list: 'bullet', cont: true, soft: true }, { list: 'bullet' }];
    const ps = await wordParas(doc);
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatch(/<w:numPr>.*item<\/w:t>.*<w:br\/>.*more of it/);
    const again = (await readDocx(await writeDocx(doc, deps))).doc;
    expect(again.paras[1]).toMatchObject({ list: 'bullet', cont: true, soft: true });
  });

  it('writes a line that looks different as a paragraph of its own', async () => {
    const doc = (await readDocx(wordFile('<w:p><w:r><w:t>x</w:t></w:r></w:p>'))).doc;
    doc.runs = [{ text: 'left\ncentred' }];
    doc.paras = [{}, { soft: true, align: 'center' }];
    expect(await wordParas(doc)).toHaveLength(2);
  });

  it('lays the lines out with no space between them', () => {
    const paras: ParaStyle[] = [{ spaceAfter: 10 }, { spaceAfter: 10 }];
    const gap = (ps: ParaStyle[]) => { const l = layoutText({ runs: [{ text: 'a\nb' }], paras: ps, justify: 'left' }, 10, measure).lines; return l[1].y - l[0].y; };
    expect(gap(paras) - gap([paras[0], { ...paras[1], soft: true }])).toBeCloseTo(10, 6);
  });
});

describe('Shift+Enter in a document', () => {
  const editor = () => {
    const ed = new TextEditing({ runs: [{ text: 'one' }], paras: [{ spaceAfter: 8 }] }, {}, measure, 11);
    ed.setCaret(3);
    return ed;
  };

  it('starts a line that carries on the paragraph', () => {
    const ed = editor();
    ed.enter(true, true);
    expect(ed.t.paras[1].soft).toBe(true);
    expect(ed.t.paras[1].spaceAfter).toBe(8);
  });

  it('Enter after it starts a paragraph of its own again', () => {
    const ed = editor();
    ed.enter(true, true);
    ed.type('two');
    ed.enter(false, true);
    expect(ed.t.paras.map((p) => !!p.soft)).toEqual([false, true, false]);
  });

  it('outside documents still starts a new paragraph', () => {
    const ed = editor();
    ed.enter(true);
    expect(ed.t.paras[1]?.soft).toBeUndefined();
  });
});
