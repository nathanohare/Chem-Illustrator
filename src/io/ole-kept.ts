// A ChemDraw object from PowerPoint, as its file has it: the object and the picture PowerPoint shows
// for it, saved back untouched while the drawing here is the one read. The object holds things
// that aren't read here, and the picture is ChemDraw's own, so a drawing of it here could only
// come close.

import { Doc } from '../model';
import type { Vec } from '../geom';
import { extractDrawing } from './clipboard';
import { bytesHash } from './ooxml';
import { remapFrames, remapStep } from './remap-refs';
import type { Selection } from '../editor/arrange';

export interface KeptOle {
  /** The object's part. */
  bin: Uint8Array;
  /** The picture PowerPoint shows, and its file's extension (usually an EMF). */
  picture: Uint8Array;
  pictureExt: string;
  svg?: Uint8Array;
  crop?: { l: number; t: number; r: number; b: number };
  /** The drawing read from it, wherever it stands on the slide (olePrint). */
  print: string;
  /** Where its first thing stood, to tell how far the object was moved. */
  x: number;
  y: number;
  /** The object's frame on the slide. */
  frame: { x1: number; y1: number; x2: number; y2: number };
  imgW: string;
  imgH: string;
  objectName: string;
  name: string;
  descr: string;
  /** The drawing kept with an object saved here before (the CDXML and box tags). */
  cdxmlTag?: string;
  boxTag?: string;
}

/** Add a drawing to `doc`, with every position passed through `map`. */
export function mergeDrawing(doc: Doc, src: Doc, map: (p: Vec) => Vec): void {
  const ids = new Map<number, number>();
  // (multicentre points after the atoms they stand for)
  const atoms = [...src.atoms.values()];
  for (const a of [...atoms.filter((x) => !x.multi), ...atoms.filter((x) => x.multi)]) {
    const { id, ...rest } = structuredClone(a);
    if (rest.multi) rest.multi = rest.multi.map((m) => ids.get(m)).filter((m): m is number => m !== undefined);
    const p = map(a);
    ids.set(id, doc.addAtom(p.x, p.y, a.z, { ...rest, x: p.x, y: p.y }).id);
  }
  for (const b of src.bonds.values()) {
    const a1 = ids.get(b.a1), a2 = ids.get(b.a2);
    if (a1 === undefined || a2 === undefined) continue;
    const { id: _id, ...rest } = structuredClone(b);
    doc.addBond(a1, a2, b.order, b.display, { ...rest, a1, a2 });
  }
  const caps = new Map<number, number>(), shapes = new Map<number, number>(), arrows = new Map<number, number>();
  const maps = { atoms: ids, captions: caps, shapes, arrows };
  for (const c of src.captions.values()) {
    const { id, ...rest } = structuredClone(c);
    const p = map(c);
    caps.set(id, doc.addCaption({ ...rest, x: p.x, y: p.y }).id);
  }
  for (const s of src.shapes.values()) {
    const { id, ...rest } = structuredClone(s);
    const a = map({ x: s.x1, y: s.y1 }), b = map({ x: s.x2, y: s.y2 });
    shapes.set(id, doc.addShape({ ...rest, x1: a.x, y1: a.y, x2: b.x, y2: b.y }).id);
  }
  for (const r of src.arrows.values()) {
    const { id, ...rest } = structuredClone(r);
    if (rest.step) rest.step = remapStep(rest.step, maps);
    arrows.set(id, doc.addArrow({ ...rest, tail: map(r.tail), head: map(r.head) }).id);
  }
  remapFrames(doc, maps);
}

/** A print of a drawing wherever it stands, and where its first thing stood. */
export function olePrint(doc: Doc, sel: Selection): { print: string; x: number; y: number } {
  // (in the drawing's own order, whatever order the selection was made in)
  const inOrder = (ids: Iterable<number>, keep: Set<number>) => new Set([...ids].filter((id) => keep.has(id)));
  const part = extractDrawing(doc, {
    atoms: inOrder(doc.atoms.keys(), sel.atoms), bonds: inOrder(doc.bonds.keys(), sel.bonds), captions: inOrder(doc.captions.keys(), sel.captions),
    arrows: inOrder(doc.arrows.keys(), sel.arrows), shapes: inOrder(doc.shapes.keys(), sel.shapes),
  });
  const first = (part.atoms.values().next().value as Vec | undefined)
    ?? (part.captions.values().next().value as Vec | undefined)
    ?? part.arrows.values().next().value?.tail;
  const sh = part.shapes.values().next().value;
  const x = first?.x ?? sh?.x1 ?? 0, y = first?.y ?? sh?.y1 ?? 0;
  const placed = new Doc();
  placed.edit('Print', () => mergeDrawing(placed, part, (p) => ({ x: p.x - x, y: p.y - y })));
  const text = JSON.stringify(placed.contents(), (k, v: unknown) => (k === 'ole' ? undefined : typeof v === 'number' ? +v.toFixed(3) : v));
  return { print: bytesHash(new TextEncoder().encode(text)), x, y };
}
