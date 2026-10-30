// The References window (References > Manage References, Insert > References…): the reference
// lists of every open document and presentation, each file in a group of its own (as SI
// Assistant's References page, for each file): add by DOI (filled in from Crossref), by hand, or
// from a BibTeX or RIS file or pasted text; edit, delete, how much each is used, and copy
// references from one file to another. The citation style (ACS, Angewandte, RSC and the other
// common chemistry styles), and any of its details, are chosen here too, for the file picked.
// Every change is one step of Undo in its file.
//
// Also here: the window that edits one reference (every value can be changed, and the
// bibliography's text for it typed over, with Reset to go back to the automatic text), and
// References > Insert Citation's list to choose references from.

import type { DocText } from '../document/document';
import { CITE_PRESETS, changedOptions, citeFormat, preferredStyle, setPreferredStyle, type CiteFormat } from '../document/cite-styles';
import {
  REF_TYPES, bibLabel, citeSuper, citeText, blankRef, citationNumbers, cleanRef, describe, fetchDoi, findDuplicate,
  formatReference, newRefId, newReferences, normaliseDoi, parseReferenceText, piecesText, shortLabel,
  type CiteStyle, type Piece, type Reference,
} from '../document/references';
import { ask } from './ask';
import { MANAGERS, type CiteManager } from '../document/live-cites';
import { mergeReferences } from '../deck/slide-refs';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

const button = (label: string, title: string, on: () => void, primary = false): HTMLButtonElement => {
  const b = el('button', { type: 'button', textContent: label, title });
  if (primary) b.className = 'primary';
  b.addEventListener('click', on);
  return b;
};

/** Show pieces of text with their italics and bold. */
function showPieces(into: HTMLElement, ps: Piece[]): void {
  into.replaceChildren(...ps.map((p) => {
    if (!p.italic && !p.bold) return document.createTextNode(p.text);
    let n: HTMLElement = el('span', { textContent: p.text });
    if (p.italic) n = el('i', {}, n);
    if (p.bold) n = el('b', {}, n);
    return n;
  }));
}

/** A modal window that closes itself and is removed; resolves with `done`'s value or null. */
function modal<T>(cls: string, build: (d: HTMLDialogElement, done: (v: T | null) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    const d = el('dialog', { className: cls });
    let finished = false;
    const done = (v: T | null) => {
      if (finished) return;
      finished = true;
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    d.addEventListener('close', () => done(null));
    // keys typed here are for the window, not the document behind it
    d.addEventListener('keydown', (e) => e.stopPropagation());
    build(d, done);
    document.body.append(d);
    d.showModal();
    const first = d.querySelector<HTMLElement>('[autofocus]');
    first?.focus();
    // a list typed in a box starts at its top
    if (first instanceof HTMLTextAreaElement) { first.setSelectionRange(0, 0); first.scrollTop = 0; }
  });
}

// ---------------------------------------------------------------- one reference

/**
 * Edit one reference (or check one filled in from Crossref). Every value can be changed; the
 * bibliography's text can be typed over, and Reset puts the automatic text back.
 */
export function editReference(start: Reference, title: string, style: CiteStyle | CiteFormat, lookup: (doi: string) => Promise<Reference>): Promise<Reference | null> {
  return modal<Reference>('ref-edit', (d, done) => {
    const form = el('form');
    form.append(el('h2', { textContent: title }));
    const inputs = new Map<keyof Reference, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
    const row = (label: string, input: HTMLElement, extra?: HTMLElement, tip?: string) => {
      const l = el('label', { className: 'ask-row ref-row' }, el('span', { textContent: label }), input);
      if (extra) l.append(extra);
      if (tip) l.title = tip;
      form.append(l);
    };
    const type = el('select');
    for (const [k, v] of Object.entries(REF_TYPES)) type.add(new Option(v, k, false, k === start.type));
    inputs.set('type', type);
    row('Type', type);
    const authors = el('textarea', { rows: 4, value: start.authors.join('\n'), placeholder: 'One per line, last name first:\nFulmer, Gregory R.\nMiller, Alexander J. M.' });
    authors.setAttribute('autofocus', '');
    inputs.set('authors', authors);
    row('Authors', authors, undefined, 'One author per line, as "Last, First" (initials are worked out). A name without a comma, such as a group, is printed as typed.');
    const text = (key: keyof Reference, label: string, placeholder = '', tip?: string, extra?: HTMLElement) => {
      const i = el('input', { type: 'text', value: String(start[key] ?? ''), placeholder });
      i.spellcheck = false;
      inputs.set(key, i);
      row(label, i, extra, tip);
      return i;
    };
    text('title', 'Title');
    text('journal', 'Journal or book', 'e.g. Org. Lett. (abbreviated)', 'Printed as typed, so use the abbreviation (J. Org. Chem.). For a chapter, the book\'s title.');
    text('year', 'Year', '2024');
    text('volume', 'Volume');
    text('issue', 'Issue');
    text('pages', 'Pages', 'e.g. 2176–2179 or e202401234', 'A hyphen between page numbers becomes an en dash.');
    const status = el('p', { className: 'ref-status muted small' });
    const fill = button('Fill in from Crossref', 'Look this DOI up online and fill in the other boxes', () => void lookupNow());
    const doi = text('doi', 'DOI', '10.1021/…', undefined, fill);
    text('url', 'Web address');
    text('publisher', 'Publisher', 'for books; a thesis\'s university');
    text('note', 'Note', 'anything else to print after it');
    form.append(status);

    // the bibliography's text: automatic, or typed over
    form.append(el('h3', { textContent: 'In the bibliography' }));
    const preview = el('p', { className: 'ref-preview' });
    const own = el('input', { type: 'checkbox', checked: start.typed !== undefined });
    const typed = el('textarea', { rows: 3, value: start.typed ?? '' });
    const reset = button('Reset to Automatic', 'Go back to the text worked out from the boxes above', () => { own.checked = false; sync(); });
    const ownRow = el('label', { className: 'ref-own' }, own, el('span', { textContent: 'Type my own text for this reference (it replaces the automatic text, in every style)' }));
    form.append(preview, ownRow, typed, el('div', { className: 'ref-reset' }, reset));
    const value = (): Reference => {
      const r: Record<string, unknown> = { ...start };
      for (const [k, i] of inputs) r[k] = k === 'authors' ? i.value.split('\n') : i.value;
      r.typed = own.checked ? typed.value : undefined;
      const out = cleanRef(r as Partial<Reference>);
      if (!own.checked) delete out.typed;
      return out;
    };
    const sync = () => {
      const auto = formatReference(value(), style);
      showPieces(preview, auto);
      preview.classList.toggle('replaced', own.checked);
      typed.hidden = !own.checked;
      reset.disabled = !own.checked;
      if (own.checked && !typed.value.trim()) typed.value = piecesText(auto);
    };
    own.addEventListener('change', () => { sync(); if (own.checked) typed.focus(); });
    form.addEventListener('input', () => sync());
    sync();

    const lookupNow = async () => {
      status.textContent = 'Looking the DOI up on Crossref…';
      fill.disabled = true;
      try {
        const got = await lookup(doi.value);
        type.value = got.type;
        authors.value = got.authors.join('\n');
        for (const k of ['title', 'journal', 'year', 'volume', 'issue', 'pages', 'doi', 'url', 'publisher'] as const) if (got[k]) inputs.get(k)!.value = got[k];
        status.textContent = 'Filled in from Crossref: check the details, then OK.';
        sync();
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
      } finally {
        fill.disabled = false;
      }
    };

    const buttons = el('p', { className: 'ask-buttons' }, button('Cancel', '', () => done(null)), el('button', { type: 'submit', className: 'primary', textContent: 'OK' }));
    form.append(buttons);
    form.addEventListener('submit', (e) => { e.preventDefault(); done(value()); });
    d.append(form);
  });
}

// ---------------------------------------------------------------- choosing references to cite

/**
 * References > Insert Citation: tick one or more references (they become one citation, such as
 * 3,5–7). `manage` opens the reference list (to add one) and gives the list as it is after.
 */
export function chooseReferences(t: DocText, chosen: string[], manage: () => Promise<DocText | null>): Promise<string[] | null> {
  return modal<string[]>('cite-pick', (d, done) => {
    let doc = t;
    const ticked: string[] = chosen.filter((id) => doc.references?.some((r) => r.id === id));
    const search = el('input', { type: 'search', placeholder: 'Find by author, title, journal, year or DOI' });
    search.setAttribute('aria-label', 'Find a reference');
    search.setAttribute('autofocus', '');
    const list = el('div', { className: 'cite-list', role: 'listbox' });
    list.setAttribute('aria-multiselectable', 'true');
    const empty = el('p', { className: 'muted' });
    const fillList = () => {
      const q = search.value.trim().toLowerCase();
      const numbers = citationNumbers(doc);
      const refs = (doc.references ?? []).filter((r) => !q || `${describe(r)} ${r.authors.join(' ')} ${r.doi}`.toLowerCase().includes(q));
      list.replaceChildren(...refs.map((r) => {
        const box = el('input', { type: 'checkbox', checked: ticked.includes(r.id) });
        box.addEventListener('change', () => {
          const k = ticked.indexOf(r.id);
          if (box.checked && k < 0) ticked.push(r.id);
          if (!box.checked && k >= 0) ticked.splice(k, 1);
          ok.disabled = !ticked.length;
        });
        const n = numbers.get(r.id);
        return el('label', { className: 'cite-row' }, box, el('span', { className: 'cite-num', textContent: n ? String(n) : '' }), el('span', { textContent: describe(r) }));
      }));
      empty.textContent = !doc.references?.length ? 'There are no references yet: Manage References… adds them (by DOI, by hand, or from a BibTeX or RIS file).'
        : !refs.length ? 'No reference matches.' : '';
    };
    search.addEventListener('input', fillList);
    const ok = el('button', { type: 'submit', className: 'primary', textContent: 'Insert' });
    ok.disabled = !ticked.length;
    const form = el('form', {},
      el('h2', { textContent: 'Insert Citation' }),
      el('p', { className: 'muted', textContent: 'Tick one or more references: they make one citation (3,5–7). References are numbered in order of first citation, and the numbers change by themselves when text moves. The number shown is the one each has now.' }),
      search, list, empty,
      el('p', { className: 'ask-buttons' },
        button('Manage References…', 'Add, edit or import references', async () => {
          const next = await manage();
          if (next) { doc = next; fillList(); }
        }),
        el('span', { className: 'spacer' }),
        button('Cancel', '', () => done(null)), ok));
    form.addEventListener('submit', (e) => { e.preventDefault(); if (ticked.length) done([...ticked]); });
    d.append(form);
    fillList();
  });
}

// ---------------------------------------------------------------- the style and its details

type Control = { key: keyof CiteFormat; label: string; title?: string } & (
  | { kind: 'check' }
  | { kind: 'count' }
  | { kind: 'select'; options: [string, string][] });

/** Every detail of a style, in groups, as the Style options window shows them. */
const STYLE_GROUPS: [string, Control[]][] = [
  ['In the text', [
    { key: 'cite', label: 'Citation numbers', kind: 'select', options: [['super', 'Superscript ¹⁻³'], ['super-square', 'Superscript in brackets ^[1–3]'], ['square', '[1–3] on the line'], ['round', '(1–3) on the line']] },
    { key: 'ranges', label: 'Runs as ranges (1–3, not 1,2,3)', kind: 'check' },
  ]],
  ['The list', [
    { key: 'label', label: 'Number before each entry', kind: 'select', options: [['(n)', '(1)'], ['[n]', '[1]'], ['n.', '1.'], ['n', '1']] },
  ]],
  ['Authors', [
    { key: 'familyFirst', label: 'Order', kind: 'select', options: [['true', 'Fulmer, G. R.'], ['false', 'G. R. Fulmer']] },
    { key: 'initials', label: 'Initials', kind: 'select', options: [['G. R.', 'G. R.'], ['G.R.', 'G.R.'], ['GR', 'GR']] },
    { key: 'authorSep', label: 'Between authors', kind: 'select', options: [['; ', 'Semicolon ( ; )'], [', ', 'Comma ( , )']] },
    { key: 'lastAuthor', label: 'Before the last author', kind: 'select', options: [['none', 'Nothing'], ['and', '"and"'], ['&', '"&"']] },
    { key: 'etAlOver', label: 'Use "et al." above (0: never)', kind: 'count', title: 'With more authors than this, only the first few are listed, then "et al."' },
    { key: 'etAlShow', label: 'Authors listed before "et al."', kind: 'count' },
    { key: 'afterAuthors', label: 'After the authors', kind: 'select', options: [['. ', 'Full stop'], [', ', 'Comma']] },
  ]],
  ['Journal articles', [
    { key: 'title', label: 'Article title', kind: 'check' },
    { key: 'titleQuotes', label: 'Title in quotation marks', kind: 'check' },
    { key: 'afterTitle', label: 'After the title', kind: 'select', options: [['. ', 'Full stop'], [', ', 'Comma']] },
    { key: 'journalItalic', label: 'Journal in italics', kind: 'check' },
    { key: 'yearAt', label: 'Year', kind: 'select', options: [['journal', 'After the journal: Org. Lett. 2024, 26'], ['volume', 'After the volume: Org. Lett. 26 (2024)'], ['end', 'At the end: … 1234–1240 (2024)']] },
    { key: 'yearBold', label: 'Year in bold', kind: 'check' },
    { key: 'journalComma', label: 'Comma after the journal', kind: 'check' },
    { key: 'volume', label: 'Volume', kind: 'select', options: [['italic', 'Italic'], ['bold', 'Bold'], ['plain', 'Plain']] },
    { key: 'issue', label: 'Issue number', kind: 'check' },
    { key: 'firstPageOnly', label: 'First page only', kind: 'check' },
    { key: 'articleNumber', label: 'Article numbers', kind: 'check', title: 'Print an article number (pages without a range, such as e202301234). Off: the DOI is given instead.' },
    { key: 'doi', label: 'DOI', kind: 'select', options: [['no-pages', 'Only without pages'], ['always', 'Always'], ['never', 'Never']] },
    { key: 'doiSep', label: 'Before the DOI', kind: 'select', options: [['. ', 'Full stop'], [', ', 'Comma']] },
    { key: 'doiForm', label: 'DOI written as', kind: 'select', options: [['DOI: ', 'DOI: 10.…'], ['DOI ', 'DOI 10.…'], ['doi:', 'doi:10.…'], ['https://doi.org/', 'https://doi.org/10.…']] },
  ]],
  ['Theses', [
    { key: 'thesisWord', label: 'Called', kind: 'select', options: [['Ph.D. Thesis', 'Ph.D. Thesis'], ['PhD thesis', 'PhD thesis']] },
    { key: 'thesisYearBrackets', label: 'Year in brackets', kind: 'check' },
  ]],
];

/** Real references the preview shows each style with. */
const SAMPLES: Reference[] = [
  { ...blankRef('article', 's1'), authors: ['Fulmer, Gregory R.', 'Miller, Alexander J. M.', 'Sherden, Nathaniel H.', 'Gottlieb, Hugo E.', 'Nudelman, Abraham', 'Stoltz, Brian M.', 'Bercaw, John E.', 'Goldberg, Karen I.'], title: 'NMR Chemical Shifts of Trace Impurities: Common Laboratory Solvents, Organics, and Gases in Deuterated Solvents Relevant to the Organometallic Chemist', journal: 'Organometallics', year: '2010', volume: '29', issue: '9', pages: '2176–2179', doi: '10.1021/om100106e' },
  { ...blankRef('article', 's2'), authors: ['Gottlieb, Hugo E.', 'Kotlyar, Vadim', 'Nudelman, Abraham'], title: 'NMR Chemical Shifts of Common Laboratory Solvents as Trace Impurities', journal: 'J. Org. Chem.', year: '1997', volume: '62', issue: '21', pages: '7512–7515', doi: '10.1021/jo971176v' },
  { ...blankRef('book', 's3'), authors: ['Clayden, Jonathan', 'Greeves, Nick', 'Warren, Stuart'], title: 'Organic Chemistry', year: '2012', publisher: 'Oxford University Press' },
];

export interface StyleChoice { style: string; options: Partial<CiteFormat>; forNew: boolean }

/**
 * References > Manage References > Style options: a style from the list, and any of its
 * details changed, with a preview of real references as they will print.
 */
export function editCiteStyle(style: string, options: Partial<CiteFormat>): Promise<StyleChoice | null> {
  return modal<StyleChoice>('cite-style-dialog', (d, done) => {
    let cur = style in CITE_PRESETS ? style : Object.keys(CITE_PRESETS)[0];
    let f: CiteFormat = citeFormat(cur, options);
    const pick = el('select');
    for (const [k, p] of Object.entries(CITE_PRESETS)) pick.add(new Option(`${p.name} (${p.journals})`, k));
    pick.value = cur;
    const source = el('p', { className: 'muted cite-source' });
    const preview = el('div', { className: 'cite-preview' });
    const inputs = new Map<keyof CiteFormat, HTMLInputElement | HTMLSelectElement>();
    const groups = STYLE_GROUPS.map(([name, ctls]) => el('fieldset', {}, el('legend', { textContent: name }), ...ctls.map((c) => {
      let input: HTMLInputElement | HTMLSelectElement;
      if (c.kind === 'check') input = el('input', { type: 'checkbox' });
      else if (c.kind === 'count') input = el('input', { type: 'number', min: '0', max: '100', step: '1' });
      else {
        input = el('select');
        for (const [v, l] of c.options) input.add(new Option(l, v));
      }
      inputs.set(c.key, input);
      input.addEventListener(c.kind === 'count' ? 'input' : 'change', () => {
        const v = c.kind === 'check' ? (input as HTMLInputElement).checked
          : c.kind === 'count' ? Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)))
            : input.value === 'true' ? true : input.value === 'false' ? false : input.value;
        f = { ...f, [c.key]: v };
        show(false);
      });
      const row = el('label', { className: c.kind === 'check' ? 'cite-check' : 'cite-row', title: c.title ?? '' });
      if (c.kind === 'check') row.append(input, el('span', { textContent: c.label }));
      else row.append(el('span', { textContent: c.label }), input);
      return row;
    })));
    const show = (setInputs = true) => {
      const base = citeFormat(cur);
      for (const [k, input] of inputs) {
        if (setInputs) {
          if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = !!f[k];
          else input.value = String(f[k]);
        }
        // a detail changed from the style's own is marked, so it's clear what Reset puts back
        input.closest('label')?.classList.toggle('changed', f[k] !== base[k]);
      }
      const p = CITE_PRESETS[cur];
      source.textContent = `Follows ${p.source}.`;
      const cite = el('p', {}, 'In the text: …as reported before', citeSuper(f) ? el('sup', { textContent: citeText([1, 2, 3], f) }) : ` ${citeText([1, 2, 3], f)}`, '.');
      preview.replaceChildren(cite, ...SAMPLES.map((r, i) => {
        const line = el('p', { className: 'cite-entry' });
        showPieces(line, formatReference(r, f));
        line.prepend(el('span', { className: 'cite-label', textContent: bibLabel(i + 1, f) }));
        return line;
      }));
      reset.disabled = !Object.keys(changedOptions(cur, f)).length;
      reset.textContent = `Reset to ${p.name}`;
    };
    pick.addEventListener('change', () => { cur = pick.value; f = citeFormat(cur, {}); show(); });
    const reset = button('Reset', 'Put every detail back as the style has it', () => { f = citeFormat(cur, {}); show(); });
    const forNew = el('input', { type: 'checkbox' });
    d.append(
      el('h2', { textContent: 'Reference style' }),
      el('label', { className: 'ask-row refs-style' }, el('span', { textContent: 'Style' }), pick),
      source,
      el('p', { className: 'muted', textContent: 'Change any detail below; the preview shows real references as they will print. Choosing another style starts from that style\'s own details.' }),
      el('div', { className: 'cite-groups' }, ...groups),
      el('h3', { textContent: 'Preview' }),
      preview,
      el('div', { className: 'refs-buttons' },
        el('span', {}, reset, el('label', { className: 'cite-check', title: 'Kept in settings.json. Documents that already have a style keep theirs.' }, forNew, el('span', { textContent: 'Use for new documents' }))),
        el('span', {}, button('Cancel', '', () => done(null)), button('OK', '', () => done({ style: cur, options: changedOptions(cur, f), forNew: forNew.checked }), true))),
    );
    pick.autofocus = true;
    show();
  });
}

// ---------------------------------------------------------------- the list

/**
 * A file that keeps references: a document (its citations and bibliography use them) or a
 * presentation or design (its slides' reference lines use them). The References window shows
 * every open file's list, each in a group of its own.
 */
export interface RefHolder {
  /** The same while the file is open (its tab's id). */
  key: string;
  /** The file's name, on its group. */
  name: string;
  /** What kind of file it is ("Document", "Presentation", "Design"). */
  kind: string;
  refs(): Reference[];
  /** Change the list as one undo step in that file. */
  setRefs(label: string, refs: Reference[]): void;
  /** The style chosen for this file, if one has been. */
  citeStyle(): CiteStyle | undefined;
  citeOptions(): Partial<CiteFormat> | undefined;
  /** Use a style with some of its details changed (one undo step). */
  setStyle(style: string, options: Partial<CiteFormat>): void;
  /** How much each reference is used: cited (documents) or shown on slides (presentations). */
  uses(): Map<string, number>;
  /** "cited 2 times", "on 1 slide", "not cited". */
  useText(n: number): string;
  /** Deleting a used reference: what happens to its uses. */
  deleteNote(n: number): string;
  /** A warning about the file's references (citations of deleted ones). */
  warning?(): string | null;
  /** Documents: which reference manager the citations are saved for in the Word file. */
  manager?: { get(): CiteManager | undefined; set(app: CiteManager | undefined): void };
}

export interface ReferencesHost {
  /** The open files that keep references, the one showing first. */
  holders(): RefHolder[];
  /** The key of the file showing (null when it keeps no references: a canvas or a spreadsheet). */
  current(): string | null;
  /** What the file showing is, when it keeps no references (for a hint). */
  currentKind?(): string;
  flash(msg: string, ms?: number): void;
  /** Choose a BibTeX or RIS file and read its text; null when cancelled. */
  pickFile(): Promise<{ name: string; text: string } | null>;
  /** Look a DOI up (Crossref); throws with a message to show. */
  lookup?(doi: string): Promise<Reference>;
  /** The person chose a style for new documents (settings.json). */
  preferredChanged?(): void;
}

/** References copied in the window (Ctrl+C), kept while the app is open to paste into another file's group. */
let copied: Reference[] = [];

/** Rows are picked by their file and their reference: "key\u0000id". */
const rowKey = (holder: string, id: string) => `${holder}\u0000${id}`;
const splitKey = (k: string) => { const i = k.indexOf('\u0000'); return { holder: k.slice(0, i), id: k.slice(i + 1) }; };

/**
 * The References window (References > Manage References in a document, Insert > References…
 * anywhere): the references of every open file that keeps them, grouped by file, the file
 * showing first. Add, edit and delete in any group; copy references from one file to another
 * (Copy To, drag a row onto another file's name, or Ctrl+C and Ctrl+V); each copy is the file's
 * own, and a reference a file has already (the same DOI, or title and year) is not added twice.
 */
export class ReferencesDialog {
  private d: HTMLDialogElement | null = null;
  private body!: HTMLTableSectionElement;
  private warning!: HTMLElement;
  private styleSel!: HTMLSelectElement;
  private styleNote!: HTMLElement;
  private managerSel!: HTMLSelectElement;
  private managerRow!: HTMLElement;
  private groupLabel!: HTMLElement;
  private copyTo!: HTMLSelectElement;
  private search!: HTMLInputElement;
  private hint!: HTMLElement;
  /** The rows picked (rowKey). */
  private selected = new Set<string>();
  private anchor: string | null = null;
  /** The file whose group is being worked on (adds go there; its style is shown). */
  private group: string | null = null;
  private folded = new Set<string>();
  private closed: (() => void) | null = null;

  constructor(private host: ReferencesHost) {}

  private holder(key = this.group): RefHolder | null {
    const all = this.host.holders();
    return all.find((h) => h.key === key) ?? null;
  }

  private lookup = (doi: string): Promise<Reference> => (this.host.lookup ?? ((x: string) => fetchDoi(x)))(doi);

  private setRefs(h: RefHolder, kind: string, refs: Reference[]): void {
    h.setRefs(kind, refs);
    this.fill();
  }

  get isOpen(): boolean { return !!this.d; }

  /** Show the window on a file's group (the one showing by default), with a reference picked; resolves when it is closed. */
  open(select: string | null = null, group: string | null = null): Promise<void> {
    if (this.d) {
      this.fill();
      return Promise.resolve();
    }
    this.group = group ?? this.host.current() ?? this.host.holders()[0]?.key ?? null;
    this.selected.clear();
    if (select && this.group) this.selected.add(rowKey(this.group, select));
    this.anchor = [...this.selected][0] ?? null;
    const d = (this.d = el('dialog', { className: 'refs-dialog' }));
    d.setAttribute('aria-label', 'References');
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Delete' && this.selected.size) { e.preventDefault(); void this.remove(); }
      else if (e.key === 'Enter' && this.selected.size) { e.preventDefault(); void this.edit(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.step(e.key === 'ArrowDown' ? 1 : -1, e.shiftKey); }
      else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(); }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); this.pickAll(); }
    });
    this.styleSel = el('select', { id: 'refs-style' });
    for (const [k, p] of Object.entries(CITE_PRESETS)) this.styleSel.add(new Option(`${p.name} (${p.journals})`, k));
    this.styleSel.addEventListener('change', () => this.setStyle(this.styleSel.value, {}));
    this.styleNote = el('span', { className: 'muted' });
    this.managerSel = el('select', { id: 'refs-manager' });
    this.managerSel.add(new Option('Chem Illustrator only (numbers Word shows as they are)', ''));
    for (const [k, name] of Object.entries(MANAGERS)) this.managerSel.add(new Option(name, k));
    this.managerSel.addEventListener('change', () => {
      const h = this.holder();
      if (!h?.manager) return;
      const app = (this.managerSel.value || undefined) as CiteManager | undefined;
      h.manager.set(app);
      this.fill();
      if (app) this.host.flash(`Citations are saved as ${MANAGERS[app]} citations: in Word, ${app === 'endnote' ? 'EndNote\'s Update Citations and Bibliography' : app === 'zotero' ? 'Zotero\'s Refresh' : 'Mendeley\'s refresh'} works on them, and they open here live again.`, 7000);
    });
    this.search = el('input', { type: 'search', placeholder: 'Find a reference in any file' });
    this.search.setAttribute('aria-label', 'Find a reference');
    this.search.addEventListener('input', () => this.fill());
    this.warning = el('p', { className: 'refs-warning', role: 'status' });
    this.hint = el('p', { className: 'muted refs-hint' });
    this.groupLabel = el('strong');
    this.copyTo = el('select', { title: 'Copy the references picked into another open file (each file keeps its own copy)' });
    this.copyTo.setAttribute('aria-label', 'Copy to');
    this.copyTo.addEventListener('change', () => { const to = this.copyTo.value; this.copyTo.value = ''; if (to) this.copyInto(to, this.pickedRefs()); });
    this.body = el('tbody');
    const table = el('table', { className: 'refs-table' },
      el('thead', {}, el('tr', {}, ...['Reference', 'Journal or book', 'Title', 'Used'].map((h) => el('th', { textContent: h })))), this.body);
    this.body.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr) return;
      if (tr.dataset.group) { this.toggleGroup(tr.dataset.group); return; }
      if (tr.dataset.holder && tr.dataset.id) this.pick(rowKey(tr.dataset.holder, tr.dataset.id), e.ctrlKey || e.metaKey, e.shiftKey);
    });
    this.body.addEventListener('dblclick', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (tr?.dataset.holder && tr.dataset.id) { this.pick(rowKey(tr.dataset.holder, tr.dataset.id), false, false); void this.edit(); }
    });
    // drag references onto another file's name to copy them there
    this.body.addEventListener('dragstart', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr?.dataset.holder || !tr.dataset.id) return;
      const k = rowKey(tr.dataset.holder, tr.dataset.id);
      if (!this.selected.has(k)) this.pick(k, false, false);
      e.dataTransfer?.setData('application/x-chemillustrator-refs', '1');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    this.body.addEventListener('dragover', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr?.dataset.group || !e.dataTransfer?.types.includes('application/x-chemillustrator-refs')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      tr.classList.add('drop');
    });
    this.body.addEventListener('dragleave', (e) => (e.target as HTMLElement).closest('tr')?.classList.remove('drop'));
    this.body.addEventListener('drop', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      tr?.classList.remove('drop');
      if (!tr?.dataset.group || !e.dataTransfer?.types.includes('application/x-chemillustrator-refs')) return;
      e.preventDefault();
      this.copyInto(tr.dataset.group, this.pickedRefs());
    });
    d.append(
      el('div', { className: 'refs-head' }, el('h2', { textContent: 'References' }), this.search),
      el('p', { className: 'muted', textContent: 'The references of every open file, each file in its own group. A document cites them (References > Insert Citation); a presentation shows them at the foot of its slides (Insert > Slides > References on Slide). Copy references between files with Copy To, by dragging them onto a file\'s name, or with Ctrl+C and Ctrl+V: each file keeps its own copy.' }),
      this.hint,
      el('div', { className: 'ask-row refs-style' }, el('label', { htmlFor: 'refs-style', textContent: 'Citation style' }), this.styleSel,
        button('Style Options…', 'Change any detail of the style: authors, "and", et al., title, year, volume, issue, article numbers, DOI…', () => void this.styleOptions())),
      el('p', { className: 'refs-style-note' }, el('span', { textContent: 'For ' }), this.groupLabel, el('span', { textContent: '. ' }), this.styleNote),
      (this.managerRow = el('div', { className: 'ask-row refs-style', title: 'How citations are saved in the Word file: as this program\'s own fields, or as Zotero\'s, Mendeley\'s or EndNote\'s, so that program can go on managing them in Word. Files from those programs open with their citations live and choose this for you.' },
        el('label', { htmlFor: 'refs-manager', textContent: 'Save citations for' }), this.managerSel)),
      this.warning,
      el('div', { className: 'refs-table-wrap' }, table),
      el('div', { className: 'refs-buttons' },
        el('span', { className: 'refs-add' },
          button('Add by DOI…', 'Paste a DOI; the details are filled in from Crossref (needs the internet)', () => void this.addByDoi()),
          button('Add by Hand…', 'Type the details in', () => void this.addByHand()),
          button('Import BibTeX / RIS…', 'A file exported from Zotero, EndNote, Mendeley, or a journal\'s "Export citation"', () => void this.importFile()),
          button('Paste BibTeX / RIS…', 'Paste the text of BibTeX or RIS references', () => void this.pasteText())),
        el('span', { className: 'refs-edit' },
          this.copyTo,
          button('Edit…', 'Change the reference picked (or double-click it)', () => void this.edit()),
          button('Delete…', 'Delete the references picked', () => void this.remove()),
          button('Close', '', () => d.close(), true))),
    );
    d.addEventListener('close', () => { d.remove(); this.d = null; this.closed?.(); this.closed = null; });
    document.body.append(d);
    this.fill();
    d.showModal();
    this.search.focus();
    return new Promise((resolve) => { this.closed = resolve; });
  }

  /** Fill the window again (after any change, here or in a file). */
  fill(): void {
    if (!this.d) return;
    const holders = this.host.holders();
    if (!holders.some((h) => h.key === this.group)) this.group = this.host.current() ?? holders[0]?.key ?? null;
    const known = new Set(holders.flatMap((h) => h.refs().map((r) => rowKey(h.key, r.id))));
    for (const k of [...this.selected]) if (!known.has(k)) this.selected.delete(k);
    const h = this.holder();
    const style = this.style();
    this.styleSel.value = style;
    this.styleSel.disabled = !h;
    this.groupLabel.textContent = h ? h.name : 'no file';
    const changed = h ? Object.keys(changedOptions(style, this.format())).length : 0;
    this.styleNote.textContent = changed ? `${changed} detail${changed === 1 ? '' : 's'} changed from ${CITE_PRESETS[style].name} (Style Options… to see or reset them).` : '';
    // (a grid row: hidden by its display, which the hidden attribute doesn't change)
    this.managerRow.style.display = h?.manager ? '' : 'none';
    this.managerSel.value = h?.manager?.get() ?? '';
    const cur = this.host.current();
    this.hint.textContent = !holders.length
      ? 'No open file keeps references yet. Open or make a document or a presentation to add references to it.'
      : !cur ? `${this.host.currentKind?.() ?? 'This file'} keeps no reference list of its own: Insert > Reference… puts any of these on it as formatted text.` : '';
    this.hint.hidden = !this.hint.textContent;
    const q = this.search.value.trim().toLowerCase();
    const rows: HTMLTableRowElement[] = [];
    for (const g of holders) {
      const all = g.refs();
      const refs = all.filter((r) => !q || `${describe(r)} ${r.authors.join(' ')} ${r.doi}`.toLowerCase().includes(q));
      const fold = this.folded.has(g.key) && !q;
      const head = el('tr', { className: 'refs-group' + (g.key === this.group ? ' current' : '') },
        el('th', { colSpan: 4, textContent: `${fold ? '▸' : '▾'} ${g.name}  ·  ${g.kind}${g.key === cur ? ' (showing)' : ''}  ·  ${all.length} reference${all.length === 1 ? '' : 's'}` }));
      head.dataset.group = g.key;
      head.title = fold ? 'Click to show this file\'s references' : 'Click to fold this file\'s references away (and to add to this file)';
      rows.push(head);
      if (fold) continue;
      const uses = g.uses();
      for (const r of refs) {
        const n = uses.get(r.id) ?? 0;
        const tr = el('tr', { draggable: true },
          el('td', { textContent: shortLabel(r) + (r.typed !== undefined ? ' ✎' : '') }),
          el('td', { textContent: [r.journal || r.publisher, r.year].filter(Boolean).join(' ') }),
          el('td', { textContent: r.title }),
          el('td', { textContent: g.useText(n) }));
        tr.dataset.holder = g.key;
        tr.dataset.id = r.id;
        tr.title = describe(r) + (r.typed !== undefined ? '\n(Its bibliography text was typed over: Edit… to change it or reset it.)' : '');
        if (this.selected.has(rowKey(g.key, r.id))) tr.classList.add('picked');
        if (!n) tr.classList.add('uncited');
        rows.push(tr);
      }
      if (!all.length) rows.push(el('tr', {}, el('td', { colSpan: 4, className: 'muted', textContent: 'No references yet. Add one by DOI, by hand, or from a BibTeX or RIS file, or copy some from another file.' })));
    }
    this.body.replaceChildren(...rows);
    this.body.querySelector('tr.picked')?.scrollIntoView({ block: 'nearest' });
    this.warning.textContent = h?.warning?.() ?? '';
    // Copy To: the other open files
    const others = holders.filter((g) => !this.pickedHolders().has(g.key) || this.pickedHolders().size > 1);
    this.copyTo.replaceChildren(new Option(this.selected.size ? `Copy ${this.selected.size === 1 ? 'it' : `${this.selected.size}`} to…` : 'Copy to…', ''), ...others.map((g) => new Option(g.name, g.key)));
    this.copyTo.disabled = !this.selected.size || !others.length;
  }

  private toggleGroup(key: string): void {
    if (this.group !== key) this.group = key;
    else if (this.folded.has(key)) this.folded.delete(key);
    else this.folded.add(key);
    this.fill();
  }

  /** Pick a row: alone, added to the rows picked (Ctrl), or every row from the last one picked (Shift). */
  private pick(k: string, add: boolean, range: boolean): void {
    const rows = [...this.body.querySelectorAll<HTMLTableRowElement>('tr[data-id]')].map((r) => rowKey(r.dataset.holder!, r.dataset.id!));
    if (range && this.anchor && rows.includes(this.anchor)) {
      const [a, b] = [rows.indexOf(this.anchor), rows.indexOf(k)].sort((x, y) => x - y);
      if (!add) this.selected.clear();
      for (const r of rows.slice(a, b + 1)) this.selected.add(r);
    } else if (add) {
      if (this.selected.has(k)) this.selected.delete(k); else this.selected.add(k);
      this.anchor = k;
    } else {
      this.selected = new Set([k]);
      this.anchor = k;
    }
    this.group = splitKey(k).holder;
    this.fill();
  }

  private pickAll(): void {
    const rows = [...this.body.querySelectorAll<HTMLTableRowElement>('tr[data-id]')].filter((r) => r.dataset.holder === this.group);
    this.selected = new Set(rows.map((r) => rowKey(r.dataset.holder!, r.dataset.id!)));
    this.fill();
  }

  private step(dir: 1 | -1, extend: boolean): void {
    const rows = [...this.body.querySelectorAll<HTMLTableRowElement>('tr[data-id]')].map((r) => rowKey(r.dataset.holder!, r.dataset.id!));
    if (!rows.length) return;
    const last = this.anchor && rows.includes(this.anchor) ? rows.indexOf(this.anchor) : -1;
    const next = rows[Math.max(0, Math.min(rows.length - 1, last < 0 ? 0 : last + dir))];
    if (extend) { this.selected.add(next); this.anchor = next; this.group = splitKey(next).holder; this.fill(); } else this.pick(next, false, false);
  }

  /** The files the rows picked are in. */
  private pickedHolders(): Set<string> {
    return new Set([...this.selected].map((k) => splitKey(k).holder));
  }

  /** The references picked, in the order the window lists them. */
  private pickedRefs(): Reference[] {
    const out: Reference[] = [];
    for (const g of this.host.holders()) for (const r of g.refs()) if (this.selected.has(rowKey(g.key, r.id))) out.push(r);
    return out;
  }

  private current(): { h: RefHolder; r: Reference } | null {
    const k = this.anchor && this.selected.has(this.anchor) ? this.anchor : [...this.selected][0];
    if (!k) return null;
    const { holder, id } = splitKey(k);
    const h = this.holder(holder);
    const r = h?.refs().find((x) => x.id === id);
    return h && r ? { h, r } : null;
  }

  /** Copy the references picked (Ctrl+C), to paste into any file's group. */
  private copy(): void {
    const refs = this.pickedRefs();
    if (!refs.length) { this.host.flash('Click the references to copy first.'); return; }
    copied = structuredClone(refs);
    this.host.flash(`Copied ${refs.length} reference${refs.length === 1 ? '' : 's'}. Click another file's name and press Ctrl+V to paste ${refs.length === 1 ? 'it' : 'them'} there.`, 5000);
  }

  /** Paste references copied (Ctrl+V) into the file whose group is picked. */
  private paste(): void {
    if (!copied.length) { this.host.flash('Copy references first (pick them and press Ctrl+C).'); return; }
    if (this.group) this.copyInto(this.group, copied);
  }

  /** Copies of references into a file's list: those it has already are left as they are. */
  copyInto(key: string, refs: Reference[]): void {
    const h = this.holder(key);
    if (!h || !refs.length) return;
    const { list, added } = mergeReferences(h.refs(), refs);
    if (added.length) h.setRefs(added.length === 1 ? `Copy reference ${shortLabel(added[0])}` : `Copy ${added.length} references`, list);
    const skipped = refs.length - added.length;
    this.group = key;
    this.folded.delete(key);
    this.selected = new Set(added.map((r) => rowKey(key, r.id)));
    this.anchor = [...this.selected][0] ?? null;
    this.fill();
    this.host.flash(added.length
      ? `Copied ${added.length} reference${added.length === 1 ? '' : 's'} into ${h.name}.${skipped ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} there already.` : ''}`
      : `${h.name} has ${refs.length === 1 ? 'this reference' : 'these references'} already.`, 5000);
  }

  /** Add a reference to the file whose group is picked, unless it is there already (then that one is picked). */
  private add(r: Reference): void {
    const h = this.holder();
    if (!h) { this.host.flash('Open or make a document or a presentation to keep references in.'); return; }
    const list = h.refs();
    const dup = findDuplicate(list, r);
    if (dup) {
      this.selected = new Set([rowKey(h.key, dup.id)]);
      this.fill();
      this.host.flash(`This reference is already in ${h.name} (${shortLabel(dup)}).`, 5000);
      return;
    }
    const taken = new Set(list.map((x) => x.id));
    const ref = taken.has(r.id) ? { ...r, id: newRefId(taken) } : r;
    this.selected = new Set([rowKey(h.key, ref.id)]);
    this.anchor = rowKey(h.key, ref.id);
    this.setRefs(h, `Add reference ${shortLabel(ref)}`, [...list, ref]);
  }

  /** The style of the file picked (or, until it has one, the person's own). */
  private style(): CiteStyle {
    const s = this.holder()?.citeStyle();
    return s && s in CITE_PRESETS ? s : preferredStyle().style;
  }

  private format(): CiteFormat {
    const h = this.holder();
    return h?.citeStyle() ? citeFormat(h.citeStyle(), h.citeOptions()) : citeFormat(undefined);
  }

  private setStyle(style: string, options: Partial<CiteFormat>): void {
    const h = this.holder();
    if (!h) return;
    h.setStyle(style, options);
    this.fill();
  }

  private async styleOptions(): Promise<void> {
    const h = this.holder();
    if (!h) return;
    const got = await editCiteStyle(this.style(), h.citeStyle() ? h.citeOptions() ?? {} : preferredStyle().options);
    if (!got) return;
    this.setStyle(got.style, got.options);
    if (got.forNew) {
      setPreferredStyle(got.style, got.options);
      this.host.preferredChanged?.();
      this.host.flash(`New documents and presentations will use ${CITE_PRESETS[got.style].name} style${Object.keys(got.options).length ? ' with your changes' : ''}.`, 4000);
    }
  }

  private async addByDoi(): Promise<void> {
    const h = this.holder();
    if (!h) { this.host.flash('Open or make a document or a presentation to keep references in.'); return; }
    const got = await ask('Add by DOI', [{ name: 'doi', label: 'DOI', value: '' }], {
      ok: 'Look Up', note: `Paste a DOI (10.1021/om100106e) or a doi.org link. The details are filled in from Crossref, which needs the internet; you can check and change them before they are added to ${h.name}.`,
    });
    const doi = got?.doi.trim();
    if (!doi) return;
    let found: Reference;
    try {
      this.host.flash('Looking the DOI up on Crossref…', 3000);
      found = await this.lookup(doi);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const by = await ask('Could not look up the DOI', [], { ok: 'Enter by Hand', note: `${why} Enter the reference by hand instead?` });
      if (by) await this.addByHand({ ...blankRef(), doi: normaliseDoi(doi) });
      return;
    }
    if (findDuplicate(h.refs(), found)) { this.add(found); return; }
    const r = await editReference(found, 'Check the Reference', this.format(), this.lookup);
    if (r) this.add(r);
  }

  private async addByHand(start: Reference = blankRef()): Promise<void> {
    if (!this.holder()) { this.host.flash('Open or make a document or a presentation to keep references in.'); return; }
    const r = await editReference(start, 'New Reference', this.format(), this.lookup);
    if (r) this.add(r);
  }

  private async importFile(): Promise<void> {
    if (!this.holder()) { this.host.flash('Open or make a document or a presentation to keep references in.'); return; }
    let f: { name: string; text: string } | null;
    try {
      f = await this.host.pickFile();
    } catch (e) {
      this.host.flash(`Could not read the file: ${e instanceof Error ? e.message : String(e)}`, 8000);
      return;
    }
    if (f) this.importText(f.text, f.name);
  }

  private async pasteText(): Promise<void> {
    if (!this.holder()) { this.host.flash('Open or make a document or a presentation to keep references in.'); return; }
    const text = await modal<string>('ref-paste', (d, done) => {
      const area = el('textarea', { rows: 14, placeholder: '@article{key,\n  author = {Fulmer, Gregory R. and …},\n  …\n}\n\nor RIS:\nTY  - JOUR\nAU  - Fulmer, Gregory R.\n…\nER  -' });
      area.setAttribute('autofocus', '');
      area.spellcheck = false;
      const form = el('form', {},
        el('h2', { textContent: 'Paste BibTeX or RIS' }),
        el('p', { className: 'muted', textContent: 'Paste references copied from Zotero, EndNote, Mendeley, Google Scholar or a journal\'s "Export citation" (BibTeX or RIS). References already in the list are not added again.' }),
        area,
        el('p', { className: 'ask-buttons' }, button('Cancel', '', () => done(null)), el('button', { type: 'submit', className: 'primary', textContent: 'Import' })));
      form.addEventListener('submit', (e) => { e.preventDefault(); done(area.value); });
      d.append(form);
    });
    if (text?.trim()) this.importText(text, 'the pasted text');
  }

  private importText(text: string, from: string): void {
    const h = this.holder();
    if (!h) return;
    const found = parseReferenceText(text);
    const list = h.refs();
    const added = newReferences(list, found);
    if (added.length) {
      this.selected = new Set(added.map((r) => rowKey(h.key, r.id)));
      this.anchor = rowKey(h.key, added[0].id);
      this.setRefs(h, 'Import references', [...list, ...added]);
    }
    const skipped = found.length - added.length;
    this.host.flash(!found.length ? `No references were found in ${from} (BibTeX or RIS).`
      : `Added ${added.length} reference${added.length === 1 ? '' : 's'} from ${from} to ${h.name}.${skipped ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already in the list.` : ''}`, 6000);
  }

  private async edit(): Promise<void> {
    const cur = this.current();
    if (!cur) { this.host.flash('Click a reference in the list first.'); return; }
    const r = await editReference(cur.r, 'Edit Reference', this.format(), this.lookup);
    if (!r) return;
    this.setRefs(cur.h, `Edit reference ${shortLabel(r)}`, cur.h.refs().map((x) => (x.id === cur.r.id ? { ...r, id: cur.r.id } : x)));
  }

  private async remove(): Promise<void> {
    const picked = [...this.selected].map(splitKey);
    if (!picked.length) { this.host.flash('Click a reference in the list first.'); return; }
    const byFile = new Map<string, Set<string>>();
    for (const p of picked) byFile.set(p.holder, (byFile.get(p.holder) ?? new Set()).add(p.id));
    const notes: string[] = [];
    for (const [key, ids] of byFile) {
      const h = this.holder(key);
      if (!h) continue;
      const uses = h.uses();
      const used = [...ids].reduce((n, id) => n + (uses.get(id) ?? 0), 0);
      if (used) notes.push(`In ${h.name}: ${h.deleteNote(used)}`);
    }
    const one = picked.length === 1 ? this.current() : null;
    const ok = await ask(picked.length === 1 ? 'Delete Reference' : 'Delete References', [], {
      ok: 'Delete',
      note: `Delete ${one ? shortLabel(one.r) : `${picked.length} references`}${byFile.size > 1 ? ` from ${byFile.size} files` : ''}? ${notes.join(' ')} Undo in ${byFile.size > 1 ? 'each file' : 'the file'} brings ${picked.length === 1 ? 'it' : 'them'} back.`,
    });
    if (!ok) return;
    for (const [key, ids] of byFile) {
      const h = this.holder(key);
      if (!h) continue;
      const gone = h.refs().filter((x) => ids.has(x.id));
      h.setRefs(gone.length === 1 ? `Delete reference ${shortLabel(gone[0])}` : `Delete ${gone.length} references`, h.refs().filter((x) => !ids.has(x.id)));
    }
    this.selected.clear();
    this.fill();
  }
}
