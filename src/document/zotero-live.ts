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
import type { DocObject, DocText } from './document';
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
  /** Put a new object at the caret, in the citation's look; its id. */
  insert(o: DocObject): number;
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

interface FieldJson { id: string; code: string; text: string; noteIndex: number }

/** Runs anywhere in the text (its own and its tables' cells), changed by `f`. */
function mapObjectRuns(t: DocText, id: number, f: (r: TextRun) => TextRun): DocText {
  const map = (runs: TextRun[]): TextRun[] => (runs.some((r) => r.obj === id) ? runs.map((r) => (r.obj === id ? f(r) : r)) : runs);
  const objects = { ...t.objects };
  for (const [k, o] of Object.entries(t.objects)) {
    if (o.kind !== 'table') continue;
    const rows = o.table.rows.map((row) => row.map((c) => { const runs = map(c.runs); return runs === c.runs ? c : { ...c, runs }; }));
    if (rows.some((row, r) => row.some((c, i) => c !== o.table.rows[r][i]))) objects[Number(k)] = { ...o, table: { ...o.table, rows } };
  }
  return { ...t, runs: map(t.runs), objects };
}

/** The text with an object's character in a table's cell replaced by runs (none: taken out); null when no cell holds it. */
export function replaceInCells(t: DocText, id: number, runs: TextRun[]): DocText | null {
  for (const [k, o] of Object.entries(t.objects)) {
    if (o.kind !== 'table') continue;
    for (let r = 0; r < o.table.rows.length; r++) {
      for (let c = 0; c < o.table.rows[r].length; c++) {
        const cell = o.table.rows[r][c];
        if (!cell.runs.some((x) => x.obj === id)) continue;
        const rows = o.table.rows.map((row, ri) => (ri !== r ? row : row.map((x, ci) => (ci !== c ? x : { ...x, runs: x.runs.flatMap((y) => (y.obj === id ? runs : [y])) }))));
        return { ...t, objects: { ...t.objects, [Number(k)]: { ...o, table: { ...o.table, rows } } } };
      }
    }
  }
  return null;
}

/** The run that puts an object in the text (in a table's cell too), or undefined. */
function objectRunOf(t: DocText, id: number): TextRun | undefined {
  const inRuns = (runs: TextRun[]) => runs.find((r) => r.obj === id);
  const top = inRuns(t.runs);
  if (top) return top;
  for (const o of Object.values(t.objects)) {
    if (o.kind !== 'table') continue;
    for (const row of o.table.rows) for (const c of row) { const r = inRuns(c.runs); if (r) return r; }
  }
  return undefined;
}

const refsKey = (refs: string[]): string => refs.join(' ');
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
  if (!refs.length) return 'TEMP';
  return writeCite('zotero', refs, o.live, shown).instr.trim().replace(/^ADDIN\s+ZOTERO_/, '');
}

/** The document's citations and bibliographies as Zotero's fields, in order. */
export function zoteroFields(t: DocText): FieldJson[] {
  const shown = citationTexts(t);
  const out: FieldJson[] = [];
  const seen = new Set<number>();
  let bibText: string | null = null;
  for (const id of fieldOrder(t)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const o = t.objects[id];
    if (o?.kind === 'cite') {
      const text = shown.get(id) ?? '';
      out.push({ id: String(id), code: citeCode(t, o, text), text, noteIndex: 0 });
    } else if (o?.kind === 'bib') {
      bibText ??= bibliography(t).map((e) => (e.label ? `${e.label}\t` : '') + piecesText(e.pieces)).join('\n');
      out.push({ id: String(id), code: o.live?.code ?? BIBL, text: bibText, noteIndex: 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- a command

class Transaction {
  private bibs = new Set<number>();
  constructor(private host: ZoteroHost) {}

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

  /** Do what Zotero asked; the answer to send back. */
  async do(command: string, args: unknown[]): Promise<unknown> {
    const [, a1, a2, a3] = args;
    switch (command) {
      case 'Application.getActiveDocument':
        return { documentID: this.host.docId, outputFormat: 'html', supportedNotes: [], supportsImportExport: false, supportsTextInsertion: false, supportsCitationMerging: false, processorName: 'Chem Illustrator' };
      case 'Document.activate': this.host.activate(); return null;
      case 'Document.canInsertField': return this.host.canInsert();
      case 'Document.displayAlert': return this.alert(String(a1 ?? ''), Number(a3 ?? 0));
      case 'Document.getDocumentData': return this.t.zoteroPrefs ? withFieldType(this.t.zoteroPrefs, HTTP_FIELD) : '';
      case 'Document.setDocumentData': this.setPrefs(String(a1 ?? '')); return null;
      case 'Document.cursorInField': { const id = this.host.picked(); return id === null ? null : this.fieldJson(id); }
      case 'Document.insertField': {
        const id = this.host.insert({ kind: 'cite', refs: [], live: { app: 'zotero', code: 'TEMP', text: PLACEHOLDER, for: '' } });
        return { id: String(id), code: 'TEMP', text: PLACEHOLDER, noteIndex: 0 };
      }
      case 'Document.getFields': return zoteroFields(this.t);
      case 'Document.convert': case 'Document.setBibliographyStyle': case 'Document.cleanup': return null;
      case 'Document.complete': return null;
      case 'Field.setText': this.setText(a1, String(a2 ?? '')); return null;
      case 'Field.setCode': this.setCode(a1, String(a2 ?? '')); return null;
      case 'Field.delete': this.host.replaceObject(this.field(a1).id, []); return null;
      case 'Field.select': this.host.select(this.field(a1).id); return null;
      case 'Field.removeCode': this.removeCode(a1); return null;
      case 'Field.getText': return this.fieldJson(this.field(a1).id)?.text ?? '';
      case 'Field.getCode': return this.fieldJson(this.field(a1).id)?.code ?? '';
      default: throw new Error(`Chem Illustrator can't do ${command} yet.`);
    }
  }

  /** Zotero's question in a window of ours, answered as its Word plugin answers (OK and Yes count highest). */
  private async alert(text: string, buttons: number): Promise<number> {
    const labels = buttons === 1 ? ['OK', 'Cancel'] : buttons === 2 ? ['Yes', 'No'] : buttons === 3 ? ['Yes', 'No', 'Cancel'] : ['OK'];
    const got = await this.host.choose(text, labels);
    if (buttons === 0) return 0;
    if (got < 0) return 0;
    return labels.length - 1 - got;
  }

  private setPrefs(data: string): void {
    const t = this.t;
    const style = styleFromCsl(zoteroStyleOf(data) ?? '');
    this.host.change({ ...t, zoteroPrefs: withFieldType(data, WORD_FIELD), citeManager: 'zotero', ...(style ? { citeStyle: style } : {}) });
  }

  private setText(fieldId: unknown, html: string): void {
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

  private setCode(fieldId: unknown, code: string): void {
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
    const got = /^ITEM\b/.test(code) ? readCiteField(`ADDIN ZOTERO_${code}`) : null;
    if (!got) { this.setObject(id, { ...o, live: { ...(o.live ?? {}), app: 'zotero', code } }); return; }
    // Zotero's items as the document's references, linked to Zotero's items
    const t = this.t;
    // (copies: placeRef links the one it finds, and the old ones belong to Undo)
    const refs = (t.references ?? []).map((r) => ({ ...r }));
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
    const live: CiteLive = {
      ...(o.live ?? {}), app: 'zotero', ...(got.id ? { id: got.id } : {}), code, for: refsKey(ids),
      ...(Object.keys(items).length ? { items } : { items: undefined }),
    };
    this.host.change({ ...t, references: refs, objects: { ...t.objects, [id]: { kind: 'cite', refs: ids, live } } });
  }

  private removeCode(fieldId: unknown): void {
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

interface ZoteroRequest { command: string; arguments?: unknown[] }

/**
 * Run one of Zotero's commands on the document: ask Zotero to start it, then do what it asks
 * until it is complete. Errors here go back to Zotero, which shows them and ends the command.
 */
export async function runZotero(command: ZoteroCommand, host: ZoteroHost, post: ZoteroPost): Promise<ZoteroOutcome> {
  let res: { status: number; text: string };
  try {
    res = await post('execCommand', JSON.stringify({ command, docId: host.docId }));
  } catch {
    return 'offline';
  }
  if (res.status === 503) return 'busy';
  if (res.status !== 200) throw new Error(`Zotero answered with an error (${res.status}): ${res.text.slice(0, 200)}`);
  const tx = new Transaction(host);
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
    if (req.command === 'Document.complete') { tx.finish(); return 'done'; }
    res = await post('respond', answer === undefined ? 'null' : JSON.stringify(answer));
    if (res.status !== 200) throw new Error(`Zotero answered with an error (${res.status}): ${res.text.slice(0, 200)}`);
  }
}
