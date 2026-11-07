// Insert ▸ Diagram: SmartArt-like diagrams drawn from an indented outline, one item per line and
// a Tab (or two spaces) for each level down. Layouts run from lists, processes and cycles to
// timelines, hierarchies, relationships, matrices and pyramids. A few read more than words from a
// line: a swimlane step names its lane before a colon, and a Gantt chart's or dated timeline's
// line ends in ": when" (timescale.ts reads the dates).
//
// The parts are ordinary library shapes holding their own text, plus connectors, gathered in an
// invisible frame that remembers the outline and the look; changing either draws the parts again.
// PowerPoint and Word files get the shapes as one group, so they can be moved, resized and
// retyped there as well.
//
// Structures can sit in items, as they can in a table's cells: see "Structures held in items".

import { Doc, type Arrow, type Contents, type Entity, type Frame, type ParaStyle, type Shape, type TextRun } from '../model';
import { POINTS, selectionBox, type Measure, type Selection } from '../editor/arrange';
import type { Rect, Vec } from '../geom';
import type { Measure as TextMeasure } from '../text/layout';
import { layoutText } from '../text/layout';
import { chemRuns } from '../text/chemtext';
import { arialWidth } from '../text-metrics';
import { tint } from '../colours';
import { frameBox } from '../editor/frames';
import { hasPins, followPins } from '../chem/pins';
import { gluePoint, shapeBox } from '../objects';
import { HEX_CELL, geoDef, sectorBox, sectorId, sliceId, textArea } from './geo';
import { findIcons, isIconId, ICON_PREFIX } from './icons';
import { axisMarks, parseTaskLine, placeOnAxis, type TimeSpan } from './timescale';

// ---------------------------------------------------------------- the data

export type DiagramColours = 'accent' | 'shades' | 'colourful' | 'light' | 'outline' | 'mono' | 'grey';

export interface DiagramData {
  /** Which layout (DIAGRAM_LAYOUTS). */
  layout: string;
  /** The items, one per line; a Tab (or two spaces) in front for each level down. */
  text: string;
  colours: DiagramColours;
  /** The colour the colours are made from. */
  accent: string;
  /** Rounded corners on boxes. */
  rounded: boolean;
  /** A soft shadow under the main shapes. */
  shadow: boolean;
  /** Text size in points; left out, the text is made as big as fits (the same size in every shape). */
  size?: number;
  /** The box it is drawn in, in points. */
  w: number;
  h: number;
  /** Space held in an item for a structure, by the item's line number (from 1): the structure's width and height in points. */
  figs?: { [line: string]: { w: number; h: number } };
}

export const DIAGRAM_CATEGORIES = ['List', 'Process', 'Timeline', 'Cycle', 'Hierarchy', 'Relationship', 'Matrix', 'Pyramid'] as const;
export type DiagramCategory = (typeof DIAGRAM_CATEGORIES)[number];

export interface DiagramLayout {
  id: string;
  name: string;
  category: DiagramCategory;
  blurb: string;
  /** Text to start from. */
  sample: string;
  /** Its size when first put on a slide (points); documents take it smaller. */
  size: [number, number];
}


const STEPS = 'Starting material\nReaction\nWork-up\nPurification\nAnalysis';

export const DIAGRAM_LAYOUTS: DiagramLayout[] = [
  { id: 'blocks', name: 'Block list', category: 'List', blurb: 'Boxes in rows, one for each item; lines below an item are listed in its box.', sample: 'Synthesis\nCharacterisation\nKinetics\nComputation\nApplications', size: [480, 260] },
  { id: 'vertical-list', name: 'Vertical bullet list', category: 'List', blurb: 'A bar for each item with the lines below it as bullets underneath.', sample: 'Aims\n\tMake the ligand in three steps\n\tScreen the catalysts\nResults\n\tFive new complexes\n\tUp to 96% ee', size: [480, 300] },
  { id: 'horizontal-list', name: 'Horizontal bullet list', category: 'List', blurb: 'A heading for each item with its lines as bullets in a column below.', sample: 'NMR\n\t¹H and ¹³C\n\tNOESY\nMass spec\n\tHRMS (ESI)\nX-ray\n\tSingle crystal', size: [480, 280] },
  { id: 'honeycomb', name: 'Honeycomb', category: 'List', blurb: 'Six-sided cells packed edge to edge, one for each item; any lines under an item go inside its cell.', sample: 'Air-stable\nScalable\nCheap ligand\nRoom temperature\nGreen solvent\nFew steps', size: [480, 340] },
  { id: 'icon-list', name: 'Icon list', category: 'List', blurb: 'An icon above each item, chosen to match its text. To choose one, put its name in square brackets first: [flask] Synthesis.', sample: '[flask-round-bottom] Synthesis\n[microscope] Analysis\n[chart-line] Data\n[file-document] Paper', size: [480, 240] },
  { id: 'process', name: 'Basic process', category: 'Process', blurb: 'Boxes joined by arrows, left to right.', sample: STEPS, size: [560, 180] },
  { id: 'chevrons', name: 'Chevron process', category: 'Process', blurb: 'Chevrons pointing on; lines below an item are listed under its chevron.', sample: 'Design\n\tRetrosynthesis\nMake\n\tSix steps\nTest\n\tBioassay', size: [560, 200] },
  { id: 'vertical-process', name: 'Vertical process', category: 'Process', blurb: 'Boxes joined by arrows, top to bottom.', sample: 'Quench\nExtract\nDry\nConcentrate', size: [280, 380] },
  { id: 'steps', name: 'Staircase', category: 'Process', blurb: 'Steps rising from left to right.', sample: 'Hit\nLead\nCandidate\nDrug', size: [480, 300] },
  { id: 'arch', name: 'Bending process', category: 'Process', blurb: 'Circles strung on a ribbon that loops over one circle and under the next; lines under an item become its caption. A line holding only [] leaves an empty circle for a structure.', sample: 'Oxidation\n\tSwern\nOlefination\n\tWittig\nReduction\nDeprotection\n\tTBAF', size: [600, 260] },
  { id: 'arrow-circles', name: 'Circles on an arrow', category: 'Process', blurb: 'Circles sitting on a wide arrow; lines under an item caption it, alternating above and below.', sample: 'Screen\n\t24 conditions\nOptimize\n\tBest three\nScale up\n\t10 g', size: [560, 240] },
  { id: 'swimlane', name: 'Swimlane flowchart', category: 'Process', blurb: 'Cross-functional flowchart: steps run left to right in horizontal lanes, joined by arrows. Start a line with its lane and a colon (Lane: step); a line with no lane stays in the last one. A step ending in ? is a decision, and Start or End a terminator.', sample: 'Student: Start\nStudent: Submit sample\nFacility: Run HRMS\nFacility: Data good?\nStudent: Resubmit\nFacility: Send report\nStudent: End', size: [620, 300] },
  { id: 'timeline', name: 'Timeline', category: 'Timeline', blurb: 'Points along a line, labeled above and below in turn.', sample: '1828\n\tWöhler: urea\n1856\n\tPerkin: mauveine\n1912\n\tGrignard\n1990\n\tCorey', size: [560, 240] },
  { id: 'dated-timeline', name: 'Timeline with dates', category: 'Timeline', blurb: 'Dates placed to scale along a line: spans as bars above it, milestones as diamonds on it. End a line with a colon and a date (Defense: May 2027) or a range (Synthesis: Jan – Jun 2026); days, quarters (Q3 2026) and counted steps (Week 3) work too.', sample: 'Start in lab: Aug 2025\nCourse work: Aug – Dec 2025\nRoute scouting: Oct 2025 – Feb 2026\nScale-up: Feb – Jun 2026\nQualifying exam: Apr 2026\nFirst paper: Sep 2026', size: [620, 300] },
  { id: 'gantt', name: 'Gantt chart', category: 'Timeline', blurb: 'A row for each task with a bar across its dates, under a time scale. End each line with a colon and its dates (Task: Mar – May 2026), or a single date for a milestone. Tasks indented under a heading give it a summary bar.', sample: 'Route\n\tFragment A: Jan – Feb 2026\n\tFragment B: Feb – Apr 2026\nCoupling: Apr – May 2026\nSAR study: May – Aug 2026\nReport due: Sep 2026', size: [620, 300] },
  { id: 'equation', name: 'Equation', category: 'Process', blurb: 'Items joined by plus signs, with an arrow to the last.', sample: 'Aryl halide\nBoronic acid\nBiaryl', size: [520, 160] },
  { id: 'cycle', name: 'Basic cycle', category: 'Cycle', blurb: 'Circles around a loop, joined by curved arrows.', sample: 'Oxidative addition\nTransmetalation\nReductive elimination', size: [380, 380] },
  { id: 'ring', name: 'Segmented ring', category: 'Cycle', blurb: 'A ring split into one segment for each item. Indent the rest under the first item to put that one in the center.', sample: 'Thermal\nPhotochemical\nElectrochemical\nMechanochemical', size: [380, 380] },
  { id: 'radial', name: 'Radial', category: 'Cycle', blurb: 'The first item in the middle, the others around it. Indent the outer ones under the first to make it clear.', sample: 'Catalyst\n\tLigand\n\tMetal\n\tBase\n\tSolvent', size: [400, 400] },
  { id: 'org', name: 'Hierarchy', category: 'Hierarchy', blurb: 'A tree from the top down (an organization chart). Indent an item under the one it comes from.', sample: 'PI\n\tPostdoc\n\t\tGrad student\n\t\tGrad student\n\tLab manager\n\t\tUndergraduate', size: [520, 320] },
  { id: 'tree-h', name: 'Horizontal hierarchy', category: 'Hierarchy', blurb: 'A tree from left to right.', sample: 'Hydrocarbons\n\tAliphatic\n\t\tAlkanes\n\t\tAlkenes\n\tAromatic\n\t\tBenzenoid\n\t\tHeteroaromatic', size: [520, 320] },
  { id: 'venn', name: 'Venn', category: 'Relationship', blurb: 'Circles that overlap, see-through so the overlaps show.', sample: 'Yield\nSelectivity\nCost', size: [380, 360] },
  { id: 'target', name: 'Target', category: 'Relationship', blurb: 'Rings inside rings, the first item outermost.', sample: 'Natural products\nAlkaloids\nIndole alkaloids\nStrychnine', size: [380, 380] },
  { id: 'matrix', name: 'Matrix', category: 'Matrix', blurb: 'Four quarters. Indent four items under a first one to put it in the middle.', sample: 'Fast and cheap\nFast and costly\nSlow and cheap\nSlow and costly', size: [400, 360] },
  { id: 'pyramid', name: 'Pyramid', category: 'Pyramid', blurb: 'Layers of a pyramid, the first at the top.', sample: 'Total synthesis\nMethods\nMechanism\nFundamentals', size: [420, 340] },
  { id: 'funnel', name: 'Funnel', category: 'Pyramid', blurb: 'Layers narrowing downwards, the first at the top (an upside-down pyramid).', sample: 'Library (10,000)\nHits (300)\nLeads (12)\nCandidate (1)', size: [420, 340] },
];

export const DIAGRAM_BY_ID = new Map(DIAGRAM_LAYOUTS.map((l) => [l.id, l]));

export const DIAGRAM_COLOURS: [DiagramColours, string][] = [
  ['accent', 'Accent color'], ['shades', 'Shades of the accent'], ['colourful', 'Colorful'], ['light', 'Light fill, colored line'],
  ['outline', 'Outline only'], ['mono', 'Black and white (journals)'], ['grey', 'Grays'],
];

/** Office's accent colours, in turn, for the colourful look. */
export const COLOURFUL = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];

export const DIAGRAM_DEFAULTS: Omit<DiagramData, 'layout' | 'text' | 'w' | 'h'> = { colours: 'accent', accent: '#4472c4', rounded: true, shadow: false };

// ---------------------------------------------------------------- the text

export interface DiagramItem {
  text: string;
  /** An icon chosen in square brackets in front ("icon:…"). */
  icon?: string;
  kids: DiagramItem[];
  /** Its line among the lines with something on them, from 1. */
  n: number;
  /** How far down the outline it is: 0 for the items at the top. */
  depth: number;
}

const LEAD = /^[\t ]*/;
const BULLET = /^[•\-*–·▪◦]\s+/;
const ICON = /^\[([a-z0-9-]+)\]\s*/i;

/** A line's level (Tabs, or two spaces each) and its text without a bullet typed in front. */
function lineParts(line: string): { level: number; text: string; icon?: string } {
  const lead = LEAD.exec(line)![0];
  let level = 0;
  for (const ch of lead) level += ch === '\t' ? 1 : 0.5;
  let text = line.slice(lead.length).trim().replace(BULLET, '');
  let icon: string | undefined;
  const m = ICON.exec(text);
  if (m) { icon = ICON_PREFIX + m[1].toLowerCase(); text = text.slice(m[0].length); }
  // a line of just "[]" is an item without words: room for a structure and nothing else
  if (/^\[\s*\]$/.test(text)) text = '';
  return { level: Math.floor(level + 1e-9), text, ...(icon ? { icon } : {}) };
}

/** The items as a tree: each line under the nearest line above it that is less indented. */
export function parseOutline(text: string): DiagramItem[] {
  const roots: DiagramItem[] = [];
  const stack: { level: number; item: DiagramItem }[] = [];
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const p = lineParts(line);
    while (stack.length && stack[stack.length - 1].level >= p.level) stack.pop();
    const item: DiagramItem = { text: p.text, kids: [], n: ++n, depth: stack.length, ...(p.icon ? { icon: p.icon } : {}) };
    if (stack.length) stack[stack.length - 1].item.kids.push(item);
    else roots.push(item);
    stack.push({ level: p.level, item });
  }
  return roots;
}

/** The text with item `n`'s words changed (its indent and icon kept). */
export function setItemText(text: string, n: number, words: string): string {
  let k = 0;
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim() || ++k !== n) return line;
    const lead = LEAD.exec(line)![0];
    const rest = line.slice(lead.length);
    const icon = ICON.exec(rest.replace(BULLET, ''))?.[0] ?? '';
    return lead + icon + words;
  }).join('\n');
}

/** Item and every item below it, in order (the lines n…). */
function withKids(it: DiagramItem): DiagramItem[] {
  return [it, ...it.kids.flatMap(withKids)];
}

/** Plain words of a typed line, as they show (markup for sub- and superscripts taken out). */
export const shownText = (t: string): string => chemRuns(t).map((r) => r.text).join('');

// ---------------------------------------------------------------- layouts

/**
 * How a part is colored: an item's main shape, a box listing the lines under it, bare text, small
 * marks (arrows, plus signs, dots), an icon, or a solid ribbon (the bending process's).
 */
type Role =
  | 'item' | 'sub' | 'label'
  | 'deco' | 'icon' | 'band';

/** A shape of a diagram as laid out, before it is coloured: its box from the diagram's top left. */
export interface PartShape {
  geo: string;
  box: Rect;
  role: Role;
  /** What it says: its first paragraph (absent for a box of lines only), then lines as bullets. */
  head?: DiagramItem;
  lines?: DiagramItem[];
  /** Which colour of the scheme (0 … tones - 1). */
  tone: number;
  align?: Shape['textAlign'];
  valign?: Shape['textValign'];
  /** See-through (Venn circles). */
  clear?: number;
  /** Text of this role group sized on its own (a target's rings). */
  group?: string;
  /** Only this much of the text area's width is used for fitting (Venn circles, clear of the overlaps). */
  fitW?: number;
  /** Space for a held structure (DiagramData.figs): it takes the upper part of the text area, the words go below. */
  fig?: NonNullable<DiagramData['figs']>[string];
  /** A ceiling on the text size in points when fitting (rows with width to spare, such as a Gantt chart's). */
  sizeCap?: number;
}

/** A line or arrow of a diagram, from the diagram's top left; `from`/`to` stick it to shapes (index, side). */
export interface PartLine {
  tail: Vec;
  head: Vec;
  sweep?: number;
  elbow?: boolean;
  arrow?: boolean;
  from?: [number, number];
  to?: [number, number];
  tone: number;
  /** Drawn thin and light gray (grid lines, leader lines). */
  light?: boolean;
}

export interface DiagramLaid { shapes: PartShape[]; lines: PartLine[]; tones: number }

const R = (x: number, y: number, w: number, h: number): Rect => ({ x1: x, y1: y, x2: x + w, y2: y + h });

/** The best rows × columns for n boxes in a w × h area (boxes near 1.6 wide to 1 high). */
function grid(n: number, w: number, h: number, g: number, aspect = 1.6): { c: number; r: number; bw: number; bh: number } {
  let best = { c: 1, r: n, bw: w, bh: h, score: Infinity };
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const bw = (w - (c - 1) * g) / c, bh = (h - (r - 1) * g) / r;
    if (bw <= 0 || bh <= 0) continue;
    const score = Math.abs(Math.log(bw / bh / aspect));
    if (score < best.score - 1e-9) best = { c, r, bw, bh, score };
  }
  return best;
}

/** Leaves under an item (1 for an item with none). */
const leaves = (it: DiagramItem): number => (it.kids.length ? it.kids.reduce((a, k) => a + leaves(k), 0) : 1);
const depth = (it: DiagramItem): number => 1 + Math.max(0, ...it.kids.map(depth));

/** The layout's parts, each item's shape marked with the space its held structure needs. */
function lay(d: DiagramData): DiagramLaid {
  const parts = layoutParts(d);
  if (!d.figs) return parts;
  for (const [line, part] of wordShapes(parts)) {
    const need = d.figs[String(line)];
    if (need) part.fig = need;
  }
  return parts;
}

/** For each item, by its line number, the first item or label shape that shows its words. */
function wordShapes(laid: DiagramLaid): Map<number, PartShape> {
  const byLine = new Map<number, PartShape>();
  for (const part of laid.shapes) {
    const line = part.head?.n ?? 0;
    if (line < 1 || byLine.has(line)) continue;
    if (part.role === 'item' || part.role === 'label') byLine.set(line, part);
  }
  return byLine;
}

/** The shapes and lines of a diagram's layout, laid out in its box. */
function layoutParts(d: DiagramData): DiagramLaid {
  const items = parseOutline(d.text);
  const w = Math.max(20, d.w), h = Math.max(20, d.h);
  const g = Math.max(3, 0.03 * Math.min(w, h));
  const box = d.rounded ? 'roundRect' : 'rect';
  const shapes: PartShape[] = [];
  const lines: PartLine[] = [];
  const n = items.length;
  const out = (tones: number): DiagramLaid => ({ shapes, lines, tones: Math.max(1, tones) });
  if (!n) return out(1);
  const kidsOf = (it: DiagramItem) => it.kids.flatMap(withKids);
  switch (d.layout) {
    default:
    case 'blocks': {
      const q = grid(n, w, h, g);
      items.forEach((it, i) => {
        const r = Math.floor(i / q.c), inRow = Math.min(q.c, n - r * q.c);
        const x0 = (w - (inRow * q.bw + (inRow - 1) * g)) / 2;
        shapes.push({ geo: box, box: R(x0 + (i % q.c) * (q.bw + g), r * (q.bh + g), q.bw, q.bh), role: 'item', head: it, lines: kidsOf(it), tone: i });
      });
      return out(n);
    }
    case 'vertical-list': {
      const rows = items.map((it) => kidsOf(it).length);
      const units = rows.reduce((a, k) => a + 1 + (k ? 0.15 + 0.55 * k : 0), 0);
      const u = (h - (n - 1) * g) / units;
      let y = 0;
      items.forEach((it, i) => {
        const bar = Math.min(u, 0.35 * w);
        shapes.push({ geo: box, box: R(0, y, w, bar), role: 'item', head: it, tone: i, align: 'left' });
        y += bar;
        const k = rows[i];
        if (k) {
          const sh = u * (0.15 + 0.55 * k);
          shapes.push({ geo: 'rect', box: R(0.04 * w, y, 0.92 * w, sh), role: 'sub', lines: kidsOf(it), tone: i, align: 'left', valign: 'top' });
          y += sh;
        }
        y += g + (u - bar);
      });
      return out(n);
    }
    case 'horizontal-list': {
      const any = items.some((it) => it.kids.length);
      const bw = (w - (n - 1) * g) / n;
      const hh = any ? Math.min(0.3 * h, Math.max(0.18 * h, bw * 0.45)) : h;
      items.forEach((it, i) => {
        const x = i * (bw + g);
        shapes.push({ geo: box, box: R(x, 0, bw, hh), role: 'item', head: it, tone: i });
        if (any) shapes.push({ geo: 'rect', box: R(x + 0.04 * bw, hh, 0.92 * bw, h - hh), role: 'sub', lines: kidsOf(it), tone: i, align: 'left', valign: 'top' });
      });
      return out(n);
    }
    case 'honeycomb': {
      // flat-topped hexagons standing in columns 1.5 r apart, the odd columns dropped by half a
      // cell (a cell of radius r is 2r across and √3 r tall); every column count is tried and the
      // one giving the biggest cells kept
      const SQ3 = Math.sqrt(3);
      let fit = { cols: 1, r: 0, tall: n };
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const inLastRow = n - (rows - 1) * cols;
        // a dropped column reaching the last row makes the block half a cell taller
        const tall = rows + (cols > 1 && inLastRow > 1 ? 0.5 : 0);
        const r = Math.min(w / (1.5 * cols + 0.5), h / (SQ3 * tall));
        if (r > fit.r + 1e-9) fit = { cols, r, tall };
      }
      const { cols, r, tall } = fit;
      const left = (w - r * (1.5 * cols + 0.5)) / 2, top = (h - SQ3 * r * tall) / 2;
      // each hexagon drawn a little inside its cell, leaving a gap round it
      const hex = Math.max(r / 2, r - g / 2);
      items.forEach((it, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = left + r * (1 + 1.5 * col);
        const cy = top + SQ3 * r * (row + (col % 2 === 1 ? 1 : 0.5));
        shapes.push({ geo: HEX_CELL, box: R(cx - hex, cy - (SQ3 / 2) * hex, 2 * hex, SQ3 * hex), role: 'item', head: it, lines: kidsOf(it), tone: i });
      });
      return out(n);
    }
    case 'icon-list': {
      const bw = (w - (n - 1) * g) / n;
      const s = Math.min(0.7 * bw, 0.45 * h);
      items.forEach((it, i) => {
        const x = i * (bw + g);
        shapes.push({ geo: iconFor(it), box: R(x + (bw - s) / 2, 0, s, s), role: 'icon', tone: i });
        shapes.push({ geo: 'rect', box: R(x, s + g, bw, h - s - g), role: 'label', head: it, lines: kidsOf(it), tone: i, valign: 'top' });
      });
      return out(n);
    }
    case 'process': {
      // boxes, and an arrow 0.3 of a box wide between each two
      const p = 0.12 * g + 2;
      const bw = (w - (n - 1) * 2 * p) / (n + 0.3 * (n - 1));
      const aw = 0.3 * bw;
      const any = items.some((it) => it.kids.length);
      const bh = Math.min(h, bw * (any ? 1.1 : 0.7));
      const y = (h - bh) / 2;
      items.forEach((it, i) => {
        const x = i * (bw + aw + 2 * p);
        shapes.push({ geo: box, box: R(x, y, bw, bh), role: 'item', head: it, lines: kidsOf(it), tone: i });
        if (i < n - 1) {
          const ah = Math.min(aw * 1.2, bh * 0.45);
          shapes.push({ geo: 'rightArrow', box: R(x + bw + p, h / 2 - ah / 2, aw, ah), role: 'deco', tone: i });
        }
      });
      return out(n);
    }
    case 'chevrons': {
      const any = items.some((it) => it.kids.length);
      const hc = any ? 0.38 * h : h;
      const gap = Math.max(1.5, 0.4 * g);
      let cw = (w - (n - 1) * gap) / (n - 0.275 * (n - 1));
      let ch = 0.55 * cw;
      if (ch > hc) { ch = hc; cw = (w + (n - 1) * (ch / 2 - gap)) / n; }
      const y = any ? 0 : (h - ch) / 2;
      items.forEach((it, i) => {
        const x = i * (cw - ch / 2 + gap);
        shapes.push({ geo: i ? 'chevron' : 'homePlate', box: R(x, y, cw, ch), role: 'item', head: it, tone: i });
        if (any) shapes.push({ geo: 'rect', box: R(x + (i ? ch / 2 : 0), ch + g, cw - ch / 2, h - ch - g), role: 'label', lines: kidsOf(it), tone: i, align: 'left', valign: 'top' });
      });
      return out(n);
    }
    case 'vertical-process': {
      const bh = (h) / (n + 0.45 * (n - 1));
      const ah = 0.45 * bh;
      const bw = Math.min(w, Math.max(bh * 4, 0.6 * w));
      const x = (w - bw) / 2;
      items.forEach((it, i) => {
        const y = i * (bh + ah);
        shapes.push({ geo: box, box: R(x, y, bw, bh), role: 'item', head: it, lines: kidsOf(it), tone: i });
        if (i < n - 1) {
          const aw = Math.min(ah * 1.2, bw * 0.3);
          shapes.push({ geo: 'downArrow', box: R(w / 2 - aw / 2, y + bh + ah * 0.1, aw, ah * 0.8), role: 'deco', tone: i });
        }
      });
      return out(n);
    }
    case 'steps': {
      const bw = (w - (n - 1) * g) / n;
      const rise = n > 1 ? h / (n + 1) : 0;
      const bh = h - rise * (n - 1);
      items.forEach((it, i) => {
        const top = (n - 1 - i) * rise;
        shapes.push({ geo: box, box: R(i * (bw + g), top, bw, Math.min(bh, h - top)), role: 'item', head: it, lines: kidsOf(it), tone: i, valign: 'top' });
      });
      return out(n);
    }
    case 'arch': {
      // a ribbon of half rings, arching over the first circle, dipping under the second and so on;
      // each half ring is centered on its circle and its feet land on its neighbors' feet
      const captions = items.some((it) => it.kids.length > 0);
      const inner = 0.58, outer = 0.75; // the ribbon's edges, in circle diameters
      const pitch = inner + outer;
      const across = (n - 1) * pitch + 2 * outer;
      const D = Math.min(w / across, h / (2 * outer + (captions ? 2 : 0)));
      const midY = h / 2, ro = outer * D;
      const startX = (w - across * D) / 2 + ro;
      items.forEach((it, i) => {
        const cx = startX + i * pitch * D;
        const arching = i % 2 === 0;
        shapes.push({ geo: sectorId(arching ? 180 : 0, arching ? 360 : 180, inner / outer), box: R(cx - ro, arching ? midY - ro : midY, 2 * ro, ro), role: 'band', tone: 0 });
        shapes.push({ geo: 'ellipse', box: R(cx - D / 2, midY - D / 2, D, D), role: 'item', head: it, tone: i });
        if (!captions) return;
        // the caption sits on the open side: under an arch, over a dip
        const capW = Math.min(2 * pitch * D - g, 2 * Math.min(cx, w - cx));
        const capH = Math.max(1, D - g / 2);
        const capY = arching ? midY + ro + g / 2 : midY - ro - g / 2 - capH;
        shapes.push({ geo: 'rect', box: R(cx - capW / 2, capY, capW, capH), role: 'label', lines: kidsOf(it), tone: i, valign: arching ? 'top' : 'bottom' });
      });
      return out(n);
    }
    case 'arrow-circles': {
      // one wide arrow across the whole width with the circles sitting on it, leaving the last
      // part clear for its head; captions alternate above and below
      const captions = items.some((it) => it.kids.length > 0);
      const slot = w / (n + 0.4);
      const D = Math.min(0.78 * slot, captions ? h / 2.6 : 0.95 * h);
      const midY = h / 2;
      shapes.push({ geo: 'rightArrow', box: R(0, midY - 0.44 * D, w, 0.88 * D), role: 'deco', tone: 0 });
      items.forEach((it, i) => {
        const cx = slot * (i + 0.5);
        shapes.push({ geo: 'ellipse', box: R(cx - D / 2, midY - D / 2, D, D), role: 'item', head: it, tone: i });
        if (!captions) return;
        const up = i % 2 === 0;
        const capW = Math.min(2 * slot - g, 2 * Math.min(cx, w - cx));
        const capH = midY - D / 2 - g;
        shapes.push({ geo: 'rect', box: R(cx - capW / 2, up ? 0 : midY + D / 2 + g, capW, capH), role: 'label', lines: kidsOf(it), tone: i, valign: up ? 'bottom' : 'top' });
      });
      return out(n);
    }
    case 'timeline': {
      const y = h / 2;
      const step = w / n;
      const r = Math.max(3, Math.min(0.05 * h, 0.12 * step));
      lines.push({ tail: { x: 0, y }, head: { x: w, y }, arrow: true, tone: 0 });
      items.forEach((it, i) => {
        const cx = (i + 0.5) * step;
        shapes.push({ geo: 'ellipse', box: R(cx - r, y - r, 2 * r, 2 * r), role: 'deco', tone: i });
        const lh = y - r - g;
        // labels above and below in turn, each with twice the room across
        // centred on its point: as wide as the room to the next label on its side, less at the ends
        const lw = Math.min(2 * step - g, 2 * Math.min(cx, w - cx));
        const lx = cx - lw / 2;
        const above = i % 2 === 0;
        shapes.push({ geo: 'rect', box: R(lx, above ? 0 : y + r + g, lw, lh), role: 'label', head: it, lines: kidsOf(it), tone: i, valign: above ? 'bottom' : 'top' });
      });
      return out(n);
    }
    case 'swimlane': {
      // lanes in the order they're first named, each a band across with its name in a cell at the
      // left; the steps run left to right in the order written, one column each
      const laneNames: string[] = [];
      const laneNo = (name: string): number => {
        const k = laneNames.indexOf(name);
        return k >= 0 ? k : laneNames.push(name) - 1;
      };
      const steps: { item: DiagramItem; words: string; lane: number }[] = [];
      let lane = -1;
      for (const it of items) {
        const said = laneSplit(it.text);
        if (said) lane = laneNo(said.lane);
        else if (lane < 0) lane = laneNo('');
        // "Lane:" with nothing after it only fixes where that lane goes
        if (said && !said.step) continue;
        steps.push({ item: it, words: said ? said.step : it.text, lane });
      }
      if (!laneNames.length) return out(1);
      const titled = laneNames.some((name) => name !== '');
      // the name cells: 60 wide, kept between a tenth and 18% of the diagram's width
      const headW = titled ? Math.max(0.1 * w, Math.min(60, 0.18 * w)) : 0;
      const laneH = h / laneNames.length;
      laneNames.forEach((name, k) => {
        shapes.push({ geo: 'rect', box: R(headW, k * laneH, w - headW, laneH), role: 'sub', tone: k });
        if (titled) shapes.push({ geo: 'rect', box: R(0, k * laneH, headW, laneH), role: 'item', head: plainItem(name), tone: k, group: 'lanes' });
      });
      const colW = (w - headW) / Math.max(1, steps.length);
      const listed = steps.some((s) => s.item.kids.length > 0);
      const stepW = 0.72 * colW;
      const stepH = Math.min(0.66 * laneH, stepW * (listed ? 0.95 : 0.6));
      const shapeAt: number[] = [];
      steps.forEach((s, k) => {
        const shown = shownText(s.words).trim();
        const question = shown.endsWith('?');
        const terminal = /^(start|begin|end|finish|stop|done)$/i.test(shown);
        const tall = question ? Math.min(0.88 * laneH, 1.45 * stepH) : stepH;
        const cx = headW + (k + 0.5) * colW, cy = (s.lane + 0.5) * laneH;
        shapeAt.push(shapes.length);
        shapes.push({ geo: question ? 'fcDecision' : terminal ? 'fcTerminator' : box, box: R(cx - stepW / 2, cy - tall / 2, stepW, tall), role: 'item', head: { ...s.item, text: s.words }, lines: kidsOf(s.item), tone: s.lane });
      });
      // an arrow from each step to the next, right side to left side, bent where it changes lane
      for (let k = 1; k < steps.length; k++) {
        const bend = steps[k].lane !== steps[k - 1].lane;
        lines.push({ tail: { x: 0, y: 0 }, head: { x: 0, y: 0 }, arrow: true, from: [shapeAt[k - 1], 1], to: [shapeAt[k], 3], tone: steps[k - 1].lane, ...(bend ? { elbow: true } : {}) });
      }
      return out(laneNames.length);
    }
    case 'gantt': {
      // a row for every line; a line without dates over indented ones gets a thin summary bar
      // across them; the time scale runs along the top, with light grid lines down from its marks
      const rows = items.flatMap((top) => withKids(top));
      const parsed = rows.map((it) => parseTaskLine(it.text));
      const { spans, axis } = placeOnAxis(parsed.map((p) => p?.when ?? null));
      const rowNo = new Map(rows.map((it, k) => [it, k]));
      const summary = (k: number): TimeSpan | null => {
        const under = withKids(rows[k]).slice(1).map((it) => spans[rowNo.get(it)!]).filter((s): s is TimeSpan => !!s);
        if (!under.length) return null;
        return { from: Math.min(...under.map((s) => s.from)), to: Math.max(...under.map((s) => s.to)), point: false };
      };
      const toneOf = new Map<DiagramItem, number>();
      items.forEach((top, k) => { for (const it of withKids(top)) toneOf.set(it, k); });
      const nameW = Math.min(0.3 * w, Math.max(0.2 * w, 84));
      const scaleH = axis ? Math.min(0.12 * h, Math.max(14, h / (rows.length + 2))) : 0;
      const rowH = (h - scaleH) / rows.length;
      const indentStep = Math.min(12, 0.04 * w);
      const left = nameW + g, right = w - 1;
      const xAt = (v: number) => (axis ? left + ((v - axis.lo) / (axis.hi - axis.lo)) * (right - left) : left);
      if (axis) {
        const marks = axisMarks(axis, (right - left) / 34);
        marks.forEach((mk, k) => {
          const x = xAt(mk.at), next = k + 1 < marks.length ? xAt(marks[k + 1].at) : right;
          lines.push({ tail: { x, y: scaleH }, head: { x, y: h }, tone: 0, light: true });
          if (next - x > 4) shapes.push({ geo: 'rect', box: R(x, 0, next - x, scaleH), role: 'label', head: plainItem(mk.text), tone: 0, group: 'ticks', align: 'left', valign: 'bottom' });
        });
      }
      rows.forEach((it, k) => {
        const y = scaleH + k * rowH, tone = toneOf.get(it) ?? 0;
        const indent = Math.min(it.depth * indentStep, nameW / 2);
        shapes.push({ geo: 'rect', box: R(indent, y, nameW - indent, rowH), role: 'label', head: { ...it, text: parsed[k]?.name ?? it.text }, tone, align: 'left', sizeCap: Math.max(6, 0.34 * rowH) });
        const own = spans[k];
        const s = own ?? summary(k);
        if (!s) return;
        if (s.point) {
          const size = Math.min(0.7 * rowH, 18);
          const x = Math.min(Math.max(xAt(s.from) - size / 2, left), right - size);
          shapes.push({ geo: 'diamond', box: R(x, y + (rowH - size) / 2, size, size), role: 'item', tone });
          return;
        }
        const thick = own ? 0.62 * rowH : 0.28 * rowH;
        shapes.push({ geo: own ? box : 'rect', box: R(xAt(s.from), y + (rowH - thick) / 2, Math.max(1, xAt(s.to) - xAt(s.from)), thick), role: own ? 'item' : 'band', tone });
      });
      return out(items.length);
    }
    case 'dated-timeline': {
      const parsed = items.map((it) => parseTaskLine(it.text));
      const { spans, axis } = placeOnAxis(parsed.map((p) => p?.when ?? null));
      // nothing dated: the evenly spaced timeline instead
      if (!axis) return layoutParts({ ...d, layout: 'timeline' });
      const lineY = 0.46 * h;
      const xAt = (v: number) => g + ((v - axis.lo) / (axis.hi - axis.lo)) * (w - 2 * g);
      lines.push({ tail: { x: 0, y: lineY }, head: { x: w, y: lineY }, arrow: true, tone: 0 });
      // ticks, with their words just under the line
      const tickH = Math.min(0.08 * h, 16), gem = Math.min(14, 0.06 * h);
      const wordsY = lineY + Math.max(0.4 * tickH, gem / 2 + 1);
      const marks = axisMarks(axis, w / 60);
      marks.forEach((mk, k) => {
        const x = xAt(mk.at), next = k + 1 < marks.length ? xAt(marks[k + 1].at) : w;
        lines.push({ tail: { x, y: lineY }, head: { x, y: lineY + 0.4 * tickH }, tone: 0 });
        if (next - x > 4) shapes.push({ geo: 'rect', box: R(x, wordsY, Math.min(next - x, w - x), tickH), role: 'label', head: plainItem(mk.text), tone: 0, group: 'ticks', align: 'left', valign: 'top' });
      });
      // spans: bars stacked above the line, each in the lowest track that is free where it starts
      type Placed = { it: DiagramItem; k: number; s: TimeSpan };
      const placed = items.flatMap((it, k): Placed[] => (spans[k] ? [{ it, k, s: spans[k]! }] : []));
      const bars = placed.filter((p) => !p.s.point).sort((a, b) => a.s.from - b.s.from);
      const trackEnds: number[] = [];
      const track = bars.map((b) => {
        let t = trackEnds.findIndex((end) => end <= b.s.from + 1e-9);
        if (t < 0) t = trackEnds.push(0) - 1;
        trackEnds[t] = b.s.to;
        return t;
      });
      const barH = Math.min((lineY - g) / Math.max(1, trackEnds.length) - g / 2, 0.16 * h);
      bars.forEach((b, j) => {
        const y = lineY - g / 2 - (track[j] + 1) * (barH + g / 2);
        const x = xAt(b.s.from);
        shapes.push({ geo: box, box: R(x, y, Math.max(2, Math.min(xAt(b.s.to), w) - x), barH), role: 'item', head: { ...b.it, text: parsed[b.k]!.name }, lines: kidsOf(b.it), tone: b.k, group: 'bars', sizeCap: Math.max(6, 0.42 * barH) });
      });
      // milestones: diamonds on the line, named under the tick words in two staggered rows
      const pins = placed.filter((p) => p.s.point).sort((a, b) => a.s.from - b.s.from);
      const capTop = wordsY + tickH + g / 2, capH = (h - capTop) / 2 - g / 4;
      const capW = Math.min(0.32 * w, (2 * w) / Math.max(2, pins.length + 1));
      pins.forEach((p, j) => {
        const x = xAt(p.s.from);
        shapes.push({ geo: 'diamond', box: R(Math.min(Math.max(0, x - gem / 2), w - gem), lineY - gem / 2, gem, gem), role: 'item', tone: p.k });
        const y = capTop + (j % 2) * (capH + g / 4);
        lines.push({ tail: { x, y: lineY + gem / 2 }, head: { x, y }, tone: p.k, light: true });
        shapes.push({ geo: 'rect', box: R(Math.min(Math.max(0, x - capW / 2), w - capW), y, capW, capH), role: 'label', head: { ...p.it, text: parsed[p.k]!.name }, lines: kidsOf(p.it), tone: p.k, valign: 'top', sizeCap: Math.max(6, Math.min(0.32 * capH, 0.055 * h)) });
      });
      // lines with no date are listed in the top left corner, so nothing typed goes missing
      const undated = items.filter((_, k) => !spans[k]);
      if (undated.length) shapes.push({ geo: 'rect', box: R(0, 0, w, Math.max(4, 3 * g)), role: 'label', lines: undated.flatMap(withKids), tone: 0, align: 'left', valign: 'top' });
      return out(n);
    }
    case 'equation': {
      const k = 0.45;
      const s = Math.min(h, (w - (n - 1) * 2 * g) / (n + k * (n - 1)));
      const total = n * s + (n - 1) * (k * s + 2 * g);
      let x = (w - total) / 2;
      const y = (h - s) / 2;
      items.forEach((it, i) => {
        shapes.push({ geo: 'ellipse', box: R(x, y, s, s), role: 'item', head: it, lines: kidsOf(it), tone: i });
        x += s + g;
        if (i < n - 1) {
          const ow = k * s;
          const last = i === n - 2;
          const oh = last ? ow * 0.75 : ow;
          shapes.push({ geo: last ? 'rightArrow' : 'plus', box: R(x, h / 2 - oh / 2, ow, oh), role: 'deco', tone: i });
          x += ow + g;
        }
      });
      return out(n);
    }
    case 'cycle': {
      const S = Math.min(w, h) / 2;
      const c = { x: w / 2, y: h / 2 };
      const sn = n > 1 ? Math.sin(Math.PI / n) : 1;
      const dia = Math.min(0.8 * S, (1.3 * S * sn) / (1 + 0.65 * sn));
      const rad = n > 1 ? S - dia / 2 : 0;
      const at = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
      items.forEach((it, i) => {
        const p = { x: c.x + rad * Math.cos(at(i)), y: c.y + rad * Math.sin(at(i)) };
        shapes.push({ geo: 'ellipse', box: R(p.x - dia / 2, p.y - dia / 2, dia, dia), role: 'item', head: it, lines: kidsOf(it), tone: i });
      });
      if (n > 1) {
        // arcs along the loop from one circle to the next, clear of both
        const off = 2 * Math.asin(Math.min(1, (dia / 2 + g) / (2 * rad)));
        for (let i = 0; i < n; i++) {
          const a0 = at(i) + off, a1 = at(i + 1) - off;
          if (a1 - a0 < 0.05) continue;
          lines.push({
            tail: { x: c.x + rad * Math.cos(a0), y: c.y + rad * Math.sin(a0) },
            head: { x: c.x + rad * Math.cos(a1), y: c.y + rad * Math.sin(a1) },
            sweep: a1 - a0, arrow: true, tone: i,
          });
        }
      }
      return out(n);
    }
    case 'ring': {
      // one segment per item round a ring, the first centered at the top (so the top and bottom
      // segments lie across, with room for words); when every other item is indented under the
      // first, that first item goes in a circle in the middle
      const middle = items.length === 1 && items[0].kids.length > 0 ? { ...items[0], kids: [] } : null;
      const around = middle ? items[0].kids : items;
      const m = around.length;
      const big = Math.min(w, h) / 2, mid = { x: w / 2, y: h / 2 };
      const hole = middle ? 0.5 : 0.45; // the inner radius, as a part of the outer
      const cut = m > 1 ? Math.min(0.2, (2 * g) / (big * (1 + hole))) : 0; // radians left between segments
      const each = (2 * Math.PI) / Math.max(1, m);
      const toDeg = 180 / Math.PI;
      around.forEach((it, i) => {
        const at = -Math.PI / 2 + i * each;
        const a0 = m > 1 ? at - each / 2 + cut / 2 : -Math.PI / 2;
        const a1 = m > 1 ? at + each / 2 - cut / 2 : a0 + 0.9997 * 2 * Math.PI;
        const b = sectorBox(a0, a1, hole);
        shapes.push({ geo: sectorId(a0 * toDeg, a1 * toDeg, hole), box: R(mid.x + big * b.x1, mid.y + big * b.y1, big * (b.x2 - b.x1), big * (b.y2 - b.y1)), role: 'item', head: it, lines: kidsOf(it), tone: i });
      });
      if (middle) {
        const rc = Math.max(1, hole * big - g);
        shapes.push({ geo: 'ellipse', box: R(mid.x - rc, mid.y - rc, 2 * rc, 2 * rc), role: 'item', head: middle, tone: m, group: 'hub' });
      }
      return out(m + (middle ? 1 : 0));
    }
    case 'radial': {
      const { hub, outer } = hubAndOuter(items);
      const m = outer.length;
      const S = Math.min(w, h) / 2;
      const c = { x: w / 2, y: h / 2 };
      const sn = m > 1 ? Math.sin(Math.PI / m) : 0.5;
      const k = Math.min(0.3, (0.9 * sn) / (1 + 0.9 * sn));
      const rs = k * S, dist = S - rs;
      const rc = Math.max(rs, Math.min(0.36 * S, dist - rs - g));
      shapes.push({ geo: 'ellipse', box: R(c.x - rc, c.y - rc, 2 * rc, 2 * rc), role: 'item', head: hub, tone: 0 });
      outer.forEach((it, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / m;
        const u = { x: Math.cos(a), y: Math.sin(a) };
        const p = { x: c.x + dist * u.x, y: c.y + dist * u.y };
        shapes.push({ geo: 'ellipse', box: R(p.x - rs, p.y - rs, 2 * rs, 2 * rs), role: 'item', head: it, lines: kidsOf(it), tone: i + 1 });
        lines.push({ tail: { x: c.x + rc * u.x, y: c.y + rc * u.y }, head: { x: p.x - rs * u.x, y: p.y - rs * u.y }, tone: i + 1 });
      });
      return out(m + 1);
    }
    case 'org': case 'tree-h': {
      const across = d.layout === 'tree-h';
      const total = items.reduce((a, it) => a + leaves(it), 0);
      const levels = Math.max(...items.map(depth));
      // each level a band along the way the tree grows (down, or to the right); each leaf a slot across it
      const k = across ? 0.35 : 0.55;
      const band = (across ? w : h) / (levels + k * (levels - 1));
      const slot = (across ? h : w) / total;
      let bw: number, bh: number;
      if (across) { bw = band; bh = Math.min(slot * 0.8, band * 0.6); }
      else { bw = Math.min(slot * 0.88, band * 2.4); bh = Math.min(band, Math.max(bw * 0.75, band * 0.5)); }
      const index = new Map<DiagramItem, number>();
      const place = (it: DiagramItem, level: number, from: number): void => {
        const mid = from + (leaves(it) * slot) / 2;
        const a = level * band * (1 + k);
        index.set(it, shapes.length);
        shapes.push({ geo: box, box: across ? R(a, mid - bh / 2, bw, bh) : R(mid - bw / 2, a + (band - bh) / 2, bw, bh), role: 'item', head: it, tone: level });
        let at = from;
        for (const kid of it.kids) {
          const kidIndex = shapes.length;
          place(kid, level + 1, at);
          at += leaves(kid) * slot;
          lines.push({ tail: { x: 0, y: 0 }, head: { x: 0, y: 0 }, elbow: true, from: [index.get(it)!, across ? 1 : 2], to: [kidIndex, across ? 3 : 0], tone: level });
        }
      };
      let at = 0;
      for (const it of items) { place(it, 0, at); at += leaves(it) * slot; }
      return out(levels);
    }
    case 'venn': {
      const m = Math.min(n, 7);
      const c = { x: w / 2, y: h / 2 };
      if (m === 1) {
        const r = Math.min(w, h) / 2;
        shapes.push({ geo: 'ellipse', box: R(c.x - r, c.y - r, 2 * r, 2 * r), role: 'item', head: items[0], lines: kidsOf(items[0]), tone: 0, clear: 0.35 });
        return out(1);
      }
      let r: number, q: number;
      if (m === 2) { r = Math.min(h / 2, w / 3.2); q = 0.6 * r; } else { r = Math.min(w, h) / 2 / 1.62; q = 0.62 * r; }
      for (let i = 0; i < m; i++) {
        const a = m === 2 ? (i ? 0 : Math.PI) : -Math.PI / 2 + (i * 2 * Math.PI) / m;
        const u = { x: Math.cos(a), y: Math.sin(a) };
        const p = { x: c.x + q * u.x, y: c.y + q * u.y };
        // the words towards the outside, away from the overlaps
        const align: Shape['textAlign'] = u.x < -0.45 ? 'left' : u.x > 0.45 ? 'right' : 'center';
        const valign: Shape['textValign'] = u.y < -0.45 ? 'top' : u.y > 0.45 ? 'bottom' : 'middle';
        shapes.push({ geo: 'ellipse', box: R(p.x - r, p.y - r, 2 * r, 2 * r), role: 'item', head: items[i], lines: kidsOf(items[i]), tone: i, clear: 0.35, align, valign, fitW: 0.62 });
      }
      return out(m);
    }
    case 'target': {
      const S = Math.min(w, h) / 2;
      const c = { x: w / 2, y: h / 2 };
      const radii = items.map((_, i) => (S * (n - i)) / n);
      items.forEach((_, i) => shapes.push({ geo: 'ellipse', box: R(c.x - radii[i], c.y - radii[i], 2 * radii[i], 2 * radii[i]), role: 'deco', tone: i }));
      // each item's words in its ring's top band (the last in the middle circle)
      items.forEach((it, i) => {
        const inner = i < n - 1 ? radii[i + 1] : 0;
        const band = i < n - 1 ? radii[i] - inner : 2 * radii[i];
        const top = c.y - radii[i];
        const lw = i < n - 1 ? 2 * Math.sqrt(Math.max(0, radii[i] * radii[i] - (radii[i] - band * 0.75) ** 2)) * 0.9 : 1.4 * radii[i];
        shapes.push({ geo: 'rect', box: R(c.x - lw / 2, i < n - 1 ? top + band * 0.08 : c.y - band * 0.35, lw, band * (i < n - 1 ? 0.84 : 0.7)), role: 'label', head: it, lines: kidsOf(it), tone: i, group: 'ring' });
      });
      return out(n);
    }
    case 'matrix': {
      const { hub, outer } = items.length === 1 && items[0].kids.length ? hubAndOuter(items) : { hub: null as DiagramItem | null, outer: items };
      const four = outer.slice(0, 4);
      const side = Math.min(w, h);
      const x0 = (w - side) / 2, y0 = (h - side) / 2;
      const q = (side - g) / 2;
      four.forEach((it, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        // the words in each quarter's outer corner, clear of the middle
        shapes.push({
          geo: box, box: R(x0 + col * (q + g), y0 + row * (q + g), q, q), role: 'item', head: it, lines: kidsOf(it), tone: i,
          ...(hub ? { align: col ? 'right' : 'left', valign: row ? 'bottom' : 'top' } as const : {}),
        });
      });
      if (hub) {
        const rc = 0.2 * side;
        shapes.push({ geo: 'ellipse', box: R(w / 2 - rc, h / 2 - rc, 2 * rc, 2 * rc), role: 'item', head: hub, tone: 4, group: 'hub' });
      }
      return out(Math.max(four.length, hub ? 5 : 1));
    }
    case 'pyramid': case 'funnel': {
      const up = d.layout === 'pyramid';
      const base = Math.min(w, 1.25 * h);
      const sh = (h - (n - 1) * g) / n;
      items.forEach((it, i) => {
        const y0 = i * (sh + g), y1 = y0 + sh;
        // widths of the whole triangle at this slice's top and bottom
        const at = (y: number) => (base * (up ? y : h - y)) / h;
        const wide = Math.max(at(y0), at(y1)), narrow = Math.min(at(y0), at(y1));
        const a = wide > 0 ? (wide - narrow) / (2 * wide) : 0;
        shapes.push({ geo: sliceId(up ? a : -a), box: R((w - wide) / 2, y0, wide, sh), role: 'item', head: it, lines: kidsOf(it), tone: i });
      });
      return out(n);
    }
  }
}

/** An item made up for words that aren't a line of the outline (a lane's name, an axis mark). */
const plainItem = (text: string): DiagramItem => ({ text, kids: [], n: 0, depth: 0 });

/**
 * A swimlane line split into its lane and its step, from "Lane: step"; the step may be empty, and
 * null means the line names no lane. A lane's name is short, and its colon is followed by a space
 * or by nothing, so "3:1 ratio" names no lane.
 */
export function laneSplit(text: string): { lane: string; step: string } | null {
  const m = /^\s*([^:\s][^:]{0,39}?)\s*:(?:\s+(.*?))?\s*$/s.exec(text);
  return m ? { lane: m[1], step: m[2] ?? '' } : null;
}

/**
 * A line's words as its shape shows them, and what the layout keeps round them: a swimlane step's
 * "Lane: " in front, a dated line's ": when" after.
 */
function splitLine(layout: string, text: string, level: number): { lead: string; words: string; tail: string } {
  let shown = '';
  let at = -1;
  if (layout === 'swimlane') {
    const step = level === 0 ? laneSplit(text)?.step : '';
    if (step) { shown = step; at = text.lastIndexOf(step); }
  } else if (layout === 'gantt' || layout === 'dated-timeline') {
    const name = parseTaskLine(text)?.name;
    if (name !== undefined) { shown = name; at = text.indexOf(name); }
  }
  if (at < 0) return { lead: '', words: text, tail: '' };
  return { lead: text.slice(0, at), words: shown, tail: text.slice(at + shown.length) };
}

/** The middle of a radial diagram (or a matrix) and the items round it. */
function hubAndOuter(items: DiagramItem[]): { hub: DiagramItem; outer: DiagramItem[] } {
  if (items.length === 1) return { hub: { ...items[0], kids: [] }, outer: items[0].kids };
  return { hub: { ...items[0], kids: [] }, outer: [...items[0].kids, ...items.slice(1)] };
}

/** The icon over an icon list's item: the one named in brackets, else the best match for its words. */
function iconFor(it: DiagramItem): string {
  if (it.icon) return it.icon;
  const words = shownText(it.text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x.length > 2);
  for (const q of [words.join(' '), ...words]) {
    if (!q) continue;
    const hit = findIcons(q)[0];
    if (hit) return hit.id;
  }
  return ICON_PREFIX + 'checkbox-blank-circle';
}

// ---------------------------------------------------------------- colours and text

/** The colour of tone i of n. */
function toneColour(d: DiagramData, i: number, n: number): string {
  const f = n > 1 ? i / (n - 1) : 0;
  switch (d.colours) {
    case 'colourful': return COLOURFUL[i % COLOURFUL.length];
    case 'shades': return tint(d.accent, 0.6 * f);
    case 'grey': return tint('#3a3a3a', 0.65 * f);
    case 'mono': return '#000000';
    default: return d.accent;
  }
}

/** Black or white, whichever reads better on this fill. */
export function inkOn(fill: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fill);
  if (!m) return '#000000';
  const v = parseInt(m[1], 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  return L > 0.4 ? '#000000' : '#ffffff';
}

/** A shape's fill, outline and text colour for its role and tone. */
function looks(d: DiagramData, p: PartShape, c: string, f: number): { fill: string | null; line: string | null; lw: number; ink: string } {
  const solid = d.colours === 'accent' || d.colours === 'shades' || d.colours === 'colourful' || d.colours === 'grey';
  switch (p.role) {
    case 'item':
      if (solid) return { fill: c, line: p.clear ? null : '#ffffff', lw: 1, ink: inkOn(c) };
      if (d.colours === 'light') return { fill: tint(c, 0.8), line: c, lw: 1, ink: '#000000' };
      return { fill: p.clear ? null : '#ffffff', line: c, lw: 1.5, ink: '#000000' };
    case 'sub':
      if (d.colours === 'mono' || d.colours === 'outline') return { fill: '#ffffff', line: d.colours === 'mono' ? '#000000' : tint(c, 0.4), lw: 0.75, ink: '#000000' };
      return { fill: tint(c, 0.85), line: tint(c, 0.5), lw: 0.75, ink: '#000000' };
    case 'label': return { fill: null, line: null, lw: 0, ink: '#000000' };
    case 'icon': case 'band': return { fill: c, line: null, lw: 0, ink: '#000000' };
    case 'deco':
      // a pale arrow under the circles, so they stand out against it
      if (d.layout === 'arrow-circles') { const pale = d.colours === 'mono' ? '#dddddd' : tint(c, 0.72); return { fill: pale, line: null, lw: 0, ink: '#000000' }; }
      if (d.layout === 'target') {
        // rings from the accent's palest at the outside to darker in the middle
        if (solid) return { fill: d.colours === 'colourful' ? tint(c, 0.35) : tint(c, 0.75 - 0.5 * f), line: '#ffffff', lw: 1, ink: '#000000' };
        return { fill: d.colours === 'light' ? tint(c, 0.9 - 0.25 * f) : '#ffffff', line: c, lw: 1, ink: '#000000' };
      }
      if (d.colours === 'mono') return { fill: '#7f7f7f', line: null, lw: 0, ink: '#000000' };
      return { fill: tint(c, 0.45), line: null, lw: 0, ink: '#000000' };
  }
}

const textMeasure: TextMeasure = (t, size, _family, style) => arialWidth(t, size, /bold/.test(style));

/** A shape's text as runs and paragraphs: the item's words at `head` (bold above lines of its own), then its lines as bullets at `size`. */
function textOf(p: PartShape, size: number, ink: string, head: number | null): { runs: TextRun[]; paras: ParaStyle[] } | null {
  const runs: TextRun[] = [];
  const paras: ParaStyle[] = [];
  const lines = p.lines ?? [];
  const put = (t: string, s: number, bold: boolean) => {
    if (runs.length) runs.push({ text: '\n', size: s, color: ink });
    for (const r of chemRuns(t)) runs.push({ ...r, size: s, color: ink, ...(bold ? { bold: true } : {}) });
  };
  const heading = p.head?.text;
  if (heading) { put(heading, head ?? size, lines.length > 0); paras.push({}); }
  const base = Math.min(...lines.map((x) => x.depth));
  for (const it of lines) {
    put(it.text, size, false);
    // lines under an item are bullets; in centred text on its own (a timeline's labels) just lines
    if (p.role === 'label' && p.align !== 'left') paras.push({});
    else paras.push({ list: 'bullet', align: 'left', ...(it.depth > base ? { level: it.depth - base } : {}) });
  }
  if (!runs.length) return null;
  return { runs, paras: paras.some((x) => Object.keys(x).length) ? paras : [] };
}

/** The area a shape's words go in: its library shape's text area, as drawn here and in PowerPoint. */
const wordArea = (p: PartShape): Rect => textArea(geoDef(p.geo), p.box.x1, p.box.y1, p.box.x2, p.box.y2);

/** The part of an item's text area a held structure takes when the item has words too (they go below). */
const STRUCTURE_PART = 0.7;

const saysSomething = (p: PartShape): boolean => Boolean(p.head?.text) || (p.lines?.length ?? 0) > 0;

/** Where a held structure is centered: the upper part of the text area when there are words, else all of it. */
function structureRoom(p: PartShape): Rect {
  const a = wordArea(p);
  return saysSomething(p) ? { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y1 + STRUCTURE_PART * (a.y2 - a.y1) } : a;
}

/** Whether a shape's words fit at `size` (in the space under its structure, if it holds one). */
function fits(p: PartShape, size: number, head: number | null): boolean {
  const t = textOf(p, size, '#000000', head);
  if (!t) return true;
  const a = wordArea(p);
  const top = p.fig ? a.y1 + STRUCTURE_PART * (a.y2 - a.y1) : a.y1;
  const aw = 0.94 * (a.x2 - a.x1) * (p.fitW ?? 1), ah = 0.96 * (a.y2 - top);
  if (aw <= 2 || ah <= 2) return false;
  const lay = layoutText({ runs: t.runs, paras: t.paras.length ? t.paras : undefined, justify: p.align ?? 'center', wrap: aw }, size, textMeasure);
  if (lay.box.y2 - lay.box.y1 > ah) return false;
  return lay.lines.every((l) => l.width <= l.room + 0.5);
}

/** The biggest size (in half points, up to `max`) at which every shape's text fits. */
function fitSize(parts: PartShape[], max: number, head: (s: number) => number | null = () => null): number {
  let lo = 4, hi = Math.max(4, max);
  if (parts.every((p) => fits(p, hi, head(hi)))) return hi;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    if (parts.every((p) => fits(p, mid, head(mid)))) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
}

/** The text sizes: the main shapes' words, and the lines under them (a little smaller). */
function sizes(d: DiagramData, laid: DiagramLaid): Map<PartShape, { size: number; head: number | null }> {
  const out = new Map<PartShape, { size: number; head: number | null }>();
  const max = d.size ?? Math.max(8, Math.min(28, Math.min(d.w, d.h) / 9));
  const groups = new Map<string, PartShape[]>();
  for (const p of laid.shapes) {
    if (!p.head && !p.lines?.length) continue;
    const k = p.group ?? (p.head ? 'items' : 'lines');
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  // shapes holding their item and its lines: the item at the main size, its lines a little smaller
  const mixed = (p: PartShape) => !!p.head && !!p.lines?.length;
  // no group's text grows past the lowest ceiling among its shapes
  const ceiling = (ps: PartShape[]) => ps.reduce((c, p) => Math.min(c, p.sizeCap ?? c), max);
  const itemGroup = groups.get('items') ?? [];
  const main = d.size ?? fitSize(itemGroup, ceiling(itemGroup), (s) => s);
  for (const [k, ps] of groups) {
    if (k === 'lines') {
      const s = d.size ? d.size * 0.85 : fitSize(ps, Math.max(6, Math.min(main * 0.85, ceiling(ps))));
      for (const p of ps) out.set(p, { size: s, head: null });
      continue;
    }
    const head = k === 'items' ? main : d.size ?? fitSize(ps, ceiling(ps), (s) => s);
    // with lines under the item in the same shape, those lines shrink first, down to 0.6 of the item
    for (const p of ps) {
      if (!mixed(p)) { out.set(p, { size: head, head }); continue; }
      let s = head * 0.85;
      if (!d.size) { const f = fitSize([p], s, () => head); s = Math.max(f, Math.min(s, head * 0.6)); }
      out.set(p, { size: s, head });
    }
  }
  // all mixed shapes in a group take the smallest line size, so they match
  const mixedSizes = [...out].filter(([p]) => mixed(p)).map(([, v]) => v.size);
  if (mixedSizes.length) { const s = Math.min(...mixedSizes); for (const [p, v] of out) if (mixed(p)) v.size = s; }
  // if a mixed shape still doesn't fit, everything comes down together
  if (!d.size) {
    for (let tries = 0; tries < 40; tries++) {
      const bad = [...out].some(([p, v]) => !fits(p, v.size, v.head));
      if (!bad) break;
      for (const v of out.values()) { v.size = Math.max(4, v.size - 0.5); if (v.head) v.head = Math.max(4, v.head - 0.5); }
    }
  }
  return out;
}

// ---------------------------------------------------------------- drawing it

/** The diagram scaled up, keeping its proportions, until every held structure fits its item's room. */
function grownToFit(d: DiagramData): DiagramData {
  if (!d.figs || Object.keys(d.figs).length === 0) return d;
  for (let pass = 0; pass < 8; pass++) {
    const need = lay(d).shapes.reduce((k, p) => {
      if (!p.fig) return k;
      const r = structureRoom(p);
      return Math.max(k, p.fig.w / Math.max(1, r.x2 - r.x1), p.fig.h / Math.max(1, r.y2 - r.y1));
    }, 1);
    if (need <= 1.001) break;
    // overshoot a little: the gaps between shapes don't grow with them
    d = { ...d, w: d.w * need * 1.02, h: d.h * need * 1.02 };
  }
  return d;
}

/** Words under a held structure sit at the bottom of the shape; otherwise the layout's own alignment. */
function textValignOf(p: PartShape): Pick<Shape, 'textValign'> {
  if (p.fig && saysSomething(p)) return { textValign: 'bottom' };
  return p.valign && p.valign !== 'middle' ? { textValign: p.valign } : {};
}

/** A connector's color for the look: black, the tone itself on light looks, else a tint of it. */
function lineInk(d: DiagramData, c: string, arrow: boolean): string {
  if (d.colours === 'mono') return '#000000';
  if (d.colours === 'outline' || d.colours === 'light') return c;
  return tint(c, arrow ? 0.35 : 0.25);
}

/** The layout's shapes and lines, coloured, with text sized to fit, from the diagram's top left (tests and previews). */
export function diagramParts(d: DiagramData): { shapes: Omit<Shape, 'id'>[]; lines: (Omit<Arrow, 'id'> & { fromIndex?: number; toIndex?: number })[] } {
  d = grownToFit(d); // first made big enough for the structures it holds
  const laid = lay(d);
  const sz = sizes(d, laid);
  const shapes: Omit<Shape, 'id'>[] = laid.shapes.map((p) => {
    const c = toneColour(d, p.tone, laid.tones);
    const lk = looks(d, p, c, laid.tones > 1 ? p.tone / (laid.tones - 1) : 0);
    const s = sz.get(p);
    const text = s ? textOf(p, s.size, lk.ink, s.head) : null;
    const shows = [p.head, ...(p.lines ?? [])].flatMap((x) => (x && x.n > 0 ? [x.n] : []));
    const sh: Omit<Shape, 'id'> = {
      kind: 'geo', geo: p.geo, ...p.box,
      filled: !!lk.fill, color: lk.line ?? lk.fill ?? '#000000', lineWidth: lk.line ? lk.lw : 0,
      ...(lk.fill && lk.line ? { fillColor: lk.fill } : {}),
      ...(p.role === 'icon' && lk.fill ? { color: lk.fill } : {}),
      ...(p.clear && lk.fill ? { transparency: p.clear } : {}),
      ...(d.shadow && (p.role === 'item' || p.role === 'icon') ? { shadow: true } : {}),
      ...(text ? { text: text.paras.length ? text : { runs: text.runs } } : {}),
      ...(p.align && p.align !== 'center' ? { textAlign: p.align } : {}),
      ...textValignOf(p),
      // which lines of the text it shows, so text changed in it (or in PowerPoint) goes back into the diagram's text
      ...(shows.length ? { name: shows.length === 1 ? `Item ${shows[0]}` : `Items ${shows[0]}-${shows[shows.length - 1]}` } : {}),
    };
    return sh;
  });
  const lw = Math.max(1, Math.min(3, Math.min(d.w, d.h) / 160));
  const lines = laid.lines.map((l) => {
    const c = toneColour(d, l.tone, laid.tones);
    const ink = l.light ? '#d9d9d9' : lineInk(d, c, !!l.arrow);
    const width = lw * (l.light ? 0.5 : l.arrow ? 1.6 : 1);
    const a: Omit<Arrow, 'id'> & { fromIndex?: number; toIndex?: number } = {
      tail: l.tail, head: l.head, headStyle: l.arrow ? 'full' : 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false,
      sweep: l.sweep ?? 0, headLength: width * 5, headWidth: width * 2, color: ink, lineWidth: width,
      ...(l.elbow ? { elbow: true } : {}),
      ...(l.from ? { fromIndex: l.from[0], from: { shape: l.from[0], port: l.from[1] } } : {}),
      ...(l.to ? { toIndex: l.to[0], to: { shape: l.to[0], port: l.to[1] } } : {}),
    };
    return a;
  });
  return { shapes, lines };
}

/**
 * Draw a diagram in a frame of its own with its top left at `at`, or draw the diagram in frame
 * `id` again (what it drew before goes; structures and pictures put on it stay). Returns the
 * frame's id. Call inside an edit.
 */
export function putDiagram(doc: Doc, m: Measure, d: DiagramData, at: Vec, id?: number): number {
  const old = id !== undefined ? doc.shapes.get(id) : undefined;
  const kept: Pick<Frame, 'atoms' | 'shapes'> = { atoms: [], shapes: [] };
  if (old?.frame) {
    const f = old.frame;
    for (const c of f.captions) doc.removeCaption(c);
    for (const r of f.arrows) doc.removeArrow(r);
    for (const s of f.shapes) { const x = doc.shapes.get(s); if (x?.kind === 'picture') kept.shapes.push(s); else if (x) doc.removeShape(s); }
    kept.atoms = f.atoms.filter((a) => doc.atoms.has(a));
  }
  const parts = diagramParts(d);
  const move = (p: Vec) => ({ x: p.x + at.x, y: p.y + at.y });
  const made = parts.shapes.map((s) => doc.addShape({ ...s, x1: s.x1 + at.x, y1: s.y1 + at.y, x2: s.x2 + at.x, y2: s.y2 + at.y }).id);
  const arrows = parts.lines.map(({ fromIndex, toIndex, ...l }) => {
    const a: Omit<Arrow, 'id'> = { ...l, tail: move(l.tail), head: move(l.head) };
    if (fromIndex !== undefined) { a.from = { shape: made[fromIndex], port: l.from!.port }; a.tail = gluePoint(doc.shapes.get(made[fromIndex])!, l.from!.port); }
    if (toIndex !== undefined) { a.to = { shape: made[toIndex], port: l.to!.port }; a.head = gluePoint(doc.shapes.get(made[toIndex])!, l.to!.port); }
    return doc.addArrow(a).id;
  });
  const frame: Frame = { atoms: kept.atoms, captions: [], arrows, shapes: [...made, ...kept.shapes], padX: 0, padY: 0, fit: true };
  // the frame's box goes round its shapes only: held structures are placed afterwards (refitDiagramStructures)
  const b = frameBox(doc, { ...frame, atoms: [] }, m) ?? R(at.x, at.y, d.w, d.h);
  const r = (v: number) => Math.round(v * 100) / 100;
  const diagram: DiagramData = { ...d, w: r(b.x2 - b.x1), h: r(b.y2 - b.y1) };
  if (old) { doc.updateShape(old.id, { ...b, frame, diagram }); return old.id; }
  return doc.addShape({ kind: 'geo', geo: 'rect', ...b, filled: false, lineWidth: 0, color: '#000000', frame, diagram, name: 'Diagram' }).id;
}

/** The diagram a thing belongs to (its frame's id), if any. */
export function diagramFrameOf(doc: Doc, kind: 'atom' | 'bond' | 'caption' | 'arrow' | 'shape', id: number): number | null {
  if (kind === 'shape' && doc.shapes.get(id)?.diagram) return id;
  if (kind !== 'shape' && kind !== 'arrow' && kind !== 'caption') return null;
  for (const s of doc.shapes.values()) {
    if (!s.diagram || !s.frame) continue;
    const f = s.frame;
    if (kind === 'caption' && f.captions.includes(id)) return s.id;
    if (kind === 'arrow' && f.arrows.includes(id)) return s.id;
    if (kind === 'shape' && f.shapes.includes(id)) return s.id;
  }
  return null;
}

/** The lines of the diagram's text a shape of it shows (from its name), or null. */
export function heldLines(s: Pick<Shape, 'name'>): number[] | null {
  const m = /^Items? (\d+)(?:-(\d+))?$/.exec(s.name ?? '');
  if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return b >= a ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : null;
}

/**
 * The diagram's text with what its shapes now say (typed into one of them, here or in
 * PowerPoint or Word): each paragraph of a shape goes back to its line.
 */
export function textFromShapes(doc: Doc, frame: Shape): string {
  const d = frame.diagram!;
  let text = d.text;
  for (const id of frame.frame?.shapes ?? []) {
    const s = doc.shapes.get(id);
    const held = s && heldLines(s);
    if (!s || !held) continue;
    const paras = (s.text?.runs.map((r) => r.text).join('') ?? '').split('\n');
    if (paras.length !== held.length) continue;
    const lines = linesOf(text);
    held.forEach((n, i) => {
      const was = lines[n - 1];
      if (was === undefined) return;
      const now = paras[i].trim();
      // a step's lane and a task's dates aren't in its shape: they go back round the new words
      const { level, text: lineText } = lineParts(was);
      const { lead, words, tail } = splitLine(d.layout, lineText, level);
      if (now && now !== shownText(words)) text = setItemText(text, n, lead + now + tail);
    });
  }
  return text;
}

const linesOf = (text: string) => text.split(/\r?\n/).filter((l) => l.trim());

/**
 * At the end of a change: a diagram whose frame was resized by hand (nothing inside it moved)
 * is drawn again to fill its new box; one whose shapes were typed into takes their words.
 */
export function refitDiagrams(doc: Doc, before: ReadonlyMap<string, Entity | null>, m: Measure): void {
  for (const s of [...doc.shapes.values()]) {
    if (!s.diagram || !s.frame) continue;
    const f = s.frame;
    // words typed into its shapes
    const typed = f.shapes.some((id) => { const was = before.get('s' + id) as Shape | null | undefined; return !!was && was.text !== doc.shapes.get(id)?.text; });
    if (typed) {
      const text = textFromShapes(doc, s);
      if (text !== s.diagram.text) doc.updateShape(s.id, { diagram: { ...s.diagram, text } });
      continue;
    }
    const old = before.get('s' + s.id) as Shape | null | undefined;
    if (!old) continue;
    const a = shapeBox(old), b = shapeBox(s);
    if (Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) + Math.abs(a.x2 - b.x2) + Math.abs(a.y2 - b.y2) < 1e-6) continue;
    const moved = f.captions.some((id) => before.has('c' + id)) || f.arrows.some((id) => before.has('r' + id)) || f.shapes.some((id) => before.has('s' + id));
    if (moved) continue;
    putDiagram(doc, m, { ...s.diagram, w: b.x2 - b.x1, h: b.y2 - b.y1 }, { x: b.x1, y: b.y1 }, s.id);
  }
}

// ---------------------------------------------------------------- structures held in items
//
// A diagram's structures stay ordinary structures. After every change, each structure whose atoms
// are centered inside an item's shape counts as that item's: the item keeps space at the top of
// its text area for it (DiagramData.figs, so the whole diagram grows when it needs to), the
// structure is moved to the middle of that space, and one of its atoms is listed in the frame so
// it moves with the diagram. Only the drawn shapes are read, so a diagram opened from a file
// behaves the same.

/** A selection of just these atoms (to measure a structure). */
const justAtoms = (atoms: Set<number>): Selection => ({ atoms, bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

/** The middle of the box round a structure's atoms. */
function structureMiddle(doc: Doc, atoms: Set<number>): Vec {
  const xs: number[] = [], ys: number[] = [];
  for (const id of atoms) { const a = doc.atoms.get(id); if (a) { xs.push(a.x); ys.push(a.y); } }
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

interface ItemSlot { shape: Rect; room: Rect }

/** Each item's shape as drawn (`shapeOf` gives it as it is now, or as it was) and its structure space, by item line. */
function itemSlots(frame: Shape, shapeOf: (id: number) => Shape | null | undefined): Map<number, ItemSlot> {
  const planned = wordShapes(lay(frame.diagram!));
  const slots = new Map<number, ItemSlot>();
  for (const id of frame.frame?.shapes ?? []) {
    const drawn = shapeOf(id);
    const line = drawn ? heldLines(drawn)?.[0] : undefined;
    const part = line === undefined ? undefined : planned.get(line);
    if (!drawn || line === undefined || !part || slots.has(line)) continue;
    const box = shapeBox(drawn);
    slots.set(line, { shape: box, room: structureRoom({ ...part, box }) });
  }
  return slots;
}

/**
 * Which item holds which structure: the item whose shape has the structure's middle inside it (the
 * one with the nearest space, where shapes overlap). An item holds the first structure found.
 */
function holders(doc: Doc, slots: Map<number, ItemSlot>, structures: Set<number>[], take: (atoms: Set<number>) => boolean): Map<number, Set<number>> {
  const held = new Map<number, Set<number>>();
  for (const atoms of structures) {
    if (!take(atoms)) continue;
    const c = structureMiddle(doc, atoms);
    const away = (r: Rect) => Math.hypot(c.x - (r.x1 + r.x2) / 2, c.y - (r.y1 + r.y2) / 2);
    let best: [number, number] | null = null;
    for (const [line, s] of slots) {
      if (c.x < s.shape.x1 || c.x > s.shape.x2 || c.y < s.shape.y1 || c.y > s.shape.y2) continue;
      const dist = away(s.room);
      if (!best || dist < best[1]) best = [line, dist];
    }
    if (best && !held.has(best[0])) held.set(best[0], atoms);
  }
  return held;
}

/** The atoms of the structures a diagram's items hold now (to move with it). */
export function diagramContents(doc: Doc, frame: Shape): number[] {
  if (!(frame.diagram && frame.frame)) return [];
  const slots = itemSlots(frame, (id) => doc.shapes.get(id));
  return [...holders(doc, slots, doc.fragments(), () => true).values()].flatMap((atoms) => [...atoms]);
}

/** Are two sets of structure spaces the same, to half a point? */
function sameSpaces(a: DiagramData['figs'], b: NonNullable<DiagramData['figs']>): boolean {
  const lines = Object.keys(b);
  if (Object.keys(a ?? {}).length !== lines.length) return false;
  return lines.every((k) => !!a?.[k] && Math.abs(a[k].w - b[k].w) < 0.5 && Math.abs(a[k].h - b[k].h) < 0.5);
}

/**
 * After a change, inside the edit: each diagram's held structures worked out again, the space for
 * them updated (drawing the diagram again, larger if needed), and each centered in its space. A
 * structure the change moved goes by where it is now; one left alone, by where the diagram was.
 */
export function refitDiagramStructures(doc: Doc, before: ReadonlyMap<string, Entity | null>, m: Measure): void {
  const frames = [...doc.shapes.values()].filter((s) => s.diagram && s.frame);
  if (!frames.length) return;
  const anyAtomChanged = [...before.keys()].some((k) => k.startsWith('a'));
  const margin = 0.15 * doc.style.bondLength;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  let structures: Set<number>[] | undefined;
  let shifted = false;
  for (const frame of frames) {
    const prior = before.get('s' + frame.id) as Shape | null | undefined;
    if (!anyAtomChanged && !prior && !frame.diagram!.figs) continue;
    structures ??= doc.fragments();
    const justMoved = (atoms: Set<number>) => [...atoms].some((id) => before.has('a' + id));
    const then = prior?.diagram && prior.frame ? prior : frame;
    const shapeThen = (id: number) => (before.has('s' + id) ? (before.get('s' + id) as Shape | null) : doc.shapes.get(id));
    const held = new Map<number, Set<number>>([
      ...holders(doc, itemSlots(then, shapeThen), structures, (a) => !justMoved(a)),
      ...holders(doc, itemSlots(frame, (id) => doc.shapes.get(id)), structures, justMoved),
    ]);
    const spaces: NonNullable<DiagramData['figs']> = {};
    for (const [line, atoms] of held) {
      const b = selectionBox(doc, justAtoms(atoms), m);
      if (b) spaces[String(line)] = { w: round2(b.x2 - b.x1 + 2 * margin), h: round2(b.y2 - b.y1 + 2 * margin) };
    }
    if (!sameSpaces(frame.diagram!.figs, spaces)) {
      const { figs: _was, ...look } = frame.diagram!;
      putDiagram(doc, m, Object.keys(spaces).length ? { ...look, figs: spaces } : look, { x: Math.min(frame.x1, frame.x2), y: Math.min(frame.y1, frame.y2) }, frame.id);
    }
    const now = doc.shapes.get(frame.id)!;
    // one atom of each held structure goes in the frame, so the structure moves with the diagram
    const anchors = [...held.values()].map((atoms) => Math.min(...atoms)).sort((p, q) => p - q);
    const listed = [...now.frame!.atoms].sort((p, q) => p - q);
    if (anchors.join() !== listed.join()) doc.updateShape(frame.id, { frame: { ...now.frame!, atoms: anchors } });
    const slots = itemSlots(now, (id) => doc.shapes.get(id));
    for (const [line, atoms] of held) {
      const room = slots.get(line)?.room;
      const b = room ? selectionBox(doc, justAtoms(atoms), m) : null;
      if (!(room && b)) continue;
      const dx = (room.x1 + room.x2 - b.x1 - b.x2) / 2, dy = (room.y1 + room.y2 - b.y1 - b.y2) / 2;
      if (Math.hypot(dx, dy) < 0.01) continue;
      doc.moveAtoms(atoms, dx, dy);
      shifted = true;
    }
  }
  if (shifted && hasPins(doc)) followPins(doc);
}

/** A drawing in a document as a Doc of its own (to redraw a diagram in it). */
function docOf(c: Contents): Doc {
  const d = new Doc();
  d.restoreContents(structuredClone(c));
  let max = 0;
  for (const list of [c.atoms, c.bonds, c.captions, c.arrows, c.shapes]) for (const x of list) max = Math.max(max, x.id);
  d.reserveIds(max);
  return d;
}

/**
 * A document's diagram with the words its shapes have in Word (`said`: each shape's name → its
 * paragraphs, joined by line breaks), drawn again when any were changed there.
 */
export function retypedDiagram(c: Contents, said: Map<string, string>): Contents {
  const frame = c.shapes.find((s) => s.diagram && s.frame);
  if (!frame || !said.size) return c;
  const typed = docOf({ ...c, shapes: c.shapes.map((s) => (s.name && said.has(s.name) ? { ...s, text: { runs: [{ text: said.get(s.name)! }] } } : s)) });
  const text = textFromShapes(typed, typed.shapes.get(frame.id)!);
  if (text === frame.diagram!.text) return c;
  const d = docOf(c);
  d.edit('Diagram', () => putDiagram(d, POINTS, { ...frame.diagram!, text }, { x: Math.min(frame.x1, frame.x2), y: Math.min(frame.y1, frame.y2) }, frame.id));
  return d.contents();
}

/** Make a diagram plain shapes (Convert to Shapes): the frame goes, its shapes stay. */
export function ungroupDiagram(doc: Doc, id: number): number[] {
  const s = doc.shapes.get(id);
  if (!s?.diagram || !s.frame) return [];
  const ids = s.frame.shapes.filter((x) => doc.shapes.has(x));
  doc.removeShape(id);
  return ids;
}

/** A new diagram's data at its layout's usual size (smaller in documents: `scale`). */
export function newDiagram(layout: string, text: string | null, look: Partial<DiagramData> = {}, scale = 1): DiagramData {
  const l = DIAGRAM_BY_ID.get(layout) ?? DIAGRAM_LAYOUTS[0];
  return { ...DIAGRAM_DEFAULTS, ...look, layout: l.id, text: text ?? l.sample, w: Math.round(l.size[0] * scale), h: Math.round(l.size[1] * scale) };
}

/** A diagram's data read from a file, made safe (null when it can't be used). */
export function cleanDiagram(v: unknown): DiagramData | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<DiagramData>;
  if (typeof o.layout !== 'string' || typeof o.text !== 'string') return null;
  const num = (x: unknown, dflt: number) => (typeof x === 'number' && isFinite(x) && x > 0 ? x : dflt);
  return {
    layout: DIAGRAM_BY_ID.has(o.layout) ? o.layout : 'blocks',
    text: o.text,
    colours: DIAGRAM_COLOURS.some(([k]) => k === o.colours) ? o.colours! : 'accent',
    accent: typeof o.accent === 'string' && /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent : DIAGRAM_DEFAULTS.accent,
    rounded: o.rounded !== false,
    shadow: !!o.shadow,
    ...(typeof o.size === 'number' && isFinite(o.size) && o.size > 0 ? { size: o.size } : {}),
    w: num(o.w, 400), h: num(o.h, 300),
    ...readSpaces(o.figs),
  };
}

/** Structure spaces read from a file: numbered items with sensible sizes only. */
function readSpaces(v: unknown): Pick<DiagramData, 'figs'> {
  if (typeof v !== 'object' || v === null) return {};
  const sensible = (x: unknown): x is number => typeof x === 'number' && x > 0 && x < 1e5;
  const kept: NonNullable<DiagramData['figs']> = {};
  for (const [line, f] of Object.entries(v as Record<string, { w?: unknown; h?: unknown } | null>)) {
    if (/^\d+$/.test(line) && f && sensible(f.w) && sensible(f.h)) kept[line] = { w: f.w, h: f.h };
  }
  return Object.keys(kept).length ? { figs: kept } : {};
}

export { isIconId };
