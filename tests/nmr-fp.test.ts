import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { NamerGraph } from '../src/chem/namer-graph';
import { envCodes } from '../src/chem/nmr/env';
import { ShiftTable } from '../src/chem/nmr/lookup';
import { nmrListHtml, nmrReportHtml, nmrRows, siText } from '../src/ui/nmr-panel';

const atom = (el: string, h: number, arom = false) => ({ el, q: 0, iso: 0, legacy: null, cip: null, tag: null, arom, xh: 0, h, rad: 0, deg: 0 });
const bond = (u: number, v: number, o = 1) => ({ u, v, o, ez: null, ring: false });
const hit = (value: number) => ({ value, spread: 1, radius: 3, n: 12 });

// (Trifluoromethyl)benzene: ring C0-C5 (aromatic), CF3 carbon C6, F7-F9
const ring = [0, 1, 2, 3, 4, 5].map((i) => bond(i, (i + 1) % 6, i % 2 ? 1 : 2));
const phCF3: NamerGraph = {
  atoms: [atom('C', 0, true), ...[1, 2, 3, 4, 5].map(() => atom('C', 1, true)), atom('C', 0), atom('F', 0), atom('F', 0), atom('F', 0)],
  bonds: [...ring, bond(0, 6), bond(6, 7), bond(6, 8), bond(6, 9)],
};
// Triphenylphosphine oxide drawn as one ring for brevity: P6(=O7) on C0, with two methyls (C8, C9)
const p_oxide: NamerGraph = {
  atoms: [atom('C', 0, true), ...[1, 2, 3, 4, 5].map(() => atom('C', 1, true)), atom('P', 0), atom('O', 0), atom('C', 3), atom('C', 3)],
  bonds: [...ring, bond(0, 6), bond(6, 7, 2), bond(6, 8), bond(6, 9)],
};

describe('19F and 31P rows', () => {
  const shifts = (g: NamerGraph) => g.atoms.map((a, i) => ({ atom: i, c13: a.el === 'C' ? hit(130) : null, h1: a.h ? hit(7.4) : null, hCount: a.h }));

  it('groups equivalent F atoms in one row after the carbons', () => {
    const rows = nmrRows(phCF3, shifts(phCF3));
    const f = rows.filter((r) => r.xNuc === '19F');
    expect(f).toHaveLength(1);
    expect(f[0].label).toBe('F1, F2, F3');
    expect(rows[rows.length - 1].xNuc).toBe('19F');
  });

  it('lists, reports and writes SI text for 19F', () => {
    const rows = nmrRows(phCF3, shifts(phCF3));
    rows.find((r) => r.xNuc === '19F')!.x = hit(-62.7);
    expect(nmrListHtml(rows, '19F')).toContain('-62.7');
    expect(nmrListHtml(rows, '19F')).toContain('3F');
    expect(nmrReportHtml(rows, 'CDCl3')).toContain('<sup>19</sup>F NMR (376 MHz');
    expect(siText(rows, 'CDCl3')).toMatch(/; 19F NMR \(376 MHz, CDCl3\) δ -62\.7\.$/);
  });

  it('the shipped table predicts PhCF3 near -63 ppm and a phosphine oxide P downfield of 20 ppm', () => {
    const b = readFileSync('public/nmr/nmr-fp.dat');
    const t = new ShiftTable(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const f = t.predict('19F', envCodes(phCF3)[7], 'CDCl3');
    expect(f!.value).toBeGreaterThan(-66);
    expect(f!.value).toBeLessThan(-60);
    const p = t.predict('31P', envCodes(p_oxide)[6], 'CDCl3');
    expect(p!.value).toBeGreaterThan(20);
    expect(p!.value).toBeLessThan(50);
  });
});
