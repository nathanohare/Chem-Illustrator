// @vitest-environment jsdom
//
// Citing live with Zotero (src/document/zotero-live.ts): Zotero's HTTP citing protocol played
// out against a document, with a stand-in for Zotero that asks what the real one asks, in the
// same order, with the same arguments.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import * as rt from '../src/richtext';
import { newDocument, objectOffsets, objectRun, nextObjectId, type DocObject, type DocText } from '../src/document/document';
import { bibliography, citationTexts } from '../src/document/references';
import { bibFromHtml, htmlSuper, htmlText, runZotero, withFieldType, zoteroFields, type ZoteroHost, type ZoteroPost } from '../src/document/zotero-live';
import { writeDocx, readDocx, type DocxDeps } from '../src/io/docx';
import { DocLayouter } from '../src/document/doc-layout';
import type { TextRun } from '../src/model';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const deps: DocxDeps = { async picture() { return { png: PNG, w: 10, h: 10 }; }, async svgToPng() { return PNG; } };

const FULMER = { id: 1234, type: 'article-journal', title: 'NMR Chemical Shifts of Trace Impurities', 'container-title': 'Organometallics', author: [{ family: 'Fulmer', given: 'Gregory R.' }], issued: { 'date-parts': [[2010]] }, volume: '29', page: '2176-2179', DOI: '10.1021/om100106e' };
const SMITH = { id: 77, type: 'article-journal', title: 'A second paper', 'container-title': 'J. Am. Chem. Soc.', author: [{ family: 'Smith', given: 'Jane' }], issued: { 'date-parts': [['2021']] }, volume: '143', page: '1-10', DOI: '10.1021/jacs.0c00001' };
const URI = (k: string) => `http://zotero.org/users/1/items/${k}`;
const itemCode = (id: string, items: object[], shown: string) => `ITEM CSL_CITATION ${JSON.stringify({ citationID: id, properties: { formattedCitation: shown, plainCitation: shown, noteIndex: 0 }, citationItems: items, schema: 'https://github.com/citation-style-language/schema/raw/master/csl-citation.json' })}`;
const PREFS_HTTP = '<data data-version="3" zotero-version="7.0.11"><session id="Z9y8X7w6"/><style id="http://www.zotero.org/styles/american-chemical-society" locale="en-US" hasBibliography="1" bibliographyStyleHasBeenSet="0"/><prefs><pref name="fieldType" value="Http"/><pref name="automaticJournalAbbreviations" value="true"/></prefs></data>';
const BIB_HTML = '<div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em;">(1) </div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">Fulmer, G. R. NMR Chemical Shifts of Trace Impurities. <i>Organometallics</i> <b>2010</b>, <i>29</i>, 2176–2179.</div></div><div class="csl-entry"><div class="csl-left-margin">(2) </div><div class="csl-right-inline">Smith, J. A Second Paper. <i>J. Am. Chem. Soc.</i> <b>2021</b>, <i>143</i>, 1–10.</div></div></div>';

/** A document of plain text, edited the way the document window edits it (text runs, objects). */
class TestHost implements ZoteroHost {
  readonly docId = 'test-doc';
  t: DocText;
  caret: number;
  picks: number | null = null;
  alerts: { text: string; labels: string[] }[] = [];
  answer = 0;
  activated = 0;
  constructor(text = 'Impurities were assigned as before.', caret = 24) {
    this.t = { ...newDocument(), runs: [{ text }] } as DocText;
    this.caret = caret;
  }
  text(): DocText { return this.t; }
  change(t: DocText): void { this.t = t; }
  replaceObject(id: number, runs: TextRun[]): void {
    const at = objectOffsets(this.t.runs).get(id);
    if (at !== undefined) this.t = { ...this.t, runs: rt.replaceRange(this.t.runs, at, at + 1, runs) };
  }
  picked(): number | null { return this.picks; }
  canInsert(): boolean { return true; }
  insert(o: DocObject): number {
    const id = nextObjectId(this.t);
    this.t = { ...this.t, objects: { ...this.t.objects, [id]: o }, runs: rt.replaceRange(this.t.runs, this.caret, this.caret, [objectRun(id, { sup: true })]) };
    this.caret++;
    return id;
  }
  ownParagraph(id: number): void {
    const at = objectOffsets(this.t.runs).get(id)!;
    const text = rt.plainText(this.t.runs);
    if (text[at + 1] !== undefined && text[at + 1] !== '\n') this.t = { ...this.t, runs: rt.replaceRange(this.t.runs, at + 1, at + 1, [{ text: '\n' }]) };
    if (at > 0 && text[at - 1] !== '\n') this.t = { ...this.t, runs: rt.replaceRange(this.t.runs, at, at, [{ text: '\n' }]) };
  }
  select(id: number): void { this.picks = id; }
  async choose(text: string, labels: string[]): Promise<number> { this.alerts.push({ text, labels }); return this.answer; }
  activate(): void { this.activated++; }
}

/**
 * A stand-in for Zotero: each step is what Zotero asks next, given the answer to the step
 * before (as Zotero's own answer to /respond is its next request). It records the answers.
 */
function fakeZotero(steps: ((last: unknown) => [string, unknown[]])[], opts: { status?: number } = {}): { post: ZoteroPost; answers: unknown[]; posts: { endpoint: string; body: string }[] } {
  const answers: unknown[] = [];
  const posts: { endpoint: string; body: string }[] = [];
  let i = 0;
  const post: ZoteroPost = async (endpoint, body) => {
    posts.push({ endpoint, body });
    if (opts.status) return { status: opts.status, text: 'Integration transaction is already in progress' };
    let last: unknown = null;
    if (endpoint === 'respond') { last = JSON.parse(body); answers.push(last); }
    const step = steps[i++];
    if (!step) throw new Error('Zotero was asked for more than it had to say');
    const [command, args] = step(last);
    return { status: 200, text: JSON.stringify({ command, arguments: args }) };
  };
  return { post, answers, posts };
}

const D = 'test-doc';
/** Zotero's Add/Edit Citation in a new document: preferences first, then the citation chosen. */
const addCitation = (items: object[], code: string, html: string): ((last: unknown) => [string, unknown[]])[] => {
  let field = '';
  return [
    () => ['Application.getActiveDocument', []],
    () => ['Document.getDocumentData', [D]],
    () => ['Document.setDocumentData', [D, PREFS_HTTP]],
    () => ['Document.canInsertField', [D, 'Http']],
    () => ['Document.cursorInField', [D, 'Http']],
    () => ['Document.insertField', [D, 'Http', 0]],
    (last) => { field = (last as { id: string }).id; return ['Field.setCode', [D, field, 'TEMP']]; },
    () => ['Document.getFields', [D, 'Http']],
    () => ['Field.setCode', [D, field, code]],
    () => ['Field.setText', [D, field, html, false]],
    () => ['Document.activate', [D]],
    () => ['Document.complete', [D]],
  ];
};

const fulmerCode = itemCode('cit1', [{ id: 1234, uris: [URI('ABCD1234')], itemData: FULMER }], '1');

async function citedDocument(): Promise<TestHost> {
  const host = new TestHost();
  const z = fakeZotero(addCitation([], fulmerCode, '<sup>1</sup>'));
  expect(await runZotero('addEditCitation', host, z.post)).toBe('done');
  return host;
}

describe('Zotero HTTP citing', () => {
  it('starts the command, answers each request, and stops at Document.complete', async () => {
    const host = new TestHost();
    const z = fakeZotero(addCitation([], fulmerCode, '<sup>1</sup>'));
    expect(await runZotero('addEditCitation', host, z.post)).toBe('done');
    expect(z.posts[0]).toEqual({ endpoint: 'execCommand', body: JSON.stringify({ command: 'addEditCitation', docId: 'test-doc' }) });
    // nothing is posted after Document.complete
    expect(z.posts.at(-1)!.endpoint).toBe('respond');
    expect(z.posts.filter((p) => p.endpoint === 'respond')).toHaveLength(11);
    const [doc, data, , canInsert, inField, inserted, , fields] = z.answers;
    expect(doc).toMatchObject({ documentID: 'test-doc', outputFormat: 'html', supportedNotes: ['footnotes', 'endnotes'], supportsImportExport: false, processorName: 'Chem Illustrator' });
    // a new document has no Zotero preferences yet (Zotero asks for a style)
    expect(data).toBe('');
    expect(canInsert).toBe(true);
    expect(inField).toBeNull();
    expect(inserted).toMatchObject({ code: 'TEMP', noteIndex: 0 });
    expect(fields).toEqual([{ id: (inserted as { id: string }).id, code: 'TEMP', text: '{Citation}', noteIndex: 0 }]);
    expect(host.activated).toBe(1);
  });

  it('puts the cited item in the references, linked to Zotero, showing what Zotero set', async () => {
    const host = await citedDocument();
    const t = host.t;
    expect(t.references).toHaveLength(1);
    expect(t.references![0]).toMatchObject({ title: 'NMR Chemical Shifts of Trace Impurities', doi: '10.1021/om100106e', live: { app: 'zotero', id: '1234', uris: [URI('ABCD1234')] } });
    const [id, o] = Object.entries(t.objects).find(([, x]) => x.kind === 'cite')!;
    expect(o).toMatchObject({ kind: 'cite', refs: [t.references![0].id], live: { app: 'zotero', id: 'cit1', code: fulmerCode, text: '1' } });
    expect(citationTexts(t).get(Number(id))).toBe('1');
    // superscript, as Zotero's ACS citation is
    expect(t.runs.find((r) => r.obj === Number(id))?.sup).toBe(true);
    // Zotero's preferences, kept as Word keeps them; its style is the document's
    expect(t.zoteroPrefs).toContain('<pref name="fieldType" value="Field"/>');
    expect(t.citeManager).toBe('zotero');
    expect(t.citeStyle).toBe('acs');
  });

  it('gives Zotero its preferences back as it set them, and the citation as its field', async () => {
    const host = await citedDocument();
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Document.complete', [D]],
    ]);
    expect(await runZotero('refresh', host, z.post)).toBe('done');
    expect(z.answers[1]).toBe(PREFS_HTTP);
    const fields = z.answers[2] as { id: string; code: string; text: string }[];
    expect(fields).toHaveLength(1);
    // Zotero's own code, untouched (its plainCitation matches the text: no "citation modified" warning)
    expect(fields[0].code).toBe(fulmerCode);
    expect(fields[0].text).toBe('1');
  });

  it('works out a citation changed here again, until Zotero refreshes it', async () => {
    const host = await citedDocument();
    const id = Number(Object.entries(host.t.objects).find(([, x]) => x.kind === 'cite')![0]);
    // a second reference added to the citation here (Insert Citation)
    const extra = { ...host.t.references![0], id: 'r-extra', title: 'Another', doi: '10.1/x', live: undefined };
    const cite = host.t.objects[id] as Extract<DocObject, { kind: 'cite' }>;
    host.t = { ...host.t, references: [...host.t.references!, extra], objects: { ...host.t.objects, [id]: { ...cite, refs: [...cite.refs, 'r-extra'] } } };
    expect(citationTexts(host.t).get(id)).toBe('1,2');
    const [field] = zoteroFields(host.t);
    expect(field.text).toBe('1,2');
    const json = JSON.parse(field.code.replace(/^ITEM CSL_CITATION /, ''));
    expect(json.citationID).toBe('cit1');
    expect(json.properties.plainCitation).toBe('1,2');
    expect(json.citationItems.map((c: { id: string }) => c.id)).toEqual(['1234', 'r-extra']);
    expect(json.citationItems[0].uris).toEqual([URI('ABCD1234')]);
  });

  it('edits the citation picked: Zotero finds it at the caret and changes what it cites', async () => {
    const host = await citedDocument();
    const id = Number(Object.entries(host.t.objects).find(([, x]) => x.kind === 'cite')![0]);
    host.picks = id;
    const both = itemCode('cit1', [{ id: 1234, uris: [URI('ABCD1234')], itemData: FULMER }, { id: 77, uris: [URI('EFGH5678')], itemData: SMITH, locator: '5', label: 'page' }], '1,2');
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.cursorInField', [D, 'Http']],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Field.setCode', [D, String(id), both]],
      () => ['Field.setText', [D, String(id), '<sup>1,2</sup>', false]],
      () => ['Document.complete', [D]],
    ]);
    expect(await runZotero('addEditCitation', host, z.post)).toBe('done');
    expect(z.answers[3]).toMatchObject({ id: String(id), code: fulmerCode, text: '1' });
    const o = host.t.objects[id] as Extract<DocObject, { kind: 'cite' }>;
    expect(host.t.references).toHaveLength(2);
    expect(o.refs).toHaveLength(2);
    // the page Zotero keeps with the second item
    expect(o.live?.items?.[o.refs[1]]).toMatchObject({ locator: '5', label: 'page' });
    expect(citationTexts(host.t).get(id)).toBe('1,2');
    expect(Object.values(host.t.objects).filter((x) => x.kind === 'cite')).toHaveLength(1);
  });

  it('puts in Zotero\'s bibliography, in a paragraph of its own, with its italic and bold', async () => {
    const host = await citedDocument();
    host.caret = rt.plainText(host.t.runs).length;
    let field = '';
    const bibl = 'BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY';
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.cursorInField', [D, 'Http']],
      () => ['Document.insertField', [D, 'Http', 0]],
      (last) => { field = (last as { id: string }).id; return ['Field.setCode', [D, field, 'TEMP']]; },
      () => ['Field.setCode', [D, field, bibl]],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Document.setBibliographyStyle', [D, -1440, 1440, 240, 240, [], 0]],
      () => ['Field.setText', [D, field, BIB_HTML.replace(/<div class="csl-entry"><div class="csl-left-margin">\(2\)[\s\S]*?<\/div><\/div>(?=<\/div>$)/, ''), true]],
      () => ['Document.complete', [D]],
    ]);
    expect(await runZotero('addEditBibliography', host, z.post)).toBe('done');
    const bibId = Number(field);
    const bib = host.t.objects[bibId];
    expect(bib).toMatchObject({ kind: 'bib', live: { code: bibl } });
    // its own paragraph
    const text = rt.plainText(host.t.runs);
    const at = objectOffsets(host.t.runs).get(bibId)!;
    expect(text[at - 1]).toBe('\n');
    expect(host.t.runs.find((r) => r.obj === bibId)?.sup).toBeFalsy();
    const entries = bibliography(host.t);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('(1)');
    expect(entries[0].pieces).toEqual([
      { text: 'Fulmer, G. R. NMR Chemical Shifts of Trace Impurities. ' }, { text: 'Organometallics', italic: true }, { text: ' ' },
      { text: '2010', bold: true }, { text: ', ' }, { text: '29', italic: true }, { text: ', 2176–2179.' },
    ]);
    // the bibliography Zotero sees is the one it set
    expect((z.answers[7] as { code: string }[]).map((f) => f.code)).toEqual([fulmerCode, bibl]);
  });

  it('unlinks: citations and the bibliography become plain text', async () => {
    const host = await citedDocument();
    const id = Number(Object.entries(host.t.objects).find(([, x]) => x.kind === 'cite')![0]);
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Document.displayAlert', [D, 'Unlinking citations will prevent Zotero from updating citations and the bibliography in this document. Are you sure you want to continue?', 1, 1]],
      () => ['Field.removeCode', [D, String(id)]],
      () => ['Document.setDocumentData', [D, PREFS_HTTP]],
      () => ['Document.complete', [D]],
    ]);
    host.answer = 0;
    expect(await runZotero('removeCodes', host, z.post)).toBe('done');
    expect(host.alerts[0].labels).toEqual(['OK', 'Cancel']);
    // OK counts 1, as in Word
    expect(z.answers[3]).toBe(1);
    expect(host.t.runs.some((r) => r.obj === id)).toBe(false);
    const cited = host.t.runs.find((r) => r.text === '1');
    expect(cited?.sup).toBe(true);
    expect(rt.plainText(host.t.runs)).toBe('Impurities were assigned1 as before.');
  });

  it('answers Zotero\'s alerts as its Word plugin does', async () => {
    const host = new TestHost();
    const ask = (buttons: number) => fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.displayAlert', [D, 'Question?', 1, buttons]],
      () => ['Document.complete', [D]],
    ]);
    const answer = async (buttons: number, chosen: number) => { host.answer = chosen; const z = ask(buttons); await runZotero('refresh', host, z.post); return z.answers[1]; };
    expect(await answer(0, 0)).toBe(0);
    expect(await answer(1, 0)).toBe(1);
    expect(await answer(1, 1)).toBe(0);
    expect(await answer(2, 0)).toBe(1);
    expect(await answer(2, 1)).toBe(0);
    expect(await answer(3, 0)).toBe(2);
    expect(await answer(3, 1)).toBe(1);
    expect(await answer(3, 2)).toBe(0);
    expect(await answer(3, -1)).toBe(0);
  });

  it('sends Zotero an error it can show, and carries on to the end', async () => {
    const host = new TestHost();
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Field.setText', [D, '999', '<sup>1</sup>', false]],
      () => ['Document.importDocument', [D, 'Http']],
      () => ['Document.complete', [D]],
    ]);
    expect(await runZotero('refresh', host, z.post)).toBe('done');
    expect(z.answers[1]).toMatchObject({ error: 'Chem Illustrator Error', message: expect.stringContaining('no longer in the document') });
    expect(z.answers[2]).toMatchObject({ error: 'Chem Illustrator Error' });
  });

  it('leaves no empty {Citation} behind when Zotero goes away part way (found in the 2026-11-03 review)', async () => {
    const host = new TestHost();
    const before = host.t.runs;
    const z = fakeZotero([
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.insertField', [D, 'Http', 0]],
      // Zotero quits while its citation window is open: the next post fails
    ]);
    await expect(runZotero('addEditCitation', host, z.post)).rejects.toThrow();
    expect(host.t.runs).toEqual(before);
    // a citation Zotero did fill in stays
    const done = await citedDocument();
    expect(Object.values(done.t.objects).filter((o) => o.kind === 'cite')).toHaveLength(1);
  });

  it('tells when Zotero is busy or not running', async () => {
    const host = new TestHost();
    expect(await runZotero('addEditCitation', host, fakeZotero([], { status: 503 }).post)).toBe('busy');
    expect(await runZotero('addEditCitation', host, async () => { throw new Error('Could not reach Zotero: connection refused'); })).toBe('offline');
  });

  it('saves Zotero\'s citation and bibliography as its Word fields, and reads them back', async () => {
    const host = await citedDocument();
    host.caret = rt.plainText(host.t.runs).length;
    let field = '';
    const bibl = 'BIBL {"uncited":[],"omitted":[],"custom":[["http://zotero.org/users/1/items/ABCD1234","Fulmer, edited"]]} CSL_BIBLIOGRAPHY';
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.insertField', [D, 'Http', 0]],
      (last) => { field = (last as { id: string }).id; return ['Field.setCode', [D, field, bibl]]; },
      () => ['Field.setText', [D, field, BIB_HTML, true]],
      () => ['Document.complete', [D]],
    ]);
    await runZotero('addEditBibliography', host, z.post);
    const files = unzipSync(await writeDocx(host.t, deps));
    const body = strFromU8(files['word/document.xml']);
    const instr = [...body.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((m) => m[1]).join('').replace(/&quot;/g, '"');
    expect(instr).toContain(`ADDIN ZOTERO_${fulmerCode}`);
    expect(instr).toContain(`ADDIN ZOTERO_${bibl}`);
    const custom = strFromU8(files['docProps/custom.xml']);
    expect(custom).toContain('ZOTERO_PREF_1');
    expect(custom).toContain('value=&quot;Field&quot;');
    const again = (await readDocx(await writeDocx(host.t, deps))).doc;
    expect(again.citeManager).toBe('zotero');
    expect(Object.values(again.objects).find((o) => o.kind === 'bib')).toMatchObject({ live: { code: bibl } });
    expect(again.references![0].live).toMatchObject({ app: 'zotero', uris: [URI('ABCD1234')] });
  });
});

describe('Zotero note styles (citations in footnotes)', () => {
  const NOTE_PREFS = PREFS_HTTP.replace('american-chemical-society', 'chicago-note-bibliography');
  const noteText = 'Gregory R. Fulmer, “NMR Chemical Shifts of Trace Impurities,” <i>Organometallics</i> 29 (2010): 2176–79.';
  const noteCode = itemCode('cit9', [{ id: 1234, uris: [URI('ABCD1234')], itemData: FULMER }], 'Gregory R. Fulmer, “NMR Chemical Shifts of Trace Impurities,” Organometallics 29 (2010): 2176–79.');
  const notes = (t: DocText) => Object.entries(t.objects).filter(([, o]) => o.kind === 'note') as [string, Extract<DocObject, { kind: 'note' }>][];

  async function footnoted(): Promise<{ host: TestHost; field: string; fieldsSeen: unknown }> {
    const host = new TestHost();
    let field = '';
    const z = fakeZotero([
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.setDocumentData', [D, NOTE_PREFS]],
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.cursorInField', [D, 'Http']],
      () => ['Document.insertField', [D, 'Http', 1]],
      (last) => { field = (last as { id: string }).id; return ['Field.setCode', [D, field, 'TEMP']]; },
      () => ['Field.setCode', [D, field, noteCode]],
      () => ['Field.setText', [D, field, noteText, false]],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Document.complete', [D]],
    ]);
    expect(await runZotero('addEditCitation', host, z.post)).toBe('done');
    return { host, field, fieldsSeen: z.answers[z.answers.length - 1] };
  }

  it('tells Zotero it has footnotes and endnotes, and puts a note style\'s citation in a new footnote', async () => {
    const { host, field, fieldsSeen } = await footnoted();
    const ns = notes(host.t);
    expect(ns).toHaveLength(1);
    const [noteId, note] = ns[0];
    expect(note.end).toBeUndefined();
    // the footnote's mark is at the caret, raised; the citation is in the footnote, not raised
    expect(host.t.runs.find((r) => r.obj === Number(noteId))).toMatchObject({ sup: true });
    const citeRun = note.runs.find((r) => r.obj === Number(field))!;
    expect(citeRun.sup).toBeFalsy();
    expect(host.t.objects[Number(field)]).toMatchObject({ kind: 'cite', refs: [host.t.references![0].id] });
    // Zotero is told which note it is in
    expect(fieldsSeen).toEqual([expect.objectContaining({ id: field, noteIndex: 1 })]);
    expect(citationTexts(host.t).get(Number(field))).toBe(htmlText(noteText));
  });

  it('puts a citation in an endnote when Zotero asks for one', async () => {
    const host = new TestHost();
    let id = '';
    const z = fakeZotero([
      () => ['Document.insertField', [D, 'Http', 2]],
      (last) => { id = (last as { id: string }).id; return ['Document.getFields', [D, 'Http']]; },
      () => ['Document.complete', [D]],
    ]);
    await runZotero('addEditCitation', host, z.post);
    expect(notes(host.t)[0][1].end).toBe(true);
    expect(z.answers[1]).toEqual([expect.objectContaining({ id, noteIndex: 1 })]);
  });

  it('counts footnotes and endnotes each on their own, in the order they come', () => {
    const t = { ...newDocument(), runs: [{ text: 'a' }, objectRun(2, { sup: true }), { text: 'b' }, objectRun(4, { sup: true }), { text: 'c' }, objectRun(6, { sup: true })] } as DocText;
    t.objects = {
      1: { kind: 'cite', refs: [] }, 2: { kind: 'note', runs: [objectRun(1)] },
      3: { kind: 'cite', refs: [] }, 4: { kind: 'note', end: true, runs: [objectRun(3)] },
      5: { kind: 'cite', refs: [] }, 6: { kind: 'note', runs: [{ text: 'See ' }, objectRun(5)] },
    };
    expect(zoteroFields(t).map((f) => [f.id, f.noteIndex])).toEqual([['1', 1], ['3', 1], ['5', 2]]);
  });

  it('moves citations into footnotes and back out as the style changes', async () => {
    const host = await citedDocument();
    const id = Object.entries(host.t.objects).find(([, o]) => o.kind === 'cite')![0];
    const before = rt.plainText(host.t.runs);
    await runZotero('setDocPrefs', host, fakeZotero([
      () => ['Document.convert', [D, [id], 'Http', [1]]],
      () => ['Document.complete', [D]],
    ]).post);
    const [noteId, note] = notes(host.t)[0];
    expect(note.runs.some((r) => r.obj === Number(id))).toBe(true);
    expect(host.t.runs.some((r) => r.obj === Number(id))).toBe(false);
    expect(host.t.runs.find((r) => r.obj === Number(noteId))).toMatchObject({ sup: true });
    // a footnote to an endnote
    await runZotero('setDocPrefs', host, fakeZotero([
      () => ['Document.convert', [D, [id], 'Http', [2]]],
      () => ['Document.complete', [D]],
    ]).post);
    expect(notes(host.t)[0][1].end).toBe(true);
    // and back into the text: the note goes, the citation is where its mark was
    await runZotero('setDocPrefs', host, fakeZotero([
      () => ['Document.convert', [D, [id], 'Http', [0]]],
      () => ['Document.complete', [D]],
    ]).post);
    expect(notes(host.t)).toHaveLength(0);
    expect(host.t.runs.some((r) => r.obj === Number(id))).toBe(true);
    expect(rt.plainText(host.t.runs)).toBe(before);
  });

  it('keeps a footnote\'s own words when its citation moves out of it', async () => {
    const host = new TestHost('Text.', 5);
    host.t = { ...host.t, runs: [{ text: 'Text.' }, objectRun(2, { sup: true })], objects: { 1: { kind: 'cite', refs: [] }, 2: { kind: 'note', runs: [{ text: 'As shown in ' }, objectRun(1)] } } };
    await runZotero('setDocPrefs', host, fakeZotero([
      () => ['Document.convert', [D, ['1'], 'Http', [0]]],
      () => ['Document.complete', [D]],
    ]).post);
    expect(host.t.objects[2]).toMatchObject({ kind: 'note', runs: [{ text: 'As shown in ' }] });
    expect(host.t.runs.map((r) => r.obj).filter((x) => x !== undefined)).toEqual([2, 1]);
  });

  it('shows the citation\'s text in the footnote', async () => {
    const { host } = await footnoted();
    const lay = new DocLayouter({ measure: (s: string, z: number) => s.length * z * 0.5, drawingSize: () => ({ w: 10, h: 10 }) });
    const doc = lay.layout(host.t);
    const [noteId, note] = notes(host.t)[0];
    const nl = lay.noteText(host.t, note.runs, note.paras, doc.fields.get(Number(noteId)) ?? '', 400, doc.fields);
    const shown = nl.lines.flatMap((l) => l.pieces.map((p) => p.shown ?? p.text)).join('');
    expect(doc.fields.get(Number(noteId))).toBe('1');
    expect(shown).toContain('Fulmer');
    expect(shown).toContain('Organometallics');
  });

  it('saves citations in footnotes as Zotero\'s Word fields, and reads them back live', async () => {
    const { host, field } = await footnoted();
    const files = unzipSync(await writeDocx(host.t, deps));
    const foot = strFromU8(files['word/footnotes.xml']);
    const instr = [...foot.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((m) => m[1]).join('').replace(/&quot;/g, '"');
    expect(instr).toContain(`ADDIN ZOTERO_${noteCode}`);
    expect(foot).toContain('Fulmer');
    const again = (await readDocx(await writeDocx(host.t, deps))).doc;
    const n = Object.values(again.objects).find((o) => o.kind === 'note') as Extract<DocObject, { kind: 'note' }>;
    const cid = n.runs.find((r) => r.obj !== undefined)!.obj!;
    expect(again.objects[cid]).toMatchObject({ kind: 'cite', live: { code: noteCode } });
    // the footnote shows what Zotero wrote in it, before any Refresh
    expect(citationTexts(again).get(cid)).toBe(htmlText(noteText));
    expect(zoteroFields(again)).toEqual([expect.objectContaining({ code: noteCode, noteIndex: 1 })]);
    expect(field).toBeTruthy();
  });

  it('works numbers out here again after reading a Word file, and then writes a code that says so', async () => {
    const host = await citedDocument();
    const again = (await readDocx(await writeDocx(host.t, deps))).doc;
    const [cid, cite] = Object.entries(again.objects).find(([, o]) => o.kind === 'cite')!;
    // Zotero's code is kept as it was; a number is not kept as text (it follows edits here)
    expect(cite).toMatchObject({ live: { code: fulmerCode } });
    expect((cite as Extract<DocObject, { kind: 'cite' }>).live!.text).toBeUndefined();
    expect(zoteroFields(again)[0].code).toBe(fulmerCode);
    // a citation before it: this one is 2 now, so its code is written again with what it shows
    const t2 = { ...again, runs: [objectRun(99, { sup: true }), ...again.runs], objects: { ...again.objects, 99: { kind: 'cite', refs: [again.references![0].id] } } } as DocText;
    const other = { ...t2, references: [...t2.references!, { ...t2.references![0], id: 'r-smith', title: 'Another', live: undefined }] };
    other.objects = { ...other.objects, 99: { kind: 'cite', refs: ['r-smith'] } };
    const f = zoteroFields(other).find((x) => x.id === cid)!;
    expect(f.text).toBe('2');
    expect(f.code).not.toBe(fulmerCode);
    expect(f.code).toContain('"plainCitation":"2"');
    expect(f.code).toContain('"citationID":"cit1"');
  });
});

describe('Zotero\'s HTML and preferences', () => {
  it('reads citation text as Zotero\'s own HTTP client does', () => {
    expect(htmlText('<sup>1–3</sup>')).toBe('1–3');
    expect(htmlText('(Fulmer <i>et al.</i>, 2010)')).toBe('(Fulmer et al., 2010)');
    expect(htmlSuper('<sup>1,2</sup>')).toBe(true);
    expect(htmlSuper('(1)')).toBe(false);
    expect(htmlSuper('see <sup>1</sup>')).toBe(false);
  });

  it('reads an author-date bibliography (no numbers)', () => {
    const got = bibFromHtml('<div class="csl-bib-body"><div class="csl-entry">Fulmer, G. R. (2010). <span style="font-style:italic;">Organometallics</span>, 29.</div></div>');
    expect(got).toEqual([{ label: '', pieces: [{ text: 'Fulmer, G. R. (2010). ' }, { text: 'Organometallics', italic: true }, { text: ', 29.' }] }]);
  });

  it('switches the field type between Zotero\'s HTTP one and Word\'s', () => {
    expect(withFieldType(PREFS_HTTP, 'Field')).toContain('<pref name="fieldType" value="Field"/>');
    expect(withFieldType(withFieldType(PREFS_HTTP, 'Field'), 'Http')).toBe(PREFS_HTTP);
    expect(withFieldType('<data><prefs></prefs></data>', 'Http')).toBe('<data><prefs><pref name="fieldType" value="Http"/></prefs></data>');
    expect(withFieldType('', 'Http')).toBe('');
  });
});
