// @vitest-environment jsdom
//
// Excel workbooks kept whole on save (from the Office file audit): dates in workbooks counting
// from 1904, links to other workbooks, legacy array formulas (Ctrl+Shift+Enter), and this
// program's structures and property columns after rows and columns were put in, taken out or
// sorted in Excel.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { writeXlsx, readXlsx, XlsxPictures } from '../src/io/xlsx';
import { readGridName, STILL } from '../src/io/xlsx-relocate';
import { Workbook } from '../src/sheet/workbook';
import { SheetChem } from '../src/sheet/sheet-chem';
import { structureMolfile } from '../src/sheet/structure-doc';
import { molblockContents } from '../src/io/sheet-files';
import { molProps, substructureMatches } from '../src/chem/props';
import { CellError } from '../src/sheet/values';
import { dateKind } from '../src/sheet/numfmt';
import { ACS_1996 } from '../src/style';
import { Package, REL } from '../src/io/ooxml';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const DOT = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => DOT };
const plain: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';

const files = (bytes: Uint8Array) => unzipSync(bytes);
const part = (bytes: Uint8Array, name: string) => strFromU8(files(bytes)[name]);

/** A file made the way Excel writes it: one sheet, with whatever else a test needs. */
function excelFile(sheet: string, extra: { workbook?: string; styles?: string; strings?: string[]; more?: (pkg: Package) => void } = {}): Uint8Array {
  const pkg = new Package();
  pkg.relate('', REL.officeDocument, 'xl/workbook.xml');
  pkg.add('xl/workbook.xml', `<workbook xmlns="${MAIN}" xmlns:r="${RNS}">${extra.workbook ?? '<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>'}</workbook>`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  pkg.relate('xl/workbook.xml', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet', 'worksheets/sheet1.xml');
  pkg.add('xl/worksheets/sheet1.xml', `<worksheet xmlns="${MAIN}" xmlns:r="${RNS}">${sheet}</worksheet>`);
  if (extra.styles) {
    pkg.relate('xl/workbook.xml', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', 'styles.xml');
    pkg.add('xl/styles.xml', `<styleSheet xmlns="${MAIN}">${extra.styles}</styleSheet>`);
  }
  if (extra.strings) {
    pkg.relate('xl/workbook.xml', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings', 'sharedStrings.xml');
    pkg.add('xl/sharedStrings.xml', `<sst xmlns="${MAIN}">${extra.strings.join('')}</sst>`);
  }
  extra.more?.(pkg);
  return pkg.build();
}

/** Change a part of a zip. */
function patch(bytes: Uint8Array, name: string, fn: (text: string) => string): Uint8Array {
  const all = files(bytes);
  all[name] = strToU8(fn(strFromU8(all[name])));
  for (const k of Object.keys(all)) all[k] = new Uint8Array(all[k]);
  return zipSync(all);
}

// ---------------------------------------------------------------- X2: workbooks counting from 1904

describe('workbooks counting their dates from 1904', () => {
  const styles = '<numFmts count="1"><numFmt numFmtId="164" formatCode="[h]:mm"/></numFmts>' +
    '<cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="20" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="22" applyNumberFormat="1"/></cellXfs>';
  // 43538 is 15 March 2023 counting from 1904 (45000 counting from 1900)
  const sheet = '<sheetData><row r="1"><c r="A1" s="1"><v>43538</v></c><c r="B1" s="2"><v>0.5</v></c><c r="C1"><v>100</v></c><c r="D1" s="3"><v>1.5</v></c><c r="E1" s="4"><v>43538.75</v></c></row></sheetData>' +
    '<dataValidations count="1"><dataValidation type="date" operator="greaterThan" allowBlank="1" sqref="A2:A9"><formula1>43538</formula1></dataValidation></dataValidations>';
  const file = () => excelFile(sheet, { styles, workbook: '<workbookPr date1904="1"/><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>' });

  it('shows the dates as Excel does, and only the dates move', async () => {
    const { book, warnings } = await readXlsx(file());
    const s = book.sheet;
    expect(book.date1904).toBe(true);
    expect(s.value(0, 0)).toBe(45000);
    expect(s.shownText(0, 0)).toBe('3/15/2023');
    expect(s.shownText(0, 4)).toBe('3/15/2023 18:00');
    // a time of day, a plain number and an elapsed time are not dates
    expect(s.value(0, 1)).toBe(0.5);
    expect(s.value(0, 2)).toBe(100);
    expect(s.value(0, 3)).toBe(1.5);
    expect(s.validations[0].value1).toBe('2023-03-15');
    expect(warnings.join(' ')).not.toMatch(/1904/);
  });

  it('saves them back counting from 1904, as they were', async () => {
    const { book } = await readXlsx(file());
    // a date typed here goes in the same way
    book.edit('Type', () => book.sheet.setInput(1, 0, '1/2/2024'));
    const bytes = await writeXlsx(book, plain);
    expect(part(bytes, 'xl/workbook.xml')).toContain('<workbookPr date1904="1"/>');
    const xml = part(bytes, 'xl/worksheets/sheet1.xml');
    expect(xml).toMatch(/<c r="A1" s="\d+"><v>43538<\/v><\/c>/);
    expect(xml).toMatch(/<c r="B1" s="\d+"><v>0\.5<\/v><\/c>/);
    expect(xml).toContain('<c r="C1"><v>100</v></c>');
    expect(xml).toMatch(/<c r="D1" s="\d+"><v>1\.5<\/v><\/c>/);
    expect(xml).toMatch(/<c r="E1" s="\d+"><v>43538\.75<\/v><\/c>/);
    // 2 January 2024 is 45293 from 1900, 43831 from 1904
    expect(xml).toMatch(/<c r="A2" s="\d+"><v>43831<\/v><\/c>/);
    expect(xml).toContain('<formula1>43538</formula1>');
    // and opening the save shows the same dates
    const { book: back } = await readXlsx(bytes);
    expect(back.sheet.shownText(0, 0)).toBe('3/15/2023');
    expect(back.sheet.shownText(1, 0)).toBe('1/2/2024');
  });

  it('leaves workbooks counting from 1900 as they are', async () => {
    const wb = new Workbook();
    wb.edit('Type', () => wb.sheet.setInput(0, 0, '3/15/2023'));
    const bytes = await writeXlsx(wb, plain);
    expect(part(bytes, 'xl/workbook.xml')).toContain('<workbookPr/>');
    expect(part(bytes, 'xl/worksheets/sheet1.xml')).toMatch(/<v>45000<\/v>/);
  });

  it('tells dates from times and elapsed times by their format', () => {
    expect(dateKind('m/d/yyyy')).toBe('date');
    expect(dateKind('mmm-yy')).toBe('date');
    expect(dateKind('yyyy-mm-dd h:mm')).toBe('date');
    expect(dateKind('mmmm')).toBe('date');
    expect(dateKind('h:mm')).toBe('time');
    expect(dateKind('h:mm AM/PM')).toBe('time');
    expect(dateKind('mm:ss')).toBe('time');
    expect(dateKind('[h]:mm:ss')).toBe('elapsed');
    expect(dateKind('0.00')).toBeNull();
    expect(dateKind('0.0E+00')).toBeNull();
    expect(dateKind('"days" 0')).toBeNull();
    expect(dateKind(';;;')).toBeNull();
    expect(dateKind(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------- X3: links to other workbooks

describe('links to other workbooks', () => {
  const LINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink';
  const LINK_PATH = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath';
  const LINK_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml';
  const linkPart = (sheet: string, value: number) => `<externalLink xmlns="${MAIN}" xmlns:r="${RNS}"><externalBook r:id="rId1"><sheetNames><sheetName val="${sheet}"/></sheetNames>` +
    `<sheetDataSet><sheetData sheetId="0"><row r="1"><cell r="A1"><v>${value}</v></cell></row></sheetData></sheetDataSet></externalBook></externalLink>`;
  const file = () => excelFile(
    '<sheetData><row r="1"><c r="A1"><f>[1]Uses!$A$1</f><v>12</v></c><c r="B1"><f>\'[2]My data\'!A1*2</f><v>14</v></c></row></sheetData>',
    {
      workbook: '<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets><externalReferences><externalReference r:id="rId8"/><externalReference r:id="rId9"/></externalReferences>' +
        '<definedNames><definedName name="Stock">[1]Uses!$A$1:$A$9</definedName></definedNames>',
      more(pkg) {
        // (rIds as Excel numbers them: after the sheet's)
        pkg.relate('xl/workbook.xml', 'urn:test:a', 'a.xml'); pkg.relate('xl/workbook.xml', 'urn:test:b', 'b.xml');
        pkg.relate('xl/workbook.xml', 'urn:test:c', 'c.xml'); pkg.relate('xl/workbook.xml', 'urn:test:d', 'd.xml');
        pkg.relate('xl/workbook.xml', 'urn:test:e', 'e.xml'); pkg.relate('xl/workbook.xml', 'urn:test:f', 'f.xml');
        expect(pkg.relate('xl/workbook.xml', LINK, 'externalLinks/externalLink1.xml')).toBe('rId8');
        expect(pkg.relate('xl/workbook.xml', LINK, 'externalLinks/externalLink2.xml')).toBe('rId9');
        pkg.add('xl/externalLinks/externalLink1.xml', linkPart('Uses', 12), LINK_CT);
        pkg.relate('xl/externalLinks/externalLink1.xml', LINK_PATH, 'file:///C:\\Lab\\Inventory%202026.xlsx', true);
        pkg.add('xl/externalLinks/externalLink2.xml', linkPart('My data', 7), LINK_CT);
        pkg.relate('xl/externalLinks/externalLink2.xml', LINK_PATH, 'Yields.xlsx', true);
      },
    },
  );

  it('says which workbooks formulas read, by name', async () => {
    const { book, warnings } = await readXlsx(file());
    expect(book.externalLinks.map((l) => l.path)).toEqual(['xl/externalLinks/externalLink1.xml', 'xl/externalLinks/externalLink2.xml']);
    expect(book.sheet.cell(0, 0)?.input).toBe('=[1]Uses!$A$1');
    expect(warnings).toContain('3 formulas read values from other workbooks (Inventory 2026.xlsx, Yields.xlsx). They are kept for Excel, which updates them from those files, but can\'t be worked out here.');
    expect(warnings.join(' ')).not.toMatch(/functions this program can't work out/);
  });

  it('saves the links back in the order the formulas number them', async () => {
    const { book } = await readXlsx(file());
    const bytes = await writeXlsx(book, plain);
    const wb = part(bytes, 'xl/workbook.xml');
    const ids = [...wb.matchAll(/<externalReference r:id="(rId\d+)"\/>/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    // after the sheets, before the names (the order ECMA-376 gives them)
    expect(wb).toMatch(/<\/sheets><externalReferences>.*<\/externalReferences><definedNames>/);
    const rels = new DOMParser().parseFromString(part(bytes, 'xl/_rels/workbook.xml.rels'), 'application/xml');
    const target = (id: string) => Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === id);
    expect(target(ids[0])?.getAttribute('Target')).toBe('externalLinks/externalLink1.xml');
    expect(target(ids[1])?.getAttribute('Target')).toBe('externalLinks/externalLink2.xml');
    expect(target(ids[0])?.getAttribute('Type')).toBe(LINK);
    // each link as it was: the values last read, and the file it points at
    expect(part(bytes, 'xl/externalLinks/externalLink2.xml')).toBe(linkPart('My data', 7));
    expect(part(bytes, 'xl/externalLinks/_rels/externalLink1.xml.rels')).toContain('Target="file:///C:\\Lab\\Inventory%202026.xlsx" TargetMode="External"');
    expect(part(bytes, '[Content_Types].xml')).toContain(`<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="${LINK_CT}"/>`);
    // the formulas and names still point at them
    expect(part(bytes, 'xl/worksheets/sheet1.xml')).toContain('<f>[1]Uses!$A$1</f>');
    expect(wb).toContain('<definedName name="Stock">[1]Uses!$A$1:$A$9</definedName>');
    // and a second save keeps them too
    const again = await writeXlsx((await readXlsx(bytes)).book, plain);
    expect(part(again, 'xl/externalLinks/externalLink1.xml')).toBe(linkPart('Uses', 12));
  });
});

// ---------------------------------------------------------------- X4: legacy array formulas

describe('legacy array formulas (Ctrl+Shift+Enter)', () => {
  const sheet = (cells: string) => `<sheetData>${cells}</sheetData>`;
  const nums = '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2"><v>3</v></c><c r="B2"><v>4</v></c></row><row r="3"><c r="A3"><v>5</v></c></row>';

  it('keeps one Excel works out but this program can\'t over its whole block', async () => {
    const file = excelFile(sheet(nums +
      '<row r="5"><c r="A5"><f t="array" ref="A5:B6">NOSUCHMATRIX(A1:B2)</f><v>-2</v></c><c r="B5"><v>1</v></c></row>' +
      '<row r="6"><c r="A6"><v>1.5</v></c><c r="B6"><v>-0.5</v></c></row>'));
    const { book } = await readXlsx(file);
    expect(book.sheet.cell(4, 0)?.array).toEqual({ rows: 2, cols: 2 });
    const xml = part(await writeXlsx(book, plain), 'xl/worksheets/sheet1.xml');
    // still an array formula over A5:B6, not a dynamic one (no cm), and not cut to one cell
    expect(xml).toMatch(/<c r="A5"[^>]*><f t="array" ref="A5:B6">NOSUCHMATRIX\(A1:B2\)<\/f>/);
    expect(xml).not.toMatch(/<c r="A5"[^>]* cm="1"/);
    // the block's other cells are there for Excel to fill
    expect(xml).toMatch(/<c r="B5"/);
    expect(xml).toMatch(/<c r="A6"/);
    expect(xml).toMatch(/<c r="B6"/);
  });

  it('fills exactly its block here, as Excel does', async () => {
    const file = excelFile(sheet(nums +
      // a column into a taller block: #N/A past its end
      '<row r="1"><c r="D1"><f t="array" ref="D1:D4">A1:A3*2</f><v>2</v></c></row>' +
      // one value into a block: every cell
      '<row r="1"><c r="F1"><f t="array" ref="F1:G2">1+1</f><v>2</v></c></row>' +
      // a block into a smaller one: cut to fit
      '<row r="1"><c r="I1"><f t="array" ref="I1:I2">A1:B3*10</f><v>10</v></c></row>' +
      // one cell: the first value
      '<row r="1"><c r="K1"><f t="array" ref="K1">SUM(A1:A3*B1:B3)</f><v>14</v></c></row>'));
    const { book } = await readXlsx(file);
    const s = book.sheet;
    expect([0, 1, 2].map((r) => s.value(r, 3))).toEqual([2, 6, 10]);
    expect((s.value(3, 3) as CellError).code).toBe('#N/A');
    expect([s.value(0, 5), s.value(0, 6), s.value(1, 5), s.value(1, 6)]).toEqual([2, 2, 2, 2]);
    expect([s.value(0, 8), s.value(1, 8), s.value(2, 8)]).toEqual([10, 30, null]);
    expect(s.value(0, 10)).toBe(14);
    const xml = part(await writeXlsx(book, plain), 'xl/worksheets/sheet1.xml');
    expect(xml).toMatch(/<c r="D1"><f t="array" ref="D1:D4">A1:A3\*2<\/f><v>2<\/v><\/c>/);
    expect(xml).toMatch(/<c r="D4" t="e"><v>#N\/A<\/v><\/c>/);
    expect(xml).toMatch(/<c r="F1"><f t="array" ref="F1:G2">1\+1<\/f>/);
    expect(xml).toMatch(/<c r="I1"><f t="array" ref="I1:I2">A1:B3\*10<\/f>/);
    expect(xml).toMatch(/<c r="K1"><f t="array" ref="K1">SUM\(A1:A3\*B1:B3\)<\/f><v>14<\/v><\/c>/);
    expect(part(await writeXlsx(book, plain), 'xl/workbook.xml')).not.toContain('metadata');
  });

  it('leaves dynamic array formulas (marked cm) spilling', async () => {
    const file = excelFile(sheet('<row r="1"><c r="A1" cm="1"><f t="array" ref="A1:A3">_xlfn.SEQUENCE(3)</f><v>1</v></c></row>'));
    const { book } = await readXlsx(file);
    expect(book.sheet.cell(0, 0)?.array).toBeUndefined();
    expect(book.sheet.value(2, 0)).toBe(3);
    expect(part(await writeXlsx(book, plain), 'xl/worksheets/sheet1.xml')).toMatch(/<c r="A1" cm="1"><f t="array" ref="A1:A3">_xlfn\.SEQUENCE\(3\)<\/f>/);
  });

  it('becomes an ordinary formula when a new one is typed in its cell', async () => {
    const { book } = await readXlsx(excelFile(sheet(nums + '<row r="1"><c r="D1"><f t="array" ref="D1:D3">A1:A3*2</f><v>2</v></c></row>')));
    book.edit('Type', () => book.sheet.setInput(0, 3, '=A1:A3*3'));
    expect(book.sheet.cell(0, 3)?.array).toBeUndefined();
    expect(part(await writeXlsx(book, plain), 'xl/worksheets/sheet1.xml')).toMatch(/<c r="D1" cm="1"><f t="array" ref="D1:D3">A1:A3\*3<\/f>/);
  });
});

// ---------------------------------------------------------------- E9: rows and columns moved in Excel

function molfile(title: string, atoms: [string, number, number][], bonds: [number, number, number][]): string {
  const n = (v: number, w: number) => String(v).padStart(w);
  const f = (v: number) => v.toFixed(4).padStart(10);
  return [
    title, '  test', '',
    `${n(atoms.length, 3)}${n(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([el, x, y]) => `${f(x)}${f(y)}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([a, b, o]) => `${n(a, 3)}${n(b, 3)}${n(o, 3)}  0`),
    'M  END',
  ].join('\n');
}
const ETHANOL = molblockContents(molfile('ethanol', [['C', 0, 0], ['C', 1.299, 0.75], ['O', 2.598, 0]], [[1, 2, 1], [2, 3, 1]]), ACS_1996)!;
const ACETONE = molblockContents(molfile('acetone', [['C', 0, 0], ['C', 1.299, 0.75], ['C', 2.598, 0], ['O', 1.299, 2.25]], [[1, 2, 1], [2, 3, 1], [2, 4, 2]]), ACS_1996)!;

function withChem(wb: Workbook): Workbook {
  const chem = new SheetChem(
    { ready: true, props: async (mols) => mols.map((m) => molProps(RDKit, m)), substructure: async (q, mols) => substructureMatches(RDKit, q, mols) },
    (c) => structureMolfile(c, ACS_1996),
  );
  wb.chem = chem;
  chem.onAnswers = () => wb.recalc();
  return wb;
}

async function settle(wb: Workbook) {
  wb.recalc();
  await (wb.chem as SheetChem).settled();
  wb.recalc();
}

/** Structure | MW (a property column) | Mass (mg) | mmol (a chemistry formula): ethanol, then acetone. */
async function compounds(): Promise<Uint8Array> {
  const wb = withChem(new Workbook(['Compounds']));
  const s = wb.sheet;
  wb.edit('Type', () => {
    s.setInput(0, 0, 'Structure');
    s.setInput(0, 1, 'MW');
    s.setInput(0, 2, 'Mass (mg)');
    s.setInput(0, 3, 'mmol');
    s.setStructure(1, 0, ETHANOL);
    s.setStructure(2, 0, ACETONE);
    s.setColDef(1, { formula: '=MW(A2)', firstRow: 1, style: { numFmt: '0.00' } });
    s.setInput(1, 2, '46');
    s.setInput(2, 2, '58');
    s.setInput(1, 3, '=C2/MW(A2)*1000');
    s.setInput(2, 3, '=C3/MW(A3)*1000');
  });
  await settle(wb);
  return writeXlsx(wb, pictures);
}

async function open(bytes: Uint8Array) {
  const { book, warnings } = await readXlsx(bytes);
  withChem(book);
  await settle(book);
  return { book, s: book.sheet, warnings };
}

const atomsAt = (s: Workbook['sheet'], r: number, c: number) => s.cell(r, c)?.structure?.contents.atoms.length;

/**
 * What Excel does to our file when cells move: each cell (and its row's height, when rows move
 * with it) goes where `to` says; the structures' pictures go where `picture` says (their own
 * cells' place, unless a sort left them); the sheet's hidden grid name is rewritten by `name`.
 */
function excelMoves(bytes: Uint8Array, opts: { to: (r: number, c: number) => [number, number] | null; rowsMove: boolean; picture?: (r: number, c: number) => [number, number]; name: (text: string) => string }): Uint8Array {
  let out = patch(bytes, 'xl/worksheets/sheet1.xml', (text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const data = doc.getElementsByTagNameNS(MAIN, 'sheetData')[0];
    const rows = new Map<number, Element>();
    const cells: { el: Element; r: number; c: number }[] = [];
    for (const row of Array.from(data.getElementsByTagNameNS(MAIN, 'row'))) {
      const r = Number(row.getAttribute('r')) - 1;
      for (const c of Array.from(row.getElementsByTagNameNS(MAIN, 'c'))) {
        const m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute('r')!)!;
        const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        cells.push({ el: c, r: Number(m[2]) - 1, c: col });
        c.remove();
      }
      row.remove();
      const to = opts.rowsMove ? opts.to(r, 0)?.[0] : r;
      if (to !== undefined && to !== null) { row.setAttribute('r', String(to + 1)); rows.set(to, row); }
    }
    for (const { el, r, c } of cells) {
      const to = opts.to(r, c);
      if (!to) continue;
      el.setAttribute('r', `${String.fromCharCode(65 + to[1])}${to[0] + 1}`);
      let row = rows.get(to[0]);
      if (!row) { row = doc.createElementNS(MAIN, 'row'); row.setAttribute('r', String(to[0] + 1)); rows.set(to[0], row); }
      row.appendChild(el);
    }
    for (const r of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(r)!;
      const sorted = Array.from(row.childNodes).sort((a, b) => ((a as Element).getAttribute('r')!.length - (b as Element).getAttribute('r')!.length) || (a as Element).getAttribute('r')!.localeCompare((b as Element).getAttribute('r')!));
      for (const c of sorted) row.appendChild(c);
      data.appendChild(row);
    }
    return new XMLSerializer().serializeToString(doc);
  });
  out = patch(out, 'xl/drawings/drawing1.xml', (text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    for (const anchor of Array.from(doc.documentElement.children)) {
      const from = anchor.getElementsByTagNameNS(XDR, 'from')[0], to = anchor.getElementsByTagNameNS(XDR, 'to')[0];
      const get = (el: Element, n: string) => Number(el.getElementsByTagNameNS(XDR, n)[0].textContent);
      const set = (el: Element, n: string, v: number) => { el.getElementsByTagNameNS(XDR, n)[0].textContent = String(v); };
      const r = get(from, 'row'), c = get(from, 'col');
      const [r2, c2] = (opts.picture ?? ((a, b) => opts.to(a, b) ?? [a, b]))(r, c);
      set(from, 'row', r2); set(from, 'col', c2);
      set(to, 'row', get(to, 'row') + r2 - r); set(to, 'col', get(to, 'col') + c2 - c);
    }
    return new XMLSerializer().serializeToString(doc);
  });
  return patch(out, 'xl/workbook.xml', (text) => text.replace(/(<definedName name="_ChemIllustrator_Grid"[^>]*>)([^<]*)/, (_, open: string, f: string) => open + opts.name(f)));
}

describe('structures and property columns after Excel moved cells', () => {
  it('writes the hidden name that Excel keeps up to date', async () => {
    const wb = part(await compounds(), 'xl/workbook.xml');
    expect(wb).toContain('<definedName name="_ChemIllustrator_Grid" localSheetId="0" hidden="1">Compounds!$A:$A,Compounds!$B:$B,Compounds!$C:$C,Compounds!$D:$D,Compounds!$1:$1,Compounds!$2:$2</definedName>');
    // and it isn't one of the workbook's own names here
    const { book } = await readXlsx(await compounds());
    expect(book.names).toEqual([]);
  });

  it('finds them again after a row is put in above the table', async () => {
    const moved = excelMoves(await compounds(), {
      to: (r, c) => [r + 1, c], rowsMove: true,
      name: (f) => f.replace('$1:$1', '$2:$2').replace(/\$2:\$2$/, '$3:$3'),
    });
    const { s, warnings } = await open(moved);
    expect(warnings).toEqual([]);
    expect(atomsAt(s, 2, 0)).toBe(3);
    expect(atomsAt(s, 3, 0)).toBe(4);
    expect(s.colDefs.get(1)).toMatchObject({ formula: '=MW(A3)', firstRow: 2 });
    expect(s.cell(2, 1)?.input).toBeUndefined();
    expect(s.value(2, 1)).toBeCloseTo(46.07, 2);
    expect(s.cell(2, 3)?.input).toBe('=C3/MW(A3)*1000');
    expect(s.value(3, 3)).toBeCloseTo(998.6, 0);
    // the rows grown to fit structures keep fitting
    expect(s.rowHeights.size).toBe(0);
  });

  it('finds them again after a row is put in between two compounds', async () => {
    const moved = excelMoves(await compounds(), {
      to: (r, c) => [r >= 2 ? r + 1 : r, c], rowsMove: true,
      name: (f) => f,
    });
    const { s, warnings } = await open(moved);
    expect(warnings).toEqual([]);
    expect(atomsAt(s, 1, 0)).toBe(3);
    expect(atomsAt(s, 3, 0)).toBe(4);
    expect(s.cell(2, 0)).toBeUndefined();
    expect(s.cell(3, 3)?.input).toBe('=C4/MW(A4)*1000');
    expect(s.value(3, 1)).toBeCloseTo(58.08, 2);
  });

  it('finds them again after a sort that left the pictures where they were', async () => {
    const swap = (r: number) => (r === 1 ? 2 : r === 2 ? 1 : r);
    const moved = excelMoves(await compounds(), { to: (r, c) => [swap(r), c], rowsMove: false, picture: (r, c) => [r, c], name: (f) => f });
    const { s, warnings } = await open(moved);
    expect(warnings).toEqual([]);
    expect(atomsAt(s, 1, 0)).toBe(4);
    expect(atomsAt(s, 2, 0)).toBe(3);
    // worked out again for the compound now in each row
    expect(s.cell(1, 1)?.input).toBeUndefined();
    expect(s.value(1, 1)).toBeCloseTo(58.08, 2);
    expect(s.value(2, 1)).toBeCloseTo(46.07, 2);
    // each chemistry formula went with its row
    expect(s.cell(1, 3)?.input).toBe('=C2/MW(A2)*1000');
    expect(s.cell(2, 3)?.input).toBe('=C3/MW(A3)*1000');
    expect(s.value(2, 3)).toBeCloseTo(998.6, 0);
  });

  it('finds them again after a column is put in before the MW column', async () => {
    const moved = excelMoves(await compounds(), {
      to: (r, c) => [r, c >= 1 ? c + 1 : c], rowsMove: true,
      name: (f) => f.replace('$D:$D', '$E:$E').replace('$C:$C', '$D:$D').replace('$B:$B', '$C:$C'),
    });
    const { s, warnings } = await open(moved);
    expect(warnings).toEqual([]);
    expect(atomsAt(s, 1, 0)).toBe(3);
    // the property column is the one that moved, still reading the structures in A
    expect(s.colDefs.has(1)).toBe(false);
    expect(s.colDefs.get(2)).toMatchObject({ formula: '=MW(A2)', firstRow: 1 });
    expect(s.cell(1, 2)?.input).toBeUndefined();
    expect(s.value(1, 2)).toBeCloseTo(46.07, 2);
    expect(s.value(1, 1)).toBeNull();
    expect(s.cell(1, 4)?.input).toBe('=D2/MW(A2)*1000');
  });

  it('keeps Excel\'s values when the column a property column reads was taken out', async () => {
    const moved = excelMoves(await compounds(), {
      to: (r, c) => (c === 0 ? null : [r, c - 1]), rowsMove: true,
      name: (f) => f.replace('Compounds!$A:$A', 'Compounds!#REF!').replace('$B:$B', '$A:$A').replace('$C:$C', '$B:$B').replace('$D:$D', '$C:$C'),
    });
    const { s, warnings } = await open(moved);
    expect(s.colDefs.size).toBe(0);
    expect(s.value(1, 0)).toBeCloseTo(46.07, 2);
    expect(warnings[0]).toMatch(/^6 structure or calculated cells were changed in another program/);
  });

  it('shows a structure\'s SMILES when the structure can\'t be put back', async () => {
    const edited = patch(await compounds(), 'xl/sharedStrings.xml', (t) => t.replace('<t>CCO</t>', '<t>CO</t>'));
    const { s } = await open(edited);
    expect(s.cell(1, 0)?.structure).toBeUndefined();
    expect(s.cell(1, 0)?.input).toBe('CO');
    expect(s.cell(1, 0)?.style?.numFmt).toBeUndefined();
    expect(s.shownText(1, 0)).toBe('CO');
    expect(atomsAt(s, 2, 0)).toBe(4);
  });

  it('finds the sheet by its id after it was renamed and another put before it', async () => {
    let bytes = await compounds();
    bytes = patch(bytes, 'xl/workbook.xml', (t) => t
      .replace('<sheet name="Compounds" sheetId="1" r:id="rId1"/>', '<sheet name="New" sheetId="2" r:id="rId99"/><sheet name="Results" sheetId="1" r:id="rId1"/>')
      .replace('localSheetId="0" hidden="1">Compounds!', 'localSheetId="1" hidden="1">Results!').replace(/Compounds!/g, 'Results!'));
    bytes = patch(bytes, 'xl/_rels/workbook.xml.rels', (t) => t.replace('</Relationships>', '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet9.xml"/></Relationships>'));
    const all = files(bytes);
    all['xl/worksheets/sheet9.xml'] = strToU8(`<worksheet xmlns="${MAIN}"><sheetData/></worksheet>`);
    for (const k of Object.keys(all)) all[k] = new Uint8Array(all[k]);
    const { book, warnings } = await readXlsx(zipSync(all));
    expect(warnings).toEqual([]);
    const s = book.sheetNamed('Results')!;
    expect(atomsAt(s, 1, 0)).toBe(3);
    expect(s.colDefs.get(1)).toMatchObject({ formula: '=MW(A2)' });
    expect(book.sheetNamed('New')!.colDefs.size).toBe(0);
  });

  it('reads the grid name as Excel rewrites it', () => {
    const grid = { cols: [0, 3], rows: [0, 1] };
    expect(readGridName("'My sheet'!$A:$A,'My sheet'!$D:$D,'My sheet'!$1:$1,'My sheet'!$2:$2", grid)).toBe(STILL);
    const m = readGridName("'My sheet'!$A:$A,'My sheet'!$E:$E,'My sheet'!$2:$2,'My sheet'!$3:$3", grid);
    expect([m.col(0), m.col(3), m.col(5), m.row(0), m.row(1), m.row(7)]).toEqual([0, 4, 6, 1, 2, 8]);
    const gone = readGridName("'My, sheet'!#REF!,'My, sheet'!$C:$C,'My, sheet'!$1:$1,'My, sheet'!$2:$2", grid);
    expect([gone.col(0), gone.col(3)]).toEqual([null, 2]);
    // a name that doesn't list as many: nothing is moved
    expect(readGridName('Data!$A:$A', grid)).toBe(STILL);
  });
});
