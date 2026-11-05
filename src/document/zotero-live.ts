// Citing live with Zotero: Zotero's own citation window adds and changes citations in a document
// here, and Zotero keeps them and the bibliography up to date, as its Word plugin does in Word.
//
// Zotero (the desktop app, version 6 or later) does this for any program through its HTTP
// citing protocol, on this computer only (127.0.0.1, port 23119). The program asks Zotero to
// start a command (add or edit a citation, add or edit the bibliography, refresh, the document's
// preferences, unlink the citations) by posting it to /connector/document/execCommand. Zotero
// answers with what it wants done in the document ("Document.getFields", "Field.setText"…), the
// program does it and posts the result to /connector/document/respond, and Zotero's answer to
// that is the next thing to do, until it sends "Document.complete". The citation window is
// Zotero's own; while it is open, Zotero's answer simply waits.
//
// Here the document's citations and bibliography are Zotero's fields. A citation's code is
// Zotero's CSL citation (ITEM CSL_CITATION {…}), the same JSON its Word fields hold; its items
// become the document's references, linked to Zotero's items as when a Word file with Zotero
// citations is opened. The text Zotero sets is what the citation shows, and Zotero's bibliography
// entries are what the bibliography shows, as long as the citations cite what they did then; a
// citation changed here is worked out here again (in the document's own citation style) until
// Zotero's Refresh. Saving as .docx writes them as Zotero's Word fields, so Zotero's Word plugin
// carries on with the file.
//
// Written from Zotero's description of the protocol and its reference clients (the HTTP
// integration client and the Google Docs plugin's client in Zotero's public repositories), which
// define the commands, their arguments and the answers they expect.

import type { TextRun } from '../model';
import { nextObjectId, OBJECT_CHAR, type DocObject, type DocText } from './document';
import { bibliography, citationTexts, fieldOrder, piecesText, type Piece, type Reference } from './references';
import { placeRef, readCiteField, styleFromCsl, writeCite, zoteroStyleOf, type CiteLive } from './live-cites';

/** Zotero's commands, as its Word plugin's toolbar has them. */
export type ZoteroCommand = 'addEditCitation' | 'addEditBibliography' | 'refresh' | 'setDocPrefs' | 'removeCodes';

/** Where Zotero listens, on this computer. */
export const ZOTERO_PORT = 23119;

/** A post to Zotero's citing endpoints: the status and the body of its answer (throws when Zotero isn't there). */
export type ZoteroPost = (endpoint: 'execCommand' | 'respond', body: string) => Promise<{ status: number; text: string }>;

/** What the citing needs of the open document (doc-mode.ts gives it). */
export interface ZoteroHost {
  /** The document's id for Zotero (the same for as long as it is open). */
  readonly docId: string;
  /** The document as it is now. */
  text(): DocText;
  /** Put a changed document in place. */
  change(t: DocText): void;
  /** Put runs in place of an object's character (none: take it out), in the text or a table's cell. */
  replaceObject(id: number, runs: TextRun[]): void;
  /** The citation or bibliography picked (its object's id), or null. */
  picked(): number | null;
  /** Whether a citation can go where the caret is. */
  canInsert(): boolean;
  /** Put a new object at the caret, in the citation's look (raised when `sup`, as a footnote's number is); its id. */
  insert(o: DocObject, sup?: boolean): number;
  /** Give a bibliography a paragraph of its own. */
  ownParagraph(id: number): void;
  /** Pick an object (select its character). */
  select(id: number): void;
  /** Ask, with these buttons; the index of the one chosen, or -1 when the window was closed. */
  choose(text: string, labels: string[]): Promise<number>;
  /** Bring the window to the front. */
  activate(): void;
}

/** How a command went: done, Zotero busy with another document's command, or Zotero not running. */
export type ZoteroOutcome = 'done' | 'busy' | 'offline';

/** Zotero's field type for programs citing through its HTTP protocol. */
const HTTP_FIELD = 'Http';
/** Word's, as Zotero's Word plugin keeps it in the document's preferences. */
const WORD_FIELD = 'Field';
/** A citation's text while Zotero is putting it in. */
const PLACEHOLDER = '{Citation}';
/** The bibliography's code before Zotero has set one (nothing added or left out by hand). */
const BIBL = 'BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY';

/** Zotero's document preferences with its field type set ("Http" while citing here, "Field" in the file, as Word has it). */
export function withFieldType(prefs: string, type: string): string {
  if (!prefs) return prefs;
  const re = /(<pref\s+name="fieldType"\s+value=")[^"]*(")/;
  if (re.test(prefs)) return prefs.replace(re, `$1${type}$2`);
  return prefs.includes('<prefs>') ? prefs.replace('<prefs>', `<prefs><pref name="fieldType" value="${type}"/>`) : prefs;
}

// ---------------------------------------------------------------- Zotero's HTML

const parseHtml = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** The text of Zotero's HTML, as Zotero's own HTTP client keeps it (so Zotero sees no edit by hand). */
export function htmlText(html: string): string {
  return parseHtml(html).documentElement.textContent ?? '';
}

/** Whether Zotero's citation is raised (all of it in <sup>, as superscript numbers are). */
export function htmlSuper(html: string): boolean {
  const body = parseHtml(html).body;
  const els = Array.from(body.childNodes).filter((n) => n.nodeType !== 3 || (n.textContent ?? '').trim());
  return els.length === 1 && (els[0] as Element).tagName?.toLowerCase() === 'sup';
}

/** Pieces of an element's text, in italic or bold as its HTML has them. */
function htmlPieces(el: Node): Piece[] {
  const out: Piece[] = [];
  const walk = (n: Node, italic: boolean, bold: boolean): void => {
    if (n.nodeType === 3) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ');
      if (!text) return;
      const last = out[out.length - 1];
      if (last && !!last.italic === italic && !!last.bold === bold) last.text += text;
      else out.push({ text, ...(italic ? { italic } : {}), ...(bold ? { bold } : {}) });
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as HTMLElement;
    const tag = e.tagName.toLowerCase();
    const style = (e.getAttribute('style') ?? '').toLowerCase();
    let i = italic, b = bold;
    if (tag === 'i' || tag === 'em' || /font-style:\s*italic/.test(style)) i = true;
    if (/font-style:\s*normal/.test(style)) i = false;
    if (tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|[6-9]00)/.test(style)) b = true;
    if (/font-weight:\s*normal/.test(style)) b = false;
    for (const c of Array.from(e.childNodes)) walk(c, i, b);
  };
  walk(el, false, false);
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  }
  return out.filter((p) => p.text);
}

/** Zotero's bibliography (its HTML: csl-entry divs, a numbered style's number in csl-left-margin) as entries. */
export function bibFromHtml(html: string): { label: string; pieces: Piece[] }[] {
  const doc = parseHtml(html);
  const entries = Array.from(doc.querySelectorAll('.csl-entry'));
  if (!entries.length) {
    return (doc.body.textContent ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean).map((text) => ({ label: '', pieces: [{ text }] }));
  }
  return entries.map((e) => {
    const margin = e.querySelector('.csl-left-margin');
    const body = e.querySelector('.csl-right-inline');
    if (margin && !body) margin.remove();
    return { label: (margin?.textContent ?? '').trim(), pieces: htmlPieces(body ?? e) };
  });
}

// ---------------------------------------------------------------- the document's fields

/** A field as Zotero's protocol has it: its id, code, text and the number of the note it is in (0: in the text). */
export interface FieldJson { id: string; code: string; text: string; noteIndex: number }

/** Each run list objects sit in besides the text's own: tables' cells and footnotes, with how to put a changed list back. */
function partsOf(t: DocText): { runs: TextRun[]; put: (t: DocText, runs: TextRun[]) => DocText }[] {
  const out: { runs: TextRun[]; put: (t: DocText, runs: TextRun[]) => DocText }[] = [];
  for (const [k, o] of Object.entries(t.objects)) {
    const id = Number(k);
    if (o.kind === 'note') out.push({ runs: o.runs, put: (x, runs) => { const n = x.objects[id]; return n?.kind === 'note' ? { ...x, objects: { ...x.objects, [id]: { ...n, runs } } } : x; } });
    if (o.kind !== 'table') continue;
    o.table.rows.forEach((row, r) => row.forEach((cell, c) => out.push({
      runs: cell.runs,
      put: (x, runs) => {
        const tb = x.objects[id];
        if (tb?.kind !== 'table') return x;
        const rows = tb.table.rows.map((rr, ri) => (ri !== r ? rr : rr.map((cc, ci) => (ci !== c ? cc : { ...cc, runs }))));
        return { ...x, objects: { ...x.objects, [id]: { ...tb, table: { ...tb.table, rows } } } };
      },
    })));
  }
  return out;
}

/** Runs anywhere in the text (its own, its tables' cells and its footnotes), changed by `f`. */
function mapObjectRuns(t: DocText, id: number, f: (r: TextRun) => TextRun): DocText {
  const map = (runs: TextRun[]): TextRun[] => runs.map((r) => (r.obj === id ? f(r) : r));
  if (t.runs.some((r) => r.obj === id)) return { ...t, runs: map(t.runs) };
  const part = partsOf(t).find((p) => p.runs.some((r) => r.obj === id));
  return part ? part.put(t, map(part.runs)) : t;
}

/** The text with an object's character in a table's cell or a footnote replaced by runs (none: taken out); null when none holds it. */
export function replaceInCells(t: DocText, id: number, runs: TextRun[]): DocText | null {
  const part = partsOf(t).find((p) => p.runs.some((r) => r.obj === id));
  return part ? part.put(t, part.runs.flatMap((y) => (y.obj === id ? runs : [y]))) : null;
}

/** The run that puts an object in the text (in a table's cell or a footnote too), or undefined. */
function objectRunOf(t: DocText, id: number): TextRun | undefined {
  return t.runs.find((r) => r.obj === id) ?? partsOf(t).map((p) => p.runs.find((r) => r.obj === id)).find((r) => r);
}

/** The footnote or endnote a citation is in (its id), or undefined. */
function noteHolding(t: DocText, id: number): number | undefined {
  for (const [k, o] of Object.entries(t.objects)) if (o.kind === 'note' && o.runs.some((r) => r.obj === id)) return Number(k);
  return undefined;
}

/** Each footnote's and endnote's number (as Zotero counts notes: each kind on its own, in order). */
function noteNumbers(t: DocText): Map<number, number> {
  const out = new Map<number, number>();
  let foot = 0, end = 0;
  for (const id of fieldOrder(t)) {
    const o = t.objects[id];
    if (o?.kind === 'note' && !out.has(id)) out.set(id, o.end ? ++end : ++foot);
  }
  return out;
}

export const refsKey = (refs: string[]): string => refs.join(' ');
/** The references cited, in order (what a bibliography's entries are for). */
const citedKey = (t: DocText): string => {
  const known = new Set((t.references ?? []).map((r) => r.id));
  const out: string[] = [];
  for (const id of fieldOrder(t)) {
    const o = t.objects[id];
    if (o?.kind === 'cite') for (const r of o.refs) if (known.has(r) && !out.includes(r)) out.push(r);
  }
  return out.join(' ');
};

/** A citation's code for Zotero: Zotero's own while it is up to date, else written from its references. */
function citeCode(t: DocText, o: Extract<DocObject, { kind: 'cite' }>, shown: string): string {
  if (!o.refs.length) return o.live?.code ?? 'TEMP';
  const refs = o.refs.map((r) => t.references?.find((x) => x.id === r)).filter((r): r is Reference => !!r);
  return refs.length ? writtenCode(refs, o.live, shown) : 'TEMP';
}

/** The document's citations and bibliographies as Zotero's fields, in order. */
export function zoteroFields(t: DocText): FieldJson[] {
  const shown = citationTexts(t);
  const notes = Object.values(t.objects).some((o) => o.kind === 'note') ? noteNumbers(t) : null;
  const noteOf = (id: number): number => { const n = notes ? noteHolding(t, id) : undefined; return n !== undefined ? notes!.get(n) ?? 0 : 0; };
  const out: FieldJson[] = [];
  const seen = new Set<number>();
  let bibText: string | null = null;
  for (const id of fieldOrder(t)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const o = t.objects[id];
    if (o?.kind === 'cite') {
      const text = shown.get(id) ?? '';
      out.push({ id: String(id), code: citeCode(t, o, text), text, noteIndex: noteOf(id) });
    } else if (o?.kind === 'bib') {
      bibText ??= bibliography(t).map((e) => (e.label ? `${e.label}\t` : '') + piecesText(e.pieces)).join('\n');
      out.push({ id: String(id), code: o.live?.code ?? BIBL, text: bibText, noteIndex: 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- what Zotero works on

/**
 * A file Zotero cites in, as Zotero's fields: a document (its citations and bibliographies) or a
 * presentation (its slides' references and its References slide, zotero-deck.ts). Field ids are
 * the file's own. Zotero's preferences are kept as its Word plugin keeps them (field type
 * "Field"), so they go into a Word file as they are.
 */
export interface ZoteroStore {
  readonly docId: string;
  /** Zotero's preferences as kept in the file ('' when there are none yet). */
  prefs(): string;
  setPrefs(prefs: string): void;
  fields(): FieldJson[];
  /** The field picked (where a command acts on an existing one), or null. */
  cursor(): FieldJson | null;
  canInsert(): boolean;
  /** A new field where Zotero puts the citation or bibliography (`note`: in a footnote, 1, or an endnote, 2). */
  insert(note: number): FieldJson;
  setText(id: string, html: string): void;
  setCode(id: string, code: string): void;
  remove(id: string): void;
  select(id: string): void;
  unlink(id: string): void;
  /** Citations moved into or out of notes (a note style chosen, or one no longer). */
  convert(ids: string[], notes: number[]): void;
  /** The notes citations can go in. */
  readonly notes: string[];
  /** At the end of a command. */
  finish(): void;
  /** When Zotero went away part way through: take out the empty citations put in for it. */
  abandon?(): void;
  choose(text: string, labels: string[]): Promise<number>;
  activate(): void;
}

/** Zotero's citation code's items as references: placed in `list` (a copy, changed), linked to Zotero's items; null when the code is not a citation. */
export function citationFromCode(code: string, list: Reference[]): { list: Reference[]; ids: string[]; items: Record<string, Record<string, unknown>>; id?: string } | null {
  const got = /^ITEM\b/.test(code) ? readCiteField(`ADDIN ZOTERO_${code}`) : null;
  if (!got) return null;
  // (copies: placeRef links the one it finds, and the old ones belong to Undo)
  const refs = list.map((r) => ({ ...r }));
  const ids: string[] = [];
  const items: Record<string, Record<string, unknown>> = {};
  for (const it of got.items) {
    const rid = placeRef(refs, it.ref);
    // what Zotero says of the item now (a title corrected in Zotero shows here)
    const at = refs.findIndex((r) => r.id === rid);
    if (at >= 0 && refs[at].live?.app === 'zotero' && it.ref.live?.item) refs[at] = { ...it.ref, id: rid, ...(refs[at].typed !== undefined ? { typed: refs[at].typed } : {}) };
    if (!ids.includes(rid)) ids.push(rid);
    if (Object.keys(it.extra).length) items[rid] = it.extra;
  }
  return { list: refs, ids, items, ...(got.id ? { id: got.id } : {}) };
}

/** A citation's code written for Zotero from its references (when Zotero's own is out of date). */
export function writtenCode(refs: Reference[], live: CiteLive | undefined, shown: string): string {
  if (!refs.length) return live?.code ?? 'TEMP';
  return writeCite('zotero', refs, live, shown).instr.trim().replace(/^ADDIN\s+ZOTERO_/, '');
}

export const ZOTERO_PLACEHOLDER = PLACEHOLDER;
export const ZOTERO_BIBL = BIBL;

/** A document (doc-mode.ts gives its host) as Zotero's fields: citation and bibliography objects in the text. */
class DocStore implements ZoteroStore {
  private bibs = new Set<number>();
  /** The citations put in during this command (Zotero fills them in or takes them out before it ends). */
  private placed: number[] = [];
  readonly notes: string[] = ['footnotes', 'endnotes'];
  constructor(private host: ZoteroHost) {}

  get docId(): string { return this.host.docId; }
  private get t(): DocText { return this.host.text(); }

  private field(fieldId: unknown): { id: number; o: DocObject } {
    const id = Number(fieldId);
    const o = this.t.objects[id];
    if (!Number.isInteger(id) || (o?.kind !== 'cite' && o?.kind !== 'bib') || !objectRunOf(this.t, id)) throw new Error(`The citation or bibliography ${String(fieldId)} is no longer in the document.`);
    return { id, o };
  }

  private setObject(id: number, o: DocObject): void {
    const t = this.t;
    this.host.change({ ...t, objects: { ...t.objects, [id]: o } });
  }

  private fieldJson(id: number): FieldJson | null {
    return zoteroFields(this.t).find((f) => f.id === String(id)) ?? null;
  }

  prefs(): string { return this.t.zoteroPrefs ?? ''; }
  fields(): FieldJson[] { return zoteroFields(this.t); }
  cursor(): FieldJson | null { const id = this.host.picked(); return id === null ? null : this.fieldJson(id); }
  canInsert(): boolean { return this.host.canInsert(); }
  insert(note: number): FieldJson {
    const cite: DocObject = { kind: 'cite', refs: [], live: { app: 'zotero', code: 'TEMP', text: PLACEHOLDER, for: '' } };
    if (note > 0) {
      // a note style: the citation in a new footnote (or endnote) at the caret
      const t = this.t;
      const id = nextObjectId(t);
      this.host.change({ ...t, objects: { ...t.objects, [id]: cite } });
      this.host.insert({ kind: 'note', ...(note === 2 ? { end: true } : {}), runs: [{ text: OBJECT_CHAR, obj: id }] }, true);
      this.placed.push(id);
      const holder = noteHolding(this.t, id);
      return { id: String(id), code: 'TEMP', text: PLACEHOLDER, noteIndex: holder !== undefined ? noteNumbers(this.t).get(holder) ?? 1 : 1 };
    }
    const id = this.host.insert(cite);
    this.placed.push(id);
    return { id: String(id), code: 'TEMP', text: PLACEHOLDER, noteIndex: 0 };
  }
  abandon(): void {
    for (const id of this.placed) {
      const o = this.t.objects[id];
      if (o?.kind !== 'cite' || o.refs.length || o.live?.code !== 'TEMP') continue;
      const holder = noteHolding(this.t, id);
      const n = holder !== undefined ? this.t.objects[holder] : undefined;
      // a footnote holding only this citation goes with it
      if (n?.kind === 'note' && !n.runs.some((r) => r.obj !== id && (r.obj !== undefined || r.text.trim()))) this.host.replaceObject(holder!, []);
      else if (objectRunOf(this.t, id)) this.host.replaceObject(id, []);
    }
    this.placed = [];
  }
  remove(id: string): void { this.host.replaceObject(this.field(id).id, []); }
  select(id: string): void { this.host.select(this.field(id).id); }
  /** Citations into footnotes (or endnotes), or out of them into the text, as Zotero's style now has them. */
  convert(ids: string[], notes: number[]): void {
    ids.forEach((fid, i) => {
      const want = notes[i] ?? notes[0] ?? 0;
      const id = Number(fid);
      const t = this.t;
      if (t.objects[id]?.kind !== 'cite') return;
      const holder = noteHolding(t, id);
      if (want > 0 && holder === undefined) {
        // (citations in the text itself; those in a table's cells stay where they are)
        const run = t.runs.find((r) => r.obj === id);
        if (!run) return;
        const noteId = nextObjectId(t);
        this.host.change({ ...t, objects: { ...t.objects, [noteId]: { kind: 'note', ...(want === 2 ? { end: true } : {}), runs: [{ ...run, sup: undefined }] } } });
        this.host.replaceObject(id, [{ ...run, obj: noteId, sup: true }]);
        return;
      }
      if (holder === undefined) return;
      const n = t.objects[holder];
      if (n?.kind !== 'note') return;
      if (want > 0) {
        // a footnote to an endnote, or back
        if (!!n.end !== (want === 2)) {
          const { end: _e, ...rest } = n;
          this.host.change({ ...t, objects: { ...t.objects, [holder]: want === 2 ? { ...rest, end: true } : rest } });
        }
        return;
      }
      // out of the note, where its number was (the note goes when nothing else is in it)
      const mark = t.runs.find((r) => r.obj === holder);
      if (!mark) return;
      const citeRun: TextRun = { ...mark, obj: id, sup: undefined };
      const rest = n.runs.filter((r) => r.obj !== id);
      if (!rest.some((r) => r.obj !== undefined || r.text.trim())) {
        this.host.replaceObject(holder, [citeRun]);
        const { [holder]: _n, ...objects } = this.t.objects;
        this.host.change({ ...this.t, objects });
        return;
      }
      this.host.change({ ...t, objects: { ...t.objects, [holder]: { ...n, runs: rest } } });
      this.host.replaceObject(holder, [mark, citeRun]);
    });
  }
  choose(text: string, labels: string[]): Promise<number> { return this.host.choose(text, labels); }
  activate(): void { this.host.activate(); }

  setPrefs(data: string): void {
    const t = this.t;
    const style = styleFromCsl(zoteroStyleOf(data) ?? '');
    this.host.change({ ...t, zoteroPrefs: data, citeManager: 'zotero', ...(style ? { citeStyle: style } : {}) });
  }

  setText(fieldId: string, html: string): void {
    const { id, o } = this.field(fieldId);
    if (o.kind === 'bib') {
      this.bibs.add(id);
      this.setObject(id, { ...o, live: { code: o.live?.code ?? BIBL, entries: bibFromHtml(html) } });
      return;
    }
    if (o.kind !== 'cite') return;
    const live: CiteLive = { ...(o.live ?? {}), app: 'zotero', text: htmlText(html), for: refsKey(o.refs) };
    this.setObject(id, { ...o, live });
    // raised as Zotero's style has it (superscript numbers)
    const sup = htmlSuper(html) || undefined;
    if (!!objectRunOf(this.t, id)?.sup !== !!sup) this.host.change(mapObjectRuns(this.t, id, (r) => ({ ...r, sup })));
  }

  setCode(fieldId: string, code: string): void {
    const { id, o } = this.field(fieldId);
    code = code.trim();
    if (/^BIBL\b/.test(code)) {
      if (o.kind === 'bib') { this.setObject(id, { ...o, live: { ...o.live, code } }); return; }
      // the bibliography Zotero is putting in: a block of its own
      this.setObject(id, { kind: 'bib', live: { code } });
      this.bibs.add(id);
      if (objectRunOf(this.t, id)?.sup) this.host.change(mapObjectRuns(this.t, id, (r) => ({ ...r, sup: undefined })));
      this.host.ownParagraph(id);
      return;
    }
    if (o.kind !== 'cite') return;
    const t = this.t;
    const got = citationFromCode(code, t.references ?? []);
    if (!got) { this.setObject(id, { ...o, live: { ...(o.live ?? {}), app: 'zotero', code } }); return; }
    const live: CiteLive = {
      ...(o.live ?? {}), app: 'zotero', ...(got.id ? { id: got.id } : {}), code, for: refsKey(got.ids),
      ...(Object.keys(got.items).length ? { items: got.items } : { items: undefined }),
    };
    this.host.change({ ...t, references: got.list, objects: { ...t.objects, [id]: { kind: 'cite', refs: got.ids, live } } });
  }

  unlink(fieldId: string): void {
    const { id, o } = this.field(fieldId);
    const run = objectRunOf(this.t, id)!;
    const look = { ...run, obj: undefined };
    if (o.kind === 'cite') {
      const text = citationTexts(this.t).get(id) ?? '';
      this.host.replaceObject(id, text ? [{ ...look, text }] : []);
      return;
    }
    const entries = bibliography(this.t);
    const runs: TextRun[] = [];
    entries.forEach((e, i) => {
      if (i) runs.push({ ...look, text: '\n' });
      if (e.label) runs.push({ ...look, text: `${e.label}\t` });
      for (const p of e.pieces) runs.push({ ...look, italic: p.italic || undefined, bold: p.bold || undefined, text: p.text });
    });
    this.host.replaceObject(id, runs);
  }

  /** At the end: the bibliographies' entries are for the references cited now. */
  finish(): void {
    if (!this.bibs.size) return;
    const t = this.t;
    const key = citedKey(t);
    const objects = { ...t.objects };
    for (const id of this.bibs) {
      const o = objects[id];
      if (o?.kind === 'bib' && o.live?.entries) objects[id] = { ...o, live: { ...o.live, for: key } };
    }
    this.host.change({ ...t, objects });
  }
}

// ---------------------------------------------------------------- a command

/** Zotero's requests, done on a store. */
class Transaction {
  constructor(private store: ZoteroStore) {}

  /** Do what Zotero asked; the answer to send back. */
  async do(command: string, args: unknown[]): Promise<unknown> {
    const s = this.store;
    const [, a1, a2, a3] = args;
    const id = () => String(a1 ?? '');
    switch (command) {
      case 'Application.getActiveDocument':
        return { documentID: s.docId, outputFormat: 'html', supportedNotes: s.notes, supportsImportExport: false, supportsTextInsertion: false, supportsCitationMerging: false, processorName: 'Chem Illustrator' };
      case 'Document.activate': s.activate(); return null;
      case 'Document.canInsertField': return s.canInsert();
      case 'Document.displayAlert': return this.alert(String(a1 ?? ''), Number(a3 ?? 0));
      case 'Document.getDocumentData': { const p = s.prefs(); return p ? withFieldType(p, HTTP_FIELD) : ''; }
      case 'Document.setDocumentData': s.setPrefs(withFieldType(String(a1 ?? ''), WORD_FIELD)); return null;
      case 'Document.cursorInField': return s.cursor();
      case 'Document.insertField': return s.insert(Number(a2) || 0);
      case 'Document.getFields': return s.fields();
      case 'Document.convert': s.convert(Array.isArray(a1) ? a1.map(String) : [], Array.isArray(a3) ? a3.map(Number) : []); return null;
      case 'Document.setBibliographyStyle': case 'Document.cleanup': case 'Document.complete': return null;
      case 'Field.setText': s.setText(id(), String(a2 ?? '')); return null;
      case 'Field.setCode': s.setCode(id(), String(a2 ?? '')); return null;
      case 'Field.delete': s.remove(id()); return null;
      case 'Field.select': s.select(id()); return null;
      case 'Field.removeCode': s.unlink(id()); return null;
      case 'Field.getText': case 'Field.getCode': {
        const f = s.fields().find((x) => x.id === id());
        if (!f) throw new Error(`The citation or bibliography ${id()} is no longer there.`);
        return command === 'Field.getText' ? f.text : f.code;
      }
      default: throw new Error(`Chem Illustrator can't do ${command} yet.`);
    }
  }

  /** Zotero's question in a window of ours, answered as its Word plugin answers (OK and Yes count highest). */
  private async alert(text: string, buttons: number): Promise<number> {
    const labels = buttons === 1 ? ['OK', 'Cancel'] : buttons === 2 ? ['Yes', 'No'] : buttons === 3 ? ['Yes', 'No', 'Cancel'] : ['OK'];
    const got = await this.store.choose(text, labels);
    if (buttons === 0) return 0;
    if (got < 0) return 0;
    return labels.length - 1 - got;
  }
}

interface ZoteroRequest { command: string; arguments?: unknown[] }

/**
 * Run one of Zotero's commands on a file: ask Zotero to start it, then do what it asks until it
 * is complete. Errors here go back to Zotero, which shows them and ends the command.
 */
export async function runZoteroOn(command: ZoteroCommand, store: ZoteroStore, post: ZoteroPost): Promise<ZoteroOutcome> {
  let res: { status: number; text: string };
  try {
    res = await post('execCommand', JSON.stringify({ command, docId: store.docId }));
  } catch {
    return 'offline';
  }
  if (res.status === 503) return 'busy';
  if (res.status !== 200) throw new Error(`Zotero answered with an error (${res.status}): ${res.text.slice(0, 200)}`);
  const tx = new Transaction(store);
  try {
    return await answerZotero(tx, store, res, post);
  } catch (e) {
    // Zotero closed or the connection dropped part way: no empty {Citation} is left behind
    store.abandon?.();
    throw e;
  }
}

async function answerZotero(tx: Transaction, store: ZoteroStore, res: { status: number; text: string }, post: ZoteroPost): Promise<ZoteroOutcome> {
  for (;;) {
    let req: ZoteroRequest;
    try { req = JSON.parse(res.text) as ZoteroRequest; } catch { throw new Error('Zotero sent something that could not be read.'); }
    if (!req || typeof req.command !== 'string') throw new Error('Zotero sent something that could not be read.');
    let answer: unknown;
    try {
      answer = await tx.do(req.command, Array.isArray(req.arguments) ? req.arguments : []);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      answer = { error: 'Chem Illustrator Error', message: err.message, stack: err.stack ?? '' };
    }
    if (req.command === 'Document.complete') { store.finish(); return 'done'; }
    res = await post('respond', answer === undefined ? 'null' : JSON.stringify(answer));
    if (res.status !== 200) throw new Error(`Zotero answered with an error (${res.status}): ${res.text.slice(0, 200)}`);
  }
}

/** Run one of Zotero's commands on a document (doc-mode.ts gives the host). */
export function runZotero(command: ZoteroCommand, host: ZoteroHost, post: ZoteroPost): Promise<ZoteroOutcome> {
  return runZoteroOn(command, new DocStore(host), post);
}
