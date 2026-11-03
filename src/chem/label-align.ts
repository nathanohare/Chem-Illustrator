// An atom label's alignment, as one choice (Style panel ▸ Label alignment, and the text Align
// commands with labels selected): Auto, Left, Center or Right. ChemDraw's Above and Below are the
// one Center choice here: the label stacked on the atom, toward its open side.

import type { Atom, Doc } from '../model';

export type LabelAlign = 'auto' | 'left' | 'center' | 'right';

/** How the label lines up now. Left is a label that runs to the right of the atom (OMe). */
export function labelAlignment(a: Atom): LabelAlign {
  if (a.stacked || a.centred) return 'center';
  return a.just === 'right' ? 'left' : a.just === 'left' ? 'right' : 'auto';
}

/** The change to an atom that lines its label up this way. */
export function labelAlignPatch(doc: Doc, a: Atom, v: LabelAlign): Partial<Atom> {
  const plain = { centred: undefined, stacked: undefined };
  if (v === 'auto') return { just: 'auto', ...plain };
  if (v === 'left') return { just: 'right', ...plain };
  if (v === 'right') return { just: 'left', ...plain };
  // stacked away from the bonds: below an atom whose bonds go up (an N at a ring's foot), else above
  let dy = 0;
  for (const n of doc.neighbors(a.id)) dy += n.y - a.y;
  return { just: 'auto', centred: true, stacked: dy < -1e-6 ? 'down' : dy > 1e-6 ? 'up' : 'down' };
}
