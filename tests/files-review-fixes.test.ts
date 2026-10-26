// @vitest-environment jsdom
//
// File fixes from the 26 October code review: numbers in damaged or hostile files held to sane
// limits, and saved files that other programs refuse.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, runStyleOf } from '../src/document/document';

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
