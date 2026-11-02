import { describe, expect, it } from 'vitest';
import type { NamerGraph } from '../src/chem/namer-graph';
import { molfileHeavyAtoms, nmrRows, siText } from '../src/ui/nmr-panel';

const atom = (el: string, h: number, arom = false) => ({ el, q: 0, iso: 0, legacy: null, cip: null, tag: null, arom, xh: 0, h, rad: 0, deg: 0 });
const bond = (u: number, v: number, o = 1) => ({ u, v, o, ez: null, ring: false });

// Ethanol: C0 (CH3), C1 (CH2), O2 (OH)
const ethanol: NamerGraph = { atoms: [atom('C', 3), atom('C', 2), atom('O', 1)], bonds: [bond(0, 1), bond(1, 2)] };
const hit = (value: number) => ({ value, spread: 0.1, radius: 3, n: 12 });

describe('NMR panel rows', () => {
  it('numbers carbons and lists heteroatom H last', () => {
    const rows = nmrRows(ethanol, [
      { atom: 0, c13: hit(18.4), h1: hit(1.22), hCount: 3 },
      { atom: 1, c13: hit(58.3), h1: hit(3.70), hCount: 2 },
      { atom: 2, c13: null, h1: hit(1.5), hCount: 1 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['1', '2', 'OH']);
    expect(rows.map((r) => r.hCount)).toEqual([3, 2, 1]);
  });

  it('writes SI text highest shift first', () => {
    const rows = nmrRows(ethanol, [
      { atom: 0, c13: hit(18.4), h1: hit(1.22), hCount: 3 },
      { atom: 1, c13: hit(58.3), h1: hit(3.70), hCount: 2 },
      { atom: 2, c13: null, h1: hit(1.5), hCount: 1 },
    ]);
    expect(siText(rows, 'CDCl3')).toBe('1H NMR (400 MHz, CDCl3) δ 3.70 (2H), 1.50 (1H), 1.22 (3H); 13C NMR (101 MHz, CDCl3) δ 58.3, 18.4.');
  });

  it('skips hydrogens in a V2000 molfile', () => {
    const mol = ['', '', '', '  3  2  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0', '    1.0000    0.0000    0.0000 H   0  0', '    2.0000    0.0000    0.0000 O   0  0',
      '  1  2  1  0', '  1  3  1  0', 'M  END'].join('\n');
    expect(molfileHeavyAtoms(mol)).toEqual([0, 2]);
  });
});
