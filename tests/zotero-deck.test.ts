// @vitest-environment jsdom
//
// Citing with Zotero in a presentation (src/deck/zotero-deck.ts): slides' references as Zotero's
// citations and the References slide as its bibliography, with a stand-in for Zotero.

import { describe, it, expect } from 'vitest';
import { DeckStore, type DeckZoteroHost, type ZoteroSlide } from '../src/deck/zotero-deck';
import { runZoteroOn, type ZoteroCommand, type ZoteroPost } from '../src/document/zotero-live';
import { cleanDeckRefs, cleanSlideRefs, refsSlideBlock, slideRefBlock, slideRefsTag, type DeckRefs, type SlideRefs } from '../src/deck/slide-refs';

const FULMER = { id: 1234, type: 'article-journal', title: 'NMR Chemical Shifts of Trace Impurities', 'container-title': 'Organometallics', author: [{ family: 'Fulmer', given: 'Gregory R.' }], issued: { 'date-parts': [[2010]] }, volume: '29', page: '2176-2179', DOI: '10.1021/om100106e' };
const SMITH = { id: 77, type: 'article-journal', title: 'A second paper', 'container-title': 'J. Am. Chem. Soc.', author: [{ family: 'Smith', given: 'Jane' }], issued: { 'date-parts': [['2021']] }, volume: '143', page: '1-10', DOI: '10.1021/jacs.0c00001' };
const URI = (k: string) => `http://zotero.org/users/1/items/${k}`;
const itemCode = (id: string, items: object[], shown: string) => `ITEM CSL_CITATION ${JSON.stringify({ citationID: id, properties: { formattedCitation: shown, plainCitation: shown, noteIndex: 0 }, citationItems: items, schema: 'https://github.com/citation-style-language/schema/raw/master/csl-citation.json' })}`;
const PREFS_HTTP = '<data data-version="3" zotero-version="7.0.11"><session id="Z9y8X7w6"/><style id="http://www.zotero.org/styles/angewandte-chemie" locale="en-US" hasBibliography="1" bibliographyStyleHasBeenSet="0"/><prefs><pref name="fieldType" value="Http"/></prefs></data>';
const BIB_HTML = '<div class="csl-bib-body"><div class="csl-entry"><div class="csl-left-margin">[1]</div><div class="csl-right-inline">G. R. Fulmer, <i>Organometallics</i> <b>2010</b>, <i>29</i>, 2176–2179.</div></div><div class="csl-entry"><div class="csl-left-margin">[2]</div><div class="csl-right-inline">J. Smith, <i>J. Am. Chem. Soc.</i> <b>2021</b>, <i>143</i>, 1–10.</div></div></div>';
const D = 'deck';

/** A presentation of plain slides, changed as the Deck changes them. */
class TestDeck implements DeckZoteroHost {
  readonly docId = D;
  refs: DeckRefs | undefined = undefined;
  slides: ZoteroSlide[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
  current = 1;
  changes = 0;
  shown: number[] = [];
  state() { return { refs: this.refs, slides: this.slides, current: this.current }; }
  change(refs: DeckRefs | undefined, slides: Map<number, SlideRefs>): void {
    this.changes++;
    this.refs = refs ? structuredClone(refs) : undefined;
    this.slides = this.slides.map((s) => (slides.has(s.id) ? { id: s.id, ...structuredClone(slides.get(s.id)!) } : s));
  }
  addRefsSlide(): number { const id = 100; this.slides = [...this.slides, { id, refList: { which: 'shown' } }]; return id; }
  removeSlide(id: number): void { this.slides = this.slides.filter((s) => s.id !== id); }
  goTo(id: number): void { this.shown.push(id); }
  async choose(): Promise<number> { return 0; }
  activate(): void {}
}

function fakeZotero(steps: ((last: unknown) => [string, unknown[]])[]): { post: ZoteroPost; answers: unknown[] } {
  const answers: unknown[] = [];
  let i = 0;
  const post: ZoteroPost = async (endpoint, body) => {
    if (endpoint === 'respond') answers.push(JSON.parse(body));
    const [command, args] = steps[i++](answers[answers.length - 1]);
    return { status: 200, text: JSON.stringify({ command, arguments: args }) };
  };
  return { post, answers };
}
const run = (command: ZoteroCommand, deck: TestDeck, steps: ((last: unknown) => [string, unknown[]])[]) => {
  const z = fakeZotero(steps);
  return runZoteroOn(command, new DeckStore(deck, command), z.post).then((got) => ({ got, answers: z.answers }));
};

const both = itemCode('c1', [{ id: 1234, uris: [URI('ABCD1234')], itemData: FULMER }, { id: 77, uris: [URI('EFGH5678')], itemData: SMITH }], '[1,2]');

async function citedDeck(): Promise<TestDeck> {
  const deck = new TestDeck();
  let field = '';
  const { got } = await run('addEditCitation', deck, [
    () => ['Application.getActiveDocument', []],
    () => ['Document.getDocumentData', [D]],
    () => ['Document.setDocumentData', [D, PREFS_HTTP]],
    () => ['Document.canInsertField', [D, 'Http']],
    () => ['Document.cursorInField', [D, 'Http']],
    () => ['Document.insertField', [D, 'Http', 0]],
    (last) => { field = (last as { id: string }).id; return ['Field.setCode', [D, field, 'TEMP']]; },
    () => ['Document.getFields', [D, 'Http']],
    () => ['Field.setCode', [D, field, both]],
    () => ['Field.setText', [D, field, '[1,2]', false]],
    () => ['Document.complete', [D]],
  ]);
  expect(got).toBe('done');
  return deck;
}

describe('Zotero in a presentation', () => {
  it('puts the references Zotero picks on the slide being shown', async () => {
    const deck = await citedDeck();
    expect(deck.refs?.list.map((r) => r.title)).toEqual(['NMR Chemical Shifts of Trace Impurities', 'A second paper']);
    expect(deck.refs?.list[0].live).toMatchObject({ app: 'zotero', uris: [URI('ABCD1234')] });
    // Zotero's style is the presentation's
    expect(deck.refs?.style).toBe('angewandte');
    expect(deck.refs?.zoteroPrefs).toContain('value="Field"');
    const slide = deck.slides[1];
    expect(slide.refs).toEqual(deck.refs!.list.map((r) => r.id));
    expect(slide.zotero).toMatchObject({ id: 'c1', code: both, text: '[1,2]' });
    // the lines at its foot are the app's own short form
    const block = slideRefBlock(deck.refs, deck.slides, 1)!;
    expect(block.entries.map((e) => e.pieces.map((p) => p.text).join(''))).toHaveLength(2);
    expect(deck.slides[0].refs).toBeUndefined();
  });

  it('finds the slide\'s citation when the slide is shown again, and gives Zotero its own code', async () => {
    const deck = await citedDeck();
    const { answers } = await run('addEditCitation', deck, [
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.cursorInField', [D, 'Http']],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Document.complete', [D]],
    ]);
    expect(answers[1]).toBe(PREFS_HTTP);
    expect(answers[3]).toEqual({ id: 's2', code: both, text: '[1,2]', noteIndex: 0 });
    expect(answers[4]).toEqual([{ id: 's2', code: both, text: '[1,2]', noteIndex: 0 }]);
  });

  it('makes the References slide Zotero\'s bibliography, in Zotero\'s style', async () => {
    const deck = await citedDeck();
    deck.current = 0;
    let field = '';
    const { got, answers } = await run('addEditBibliography', deck, [
      () => ['Application.getActiveDocument', []],
      () => ['Document.getDocumentData', [D]],
      () => ['Document.getFields', [D, 'Http']],
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.cursorInField', [D, 'Http']],
      () => ['Document.insertField', [D, 'Http', 0]],
      (last) => { field = (last as { id: string }).id; return ['Field.setCode', [D, field, 'BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY']]; },
      () => ['Field.setText', [D, field, BIB_HTML, true]],
      () => ['Document.complete', [D]],
    ]);
    expect(got).toBe('done');
    // never "in" a slide's citation: a bibliography is a slide of its own
    expect(answers[4]).toBeNull();
    expect(field).toBe('b100');
    const refsSlide = deck.slides.find((s) => s.id === 100)!;
    expect(refsSlide.refList?.zotero?.code).toMatch(/^BIBL/);
    const block = refsSlideBlock(deck.refs, deck.slides, refsSlide.refList!)!;
    expect(block.entries.map((e) => e.label)).toEqual(['[1]', '[2]']);
    expect(block.entries[0].pieces).toContainEqual({ text: 'Organometallics', italic: true });
    expect(block.entries[0].pieces).toContainEqual({ text: '2010', bold: true });
  });

  it('works the References slide out again when the slides show something else', async () => {
    const deck = await citedDeck();
    deck.current = 0;
    let field = '';
    await run('addEditBibliography', deck, [
      () => ['Application.getActiveDocument', []],
      () => ['Document.insertField', [D, 'Http', 0]],
      (last) => { field = (last as { id: string }).id; return ['Field.setText', [D, field, BIB_HTML, true]]; },
      () => ['Document.complete', [D]],
    ]);
    // one reference no longer shown
    deck.slides = deck.slides.map((s) => (s.id === 2 ? { ...s, refs: s.refs!.slice(0, 1) } : s));
    const refsSlide = deck.slides.find((s) => s.id === 100)!;
    const block = refsSlideBlock(deck.refs, deck.slides, refsSlide.refList!)!;
    expect(block.entries).toHaveLength(1);
    expect(block.entries[0].pieces.some((p) => p.text.includes('Fulmer'))).toBe(true);
  });

  it('takes a slide\'s references off when Zotero deletes its citation, and unlinks', async () => {
    const deck = await citedDeck();
    await run('removeCodes', deck, [
      () => ['Application.getActiveDocument', []],
      () => ['Field.removeCode', [D, 's2']],
      () => ['Document.complete', [D]],
    ]);
    expect(deck.slides[1].zotero).toBeUndefined();
    expect(deck.slides[1].refs).toHaveLength(2);
    await run('addEditCitation', deck, [
      () => ['Application.getActiveDocument', []],
      () => ['Field.delete', [D, 's2']],
      () => ['Document.complete', [D]],
    ]);
    expect(deck.slides[1].refs).toBeUndefined();
  });

  it('won\'t put a citation on the References slide', async () => {
    const deck = new TestDeck();
    deck.slides[1] = { id: 2, refList: { which: 'shown' } };
    const { answers } = await run('addEditCitation', deck, [
      () => ['Application.getActiveDocument', []],
      () => ['Document.canInsertField', [D, 'Http']],
      () => ['Document.complete', [D]],
    ]);
    expect(answers[1]).toBe(false);
  });

  it('keeps Zotero\'s say on slides and the deck in the PowerPoint file', async () => {
    const deck = await citedDeck();
    const s = deck.slides[1];
    const back = cleanSlideRefs(JSON.parse(slideRefsTag(s)!));
    expect(back.zotero).toEqual(s.zotero);
    const list: SlideRefs = { refList: { which: 'shown', zotero: { code: 'BIBL {}', entries: [{ label: '[1]', pieces: [{ text: 'A', italic: true }] }], for: 'r1' } } };
    expect(cleanSlideRefs(JSON.parse(slideRefsTag(list)!))).toEqual(list);
    expect(cleanDeckRefs(JSON.parse(JSON.stringify(deck.refs)))?.zoteroPrefs).toBe(deck.refs!.zoteroPrefs);
  });
});

describe('Zotero\'s changes in a real presentation', () => {
  it('undoes one Zotero command in one step, and saves Zotero\'s say in the PowerPoint file', async () => {
    const { Doc } = await import('../src/model');
    const { Deck } = await import('../src/deck/deck');
    const { writePptx } = await import('../src/io/pptx-write');
    const { readPptx } = await import('../src/io/pptx-read');
    const d = Deck.blank(new Doc());
    d.attach();
    d.addSlide('title-content');
    const id = d.slides[1].id;
    const ref = { id: 'r1', type: 'article' as const, authors: ['Fulmer, G. R.'], title: 'Shifts', journal: 'Organometallics', year: '2010', volume: '29', issue: '', pages: '2176', doi: '', url: '', publisher: '', editors: [], book: '', note: '' };
    d.setRefState({ list: [ref], zoteroPrefs: '<data/>' }, new Map(), 'Zotero', false);
    d.setRefState({ list: [ref], zoteroPrefs: '<data/>' }, new Map([[id, { refs: ['r1'], zotero: { code: 'ITEM CSL_CITATION {}', text: '1', for: 'r1' } }]]), 'Zotero', true);
    expect(d.slides[1].refs).toEqual(['r1']);
    expect(d.slides[1].zotero?.text).toBe('1');
    const bytes = await writePptx({
      size: d.size, master: d.master, settings: d.settings,
      slides: d.slides.map((s, i) => ({ id: s.id, layout: s.layout, doc: d.docOf(i), notes: s.notes, refs: s.refs, refLook: s.refLook, refList: s.refList, zotero: s.zotero })),
    }, { picture: async () => ({ png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), w: 1, h: 1 }) } as never);
    const back = readPptx(bytes);
    expect(back.slides[1].zotero).toEqual({ code: 'ITEM CSL_CITATION {}', text: '1', for: 'r1' });
    expect(back.settings?.refs?.zoteroPrefs).toBe('<data/>');
    // both changes go back in one Undo
    expect(d.undo()).toBe(true);
    expect(d.slides[1].refs).toBeUndefined();
    expect(d.slides[1].zotero).toBeUndefined();
    expect(d.settings.refs).toBeUndefined();
    expect(d.redo()).toBe(true);
    expect(d.slides[1].refs).toEqual(['r1']);
  });
});
