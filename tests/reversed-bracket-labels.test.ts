// Issue #432 (Lauren): B(OH)2 with its bond on the right reads (HO)2B, the bracket's formula
// reversed too, as ChemDraw writes it; the B stays on the bond.

import { describe, it, expect } from 'vitest';
import { labelSpec, layoutLabel } from '../src/chem/labels';

const measure = (t: string, s: number) => t.length * s * 0.6;
const text = (label: string, bond: { x: number; y: number }) =>
  layoutLabel(labelSpec(5, label, 0, 0, 1, 1)!, [bond], 10, measure).runs.map((r) => r.text).join('');
const right = { x: 1, y: 0 }, left = { x: -1, y: 0 };

describe('bracketed groups in labels joined on the right (#432)', () => {
  it('reverses the formula inside the brackets', () => {
    expect(text('B(OH)2', right)).toBe('(HO)2B');
    expect(text('Si(OEt)3', right)).toBe('(EtO)3Si');
    expect(text('CH(OMe)2', right)).toBe('(MeO)2HC');
  });

  it('keeps a lone abbreviation in brackets whole, and labels joined on the left as typed', () => {
    expect(text('P(t-Bu)2', right)).toBe('(t-Bu)2P');
    expect(text('B(OH)2', left)).toBe('B(OH)2');
  });

  it('puts the B on the bond', () => {
    const lay = layoutLabel(labelSpec(5, 'B(OH)2', 0, 0, 1, 1)!, [right], 10, measure);
    const b = lay.runs.find((r) => r.text === 'B')!;
    expect(b.dx).toBeLessThan(0);
    expect(b.dx + measure('B', 10)).toBeGreaterThan(0);
  });
});
