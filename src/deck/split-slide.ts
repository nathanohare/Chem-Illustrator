// How a slide's contents split up when saved to PowerPoint: what stays PowerPoint text,
// pictures, shapes and tables, and which structures and schemes become one picture each.
// Kept apart from the PowerPoint writer so animations can use it without loading the writer.

import type { Doc, Caption, Shape, Arrow } from '../model';
import type { Rect } from '../geom';
import { layoutText, type Measure } from '../text/layout';
import { arialWidth } from '../text-metrics';
import { arrowPoints, shapeBox, boxOf, shapeOrder } from '../objects';
import type { Selection } from '../editor/editor';

/** A slide's contents sorted for PowerPoint. */
export interface SlideParts {
  /** Titles, text placeholders and text boxes: PowerPoint text. */
  texts: Caption[];
  /** Pictures. */
  pictures: Shape[];
  /** Boxes, ovals and lines away from structures: PowerPoint shapes. */
  shapes: Shape[];
  /** Tables: PowerPoint tables. */
  tables: Shape[];
  /** Connectors between design shapes (and elbow arrows): PowerPoint connectors. */
  connectors: Arrow[];
  /** Structures and schemes, each with the captions, arrows and shapes around it: one picture each. */
  drawings: Selection[];
  /** SmartArt-style diagrams: their frame (which keeps the text), shapes and connectors, each saved as one group. */
  diagrams: SlideDiagram[];
}

export interface SlideDiagram { frame: Shape; shapes: Shape[]; connectors: Arrow[] }

/** A slide's diagrams, and what belongs to them (which is saved in their groups, not on its own). */
export function slideDiagrams(doc: Doc): { diagrams: SlideDiagram[]; shapes: Set<number>; arrows: Set<number> } {
  const diagrams: SlideDiagram[] = [];
  const shapes = new Set<number>(), arrows = new Set<number>();
  for (const sh of doc.shapes.values()) {
    if (!sh.diagram || !sh.frame) continue;
    const members = sh.frame.shapes.map((id) => doc.shapes.get(id)).filter((x): x is Shape => !!x && x.kind === 'geo');
    const links = sh.frame.arrows.map((id) => doc.arrows.get(id)).filter((x): x is Arrow => !!x);
    shapes.add(sh.id);
    for (const x of members) shapes.add(x.id);
    for (const x of links) arrows.add(x.id);
    diagrams.push({ frame: sh, shapes: shapeOrder(members), connectors: links });
  }
  return { diagrams, shapes, arrows };
}

const emptySel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

/**
 * Sort a slide's drawing: structures, arrows, brackets and anything close to them group into
 * schemes (each saved as one picture); titles, text boxes, pictures and lone shapes stay
 * separate so PowerPoint can edit them.
 */
export function splitSlide(doc: Doc, measure: Measure = arialMeasure): SlideParts {
  const L = doc.style.bondLength;
  const gap = 0.75 * L;
  type Item = { box: Rect; chem: boolean; add: (s: Selection) => void; text?: Caption; shape?: Shape };
  const items: Item[] = [];
  const texts: Caption[] = [];
  const pictures: Shape[] = [];
  const tables: Shape[] = [];
  const geos: Shape[] = [];
  for (const frag of doc.fragments()) {
    const pts = [...frag].map((id) => doc.atoms.get(id)!);
    const b = boxOf(pts);
    const pad = doc.style.labelSize * 0.6;
    items.push({
      box: { x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad }, chem: true,
      add: (s) => {
        for (const id of frag) {
          s.atoms.add(id);
          for (const bid of doc.adj.get(id) ?? []) s.bonds.add(bid);
        }
      },
    });
  }
  const dia = slideDiagrams(doc);
  const connectors: Arrow[] = [];
  for (const r of doc.arrows.values()) if (!dia.arrows.has(r.id) && (r.from || r.to || r.elbow)) connectors.push(r);
  for (const r of doc.arrows.values()) if (!dia.arrows.has(r.id) && !(r.from || r.to || r.elbow)) items.push({ box: boxOf(arrowPoints(r, 12)), chem: true, add: (s) => s.arrows.add(r.id) });
  for (const sh of doc.shapes.values()) {
    if (sh.picture) continue; // a stand-in for a picture from a ChemDraw file
    if (dia.shapes.has(sh.id)) continue;
    if (sh.kind === 'picture') { pictures.push(sh); continue; }
    if (sh.kind === 'table') { if (sh.table) tables.push(sh); continue; }
    // design shapes stay PowerPoint shapes even beside structures (boxes round a structure, flasks under one)
    if (sh.kind === 'geo') { geos.push(sh); continue; }
    // ring fills sit under their structure, in its picture
    const chem = sh.kind === 'bracket' || sh.kind === 'symbol' || sh.kind === 'ring';
    if (sh.hidden && !chem) { geos.push(sh); continue; }
    items.push({ box: shapeBox(sh), chem, add: (s) => s.shapes.add(sh.id), shape: sh });
  }
  for (const c of doc.captions.values()) {
    // titles, text placeholders and text boxes are always PowerPoint text
    // (and hidden text, kept hidden in PowerPoint rather than left out of a structure's picture)
    if (c.ph || c.wrap !== undefined || c.hidden) { texts.push(c); continue; }
    const lay = layoutText(c, doc.style.captionSize, measure);
    items.push({ box: { x1: c.x + lay.box.x1, y1: c.y + lay.box.y1, x2: c.x + lay.box.x2, y2: c.y + lay.box.y2 }, chem: false, add: (s) => s.captions.add(c.id), text: c });
  }
  // group things that touch (within the gap), by joining groups
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = (a: Rect, b: Rect) => a.x1 - gap <= b.x2 && b.x1 - gap <= a.x2 && a.y1 - gap <= b.y2 && b.y1 - gap <= a.y2;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (near(items[i].box, items[j].box)) parent[find(i)] = find(j);
  }
  const groups = new Map<number, Item[]>();
  items.forEach((it, i) => {
    const g = groups.get(find(i)) ?? [];
    g.push(it);
    groups.set(find(i), g);
  });
  const drawings: Selection[] = [];
  const shapes: Shape[] = [];
  for (const g of groups.values()) {
    if (g.some((it) => it.chem)) {
      const s = emptySel();
      for (const it of g) it.add(s);
      drawings.push(s);
    } else {
      for (const it of g) {
        if (it.text) texts.push(it.text);
        else if (it.shape) shapes.push(it.shape);
      }
    }
  }
  // top to bottom, then left to right, as people read (and as PowerPoint tabs through them)
  const top = (s: Selection) => Math.min(...[...s.atoms].map((id) => doc.atoms.get(id)!.y), ...[...s.arrows].map((id) => doc.arrows.get(id)!.tail.y), ...[...s.shapes].map((id) => doc.shapes.get(id)!.y1));
  drawings.sort((a, b) => top(a) - top(b));
  return { texts, pictures, shapes: shapeOrder([...shapes, ...geos]), tables, drawings, connectors, diagrams: dia.diagrams };
}

export const arialMeasure: Measure = (t, size, _family, style) => arialWidth(t, size, /bold/.test(style));
