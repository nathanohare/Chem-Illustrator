// Issue #520 (Lauren): the H of a ring NH stacked above or below (a Center label, or ChemDraw's
// Above and Below) stays on the side away from the bonds after the structure is turned or
// flipped, rather than sitting inside the ring.

import { describe, it, expect } from 'vitest';
import { labelSpec, labelDir, layoutLabel, fitStacked } from '../src/chem/labels';

const dirs = (angles: number[]) => angles.map((t) => ({ x: Math.cos((t * Math.PI) / 180), y: Math.sin((t * Math.PI) / 180) }));
const measure = (t: string, s: number) => t.length * s * 0.6;

describe('stacked H on the open side (#520)', () => {
  // y points down: -120 and -60 are bonds going up from an N at the foot of a ring (carbazole, pyrrole)
  const up = dirs([-125, -50]);
  const down = dirs([125, 50]);

  it('turns a stacked H away from bonds it would sit on', () => {
    const nh = { ...labelSpec(7, null, 0, 0, 2, 2)!, stacked: 'up' as const };
    expect(labelDir(nh, up)).toBe('down');
    expect(labelDir(nh, down)).toBe('up');
    expect(labelDir({ ...nh, stacked: 'down' }, up)).toBe('down');
    // bonds out to the sides leave either side open: the choice stays
    expect(fitStacked({ stacked: 'up' as const }, dirs([180, 0])).stacked).toBe('up');
  });

  it('draws the H below the N when the bonds go up', () => {
    const nh = { ...labelSpec(7, null, 0, 0, 2, 2)!, stacked: 'up' as const };
    const lay = layoutLabel(nh, up.map((d) => ({ ...d, len: 30 })), 10, measure);
    const h = lay.runs.find((r) => r.text === 'H')!;
    const n = lay.runs.find((r) => r.text === 'N')!;
    expect(h.dy).toBeGreaterThan(n.dy);
  });
});
