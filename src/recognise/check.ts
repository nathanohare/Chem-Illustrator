// Each structure read from a picture as a drawing of its own, checked by the chemistry engine
// (RDKit) before it is offered: ones it can't read, ones with groups the app doesn't know, and ones
// the reader was unsure of are marked for a closer look on the review screen.

import { Doc } from '../model';
import type { DocStyle } from '../style';
import { addMolfile, toMolfile } from '../chem/molfile';
import { addRead } from './to-drawing';
import type { ReadResult } from './reader';

/** Below this the reader's own confidence marks a structure as doubtful (on test pictures, most below it were wrong). */
export const SURE = 0.6;
/** An atom read with less certainty than this is marked too. */
const ATOM_SURE = 0.5;

export interface Checked {
  /** The structure on a drawing of its own (empty when nothing was read). */
  doc: Doc;
  /** Canonical SMILES, or null when the chemistry engine can't read it. */
  smiles: string | null;
  /** Why to look closely; empty when nothing looks wrong. */
  problems: string[];
  /** An AI model's SMILES as a molfile (for placeRead). */
  molblock: string | null;
}

export interface Engine {
  smilesToMol(smiles: string): Promise<string | null>;
  molToSmiles(molblock: string, loose?: boolean): Promise<string | null>;
}

/** Put what was read on a drawing at (cx, cy), inside an edit; `molblock` is the AI model's answer as a molfile. Returns the new atoms. */
export function placeRead(doc: Doc, r: ReadResult, molblock: string | null, cx: number, cy: number): number[] {
  if (r.kind === 'graph') return addRead(doc, r.graph, r.w, r.h, cx, cy).ids;
  return molblock ? addMolfile(doc, molblock, cx, cy) : [];
}

export async function checkRead(r: ReadResult, style: DocStyle, chem: Engine): Promise<Checked> {
  const doc = new Doc();
  doc.style = { ...style };
  let placed: { ids: number[]; problems: string[] } = { ids: [], problems: [] };
  const pending = r.kind === 'smiles' && r.smiles ? await chem.smilesToMol(r.smiles) : null;
  doc.edit('Read', () => {
    if (r.kind === 'graph') placed = addRead(doc, r.graph, r.w, r.h, 0, 0);
    else if (pending) placed = { ids: addMolfile(doc, pending, 0, 0), problems: [] };
  });
  const problems = [...placed.problems];
  if (r.kind === 'smiles') {
    if (!r.smiles) problems.push('No structure was found in the picture.');
    else if (!pending) problems.push(`The AI model's answer (${r.smiles}) isn't SMILES the chemistry engine can read.`);
    if (r.note) problems.push('The AI model says: ' + r.note);
  } else {
    if (!r.graph.symbols.length) problems.push('No structure was found in the picture.');
    else {
      if (r.graph.confidence < SURE) problems.push(`The reader is unsure of this one (${Math.round(r.graph.confidence * 100)}% sure).`);
      const shaky = r.graph.symbols.filter((_, i) => (r.graph.atomScores[i] ?? 1) < ATOM_SURE);
      if (shaky.length && r.graph.confidence >= SURE) problems.push(`Some atoms were hard to read: ${[...new Set(shaky.map((s) => s.replace(/^\[|\]$/g, '')))].join(', ')}.`);
    }
  }
  let smiles: string | null = null;
  if (placed.ids.length) {
    const ex = toMolfile(doc, placed.ids);
    if (ex.unknownLabels.length) problems.push(`Groups the app doesn't know: ${[...new Set(ex.unknownLabels)].join(', ')}.`);
    smiles = await chem.molToSmiles(ex.molblock);
    if (!smiles) problems.push('The chemistry engine can\'t read it as drawn (most often an atom with too many bonds).');
  }
  return { doc, smiles, problems, molblock: pending };
}
