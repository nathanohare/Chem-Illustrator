// References in a presentation: the deck's own reference list (kept in its PowerPoint file, as a
// document keeps its list in its Word file), the reference lines the app writes at the foot of
// the slides that show them (ticked slide by slide, like the slide number and footer), and the
// References slide, which lists them all and keeps itself up to date.
//
// Slide lines use a short form by default, as chemistry talks print them: the journal, year,
// volume and first page in the journal style's own look ("J. Am. Chem. Soc. 2020, 142, 1234."),
// with the first author in front, or the style's full entry, as the person picks.

import { citeFormat, preferredStyle, type CiteFormat } from '../document/cite-styles';
import { bibLabel, cleanRef, findDuplicate, formatReference, newRefId, type CiteStyle, type Piece, type Reference } from '../document/references';

/** How each reference is written on a slide: the short form, the first author and the short form, or the style's full entry. */
export type RefForm = 'short' | 'author' | 'full';
/** Numbers in front of the lines: none, 1, 2… on each slide, or each reference's number in the deck (as the References slide numbers it). */
export type RefNumbering = 'none' | 'slide' | 'deck';
/** Where on the slide the lines go. */
export type RefPlace = 'bottom-left' | 'bottom-centre' | 'bottom-right' | 'top-right';

export interface RefLook {
  form: RefForm;
  numbering: RefNumbering;
  place: RefPlace;
  /** Size of the lines, in points (made smaller when they would take too much of the slide). */
  size: number;
  /** Their colour; the master's footer colour when not set. */
  color?: string;
}

export const REF_FORMS: Record<RefForm, string> = {
  short: 'Journal, year, volume, page',
  author: 'First author, then journal, year, volume, page',
  full: 'Full reference (the citation style\'s entry)',
};
export const REF_NUMBERINGS: Record<RefNumbering, string> = {
  none: 'No numbers',
  slide: 'Numbered on each slide (1, 2, 3…)',
  deck: 'Numbered through the presentation (as on the References slide)',
};
export const REF_PLACES: Record<RefPlace, string> = {
  'bottom-left': 'Bottom left', 'bottom-centre': 'Bottom centre', 'bottom-right': 'Bottom right', 'top-right': 'Top right',
};

export const defaultRefLook = (): RefLook => ({ form: 'short', numbering: 'none', place: 'bottom-left', size: 10 });

/** A presentation's references: the list, its citation style (with any details changed), and how the slide lines look. */
export interface DeckRefs {
  list: Reference[];
  style?: CiteStyle;
  options?: Partial<CiteFormat>;
  look?: Partial<RefLook>;
}

/** What the References slide lists: the references shown on slides (in the order they first appear) or every reference in the list. */
export interface RefListSpec { which: 'shown' | 'all' }

/** What a slide says about references: which it shows, its own look (Apply rather than Apply to All), and whether it is the References slide. */
export interface SlideRefs { refs?: string[]; refLook?: Partial<RefLook>; refList?: RefListSpec }

/** The look of the lines on a slide: the deck's, with the slide's own changes. */
export function refLook(d: DeckRefs | undefined, own?: Partial<RefLook>): RefLook {
  return cleanLook({ ...defaultRefLook(), ...(d?.look ?? {}), ...(own ?? {}) });
}

/** The citation style the deck's references are written in (the person's own style until one is chosen). */
export function deckFormat(d: DeckRefs | undefined): CiteFormat {
  if (d?.style) return citeFormat(d.style, d.options);
  const p = preferredStyle();
  return citeFormat(p.style, p.options);
}

const FORMS = new Set<RefForm>(['short', 'author', 'full']);
const NUMBERINGS = new Set<RefNumbering>(['none', 'slide', 'deck']);
const PLACES = new Set<RefPlace>(['bottom-left', 'bottom-centre', 'bottom-right', 'top-right']);

/** A look with every value of the right kind (anything wrong from a damaged file falls back to the default). */
export function cleanLook(l: Partial<Record<keyof RefLook, unknown>>): RefLook {
  const d = defaultRefLook();
  const size = Number(l.size);
  return {
    form: FORMS.has(l.form as RefForm) ? (l.form as RefForm) : d.form,
    numbering: NUMBERINGS.has(l.numbering as RefNumbering) ? (l.numbering as RefNumbering) : d.numbering,
    place: PLACES.has(l.place as RefPlace) ? (l.place as RefPlace) : d.place,
    size: Number.isFinite(size) && size >= 4 && size <= 72 ? size : d.size,
    ...(typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? { color: l.color } : {}),
  };
}

/** The changes from the default look only (what is saved). */
export function lookChanges(l: Partial<RefLook>): Partial<RefLook> {
  const d = defaultRefLook() as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.entries(cleanLook(l)).filter(([k, v]) => k in l && d[k] !== v)) as Partial<RefLook>;
}

/** A deck's references read from a file: every reference tidied, ids made unique. */
export function cleanDeckRefs(raw: unknown): DeckRefs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const list = (Array.isArray(r.list) ? r.list : []).filter((x) => x && typeof x === 'object').map((x) => cleanRef(x as Partial<Record<keyof Reference, unknown>>))
    .filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  const out: DeckRefs = { list };
  if (typeof r.style === 'string') out.style = r.style;
  if (r.options && typeof r.options === 'object') out.options = r.options as Partial<CiteFormat>;
  if (r.look && typeof r.look === 'object') {
    const look = lookChanges(r.look as Partial<RefLook>);
    if (Object.keys(look).length) out.look = look;
  }
  return out;
}

/** A slide's references read from a file (ids only of strings, a look of the right kind). */
export function cleanSlideRefs(raw: unknown): SlideRefs {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: SlideRefs = {};
  const ids = Array.isArray(r.refs) ? [...new Set(r.refs.filter((x): x is string => typeof x === 'string'))] : [];
  if (ids.length) out.refs = ids;
  if (r.refLook && typeof r.refLook === 'object') {
    const look = lookChanges(r.refLook as Partial<RefLook>);
    if (Object.keys(look).length) out.refLook = look;
  }
  if (r.refList && typeof r.refList === 'object') out.refList = { which: (r.refList as { which?: unknown }).which === 'all' ? 'all' : 'shown' };
  return out;
}

/** The slide's own say as saved in its tag, or null when it has none. */
export function slideRefsTag(s: SlideRefs): string | null {
  const out: SlideRefs = {};
  if (s.refs?.length) out.refs = s.refs;
  if (s.refLook && Object.keys(s.refLook).length) out.refLook = s.refLook;
  if (s.refList) out.refList = { which: s.refList.which };
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/**
 * A reference as a slide line writes it. The short form is the style's own entry with the
 * authors and title left out and the first page only ("J. Am. Chem. Soc. 2020, 142, 1234.");
 * `author` puts the first author (and et al.) in front, as the style writes names; `full` is the
 * style's whole entry (or its typed-over text).
 */
export function slideRefPieces(r: Reference, form: RefForm, f: CiteFormat): Piece[] {
  if (form === 'full') return r.typed !== undefined ? [{ text: r.typed }] : formatReference(r, f);
  const short: CiteFormat = { ...f, title: false, firstPageOnly: true, issue: false, doi: f.doi === 'never' ? 'never' : 'no-pages' };
  if (form === 'author') return formatReference(r, { ...short, etAlOver: 1, etAlShow: 1 });
  // a book or thesis has no journal: its title stays
  return formatReference({ ...r, authors: [], note: '' }, short);
}

/** A line of the reference block: its number as the style labels it (or none) and its text. */
export interface RefEntry { id: string; label: string; pieces: Piece[] }

/** What a slide draws: its lines (or the References slide's list), in a look. */
export interface RefBlock { entries: RefEntry[]; look: RefLook; /** The References slide: its list, in the body of the slide. */ list?: true }

interface SlideLike extends SlideRefs { hidden?: boolean }

/**
 * Each reference's number through the presentation: in the order the slides first show them
 * (hidden slides too, as the References slide lists what the file holds), then, when `all`,
 * the rest in list order. References no longer in the list are left out.
 */
export function deckNumbers(d: DeckRefs | undefined, slides: SlideLike[], all = false): Map<string, number> {
  const known = new Set((d?.list ?? []).map((r) => r.id));
  const out = new Map<string, number>();
  for (const s of slides) for (const id of s.refs ?? []) if (known.has(id) && !out.has(id)) out.set(id, out.size + 1);
  if (all) for (const r of d?.list ?? []) if (!out.has(r.id)) out.set(r.id, out.size + 1);
  return out;
}

/** The lines slide `i` shows, or null when it shows none. */
export function slideRefBlock(d: DeckRefs | undefined, slides: SlideLike[], i: number): RefBlock | null {
  const s = slides[i];
  if (!s || !d?.list.length) return null;
  if (s.refList) return refsSlideBlock(d, slides, s.refList);
  if (!s.refs?.length) return null;
  const byId = new Map(d.list.map((r) => [r.id, r]));
  const look = refLook(d, s.refLook);
  const f = deckFormat(d);
  const nums = look.numbering === 'deck' ? deckNumbers(d, slides) : null;
  const entries: RefEntry[] = [];
  for (const id of s.refs) {
    const r = byId.get(id);
    if (!r) continue;
    const n = look.numbering === 'slide' ? entries.length + 1 : nums?.get(id);
    entries.push({ id, label: n !== undefined && look.numbering !== 'none' ? bibLabel(n, f) : '', pieces: slideRefPieces(r, look.form, f) });
  }
  return entries.length ? { entries, look } : null;
}

/**
 * The References slide's list: every reference shown on the slides, in the order they first
 * appear (or every reference in the list), each the style's full entry, numbered as the slide
 * lines are when they are numbered through the presentation.
 */
export function refsSlideBlock(d: DeckRefs | undefined, slides: SlideLike[], spec: RefListSpec): RefBlock | null {
  if (!d) return null;
  const look = refLook(d);
  const f = deckFormat(d);
  const nums = deckNumbers(d, slides, spec.which === 'all');
  const byId = new Map(d.list.map((r) => [r.id, r]));
  const entries = [...nums.entries()].sort((a, b) => a[1] - b[1]).map(([id, n]): RefEntry => {
    const r = byId.get(id)!;
    return { id, label: look.numbering === 'none' ? '' : bibLabel(n, f), pieces: slideRefPieces(r, 'full', f) };
  });
  return { entries, look: { ...look, size: 16 }, list: true };
}

/** A piece of a laid-out line: its text, look and where it starts (from the line's left end). */
export interface LaidPiece { text: string; italic?: boolean; bold?: boolean; x: number }
/** A laid-out line; `first`: the first line of its reference. */
export interface LaidLine { pieces: LaidPiece[]; width: number; first?: true }

/** The width of text in the lines' font, italic or bold. */
export type Measure = (text: string, size: number, italic: boolean, bold: boolean) => number;

/**
 * The entries broken into lines no wider than `width` (at word boundaries; a word longer than
 * the width gets a line of its own). Each entry starts a new line, after its label and a space;
 * the lines after an entry's first are indented to line up with its text.
 */
export function layoutEntries(entries: RefEntry[], width: number, size: number, measure: Measure): LaidLine[] {
  const lines: LaidLine[] = [];
  for (const e of entries) {
    const label = e.label ? e.label + ' ' : '';
    const indent = label ? measure(label, size, false, false) : 0;
    let cur: LaidLine = { pieces: label ? [{ text: label, x: 0 }] : [], width: indent, first: true };
    const push = (text: string, look: Omit<Piece, 'text'>) => {
      const w = measure(text, size, !!look.italic, !!look.bold);
      const blank = !text.trim();
      if (!blank && cur.width + w > width && cur.pieces.some((p) => p.text.trim()) && cur.width > indent) {
        lines.push(trimLine(cur));
        cur = { pieces: [], width: indent };
      }
      if (blank && cur.width <= indent) return; // no space at the start of a line
      const last = cur.pieces[cur.pieces.length - 1];
      if (last && !!last.italic === !!look.italic && !!last.bold === !!look.bold) last.text += text;
      else cur.pieces.push({ text, ...(look.italic ? { italic: true } : {}), ...(look.bold ? { bold: true } : {}), x: cur.width });
      cur.width += w;
    };
    for (const p of e.pieces) for (const word of p.text.split(/(\s+)/)) if (word) push(word, p);
    lines.push(trimLine(cur));
  }
  return lines;
}

/** A line without the space at its end. */
function trimLine(l: LaidLine): LaidLine {
  const last = l.pieces[l.pieces.length - 1];
  if (last && /\s$/.test(last.text)) last.text = last.text.replace(/\s+$/, '');
  return l;
}

/** The space the lines may take: across the slide (`x`, `w`) above `bottom`, or below `top` at the top right. */
export interface RefArea { x: number; w: number; top: number; bottom: number; align: 'left' | 'center' | 'right'; fromTop: boolean }

/**
 * Where the reference lines go on a slide `w` × `h` points: in from the edges as the footer is,
 * above the row of slide number, footer and date (`rowTop`, their top) when the slide shows
 * any of them, else near the bottom edge.
 */
export function refArea(place: RefPlace, w: number, h: number, rowTop: number | null): RefArea {
  const mx = 0.05 * w;
  const bottom = rowTop ?? h - 0.03 * h;
  switch (place) {
    case 'bottom-centre': return { x: 0.1 * w, w: 0.8 * w, top: 0.6 * h, bottom, align: 'center', fromTop: false };
    case 'bottom-right': return { x: 0.35 * w, w: 0.6 * w, top: 0.6 * h, bottom, align: 'right', fromTop: false };
    case 'top-right': return { x: 0.5 * w, w: 0.5 * w - mx, top: 0.03 * h, bottom: 0.4 * h, align: 'right', fromTop: true };
    default: return { x: mx, w: 0.75 * w, top: 0.6 * h, bottom, align: 'left', fromTop: false };
  }
}

/** Line height for a size of text. */
export const lineGap = (size: number): number => size * 1.2;

/**
 * The lines laid out to fit `height`: at the look's size, or smaller (not below 6 points, or
 * 8 on the References slide) until they fit.
 */
export function fitEntries(entries: RefEntry[], width: number, height: number, size: number, measure: Measure, min = 6): { lines: LaidLine[]; size: number } {
  let s = size;
  let lines = layoutEntries(entries, width, s, measure);
  while (lines.length * lineGap(s) > height && s > min) {
    s = Math.max(min, s - 0.5);
    lines = layoutEntries(entries, width, s, measure);
  }
  return { lines, size: s };
}

// ---------------------------------------------------------------- copying between files

/**
 * References copied into a list (independent copies): those already in it (the same DOI, or the
 * same title and year) are not added again, and each new one gets an id the list doesn't use.
 * `ids` maps each copied reference's id to its id in the list (the one already there or the new copy).
 */
export function mergeReferences(into: Reference[], from: Reference[]): { list: Reference[]; added: Reference[]; ids: Map<string, string> } {
  const list = into.slice();
  const added: Reference[] = [];
  const ids = new Map<string, string>();
  const taken = new Set(list.map((r) => r.id));
  for (const raw of from) {
    const r = cleanRef(structuredClone(raw));
    const same = findDuplicate(list, r);
    if (same) { ids.set(raw.id, same.id); continue; }
    if (taken.has(r.id)) r.id = newRefId(taken);
    taken.add(r.id);
    list.push(r);
    added.push(r);
    ids.set(raw.id, r.id);
  }
  return { list, added, ids };
}

// ---------------------------------------------------------------- formatted references as text

/**
 * References as text runs (Insert > Reference on a canvas or slide): each written in the form
 * picked, with the style's italics and bold, one per line, numbered when asked (in the style's
 * labels: (1), [1], 1.).
 */
export function referenceRuns(refs: Reference[], form: RefForm, f: CiteFormat, numbered: boolean): { text: string; italic?: true; bold?: true }[] {
  const out: { text: string; italic?: true; bold?: true }[] = [];
  refs.forEach((r, k) => {
    if (k) out.push({ text: '\n' });
    if (numbered) out.push({ text: `${bibLabel(k + 1, f)} ` });
    for (const p of slideRefPieces(r, form, f)) out.push({ text: p.text, ...(p.italic ? { italic: true as const } : {}), ...(p.bold ? { bold: true as const } : {}) });
  });
  return out;
}
