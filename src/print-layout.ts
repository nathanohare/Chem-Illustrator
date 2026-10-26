// File > Print: where things go on the paper. Sizes are in points (72 to the inch).

export interface Rect { x: number; y: number; w: number; h: number }
export interface Paper { name: string; w: number; h: number }

export const PAPERS: Record<string, Paper> = {
  letter: { name: 'Letter (8.5 × 11 in)', w: 612, h: 792 },
  a4: { name: 'A4 (210 × 297 mm)', w: 595.28, h: 841.89 },
  legal: { name: 'Legal (8.5 × 14 in)', w: 612, h: 1008 },
  a3: { name: 'A3 (297 × 420 mm)', w: 841.89, h: 1190.55 },
};

/** Letter in the United States, Canada, Mexico and the Philippines (where it is the usual size), A4 elsewhere. */
export function defaultPaper(lang: string): 'letter' | 'a4' {
  return /^[a-z]{2,3}-(US|CA|MX|PH)\b/i.test(lang) ? 'letter' : 'a4';
}

/** The paper turned to suit what goes on it: landscape for something wider than tall. */
export function orient(p: Paper, how: 'portrait' | 'landscape' | 'auto', w = 1, h = 1): { w: number; h: number } {
  const land = how === 'landscape' || (how === 'auto' && w > h);
  return land ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) } : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
}

/** The paper sizes CSS names in `@page { size }`, upright, in points. */
const CSS_PAPERS: [string, number, number][] = [
  ['letter', 612, 792], ['legal', 612, 1008], ['ledger', 792, 1224],
  ['A5', 419.53, 595.28], ['A4', 595.28, 841.89], ['A3', 841.89, 1190.55],
];

/**
 * The `@page` size for w × h point pages. A paper CSS names goes by name and orientation
 * ("letter landscape"): given only as two lengths, a wider-than-tall page prints in the printer's
 * own orientation (portrait), and Windows turns the page 90° to fit it.
 */
export function pageSizeCss(w: number, h: number): string {
  const lo = Math.min(w, h), hi = Math.max(w, h);
  const named = CSS_PAPERS.find(([, a, b]) => Math.abs(a - lo) < 1 && Math.abs(b - hi) < 1);
  const turn = w > h ? 'landscape' : 'portrait';
  return named ? `${named[0]} ${turn}` : `${w}pt ${h}pt`;
}

/**
 * Where a w × h drawing goes in an area: centred, at its own size ("actual", made smaller only
 * when it would not fit) or as large as fits ("fit").
 */
export function placeIn(w: number, h: number, area: Rect, how: 'actual' | 'fit'): Rect & { scale: number } {
  const fit = Math.min(area.w / w, area.h / h);
  const scale = how === 'fit' ? fit : Math.min(1, fit);
  const W = w * scale, H = h * scale;
  return { x: area.x + (area.w - W) / 2, y: area.y + (area.h - H) / 2, w: W, h: H, scale };
}

/** A page's area inside its margins. */
export function inside(page: { w: number; h: number }, margin: number): Rect {
  return { x: margin, y: margin, w: page.w - 2 * margin, h: page.h - 2 * margin };
}

/**
 * Handouts: n slides to a page in a grid (2 one above the other, 3 down the left with room for
 * notes beside them, 4 or 6 or 9 in rows of two or three), each cell the space one slide may fill.
 */
export function handoutCells(page: { w: number; h: number }, n: number, margin = 36, gap = 18): Rect[] {
  const cols = n <= 3 ? 1 : n === 4 ? 2 : n === 6 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const a = inside(page, margin);
  // three to a page leaves the right half for notes
  const w = n === 3 ? a.w / 2 - gap / 2 : (a.w - gap * (cols - 1)) / cols;
  const h = (a.h - gap * (rows - 1)) / rows;
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: a.x + c * (w + gap), y: a.y + r * (h + gap), w, h });
  return out.slice(0, n);
}

/** Lines to write notes on, beside each slide on a three-to-a-page handout. */
export function noteLines(cell: Rect, page: { w: number }, margin = 36, gap = 18, every = 22): { x1: number; x2: number; y: number }[] {
  const x1 = cell.x + cell.w + gap, x2 = page.w - margin;
  const out: { x1: number; x2: number; y: number }[] = [];
  for (let y = cell.y + every; y <= cell.y + cell.h; y += every) out.push({ x1, x2, y });
  return out;
}

/** An SVG (as written by itemsToSvg) drawn into a box of a larger picture, keeping its shape. */
export function placeSvg(svg: string, r: Rect): string {
  return svg.replace(/^<svg\b([^>]*)>/, (_, attrs: string) => {
    const rest = attrs.replace(/\s(width|height|x|y|preserveAspectRatio)="[^"]*"/g, '');
    return `<svg${rest} x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" preserveAspectRatio="xMidYMid meet">`;
  });
}

/** A whole sheet of paper as one SVG, w × h points. */
export function pageSvg(w: number, h: number, parts: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
}
