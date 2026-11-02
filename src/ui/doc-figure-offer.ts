// Opening a document whose structures aren't figures yet: a bar over the pages offers to make
// them figures. Make Figures shows first how they would be grouped (structures side by side in
// one line make one figure), each figure's area drawn on the page: drag its edges or corners
// to change it, or click its label to leave it out. Nothing changes until Make Figures.

import type { Rect } from '../geom';
import type { DocFile } from '../document/doc-file';
import { emptyContents, objectOffsets, type DocObject, type DocText, type FigureFrame } from '../document/document';
import { figures } from '../document/doc-file';
import { turnOf } from '../document/arrange';
import { structureDoc } from '../sheet/structure-doc';
import { paraAt } from '../text/paragraphs';
import * as rt from '../richtext';
import type { DocView } from './doc-view';

/** One figure to be: the structures in it (in the text's order) and its area on the page (the document's points). */
export interface Proposal { ids: number[]; rect: Rect; page: number; on: boolean; /** Its area can't be smaller than its structures. */ min: Rect }

/** Room left round structures in a new figure, in points. */
const PAD = 6;

/** Structures (not figures, tables or diagrams) that could be made figures, in the text's order. */
export function plainStructures(t: DocText): number[] {
  const at = objectOffsets(t.runs);
  return [...at.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id).filter((id) => {
    const o = t.objects[id];
    if (o?.kind !== 'drawing' || o.frame || turnOf(o) || emptyContents(o.contents)) return false;
    const c = o.contents;
    // tables and diagrams are kept as they are
    if (!c.atoms.length && !c.arrows.length && c.shapes.every((s) => s.kind === 'table' || s.diagram)) return false;
    return true;
  });
}

/** How the structures would be grouped into figures: one figure for structures side by side in one line (with only spaces between). */
export function proposeFigures(f: DocFile): Proposal[] {
  const t = f.t;
  const lay = f.layout();
  const at = objectOffsets(t.runs);
  const text = rt.plainText(t.runs);
  const out: Proposal[] = [];
  let last: { id: number; end: number; para: number; scale: number } | null = null;
  for (const id of plainStructures(t)) {
    const o = t.objects[id] as Extract<DocObject, { kind: 'drawing' }>;
    const placed = lay.objects.find((x) => x.id === id);
    const off = at.get(id);
    if (!placed || off === undefined) { last = null; continue; }
    const r = { x1: placed.x, y1: placed.y, x2: placed.x + placed.w, y2: placed.y + placed.h };
    const own = figures.size(o.contents, t.drawingStyle);
    const scale = placed.w / Math.max(1e-6, own.w);
    const para = paraAt(text, off);
    const prev = out[out.length - 1];
    const besides = last && prev && !o.float && !(t.objects[last.id] as { float?: unknown }).float && last.para === para
      && prev.page === placed.page && Math.abs(scale / last.scale - 1) < 0.02 && !text.slice(last.end, off).trim();
    if (besides) {
      prev.ids.push(id);
      prev.min = union(prev.min, r);
      prev.rect = pad(prev.min);
    } else out.push({ ids: [id], rect: pad(r), min: r, page: placed.page, on: true });
    last = { id, end: off + 1, para, scale };
  }
  return out;
}

const union = (a: Rect, b: Rect): Rect => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) });
const pad = (r: Rect): Rect => ({ x1: r.x1 - PAD, y1: r.y1 - PAD, x2: r.x2 + PAD, y2: r.y2 + PAD });
const round = (x: number) => Math.round(x * 100) / 100;

/**
 * The document with the proposals taken (one step to undo): each a figure with its area, its
 * structures where they were on the page. Structures grouped together become one drawing, in
 * the first one's place; the others leave the text.
 */
export async function makeFigures(f: DocFile, ps: Proposal[]): Promise<DocText> {
  const t = f.t;
  const lay = f.layout();
  const style = t.drawingStyle;
  const objects = { ...t.objects };
  const gone: number[] = [];
  const { insertDrawing } = await import('../io/clipboard');
  for (const p of ps) {
    if (!p.on || !p.ids.length) continue;
    const first = objects[p.ids[0]];
    const placed = lay.objects.find((x) => x.id === p.ids[0]);
    const box = first?.kind === 'drawing' ? figures.record(first.contents, style).pic?.box : null;
    if (first?.kind !== 'drawing' || !placed || !box) continue;
    // drawing points to the page's
    const k = placed.w / Math.max(1e-6, box.x2 - box.x1);
    let contents = first.contents;
    if (p.ids.length > 1) {
      // the others in the first one's drawing, where they are beside it on the page
      const d = structureDoc(first.contents, style);
      for (const id of p.ids.slice(1)) {
        const o = objects[id];
        const pl = lay.objects.find((x) => x.id === id);
        if (o?.kind !== 'drawing' || !pl) continue;
        const centre = { x: box.x1 + (pl.x + pl.w / 2 - placed.x) / k, y: box.y1 + (pl.y + pl.h / 2 - placed.y) / k };
        insertDrawing(d, structureDoc(o.contents, style), centre, 'Make figure');
        gone.push(id);
      }
      contents = d.contents();
    }
    const r = p.rect;
    const frame: FigureFrame = { x: round(box.x1 + (r.x1 - placed.x) / k), y: round(box.y1 + (r.y1 - placed.y) / k), w: round((r.x2 - r.x1) / k), h: round((r.y2 - r.y1) / k) };
    const next: DocObject = { ...first, contents, frame };
    // a floating one keeps its structures where they are: it starts where its area does
    if (first.float) next.float = { ...first.float, x: round(first.float.x + r.x1 - placed.x), y: round(first.float.y + r.y1 - placed.y) };
    objects[p.ids[0]] = next;
  }
  // the structures now in another's figure leave the text, with the spaces before them (last first, so the places stay right)
  let runs = t.runs;
  const at = objectOffsets(runs);
  const text = rt.plainText(runs);
  for (const id of gone.sort((a, b) => (at.get(b) ?? 0) - (at.get(a) ?? 0))) {
    const off = at.get(id);
    if (off === undefined) continue;
    let from = off;
    while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--;
    runs = rt.replaceRange(runs, from, off + 1, []);
    delete objects[id];
  }
  return { ...t, runs, objects };
}

/**
 * The bar over the pages and the preview on them. `apply` puts the document in (one step to
 * undo); `redraw` paints the pages again.
 */
export class FigureOffer {
  private bar: HTMLDivElement;
  private proposals: Proposal[] | null = null;
  private file: DocFile | null = null;
  /** A figure's edges being dragged. */
  private drag: { i: number; l: boolean; t: boolean; r: boolean; b: boolean; from: { x: number; y: number }; rect: Rect } | null = null;
  /** Files already offered (once each). */
  private offered = new WeakSet<DocFile>();

  constructor(pane: HTMLElement, private hooks: { view(): DocView; apply(t: DocText, kind: string): void; redraw(): void; flash(msg: string): void }) {
    this.bar = document.createElement('div');
    this.bar.className = 'figure-offer';
    this.bar.setAttribute('role', 'status');
    this.bar.hidden = true;
    pane.append(this.bar);
  }

  /** Previewing: the pages take no other clicks. */
  get previewing(): boolean { return !!this.proposals; }

  /** A file opened: offer once when it has structures that aren't figures. */
  opened(f: DocFile): void {
    if (this.offered.has(f)) return;
    this.offered.add(f);
    const n = plainStructures(f.t).length;
    if (!n) return;
    this.file = f;
    this.show(`${n === 1 ? 'A structure in this document isn\'t a figure' : `${n} structures in this document aren't figures`}. A figure keeps its area on the page, so drawing in it never moves the text round it.`, [
      ['Preview Figures…', () => this.preview(f), true],
      ['Not Now', () => this.close(), false],
    ]);
  }

  /** Make Figures (from the menu): the preview straight away. */
  start(f: DocFile): void {
    if (!plainStructures(f.t).length) { this.hooks.flash('Every structure here is a figure already (or there are none).'); return; }
    this.preview(f);
  }

  /** Leave the file (another tab, or it closed): the bar and preview go. */
  leave(): void { this.close(); }

  private preview(f: DocFile): void {
    this.file = f;
    this.proposals = proposeFigures(f);
    this.paint();
    const n = this.proposals.length;
    this.show(`${n === 1 ? 'One figure' : `${n} figures`}, as shown. Drag a figure's edges or corners to change its area; click its label to leave it out or put it back.`, [
      ['Make Figures', () => void this.accept(), true],
      ['Cancel', () => this.close(), false],
    ]);
  }

  private async accept(): Promise<void> {
    const f = this.file, ps = this.proposals;
    if (!f || !ps) return;
    const n = ps.filter((p) => p.on).length;
    const t = await makeFigures(f, ps);
    this.close();
    if (n) this.hooks.apply(t, n === 1 ? 'Make figure' : 'Make figures');
  }

  private close(): void {
    this.proposals = null;
    this.drag = null;
    this.bar.hidden = true;
    this.paint();
  }

  private show(text: string, buttons: [string, () => void, boolean][]): void {
    this.bar.replaceChildren();
    const span = document.createElement('span');
    span.textContent = text;
    this.bar.append(span);
    for (const [label, run, primary] of buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (primary) b.className = 'primary';
      b.addEventListener('click', run);
      this.bar.append(b);
    }
    this.bar.hidden = false;
  }

  /** The preview on the pages (each view draws it over everything). */
  private paint(): void {
    const v = this.hooks.view();
    v.proposals = this.proposals?.map((p, i) => ({ rect: p.rect, on: p.on, label: `Figure ${i + 1}${p.ids.length > 1 ? ` · ${p.ids.length} structures` : ''}` })) ?? null;
    this.hooks.redraw();
  }

  /** Which edges of which figure are under a point (the document's points), or its label. */
  private hit(p: { x: number; y: number }): { i: number; l: boolean; t: boolean; r: boolean; b: boolean; label: boolean } | null {
    const ps = this.proposals;
    if (!ps) return null;
    const m = 5 / this.hooks.view().zoom;
    for (let i = ps.length - 1; i >= 0; i--) {
      const r = ps[i].rect;
      const lbl = this.hooks.view().proposalLabel(i);
      if (lbl && p.x >= lbl.x1 && p.x <= lbl.x2 && p.y >= lbl.y1 && p.y <= lbl.y2) return { i, l: false, t: false, r: false, b: false, label: true };
      if (p.x < r.x1 - m || p.x > r.x2 + m || p.y < r.y1 - m || p.y > r.y2 + m) continue;
      const e = { l: Math.abs(p.x - r.x1) <= m, t: Math.abs(p.y - r.y1) <= m, r: Math.abs(p.x - r.x2) <= m, b: Math.abs(p.y - r.y2) <= m };
      if (e.l || e.t || e.r || e.b) return { i, ...e, label: false };
    }
    return null;
  }

  /** The pointer over the pages while previewing: the cursor for what a drag would do. */
  hover(p: { x: number; y: number }): string {
    const h = this.hit(p);
    if (!h) return 'default';
    if (h.label) return 'pointer';
    if ((h.l && h.t) || (h.r && h.b)) return 'nwse-resize';
    if ((h.r && h.t) || (h.l && h.b)) return 'nesw-resize';
    return h.l || h.r ? 'ew-resize' : 'ns-resize';
  }

  /** A press while previewing: an edge starts a drag, a label leaves its figure out (or puts it back). True when it was taken. */
  down(p: { x: number; y: number }): boolean {
    const h = this.hit(p);
    if (!h) return true;
    const ps = this.proposals!;
    if (h.label) { ps[h.i].on = !ps[h.i].on; this.paint(); return true; }
    this.drag = { i: h.i, l: h.l, t: h.t, r: h.r, b: h.b, from: p, rect: { ...ps[h.i].rect } };
    return true;
  }

  move(p: { x: number; y: number }): void {
    const d = this.drag, ps = this.proposals;
    if (!d || !ps) return;
    const pr = ps[d.i];
    const dx = p.x - d.from.x, dy = p.y - d.from.y;
    const r = { ...d.rect };
    // never smaller than the structures in it
    if (d.l) r.x1 = Math.min(pr.min.x1, d.rect.x1 + dx);
    if (d.r) r.x2 = Math.max(pr.min.x2, d.rect.x2 + dx);
    if (d.t) r.y1 = Math.min(pr.min.y1, d.rect.y1 + dy);
    if (d.b) r.y2 = Math.max(pr.min.y2, d.rect.y2 + dy);
    pr.rect = r;
    this.paint();
  }

  up(): void { this.drag = null; }
}
