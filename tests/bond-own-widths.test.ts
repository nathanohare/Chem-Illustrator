// @vitest-environment jsdom
//
// A structure drawn at its own settings in ChemDraw keeps them on each bond (BoldWidth,
// HashSpacing, MarginWidth, BondLength, in points). Those bonds draw with their own widths, and
// scaling the structure scales them with it.

import { describe, it, expect } from 'vitest';
import { Doc, type Bond } from '../src/model';
import { recordPicture } from '../src/render/picture';
import { ACS_1996, bondWidths, scaleOwnWidths, atomMargin } from '../src/style';
import type { Seg } from '../src/render/vector';

/** One horizontal bond, 20 pt long, drawn `display` with these widths of its own. */
function oneBond(display: Bond['display'], own: Partial<Bond> = {}): Doc {
  const doc = new Doc();
  doc.style = { ...ACS_1996 };
  doc.bulk(() => {
    const a = doc.addAtom(0, 0), b = doc.addAtom(20, 0);
    doc.addBond(a.id, b.id, 1, display, own);
  });
  return doc;
}

const paths = (doc: Doc) => recordPicture(doc)!.items.filter((i) => i.kind === 'path') as { segs: Seg[] }[];
const moves = (doc: Doc) => paths(doc).reduce((n, p) => n + p.segs.filter((g) => g.k === 'M').length, 0);
const height = (doc: Doc) => {
  const ys = paths(doc).flatMap((p) => p.segs.filter((g) => 'y' in g).map((g) => (g as { y: number }).y));
  return Math.max(...ys) - Math.min(...ys);
};

describe('a bond with widths of its own', () => {
  it('takes the document\'s widths, scaled by s, where it has none', () => {
    const w = bondWidths(ACS_1996, { s: 0.9 });
    expect(w.boldWidth).toBeCloseTo(ACS_1996.boldWidth * 0.9, 6);
    expect(w.hashSpacing).toBeCloseTo(ACS_1996.hashSpacing * 0.9, 6);
    expect(w.marginWidth).toBeCloseTo(ACS_1996.marginWidth * 0.9, 6);
    expect(w.bondLength).toBeCloseTo(ACS_1996.bondLength * 0.9, 6);
    expect(bondWidths(ACS_1996, { s: 0.9, hashSpacing: 1.8 }).hashSpacing).toBe(1.8);
    expect(atomMargin(ACS_1996, { s: 2 })).toBeCloseTo(ACS_1996.marginWidth * 2, 6);
    expect(atomMargin(ACS_1996, { s: 2, marginWidth: 1 })).toBe(1);
  });

  it('draws a hashed wedge with its own hash spacing', () => {
    const plain = moves(oneBond('hashWedge'));
    const tight = moves(oneBond('hashWedge', { hashSpacing: ACS_1996.hashSpacing / 2 }));
    expect(tight).toBeGreaterThan(plain * 1.6);
  });

  it('draws a bold bond with its own bold width', () => {
    const plain = height(oneBond('bold'));
    const wide = height(oneBond('bold', { boldWidth: ACS_1996.boldWidth * 2 }));
    expect(plain).toBeCloseTo(ACS_1996.boldWidth, 1);
    expect(wide).toBeCloseTo(ACS_1996.boldWidth * 2, 1);
  });

  it('scales its own widths with the structure', () => {
    expect(scaleOwnWidths({ hashSpacing: 2, boldWidth: 3 }, 1.5)).toEqual({ hashSpacing: 3, boldWidth: 4.5 });
    expect(scaleOwnWidths({}, 2)).toEqual({});
  });
});
