// @vitest-environment jsdom
//
// η³, η⁵ and η⁶ ligands on a metal drawn delocalized (a circle in the ring, an arc over an allyl),
// with a switch back to the Kekulé form; the bonds themselves never change.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { allylArc, bondHapto, haptoLook, piLook, piLooksOf } from '../src/chem/hapto';

/** A Kekulé cyclopentadienyl (two double bonds) over an iron atom, bonded η⁵. */
function cpFe(bonded = true) {
  const doc = new Doc();
  const L = doc.style.bondLength;
  const ids = doc.edit('a', () => {
    const ring: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = (-90 + i * 72) * Math.PI / 180;
      ring.push(doc.addAtom(Math.cos(t) * L * 0.85, Math.sin(t) * L * 0.85 - 30).id);
    }
    const bonds = ring.map((id, i) => doc.addBond(id, ring[(i + 1) % 5], i === 0 || i === 2 ? 2 : 1).id);
    const fe = doc.addAtom(0, 0, 26).id;
    if (bonded) bondHapto(doc, fe, ring);
    return { ring, fe, bonds };
  });
  return { doc, ...ids };
}

/** An η³-allyl over palladium. */
function allylPd() {
  const doc = new Doc();
  const ids = doc.edit('a', () => {
    const a = doc.addAtom(-12, -20).id, b = doc.addAtom(0, -27).id, c = doc.addAtom(12, -20).id;
    const b1 = doc.addBond(a, b, 2).id, b2 = doc.addBond(b, c, 1).id;
    const pd = doc.addAtom(0, 0, 46).id;
    bondHapto(doc, pd, [a, b, c]);
    return { chain: [a, b, c], bonds: [b1, b2], pd };
  });
  return { doc, ...ids };
}

const centreOf = (doc: Doc) => [...doc.atoms.values()].find((a) => a.multi)!;

describe('which ligands are drawn delocalized', () => {
  it('a ring bonded η⁵ to a metal: every ring bond, in ring order', () => {
    const { doc, ring, bonds } = cpFe();
    const look = piLook(doc, centreOf(doc))!;
    expect(look.kind).toBe('ring');
    expect(new Set((look as { ring: number[] }).ring)).toEqual(new Set(ring));
    for (const id of bonds) expect(piLooksOf(doc, doc.bonds.get(id)!).length).toBe(1);
  });
  it('an allyl bonded η³: an arc over its two bonds', () => {
    const { doc, chain, bonds } = allylPd();
    const look = piLook(doc, centreOf(doc))!;
    expect(look).toEqual({ kind: 'arc', chain: [chain[0], chain[1], chain[2]] });
    for (const id of bonds) expect(piLooksOf(doc, doc.bonds.get(id)!).length).toBe(1);
  });
  it('not a ring on its own, not η² or η⁴, not in Kekulé form, not with the setting off', () => {
    expect(piLooksOf(cpFe(false).doc, cpFe(false).doc.bonds.values().next().value!)).toEqual([]);
    const { doc } = cpFe();
    const c = centreOf(doc);
    doc.edit('k', () => doc.updateAtom(c.id, { kekule: true }));
    expect(piLook(doc, doc.atoms.get(c.id)!)).toBeNull();
    doc.edit('k', () => doc.updateAtom(c.id, { kekule: undefined }));
    haptoLook.delocalized = false;
    try { expect(piLook(doc, doc.atoms.get(c.id)!)).toBeNull(); } finally { haptoLook.delocalized = true; }
  });
  it('leaves the bonds as drawn (SMILES and files keep the Kekulé structure)', () => {
    const { doc, bonds } = cpFe();
    expect(bonds.map((id) => doc.bonds.get(id)!.order)).toEqual([2, 1, 2, 1, 1]);
  });
});

describe('the allyl arc', () => {
  it('lies inside the angle, a bond spacing in, ending short of the outer atoms', () => {
    const a = { x: -12, y: -20 }, b = { x: 0, y: -27 }, c = { x: 12, y: -20 };
    const q = allylArc(a, b, c, 2.6)!;
    // on the metal's side (below the carbons), and symmetric
    expect(q.ctrl.y).toBeGreaterThan(b.y);
    expect(q.from.x).toBeCloseTo(-q.to.x, 6);
    // a bond spacing from the bond a–b at its start, and short of a
    const dist = (p: { x: number; y: number }) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
    expect(dist(q.from)).toBeCloseTo(2.6, 6);
    expect(dist(q.ctrl)).toBeCloseTo(2.6, 6);
    expect(Math.hypot(q.from.x - a.x, q.from.y - a.y)).toBeGreaterThan(2);
    expect(allylArc(a, { x: 0, y: -20 }, c, 2.6)).toBeNull();
  });
});

describe('saving', () => {
  it('keeps the Kekulé choice in CDXML, where ChemDraw sees only the MultiAttachment', () => {
    const { doc } = cpFe();
    const c = centreOf(doc);
    doc.edit('k', () => doc.updateAtom(c.id, { kekule: true }));
    const text = writeCdxml(doc);
    expect(text).toContain('Name="Chem Illustrator Kekule"');
    const back = readCdxml(text).doc;
    expect(centreOf(back).kekule).toBe(true);
    // and back to delocalized: the tag goes
    const d2 = readCdxml(text).doc;
    d2.edit('k', () => d2.updateAtom(centreOf(d2).id, { kekule: undefined }));
    expect(writeCdxml(d2)).not.toContain('Chem Illustrator Kekule');
  });
});
