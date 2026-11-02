// A Smart Scheme's own look, set from the gear on its species list: the font and sizes of its
// text (the species typed as text, and the conditions on its arrows), its arrows (line width,
// head and shortest length) and its spacing (arrow to species, arrow to text). Kept on the
// scheme's frame, so species and conditions added later take the same look, and the scheme is
// laid out with its own spacing each time. Anything not set follows the drawing style.

import type { Arrow, Doc, TextRun } from '../model';
import type { SchemePrefs } from './scheme-layout';
import { prefsOf, SPACING } from './scheme-layout';

export interface SmartFormat {
  /** Font of the species typed as text and of the conditions. */
  font?: string;
  /** Size of the species typed as text, in points. */
  speciesSize?: number;
  /** Size of the conditions above, below and beside the arrows, in points. */
  textSize?: number;
  /** Arrow line width, in points. */
  arrowWidth?: number;
  headType?: Arrow['headType'];
  /** Arrowhead length, in points (its width follows). */
  headLength?: number;
  /** Shortest arrow (in a line, rows, snake or down the page), in points. */
  arrowLength?: number;
  /** Between an arrow's ends and the species. */
  structGap?: number;
  /** Between an arrow and its conditions. */
  textGap?: number;
}

const NUMS = ['speciesSize', 'textSize', 'arrowWidth', 'headLength', 'arrowLength', 'structGap', 'textGap'] as const;
const HEADS = new Set(['solid', 'hollow', 'angle']);

/** A scheme format from a file: only what makes sense, or undefined when nothing is set. */
export function cleanFormat(raw: unknown): SmartFormat | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: SmartFormat = {};
  if (typeof r.font === 'string' && r.font.trim() && r.font.length < 120) out.font = r.font.trim();
  for (const k of NUMS) {
    const v = r[k];
    if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 500) out[k] = v;
  }
  if (typeof r.headType === 'string' && HEADS.has(r.headType)) out.headType = r.headType as Arrow['headType'];
  return Object.keys(out).length ? out : undefined;
}

/** The scheme settings this format changes (its spacing), over the drawing's own. */
export function formatPrefs(doc: Doc, f: SmartFormat | undefined): SchemePrefs | null {
  if (!f || f.structGap === undefined && f.textGap === undefined && f.arrowLength === undefined) return null;
  return {
    ...prefsOf(doc),
    ...(f.structGap !== undefined ? { structGap: f.structGap } : {}),
    ...(f.textGap !== undefined ? { textGap: f.textGap } : {}),
    ...(f.arrowLength !== undefined ? { arrowLength: f.arrowLength } : {}),
  };
}

/** Runs in this font and size (sub- and superscripts keep their own scaling, made from the size). */
export function styledRuns(runs: TextRun[], font: string | undefined, size: number | undefined): TextRun[] {
  if (font === undefined && size === undefined) return runs;
  return runs.map((r) => ({ ...r, ...(font !== undefined ? { font } : {}), ...(size !== undefined ? { size } : {}) }));
}

const same = (a: TextRun[], b: TextRun[]) => a.length === b.length && a.every((r, i) => r.font === b[i].font && r.size === b[i].size);

/** The scheme's text and arrows as its format asks: species text, conditions, and every arrow in its frame. Call inside an edit. */
export function restyleSmart(
  doc: Doc,
  frameId: number,
  f: SmartFormat | undefined,
  parts: { species: number[]; conditions: number[] },
): void {
  if (!f) return;
  const fr = doc.shapes.get(frameId)?.frame;
  if (!fr) return;
  const text = (ids: number[], size: number | undefined) => {
    for (const id of ids) {
      const c = doc.captions.get(id);
      if (!c) continue;
      const runs = styledRuns(c.runs, f.font, size);
      if (!same(runs, c.runs)) doc.updateCaption(id, { runs });
    }
  };
  text(parts.species, f.speciesSize);
  text(parts.conditions, f.textSize);
  for (const id of fr.arrows) {
    const r = doc.arrows.get(id);
    if (!r) continue;
    const patch: Partial<Arrow> = {};
    if (f.arrowWidth !== undefined && r.lineWidth !== f.arrowWidth) patch.lineWidth = f.arrowWidth;
    if (f.headType && r.headType !== f.headType) patch.headType = f.headType;
    if (f.headLength !== undefined && r.headLength !== f.headLength) {
      // the head keeps its shape: its width goes with its length
      patch.headLength = f.headLength;
      patch.headWidth = r.headLength > 0 ? r.headWidth * (f.headLength / r.headLength) : f.headLength / 4;
    }
    if (Object.keys(patch).length) doc.updateArrow(id, patch);
  }
}

/** What the format window shows when nothing is set: the drawing's own values. */
export function formatDefaults(doc: Doc): Required<SmartFormat> {
  const st = doc.style;
  const p = prefsOf(doc);
  const L = st.bondLength;
  return {
    font: st.captionFont,
    speciesSize: st.captionSize,
    textSize: st.arrowTextSize ?? p.textSize ?? st.captionSize,
    arrowWidth: st.lineWidth,
    headType: 'solid',
    headLength: Math.round(st.lineWidth * 10 * 10) / 10,
    arrowLength: Math.round((p.arrowLength ?? SPACING.minArrow * L) * 10) / 10,
    structGap: Math.round((p.structGap ?? SPACING.gap * L) * 10) / 10,
    textGap: Math.round((p.textGap ?? SPACING.conditions * L) * 10) / 10,
  };
}
