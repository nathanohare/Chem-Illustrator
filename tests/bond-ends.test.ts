// @vitest-environment jsdom
//
// A centred double bond (an exocyclic C=O on a ring) runs each line in to meet the bond beside it,
// with no gap; and the ends of bond lines can be made less round (Settings > Drawing), with the
// lines that meet at an atom then mitred to a point.

import { describe, it, expect, afterEach } from 'vitest';
import { Doc } from '../src/model';
import { recordPicture } from '../src/render/picture';
import { lineMitres } from '../src/render/bond-joins';
import { bondEndPrefs, DEFAULT_BOND_ENDS } from '../src/style';
import { parseSettings } from '../src/settings';
import type { Seg, StrokeStyle } from '../src/render/vector';
import type { Vec } from '../src/geom';

const BL = 14.4;
const at = (deg: number, l = BL): Vec => ({ x: Math.cos((deg * Math.PI) / 180) * l, y: Math.sin((deg * Math.PI) / 180) * l });

/** Cyclohexanone with its carbonyl carbon at the origin and the C=O pointing straight up. */
function cyclohexanone(): Doc {
  const doc = new Doc();
  doc.edit('x', () => {
    const ring = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = 270 + 60 * i;
      const c = { x: Math.cos((a * Math.PI) / 180) * BL, y: BL + Math.sin((a * Math.PI) / 180) * BL };
      return doc.addAtom(c.x, c.y, 6);
    });
    ring.forEach((r, i) => doc.addBond(r.id, ring[(i + 1) % 6].id, 1));
    const o = doc.addAtom(0, -BL, 8);
    doc.addBond(ring[0].id, o.id, 2);
  });
  return doc;
}

function strokes(doc: Doc): { segs: Seg[]; stroke: StrokeStyle }[] {
  return recordPicture(doc)!.items.filter((i) => i.kind === 'path' && 'stroke' in i && i.stroke) as { segs: Seg[]; stroke: StrokeStyle }[];
}

/** Every straight line drawn (from one moveTo to the next lineTo). */
function lines(doc: Doc): [Vec, Vec][] {
  const out: [Vec, Vec][] = [];
  for (const s of strokes(doc)) {
    let from: Vec | null = null;
    for (const g of s.segs) {
      if (g.k === 'M') from = { x: g.x, y: g.y };
      else if (g.k === 'L' && from) { out.push([from, { x: g.x, y: g.y }]); from = { x: g.x, y: g.y }; }
    }
  }
  return out;
}

afterEach(() => { bondEndPrefs.round = DEFAULT_BOND_ENDS; });

describe('centred double bonds', () => {
  it('carry the lines of an exocyclic C=O in to meet the ring bonds', () => {
    const doc = cyclohexanone();
    // the two lines of the C=O run up the page, either side of x = 0
    const co = lines(doc).filter(([a, b]) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.x) > 0.1 && Math.abs(a.x) < 3);
    expect(co.length).toBe(2);
    for (const [a, b] of co) {
      const low = a.y > b.y ? a : b;
      // the low end sits on the ring bond on its own side, below the carbon (y > 0), not level with it
      expect(low.y).toBeGreaterThan(0.1);
      const ring = at(low.x > 0 ? 30 : 150);
      const cross = ring.x * low.y - ring.y * low.x;
      expect(Math.abs(cross / BL)).toBeLessThan(1e-6);
    }
  });
});

describe('bond ends', () => {
  it('are slightly round by default (cut square, with round-capped tips a quarter as wide), and round when chosen', () => {
    const doc = cyclohexanone();
    const lw = doc.style.lineWidth;
    expect(DEFAULT_BOND_ENDS).toBe(0.25);
    const all = strokes(doc);
    expect(all.filter((s) => s.stroke.width === lw).every((s) => s.stroke.cap === 'butt' && s.stroke.join === 'miter')).toBe(true);
    expect(all.some((s) => s.stroke.cap === 'round' && Math.abs(s.stroke.width - lw * 0.25) < 1e-9)).toBe(true);
    bondEndPrefs.round = 0;
    expect(strokes(doc).every((s) => s.stroke.cap === 'butt')).toBe(true);
    bondEndPrefs.round = 1;
    expect(strokes(doc).every((s) => s.stroke.cap === 'round')).toBe(true);
  });

  it('mitre two lines meeting at 120° on the outside of the turn only', () => {
    const m = lineMitres([{ id: 1, u: at(30, 1), h: 0.3 }, { id: 2, u: at(150, 1), h: 0.3 }]);
    const turns = [...m.values()].flat();
    expect(turns.length).toBe(1);
    // owned by the line the 240° turn starts from, going round
    expect(m.get(2)?.length).toBe(1);
  });

  it('leave three lines at 120° (and a straight line) with nothing to mitre', () => {
    const three = lineMitres([{ id: 1, u: at(90, 1), h: 0.3 }, { id: 2, u: at(210, 1), h: 0.3 }, { id: 3, u: at(330, 1), h: 0.3 }]);
    expect([...three.values()].flat().length).toBe(0);
    const straight = lineMitres([{ id: 1, u: at(0, 1), h: 0.3 }, { id: 2, u: at(180, 1), h: 0.3 }]);
    expect([...straight.values()].flat().length).toBe(0);
  });

  it('is kept with the settings, within 0 to 1', () => {
    expect(parseSettings(JSON.stringify({ bondEnds: 0 })).bondEnds).toBe(0);
    expect(parseSettings(JSON.stringify({ bondEnds: 7 })).bondEnds).toBe(1);
    expect(parseSettings('{}').bondEnds).toBe(DEFAULT_BOND_ENDS);
  });
});
