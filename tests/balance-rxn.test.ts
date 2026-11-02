// Check Balance (atoms on each side of an arrow) and reactions as reaction SMILES and RXN files.
import { describe, expect, it } from 'vitest';
import { byProductName, checkBalance } from '../src/chem/balance';
import { isReactionSmiles, isRxn, parseRxn, reactionSmiles, rxnBlock, splitReactionSmiles } from '../src/chem/reaction-io';

describe('Check Balance', () => {
  it('finds a balanced esterification once water is drawn', () => {
    const b = checkBalance([{ formula: 'C2H4O2' }, { formula: 'CH4O' }], [{ formula: 'C3H6O2' }, { formula: 'H2O' }]);
    expect(b.balanced).toBe(true);
    expect(b.rows.map((r) => r.element)).toEqual(['C', 'H', 'O']);
  });

  it('names what the products are short of', () => {
    const b = checkBalance([{ formula: 'C2H4O2' }, { formula: 'CH4O' }], [{ formula: 'C3H6O2' }]);
    expect(b.balanced).toBe(false);
    expect(b.missing).toBe('H2O');
    expect(b.missingName).toBe('water');
    expect(b.extra).toBe('');
  });

  it('counts coefficients and charges', () => {
    const b = checkBalance([{ formula: 'H2', count: 2 }, { formula: 'O2' }], [{ formula: 'H2O', count: 2 }]);
    expect(b.balanced).toBe(true);
    const c = checkBalance([{ formula: 'H3N' }, { formula: 'H', charge: 1 }], [{ formula: 'H4N', charge: 1 }]);
    expect(c.balanced).toBe(true);
    expect(checkBalance([{ formula: 'H3N' }], [{ formula: 'H4N', charge: 1 }]).extra).toBe('H');
  });

  it('knows multiples of common by-products', () => {
    expect(byProductName('H4O2')).toBe('2 × water');
    expect(byProductName('C9H9')).toBeUndefined();
  });
});

describe('reaction SMILES and RXN', () => {
  it('reads and writes reaction SMILES', () => {
    expect(isReactionSmiles('CC(=O)O.OC>[H+]>CC(=O)OC.O')).toBe(true);
    expect(isReactionSmiles('CCO>>CC=O')).toBe(true);
    expect(isReactionSmiles('CCO')).toBe(false);
    expect(isReactionSmiles('a > b')).toBe(false);
    const p = splitReactionSmiles('CC(=O)O.OC>[H+]>CC(=O)OC.O |f:0.1|');
    expect(p).toEqual({ reactants: ['CC(=O)O', 'OC'], agents: ['[H+]'], products: ['CC(=O)OC', 'O'] });
    expect(reactionSmiles(p)).toBe('CC(=O)O.OC>[H+]>CC(=O)OC.O');
  });

  it('writes an RXN file that reads back', () => {
    const mol = (n: string) => `${n}\n  test\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n`;
    const text = rxnBlock({ reactants: [mol('a'), mol('b')], agents: [mol('c')], products: [mol('d')] });
    expect(isRxn(text)).toBe(true);
    expect(text.split('\n')[4]).toBe('  2  1  1');
    const back = parseRxn(text)!;
    expect(back.reactants.map((m) => m.split('\n')[0])).toEqual(['a', 'b']);
    expect(back.products.map((m) => m.split('\n')[0])).toEqual(['d']);
    expect(back.agents.map((m) => m.split('\n')[0])).toEqual(['c']);
    expect(parseRxn('$RXN V3000\n')).toBeNull();
  });
});
