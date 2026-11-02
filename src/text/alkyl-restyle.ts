// Giving the alkyl groups already in a drawing the look chosen in Settings ▸ Preferences (t-Bu,
// iPr in italics…): atom labels and the text in text boxes, in one undo step.

import type { Doc, TextRun } from '../model';
import { styleLabel, type AlkylLook } from '../chem/labels';
import * as rt from '../richtext';
import { alkylEdits } from './typing';

/** Runs with an alkyl look given to their text, or null when nothing changes. */
export function restyleRuns(runs: TextRun[], look: AlkylLook): TextRun[] | null {
  const text = rt.plainText(runs);
  const italicAt = (i: number) => !!rt.sliceRuns(runs, i, i + 1)[0]?.italic;
  const edits = alkylEdits(text, italicAt, look);
  if (!edits.length) return null;
  let out = runs;
  for (const e of edits) if (e.italic !== undefined) out = rt.applyStyle(out, e.start, e.end, { italic: e.italic || undefined });
  // dashes put in or taken out from the end backwards, keeping the look of the letter they go with
  for (const e of edits.filter((x) => x.text !== undefined).sort((a, b) => b.start - a.start)) {
    const style = rt.typingStyle(out, e.start, e.end, {});
    out = rt.replaceRange(out, e.start, e.end, [{ ...style, text: e.text! }]);
  }
  return out;
}

/**
 * How many atom labels and text boxes in the drawing an alkyl look would change, and (when
 * `apply`) the change made, as one undo step.
 */
export function restyleAlkyl(doc: Doc, look: AlkylLook, apply: boolean): { labels: number; texts: number } {
  const labels: [number, { label: string; marks?: string }][] = [];
  const texts: [number, TextRun[]][] = [];
  for (const a of doc.atoms.values()) {
    if (!a.label) continue;
    const r = styleLabel(a.label, a.labelMarks, look);
    if (r.label !== a.label || (r.marks ?? '') !== (a.labelMarks ?? '')) labels.push([a.id, r]);
  }
  for (const c of doc.captions.values()) {
    const runs = restyleRuns(c.runs, look);
    if (runs) texts.push([c.id, runs]);
  }
  if (apply && (labels.length || texts.length)) {
    doc.edit('Alkyl Group Look', () => {
      for (const [id, r] of labels) doc.updateAtom(id, { label: r.label, labelMarks: r.marks });
      for (const [id, runs] of texts) doc.updateCaption(id, { runs });
    });
  }
  return { labels: labels.length, texts: texts.length };
}
