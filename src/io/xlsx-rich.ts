// Pictures placed in cells, and Excel's other rich values (IMAGE() results, data types), which
// Excel 365 keeps in a cell as #VALUE! with a pointer (vm, "value metadata") to the rich value
// in xl/richData ([MS-XLSX] 2.3.6.1.3 and 2.3.6.2; ECMA-376 part 1, 18.9 metadata). This
// program shows such a cell as #VALUE!; the rich values' parts are kept whole (see
// kept-parts.ts), and each cell's pointer while the cell is unchanged, so Excel shows the
// picture again in a file saved here.

import { kid, kids, type Package, type PackageReader } from './ooxml';
import { elementXml, readTree, relativeTarget, type KeptTree } from './kept-parts';
import { fromDataUrl } from '../render/images';
import { mainXml } from './xlsx-view';
import type { Sheet, Workbook, Cell } from '../sheet/workbook';

/** The relationships from the workbook to the rich values' parts (kept whole, with the pictures they lead to). */
export const isRichDataRel = (type: string, target: string): boolean =>
  /^xl\/richData\//i.test(target) || /\/relationships\/(?:rd[A-Z]|richValue|richStyles)/.test(type);

/** The value metadata of a workbook: its kinds (metadataType and futureMetadata elements) and each block, by kind name. */
export interface RichMetadata {
  types: { name: string; type: string; future?: string }[];
  /** valueMetadata's blocks: each record's kind (by name) and its index into that kind's list. */
  blocks: [string, number][][];
}

/** A workbook's value metadata (null when it has none, or none this program can keep). */
export function readRichMetadata(pkg: PackageReader, path: string | null): RichMetadata | null {
  let doc: Document | null = null;
  try { doc = path ? pkg.xml(path) : null; } catch { doc = null; }
  const root = doc?.documentElement;
  const values = kid(root, 'valueMetadata');
  if (!root || !values) return null;
  const typeEls = kids(kid(root, 'metadataTypes'), 'metadataType');
  const future = new Map(kids(root, 'futureMetadata').map((f) => [f.getAttribute('name') ?? '', elementXml(f)]));
  const blocks = kids(values, 'bk').map((bk) => kids(bk, 'rc').map((rc): [string, number] => [typeEls[Number(rc.getAttribute('t')) - 1]?.getAttribute('name') ?? '', Number(rc.getAttribute('v') ?? 0)]));
  if (!blocks.length || blocks.some((b) => b.some(([name]) => !name))) return null;
  const used = new Set(blocks.flat().map(([name]) => name));
  const types = typeEls.filter((t) => used.has(t.getAttribute('name') ?? '')).map((t) => {
    const name = t.getAttribute('name') ?? '';
    return { name, type: mainXml(t), ...(future.has(name) ? { future: future.get(name)! } : {}) };
  });
  return { types, blocks };
}

/** The value metadata's parts of a metadata part, after `before` kinds (Excel's dynamic array kind, when written). */
export function richMetadataXml(m: RichMetadata, before: string[]): { types: string[]; future: string; values: string } {
  const index = (name: string) => before.length + m.types.findIndex((t) => t.name === name) + 1;
  return {
    types: m.types.map((t) => t.type),
    future: m.types.map((t) => t.future ?? '').join(''),
    values: `<valueMetadata count="${m.blocks.length}">${m.blocks.map((b) => `<bk>${b.map(([name, v]) => `<rc t="${index(name)}" v="${v}"/>`).join('')}</bk>`).join('')}</valueMetadata>`,
  };
}

/** A workbook's rich values: their parts, and the value metadata cells point into. */
export interface RichValues {
  trees: KeptTree[];
  metadata: RichMetadata;
}

/** A workbook's rich values, kept whole (null when it has none, or they can't be kept). */
export function readRichValues(pkg: PackageReader, wbPath: string, metadataPath: string | null): RichValues | null {
  const trees: KeptTree[] = [];
  for (const r of pkg.rels(wbPath).values()) {
    if (r.external || !isRichDataRel(r.type, r.target)) continue;
    const tree = readTree(pkg, r.target);
    if (tree) trees.push({ from: 'main', type: r.type, path: r.target, ...tree });
  }
  const metadata = trees.length ? readRichMetadata(pkg, metadataPath) : null;
  return metadata ? { trees, metadata } : null;
}

/**
 * Write the rich values' parts back, related from the workbook. A picture whose name a part
 * of this file already has (xl/media/image1.png) is given another.
 */
export function writeRichParts(pkg: Package, trees: KeptTree[], main: string): void {
  const moved = new Map<string, string>();
  const at = (path: string) => moved.get(path) ?? path;
  for (const tree of trees) for (const p of tree.parts) {
    let path = p.path;
    const dot = path.lastIndexOf('.') > path.lastIndexOf('/') ? path.lastIndexOf('.') : path.length;
    for (let n = 2; pkg.has(path); n++) path = `${p.path.slice(0, dot)}_${n}${p.path.slice(dot)}`;
    if (path !== p.path) moved.set(p.path, path);
    pkg.add(path, p.xml ?? fromDataUrl(p.data ?? 'data:application/octet-stream,').bytes, p.type);
  }
  for (const tree of trees) {
    for (const r of tree.rels) {
      if (r.external) pkg.relate(at(r.from), r.type, r.target, true);
      else if (tree.parts.some((p) => p.path === r.target)) pkg.relate(at(r.from), r.type, relativeTarget(at(r.from), at(r.target)));
    }
    pkg.relate(main, tree.type, relativeTarget(main, at(tree.path)));
  }
}

/** Each cell's pointer to its rich value (vm), by the cell it belongs to: an edited cell is a new one, and has none. */
const pointers = new WeakMap<Cell, number>();

/** After a file is read: the cells that pointed at rich values, by sheet and cell key. */
export function keepPointers(book: Workbook, found: Map<Sheet, Map<number, number>>): void {
  for (const [s, list] of found) for (const [k, vm] of list) {
    const cell = s.cells.get(k);
    if (cell && book.sheets.includes(s)) pointers.set(cell, vm);
  }
}

/** A cell's pointer to its rich value, while the cell is as it was read. */
export const pointerOf = (cell: Cell | undefined): number | undefined => (cell ? pointers.get(cell) : undefined);
