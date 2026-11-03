// Resizing a drawing read from elsewhere (the clipboard, a ChemDraw object in a PowerPoint file)
// for the document it goes into.

import type { Bond, Doc, TextRun } from '../model';
import { bondWidths, scaleOwnWidths, type DocStyle } from '../style';
import type { Vec } from '../geom';

/** The usual bond length in a drawing (the median), or null when it has no bonds. */
export function typicalBondLength(doc: Doc): number | null {
  const ls: number[] = [];
  for (const b of doc.bonds.values()) {
    const p = doc.atoms.get(b.a1), q = doc.atoms.get(b.a2);
    if (p && q) ls.push(Math.hypot(p.x - q.x, p.y - q.y));
  }
  if (!ls.length) return null;
  ls.sort((a, b) => a - b);
  return ls[ls.length >> 1];
}

/**
 * Get a pasted drawing ready for a document drawn in the style `to`. Sizes in a drawing are
 * relative to its own style, so they are converted: labels, lines and text keep the look they
 * had where they came from. With `bondLength`, the drawing is first resized so its bonds are
 * that long (structures pasted on slides take the slide master's bond length); its text and
 * arrowheads grow or shrink with it. Changes `src`, a drawing just read from the clipboard.
 */
export function fitPasted(src: Doc, to: DocStyle, bondLength?: number): void {
  const from = src.style;
  // labels keep their own look (ChemDraw's bold labels stay bold in a drawing whose labels are
  // plain), and bonds their wedge, hash and margin widths where the drawing's own differ
  const differs = (x: number, y: number) => Math.abs(x - y) > 1e-3;
  src.bulk(() => {
    for (const a of [...src.atoms.values()]) {
      const face = a.face ?? from.labelFace ?? 0;
      const own = (face & 1) !== ((to.labelFace ?? 0) & 1) ? face : undefined;
      const margin = a.marginWidth === undefined && differs(from.marginWidth, to.marginWidth) ? { marginWidth: from.marginWidth * (a.s ?? 1) } : {};
      if (own !== a.face || 'marginWidth' in margin) src.updateAtom(a.id, { face: own, ...margin });
    }
    for (const b of [...src.bonds.values()]) {
      const w = bondWidths(from, b), mine: Partial<Bond> = {};
      if (b.boldWidth === undefined && differs(from.boldWidth, to.boldWidth)) mine.boldWidth = w.boldWidth;
      if (b.hashSpacing === undefined && differs(from.hashSpacing, to.hashSpacing)) mine.hashSpacing = w.hashSpacing;
      if (b.marginWidth === undefined && differs(from.marginWidth, to.marginWidth)) mine.marginWidth = w.marginWidth;
      if (Object.keys(mine).length) src.updateBond(b.id, mine);
    }
  });
  const L = typicalBondLength(src);
  const k = bondLength && L ? bondLength / L : 1;
  const ka = (k * from.labelSize) / to.labelSize, kb = (k * from.lineWidth) / to.lineWidth;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  if (near(k, 1) && near(ka, 1) && near(kb, 1) && near(from.captionSize, to.captionSize)) return;
  const at = (p: Vec): Vec => ({ x: p.x * k, y: p.y * k });
  const rel = (s: number | undefined, f: number) => (near((s ?? 1) * f, 1) ? undefined : (s ?? 1) * f);
  const run = (r: TextRun): TextRun => {
    const size = (r.size ?? from.captionSize) * k;
    const out: TextRun = { ...r, size };
    if (Math.abs(size - to.captionSize) < 0.01) delete out.size;
    return out;
  };
  const len = (v: number | undefined) => (v === undefined ? undefined : v * k);
  const line = (w: number) => (Math.abs(w - to.lineWidth) < 1e-3 ? undefined : w);
  src.bulk(() => {
    for (const a of [...src.atoms.values()]) src.updateAtom(a.id, { ...at(a), s: rel(a.s, ka), ...(a.marginWidth !== undefined ? { marginWidth: a.marginWidth * k } : {}) });
    for (const b of [...src.bonds.values()]) src.updateBond(b.id, { s: rel(b.s, kb), ...scaleOwnWidths(b, k) });
    for (const c of [...src.captions.values()]) {
      src.updateCaption(c.id, {
        ...at(c), runs: c.runs.map(run), width: len(c.width), wrap: len(c.wrap), lineHeight: len(c.lineHeight), boxH: len(c.boxH),
        paras: c.paras?.map((p) => ({ ...p, spaceBefore: len(p.spaceBefore), spaceAfter: len(p.spaceAfter), indent: len(p.indent) })),
      });
    }
    for (const r of [...src.arrows.values()]) {
      src.updateArrow(r.id, {
        tail: at(r.tail), head: at(r.head), headLength: r.headLength * k, headWidth: r.headWidth * k,
        shaftSpacing: len(r.shaftSpacing), lineWidth: line((r.lineWidth ?? from.lineWidth) * k),
      });
    }
    for (const s of [...src.shapes.values()]) {
      const p1 = at({ x: s.x1, y: s.y1 }), p2 = at({ x: s.x2, y: s.y2 });
      src.updateShape(s.id, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, radius: len(s.radius), shadowSize: len(s.shadowSize) });
    }
  });
  src.style = { ...to };
}
