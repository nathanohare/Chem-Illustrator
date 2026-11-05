// @vitest-environment jsdom
//
// A header of several lines (paragraphs) keeps its lines: it is not run together on one line.

import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { readDocx, writeDocx, type DocxDeps } from '../src/io/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };

function wordFile(header: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH" Type="${R}header" Target="header1.xml"/></Relationships>`),
    'word/header1.xml': strToU8(`<?xml version="1.0"?><w:hdr ${W}>${header}</w:hdr>`),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`),
  });
}
const line = (t: string) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;
const paras = (xml: string) => (xml.match(/<w:p>|<w:p /g) ?? []).length;

describe('headers of more than one line', () => {
  it('keeps each line of the header on its own line, in Word too', async () => {
    const { doc } = await readDocx(wordFile(line('First header line') + line('Second header line')));
    const body = doc.hf.bodies?.header;
    expect(body).toBeDefined();
    expect(body!.runs.map((r) => r.text).join('')).toMatch(/First header line\nSecond header line/);
    const hdr = strFromU8(unzipSync(await writeDocx(doc, deps))['word/header1.xml']);
    expect(paras(hdr)).toBe(2);
    expect(hdr).not.toMatch(/First header line Second header line/);
  });

  it('still reads a one-line header as left, centre and right text', async () => {
    const { doc } = await readDocx(wordFile(line('Supporting Information')));
    expect(doc.hf.header).toEqual(['', 'Supporting Information', '']);
    expect(doc.hf.bodies?.header).toBeUndefined();
  });
});
