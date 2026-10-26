// Long lists (150,000 rows, a modest instrument export): finding the largest or smallest with
// Math.max(...list) passed every item as an argument and ran out of stack past about 120,000,
// so pasting, Data Analysis tools and PivotTable Max/Min failed with nothing shown.

import { describe, it, expect } from 'vitest';
import { randomNumbers, histogram, seededRandom } from '../src/sheet/analysis-tools';
import { layoutPivot, sourceOf, type PivotTable } from '../src/sheet/pivot';
import { maxOf, minOf } from '../src/sheet/values';

const N = 150_000;
const run = (f: () => unknown) => { try { const r = f(); return typeof r === 'string' ? r : 'ok'; } catch (e) { return String(e); } };

describe(`Sheet tools on ${N.toLocaleString()} rows`, () => {
  it('Random Number Generation gives 150,000 numbers (under the million limit)', () => {
    expect(run(() => randomNumbers({ kind: 'uniform', from: 0, to: 1 }, 1, N, seededRandom(1)))).toBe('ok');
  });

  it('Histogram works out its own bins', () => {
    const xs = Array.from({ length: N }, (_, i) => Math.sin(i) * 100);
    expect(run(() => histogram(xs, {}))).toBe('ok');
  });

  it('a PivotTable shows Max and Min of a field', () => {
    const block = [['Run', 'Area'], ...Array.from({ length: N }, (_, i) => [i % 3 ? 'A' : 'B', i])];
    const src = sourceOf(block);
    for (const fn of ['max', 'min'] as const) {
      const pt: PivotTable = { id: 1, name: 'PivotTable1', source: '', at: { row: 2, col: 0 }, rows: ['Run'], cols: [], values: [{ field: 'Area', fn }], filters: [], hidden: {}, layout: 'compact', subtotals: true, grandRows: true, grandCols: true };
      expect(run(() => layoutPivot(pt, src as never))).toBe('ok');
    }
  });

  it('maxOf and minOf give what Math.max and Math.min give', () => {
    const xs = Array.from({ length: N }, (_, i) => (i * 7919) % 100003 - 5);
    expect(maxOf(xs)).toBe(100003 - 6);
    expect(minOf(xs)).toBe(-5);
    expect(maxOf([])).toBe(-Infinity);
    expect(minOf([], 0)).toBe(0);
    expect(maxOf([1, NaN, 3])).toBeNaN();
    expect(Object.is(maxOf([-0, 0]), 0)).toBe(true);
  });
});
