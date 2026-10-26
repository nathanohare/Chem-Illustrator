// @vitest-environment jsdom
//
// CEILING, FLOOR, LOOKUP, PMT, NPV, FACT and COMBIN, with Excel's answers (from Excel's own help
// where it gives them), and the warning on opening an Excel file that uses a function this
// program can't work out, old or newer.

import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/sheet/workbook';
import { CellError } from '../src/sheet/values';
import { writeXlsx, readXlsx } from '../src/io/xlsx';

const pictures = { box: () => ({ w: 1, h: 1 }), async picture() { return 'data:image/png;base64,'; } } as never;

function value(f: string, cells: Record<string, string> = {}): unknown {
  const wb = new Workbook();
  wb.edit('t', () => {
    for (const [a, v] of Object.entries(cells)) wb.sheet.setInput(Number(a.slice(1)) - 1, a.charCodeAt(0) - 65, v);
    wb.sheet.setInput(0, 9, f);
  });
  const v = wb.sheet.value(0, 9);
  return v instanceof CellError ? v.code : v;
}

const cases: [string, unknown][] = [
  ['=CEILING(2.5,1)', 3], ['=CEILING(-2.5,2)', -2], ['=CEILING(-2.5,-2)', -4], ['=CEILING(1.5,0.1)', 1.5], ['=CEILING(0.234,0.01)', 0.24],
  ['=CEILING(0.3,0.1)', 0.3], ['=CEILING(2.5,-1)', '#NUM!'], ['=CEILING(5,0)', 0],
  ['=FLOOR(2.5,1)', 2], ['=FLOOR(-2.5,-2)', -2], ['=FLOOR(-2.5,2)', -4], ['=FLOOR(1.58,0.1)', 1.5], ['=FLOOR(0.234,0.01)', 0.23],
  ['=FLOOR(2.5,-2)', '#NUM!'], ['=FLOOR(1,0)', '#DIV/0!'], ['=FLOOR(0,0)', 0],
  ['=LOOKUP(2,{1,2,3},{10,20,30})', 20], ['=LOOKUP(2.5,{1,2,3},{10,20,30})', 20], ['=LOOKUP(7,{1,2,3},{10,20,30})', 30], ['=LOOKUP(0,{1,2,3},{10,20,30})', '#N/A'],
  ['=LOOKUP("C",{"a","b","c","d";1,2,3,4})', 3], ['=LOOKUP("bump",{"a",1;"b",2;"c",3})', 2], ['=LOOKUP(2,{1,2,3})', 2],
  ['=FACT(5)', 120], ['=FACT(1.9)', 1], ['=FACT(0)', 1], ['=FACT(-1)', '#NUM!'], ['=FACT(171)', '#NUM!'],
  ['=COMBIN(8,2)', 28], ['=COMBIN(5,2)', 10], ['=COMBIN(5,0)', 1], ['=COMBIN(49,6)', 13983816], ['=COMBIN(2,3)', '#NUM!'],
  ['=PMT(0,10,1000)', -100],
];

describe('functions Excel has', () => {
  for (const [f, want] of cases) it(f, () => expect(value(f)).toBe(want));

  it('PMT and NPV', () => {
    expect(value('=PMT(0.05/12,60,10000)')).toBeCloseTo(-188.71233644010877, 9);
    expect(value('=PMT(8%/12,10,10000)')).toBeCloseTo(-1037.03, 2);
    expect(value('=PMT(8%/12,10,10000,0,1)')).toBeCloseTo(-1030.16, 2);
    expect(value('=PMT(6%/12,18*12,0,50000)')).toBeCloseTo(-129.08, 2);
    expect(value('=NPV(0.1,100,200,300)')).toBeCloseTo(100 / 1.1 + 200 / 1.21 + 300 / 1.331, 9);
    expect(value('=NPV(10%,-10000,3000,4200,6800)')).toBeCloseTo(1188.44, 2);
    // in cells, text and empty cells are left out
    expect(value('=NPV(0.1,A1:A4)', { A1: '100', A2: 'x', A4: '200' })).toBeCloseTo(100 / 1.1 + 200 / 1.21, 9);
    expect(value('=FACT(170)')).toBeCloseTo(7.257415615307994e306, -295);
  });

  it('LOOKUP in cells, with the result from another column', () => {
    const cells = { A1: '4.14', A2: '4.19', A3: '5.17', A4: '5.77', A5: '6.39', B1: 'red', B2: 'orange', B3: 'yellow', B4: 'green', B5: 'blue' };
    expect(value('=LOOKUP(4.19,A1:A5,B1:B5)', cells)).toBe('orange');
    expect(value('=LOOKUP(5,A1:A5,B1:B5)', cells)).toBe('orange');
    expect(value('=LOOKUP(7.66,A1:A5,B1:B5)', cells)).toBe('blue');
    expect(value('=LOOKUP(0,A1:A5,B1:B5)', cells)).toBe('#N/A');
  });
});

describe('opening an Excel file', () => {
  const open = async (inputs: string[], names: { name: string; formula: string }[] = []) => {
    const wb = new Workbook();
    wb.edit('t', () => inputs.forEach((f, r) => wb.sheet.setInput(r, 0, f)));
    if (names.length) wb.edit('n', () => wb.setNames(names));
    return readXlsx(await writeXlsx(wb, pictures));
  };

  it('warns about a function this program lacks, prefixed or not', async () => {
    const { warnings } = await open(['=FACT(5)', '=GCD(12,8)+1', '=SUM(1,NOSUCHFN(2))']);
    expect(warnings).toEqual(['2 formulas use Excel functions this program can\'t work out yet.']);
  });

  it('does not warn about functions it knows, LAMBDA names, LET names or sheet names that look like calls', async () => {
    const wb = new Workbook(['Data', 'Run(2)']);
    wb.edit('t', () => {
      const s = wb.sheet;
      s.setInput(0, 0, '=FACT(5)+CEILING(2.5,1)+LOOKUP(2,{1,2},{3,4})');
      s.setInput(1, 0, '=DOUBLE(3)');
      s.setInput(2, 0, '=LET(f,LAMBDA(x,x*2),f(4))');
      s.setInput(3, 0, "='Run(2)'!A1+1");
      s.setInput(4, 0, '="SIN(" & "x"');
      wb.setNames([{ name: 'DOUBLE', formula: '=LAMBDA(x,x*2)' }]);
    });
    const { book, warnings } = await readXlsx(await writeXlsx(wb, pictures));
    expect(warnings).toEqual([]);
    expect(book.sheet.value(0, 0)).toBe(127);
    expect(book.sheet.value(1, 0)).toBe(6);
    expect(book.sheet.value(2, 0)).toBe(8);
  });
});
