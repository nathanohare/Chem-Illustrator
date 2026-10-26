// Running totals (=SUM(A$1:An) in every row) are worked out from one running total down the
// column. On sheets full of them, with text, errors, blanks, decimals, formulas and a spilled
// array in the summed columns, every edit must give exactly the values a full recalculation
// gives, adding left to right as a plain SUM does, and typing a value must stay quick.

import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/sheet/workbook';

function rng(seed: number): () => number {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}
const snapshot = (wb: Workbook) => wb.sheets.map((s) => JSON.stringify([...s.values.entries()].sort((a, b) => a[0] - b[0]), (_, v) => (v instanceof Object && 'code' in v ? v.code : v)));

describe('running totals', () => {
  it('match a full recalculation after every edit', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rand = rng(seed);
      const wb = new Workbook(['Data', 'Other']);
      const [d, o] = wb.sheets;
      const val = () => { const x = rand(); return x < 0.1 ? 'text' : x < 0.15 ? '=1/0' : x < 0.2 ? '' : x < 0.3 ? '=B1*2' : String(Math.round(rand() * 1000) / 10 + 0.1); };
      wb.edit('fill', () => {
        for (let r = 0; r < 40; r++) {
          d.setInput(r, 0, String(Math.round(rand() * 100) / 10 + 0.1));
          d.setInput(r, 1, val());
          d.setInput(r, 2, `=SUM(A$1:A${r + 1})`);
          d.setInput(r, 3, `=SUM(B$${1 + (r % 3)}:B${r + 1})`);
          d.setInput(r, 4, `=SUM(C$1:C${r + 1})`);
          o.setInput(r, 0, `=SUM(Data!A$1:A${r + 1})`);
          o.setInput(r, 1, `=SUM(Data!A${r + 1}:A$40)`);
        }
        d.setInput(0, 6, '=SUM(A:A)');
        d.setInput(1, 6, '=SEQUENCE(5)');
        d.setInput(0, 7, '=SUM(G$2:G6)');
      });
      for (let step = 0; step < 50; step++) {
        const r = Math.floor(rand() * 42), c = rand() < 0.5 ? 0 : 1;
        const x = rand();
        if (x < 0.6) wb.edit('type', () => d.setInput(r, c, c ? val() : String(Math.round(rand() * 100) / 10)));
        else if (x < 0.7) wb.edit('clear', () => d.setInput(r, c, ''));
        else if (x < 0.8) wb.edit('text', () => d.setInput(r, c, 'abc'));
        else if (x < 0.9) wb.undo();
        else wb.redo();
        const got = snapshot(wb);
        wb.recalc();
        expect(got, `seed ${seed}, step ${step}`).toEqual(snapshot(wb));
      }
      // what-if (Goal Seek / data tables) puts values in for a moment; the totals must follow
      const v = wb.whatIf([{ s: d, key: 0, value: 1000 }], () => d.value(39, 2));
      const plain = d.value(39, 2) as number;
      if (typeof plain !== 'number') continue;
      expect(v).toBeCloseTo(plain - (typeof d.value(0, 0) === 'number' ? (d.value(0, 0) as number) : 0) + 1000, 6);
    }
  });

  it('add left to right exactly as a plain sum does (no rounding drift)', () => {
    const wb = new Workbook();
    const s = wb.sheet;
    wb.edit('fill', () => { for (let r = 0; r < 300; r++) { s.setInput(r, 0, String(0.1 * ((r % 7) + 1))); s.setInput(r, 1, `=SUM(A$1:A${r + 1})`); } });
    let exact = 0;
    for (let r = 0; r < 300; r++) { exact += Number(String(0.1 * ((r % 7) + 1))); expect(s.value(r, 1)).toBe(exact); }
  });

  it('keep typing a value quick above 2,500 of them', () => {
    const wb = new Workbook();
    const s = wb.sheet;
    const N = 5000;
    wb.edit('fill', () => { for (let r = 0; r < N; r++) { s.setInput(r, 0, String(r)); s.setInput(r, 1, `=SUM(A$1:A${r + 1})`); } });
    const t = performance.now();
    for (let k = 0; k < 5; k++) wb.edit('e', () => s.setInput(2500, 0, String(k)));
    const each = (performance.now() - t) / 5;
    expect(s.value(N - 1, 1)).toBe((N * (N - 1)) / 2 - 2500 + 4);
    // each total below used to read its whole block again: about 1 s an edit here
    expect(each).toBeLessThan(100);
  });
});
