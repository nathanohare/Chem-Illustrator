// @vitest-environment jsdom
//
// Speed of the work behind each mode, without a browser: `npm run bench:core`. These run in
// Node with jsdom, so the numbers are for comparing one version of the code with another, not
// for what a person sees (bench/baseline.mjs times the real app in Chromium).
// `npm run bench:core -- --outputJson bench/results/core.json` keeps the numbers;
// `--compare <that file>` shows what changed since.

import { bench, describe } from 'vitest';
import { Doc } from '../src/model';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { crossingGaps } from '../src/chem/crossing';
import { freeRing, placeRing } from '../src/chem/chemgeom';
import { Workbook } from '../src/sheet/workbook';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { newDocument, paraFromStyle, runStyleOf, type DocText } from '../src/document/document';
import { DocLayouter } from '../src/document/doc-layout';
import * as rt from '../src/richtext';
import type { TextRun } from '../src/model';

const L = 14.4;
const measure = (t: string, size: number) => t.length * size * 0.5;

/** n benzene-sized rings in rows, with long bonds across neighbours so there are crossings. */
function rings(n: number): Doc {
  const doc = new Doc();
  doc.edit('rings', () => {
    const out: number[][] = [];
    for (let i = 0; i < n; i++) out.push(placeRing(doc, freeRing({ x: (i % 40) * 2.2 * L, y: Math.floor(i / 40) * 2.2 * L }, 6, L), {}));
    for (let i = 0; i + 1 < n; i += 2) doc.addBond(out[i][0], out[i + 1][3], 1);
  });
  return doc;
}

describe('drawing (1,000 rings, 6,000 atoms)', () => {
  const doc = rings(1000);
  const text = writeCdxml(doc, { name: 'bench' });
  bench('save CDXML', () => { writeCdxml(doc, { name: 'bench' }); }, { iterations: 5 });
  bench('open CDXML', () => { readCdxml(text); }, { iterations: 5 });
  bench('crossing gaps for every bond, from scratch', () => { for (const b of doc.bonds.values()) crossingGaps(doc, b, 2); }, { iterations: 5 });
});

describe('sheet (20,000 formulas)', () => {
  const book = () => {
    const wb = new Workbook(['Data']);
    const s = wb.sheets[0];
    wb.edit('fill', () => {
      for (let r = 0; r < 5000; r++) {
        s.setInput(r, 0, String(r));
        s.setInput(r, 1, `=A${r + 1}*2`);
        s.setInput(r, 2, `=B${r + 1}+A${r + 1}`);
        s.setInput(r, 3, `=IF(C${r + 1}>100,"big","small")`);
        s.setInput(r, 4, `=SUM(A$1:A${r + 1})`);
      }
    });
    return wb;
  };
  const wb = book();
  let n = 0;
  bench('fill 20,000 formulas', () => { book(); }, { iterations: 3 });
  bench('type one value (recalculate what reads it)', () => { wb.edit('type', () => wb.sheets[0].setInput(2500, 0, String(n++))); }, { iterations: 20 });
  const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), async picture() { return 'data:image/png;base64,'; } };
  let bytes: Uint8Array;
  bench('save .xlsx', async () => { bytes = await writeXlsx(wb, pictures); }, { iterations: 3 });
  bench('open .xlsx', async () => { bytes ??= await writeXlsx(wb, pictures); await readXlsx(bytes); }, { iterations: 3 });
});

describe('document (60,000 words)', () => {
  const d = newDocument();
  const n = runStyleOf(d.styles.Normal);
  const para = 'The crude product was purified by flash chromatography on silica gel (CH2Cl2/MeOH) to give 3a as a white solid. ';
  const runs: TextRun[] = [];
  const count = 1500;
  for (let i = 0; i < count; i++) { if (i) runs.push({ ...n, text: '\n' }); runs.push({ ...n, text: para.repeat(3) }); }
  const N = paraFromStyle(d.styles.Normal, {});
  const t: DocText = { ...d, runs: rt.normalizeRuns(runs), paras: Array.from({ length: count }, () => N), objects: {} };
  const deps: DocxDeps = { async picture() { return { png: new Uint8Array(), w: 1, h: 1 }; }, async svgToPng() { return new Uint8Array(); } };
  bench('lay out every page', () => { new DocLayouter({ measure, drawingSize: () => ({ w: 80, h: 40 }) }).layout(t); }, { iterations: 3 });
  let bytes: Uint8Array;
  bench('save .docx', async () => { bytes = await writeDocx(t, deps); }, { iterations: 3 });
  bench('open .docx', async () => { bytes ??= await writeDocx(t, deps); await readDocx(bytes); }, { iterations: 3 });
});
