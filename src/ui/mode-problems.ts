// The Problems box in Presentation, Spreadsheet, Document and Design (the Canvas has its own, which
// lists the problems on the drawing and goes to each): the same structure checks, run on every
// structure in the file (each slide, each drawing in the document, each structure in a cell), and
// what they find listed with where it is. Grayed out when the file has no structures.

import { StructureChecks } from '../chem/warnings';
import type { Doc } from '../model';

/** One of the file's drawings, and where it is ("Slide 3", "Sheet1!B4", "Drawing 2"). */
export interface PlacedDrawing {
  where: string;
  doc: Doc;
}

/** A problem found, with where it is and how many times it comes up there. */
export interface PlacedProblem {
  where: string;
  text: string;
  count: number;
}

export interface FileProblems {
  /** How many of the drawings have structures (atoms) in them. */
  structures: number;
  problems: PlacedProblem[];
}

/** Each drawing's checks, kept while the drawing is (a slide's, so a second look only redoes what changed). */
const kept = new WeakMap<Doc, StructureChecks>();

/** Run the structure checks on each drawing; the same problem in one place is one row, with a count. */
export function checkDrawings(list: readonly PlacedDrawing[]): FileProblems {
  let structures = 0;
  const problems: PlacedProblem[] = [];
  for (const { where, doc } of list) {
    if (!doc.atoms.size) continue;
    structures++;
    let checks = kept.get(doc);
    if (!checks) kept.set(doc, (checks = new StructureChecks(doc)));
    checks.update();
    const rows = new Map<string, PlacedProblem>();
    for (const w of checks.list()) {
      const text = w.text.join(' ');
      const row = rows.get(text);
      if (row) row.count++;
      else rows.set(text, { where, text, count: 1 });
    }
    problems.push(...rows.values());
  }
  return { structures, problems };
}

/** How many problems there are in all (each time one comes up counts). */
export const problemCount = (p: FileProblems): number => p.problems.reduce((n, x) => n + x.count, 0);
