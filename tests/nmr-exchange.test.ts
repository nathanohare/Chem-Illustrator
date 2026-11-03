import { describe, expect, it } from 'vitest';
import { exchangeKind, exchangeRange } from '../src/chem/nmr/exchange';
import type { JGraph } from '../src/chem/nmr/coupling';

// tiny graph builder: atoms as [el, h, arom?], bonds as [u, v, order]
const G = (atoms: [string, number, boolean?][], bonds: [number, number, number][]): JGraph => ({
  atoms: atoms.map(([el, h, arom]) => ({ el, h, arom: !!arom })),
  bonds: bonds.map(([u, v, o]) => ({ u, v, o })),
});
const ring = (start: number): [number, number, number][] => [0, 1, 2, 3, 4, 5].map((k) => [start + k, start + ((k + 1) % 6), 4]);
const benz = (): [string, number, boolean][] => Array.from({ length: 6 }, () => ['C', 1, true]);

describe('exchangeable proton ranges', () => {
  it('tells the kinds of OH apart', () => {
    expect(exchangeKind(G([['C', 3], ['C', 2], ['O', 1]], [[0, 1, 1], [1, 2, 1]]), 2)).toBe('alcohol');
    expect(exchangeKind(G([['C', 3], ['C', 0], ['O', 0], ['O', 1]], [[0, 1, 1], [1, 2, 2], [1, 3, 1]]), 3)).toBe('acid');
    expect(exchangeKind(G([...benz(), ['O', 1]], [...ring(0), [0, 6, 1]]), 6)).toBe('phenol');
  });
  it('tells the kinds of NH apart', () => {
    // acetanilide: amide; aniline: aryl amine; ethylamine; a carbamate
    expect(exchangeKind(G([['C', 3], ['C', 0], ['O', 0], ['N', 1], ...benz()], [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], ...ring(4)]), 3)).toBe('amide');
    expect(exchangeKind(G([['N', 2], ...benz()], [[0, 1, 1], ...ring(1)]), 0)).toBe('arylamine');
    expect(exchangeKind(G([['C', 3], ['C', 2], ['N', 2]], [[0, 1, 1], [1, 2, 1]]), 2)).toBe('amine');
    expect(exchangeKind(G([['C', 3], ['O', 0], ['C', 0], ['O', 0], ['N', 2]], [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1]]), 4)).toBe('carbamate');
  });
  it('moves with the solvent and vanishes in D2O and CD3OD', () => {
    const g = G([['C', 3], ['C', 2], ['O', 1]], [[0, 1, 1], [1, 2, 1]]);
    const c = exchangeRange(g, 2, 'CDCl3')!, d = exchangeRange(g, 2, 'DMSO-d6')!;
    expect(d.lo).toBeGreaterThan(c.lo);
    expect(c.gone).toBe(false);
    expect(exchangeRange(g, 2, 'CD3OD')!.gone).toBe(true);
    expect(exchangeRange(g, 0, 'CDCl3')).toBeNull();
  });
});
