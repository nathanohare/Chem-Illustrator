// In the reaction animation, a bold bond meeting another bond at a bare atom is mitred into it
// (as the still drawing joins them), so its square corner doesn't stick out as a notch.

import { describe, it, expect } from 'vitest';
import { boldJoins } from '../src/morph/paint';
import type { Stroke } from '../src/morph/frame';
import type { Vec } from '../src/geom';

const O = { x: 0, y: 0 };
const at = (deg: number): Vec => ({ x: Math.cos((deg * Math.PI) / 180) * 14.4, y: Math.sin((deg * Math.PI) / 180) * 14.4 });

function stroke(p0: Vec, p1: Vec, ends: string[], bold: boolean, labelled: [boolean, boolean] = [false, false]) {
  const s: Stroke = { p0, p1, color: [0, 0, 0], z: 0, alpha: 1, w: bold ? 2 : 0.6, ends, grp: ends.join('-'), stereo: bold ? { display: 'bold', begin: p0 } as Stroke['stereo'] : null };
  return { ...s, labelled, atoms: [p0, p1] as [Vec, Vec] };
}

describe('bold bonds in the animation', () => {
  it('mitre into a plain bond at a shared bare atom', () => {
    const plain = stroke(O, at(150), ['a', 'c'], false);
    const j = boldJoins([stroke(O, at(30), ['a', 'b'], true), plain]);
    const end = j[0][0]!;
    expect(end).toBeTruthy();
    // both corners on the plain line's edges (0.3 either side of it)
    const u = { x: plain.p1.x / 14.4, y: plain.p1.y / 14.4 }, n = { x: -u.y, y: u.x };
    for (const p of [end.plus, end.minus]) expect(Math.abs(p.x * n.x + p.y * n.y)).toBeCloseTo(0.3);
    expect(j[0][1]).toBeNull();
    expect(j[1]).toEqual([null, null]);
  });

  it('leave an end at a shown label square', () => {
    const j = boldJoins([stroke(O, at(30), ['a', 'b'], true, [true, false]), stroke(O, at(150), ['a', 'c'], false, [true, false])]);
    expect(j[0][0]).toBeNull();
  });
});
