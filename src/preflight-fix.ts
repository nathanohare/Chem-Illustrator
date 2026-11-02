// Putting a figure preflight's findings right (see preflight.ts): text that would print too small
// is made just big enough, lines too thin just thick enough, and text in fonts the journal does
// not take is changed to Arial. Findings are places on the drawing (with the size of the text or
// line found there), so each fix works out which captions, atom labels, arrows and shapes those
// places belong to. Each is one undo step. (Make It Fit scales the drawing in the editor.)

import type { Doc, TextRun } from './model';
import type { Rect } from './geom';
import type { PreflightFix, PreflightIssue, PreflightResult } from './preflight';

export interface FixContext {
  /** Where a caption's text is drawn. */
  captionBox(id: number): Rect;
  /** Where a shape is drawn. */
  shapeBox(id: number): Rect;
}

const overlaps = (a: Rect, b: Rect) => a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
const grow = (r: Rect, d: number): Rect => ({ x1: r.x1 - d, y1: r.y1 - d, x2: r.x2 + d, y2: r.y2 + d });
const round2 = (v: number) => Math.ceil(v * 100) / 100;

/** The biggest factor the places inside `box` need (want ÷ the size there), or 1. */
function needIn(box: Rect, where: Rect[], sizes: number[], want: number): number {
  let f = 1;
  where.forEach((r, i) => { if (sizes[i] > 0 && overlaps(r, box)) f = Math.max(f, want / sizes[i]); });
  return f;
}

/** Runs made bigger by `f` (runs with no size take `base` first). */
const bigger = (runs: TextRun[], f: number, base: number): TextRun[] => runs.map((r) => ({ ...r, size: round2((r.size ?? base) * f) }));

/** Enlarge the text a finding found too small. True when anything changed. */
export function enlargeText(doc: Doc, issue: PreflightIssue, ctx: FixContext): boolean {
  const where = issue.where ?? [], sizes = issue.sizes ?? [], want = issue.want ?? 0;
  if (!where.length || !(want > 0)) return false;
  let changed = false;
  const used = new Set<number>();
  doc.edit('Enlarge small text', () => {
    for (const c of [...doc.captions.values()]) {
      if (c.hidden) continue;
      const box = ctx.captionBox(c.id);
      const f = needIn(box, where, sizes, want);
      if (f <= 1.0001) continue;
      where.forEach((r, i) => { if (overlaps(r, box)) used.add(i); });
      doc.updateCaption(c.id, { runs: bigger(c.runs, f, doc.style.captionSize) });
      changed = true;
    }
    for (const s of [...doc.shapes.values()]) {
      if (!s.text?.runs.length || s.hidden || s.locked) continue;
      const box = ctx.shapeBox(s.id);
      const f = needIn(box, where, sizes, want);
      if (f <= 1.0001) continue;
      where.forEach((r, i) => { if (overlaps(r, box)) used.add(i); });
      doc.updateShape(s.id, { text: { ...s.text, runs: bigger(s.text.runs, f, doc.style.captionSize) } });
      changed = true;
    }
    // what is left over the structures is their atom labels: the drawing's label size grows
    let f = 1;
    where.forEach((r, i) => {
      if (used.has(i) || !(sizes[i] > 0)) return;
      if (doc.atomsIn(grow(r, 1)).length) f = Math.max(f, want / sizes[i]);
    });
    if (f > 1.0001) {
      doc.setStyle({ ...doc.style, labelSize: round2(doc.style.labelSize * f) });
      changed = true;
    }
  });
  return changed;
}

/** Thicken the lines a finding found too thin. True when anything changed. */
export function thickenLines(doc: Doc, issue: PreflightIssue, ctx: FixContext): boolean {
  const where = issue.where ?? [], sizes = issue.sizes ?? [], want = issue.want ?? 0;
  if (!where.length || !(want > 0)) return false;
  let changed = false;
  doc.edit('Thicken thin lines', () => {
    const used = new Set<number>();
    for (const a of [...doc.arrows.values()]) {
      const pts = [a.tail, a.head];
      const box = grow({ x1: Math.min(...pts.map((p) => p.x)), y1: Math.min(...pts.map((p) => p.y)), x2: Math.max(...pts.map((p) => p.x)), y2: Math.max(...pts.map((p) => p.y)) }, a.headWidth + 2);
      const w = a.lineWidth ?? doc.style.lineWidth;
      const hit = where.some((r, i) => { const h = overlaps(r, box) && sizes[i] < want; if (h) used.add(i); return h; });
      if (hit && w < want) { doc.updateArrow(a.id, { lineWidth: round2(want) }); changed = true; }
    }
    for (const s of [...doc.shapes.values()]) {
      if (s.hidden || s.locked || s.lineWidth === 0) continue;
      const box = grow(ctx.shapeBox(s.id), 1);
      const hit = where.some((r, i) => { const h = overlaps(r, box) && sizes[i] < want; if (h) used.add(i); return h; });
      const w = s.lineWidth ?? doc.style.lineWidth;
      if (hit && w < want) { doc.updateShape(s.id, { lineWidth: round2(want) }); changed = true; }
    }
    // the rest are the structures' bonds: the drawing's line width grows
    let f = 1;
    where.forEach((r, i) => {
      if (!(sizes[i] > 0)) return;
      if (!used.has(i) && doc.atomsIn(grow(r, 1)).length) f = Math.max(f, want / sizes[i]);
    });
    if (f > 1.0001 && [...doc.bonds.keys()].length) {
      doc.setStyle({ ...doc.style, lineWidth: round2(doc.style.lineWidth * f) });
      changed = true;
    }
  });
  return changed;
}

/** Change text in the fonts named to Arial (captions, shapes' text, and the drawing's label and caption fonts). */
export function useArial(doc: Doc, fonts: string[]): boolean {
  const off = new Set(fonts.map((f) => f.trim().toLowerCase()));
  const bad = (f: string | undefined) => !!f && off.has(f.trim().toLowerCase());
  let changed = false;
  doc.edit('Change fonts to Arial', () => {
    const fixRuns = (runs: TextRun[]) => runs.some((r) => bad(r.font)) ? runs.map((r) => (bad(r.font) ? { ...r, font: 'Arial' } : r)) : null;
    for (const c of [...doc.captions.values()]) {
      const runs = fixRuns(c.runs);
      if (runs) { doc.updateCaption(c.id, { runs }); changed = true; }
    }
    for (const s of [...doc.shapes.values()]) {
      const runs = s.text ? fixRuns(s.text.runs) : null;
      if (runs) { doc.updateShape(s.id, { text: { ...s.text!, runs } }); changed = true; }
    }
    const st = doc.style;
    if (bad(st.labelFont) || bad(st.captionFont)) {
      doc.setStyle({ ...st, labelFont: bad(st.labelFont) ? 'Arial' : st.labelFont, captionFont: bad(st.captionFont) ? 'Arial' : st.captionFont });
      changed = true;
    }
  });
  return changed;
}

/**
 * Put a finding right, then check again and go on while the same kind of finding is still there
 * (at most `passes` times): one fix can undo another's work by a hair (a caption made bigger
 * widens the figure, which the journal then shrinks, lines and all), and a figure whose captions
 * keep their size needs more than one scaling to fit. True when anything changed.
 */
export function fixUntilDone(first: PreflightIssue, apply: (issue: PreflightIssue) => boolean, check: () => PreflightResult | null, passes = 4): boolean {
  const kind: PreflightFix | undefined = first.fix;
  let issue: PreflightIssue | undefined = first;
  let any = false;
  for (let n = 0; n < passes && issue; n++) {
    if (!apply(issue)) break;
    any = true;
    issue = check()?.issues.find((i) => i.fix === kind && (i.level === 'error' || i.level === 'warning'));
  }
  return any;
}
