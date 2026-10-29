// @vitest-environment jsdom
//
// Issue #271: fused ring fills cast one shadow round their outer edge, so no ring's shadow falls
// on its neighbour's fill, unless "Shadow between fused rings" is ticked.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { ringShadowGroups } from '../src/render/fills';
import { recordPicture, pictureSvg } from '../src/render/picture';
import { fillRings, refitRingFills } from '../src/chem/ring-fill';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';

/** Naphthalene (two hexagons sharing a bond), with both rings filled and shadowed. */
function naphthalene(look: Parameters<typeof fillRings>[2] = {}) {
  const doc = new Doc();
  doc.beforeCommit = (before) => refitRingFills(doc, before);
  doc.edit('Draw', () => {
    const L = 14, h = (L * Math.sqrt(3)) / 2;
    const at = [[0, -L], [h, -L / 2], [h, L / 2], [0, L], [-h, L / 2], [-h, -L / 2], [2 * h, -L], [3 * h, -L / 2], [3 * h, L / 2], [2 * h, L]].map(([x, y]) => doc.addAtom(x, y).id);
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 6], [6, 7], [7, 8], [8, 9], [9, 2]]) doc.addBond(at[a], at[b]);
  });
  doc.edit('Fill', () => fillRings(doc, [], { shadow: true, ...look }));
  return doc;
}
const shadows = (doc: Doc) => (pictureSvg(recordPicture(doc)!).match(/fill="#000000" fill-opacity="0\.22"/g) ?? []).length;

describe('fused ring fill shadows (#271)', () => {
  it('groups fused rings with the same shadow, and not those set apart', () => {
    const doc = naphthalene();
    const rings = [...doc.shapes.values()];
    expect(rings).toHaveLength(2);
    const groups = ringShadowGroups(rings, doc.style.bondLength);
    expect(groups.get(rings[0].id)).toBe(groups.get(rings[1].id));
    expect(groups.get(rings[0].id)).toHaveLength(2);
    // a different shadow, or one asked for between the rings, keeps each ring's own
    expect(ringShadowGroups([rings[0], { ...rings[1], shadowAngle: 90 }], doc.style.bondLength).size).toBe(0);
    expect(ringShadowGroups([rings[0], { ...rings[1], shadowBetween: true }], doc.style.bondLength).size).toBe(0);
  });

  it('casts one shadow round the outer edge, painted before either fill', () => {
    const doc = naphthalene();
    expect(shadows(doc)).toBe(1);
    const svg = pictureSvg(recordPicture(doc)!);
    // both shadows come before both fills, so neither ring's fill is shaded
    const lastShadow = svg.lastIndexOf('fill-opacity="0.22"');
    const fills = [...svg.matchAll(/<path[^>]*fill="#[0-9a-f]{6}"(?! fill-opacity="0\.22")/g)].map((m) => m.index!);
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every((i) => i > lastShadow)).toBe(true);
  });

  it('gives each ring its own shadow with "Shadow between fused rings"', () => {
    expect(shadows(naphthalene({ shadowBetween: true }))).toBe(2);
  });

  it('saves the outer-edge shadow for ChemDraw once, and keeps the setting', () => {
    const one = writeCdxml(naphthalene());
    const both = writeCdxml(naphthalene({ shadowBetween: true }));
    const curves = (t: string) => (t.match(/<curve /g) ?? []).length;
    expect(curves(one)).toBeLessThan(curves(both));
    expect([...readCdxml(both).doc.shapes.values()].every((s) => s.shadowBetween)).toBe(true);
  });
});
