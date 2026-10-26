// @vitest-environment jsdom
//
// File fixes from the 26 October code review: numbers in damaged or hostile files held to sane
// limits, and saved files that other programs refuse.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, runStyleOf } from '../src/document/document';
import { emfToSvg } from '../src/render/emf-read';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const deps: DocxDeps = { async picture() { return null; }, async svgToPng() { return PNG; } };
// (copied into this window's Uint8Array: the zip library takes other bytes for folders)
const u8 = (s: string) => { const b = strToU8(s); const o = new Uint8Array(b.length); o.set(b); return o; };
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
