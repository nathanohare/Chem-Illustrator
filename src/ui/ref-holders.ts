// The open files that keep references, as the References window sees them: a document (its
// citations and bibliography use them) and a presentation or design (its slides' reference lines
// and References slide use them). Each change goes through the file's own history (one undo step).

import type { DocFile } from '../document/doc-file';
import type { DocText } from '../document/document';
import type { Deck } from '../deck/deck';
import { citeCounts, citationWarning, citeSuper, type Reference } from '../document/references';
import { citeFormat } from '../document/cite-styles';
import type { RefHolder } from './references-dialog';

const times = (n: number) => (n === 1 ? 'once' : `${n} times`);

/** A document's references. `changed`: after each change (the unsaved mark). */
export function docHolder(key: string, name: string, file: DocFile, changed: () => void): RefHolder {
  return {
    key, name, kind: 'Document',
    refs: () => file.t.references ?? [],
    setRefs: (label, refs) => { file.ed.update({ ...file.t, references: refs } as DocText, label); changed(); },
    citeStyle: () => file.t.citeStyle,
    citeOptions: () => file.t.citeOptions,
    // citations go up into superscript or down onto the line as the style has them
    setStyle: (style, options) => {
      const t = file.t;
      const sup = citeSuper(citeFormat(style, options));
      const runs = t.runs.map((r) => (r.obj !== undefined && t.objects[r.obj]?.kind === 'cite' && !!r.sup !== sup ? { ...r, sup: sup || undefined, sub: undefined } : r));
      file.ed.update({ ...t, runs, citeStyle: style, citeOptions: Object.keys(options).length ? options : undefined } as DocText, 'Citation style');
      changed();
    },
    uses: () => citeCounts(file.t),
    useText: (n) => (n ? `cited ${times(n)}` : 'not cited'),
    deleteNote: (n) => `${n === 1 ? 'a citation of it shows' : `${n} citations of them show`} [?] (or leave it out), and the bibliography leaves it out.`,
    warning: () => citationWarning(file.t),
    manager: {
      get: () => file.t.citeManager,
      set: (app) => { file.ed.update({ ...file.t, citeManager: app } as DocText, 'Save citations for'); changed(); },
    },
  };
}

/** How many slides show each reference (a References slide doesn't count). */
export function slideUses(deck: Deck): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of deck.slides) for (const id of new Set(s.refs ?? [])) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** A presentation's or design's references. */
export function deckHolder(key: string, name: string, deck: Deck, design: boolean, changed: () => void): RefHolder {
  const cur = () => deck.settings.refs ?? { list: [] as Reference[] };
  return {
    key, name, kind: design ? 'Design' : 'Presentation',
    refs: () => deck.references,
    setRefs: (label, refs) => { deck.setRefs({ ...cur(), list: refs }, label); changed(); },
    citeStyle: () => deck.settings.refs?.style,
    citeOptions: () => deck.settings.refs?.options,
    setStyle: (style, options) => {
      const next = { ...cur(), style, ...(Object.keys(options).length ? { options } : {}) };
      if (!Object.keys(options).length) delete next.options;
      deck.setRefs(next, 'Citation style');
      changed();
    },
    uses: () => slideUses(deck),
    useText: (n) => (n ? `on ${n} slide${n === 1 ? '' : 's'}` : design ? 'not shown' : 'on no slide'),
    deleteNote: (n) => `its lines come off the ${n === 1 ? 'slide' : `${n} slides`} that show ${n === 1 ? 'it' : 'them'}.`,
  };
}
