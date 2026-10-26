// Opening .xlsx reads each formula's text several times over (legacyFormula, then
// normalizeFormula, then the recalculation). legacyFormula, which puts @ where a block stands in
// for one value, reads a formula only when it could have a block (written with : or #) and
// splits it into tokens only when it has an @ to put in.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/sheet/formula', async (original) => {
  const m = await original<typeof import('../src/sheet/formula')>();
  return { ...m, tokenize: vi.fn(m.tokenize), parseFormula: vi.fn(m.parseFormula) };
});

const { tokenize, parseFormula } = await import('../src/sheet/formula');
const { legacyFormula } = await import('../src/sheet/array-formulas');

describe('legacyFormula', () => {
  it('leaves a formula with no block unread', () => {
    vi.mocked(tokenize).mockClear();
    vi.mocked(parseFormula).mockClear();
    for (const f of ['=A1*2', '=B5+A5', '=IF(C1>100,"big","small")', '=Sheet2!A1', '=NAME1*3']) expect(legacyFormula(f)).toBe(f);
    expect(parseFormula).not.toHaveBeenCalled();
    expect(tokenize).not.toHaveBeenCalled();
  });

  it('splits into tokens only a formula that gets an @', () => {
    vi.mocked(tokenize).mockClear();
    expect(legacyFormula('=SUM(A$1:A50)')).toBe('=SUM(A$1:A50)');
    expect(legacyFormula('=IFERROR(A1,#N/A)')).toBe('=IFERROR(A1,#N/A)');
    expect(tokenize).not.toHaveBeenCalled();
    expect(legacyFormula('=A1:A3*10')).toBe('=@A1:A3*10');
    expect(legacyFormula('=A1#*2')).toBe('=@A1#*2');
    expect(legacyFormula('=C:C+1')).toBe('=@C:C+1');
    expect(legacyFormula('="a:b"&A1')).toBe('="a:b"&A1');
  });
});
