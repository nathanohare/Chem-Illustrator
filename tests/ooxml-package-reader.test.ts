// @vitest-environment jsdom
//
// Reading the parts of an Office file the way Office does: part names that differ only in case or
// in percent-encoding are the same part (ECMA-376 Part 2 §6.2.2.3), a target may use backslashes,
// a part may be UTF-16 (Excel writes Power Query's data that way), and a file with a password to
// open, or one that isn't a zip at all, says so plainly.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { PackageReader, partText } from '../src/io/ooxml';
import { writeCfb } from '../src/io/cfb';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { readPptx } from '../src/io/pptx-read';
import { readDocx } from '../src/io/docx';
import { Workbook } from '../src/sheet/workbook';

const u8 = (s: string): Uint8Array => { const b = strToU8(s); const o = new Uint8Array(b.length); o.set(b); return o; };
const utf16le = (s: string): Uint8Array => {
  const o = new Uint8Array(2 + s.length * 2);
  o[0] = 0xff; o[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { o[2 + 2 * i] = s.charCodeAt(i) & 0xff; o[3 + 2 * i] = s.charCodeAt(i) >> 8; }
  return o;
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const rels = (...r: string[]) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join('')}</Relationships>`;

describe('finding a part', () => {
  const pkg = new PackageReader(zipSync({
    'word/document.xml': u8('<a/>'),
    'word/media/image1.png': PNG,
    'word/media/%C3%A9t%C3%A9.png': PNG,
    'word/_rels/document.xml.rels': u8(rels(
      `<Relationship Id="rId1" Type="${R}image" Target="Media/IMAGE1.png"/>`,
      `<Relationship Id="rId2" Type="${R}image" Target="media/été.png"/>`,
      `<Relationship Id="rId3" Type="${R}image" Target="..\\word\\media\\image1.png"/>`,
    )),
  }));

  it('takes names that differ only in case as the same part', () => {
    const target = pkg.rels('word/document.xml').get('rId1')!.target;
    expect(target).toBe('word/Media/IMAGE1.png');
    expect(pkg.has(target)).toBe(true);
    expect(pkg.bytes(target)).toEqual(PNG);
  });

  it('takes a target written as an IRI and a zip name written as a URI as the same part', () => {
    expect(pkg.bytes(pkg.rels('word/document.xml').get('rId2')!.target)).toEqual(PNG);
  });

  it('reads a target with backslashes', () => {
    expect(pkg.rels('word/document.xml').get('rId3')!.target).toBe('word/media/image1.png');
  });

  it('does not take an object’s own properties for parts', () => {
    expect(pkg.has('constructor')).toBe(false);
    expect(pkg.bytes('toString')).toBeNull();
  });
});

describe('a part’s text', () => {
  it('reads UTF-16 with a byte order mark, and its declaration says UTF-8 after', () => {
    const t = partText(utf16le('<?xml version="1.0" encoding="utf-16"?><x a="é"/>'));
    expect(t).toBe('<?xml version="1.0" encoding="UTF-8"?><x a="é"/>');
    const pkg = new PackageReader(zipSync({ 'customXml/item1.xml': utf16le('<?xml version="1.0" encoding="utf-16"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">QUFB</DataMashup>') }));
    expect(pkg.xml('customXml/item1.xml')?.documentElement.localName).toBe('DataMashup');
  });

  it('reads UTF-8 with or without a byte order mark', () => {
    expect(partText(new Uint8Array([0xef, 0xbb, 0xbf, ...u8('<x/>')]))).toBe('<x/>');
    expect(partText(u8('<x/>'))).toBe('<x/>');
  });

  it('keeps a workbook’s UTF-16 custom XML (Power Query’s queries) when saved again', async () => {
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };
    const files = unzipSync(await writeXlsx(new Workbook(['Sheet1']), pictures));
    const mashup = '<?xml version="1.0" encoding="utf-16"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">QUFB</DataMashup>';
    files['customXml/item9.xml'] = utf16le(mashup);
    const wbRels = 'xl/_rels/workbook.xml.rels';
    files[wbRels] = u8(strFromU8(files[wbRels]).replace('</Relationships>', `<Relationship Id="rIdQ" Type="${R}customXml" Target="../customXml/item9.xml"/></Relationships>`));
    const { book } = await readXlsx(zipSync(files));
    const kept = book.kept?.xml?.map((x) => x.xml) ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain('<DataMashup');
    expect(kept[0]).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });
});

describe('a file that can’t be read', () => {
  const locked = writeCfb([['EncryptionInfo', new Uint8Array(64)], ['EncryptedPackage', new Uint8Array(600)]]);

  it('says a file has a password to open, in all three formats', async () => {
    expect(() => readPptx(locked)).toThrow(/protected with a password/);
    await expect(readDocx(locked, {})).rejects.toThrow(/protected with a password/);
    await expect(readXlsx(locked)).rejects.toThrow(/protected with a password/);
  });

  it('says a damaged file is damaged, not “invalid zip data”', () => {
    const cut = zipSync({ 'a.xml': u8('<a/>'.repeat(200)) }).subarray(0, 40);
    expect(() => new PackageReader(cut)).toThrow(/damaged/);
  });
});

describe('a Strict Open XML file', () => {
  // Excel's "Strict Open XML Spreadsheet" names the same elements and relationships under purl.oclc.org
  const toStrict = (s: string) => s
    .replace(/http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/extended-properties/g, 'http://purl.oclc.org/ooxml/officeDocument/relationships/extendedProperties')
    .replace(/http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/(relationships|extended-properties|docPropsVTypes|sharedTypes)/g, (_m, n: string) => `http://purl.oclc.org/ooxml/officeDocument/${n === 'extended-properties' ? 'extendedProperties' : n}`)
    .replace(/http:\/\/schemas\.openxmlformats\.org\/(spreadsheetml|drawingml)\/2006\/(\w+)/g, 'http://purl.oclc.org/ooxml/$1/$2');

  it('opens with its cells and saves as an ordinary workbook', async () => {
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return PNG; } };
    const wb = new Workbook(['Results']);
    wb.edit('Type', () => { wb.sheets[0].setInput(0, 0, 'Yield'); wb.sheets[0].setInput(1, 0, '0.85'); });
    const files = unzipSync(await writeXlsx(wb, pictures));
    for (const k of Object.keys(files)) if (/\.(xml|rels)$/.test(k) && k !== '[Content_Types].xml') files[k] = u8(toStrict(strFromU8(files[k])));
    expect(strFromU8(files['xl/workbook.xml'])).toContain('http://purl.oclc.org/ooxml/spreadsheetml/main');
    const { book } = await readXlsx(zipSync(files));
    expect(book.sheets[0].value(0, 0)).toBe('Yield');
    expect(book.sheets[0].value(1, 0)).toBe(0.85);
    const again = strFromU8(unzipSync(await writeXlsx(book, pictures))['xl/workbook.xml']);
    expect(again).not.toContain('purl.oclc.org');
  });
});
