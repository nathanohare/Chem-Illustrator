// Poster templates for Design mode (File > New > New Design > Posters). Each is described by a
// short spec (page size, color theme, banner, how section headings and bodies look, and the
// sections in each column) and laid out here, so all of them space their sections the same way.

import { DESIGN_SIZES } from '../deck/deck';
import { type Box, type DesignTemplate, type Theme, THEMES, band, dot, spot, words } from './template-kit';

/** A section: its heading, how much of the column's height it takes (weight), and what is in it. */
interface Sec {
  t: string;
  /** Share of the column's height (1 when left out). */
  w?: number;
  /** The body's text (a default for the heading when left out). */
  body?: string;
  /** The body is a dashed spot for a scheme or picture, saying this. */
  spot?: string;
  /** A grid of spots (rows, columns), each saying `cell` (a substrate table, spectra, analogs). */
  grid?: [number, number, string];
  /** A catalytic cycle: a dashed ring with four spots on it. */
  cycle?: boolean;
  /** The one big sentence the poster is about, set large. */
  hero?: string;
}

interface Spec {
  id: string;
  name: string;
  blurb: string;
  sizeId: 'poster-48x36' | 'poster-36x48' | 'poster-a0';
  theme: Theme;
  banner: 'band' | 'stripe' | 'plain' | 'split' | 'side';
  head: 'bar' | 'pill' | 'rule' | 'tab' | 'number';
  body: 'card' | 'plain' | 'outline';
  cols: Sec[][];
  /** Relative column widths (equal when left out). */
  colW?: number[];
  /** A full-width row under the banner: one big sentence, or a row of spots. */
  topRow?: { h: number; hero?: string; spots?: string[] };
  /** A full-width row along the bottom of the columns (a route, a timeline). */
  bottomRow?: { h: number; spots: string[] };
  /** Columns set on a dark panel, with light text. */
  darkCols?: number[];
  /** A dark strip along the bottom: contact, QR code. */
  footer?: boolean;
  /** The page is this color (a dark poster). */
  paper?: string;
}

const BODY: Record<string, string> = {
  Introduction: 'Why this matters, and what was known before.',
  Background: 'Why this matters, and what was known before.',
  Approach: 'The plan, with the key reaction or scheme.',
  Methods: 'How the work was done: conditions, instruments, models.',
  Results: 'Schemes, tables and figures. Drag structures in from a canvas tab or paste them here.',
  Conclusions: '• First conclusion\n• Second conclusion\n• What comes next',
  Outlook: 'What comes next, and what it opens up.',
  References: '1. Reference one.\n2. Reference two.',
  Acknowledgments: 'Funding and thanks.',
  'Future work': '• Next experiment\n• Open question',
  Mechanism: 'The proposed mechanism, with the evidence for it.',
  Optimization: 'The optimization table: entry, conditions, yield.',
};

const bodyText = (s: Sec) => s.body ?? BODY[s.t] ?? 'Text, schemes and figures.';

function layout(p: Spec): DesignTemplate {
  const size = DESIGN_SIZES.find((s) => s.id === p.sizeId)!.size;
  const W = size.w, H = size.h, th = p.theme;
  // everything is sized from the short side, so a portrait and a landscape poster read alike
  const u = Math.min(W, H) / 2592;
  const M = 64 * u, gap = 56 * u, hh = 104 * u, hf = 56 * u, bf = 34 * u, under = 18 * u;
  const out: Box[] = [];
  const title = 'Poster title: what you found, in one line\nAuthor One, Author Two, Author Three\nDepartment of Chemistry, University';
  let top = 0, left = 0;
  const bh = (p.sizeId === 'poster-48x36' ? 330 : 360) * u;
  const logos = (y: number, h: number, x1 = M, x2 = W - M) => {
    const s = 0.66 * h;
    out.push(spot(x1, y + (h - s) / 2, s, s, 'Logo', 30 * u), spot(x2 - s, y + (h - s) / 2, s, s, 'Logo', 30 * u));
  };
  switch (p.banner) {
    case 'band':
    case 'stripe':
      out.push(band(0, 0, W, bh, th.dark, { text: title, size: 96 * u, bold: true, ink: th.onDark, name: 'Title banner' }));
      logos(0, bh);
      top = bh;
      if (p.banner === 'stripe') { out.push(band(0, bh, W, 20 * u, th.accent, { name: 'Stripe' })); top += 20 * u; }
      break;
    case 'plain':
      out.push(words(M + 300 * u, 0.6 * M, W - 2 * M - 600 * u, bh - M, title, 96 * u, { bold: true, ink: p.paper ? th.onDark : th.dark, name: 'Title' }));
      logos(0.6 * M, bh - M);
      out.push(band(M, bh, W - 2 * M, 10 * u, th.accent, { name: 'Rule' }));
      top = bh + 10 * u;
      break;
    case 'split': {
      const sw = 0.64 * W;
      out.push(band(0, 0, sw, bh, th.dark, { text: title, size: 90 * u, bold: true, ink: th.onDark, name: 'Title banner' }));
      out.push(band(sw, 0, W - sw, bh, th.accent, { text: 'The key finding, in one sentence', size: 68 * u, bold: true, ink: '#ffffff', name: 'Key finding' }));
      top = bh;
      break;
    }
    case 'side': {
      const sw = 0.2 * W;
      out.push(band(0, 0, sw, H, th.dark, { name: 'Side banner' }));
      out.push(words(M, M, sw - 2 * M, 1100 * u, 'Poster title: what you found\nAuthor One, Author Two, Author Three\nDepartment of Chemistry, University', 92 * u, { bold: true, ink: th.onDark, align: 'left', valign: 'top', name: 'Title' }));
      const s = 260 * u;
      out.push(spot(M, H - M - s, s, s, 'Logo', 30 * u, { ink: th.onDark, line: th.onDark }), spot(M + s + gap, H - M - s, s, s, 'QR code', 30 * u, { ink: th.onDark, line: th.onDark }));
      left = sw;
      break;
    }
  }
  const x0 = left + M, x1 = W - M;
  let y = top + gap, yEnd = H - M;
  if (p.footer) {
    const fh = 150 * u;
    out.push(band(0, H - fh, W, fh, th.dark, { text: 'Contact: name@university.edu  ·  group website  ·  scan for the paper', size: 40 * u, ink: th.onDark, name: 'Footer' }));
    out.push(spot(W - M - 0.8 * fh, H - fh + 0.1 * fh, 0.8 * fh, 0.8 * fh, 'QR', 24 * u, { ink: th.onDark, line: th.onDark }));
    yEnd = H - fh - gap;
  }
  if (p.topRow) {
    const h = p.topRow.h * u;
    if (p.topRow.hero) out.push(band(x0, y, x1 - x0, h, th.soft, { text: p.topRow.hero, size: 120 * u, bold: true, ink: th.dark, name: 'Key finding' }));
    else row(out, p.topRow.spots ?? [], x0, y, x1 - x0, h, gap, 40 * u);
    y += h + gap;
  }
  if (p.bottomRow) {
    const h = p.bottomRow.h * u;
    yEnd -= h + gap;
    row(out, p.bottomRow.spots, x0, yEnd + gap, x1 - x0, h, gap, 40 * u);
  }
  const weights = p.colW ?? p.cols.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const room = x1 - x0 - gap * (p.cols.length - 1);
  let x = x0, n = 0;
  p.cols.forEach((col, ci) => {
    const w = (room * weights[ci]) / total;
    const dark = p.darkCols?.includes(ci) ?? false;
    if (dark) out.push(band(x - gap / 2, top, w + gap, H - top, th.dark, { name: 'Dark panel' }));
    const ink = dark ? th.onDark : th.ink;
    const sum = col.reduce((a, s) => a + (s.w ?? 1), 0);
    const avail = yEnd - y - col.length * (hh + under) - (col.length - 1) * gap;
    let yy = y;
    for (const s of col) {
      n++;
      heading(out, p, th, s.t, n, x, yy, w, hh, hf, dark);
      yy += hh + under;
      const bhh = (avail * (s.w ?? 1)) / sum;
      sectionBody(out, p, th, s, x, yy, w, bhh, bf, ink, dark, u);
      yy += bhh + gap;
    }
    x += w + gap;
  });
  return { id: p.id, name: p.name, blurb: p.blurb, category: 'poster', sizeId: p.sizeId, ...(p.paper ? { paper: p.paper } : {}), boxes: out, links: [] };
}

/** A row of dashed spots side by side. */
function row(out: Box[], labels: string[], x: number, y: number, w: number, h: number, gap: number, size: number): void {
  const cw = (w - gap * (labels.length - 1)) / labels.length;
  labels.forEach((l, i) => out.push(spot(x + i * (cw + gap), y, cw, h, l, size)));
}

function heading(out: Box[], p: Spec, th: Theme, t: string, n: number, x: number, y: number, w: number, h: number, size: number, dark: boolean): void {
  // on a dark page, or a dark panel, headings are light
  const ink = dark ? th.onDark : p.paper ? th.accent : th.dark;
  switch (p.head) {
    case 'bar': out.push({ geo: 'roundRect', x, y, w, h, text: t, size, bold: true, ink: th.onDark, fill: dark ? th.accent : th.dark, line: null, name: `Heading: ${t}` }); break;
    case 'pill': out.push({ geo: 'roundRect', x, y, w, h, text: t, size, bold: true, ink: '#ffffff', fill: th.accent, line: null, name: `Heading: ${t}` }); break;
    case 'rule':
      out.push(words(x, y, w, h - 8, t, size, { bold: true, ink, align: 'left', valign: 'bottom', name: `Heading: ${t}` }));
      out.push(band(x, y + h - 6, w, 6, th.accent, { name: 'Rule' }));
      break;
    case 'tab':
      out.push(band(x, y, 0.22 * h, h, th.accent, { name: 'Tab' }));
      out.push(words(x + 0.4 * h, y, w - 0.4 * h, h, t, size, { bold: true, ink, align: 'left', name: `Heading: ${t}` }));
      break;
    case 'number':
      out.push(dot(x + h / 2, y + h / 2, h / 2, th.accent, { text: String(n), size, bold: true, ink: '#ffffff', name: `Number ${n}` }));
      out.push(words(x + 1.25 * h, y, w - 1.25 * h, h, t, size, { bold: true, ink, align: 'left', name: `Heading: ${t}` }));
      break;
  }
}

function sectionBody(out: Box[], p: Spec, th: Theme, s: Sec, x: number, y: number, w: number, h: number, size: number, ink: string, dark: boolean, u: number): void {
  const fill = dark ? null : p.body === 'card' ? th.soft : null;
  const line = !dark && p.body === 'outline' ? th.dark : null;
  const look: Partial<Box> = { fill, line, lw: 4 * u, ink, align: 'left', valign: 'top' };
  if (s.hero) {
    out.push(band(x, y, w, h, dark ? th.soft : th.soft, { text: s.hero, size: 104 * u, bold: true, ink: th.dark, name: 'Key finding' }));
    return;
  }
  if (s.spot) { out.push(spot(x, y, w, h, s.spot, 40 * u)); return; }
  if (s.grid || s.cycle) {
    // a line of text, then the picture area under it
    const th1 = 2.6 * size;
    out.push({ geo: 'rect', x, y, w, h, text: bodyText(s), size, ...look, name: `Body: ${s.t}` });
    const ix = x + 0.6 * size, iy = y + th1, iw = w - 1.2 * size, ih = h - th1 - 0.6 * size;
    if (s.grid) {
      const [r, c, cell] = s.grid, g = 0.6 * size;
      const cw = (iw - g * (c - 1)) / c, ch = (ih - g * (r - 1)) / r;
      let k = 0;
      for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out.push(spot(ix + j * (cw + g), iy + i * (ch + g), cw, ch, cell.replace('#', String(++k)), 26 * u));
    } else {
      const cx = ix + iw / 2, cy = iy + ih / 2, R = Math.min(iw, ih) * 0.33, sw = Math.min(iw, ih) * 0.26;
      out.push({ geo: 'ellipse', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: null, line: th.accent, lw: 6 * u, dashed: true, name: 'Cycle' });
      out.push(words(cx - R * 0.6, cy - 60 * u, R * 1.2, 120 * u, 'Catalyst', 44 * u, { bold: true, ink: th.dark }));
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => out.push(spot(cx + dx * R - sw / 2, cy + dy * R - sw / 2, sw, sw, `Intermediate ${i + 1}`, 24 * u, { fill: '#ffffff' })));
    }
    return;
  }
  out.push({ geo: 'rect', x, y, w, h, text: bodyText(s), size, ...look, name: `Body: ${s.t}` });
}

const T = THEMES;
const intro: Sec = { t: 'Introduction' }, concl: Sec = { t: 'Conclusions' }, refs: Sec = { t: 'References', w: 0.5 }, ack: Sec = { t: 'Acknowledgments', w: 0.3 };

const SPECS: Spec[] = [
  {
    id: 'poster-four', name: 'Four columns', blurb: 'Four even columns under a plain title with an accent rule.', sizeId: 'poster-48x36', theme: T.slate, banner: 'plain', head: 'rule', body: 'plain',
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 1 }, { t: 'Results, continued' }], [{ t: 'Mechanism' }, { t: 'Scope', spot: 'Substrate table' }], [concl, { t: 'Future work', w: 0.6 }, refs, ack]],
  },
  {
    id: 'poster-two-portrait', name: 'Two columns, portrait', blurb: 'A tall poster in two columns with a title banner.', sizeId: 'poster-36x48', theme: T.navy, banner: 'band', head: 'bar', body: 'card',
    cols: [[intro, { t: 'Approach' }, { t: 'Methods', w: 0.7 }], [{ t: 'Results', w: 2 }, concl, refs]],
  },
  {
    id: 'poster-three-portrait', name: 'Three columns, portrait', blurb: 'Three narrow columns with tabbed headings.', sizeId: 'poster-36x48', theme: T.teal, banner: 'stripe', head: 'tab', body: 'card',
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [{ t: 'Mechanism' }, concl, refs]],
  },
  {
    id: 'poster-center', name: 'Central results', blurb: 'A wide middle column for the main scheme, with background and conclusions either side.', sizeId: 'poster-48x36', theme: T.blue, banner: 'band', head: 'bar', body: 'card', colW: [1, 1.7, 1],
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', spot: 'Main scheme or figure', w: 2 }, { t: 'Results, continued' }], [concl, { t: 'Outlook' }, refs, ack]],
  },
  {
    id: 'poster-takeaway', name: 'Big takeaway', blurb: 'The main finding in large plain words in the middle, details in the side columns, a QR code for the paper.', sizeId: 'poster-48x36', theme: T.slate, banner: 'plain', head: 'rule', body: 'plain', colW: [1, 1.8, 1],
    cols: [[intro, { t: 'Methods' }, refs], [{ t: 'Key finding', hero: 'The main finding, in plain words, with the {b:key words} in bold.', w: 2.2 }, { t: 'Scan for the paper', spot: 'QR code', w: 0.6 }], [{ t: 'Results' }, concl, ack]],
  },
  {
    id: 'poster-takeaway-portrait', name: 'Big takeaway, portrait', blurb: 'The main finding across the top in large words, two columns of details under it.', sizeId: 'poster-36x48', theme: T.plum, banner: 'band', head: 'rule', body: 'plain',
    topRow: { h: 560, hero: 'The main finding, in plain words, with the key words in bold.' },
    cols: [[intro, { t: 'Approach' }, { t: 'Methods' }], [{ t: 'Results', w: 1.5 }, concl, refs]],
  },
  {
    id: 'poster-route', name: 'Total synthesis', blurb: 'The route across the top, then the key steps, problems solved and outlook in three columns.', sizeId: 'poster-48x36', theme: T.forest, banner: 'band', head: 'bar', body: 'card',
    topRow: { h: 620, spots: ['Synthetic route: starting material to target'] },
    cols: [[{ t: 'Background' }, { t: 'Retrosynthesis', spot: 'Retrosynthetic analysis' }], [{ t: 'Key steps' }, { t: 'Problems solved' }], [concl, refs, ack]],
  },
  {
    id: 'poster-method', name: 'New method', blurb: 'Introduction, optimization, a large substrate scope, mechanism and conclusions, numbered in reading order.', sizeId: 'poster-48x36', theme: T.crimson, banner: 'band', head: 'number', body: 'card', colW: [1, 1.5, 1],
    cols: [[intro, { t: 'Optimization' }], [{ t: 'Substrate scope', grid: [4, 5, '#a, yield'], w: 2 }], [{ t: 'Mechanism', cycle: true, w: 1.2 }, concl, refs]],
  },
  {
    id: 'poster-scope', name: 'Substrate scope', blurb: 'A large grid of products with yields in the middle, conditions above it.', sizeId: 'poster-48x36', theme: T.navy, banner: 'stripe', head: 'bar', body: 'card', colW: [1, 2.2, 1],
    cols: [[intro, { t: 'Optimization' }], [{ t: 'General conditions', spot: 'Reaction with conditions', w: 0.4 }, { t: 'Substrate scope', grid: [4, 6, '#'], w: 2 }], [{ t: 'Limitations' }, concl, refs]],
  },
  {
    id: 'poster-cycle', name: 'Mechanism focus', blurb: 'A catalytic cycle at the center, evidence for each step around it.', sizeId: 'poster-48x36', theme: T.teal, banner: 'band', head: 'bar', body: 'card', colW: [1, 1.6, 1],
    cols: [[intro, { t: 'Kinetics' }], [{ t: 'Proposed mechanism', cycle: true, w: 2 }], [{ t: 'Labeling studies' }, { t: 'Computations' }, concl]],
  },
  {
    id: 'poster-story', name: 'Storyboard', blurb: 'Six numbered panels read left to right, top to bottom, like a comic strip.', sizeId: 'poster-48x36', theme: T.plum, banner: 'band', head: 'number', body: 'outline',
    cols: [[{ t: 'The problem' }, { t: 'First result' }], [{ t: 'The idea' }, { t: 'What we learned' }], [{ t: 'How we tested it' }, { t: 'Where it goes next' }]],
  },
  {
    id: 'poster-qa', name: 'Question and answer', blurb: 'Three columns that ask the question, show the approach and give the answer.', sizeId: 'poster-48x36', theme: T.orange, banner: 'plain', head: 'pill', body: 'card',
    cols: [[{ t: 'The question', body: 'One question, in plain words.' }, { t: 'Why it matters' }], [{ t: 'Our approach', w: 2 }], [{ t: 'The answer', body: 'The answer, in one or two sentences.' }, { t: 'What next' }, refs]],
  },
  {
    id: 'poster-bottom-route', name: 'Route along the bottom', blurb: 'Three columns of sections with a full-width strip along the bottom for a route or timeline.', sizeId: 'poster-48x36', theme: T.blue, banner: 'band', head: 'tab', body: 'card',
    bottomRow: { h: 520, spots: ['Route or timeline'] },
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [concl, refs]],
  },
  {
    id: 'poster-a0', name: 'A0 portrait', blurb: 'The A0 size used at European meetings: banner, two columns and a footer with a QR code.', sizeId: 'poster-a0', theme: T.navy, banner: 'band', head: 'bar', body: 'card', footer: true,
    cols: [[intro, { t: 'Approach' }, { t: 'Methods', w: 0.7 }], [{ t: 'Results', w: 2 }, concl]],
  },
  {
    id: 'poster-minimal', name: 'Minimal', blurb: 'White space, thin accent rules and no filled boxes.', sizeId: 'poster-48x36', theme: T.slate, banner: 'plain', head: 'rule', body: 'plain',
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [concl, refs, ack]],
  },
  {
    id: 'poster-dark', name: 'Dark', blurb: 'Light text on a dark page, with gold headings (prints well on fabric).', sizeId: 'poster-48x36', theme: T.night, banner: 'plain', head: 'rule', body: 'card', paper: '#0d1b2a',
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [concl, refs]],
  },
  {
    id: 'poster-side', name: 'Sidebar title', blurb: 'The title, authors and logos run down a colored left sidebar; three columns to the right.', sizeId: 'poster-48x36', theme: T.teal, banner: 'side', head: 'rule', body: 'card',
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [concl, refs, ack]],
  },
  {
    id: 'poster-this-work', name: 'Previous work and this work', blurb: 'What was known beside what is new, with the new work given the most room.', sizeId: 'poster-48x36', theme: T.crimson, banner: 'band', head: 'bar', body: 'card', colW: [1, 1.6, 1],
    cols: [[intro, { t: 'Previous work', spot: 'Earlier methods' }], [{ t: 'This work', spot: 'The new reaction', w: 1.2 }, { t: 'Results' }], [{ t: 'Scope' }, concl, refs]],
  },
  {
    id: 'poster-computational', name: 'Computational study', blurb: 'Methods and models on the left, a large energy profile in the middle, conclusions on the right.', sizeId: 'poster-48x36', theme: T.blue, banner: 'stripe', head: 'bar', body: 'card', colW: [1, 1.6, 1],
    cols: [[intro, { t: 'Methods', body: 'Level of theory, basis set, solvent model, software.' }], [{ t: 'Energy profile', spot: 'Reaction energy diagram', w: 1.4 }, { t: 'Key structures', grid: [1, 3, 'TS #'] }], [{ t: 'Comparison with experiment' }, concl, refs]],
  },
  {
    id: 'poster-materials', name: 'Materials and devices', blurb: 'A large picture of the material or device up top, then properties and results.', sizeId: 'poster-36x48', theme: T.plum, banner: 'band', head: 'pill', body: 'card',
    topRow: { h: 700, spots: ['Material or device', 'Structure'] },
    cols: [[intro, { t: 'Synthesis' }], [{ t: 'Properties' }, concl, refs]],
  },
  {
    id: 'poster-spectra', name: 'Spectroscopy', blurb: 'A grid of spectra in the middle, with the samples and assignments either side.', sizeId: 'poster-48x36', theme: T.slate, banner: 'band', head: 'tab', body: 'card', colW: [1, 1.8, 1],
    cols: [[intro, { t: 'Samples' }], [{ t: 'Spectra', grid: [2, 3, 'Spectrum #'], w: 2 }], [{ t: 'Assignments' }, concl, refs]],
  },
  {
    id: 'poster-sar', name: 'Medicinal chemistry', blurb: 'The lead compound, a grid of analogs with their activity, and the SAR summary.', sizeId: 'poster-48x36', theme: T.crimson, banner: 'stripe', head: 'bar', body: 'card', colW: [1, 1.8, 1],
    cols: [[{ t: 'Target' }, { t: 'Lead compound', spot: 'Lead structure' }], [{ t: 'Analogs', grid: [3, 4, 'Analog #, IC50'], w: 2 }], [{ t: 'SAR summary' }, { t: 'Next steps' }, refs]],
  },
  {
    id: 'poster-undergrad', name: 'Undergraduate research', blurb: 'A simple two-column poster for a first project.', sizeId: 'poster-36x48', theme: T.orange, banner: 'band', head: 'pill', body: 'card',
    cols: [[{ t: 'Introduction' }, { t: 'What I did' }, { t: 'Methods', w: 0.7 }], [{ t: 'What I found', w: 1.6 }, { t: 'What I learned' }, ack]],
  },
  {
    id: 'poster-split', name: 'Split banner', blurb: 'The title on the left of the banner, the key finding in an accent color on the right.', sizeId: 'poster-48x36', theme: T.navy, banner: 'split', head: 'bar', body: 'card',
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [concl, refs, ack]],
  },
  {
    id: 'poster-group', name: 'Research group overview', blurb: 'Four research areas in quadrants with the group photo and contact details.', sizeId: 'poster-48x36', theme: T.forest, banner: 'band', head: 'number', body: 'card', colW: [1, 1, 0.8],
    cols: [[{ t: 'Research area one' }, { t: 'Research area three' }], [{ t: 'Research area two' }, { t: 'Research area four' }], [{ t: 'The group', spot: 'Group photo' }, { t: 'Join us', body: 'Open positions, contact and website.' }, { t: 'Recent papers' }]],
  },
  {
    id: 'poster-retro', name: 'Retrosynthesis', blurb: 'A full-width retrosynthetic analysis under the title, with the forward route and results below.', sizeId: 'poster-48x36', theme: T.teal, banner: 'band', head: 'bar', body: 'card',
    topRow: { h: 560, spots: ['Target', 'Key disconnection', 'Fragments', 'Building blocks'] },
    cols: [[{ t: 'Background' }, { t: 'Strategy' }], [{ t: 'Forward synthesis', w: 2 }], [concl, refs]],
  },
  {
    id: 'poster-photos', name: 'Picture strip', blurb: 'A strip of four pictures under the title, then three columns.', sizeId: 'poster-48x36', theme: T.navy, banner: 'band', head: 'tab', body: 'card',
    topRow: { h: 460, spots: ['Picture', 'Picture', 'Picture', 'Picture'] },
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results' }], [concl, refs]],
  },
  {
    id: 'poster-two-tone', name: 'Two-tone', blurb: 'Background and approach on a dark panel at the left, results and conclusions on white.', sizeId: 'poster-48x36', theme: T.plum, banner: 'plain', head: 'rule', body: 'card', darkCols: [0],
    cols: [[intro, { t: 'Approach' }, refs], [{ t: 'Results', w: 2 }], [concl, { t: 'Outlook' }, ack]],
  },
  {
    id: 'poster-footer', name: 'Three columns with footer', blurb: 'Three columns, portrait, with a contact strip and QR code along the bottom.', sizeId: 'poster-36x48', theme: T.blue, banner: 'stripe', head: 'bar', body: 'card', footer: true,
    cols: [[intro, { t: 'Approach' }], [{ t: 'Results', w: 2 }], [concl, refs]],
  },
];

export const POSTERS: DesignTemplate[] = SPECS.map(layout);
