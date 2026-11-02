// The structures in a file and where each one is: in a drawing, on a slide, in a document (a
// figure in its text), or in a spreadsheet's cell; each with the compound number under it when
// it has one. File > Find Structure in Files searches these, and the compound library notes the
// files its compounds appear in from them.

import { Doc, type Contents } from '../model';
import { plainMeasure, schemeItems } from '../chem/reaction';
import { labelsOf } from '../chem/scheme-layout';
import { plainText } from '../richtext';
import { toMolfile } from '../chem/molfile';
import { readCdxml } from '../io/cdxml';
import { cdxToCdxml, isCdx } from '../io/cdx';
import { extensionOf } from '../io/files';
import type { DocText } from '../document/document';
import { usedObjects } from '../document/document';
import type { Workbook } from '../sheet/workbook';
import { colOf, rowOf } from '../sheet/refs';
import { structureDoc } from '../sheet/structure-doc';
import { ACS_1996 } from '../style';

/** Where in a file a structure is. */
export type Spot =
  | { kind: 'drawing' }
  /** A slide (from 0) of a presentation or design. */
  | { kind: 'slide'; slide: number }
  /** A figure in a document's text (its object id, and which of the document's figures it is, from 1). */
  | { kind: 'figure'; object: number; n: number }
  | { kind: 'cell'; sheet: number; sheetName: string; row: number; col: number };

/** One structure found: where it is, its atoms there, the number under it, and its molfile. */
export interface Found {
  spot: Spot;
  atoms: number[];
  label?: string;
  molblock: string;
}

/** A column's letters (0 → A, 27 → AB). */
export function colName(c: number): string {
  let s = '';
  for (let k = c + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** Where a structure is, in words: "slide 3", "figure 2", "Sheet1!B4", "the drawing". */
export function spotText(s: Spot): string {
  switch (s.kind) {
    case 'drawing': return 'the drawing';
    case 'slide': return `slide ${s.slide + 1}`;
    case 'figure': return `figure ${s.n}`;
    case 'cell': return `${s.sheetName}!${colName(s.col)}${s.row + 1}`;
  }
}

/** The text of the compound number under a structure, if it has one. */
const labelText = (doc: Doc, caption: number | undefined): string | undefined => {
  const c = caption !== undefined ? doc.captions.get(caption) : undefined;
  const t = c ? plainText(c.runs).trim() : '';
  return t || undefined;
};

/** Each structure in a drawing (its atoms, and the compound number under it), largest first. */
export function structuresIn(doc: Doc): { atoms: number[]; label?: string }[] {
  if (!doc.atoms.size) return [];
  const items = schemeItems(doc, plainMeasure(doc));
  const labels = labelsOf(items, new Set(), doc, doc.style.bondLength || 14.4);
  const out: { atoms: number[]; label?: string }[] = [];
  for (const it of items) {
    if (!it.atoms.length) continue;
    // a lone atom with a label is usually text drawn as an atom (a reagent's name): kept, it may be a reagent searched for
    const caps = labels.get(it) ?? [];
    const label = caps.map((c) => labelText(doc, c.caption)).find((t) => t !== undefined && t.length <= 12);
    out.push({ atoms: it.atoms, ...(label ? { label } : {}) });
  }
  return out.sort((a, b) => b.atoms.length - a.atoms.length);
}

function foundIn(doc: Doc, spot: Spot): Found[] {
  return structuresIn(doc).map((s) => ({ spot, atoms: s.atoms, ...(s.label ? { label: s.label } : {}), molblock: toMolfile(doc, s.atoms).molblock }));
}

/** The structures in a drawing's contents (a slide, a figure, a cell). */
export function foundInContents(c: Contents, spot: Spot, style = ACS_1996): Found[] {
  if (!c.atoms.length) return [];
  return foundIn(structureDoc(c, style), spot);
}

/** How the other kinds of file are read (the app's own readers, loaded when needed). */
export interface FileReaders {
  document(bytes: Uint8Array, name: string): Promise<DocText>;
  sheet(bytes: Uint8Array, name: string): Promise<Workbook>;
  /** Each slide's drawing, in order. */
  slides(bytes: Uint8Array): Promise<Contents[]>;
}

/** The kinds of file searched. */
export const SEARCHED_EXTENSIONS = ['cdxml', 'cdx', 'docx', 'pptx', 'xlsx', 'xlsm'];

const zip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** The structures in a document's figures, in the order they come in the text. */
export function foundInDocument(t: DocText): Found[] {
  const out: Found[] = [];
  let n = 0;
  for (const id of usedObjects(t)) {
    const o = t.objects[id];
    if (o?.kind !== 'drawing') continue;
    n++;
    out.push(...foundInContents(o.contents, { kind: 'figure', object: id, n }, t.drawingStyle ?? ACS_1996));
  }
  return out;
}

/** The structures in a workbook's cells, sheet by sheet, row by row. */
export function foundInWorkbook(book: Workbook): Found[] {
  const out: Found[] = [];
  book.sheets.forEach((s, i) => {
    const keys = [...s.cells.keys()].filter((k) => s.cells.get(k)?.structure).sort((a, b) => rowOf(a) - rowOf(b) || colOf(a) - colOf(b));
    for (const k of keys) out.push(...foundInContents(s.cells.get(k)!.structure!.contents, { kind: 'cell', sheet: i, sheetName: s.name, row: rowOf(k), col: colOf(k) }, book.drawingStyle));
  });
  return out;
}

/** Every structure in a file (by its name's extension, or what its bytes are). */
export async function foundInFile(bytes: Uint8Array, name: string, read: FileReaders): Promise<Found[]> {
  const ext = extensionOf(name);
  if (ext === 'cdx' || isCdx(bytes)) return foundIn(readCdxml(cdxToCdxml(bytes)).doc, { kind: 'drawing' });
  if (ext === 'cdxml') return foundIn(readCdxml(new TextDecoder().decode(bytes)).doc, { kind: 'drawing' });
  if (!zip(bytes)) return [];
  if (ext === 'docx') return foundInDocument(await read.document(bytes, name));
  if (ext === 'xlsx' || ext === 'xlsm') return foundInWorkbook(await read.sheet(bytes, name));
  if (ext === 'pptx') {
    const slides = await read.slides(bytes);
    return slides.flatMap((c, i) => foundInContents(c, { kind: 'slide', slide: i }));
  }
  return [];
}
