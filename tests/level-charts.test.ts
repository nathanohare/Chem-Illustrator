// @vitest-environment jsdom
//
// Charts of levels (Sankey charts, treemaps and decomposition trees): reading rows into a tree and
// into flows, laying out treemap boxes, the parts a click can land on, filtering a dashboard by a
// click on a chart, and the round trip through an Excel file.

import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/sheet/workbook';
import { newTable } from '../src/sheet/table-styles';
import { chartData, chartFromRange, hasLevels, sameChartData, CHART_NAMES, type SeriesData } from '../src/sheet/chart';
import { findNode, levelFlows, levelRows, levelTree, reachablePath, squarify } from '../src/sheet/levels';
import {
  newDashboard, resolveSource, kpiValue, tileMask, chartPickMask, hasFilters, withoutFilters, describePick, levelChartOfSource,
  chartOfColumns, groupSeries, type Dashboard, type KpiTile, type ChartTile,
} from '../src/sheet/dashboard';
import { newChartBox } from '../src/sheet/chart-box';
import { drawChart, hitPart, picksEqual, type ClickPart, type ChartHits } from '../src/render/chart-draw';
import { VectorContext } from '../src/render/vector';
import { bandAt } from '../src/render/level-charts';
import { writeXlsx, readXlsx, type XlsxPictures } from '../src/io/xlsx';

/** A year of a lab's solvent waste in liters, as a table named Waste. */
function waste(): Workbook {
  const wb = new Workbook(['Waste']);
  const s = wb.sheet;
  const rows: (string | number)[][] = [
    ['Class', 'Kind', 'Solvent', 'Liters'],
    ['Non-halogenated', 'Hydrocarbon', 'Hexanes', 55],
    ['Non-halogenated', 'Ester', 'Ethyl acetate', 47],
    ['Non-halogenated', 'Ether', 'THF', 31],
    ['Non-halogenated', 'Ether', 'Diethyl ether', 18],
    ['Halogenated', 'Chlorinated', 'Dichloromethane', 42],
    ['Halogenated', 'Chlorinated', 'Chloroform', 9],
  ];
  wb.edit('fill', () => {
    rows.forEach((row, r) => row.forEach((v, c) => s.setInput(r, c, String(v))));
    s.setTables([{ ...newTable({ r1: 0, c1: 0, r2: rows.length - 1, c2: 3 }, []), name: 'Waste' }]);
  });
  return wb;
}

/** Series for levels of categories, the first carrying `weights`. */
function levels(weights: number[], ...cols: string[][]): SeriesData[] {
  return cols.map((cats, i) => ({ name: `Level ${i}`, cats, xs: cats.map((_, j) => j + 1), ys: i === 0 ? weights : [], color: '#4472c4', index: i }));
}

const rects = (hits: ChartHits) => (hits.parts ?? []).filter((p): p is Extract<ClickPart, { shape: 'rect' }> => p.shape === 'rect');
const centre = (p: Extract<ClickPart, { shape: 'rect' }>) => [p.x + p.w / 2, p.y + p.h / 2] as const;

describe('reading rows into levels', () => {
  it('weighs each row by the first series, or counts rows when there are no numbers', () => {
    expect(levelRows(levels([3, NaN, 2], ['a', 'b', 'c'])).map((r) => r.weight)).toEqual([3, 2]);
    expect(levelRows(levels([NaN, NaN], ['a', 'b'])).map((r) => r.weight)).toEqual([1, 1]);
    expect(levelRows(levels([0, -4, 1], ['a', 'b', 'c'])).map((r) => r.cats[0])).toEqual(['c']);
  });

  it('stops a row at its first blank cell', () => {
    const rows = levelRows(levels([1, 1], ['a', 'b'], ['x', ''], ['p', 'q']));
    expect(rows.map((r) => r.cats)).toEqual([['a', 'x', 'p'], ['b']]);
  });

  it('builds the tree, the biggest category first and sheet order for a tie', () => {
    const tree = levelTree(levelRows(levels([2, 5, 2, 1], ['A', 'B', 'C', 'B'], ['x', 'y', 'x', 'z'])));
    expect(tree.total).toBe(10);
    expect(tree.kids.map((k) => [k.label, k.total])).toEqual([['B', 6], ['A', 2], ['C', 2]]);
    expect(findNode(tree, ['B'])!.kids.map((k) => k.path)).toEqual([['B', 'y'], ['B', 'z']]);
    expect(findNode(tree, ['B', 'q'])).toBeNull();
    expect(reachablePath(tree, ['B', 'z', 'deeper'])).toEqual(['B', 'z']);
    expect(reachablePath(tree, ['gone'])).toEqual([]);
  });

  it('works out the flows: a node per category of each level, a band per pair of categories', () => {
    const { columns, bands } = levelFlows(levelRows(levels([5, 2, 4], ['A', 'A', 'B'], ['x', 'y', 'x'])), 2);
    expect(columns[0].map((n) => [n.label, n.total])).toEqual([['A', 7], ['B', 4]]);
    expect(columns[1].map((n) => [n.label, n.total])).toEqual([['x', 9], ['y', 2]]);
    expect(bands.map((b) => [b.from, b.to, b.total])).toEqual([['A', 'x', 5], ['A', 'y', 2], ['B', 'x', 4]]);
  });
});

describe('treemap boxes', () => {
  const into = { x: 10, y: 20, w: 300, h: 200 };

  it('fills the space, each box as big as its value, without overlaps', () => {
    const values = [40, 25, 15, 10, 6, 4];
    const boxes = squarify(values, into);
    const total = values.reduce((a, b) => a + b, 0);
    boxes.forEach((b, i) => expect(b.w * b.h).toBeCloseTo((values[i] / total) * into.w * into.h, 6));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(into.x - 1e-9);
      expect(b.y).toBeGreaterThanOrEqual(into.y - 1e-9);
      expect(b.x + b.w).toBeLessThanOrEqual(into.x + into.w + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(into.y + into.h + 1e-9);
    }
    const overlap = (a: typeof into, b: typeof into) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBeLessThan(1e-6)));
  });

  it('keeps the boxes near square, and gives nothing to a value of zero or less', () => {
    const boxes = squarify([1, 1, 1, 1], { x: 0, y: 0, w: 100, h: 100 });
    for (const b of boxes) expect(Math.max(b.w / b.h, b.h / b.w)).toBeLessThan(1.01);
    const some = squarify([3, 0, -2, 1], into);
    expect([some[1].w * some[1].h, some[2].w * some[2].h]).toEqual([0, 0]);
    expect(squarify([], into)).toEqual([]);
  });
});

describe('charts of levels on a sheet', () => {
  it('makes one from a block: a header row names the levels, the last column of numbers weighs the rows', () => {
    const wb = waste();
    const c = chartFromRange(wb.sheet, { r1: 0, c1: 0, r2: 6, c2: 3 }, 'treemap');
    expect(c.series.map((s) => s.x)).toEqual(['=Waste!$A$2:$A$7', '=Waste!$B$2:$B$7', '=Waste!$C$2:$C$7']);
    expect(new Set(c.series.map((s) => s.y))).toEqual(new Set(['=Waste!$D$2:$D$7']));
    expect(chartData(wb, wb.sheet, c).map((d) => d.name)).toEqual(['Class', 'Kind', 'Solvent']);
    // one column only: it is the level, and every row counts once
    const one = chartFromRange(wb.sheet, { r1: 1, c1: 3, r2: 6, c2: 3 }, 'sankey');
    expect(one.series.length).toBe(1);
    expect(hasLevels('decomp') && hasLevels('sankey') && !hasLevels('bar')).toBe(true);
    expect(CHART_NAMES.decomp).toBe('Decomposition tree');
  });

  it('draws a Sankey chart with its nodes and bands clickable', () => {
    const wb = waste();
    const c = chartFromRange(wb.sheet, { r1: 0, c1: 0, r2: 6, c2: 3 }, 'sankey');
    const hits = drawChart(new VectorContext(), c, chartData(wb, wb.sheet, c), 560, 340);
    const nodes = rects(hits);
    expect(nodes.length).toBe(2 + 4 + 6);
    const thf = nodes.find((p) => p.pick[0].value === 'THF')!;
    expect(hitPart(hits, ...centre(thf))?.pick).toEqual([{ level: 2, value: 'THF' }]);
    const band = hits.parts!.find((p): p is Extract<ClickPart, { shape: 'band' }> => p.shape === 'band' && p.pick[1]?.value === 'Ether')!;
    // just past where it leaves its node, before it crosses any other band
    const x = band.x0 + 1, y = (band.top[0] + band.bottom[0]) / 2;
    expect(hitPart(hits, x, y)?.pick).toEqual([{ level: 0, value: 'Non-halogenated' }, { level: 1, value: 'Ether' }]);
  });

  it('follows a band\'s curve when telling whether a click is on it', () => {
    const band = { shape: 'band' as const, x0: 0, x1: 100, top: [0, 50] as [number, number], bottom: [10, 60] as [number, number], pick: [] };
    expect(bandAt(band, 50)!.map((v) => Math.round(v * 100) / 100)).toEqual([25, 35]);
    expect(bandAt(band, 0)).toEqual([0, 10]);
    expect(bandAt(band, 100)).toEqual([50, 60]);
    expect(bandAt(band, 101)).toBeNull();
  });

  it('draws a treemap that drills in and back up', () => {
    const wb = waste();
    const c = chartFromRange(wb.sheet, { r1: 0, c1: 0, r2: 6, c2: 3 }, 'treemap');
    const data = chartData(wb, wb.sheet, c);
    const top = drawChart(new VectorContext(), c, data, 560, 340);
    // a click inside the Halogenated box drills into it
    const dcm = rects(top).find((p) => p.pick.at(-1)?.value === 'Chlorinated')!;
    expect(hitPart(top, ...centre(dcm))?.drill).toEqual(['Halogenated']);
    // drilled in, the trail's first step goes back to the whole, and the deepest boxes lead nowhere
    const inside = drawChart(new VectorContext(), { ...c, path: ['Halogenated', 'Chlorinated'] }, data, 560, 340);
    const all = rects(inside).find((p) => p.drill?.length === 0)!;
    expect(all.pick).toEqual([]);
    const leaf = rects(inside).find((p) => p.pick.at(-1)?.value === 'Chloroform')!;
    expect(leaf.drill).toBeUndefined();
  });

  it('draws a decomposition tree that expands a node at a time', () => {
    const wb = waste();
    const c = chartFromRange(wb.sheet, { r1: 0, c1: 0, r2: 6, c2: 3 }, 'decomp');
    const data = chartData(wb, wb.sheet, c);
    const closed = rects(drawChart(new VectorContext(), c, data, 560, 340));
    expect(closed.map((p) => p.pick.at(-1)?.value ?? 'Total')).toEqual(['Total', 'Non-halogenated', 'Halogenated']);
    expect(closed[1].drill).toEqual(['Non-halogenated']);
    const open = rects(drawChart(new VectorContext(), { ...c, path: ['Non-halogenated'] }, data, 560, 340));
    // the node expanded closes up again; the total closes the whole tree
    expect(open.find((p) => p.pick.length === 1 && p.pick[0].value === 'Non-halogenated')!.drill).toEqual([]);
    expect(open[0].drill).toEqual([]);
    expect(open.filter((p) => p.pick.length === 2).map((p) => p.pick[1].value)).toEqual(['Hydrocarbon', 'Ether', 'Ester']);
  });

  it('gives Document and Slides charts sample data with levels', () => {
    const box = newChartBox('sankey');
    expect(box.cells[0]).toEqual(['Class', 'Kind', 'Solvent', 'Liters']);
    expect(box.chart.series.length).toBe(3);
  });

  it('goes to Excel as bars of the same cells and comes back as itself', async () => {
    const wb = waste();
    const c = { ...chartFromRange(wb.sheet, { r1: 0, c1: 0, r2: 6, c2: 3 }, 'treemap'), path: ['Halogenated'] };
    expect(sameChartData(c, { ...c, kind: 'bar' })).toBe(true);
    wb.edit('chart', () => wb.sheet.setCharts([c]));
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
    const back = (await readXlsx(await writeXlsx(wb, pictures))).book.sheets[0].charts[0];
    expect(back.kind).toBe('treemap');
    expect(back.path).toEqual(['Halogenated']);
  });
});

describe('clicking dashboard charts', () => {
  const total = (): KpiTile => ({ id: 1, kind: 'kpi', x: 0, y: 0, w: 3, h: 2, source: { table: 'Waste' }, column: 'Liters', agg: 'sum' });
  const levelTile = (wb: Workbook, kind: 'sankey' | 'treemap', pick?: ChartTile['pick']): ChartTile => {
    const res = resolveSource(wb, { table: 'Waste' })!;
    const chart = levelChartOfSource(res, ['Class', 'Kind', 'Solvent'], 'Liters', 50, kind);
    return { id: 2, kind: 'chart', x: 3, y: 0, w: 9, h: 6, chart, ...(pick ? { pick } : {}) };
  };
  const dash = (...tiles: Dashboard['tiles']): Dashboard => ({ ...newDashboard(), tiles });

  it('filters the other tiles by what was picked, but not the chart picked', () => {
    const wb = waste();
    const d = dash(total(), levelTile(wb, 'sankey', [{ level: 0, value: 'Halogenated' }]));
    expect(kpiValue(wb, total(), tileMask(wb, d, 1))).toBe(51);
    expect(kpiValue(wb, total(), tileMask(wb, d, 2))).toBe(202);
    expect(hasFilters(d)).toBe(true);
    expect(hasFilters(withoutFilters(d))).toBe(false);
  });

  it('filters by both ends of a band, and by every level down to a treemap box', () => {
    const wb = waste();
    const band = dash(total(), levelTile(wb, 'sankey', [{ level: 1, value: 'Ether' }, { level: 2, value: 'THF' }]));
    expect(kpiValue(wb, total(), tileMask(wb, band, 1))).toBe(31);
    const box = dash(total(), levelTile(wb, 'treemap', [{ level: 0, value: 'Non-halogenated' }, { level: 1, value: 'Ether' }]));
    expect(kpiValue(wb, total(), tileMask(wb, box, 1))).toBe(49);
  });

  it('describes a pick in words', () => {
    const wb = waste();
    const t = levelTile(wb, 'sankey', [{ level: 0, value: 'Halogenated' }, { level: 1, value: 'Chlorinated' }]);
    expect(describePick(t, ['Class', 'Kind'])).toBe('Class: Halogenated → Kind: Chlorinated');
    expect(describePick(t, [])).toBe('Halogenated → Chlorinated');
  });

  it('draws the bars and slices a pick leaves out faded, and each picks its label', () => {
    const wb = waste();
    const res = resolveSource(wb, { table: 'Waste' })!;
    const bars: ChartTile = { id: 3, kind: 'chart', x: 0, y: 6, w: 6, h: 5, chart: chartOfColumns(res, 'column', 'Class', ['Liters'], 60), group: 'sum', pick: [{ level: 0, value: 'Halogenated' }] };
    const d = dash(total(), bars);
    const all = groupSeries(chartData(wb, wb.sheet, bars.chart, tileMask(wb, d, 3)), 'column', 'sum');
    const shown = groupSeries(chartData(wb, wb.sheet, bars.chart, chartPickMask(wb, d, undefined, 3)), 'column', 'sum');
    expect(all[0].cats).toEqual(['Non-halogenated', 'Halogenated']);
    expect(shown[0].cats).toEqual(['Halogenated']);
    const hits = drawChart(new VectorContext(), bars.chart, all, 480, 290, shown);
    expect(rects(hits).map((p) => p.pick[0].value)).toEqual(['Non-halogenated', 'Halogenated']);
    const pie = drawChart(new VectorContext(), { ...bars.chart, kind: 'pie' }, all, 480, 290);
    const wedges = pie.parts!.filter((p): p is Extract<ClickPart, { shape: 'wedge' }> => p.shape === 'wedge');
    expect(wedges.length).toBe(2);
    const w = wedges[1], mid = (w.from + w.to) / 2;
    expect(hitPart(pie, w.cx + Math.cos(mid) * w.r * 0.5, w.cy + Math.sin(mid) * w.r * 0.5)?.pick).toEqual([{ level: 0, value: 'Halogenated' }]);
    expect(picksEqual(w.pick, [{ level: 0, value: 'Halogenated' }])).toBe(true);
    expect(picksEqual(w.pick, undefined)).toBe(false);
  });

  it('keeps a pick in the file', async () => {
    const wb = waste();
    const d = dash(total(), levelTile(wb, 'treemap', [{ level: 2, value: 'Hexanes' }]));
    wb.edit('dash', () => wb.addSheet('Dashboard').setDashboard(d));
    const pictures: XlsxPictures = { box: () => ({ w: 60, h: 40 }), picture: async () => null };
    expect((await readXlsx(await writeXlsx(wb, pictures))).book.sheets[1].dashboard).toEqual(d);
  });
});
