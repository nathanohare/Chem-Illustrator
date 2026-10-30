// @vitest-environment jsdom
//
// References in a presentation: the deck's own list, the reference lines on the slides that show
// them (short form by default, numbered as the person picks), the References slide, copying
// references between files, and saving them in PowerPoint files and reading them back.

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Doc } from '../src/model';
import { Deck, placeRefs } from '../src/deck/deck';
import { blankRef, piecesText, type Reference } from '../src/document/references';
import {
  cleanDeckRefs, cleanLook, cleanSlideRefs, deckNumbers, layoutEntries, mergeReferences, refLook, refsSlideBlock, slideRefBlock, slideRefPieces, slideRefsTag,
} from '../src/deck/slide-refs';
import { citeFormat } from '../src/document/cite-styles';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };

const ref = (id: string, extra: Partial<Reference> = {}): Reference => ({
  ...blankRef('article', id),
  authors: ['Fulmer, Gregory R.', 'Miller, Alexander J. M.', 'Goldberg, Karen I.'],
  title: 'NMR Chemical Shifts of Trace Impurities', journal: 'Organometallics', year: '2010', volume: '29', issue: '9', pages: '2176–2179', doi: '10.1021/om100106e',
  ...extra,
});
const jacs = ref('r-b', { authors: ['Smith, John'], title: 'Another', journal: 'J. Am. Chem. Soc.', year: '2020', volume: '142', pages: '1234–1240', doi: '10.1021/jacs.0c00001' });
const measure = (t: string, size: number) => t.length * size * 0.5;

function deck(n = 3): Deck {
  const d = Deck.blank(new Doc());
  d.attach();
  for (let i = 1; i < n; i++) d.addSlide('title-content');
  return d;
}

describe('slide lines', () => {
  it('writes the short form in the style\'s look: journal, year, volume, first page', () => {
    const f = citeFormat('acs');
    expect(piecesText(slideRefPieces(ref('a'), 'short', f))).toBe('Organometallics 2010, 29, 2176.');
    const pieces = slideRefPieces(ref('a'), 'short', f);
    expect(pieces.find((p) => p.text === 'Organometallics')?.italic).toBe(true);
    expect(pieces.find((p) => p.text === '2010')?.bold).toBe(true);
    // the first author (and et al.) in front, as the style writes names
    expect(piecesText(slideRefPieces(ref('a'), 'author', f))).toBe('Fulmer, G. R.; et al. Organometallics 2010, 29, 2176.');
    // the full entry, with its title and all its pages
    expect(piecesText(slideRefPieces(ref('a'), 'full', f))).toContain('NMR Chemical Shifts of Trace Impurities');
    expect(piecesText(slideRefPieces(ref('a'), 'full', f))).toContain('2176–2179');
    // an article just published online gives its DOI
    expect(piecesText(slideRefPieces(ref('a', { pages: '', volume: '' }), 'short', f))).toContain('10.1021/om100106e');
  });

  it('shows the references ticked on a slide, numbered on the slide or through the deck', () => {
    const d = deck();
    d.setRefs({ list: [ref('r-a'), jacs] });
    expect(d.page(0).refs).toBeUndefined();
    d.setSlideRefs([1], ['r-b']);
    d.setSlideRefs([2], ['r-a', 'r-b']);
    const b2 = slideRefBlock(d.settings.refs, d.slides, 2)!;
    expect(b2.entries.map((e) => e.label)).toEqual(['', '']);
    expect(d.page(2).refs?.entries).toHaveLength(2);
    // numbered through the deck: as the slides first show them
    d.setSlideRefs([2], ['r-a', 'r-b'], { numbering: 'deck' });
    expect(slideRefBlock(d.settings.refs, d.slides, 2)!.entries.map((e) => e.label)).toEqual(['(2)', '(1)']);
    // numbered on the slide (Apply to All: every slide, none keeps its own look)
    d.setSlideRefs([2], ['r-a', 'r-b'], undefined, { numbering: 'slide' });
    expect(d.slides[2].refLook).toBeUndefined();
    expect(slideRefBlock(d.settings.refs, d.slides, 2)!.entries.map((e) => e.label)).toEqual(['(1)', '(2)']);
    expect(slideRefBlock(d.settings.refs, d.slides, 1)!.entries.map((e) => e.label)).toEqual(['(1)']);
  });

  it('undoes and redoes ticking references, and drops a deleted reference from the slides', () => {
    const d = deck(2);
    d.setRefs({ list: [ref('r-a'), jacs] });
    d.setSlideRefs([1], ['r-a', 'r-b']);
    expect(d.slides[1].refs).toEqual(['r-a', 'r-b']);
    d.undo();
    expect(d.slides[1].refs).toBeUndefined();
    d.redo();
    expect(d.slides[1].refs).toEqual(['r-a', 'r-b']);
    d.setRefs({ list: [jacs] }, 'Delete reference');
    expect(d.slides[1].refs).toEqual(['r-b']);
    d.undo();
    expect(d.slides[1].refs).toEqual(['r-a', 'r-b']);
    expect(d.references).toHaveLength(2);
  });

  it('wraps long lines at words, indented under a number, and lays them out above the footer row', () => {
    const lines = layoutEntries([{ id: 'x', label: '(1)', pieces: [{ text: 'aaaa bbbb cccc dddd' }] }], 60, 10, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].first).toBe(true);
    expect(lines[1].first).toBeUndefined();
    expect(lines[1].pieces[0].x).toBeCloseTo(measure('(1) ', 10));
    const d = deck(2);
    d.setRefs({ list: [ref('r-a')] });
    d.setSlideRefs([1], ['r-a']);
    const p = placeRefs(d.page(1), measure)!;
    // above the slide number at the bottom right
    expect(p.top + p.lines.length * 12).toBeLessThan(d.size.h * 0.95);
    expect(p.align).toBe('left');
  });
});

describe('References slide', () => {
  it('lists the references the slides show, in order, full, and keeps itself up to date', () => {
    const d = deck(3);
    d.setRefs({ list: [ref('r-a'), jacs, ref('r-c', { doi: '10.1/c', title: 'Third' })] });
    d.setSlideRefs([1], ['r-b']);
    d.setSlideRefs([2], ['r-a']);
    const s = d.insertRefsSlide(3, { which: 'shown' });
    const i = d.slides.indexOf(s);
    const b = d.page(i).refs!;
    expect(b.list).toBe(true);
    expect(b.entries.map((e) => e.id)).toEqual(['r-b', 'r-a']);
    expect(piecesText(b.entries[1].pieces)).toContain('NMR Chemical Shifts');
    expect(refsSlideBlock(d.settings.refs, d.slides, { which: 'all' })!.entries.map((e) => e.id)).toEqual(['r-b', 'r-a', 'r-c']);
    d.setSlideRefs([1], []);
    expect(d.page(i).refs!.entries.map((e) => e.id)).toEqual(['r-a']);
    expect(deckNumbers(d.settings.refs, d.slides).get('r-a')).toBe(1);
    // one undo step takes it away
    d.undo(); d.undo();
    expect(d.slides.some((x) => x.refList)).toBe(false);
  });
});

describe('copying references', () => {
  it('copies independently, keeping references already there and giving clashing ids new ones', () => {
    const into = [ref('r-a')];
    const { list, added, ids } = mergeReferences(into, [ref('r-x'), { ...jacs, id: 'r-a' }]);
    expect(added).toHaveLength(1);
    expect(ids.get('r-x')).toBe('r-a');
    expect(ids.get('r-a')).not.toBe('r-a');
    expect(list).toHaveLength(2);
    added[0].title = 'changed';
    expect(jacs.title).toBe('Another');
  });

  it('brings the references a slide shows when it is pasted into another deck', () => {
    const a = deck(2);
    a.setRefs({ list: [ref('r-a'), jacs] });
    a.setSlideRefs([1], ['r-b']);
    const b = deck(1);
    b.setRefs({ list: [{ ...jacs, id: 'r-own' }] });
    a.detach();
    b.attach();
    b.pasteSlides(a.copySlides([1]));
    expect(b.references).toHaveLength(1);
    expect(b.slides[1].refs).toEqual(['r-own']);
    const c = deck(1);
    c.pasteSlides(a.copySlides([1]));
    expect(c.references.map((r) => r.doi)).toEqual([jacs.doi]);
    c.undo();
    expect(c.references).toHaveLength(0);
  });
});

describe('PowerPoint files', () => {
  it('saves the list, each slide\'s references and the lines as text, and reads them back', async () => {
    const d = deck(3);
    d.setRefs({ list: [ref('r-a'), jacs], style: 'acs', look: { place: 'bottom-right' } });
    d.setSlideRefs([1], ['r-a', 'r-b'], { size: 12 });
    d.insertRefsSlide(3, { which: 'all' });
    const bytes = await writePptx({
      size: d.size, master: d.master, settings: d.settings,
      slides: d.slides.map((s, i) => ({ id: s.id, layout: s.layout, doc: d.docOf(i), notes: s.notes, refs: s.refs, refLook: s.refLook, refList: s.refList })),
    }, opts);
    const files = unzipSync(bytes);
    const slide2 = strFromU8(files['ppt/slides/slide2.xml']);
    // the lines as text PowerPoint shows, with the journal in italics
    expect(slide2).toContain('name="Reference Lines"');
    expect(slide2).toMatch(/i="1"[^>]*>.*?<a:t>Organometallics<\/a:t>/);
    expect(strFromU8(files['ppt/slides/slide4.xml'])).toContain('name="References"');
    const back = readPptx(bytes);
    expect(back.settings?.refs?.list.map((r) => r.id)).toEqual(['r-a', 'r-b']);
    expect(back.settings?.refs?.look).toEqual({ place: 'bottom-right' });
    expect(back.slides[1].refs).toEqual(['r-a', 'r-b']);
    expect(back.slides[1].refLook).toEqual({ size: 12 });
    expect(back.slides[3].refList).toEqual({ which: 'all' });
    // the lines are made again from the references, not read as a text box
    const texts = back.slides[1].contents.captions.map((c) => c.runs.map((r) => r.text).join(''));
    expect(texts.some((t) => t.includes('Organometallics'))).toBe(false);
  });

  it('reads damaged reference data without stopping', () => {
    expect(cleanDeckRefs({ list: [{ id: 'x', authors: 'A, B; C, D' }, { id: 'x' }, 7], look: { size: 'big', form: 'author' } })).toEqual({
      list: [expect.objectContaining({ id: 'x', authors: ['A, B', 'C, D'] })], look: { form: 'author' },
    });
    expect(cleanSlideRefs({ refs: ['a', 3, 'a'], refList: { which: 'nonsense' } })).toEqual({ refs: ['a'], refList: { which: 'shown' } });
    expect(cleanLook({ place: 'middle', size: 2 })).toMatchObject({ place: 'bottom-left', size: 10 });
    expect(slideRefsTag({})).toBeNull();
    expect(refLook(undefined, { form: 'full' }).form).toBe('full');
  });
});

describe('the References window', () => {
  it('lists every open file\'s references in groups and copies references between files', async () => {
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
    (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => {};
    const { ReferencesDialog } = await import('../src/ui/references-dialog');
    const { deckHolder } = await import('../src/ui/ref-holders');
    const talk = deck(2);
    talk.setRefs({ list: [ref('r-a'), jacs] });
    talk.setSlideRefs([1], ['r-a']);
    const other = deck(1);
    const changed: string[] = [];
    const holders = () => [deckHolder('1', 'Talk.pptx', talk, false, () => changed.push('1')), deckHolder('2', 'Poster.pptx', other, true, () => changed.push('2'))];
    const flashes: string[] = [];
    const w = new ReferencesDialog({ holders, current: () => '1', flash: (m) => flashes.push(m), pickFile: async () => null });
    void w.open('r-a');
    const groups = [...document.querySelectorAll<HTMLTableRowElement>('.refs-table tr.refs-group')];
    expect(groups.map((g) => g.dataset.group)).toEqual(['1', '2']);
    expect(groups[0].textContent).toContain('Talk.pptx');
    expect(groups[1].textContent).toContain('Design');
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('.refs-table tr[data-id]')];
    expect(rows.map((r) => r.lastElementChild!.textContent)).toEqual(['on 1 slide', 'on no slide']);
    expect(rows[0].classList.contains('picked')).toBe(true);
    // Copy To: the other file gets its own copy
    w.copyInto('2', [talk.references[0]]);
    expect(other.references.map((r) => r.doi)).toEqual([talk.references[0].doi]);
    expect(changed).toEqual(['2']);
    other.references[0].title = 'edited in the poster';
    expect(talk.references[0].title).toBe('NMR Chemical Shifts of Trace Impurities');
    // copying it again adds nothing
    w.copyInto('2', [talk.references[0]]);
    expect(other.references).toHaveLength(1);
    expect(flashes.at(-1)).toContain('already');
    // one step of Undo in the poster takes the copy back
    other.undo();
    expect(other.references).toHaveLength(0);
    document.querySelector<HTMLDialogElement>('dialog.refs-dialog')!.close();
  });

  it('writes references as formatted text for a canvas', async () => {
    const { referenceRuns } = await import('../src/deck/slide-refs');
    const runs = referenceRuns([ref('a'), jacs], 'short', citeFormat('acs'), true);
    expect(runs.map((r) => r.text).join('')).toBe('(1) Organometallics 2010, 29, 2176.\n(2) J. Am. Chem. Soc. 2020, 142, 1234.');
    expect(runs.find((r) => r.text === 'Organometallics')?.italic).toBe(true);
  });
});
