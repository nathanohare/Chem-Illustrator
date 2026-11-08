// @vitest-environment jsdom
//
// Word fields none of ours stands for (NOTEREF, STYLEREF, a calculation) are kept as Word had
// them, showing their last result, and saved back as fields; hidden text (w:vanish) is kept and
// saved back as hidden text, though not shown.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';
import { fieldTexts, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; } };

function wordFile(body: string, endnotes?: string): Uint8Array {
  const rels = endnotes ? `<Relationship Id="rId9" Type="${R}endnotes" Target="endnotes.xml"/>` : '';
  return zipSync({
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/_rels/document.xml.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`)),
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`)),
    ...(endnotes ? { 'word/endnotes.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:endnotes ${W}>${endnotes}</w:endnotes>`)) } : {}),
  });
}

const fld = (instr: string, result: string, rPr = '') => `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr}<w:instrText xml:space="preserve">${instr}</w:instrText></w:r>`
  + `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rPr}<w:t>${result}</w:t></w:r><w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`;
const text = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;

/** The text as shown: each object as what it shows. */
function shownText(doc: DocText): string {
  const shown = fieldTexts(doc);
  return doc.runs.map((r) => (r.obj !== undefined ? shown.get(r.obj) ?? '' : r.text)).join('');
}

const fields = (doc: DocText) => Object.values(doc.objects).filter((o) => o.kind === 'field');
const partOf = (bytes: Uint8Array, name: string) => strFromU8(unzipSync(bytes)[name]);

describe('Word fields kept as Word had them', () => {
  const endnote = `<w:endnote w:id="1"><w:p><w:r><w:endnoteRef/></w:r>${text(' Isolated yield.')}</w:p></w:endnote>`;
  const body = `<w:p>${text('Yields')}<w:bookmarkStart w:id="5" w:name="_Ref123"/><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:endnoteReference w:id="1"/></w:r><w:bookmarkEnd w:id="5"/>${text(' are high.')}</w:p>`
    + `<w:p>${text('See note ')}${fld(' NOTEREF _Ref123 \\h ', 'i')}${text(' and ')}${fld(' STYLEREF "Heading 1" ', 'Results')}${text('.')}</w:p>`;

  it('keeps a note reference and a style reference as fields, with their bookmark', async () => {
    const { doc, warnings } = await readDocx(wordFile(body, endnote));
    expect(warnings).toEqual([]);
    expect(shownText(doc)).toContain('See note i and Results.');
    const kept = fields(doc);
    expect(kept).toEqual([
      { kind: 'field', code: 'word', instr: ' NOTEREF _Ref123 \\h ', text: 'i', target: '_Ref123' },
      { kind: 'field', code: 'word', instr: ' STYLEREF "Heading 1" ', text: 'Results' },
    ]);
    // the note's bookmark stays (on the paragraph with the note's number), as the field points at it
    expect(doc.paras[0].marks).toEqual(['_Ref123']);
  });

  it('saves them back as fields, and opens the save the same way', async () => {
    const { doc } = await readDocx(wordFile(body, endnote));
    const out = await writeDocx(doc, deps);
    const xml = partOf(out, 'word/document.xml');
    expect(xml).toContain('<w:instrText xml:space="preserve"> NOTEREF _Ref123 \\h </w:instrText>');
    expect(xml).toContain('<w:instrText xml:space="preserve"> STYLEREF &quot;Heading 1&quot; </w:instrText>');
    expect(xml).toMatch(/<w:bookmarkStart w:id="\d+" w:name="_Ref123"\/>/);
    const again = await readDocx(out);
    expect(fields(again.doc).map((o) => o.kind === 'field' && o.instr)).toEqual([' NOTEREF _Ref123 \\h ', ' STYLEREF "Heading 1" ']);
    expect(shownText(again.doc)).toContain('See note i and Results.');
  });

  it('keeps a field with no result (an equation field) as one', async () => {
    const eq = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> EQ \\f(1,2) </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const { doc } = await readDocx(wordFile(`<w:p>${text('Half: ')}${eq}</w:p>`));
    expect(fields(doc)).toEqual([{ kind: 'field', code: 'word', instr: ' EQ \\f(1,2) ', text: '' }]);
    const xml = partOf(await writeDocx(doc, deps), 'word/document.xml');
    expect(xml).toContain('<w:instrText xml:space="preserve"> EQ \\f(1,2) </w:instrText><');
    expect(xml).not.toMatch(/EQ[^<]*<\/w:instrText><\/w:r><w:r><w:fldChar w:fldCharType="separate"/);
  });

  it('keeps a simple field (w:fldSimple) the same way', async () => {
    const { doc } = await readDocx(wordFile(`<w:p>${text('Section ')}<w:fldSimple w:instr=" SECTION "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>`));
    expect(fields(doc)).toEqual([{ kind: 'field', code: 'word', instr: ' SECTION ', text: '2' }]);
    expect(shownText(doc)).toBe('Section 2');
  });

  it('keeps the text of a field whose result is more than text, and says so', async () => {
    // a result with a line break in it is kept as its text
    const res = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> QUOTE "a" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
      + '<w:r><w:t>one</w:t><w:br/><w:t>two</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const { doc, warnings } = await readDocx(wordFile(`<w:p>${res}</w:p>`));
    expect(fields(doc)).toEqual([]);
    expect(warnings).toContain('Some fields were kept as the text they showed.');
    expect(rt.plainText(doc.runs)).toBe('one\ntwo');
  });
});

describe('Word fields in headers and footers', () => {
  const hfFile = (header: string, footer: string) => zipSync({
    '[Content_Types].xml': new Uint8Array(strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>')),
    '_rels/.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`)),
    'word/_rels/document.xml.rels': new Uint8Array(strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${R}header" Target="header1.xml"/><Relationship Id="rId8" Type="${R}footer" Target="footer1.xml"/></Relationships>`)),
    'word/document.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:document ${W}><w:body><w:p>${text('Results')}</w:p><w:sectPr><w:headerReference w:type="default" r:id="rId7"/><w:footerReference w:type="default" r:id="rId8"/></w:sectPr></w:body></w:document>`)),
    'word/header1.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:hdr ${W}>${header}</w:hdr>`)),
    'word/footer1.xml': new Uint8Array(strToU8(`<?xml version="1.0"?><w:ftr ${W}>${footer}</w:ftr>`)),
  });

  it('keeps a style reference written the short way (w:fldSimple) as a field, with its last result', async () => {
    const header = '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:fldSimple w:instr=" STYLEREF  &quot;Heading 1&quot; \\* MERGEFORMAT "><w:r><w:t>Results</w:t></w:r></w:fldSimple></w:p>';
    const footer = `<w:p>${text('Printed ')}<w:fldSimple w:instr=" PRINTDATE \\@ &quot;d MMM yyyy&quot; "><w:r><w:t>8 Nov 2026</w:t></w:r></w:fldSimple></w:p>`;
    const { doc } = await readDocx(hfFile(header, footer));
    // (the print date is one of ours)
    expect(fields(doc)).toEqual([{ kind: 'field', code: 'word', instr: ' STYLEREF  "Heading 1" \\* MERGEFORMAT ', text: 'Results' }, { kind: 'field', code: 'printdate', format: 'd MMM yyyy' }]);
    const out = await writeDocx(doc, deps);
    const hdr = partOf(out, 'word/header1.xml');
    expect(hdr).toContain('<w:instrText xml:space="preserve"> STYLEREF  &quot;Heading 1&quot; \\* MERGEFORMAT </w:instrText>');
    expect(hdr).toMatch(/<w:fldChar w:fldCharType="separate"\/><\/w:r><w:r>(?:<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:t xml:space="preserve">Results<\/w:t>/);
    expect(hdr).toContain('<w:jc w:val="right"/>');
    expect(partOf(out, 'word/footer1.xml')).toContain('PRINTDATE');
    const again = await readDocx(out);
    expect(fields(again.doc).map((o) => o.kind === 'field' && o.code)).toEqual(['word', 'printdate']);
  });
});

describe('Hidden text', () => {
  const hidden = (s: string, more = '') => `<w:r><w:rPr>${more}<w:vanish/></w:rPr><w:t xml:space="preserve">${s}</w:t></w:r>`;
  const body = `<w:p>${text('Visible ')}${hidden('note to self, ')}${hidden('really', '<w:b/>')}${text(' text.')}</w:p>`;

  it('is kept, not shown, with a warning', async () => {
    const { doc, warnings } = await readDocx(wordFile(body));
    expect(shownText(doc)).toBe('Visible  text.');
    expect(fields(doc)).toEqual([{ kind: 'field', code: 'hidden', text: 'note to self, ' }, { kind: 'field', code: 'hidden', text: 'really' }]);
    expect(warnings).toContain('Hidden text is kept and saved back to Word, but isn\'t shown here.');
  });

  it('is saved back as hidden text, keeping its look', async () => {
    const { doc } = await readDocx(wordFile(body));
    const out = await writeDocx(doc, deps);
    const xml = partOf(out, 'word/document.xml');
    expect(xml).toMatch(/<w:r><w:rPr>(?:(?!<\/w:rPr>).)*<w:vanish\/>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">note to self, <\/w:t><\/w:r>/);
    expect(xml).toMatch(/<w:r><w:rPr>(?:(?!<\/w:rPr>).)*<w:b\/>(?:(?!<\/w:rPr>).)*<w:vanish\/>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">really<\/w:t><\/w:r>/);
    const again = await readDocx(out);
    expect(fields(again.doc).map((o) => o.kind === 'field' && o.text)).toEqual(['note to self, ', 'really']);
  });
});
