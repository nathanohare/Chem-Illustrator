// @vitest-environment jsdom
//
// File fixes from the 26 October code review: numbers in damaged or hostile files held to sane
// limits, and saved files that other programs refuse.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, runStyleOf } from '../src/document/document';
import { emfToSvg } from '../src/render/emf-read';
import { Workbook } from '../src/sheet/workbook';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { readOdt, writeOdt } from '../src/io/odt';
import { readOds } from '../src/io/ods';
import { readPptx } from '../src/io/pptx-read';
import { cfbStreams, writeCfb } from '../src/io/cfb';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const deps: DocxDeps = { async picture() { return null; }, async svgToPng() { return PNG; } };
// (copied into this window's Uint8Array: the zip library takes other bytes for folders)
const u8 = (s: string) => { const b = strToU8(s); const o = new Uint8Array(b.length); o.set(b); return o; };
const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
const copy = (f: Record<string, Uint8Array>) => Object.fromEntries(Object.entries(f).map(([k, v]) => { const o = new Uint8Array(v.length); o.set(v); return [k, o]; }));

describe('Word tables', () => {
  it('a damaged gridSpan or gridBefore is held to Word\'s 63 columns', async () => {
    const d = newDocument();
    d.runs = [{ ...runStyleOf(d.styles.Normal), text: 'x' }];
    const files = copy(unzipSync(await writeDocx(d, deps)));
    const tbl = '<w:tbl><w:tr><w:trPr><w:gridBefore w:val="20000"/></w:trPr><w:tc><w:p/></w:tc></w:tr>' +
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="20000"/></w:tcPr><w:p><w:r><w:t>Yield</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    files['word/document.xml'] = u8(strFromU8(files['word/document.xml']).replace('<w:body>', `<w:body>${tbl}`));
    const t0 = performance.now();
    const { doc } = await readDocx(zipSync(files));
    expect(performance.now() - t0).toBeLessThan(2000);
    const t = Object.values(doc.objects).find((o) => o.kind === 'table');
    expect(t?.kind === 'table' && t.table.cols.length).toBe(64);
  }, 60_000);
});

/** An EMF of StretchDIBits records, each drawing a 1-bit `w` × `h` bitmap: its pixels in the
 * record (`inside`, `bytes` of them), or one shared bitmap after the end record. */
function emf(recs: { w: number; h: number; inside: boolean; bytes?: number }[], shared = { w: 8000, h: 8000 }): Uint8Array {
  const strideOf = (w: number) => ((w + 31) >>> 5) * 4;
  const HEADER = 88, INFO = 80 + 48; // record fields, then its BITMAPINFO (header + 2 colours)
  const sizes = recs.map((r) => INFO + (r.inside ? r.bytes ?? strideOf(r.w) * r.h : 0));
  const eofAt = HEADER + sizes.reduce((a, b) => a + b, 0), bitsAt = eofAt + 20;
  const out = new Uint8Array(bitsAt + strideOf(shared.w) * shared.h);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 1, true); dv.setUint32(4, HEADER, true);
  dv.setInt32(16, 377, true); dv.setInt32(20, 377, true);
  dv.setInt32(32, 10000, true); dv.setInt32(36, 10000, true);
  dv.setUint32(40, 0x464d4520, true);
  dv.setInt32(72, 1920, true); dv.setInt32(76, 1080, true); dv.setInt32(80, 508, true); dv.setInt32(84, 286, true);
  let o = HEADER;
  recs.forEach((r, i) => {
    const w = r.inside ? r.w : shared.w, h = r.inside ? r.h : shared.h;
    dv.setUint32(o, 81, true); dv.setUint32(o + 4, sizes[i], true);
    dv.setInt32(o + 24, i * 10, true); dv.setInt32(o + 40, w, true); dv.setInt32(o + 44, h, true);
    dv.setUint32(o + 48, 80, true); dv.setUint32(o + 52, 48, true);
    dv.setUint32(o + 56, r.inside ? INFO : bitsAt - o, true); dv.setUint32(o + 60, r.inside ? sizes[i] - INFO : strideOf(w) * h, true);
    dv.setUint32(o + 68, 0x00cc0020, true); dv.setInt32(o + 72, 10, true); dv.setInt32(o + 76, 10, true);
    dv.setUint32(o + 80, 40, true); dv.setInt32(o + 84, w, true); dv.setInt32(o + 88, h, true);
    dv.setUint16(o + 92, 1, true); dv.setUint16(o + 94, 1, true);
    out.set([0, 0, 0, 0, 255, 255, 255, 0], o + 120);
    o += sizes[i];
  });
  dv.setUint32(eofAt, 14, true); dv.setUint32(eofAt + 4, 20, true);
  return out;
}

describe('EMF bitmaps', () => {
  const images = (bytes: Uint8Array) => emfToSvg(bytes)?.svg.match(/<image /g)?.length ?? 0;

  it('a record\'s pixels are read only from inside that record', () => {
    const shared = { w: 8000, h: 8000, inside: false };
    const t0 = performance.now();
    expect(images(emf([shared, shared, shared]))).toBe(0);
    expect(performance.now() - t0).toBeLessThan(1500);
    // a bitmap inside its record is drawn
    expect(images(emf([{ w: 16, h: 16, inside: true }]))).toBe(1);
  }, 120_000);

  it('a picture decodes at most 50 million pixels in all', () => {
    // a damaged record claims 60 million pixels (with almost none there); the small one after it is skipped
    expect(images(emf([{ w: 6000, h: 10000, inside: true, bytes: 64 }, { w: 16, h: 16, inside: true }]))).toBe(0);
    expect(images(emf([{ w: 16, h: 16, inside: true }, { w: 16, h: 16, inside: true }]))).toBe(2);
  });
});

describe('Excel drawings', () => {
  it('a shape whose corner is far past Excel\'s last row opens at once', async () => {
    const wb = new Workbook();
    wb.edit('x', () => wb.sheet.setInput(0, 0, 'x'));
    const files = copy(unzipSync(await writeXlsx(wb, pictures)));
    files['xl/worksheets/_rels/sheet1.xml.rels'] = u8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    files['xl/worksheets/sheet1.xml'] = u8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId9"/></worksheet>'));
    files['xl/drawings/drawing1.xml'] = u8(`<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>200000000</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
      <xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="2" name="Rectangle 1"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>
      </xdr:wsDr>`);
    const t0 = performance.now();
    const back = await readXlsx(zipSync(files));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(back.book.sheet.objects).toHaveLength(1);
  }, 120_000);
});

describe('zip bombs', () => {
  const MB = 1024 * 1024;
  const refusal = async (f: () => unknown) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

  it('a 0.3 MB .xlsx with a 300 MB junk part is refused before it is unpacked', async () => {
    const files = copy(unzipSync(await writeXlsx(new Workbook(['Sheet1']), pictures)));
    files['xl/media/junk.bin'] = new Uint8Array(300 * MB);
    const bomb = zipSync(files, { level: 9 });
    expect(bomb.length).toBeLessThan(0.5 * MB);
    expect(await refusal(() => readXlsx(bomb))).toMatch(/too big to open: one of its parts unpacks to 300 MB/);
  }, 60_000);

  /** A zip whose list of contents says one part unpacks to `size` bytes (and each part to 300 MB). */
  function claiming(files: Record<string, Uint8Array>, size: (name: string) => number): Uint8Array {
    const z = zipSync(files);
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    for (let at = 0; at + 46 <= z.length; at++) {
      if (dv.getUint32(at, true) !== 0x02014b50) continue;
      const n = dv.getUint16(at + 28, true);
      dv.setUint32(at + 24, size(strFromU8(z.subarray(at + 46, at + 46 + n))), true);
    }
    return z;
  }

  it('Word, PowerPoint, OpenDocument text and spreadsheet files are held to the same limits', async () => {
    const d = newDocument();
    d.runs = [{ ...runStyleOf(d.styles.Normal), text: 'x' }];
    const docx = copy(unzipSync(await writeDocx(d, deps)));
    const odt = copy(unzipSync(await writeOdt(d)));
    // each part says 300 MB: one part too big
    const big = () => 300 * MB;
    expect(await refusal(() => readDocx(claiming(docx, big)))).toMatch(/too big to open/);
    expect(await refusal(() => readOdt(claiming(odt, big)))).toMatch(/too big to open/);
    expect(await refusal(() => readOds(claiming({ mimetype: u8('application/vnd.oasis.opendocument.spreadsheet'), 'content.xml': u8('<x/>') }, big)))).toMatch(/too big to open/);
    expect(await refusal(() => readPptx(claiming({ '[Content_Types].xml': u8('<x/>') }, big)))).toMatch(/too big to open/);
    // five parts of 250 MB: too much in all
    const five = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`word/media/p${i}.bin`, u8('x')]));
    expect(await refusal(() => readDocx(claiming({ ...docx, ...five }, (n) => (n.startsWith('word/media/p') ? 250 * MB : 1000))))).toMatch(/it unpacks to 1250 MB/);
    // an ordinary file still opens
    expect(await refusal(() => readDocx(zipSync(docx)))).toBeNull();
  });
});

describe('compound files (.doc, .xls, Word objects)', () => {
  /** A real compound file, then broken: its DIFAT chain starts at sector 0, which points back at itself. */
  function loopingDifat(entriesPerSector: number): Uint8Array {
    const b = new Uint8Array(writeCfb([['WordDocument', new Uint8Array(600)]]));
    const dv = new DataView(b.buffer);
    dv.setUint32(0x44, 0, true);
    dv.setUint32(0x48, 1, true);
    for (let i = 0; i < 127; i++) dv.setUint32(512 + 4 * i, i < entriesPerSector ? 1 : 0xffffffff, true);
    dv.setUint32(512 + 508, 0, true);
    return b;
  }

  it('a DIFAT chain that loops back on itself is read once', () => {
    const t0 = performance.now();
    try { cfbStreams(loopingDifat(4)); } catch { /* refusing the file is fine */ }
    expect(performance.now() - t0).toBeLessThan(200);
    // an undamaged file still reads
    expect(cfbStreams(writeCfb([['WordDocument', new Uint8Array(600).fill(7)]])).get('WordDocument')?.[599]).toBe(7);
  }, 60_000);
});
