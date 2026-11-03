// @vitest-environment jsdom
//
// Copying to ChemDraw keeps what a ChemDraw drawing has: ring fills as ChemDraw's own ring fills
// (ColoredMolecularArea, the bonds round the ring and a colour), a structure's own drawing
// settings on each bond, the stacking of crossing bonds (Z on every bond), and labels that run to
// the left (Cy3P) right-justified, as ChemDraw 25 writes them (tests/fixtures/chemdraw-clipboard).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';
import { extractDrawing } from '../src/io/clipboard';
import { fillRings } from '../src/chem/ring-fill';
import { ACS_1996 } from '../src/style';

const parse = (t: string) => new DOMParser().parseFromString(t.replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml').documentElement;
const all = (e: Element, name: string) => Array.from(e.getElementsByTagName(name));
/** The copy ChemDraw gets: the drawing on its own, written afresh, as CDX and back. */
const copied = (doc: Doc) => {
  const xml = writeCdxml(extractDrawing(doc, null), { name: 'Clipboard.cdxml' });
  return { xml: parse(xml), cdx: parse(cdxToCdxml(cdxmlToCdx(xml))) };
};

/** A hexagon of carbons, 21.6 pt bonds, its ids in ring order. */
function hexagon(doc: Doc, cx = 0, cy = 0): number[] {
  const L = ACS_1996.bondLength;
  const ids = Array.from({ length: 6 }, (_, i) => { const t = (Math.PI / 3) * i + Math.PI / 6; return doc.addAtom(cx + L * Math.cos(t), cy + L * Math.sin(t)).id; });
  ids.forEach((id, i) => doc.addBond(id, ids[(i + 1) % 6]));
  return ids;
}
const newDoc = () => { const d = new Doc(); d.style = { ...ACS_1996 }; return d; };

describe('copying to ChemDraw', () => {
  it('writes a plain ring fill as ChemDraw\'s ring fill, in CDXML and CDX', () => {
    const doc = newDoc();
    doc.bulk(() => hexagon(doc));
    doc.edit('Fill', () => fillRings(doc, [], { fillColor: '#bfffbf' }));
    for (const x of Object.values(copied(doc))) {
      const areas = all(x, 'ColoredMolecularArea');
      expect(areas).toHaveLength(1);
      const a = areas[0];
      expect(a.parentElement!.nodeName).toBe('fragment');
      const bondIds = all(a.parentElement!, 'b').map((b) => b.getAttribute('id'));
      expect(a.getAttribute('BasisObjects')!.split(' ').sort()).toEqual(bondIds.sort());
      // bgcolor counts black and white first, then the colour table
      const table = all(x, 'color');
      const c = table[Number(a.getAttribute('bgcolor')) - 2];
      expect([c.getAttribute('r'), c.getAttribute('g'), c.getAttribute('b')].map(Number).map((v) => Math.round(v * 255))).toEqual([191, 255, 191]);
      expect(all(x, 'curve')).toHaveLength(0);
    }
  });

  it('writes a ring fill ChemDraw can\'t show as one (a shadow, a pattern) as a filled outline', () => {
    const doc = newDoc();
    doc.bulk(() => hexagon(doc));
    doc.edit('Fill', () => fillRings(doc, [], { shadow: true }));
    const { xml } = copied(doc);
    expect(all(xml, 'ColoredMolecularArea')).toHaveLength(0);
    expect(all(xml, 'curve').length).toBeGreaterThan(0);
  });

  it('keeps a structure\'s own drawing settings on each bond, through CDX too', () => {
    const doc = newDoc();
    doc.bulk(() => {
      const [a, b] = [doc.addAtom(0, 0), doc.addAtom(19.44, 0)];
      doc.addBond(a.id, b.id, 1, 'hashWedge', { s: 1.3 / ACS_1996.lineWidth, boldWidth: 2.92, hashSpacing: 1.8, marginWidth: 2.59, bondLength: 19.44 });
      const c = doc.addAtom(19.44 * 1.5, 11.22, 8, { label: 'OMe', marginWidth: 2.59 });
      doc.addBond(b.id, c.id);
    });
    for (const x of Object.values(copied(doc))) {
      const wedge = all(x, 'b').find((b) => b.getAttribute('Display') === 'WedgedHashBegin')!;
      expect(['LineWidth', 'BoldWidth', 'HashSpacing', 'MarginWidth', 'BondLength'].map((k) => Number(wedge.getAttribute(k)))).toEqual([1.3, 2.92, 1.8, 2.59, 19.44]);
      // a bond at the document's settings carries none of them
      const plain = all(x, 'b').find((b) => !b.getAttribute('Display'))!;
      expect(plain.hasAttribute('HashSpacing')).toBe(false);
      expect(Number(all(x, 'n').find((n) => n.querySelector('t'))!.getAttribute('MarginWidth'))).toBe(2.59);
    }
  });

  it('gives every bond its place in the stack, the bond behind a crossing lowest', () => {
    const doc = newDoc();
    let behind = 0, front = 0;
    doc.bulk(() => {
      hexagon(doc);
      // a gray bridge drawn after the ring but sent behind it, crossing one of the ring's bonds
      const p = doc.addAtom(-30, 10), q = doc.addAtom(30, 10);
      behind = doc.addBond(p.id, q.id, 1, 'solid', { color: '#808080', z: -1 }).id;
    });
    for (const b of doc.bonds.values()) if (b.id !== behind && doc.atoms.get(b.a1)!.y > 5 !== doc.atoms.get(b.a2)!.y > 5) front = b.id;
    const { xml } = copied(doc);
    const bonds = all(xml, 'b');
    expect(bonds.every((b) => b.hasAttribute('Z'))).toBe(true);
    const z = (id: number) => Number(bonds.find((b) => b.getAttribute('id') === String(id))!.getAttribute('Z'));
    expect(front).toBeGreaterThan(0);
    expect(z(behind)).toBeLessThan(z(front));
    expect(new Set(bonds.map((b) => b.getAttribute('Z'))).size).toBe(bonds.length);
  });

  it('writes a label that runs to the left right-justified, as ChemDraw 25 does (PCy3 shown Cy3P)', () => {
    const doc = newDoc();
    doc.bulk(() => {
      const ru = doc.addAtom(0, 0, 44, { label: 'Ru' });
      const p = doc.addAtom(-21.6, 0, 15, { label: 'PCy3', just: 'left' });
      doc.addBond(ru.id, p.id);
    });
    const { xml } = copied(doc);
    const t = all(xml, 'n').map((n) => n.querySelector(':scope > t')).find((t) => t?.textContent === 'PCy3')!;
    expect(t.getAttribute('LabelJustification')).toBe('Right');
    expect(t.getAttribute('Justification')).toBe('Right');
  });
});
