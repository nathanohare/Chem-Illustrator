// Prints of what Office shows. Chemweave keeps its own copy of many things it writes to
// an Office file (a PowerPoint tag, the model in a Word file's custom XML part), so they come back
// exactly as made here. Office never updates those copies (ECMA-376 Part 1, 19.3.3.1 and 15.2.5),
// so a print of the native markup the copy stands in for is kept with it: taken from the markup as
// written here, and taken again from the markup in the file when it is read. While the two agree,
// Office has not changed the thing and the copy is used; once they differ, the file's own markup
// is read, so a change made in Office (bold, a colour, a new shape, a new chart type) is kept.
//
// A print takes only what a person can change in Office: element names, their settings and the
// text. It leaves out what Office rewrites by itself when it saves a file nobody changed: the
// order of attributes, proofing and language marks, relationship ids, runs split by the spell
// checker, end-of-paragraph marks and extension lists. (PowerPoint's and Word's saves of the files
// in the test bench give the same prints as the files written here.)

import { NS, kid, kids } from './ooxml';
import { readChartXml } from './xlsx-chart';
import type { Chart } from '../sheet/chart';

/** A print's bits as a short text: how many there are, and an FNV-1a hash of them in hex. */
export function printOf(bits: string[]): string {
  let h = 0x811c9dc5;
  const s = bits.join('\u0001');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${bits.length}.${h.toString(16)}`;
}

/** Namespaces of the markup written here, for reading a piece of it on its own. */
const FRAGMENT_NS: Record<string, string> = {
  a: NS.a, p: NS.p, r: NS.r,
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
};

/**
 * A piece of markup written here (with the usual prefixes, a:, p:, r:, w:), read into an element
 * for printing; null when it doesn't read.
 */
export function fragment(xml: string): Element | null {
  const decl = Object.entries(FRAGMENT_NS).map(([k, v]) => `xmlns:${k}="${v}"`).join(' ');
  try {
    const doc = new DOMParser().parseFromString(`<x ${decl}>${xml}</x>`, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc.documentElement.firstElementChild;
  } catch {
    return null;
  }
}

/** Settings Office sets or rewrites by itself (proofing, language, spell checking). */
const SKIP_ATTRS = new Set(['lang', 'altLang', 'dirty', 'err', 'smtClean', 'smtId', 'noProof', 'bmk']);
/** Elements Office adds, drops or rewrites by itself. */
const SKIP_ELS = new Set(['extLst', 'endParaRPr']);
/** Font elements: only the font's name counts (PowerPoint may add its panose and family). */
const FONT_ELS = new Set(['latin', 'ea', 'cs', 'sym', 'buFont']);
/**
 * Settings' default values (from the DrawingML schema, dml-main.xsd), which PowerPoint leaves out
 * when it saves: a setting at its default counts as not given.
 */
const DEFAULTS: Record<string, Record<string, string>> = {
  alphaModFix: { amt: '100%' }, bevelB: { h: '76200', prst: 'circle', w: '76200' }, bevelT: { h: '76200', prst: 'circle', w: '76200' },
  blur: { grow: 'true', rad: '0' }, bodyPr: { upright: 'false' }, buAutoNum: { startAt: '1' }, camera: { zoom: '100%' },
  clrChange: { useA: 'true' }, defRPr: { cap: 'none' }, rPr: { cap: 'none' }, fillRect: { b: '0%', l: '0%', r: '0%', t: '0%' },
  fillToRect: { b: '0%', l: '0%', r: '0%', t: '0%' }, srcRect: { b: '0%', l: '0%', r: '0%', t: '0%' }, tileRect: { b: '0%', l: '0%', r: '0%', t: '0%' },
  glow: { rad: '0' }, gradFill: { flip: 'none' }, tile: { flip: 'none' }, headEnd: { type: 'none' }, tailEnd: { type: 'none' },
  hsl: { hue: '0', lum: '0%', sat: '0%' }, innerShdw: { blurRad: '0', dir: '0', dist: '0' }, prstShdw: { dir: '0', dist: '0' },
  outerShdw: { algn: 'b', blurRad: '0', dir: '0', dist: '0', kx: '0', ky: '0', rotWithShape: 'true', sx: '100%', sy: '100%' },
  reflection: { algn: 'b', blurRad: '0', dir: '0', dist: '0', endA: '0%', endPos: '100%', fadeDir: '5400000', kx: '0', ky: '0', rotWithShape: 'true', stA: '100%', stPos: '0%', sx: '100%', sy: '100%' },
  relOff: { tx: '0%', ty: '0%' }, sp3d: { contourW: '0', extrusionH: '0', prstMaterial: 'warmMatte', z: '0' },
  tblPr: { bandCol: 'false', bandRow: 'false', firstCol: 'false', firstRow: 'false', lastCol: 'false', lastRow: 'false', rtl: 'false' },
  tc: { gridSpan: '1', hMerge: 'false', rowSpan: '1', vMerge: 'false' },
  tcPr: { anchor: 't', anchorCtr: 'false', horzOverflow: 'clip', marB: '45720', marL: '91440', marR: '91440', marT: '45720', vert: 'horz' },
};
/** A value as written in a file: percentages in thousandths, true and false as 1 and 0. */
const plainValue = (v: string): string => (/^-?[\d.]+%$/.test(v) ? String(Math.round(parseFloat(v) * 1000)) : v === 'true' ? '1' : v === 'false' ? '0' : v);
/** An element's setting, '' when it is not given or at its default. */
export function setting(el: Element, name: string): string {
  const v = el.getAttribute(name);
  if (v === null) return '';
  const d = DEFAULTS[el.localName]?.[name];
  return d !== undefined && plainValue(d) === plainValue(v) ? '' : v;
}

/**
 * An element as text: its name, its settings in order and what is in it, without the bits Office
 * rewrites by itself. Elements named in `skip` are left out.
 */
export function canon(el: Element | null, skip: ReadonlySet<string> = SKIP_ELS): string {
  if (!el || skip.has(el.localName)) return '';
  const name = el.localName;
  const attrs: string[] = [];
  for (const a of Array.from(el.attributes)) {
    const local = a.localName;
    if (a.namespaceURI === NS.r || a.name === 'xmlns' || a.prefix === 'xmlns' || SKIP_ATTRS.has(local)) continue;
    if (FONT_ELS.has(name) && local !== 'typeface') continue;
    // AutoFit's shrinking is worked out again by PowerPoint as it lays the text out
    if (name === 'normAutofit') continue;
    if (!a.namespaceURI && !setting(el, local)) continue;
    attrs.push(`${local}=${local === 'val' && /Clr$/.test(name) ? a.value.toUpperCase() : a.value}`);
  }
  attrs.sort();
  let inner = '';
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) inner += canon(c, skip);
  return `<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${inner}</>`;
}

/** Links are compared on their own (they point through relationships, renumbered on a save). */
const RUN_SKIP = new Set([...SKIP_ELS, 'hlinkClick', 'hlinkMouseOver']);

/**
 * The print of DrawingML text (a txBody, or anything holding a:p paragraphs): the body's settings,
 * each paragraph's settings, and the text with how each piece of it looks. Runs that look the same
 * count as one (PowerPoint splits runs where its spell checker marks a word). Text with no words
 * prints as '' whatever its settings.
 */
export function textPrint(body: Element | null): string {
  if (!body) return '';
  const bits: string[] = [];
  let words = false;
  bits.push(`b${canon(kid(body, 'bodyPr'))}`, `l${canon(kid(body, 'lstStyle'))}`);
  for (const p of kids(body, 'p')) {
    bits.push(`p${canon(kid(p, 'pPr'))}`);
    let look: string | null = null, text = '';
    const flush = () => { if (text) bits.push(`r${look}\u0002${text}`); text = ''; };
    for (const k of kids(p)) {
      if (k.localName === 'br') { flush(); look = null; bits.push('n'); continue; }
      if (k.localName !== 'r' && k.localName !== 'fld') continue;
      const t = kid(k, 't')?.textContent ?? '';
      if (!t) continue;
      words = true;
      const now = (k.localName === 'fld' ? `f${k.getAttribute('type') ?? ''}` : '') + canon(kid(k, 'rPr'), RUN_SKIP);
      if (now !== look) { flush(); look = now; }
      text += t;
    }
    flush();
  }
  return words ? printOf(bits) : '';
}

/**
 * The print of a shape's look from its shape properties (and its style, when it has one): its
 * outline ('geom', prstGeom or custGeom) or everything else ('look': fill, line, effects), never
 * its place and size (a:xfrm), which are read from the file anyway.
 */
export function spPrPrint(spPr: Element | null, which: 'geom' | 'look', style: Element | null = null): string {
  const bits: string[] = [];
  for (const k of kids(spPr)) {
    const geom = k.localName === 'prstGeom' || k.localName === 'custGeom';
    if (k.localName === 'xfrm' || geom !== (which === 'geom')) continue;
    bits.push(canon(k));
  }
  if (which === 'look' && style) bits.push(canon(style));
  return printOf(bits);
}

/**
 * The prints of a PowerPoint table (a:tbl): `text`, its cells' text and how it looks; `frame`,
 * its style, joined cells and each cell's margins, lines and fill (not its column widths, which
 * are read from the file anyway).
 */
export function slideTablePrint(tbl: Element | null): { text: string; frame: string } {
  const text: string[] = [], frame: string[] = [canon(kid(tbl, 'tblPr'))];
  for (const tr of kids(tbl, 'tr')) {
    for (const tc of kids(tr, 'tc')) {
      text.push(textPrint(kid(tc, 'txBody')));
      const joined = ['gridSpan', 'rowSpan', 'hMerge', 'vMerge'].map((a) => setting(tc, a)).join(',');
      frame.push(`${joined}${canon(kid(tc, 'tcPr'))}`);
    }
    text.push('|');
    frame.push('|');
  }
  return { text: printOf(text), frame: printOf(frame) };
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * The print of a Word table (w:tbl): how its text looks and its cells' lines and shading. Word
 * rewrites much of a table when it saves (revision ids, proofing marks, complex-script twins of
 * each setting), so this takes only the settings a person sets: bold, italic, underline, strike,
 * size, colour, font, raised or lowered, highlight and shading on the text; each paragraph's
 * alignment; and each cell's span, lines and shading.
 */
export function wordTablePrint(tbl: Element | null): string {
  const bits: string[] = [];
  const val = (el: Element | null) => el?.getAttributeNS(W, 'val') ?? el?.getAttribute('w:val') ?? null;
  const attr = (el: Element | null, a: string) => el?.getAttributeNS(W, a) ?? el?.getAttribute(`w:${a}`) ?? null;
  // a toggle (w:b, w:i): on unless its value says off
  const on = (el: Element | null) => (el && !/^(0|false|off)$/.test(val(el) ?? '') ? '1' : '');
  const color = (v: string | null) => (v && v.toLowerCase() !== 'auto' ? v.toUpperCase() : '');
  const lines = (el: Element | null) => kids(el).map((s) => `${s.localName}:${val(s) ?? ''}:${attr(s, 'sz') ?? ''}:${color(attr(s, 'color'))}`).join(';');
  const tblPr = kid(tbl, 'tblPr');
  bits.push(`t${val(kid(tblPr, 'tblStyle')) ?? ''}|${lines(kid(tblPr, 'tblBorders'))}`);
  for (const tr of kids(tbl, 'tr')) {
    for (const tc of kids(tr).filter((k) => k.localName === 'tc' || k.localName === 'sdt')) {
      const cell = tc.localName === 'sdt' ? kid(tc, 'sdtContent', 'tc') : tc;
      const tcPr = kid(cell, 'tcPr');
      bits.push(`c${val(kid(tcPr, 'gridSpan')) ?? ''}|${kid(tcPr, 'vMerge') ? val(kid(tcPr, 'vMerge')) ?? 'continue' : ''}|${lines(kid(tcPr, 'tcBorders'))}|${color(attr(kid(tcPr, 'shd'), 'fill'))}`);
      for (const p of kids(cell, 'p')) {
        bits.push(`p${val(kid(p, 'pPr', 'jc')) ?? ''}`);
        let look: string | null = null, text = '';
        const flush = () => { if (text) bits.push(`r${look}\u0002${text}`); text = ''; };
        for (const r of Array.from(p.getElementsByTagNameNS(W, 'r'))) {
          // deleted text (tracked changes) isn't shown
          let up = r.parentElement, gone = false;
          for (; up && up !== p; up = up.parentElement) if (up.localName === 'del' || up.localName === 'moveFrom') gone = true;
          if (gone) continue;
          let t = '';
          for (const k of kids(r)) t += k.localName === 't' ? k.textContent ?? '' : k.localName === 'tab' ? '\t' : k.localName === 'br' ? '\n' : '';
          if (!t) continue;
          const rPr = kid(r, 'rPr');
          const now = [
            on(kid(rPr, 'b')), on(kid(rPr, 'i')), on(kid(rPr, 'strike')), on(kid(rPr, 'dstrike')), on(kid(rPr, 'caps')), on(kid(rPr, 'smallCaps')),
            kid(rPr, 'u') && val(kid(rPr, 'u')) !== 'none' ? val(kid(rPr, 'u')) ?? 'single' : '',
            val(kid(rPr, 'sz')) ?? '', color(val(kid(rPr, 'color'))), attr(kid(rPr, 'rFonts'), 'ascii') ?? '',
            val(kid(rPr, 'vertAlign')) ?? '', val(kid(rPr, 'highlight')) ?? '', color(attr(kid(rPr, 'shd'), 'fill')),
          ].join(',');
          if (now !== look) { flush(); look = now; }
          text += t;
        }
        flush();
      }
    }
    bits.push('|');
  }
  return printOf(bits);
}

/**
 * The print of a chart as Word, PowerPoint and Excel show it: its type, title, legend, axes and
 * each series' look (its numbers are compared on their own). Taken from the chart as read from
 * its chart part, so it comes out the same however the part is laid out.
 */
export function chartPrint(c: Chart): string {
  const axis = (a: Chart['x'] | undefined) => (a ? [a.title ?? '', a.min ?? '', a.max ?? '', a.step ?? '', !!a.log, !!a.grid, !!a.reverse].join(',') : '-');
  const bits = [
    c.kind, String(!!c.stacked), String(!!c.filled), c.title ?? '', c.legend, axis(c.x), axis(c.y), axis(c.y2),
    ...c.series.map((s) => [s.color?.toUpperCase() ?? '', s.marker ?? '', s.markerSize ?? '', s.line ?? '', !!s.smooth, s.dash ?? '', s.lineWidth ?? '', !!s.labels, s.as ?? '', s.secondary ?? ''].join(',')),
  ];
  return printOf(bits);
}

/** chartPrint of a chart part written here (its XML), or '' when it doesn't read. */
export function chartPrintXml(xml: string, w: number, h: number): string {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return '';
    const got = readChartXml(doc, { row: 0, col: 0, dx: 0, dy: 0 }, w, h, 0);
    return got ? chartPrint(got.chart) : '';
  } catch {
    return '';
  }
}
