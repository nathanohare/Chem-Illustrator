// Journal figure preflight (File > Check Figure for Journal): before a figure is sent to a journal,
// check it against that journal's published author guidelines — how wide it may be for one or two
// columns, how tall, the smallest text and thinnest line it may have once printed, the fonts it
// asks for, and the resolution its pictures need — and list what to fix.
//
// The check runs on what the figure draws (the same shapes and text an export writes), so every
// line and every piece of text is measured, whatever made it. A figure wider than the column is
// shrunk by the journal to fit, which makes its text and lines smaller too, so they are checked at
// the size they will be printed.
//
// Every number below is copied from the publisher's own author guidelines, named in `source`.
// Where a guideline gives a size as the one to use rather than the least allowed, it is a
// recommendation (`textUsual`, `lineUsual`): falling short is a warning, not an error. Numbers a
// guideline leaves out are left out here too, and that check is not made.

import type { Item, Seg } from './render/vector';
import type { Rect } from './geom';

const MM = 72 / 25.4;
const CM = 72 / 2.54;
const IN = 72;

/** One width a journal prints figures at (a column, two columns, its table-of-contents graphic). */
export interface FigureSize {
  id: string;
  name: string;
  /** Widest it may be, in points. */
  w: number;
  /** Narrowest (ACS's two-column figures), in points. */
  minW?: number;
  /** Tallest it may be, in points (else the journal's `maxH`). */
  h?: number;
}

export interface JournalRules {
  id: string;
  name: string;
  /** Where the numbers come from: the publisher's page or document. */
  source: string;
  url: string;
  sizes: FigureSize[];
  /** Tallest a figure may be, in points. */
  maxH?: number;
  /** What `maxH` includes, said after it ("including the caption"). */
  maxHNote?: string;
  /** Smallest text once printed, in points (an error below it). */
  textMin?: number;
  /** The text size the guideline asks for (a warning below it). */
  textUsual?: number;
  /** Largest text once printed, in points (Nature: 7 pt, apart from panel letters). */
  textMax?: number;
  /** What the guideline says about text, shown with the text checks. */
  textNote?: string;
  /** Fonts it asks for (lower case); any other is a warning. */
  fonts?: string[];
  fontNote?: string;
  /** Thinnest line once printed, in points (an error below it). */
  lineMin?: number;
  /** The line weight it asks for (a warning below it). */
  lineUsual?: number;
  /** Thickest line it allows, in points (a tip above it). */
  lineMax?: number;
  /** Least resolution, in dots per inch, for each kind of picture. */
  dpi: { line?: number; gray?: number; colour?: number; photo?: number; combination?: number };
  /** The file formats it asks for, best first, as our exports name them. */
  formats?: ('pdf' | 'eps' | 'tiff' | 'png' | 'svg' | 'emf')[];
  /** Line art should be sent as shapes (PDF, EPS), not dots. */
  vectorPreferred?: boolean;
  formatNote?: string;
  /** What it says about colour. */
  colourNote?: string;
}

export const JOURNALS: JournalRules[] = [
  {
    id: 'acs',
    name: 'ACS journals (JOC, JACS, Org. Lett.…)',
    source: 'ACS author guidelines, Appendix 2 "Preparing Graphics" and "Abstract/Table of Contents Graphic" (The Journal of Organic Chemistry); other ACS journals use the same graphics rules',
    url: 'https://publish.acs.org/publish/author_guidelines?coden=joceah',
    sizes: [
      { id: 'single', name: 'One column (up to 3.33 in, 8.5 cm)', w: 240 },
      { id: 'double', name: 'Two columns (4.17 to 7 in, 10.6 to 17.8 cm)', w: 504, minW: 300 },
      { id: 'toc', name: 'Table of contents graphic (8.25 × 4.45 cm)', w: 3.25 * IN, h: 1.75 * IN },
    ],
    maxH: 660,
    maxHNote: 'including the caption (allow 12 pt for each line of caption)',
    textMin: 4.5,
    textNote: 'ACS: "Lettering should be no smaller than 4.5 points in the final published format."',
    fonts: ['arial', 'helvetica'],
    fontNote: 'ACS: "Helvetica or Arial fonts work well for lettering."',
    lineMin: 0.5,
    dpi: { line: 1200, gray: 600, colour: 300, photo: 300 },
    colourNote: 'ACS: "Graphics intended to appear in black and white or grayscale should not be submitted in color."',
  },
  {
    id: 'rsc',
    name: 'RSC journals (OBC, Chem. Sci., ChemComm…)',
    source: 'Royal Society of Chemistry, "Figures, graphics and images" (author and reviewer hub)',
    url: 'https://www.rsc.org/journals-books-databases/author-and-reviewer-hub/authors-information/prepare-and-format/figures-graphics-images/',
    sizes: [
      { id: 'single', name: 'One column (8.3 cm)', w: 8.3 * CM },
      { id: 'double', name: 'Two columns (17.1 cm)', w: 17.1 * CM },
      { id: 'toc', name: 'Table of contents entry (8 × 4 cm)', w: 8 * CM, h: 4 * CM },
    ],
    maxH: 23.3 * CM,
    textUsual: 7,
    textNote: 'RSC: "Captions/atom labels = Arial/Helvetica, 7 pt"; it gives no smallest size.',
    fonts: ['arial', 'helvetica'],
    fontNote: 'RSC asks for Arial or Helvetica for captions and atom labels.',
    lineUsual: 0.5,
    dpi: { line: 600, photo: 600, combination: 600, colour: 600, gray: 600 },
    formats: ['tiff', 'eps', 'pdf'],
    formatNote: 'RSC: "Figures, Schemes and Charts should be supplied as TIFF files, with a resolution of 600 dpi or greater." EPS or PDF are taken but turned into TIFF.',
    colourNote: 'RSC: "Color images may be used free of charge both online and in print."',
  },
  {
    id: 'elsevier',
    name: 'Elsevier journals (Tetrahedron, Tet. Lett.…)',
    source: 'Elsevier "Artwork and media instructions": Artwork sizing, Artwork types and the Artwork formats checklist',
    url: 'https://www.elsevier.com/about/policies-and-standards/author/artwork-and-media-instructions/artwork-sizing',
    sizes: [
      { id: 'min', name: 'Smallest (30 mm)', w: 30 * MM },
      { id: 'single', name: 'One column (90 mm)', w: 90 * MM },
      { id: 'one-half', name: 'One and a half columns (140 mm)', w: 140 * MM },
      { id: 'double', name: 'Two columns, full width (190 mm)', w: 190 * MM },
    ],
    textMin: 6,
    textUsual: 7,
    textNote: 'Elsevier: lettering "should have a finished, printed size of 7 pt for normal text and no smaller than 6 pt for subscript and superscript characters."',
    fonts: ['arial', 'helvetica', 'courier', 'courier new', 'times', 'times new roman', 'symbol'],
    fontNote: 'Elsevier asks for Arial (or Helvetica), Courier, Symbol, or Times (or Times New Roman).',
    lineMin: 0.1,
    lineMax: 1.5,
    dpi: { line: 1000, photo: 300, gray: 300, colour: 300, combination: 500 },
    formats: ['eps', 'pdf', 'tiff'],
    formatNote: 'Elsevier recommends EPS (or PDF) for drawings made of shapes, and TIFF or JPEG for pictures.',
    colourNote: 'Elsevier: color should be "in the preferred RGB colorspace" (exports from here are RGB).',
  },
  {
    id: 'nature',
    name: 'Nature journals (Nature, Nat. Chem., Nat. Commun.…)',
    source: 'Nature "Guide to preparing final artwork"',
    url: 'https://www.nature.com/documents/nature-final-artwork.pdf',
    sizes: [
      { id: 'single', name: 'One column (89 mm)', w: 89 * MM },
      { id: 'one-half', name: 'One and a half columns (120 mm)', w: 120 * MM },
      { id: 'one-half-wide', name: 'One and a half columns, wide (136 mm)', w: 136 * MM },
      { id: 'double', name: 'Two columns (183 mm)', w: 183 * MM },
    ],
    maxH: 247 * MM,
    maxHNote: '(the full depth of the page)',
    textMin: 5,
    textMax: 7,
    textNote: 'Nature: text 5 pt at least and "Maximum text size for all other text: 7pt" (panel letters a, b, c are 8 pt bold).',
    fonts: ['arial', 'helvetica', 'courier', 'courier new'],
    fontNote: 'Nature: "All text should be in a sans-serif typeface, preferably Helvetica or Arial" (Courier only for amino acid sequences).',
    dpi: { photo: 300 },
    formats: ['pdf', 'eps'],
    vectorPreferred: true,
    formatNote: 'Nature: "Do not rasterize line art or text"; it takes PDF, EPS, AI, PowerPoint or Word, and cannot use JPEG, TIFF or PNG.',
    colourNote: 'Nature recommends RGB (exports from here are RGB).',
  },
  {
    id: 'wiley',
    name: 'Wiley journals (Angewandte, Chemistry Europe…)',
    source: 'Wiley Author Services "Figure preparation"; text, font and line weight from the Wiley-VCH checklists for accepted manuscripts (Angewandte family, Chemistry Europe)',
    url: 'https://authors.wiley.com/author-resources/Journal-Authors/Prepare/manuscript-preparation-guidelines.html/figure-preparation.html',
    sizes: [
      { id: 'small', name: 'Smallest (80 mm)', w: 80 * MM },
      { id: 'large', name: 'Largest (180 mm)', w: 180 * MM },
    ],
    textUsual: 7,
    textNote: 'Wiley-VCH asks for text about 1.8 mm high (7 pt) in the printed figure.',
    fonts: ['arial', 'helvetica'],
    fontNote: 'Wiley-VCH: Arial or Helvetica only.',
    lineMin: 0.2,
    dpi: { line: 600, photo: 300, combination: 600 },
    formats: ['pdf', 'tiff', 'png'],
    formatNote: 'Wiley prefers PDF for line art and PNG or TIFF for pictures, at 300 to 600 dpi.',
  },
];

/** A journal's rules by id. */
export function journalById(id: string): JournalRules | undefined {
  return JOURNALS.find((j) => j.id === id);
}

/**
 * How big the figure is printed:
 * - 'drawn': at the size it is drawn, unless it is too big for the space, when the journal
 *   shrinks it to fit (as journals do).
 * - 'fill': made to fill the width, bigger or smaller (for a figure drawn larger than it prints).
 */
export type PrintSize = 'drawn' | 'fill';

export type PreflightLevel = 'error' | 'warning' | 'tip' | 'ok';

/** What can be put right from the list. */
export type PreflightFix = 'fit' | 'text' | 'lines' | 'fonts' | 'style';

export interface PreflightIssue {
  rule: 'width' | 'height' | 'text-min' | 'text-usual' | 'text-max' | 'fonts' | 'line-min' | 'line-usual' | 'line-max' | 'pictures' | 'colour' | 'format';
  level: PreflightLevel;
  title: string;
  detail?: string;
  /** Where in the drawing (in its own points), to select what is there. */
  where?: Rect[];
  fix?: PreflightFix;
  /** For a fix: the size wanted in the drawing's own points (text size, line weight), or the scale for 'fit'. */
  want?: number;
  /** For 'text' and 'lines': the size of each thing in `where` (text size, line weight), in the drawing's own points. */
  sizes?: number[];
  /** For 'fonts': the fonts to change. */
  fonts?: string[];
}

export interface PreflightResult {
  journal: JournalRules;
  size: FigureSize;
  how: PrintSize;
  /** The figure as drawn, in points. */
  w: number;
  h: number;
  /** How much it is made bigger or smaller to print (1: as drawn). */
  scale: number;
  /** What kind of artwork it is, which sets the resolution it needs as a picture of dots. */
  kind: 'line' | 'colour' | 'combination';
  /** Resolution to export at, when exported as a picture of dots (PNG, TIFF). */
  dpi: number;
  issues: PreflightIssue[];
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
const r2 = (v: number) => (Math.round(v * 100) / 100).toString();
const cmText = (pt: number) => `${r1(pt / CM)} cm`;

/** The box round some segments. */
function segBox(segs: Seg[], pad = 0): Rect | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const s of segs) {
    if (s.k === 'Z') continue;
    const xs = s.k === 'C' ? [s.x1, s.x2, s.x] : [s.x];
    const ys = s.k === 'C' ? [s.y1, s.y2, s.y] : [s.y];
    for (const x of xs) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
    for (const y of ys) { y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
  }
  return x1 <= x2 ? { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad } : null;
}

/** The length of a path's longest piece (from one move to the next), along its chords. */
export function longestPiece(segs: Seg[]): number {
  let best = 0, run = 0, x = 0, y = 0, sx = 0, sy = 0;
  for (const g of segs) {
    if (g.k === 'M') { best = Math.max(best, run); run = 0; x = sx = g.x; y = sy = g.y; continue; }
    if (g.k === 'Z') { run += Math.hypot(sx - x, sy - y); x = sx; y = sy; continue; }
    if (g.k === 'C') run += Math.hypot(g.x1 - x, g.y1 - y) + Math.hypot(g.x2 - g.x1, g.y2 - g.y1) + Math.hypot(g.x - g.x2, g.y - g.y2);
    else run += Math.hypot(g.x - x, g.y - y);
    x = g.x; y = g.y;
  }
  return Math.max(best, run);
}

/** Where an item is drawn. */
export function itemBox(it: Item): Rect | null {
  if (it.kind === 'path') return segBox(it.segs, it.stroke ? it.stroke.width / 2 : 0);
  if (it.kind === 'image') return { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + it.h };
  const w = it.widths.reduce((n, x) => n + x, 0);
  return { x1: it.x, y1: it.y - it.size * 0.8, x2: it.x + w, y2: it.y + it.size * 0.25 };
}

/** "#rrggbb", "#rgb" or "rgb(…)/rgba(…)" as 0–255 channels and alpha; null for anything else. */
function channels(c: string | undefined): [number, number, number, number] | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1].length <= 4 ? m[1].split('').map((x) => x + x).join('') : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => parseFloat(x));
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
  }
  if (s === 'black') return [0, 0, 0, 1];
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'transparent') return [0, 0, 0, 0];
  return null;
}

/** Is this colour something other than black, white or a grey? */
export function isColour(c: string | undefined): boolean {
  const ch = channels(c);
  if (!ch || ch[3] < 0.02) return false;
  return Math.max(ch[0], ch[1], ch[2]) - Math.min(ch[0], ch[1], ch[2]) > 12;
}

const invisible = (c: string | undefined) => { const ch = channels(c); return !!ch && ch[3] < 0.02; };

/** A picture's resolution at the size it prints (dots per inch), from its own pixels. */
export function pictureDpi(it: Extract<Item, { kind: 'image' }>, scale: number): number | null {
  if (!it.px || !(it.px.w > 0) || !(it.w > 0)) return null;
  const c = it.crop;
  const keep = c ? Math.max(0.01, 1 - Math.max(0, c.l) - Math.max(0, c.r)) : 1;
  const inches = (it.w * scale) / 72;
  return inches > 0 ? (it.px.w * keep) / inches : null;
}

/** The lower-case first name of a font ("Arial Bold" stays as it is: it is matched by its start). */
const fontName = (f: string) => f.trim().toLowerCase();
const allowedFont = (f: string, list: string[]) => {
  const n = fontName(f);
  return list.some((a) => n === a || n.startsWith(a + ' ') || n.startsWith(a + ','));
};

/** How far past the space (in points) still counts as fitting it. */
const FIT_SLACK = 0.5;
/**
 * The fixes aim this much past the least size, so that a later small change (a caption made
 * bigger, a line made thicker at the figure's edge) can't take the figure back under it.
 */
export const FIX_HEADROOM = 1.02;

/**
 * Check a figure (what it draws, and the box it fills) against a journal's rules for one of its
 * sizes. `box` is the figure's extent in its own points.
 */
export function preflight(items: Item[], box: Rect, journal: JournalRules, sizeId: string, how: PrintSize = 'drawn'): PreflightResult {
  const size = journal.sizes.find((s) => s.id === sizeId) ?? journal.sizes[0];
  const w = Math.max(0, box.x2 - box.x1), h = Math.max(0, box.y2 - box.y1);
  const maxH = size.h ?? journal.maxH ?? Infinity;
  let scale = 1;
  if (w > 0 && h > 0) {
    if (how === 'fill') scale = Math.min(size.w / w, maxH / h);
    // within half a point of the space counts as fitting (a line's own width at the edge), so it is not shrunk
    else scale = Math.min(1, w > size.w + FIT_SLACK ? size.w / w : 1, h > maxH + FIT_SLACK ? maxH / h : 1);
  }
  const issues: PreflightIssue[] = [];
  const printed = (v: number) => v * scale;

  // ------------------------------------------------ size
  const pw = w * scale, ph = h * scale;
  if (how === 'drawn' && w > size.w + FIT_SLACK) {
    issues.push({
      rule: 'width', level: 'warning', fix: 'fit', want: (size.w - 1) / w,
      title: `${cmText(w)} wide: too wide for ${size.name.replace(/ \(.*/, '').toLowerCase()} (${cmText(size.w)})`,
      detail: `The journal would print it at ${Math.round(scale * 100)} %, which makes its text and lines smaller by as much (they are checked below at that size). Make it fit, or draw it for a wider size.`,
    });
  } else if (size.minW && pw < size.minW - 0.5) {
    issues.push({
      rule: 'width', level: 'tip',
      title: `${cmText(pw)} wide: narrower than ${journal.name.replace(/ \(.*/, '')} allows for ${size.name.replace(/ \(.*/, '').toLowerCase()} (${cmText(size.minW)} at least)`,
      detail: 'A figure this narrow goes in one column.',
    });
  } else {
    issues.push({ rule: 'width', level: 'ok', title: `Width ${cmText(pw)}${scale !== 1 ? ` (printed at ${Math.round(scale * 100)} %)` : ''}: fits ${size.name.replace(/ \(.*/, '').toLowerCase()} (${cmText(size.w)})` });
  }
  if (Number.isFinite(maxH)) {
    if (how === 'drawn' && h * Math.min(1, w > size.w + FIT_SLACK ? size.w / w : 1) > maxH + FIT_SLACK) {
      issues.push({
        rule: 'height', level: size.h ? 'warning' : 'error', fix: 'fit', want: Math.min((size.w - 1) / w, (maxH - 1) / h),
        title: `${cmText(h * Math.min(1, size.w / Math.max(w, 1e-9)))} tall: taller than ${cmText(maxH)}${size.h ? '' : ` ${journal.maxHNote ?? ''}`.trimEnd()}`,
        detail: size.h ? 'It would be shrunk to fit the space, text and lines too.' : 'Split it into two figures, or lay it out wider and less tall.',
      });
    } else {
      issues.push({ rule: 'height', level: 'ok', title: `Height ${cmText(ph)}: within ${cmText(maxH)}${journal.maxHNote && !size.h ? ` ${journal.maxHNote}` : ''}` });
    }
  }

  // ------------------------------------------------ text
  const texts = items.filter((it): it is Extract<Item, { kind: 'text' }> => it.kind === 'text' && !!it.text.trim() && !invisible(it.color));
  const sizes = texts.map((t) => printed(t.size));
  const smallest = sizes.length ? Math.min(...sizes) : null;
  const boxesOf = (list: Item[]) => list.map(itemBox).filter((b): b is Rect => !!b);
  /** Places, with the size of what is in each (text size or line weight). */
  const placed = (list: Item[]) => {
    const where: Rect[] = [], sizes: number[] = [];
    for (const it of list) {
      const b = itemBox(it);
      if (!b) continue;
      where.push(b);
      sizes.push(it.kind === 'text' ? it.size : it.kind === 'path' ? it.stroke?.width ?? 0 : 0);
    }
    return { where, sizes };
  };
  if (texts.length) {
    const tooSmall = journal.textMin !== undefined ? texts.filter((t) => printed(t.size) < journal.textMin! - 0.05) : [];
    const small = journal.textUsual !== undefined ? texts.filter((t) => printed(t.size) < journal.textUsual! - 0.05 && !tooSmall.includes(t)) : [];
    if (tooSmall.length) {
      issues.push({
        rule: 'text-min', level: 'error', fix: 'text', want: (journal.textMin! / scale) * FIX_HEADROOM, ...placed(tooSmall),
        title: `${tooSmall.length} piece${tooSmall.length > 1 ? 's' : ''} of text smaller than ${r1(journal.textMin!)} pt once printed (smallest ${r2(smallest!)} pt)`,
        detail: journal.textNote,
      });
    }
    if (small.length) {
      issues.push({
        rule: 'text-usual', level: 'warning', fix: 'text', want: (journal.textUsual! / scale) * FIX_HEADROOM, ...placed(small),
        title: `${small.length} piece${small.length > 1 ? 's' : ''} of text under the ${r1(journal.textUsual!)} pt asked for (smallest ${r2(Math.min(...small.map((t) => printed(t.size))))} pt)`,
        detail: `${journal.textNote ?? ''}${journal.textMin === undefined ? '' : ' Subscripts and superscripts are often this size on purpose.'}`.trim() || undefined,
      });
    }
    if (journal.textMax !== undefined) {
      const big = texts.filter((t) => printed(t.size) > journal.textMax! + 0.05);
      // panel letters (a, b, c) may be 8 pt bold
      const over = big.filter((t) => !(t.bold && /^\(?[a-z]\)?$/i.test(t.text.trim()) && printed(t.size) <= 8.05));
      if (over.length) {
        issues.push({
          rule: 'text-max', level: 'warning', where: boxesOf(over),
          title: `${over.length} piece${over.length > 1 ? 's' : ''} of text bigger than ${r1(journal.textMax)} pt once printed (largest ${r2(Math.max(...over.map((t) => printed(t.size))))} pt)`,
          detail: journal.textNote,
        });
      }
    }
    if (!tooSmall.length && !small.length) {
      issues.push({ rule: 'text-min', level: 'ok', title: `Text ${r2(smallest!)} pt and up once printed${journal.textMin ?? journal.textUsual ? ` (${r1((journal.textMin ?? journal.textUsual)!)} pt asked for)` : ''}` });
    }
    // fonts
    if (journal.fonts) {
      const off = new Map<string, Item[]>();
      for (const t of texts) {
        // symbols drawn in a symbol font (arrows, ±) are not lettering
        if (allowedFont(t.family, journal.fonts) || /symbol|math|emoji/i.test(t.family)) continue;
        const k = t.family.trim();
        off.set(k, [...(off.get(k) ?? []), t]);
      }
      if (off.size) {
        const list = [...off.keys()];
        issues.push({
          rule: 'fonts', level: 'warning', fix: 'fonts', fonts: list, where: boxesOf([...off.values()].flat()),
          title: `Text in ${list.join(', ')}`,
          detail: journal.fontNote,
        });
      } else issues.push({ rule: 'fonts', level: 'ok', title: `Fonts: ${[...new Set(texts.map((t) => t.family.trim()))].join(', ')}` });
    }
  }

  // ------------------------------------------------ lines
  // (the short strokes that round off bond ends are part of the bond's end, not lines of their own)
  const strokes = items.filter((it): it is Extract<Item, { kind: 'path' }> => it.kind === 'path' && !!it.stroke && it.stroke.width > 0 && !invisible(it.stroke.color) && longestPiece(it.segs) >= 1);
  if (strokes.length) {
    const thinnest = Math.min(...strokes.map((s) => printed(s.stroke!.width)));
    const under = (v: number) => strokes.filter((s) => printed(s.stroke!.width) < v - 0.005);
    const tooThin = journal.lineMin !== undefined ? under(journal.lineMin) : [];
    const thin = journal.lineUsual !== undefined ? under(journal.lineUsual).filter((s) => !tooThin.includes(s)) : [];
    if (tooThin.length) {
      issues.push({
        rule: 'line-min', level: 'error', fix: 'lines', want: (journal.lineMin! / scale) * FIX_HEADROOM, ...placed(tooThin),
        title: `${tooThin.length} line${tooThin.length > 1 ? 's' : ''} thinner than ${r2(journal.lineMin!)} pt once printed (thinnest ${r2(thinnest)} pt)`,
        detail: journal.id === 'acs' ? 'ACS: "Lines should be no thinner than 0.5 point."' : journal.id === 'elsevier' ? 'Elsevier: "Line weights range from 0.10 pt to 1.5 pt."' : undefined,
      });
    }
    if (thin.length) {
      issues.push({
        rule: 'line-usual', level: 'warning', fix: 'lines', want: (journal.lineUsual! / scale) * FIX_HEADROOM, ...placed(thin),
        title: `${thin.length} line${thin.length > 1 ? 's' : ''} under the ${r2(journal.lineUsual!)} pt asked for (thinnest ${r2(thinnest)} pt once printed)`,
        detail: journal.id === 'rsc' ? 'RSC asks for bonds "0.016 cm or 0.5 pt" wide.' : undefined,
      });
    }
    if (journal.lineMax !== undefined) {
      const thick = strokes.filter((s) => printed(s.stroke!.width) > journal.lineMax! + 0.005);
      if (thick.length) {
        issues.push({
          rule: 'line-max', level: 'tip', where: boxesOf(thick),
          title: `${thick.length} line${thick.length > 1 ? 's' : ''} thicker than ${r2(journal.lineMax)} pt once printed`,
          detail: 'Elsevier gives line weights from 0.10 pt to 1.5 pt.',
        });
      }
    }
    if (!tooThin.length && !thin.length && (journal.lineMin ?? journal.lineUsual) !== undefined) {
      issues.push({ rule: 'line-min', level: 'ok', title: `Lines ${r2(thinnest)} pt and up once printed (${r2((journal.lineMin ?? journal.lineUsual)!)} pt asked for)` });
    }
  }

  // ------------------------------------------------ pictures in it
  const images = items.filter((it): it is Extract<Item, { kind: 'image' }> => it.kind === 'image');
  const photoDpi = journal.dpi.photo ?? journal.dpi.colour;
  if (images.length && photoDpi) {
    const low = images.map((im) => ({ im, dpi: pictureDpi(im, scale) })).filter((x) => x.dpi !== null && x.dpi < photoDpi - 0.5);
    if (low.length) {
      issues.push({
        rule: 'pictures', level: 'error', where: boxesOf(low.map((x) => x.im)),
        title: `${low.length} picture${low.length > 1 ? 's' : ''} below ${photoDpi} dpi at the printed size (lowest ${Math.round(Math.min(...low.map((x) => x.dpi!)))} dpi)`,
        detail: 'Put in a copy of the picture with more pixels (the original photo or spectrum, not a screenshot), or show it smaller.',
      });
    } else issues.push({ rule: 'pictures', level: 'ok', title: `Pictures in it: ${photoDpi} dpi or more at the printed size` });
  }

  // ------------------------------------------------ colour, and how to send it
  const coloured = items.some((it) => (it.kind === 'text' && isColour(it.color)) || (it.kind === 'path' && (isColour(it.fill) || isColour(it.stroke?.color))));
  const kind: PreflightResult['kind'] = images.length ? 'combination' : coloured ? 'colour' : 'line';
  const d = journal.dpi;
  const dpi = kind === 'combination' ? (d.combination ?? Math.max(d.line ?? 0, d.photo ?? 0, 300))
    : kind === 'colour' ? Math.max(d.line ?? 0, d.colour ?? 0, d.combination ?? 0, 300)
    : (d.line ?? d.combination ?? 600);
  if (coloured && journal.colourNote) issues.push({ rule: 'colour', level: journal.id === 'acs' ? 'tip' : 'ok', title: 'In color', detail: journal.colourNote });
  const kindName = kind === 'combination' ? 'drawing with pictures in it (combination art)' : kind === 'colour' ? 'drawing in color' : 'black and white drawing (line art)';
  const fmt = journal.formats?.map((f) => f.toUpperCase()).join(', ');
  issues.push({
    rule: 'format', level: journal.vectorPreferred && kind !== 'combination' ? 'tip' : 'ok',
    title: journal.vectorPreferred ? `Send it as PDF or EPS (shapes, not dots)` : `A ${kindName}: export at ${dpi} dpi as a picture of dots`,
    detail: journal.formatNote ?? (fmt ? `Formats asked for: ${fmt}.` : undefined),
  });

  return { journal, size, how, w, h, scale, kind, dpi, issues: sortIssues(issues) };
}

const ORDER: Record<PreflightLevel, number> = { error: 0, warning: 1, tip: 2, ok: 3 };

function sortIssues(list: PreflightIssue[]): PreflightIssue[] {
  return list.map((x, i) => ({ x, i })).sort((a, b) => ORDER[a.x.level] - ORDER[b.x.level] || a.i - b.i).map((p) => p.x);
}

/** A line saying how the check went, for the top of the list. */
export function preflightSummary(r: PreflightResult): string {
  const n = (l: PreflightLevel) => r.issues.filter((i) => i.level === l).length;
  const e = n('error'), w = n('warning');
  if (!e && !w) return `Ready for ${r.journal.name.replace(/ \(.*/, '')}: nothing to fix.`;
  return [e && `${e} to fix`, w && `${w} to look at`].filter(Boolean).join(', ') + ` for ${r.journal.name.replace(/ \(.*/, '')}.`;
}
