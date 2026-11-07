// The numbers behind the three charts of levels (chart.ts): Sankey charts, treemaps and
// decomposition trees. All three read a sheet the same way. Every series is one level, a column of
// categories, and the first series' numbers give each row its weight (when there are no numbers at
// all, every row weighs one). A row goes from its category at the first level to its category at
// the second and on down, and it stops at its first blank cell.
//
// Treemap boxes are laid out by the squarified method of Bruls, Huizing and van Wijk (2000): rows
// of boxes are added along the shorter side of the space left for as long as that keeps the boxes
// close to square.

import type { SeriesData } from './chart';

/** One row of the sheet: its categories from the first level until a blank cell, and its weight. */
export interface LevelRow { cats: string[]; weight: number }

/** The rows of a chart of levels, without the ones that weigh nothing. */
export function levelRows(data: SeriesData[]): LevelRow[] {
  const weights = data[0]?.ys ?? [];
  const countRows = !weights.some((w) => Number.isFinite(w));
  const length = data.reduce((n, d) => Math.max(n, d.cats.length), 0);
  const rows: LevelRow[] = [];
  for (let r = 0; r < length; r++) {
    const weight = countRows ? 1 : weights[r];
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const cats: string[] = [];
    for (const d of data) {
      const cat = d.cats[r] ?? '';
      if (cat === '') break;
      cats.push(cat);
    }
    rows.push({ cats, weight });
  }
  return rows;
}

const biggestFirst = <T extends { total: number }>(list: T[]): T[] => list.sort((a, b) => b.total - a.total);

// ---------------------------------------------------------------- the tree (treemap, decomposition tree)

/** A category in the tree; the top of the tree, with no label, is the whole. */
export interface LevelNode {
  label: string;
  /** The categories from the first level down to this one (empty for the whole). */
  path: string[];
  /** The weight of every row in it. */
  total: number;
  /** The categories of the next level within it, the biggest first (sheet order for a tie). */
  kids: LevelNode[];
}

/** The tree of a chart's rows. A row stopped short by a blank counts as far down as it goes. */
export function levelTree(rows: LevelRow[]): LevelNode {
  const whole: LevelNode = { label: '', path: [], total: 0, kids: [] };
  const byPath = new Map<string, LevelNode>();
  for (const row of rows) {
    whole.total += row.weight;
    let parent = whole;
    for (let i = 0; i < row.cats.length; i++) {
      const path = row.cats.slice(0, i + 1);
      const key = path.join('\u0001');
      let node = byPath.get(key);
      if (!node) {
        node = { label: row.cats[i], path, total: 0, kids: [] };
        byPath.set(key, node);
        parent.kids.push(node);
      }
      node.total += row.weight;
      parent = node;
    }
  }
  const order = (n: LevelNode): void => { biggestFirst(n.kids).forEach(order); };
  order(whole);
  return whole;
}

/** The node a path of categories leads to, or null when one of them isn't there. */
export function findNode(tree: LevelNode, path: readonly string[]): LevelNode | null {
  let node: LevelNode | undefined = tree;
  for (const label of path) {
    node = node.kids.find((k) => k.label === label);
    if (!node) return null;
  }
  return node;
}

/** The start of a path that still leads somewhere (after the sheet changed, say). */
export function reachablePath(tree: LevelNode, path: readonly string[] | undefined): string[] {
  const out: string[] = [];
  let node = tree;
  for (const label of path ?? []) {
    const next = node.kids.find((k) => k.label === label);
    if (!next) break;
    out.push(label);
    node = next;
  }
  return out;
}

// ---------------------------------------------------------------- the flows (Sankey chart)

/** A category of one level: a node of a Sankey chart. */
export interface FlowNode { level: number; label: string; total: number }
/** The rows that go from a category of one level (`level`) to a category of the next. */
export interface FlowBand { level: number; from: string; to: string; total: number }

/** The nodes of every level (the biggest first) and the bands between them (in the order of their ends). */
export function levelFlows(rows: LevelRow[], levels: number): { columns: FlowNode[][]; bands: FlowBand[] } {
  const nodes = Array.from({ length: levels }, () => new Map<string, FlowNode>());
  const bands = Array.from({ length: Math.max(0, levels - 1) }, () => new Map<string, FlowBand>());
  for (const { cats, weight } of rows) {
    cats.slice(0, levels).forEach((label, level) => {
      const node = nodes[level].get(label) ?? { level, label, total: 0 };
      node.total += weight;
      nodes[level].set(label, node);
      if (level === 0) return;
      const from = cats[level - 1], key = `${from}\u0001${label}`;
      const band = bands[level - 1].get(key) ?? { level: level - 1, from, to: label, total: 0 };
      band.total += weight;
      bands[level - 1].set(key, band);
    });
  }
  const columns = nodes.map((m) => biggestFirst([...m.values()]));
  const place = columns.map((col) => new Map(col.map((n, i) => [n.label, i])));
  const ordered = bands.flatMap((m, level) => [...m.values()].sort((a, b) =>
    place[level].get(a.from)! - place[level].get(b.from)! || place[level + 1].get(a.to)! - place[level + 1].get(b.to)!));
  return { columns, bands: ordered };
}

// ---------------------------------------------------------------- treemap boxes

export interface Rect { x: number; y: number; w: number; h: number }

/** How far from square the most stretched box of a strip is, for boxes of these areas along a side. */
function stretch(areas: number[], side: number): number {
  const thick = areas.reduce((a, b) => a + b, 0) / side;
  let worst = 1;
  for (const a of areas) {
    const long = a / thick;
    worst = Math.max(worst, long / thick, thick / long);
  }
  return worst;
}

/**
 * Boxes filling `into`, one for each value, each with an area in proportion to its value and as
 * close to square as the method gets (it works best with the values biggest first). A value of
 * zero or less gets an empty box.
 */
export function squarify(values: number[], into: Rect): Rect[] {
  const out: Rect[] = values.map(() => ({ x: into.x, y: into.y, w: 0, h: 0 }));
  const live = values.flatMap((v, i) => (Number.isFinite(v) && v > 0 ? [i] : []));
  const sum = live.reduce((a, i) => a + values[i], 0);
  if (!sum || into.w <= 0 || into.h <= 0) return out;
  const perUnit = (into.w * into.h) / sum;
  const area = (i: number) => values[i] * perUnit;
  let space = { ...into };
  let next = 0;
  while (next < live.length) {
    // a strip along the shorter side, as long as each box added makes it no more stretched
    const side = Math.min(space.w, space.h);
    const strip = [live[next++]];
    while (next < live.length && stretch([...strip, live[next]].map(area), side) <= stretch(strip.map(area), side)) strip.push(live[next++]);
    const stripArea = strip.reduce((a, i) => a + area(i), 0);
    const lastStrip = next >= live.length;
    const across = space.w >= space.h; // the strip stands at the left (true) or lies along the top
    const thick = lastStrip ? (across ? space.w : space.h) : stripArea / side;
    let at = across ? space.y : space.x;
    const end = across ? space.y + space.h : space.x + space.w;
    strip.forEach((i, k) => {
      const long = k === strip.length - 1 ? end - at : area(i) / thick;
      out[i] = across ? { x: space.x, y: at, w: thick, h: long } : { x: at, y: space.y, w: long, h: thick };
      at += long;
    });
    space = across
      ? { x: space.x + thick, y: space.y, w: space.w - thick, h: space.h }
      : { x: space.x, y: space.y + thick, w: space.w, h: space.h - thick };
  }
  return out;
}
