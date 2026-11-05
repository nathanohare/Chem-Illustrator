// @vitest-environment jsdom
//
// The bond types of ChemDraw parity, read from CDXML. ChemDraw 25 keeps hollow wedges and variable
// attachments itself; it strips Order hydrogen and ionic, wavy wedges and Display2 Bold and Hash
// (tested in CDXML and CDX, 2026-11-03), so those come back from our tag while its words stand.

import { describe, it, expect } from 'vitest';
import { readCdxml, BOND_LOOK_TAG, RING_TAG } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { Doc, outsideValence } from '../src/model';

const read = (body: string) => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1"><page id="1">${body}</page></CDXML>`);
const bond = (attrs: string, tag = '') => read(`<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><b id="20" B="10" E="11" ${attrs}>${tag}</b></fragment>`).doc.bonds.get(20)!;
const look = (v: object) => `<objecttag TagType="String" Name="${BOND_LOOK_TAG}" Visible="no" Value="${JSON.stringify(v).replace(/"/g, '&quot;')}"/>`;

describe('the new bond types', () => {
  it('hollow and wavy wedges have their narrow end at a1', () => {
    for (const [word, display] of [['HollowWedge', 'hollowWedge'], ['WavyWedge', 'wavyWedge']] as const) {
      const begin = bond(`Display="${word}Begin"`), end = bond(`Display="${word}End"`);
      expect([begin.display, begin.a1]).toEqual([display, 10]);
      expect([end.display, end.a1]).toEqual([display, 11]);
    }
  });
  it('hydrogen and ionic are displays of order 1, outside valence, a1 the H or the + end', () => {
    for (const kind of ['hydrogen', 'ionic'] as const) {
      const b = bond(`Order="${kind}"`);
      expect([b.display, b.order, b.a1]).toEqual([kind, 1, 10]);
      expect(outsideValence(b)).toBe(true);
    }
  });
  it('come back from our tag beside what ChemDraw can draw, until ChemDraw changes that', () => {
    expect(bond('Display="Dash"', look({ display: 'hydrogen' })).display).toBe('hydrogen');
    expect(bond('Display="Dash"', look({ display: 'ionic' })).display).toBe('ionic');
    expect(bond('Display="Wavy"', look({ display: 'wavyWedge' })).display).toBe('wavyWedge');
    // restyled in ChemDraw: its look wins
    expect(bond('', look({ display: 'hydrogen' })).display).toBe('solid');
    expect(bond('Display="Bold"', look({ display: 'wavyWedge' })).display).toBe('bold');
    expect(bond('Order="2" Display="Dash"', look({ display: 'hydrogen' })).display).toBe('dash');
    // junk in a tag is ignored
    expect(bond('Display="Dash"', look({ display: 'solid' })).display).toBe('dash');
  });
});

describe("a double bond's second line", () => {
  it('reads from Display2 on an order 2 bond', () => {
    for (const [word, line2] of [['Dash', 'dash'], ['Bold', 'bold'], ['Hash', 'hash']] as const) {
      const b = bond(`Order="2" Display2="${word}"`);
      expect([b.order, b.line2]).toEqual([2, line2]);
    }
    expect(bond('Order="2"').line2).toBeUndefined();
  });
  it("stays ChemDraw's dashed aromatic bond at Order 1.5, unless our tag says it was a double bond before ChemDraw saved it", () => {
    const aromatic = bond('Order="1.5" Display2="Dash"');
    expect([aromatic.order, aromatic.line2]).toEqual([1.5, undefined]);
    const ours = bond('Order="1.5" Display2="Dash"', look({ line2: 'dash' }));
    expect([ours.order, ours.line2]).toEqual([2, 'dash']);
  });
  it('comes back from our tag on a plain double bond, until ChemDraw changes its order', () => {
    expect(bond('Order="2"', look({ line2: 'bold' })).line2).toBe('bold');
    expect(bond('Order="2"', look({ line2: 'hash' })).line2).toBe('hash');
    expect(bond('Order="3"', look({ line2: 'bold' })).line2).toBeUndefined();
  });
});

describe('the side of a double bond', () => {
  // ChemDraw 25's pictures, a bond in each of six headings: its Right is on the left of B to E as
  // drawn (y running down), and its Left on the right
  it('is read as ChemDraw draws it, and written back in its words', () => {
    expect(bond('Order="2" DoublePosition="Right"').dpos).toBe('left');
    expect(bond('Order="2" DoublePosition="Left"').dpos).toBe('right');
    expect(bond('Order="2" DoublePosition="Center"').dpos).toBe('center');
    const doc = new Doc();
    doc.edit('Draw', () => {
      const a = doc.addAtom(0, 0), b = doc.addAtom(30, 0), c = doc.addAtom(60, 0);
      doc.addBond(a.id, b.id, 2, 'solid', { dpos: 'left' });
      doc.addBond(b.id, c.id, 2, 'solid', { dpos: 'right' });
    });
    const xml = writeCdxml(doc);
    expect(xml.indexOf('DoublePosition="Right"')).toBeGreaterThan(-1);
    expect(xml.indexOf('DoublePosition="Right"')).toBeLessThan(xml.indexOf('DoublePosition="Left"'));
  });
  it('keeps its side when a reversed wedge swaps the bond\'s ends', () => {
    const b = bond('Order="2" Display="WedgeEnd" DoublePosition="Right"');
    expect([b.a1, b.dpos]).toEqual([11, 'right']);
  });
});

describe('a variable attachment', () => {
  const R = 30, hex = Array.from({ length: 6 }, (_, k) => [100 + R * Math.cos((k * Math.PI) / 3), 100 + R * Math.sin((k * Math.PI) / 3)]);
  const ring = hex.map(([x, y], k) => `<n id="${10 + k}" p="${x} ${y}"/>`).join('') + hex.map((_, k) => `<b id="${30 + k}" B="${10 + k}" E="${10 + (k + 1) % 6}"/>`).join('');
  const frag = (node: string, tag = '') => read(`<fragment id="2">${ring}<n id="40" ${node} NodeType="VariableAttachment">${tag}</n><n id="41" p="180 100"/><b id="42" B="40" E="41"/></fragment>`);
  const midpoint = `p="${(hex[0][0] + hex[1][0]) / 2} ${(hex[0][1] + hex[1][1]) / 2}"`;
  it('on the whole ring sits in its middle, with no warning', () => {
    const { doc, stats } = frag('p="100 100" Attachments="10 11 12 13 14 15"');
    const a = doc.atoms.get(40)!;
    expect(a.variable).toBe(true);
    expect(a.multi).toHaveLength(6);
    expect(a.ringOf).toHaveLength(6);
    expect(a.x).toBeCloseTo(100, 6);
    expect(stats.skipped).toEqual({});
  });
  it('on some of a ring stays where the file has it: the middle of those atoms, or of the ring', () => {
    expect(frag(`${midpoint} Attachments="10 11"`).doc.atoms.get(40)!.ringOf).toBeUndefined();
    const atRingMiddle = frag('p="100 100" Attachments="10 11 12"').doc.atoms.get(40)!;
    expect(atRingMiddle.ringOf).toHaveLength(6);
    expect(atRingMiddle.x).toBeCloseTo(100, 6);
  });
  it("anywhere else goes to the ring's middle, and says so", () => {
    const { doc, stats } = frag('p="120 120" Attachments="10 11 12"');
    expect(doc.atoms.get(40)!.x).toBeCloseTo(100, 6);
    expect(stats.skipped['variable attachment moved to the middle of its atoms']).toBe(1);
  });
  it('takes its ring from our tag while its atoms are the ones written beside it', () => {
    const tag = (seen: string) => `<objecttag TagType="String" Name="${RING_TAG}" Visible="no" Value="${JSON.stringify({ ring: [10, 11, 12, 13, 14, 15], seen: { attachments: seen } }).replace(/"/g, '&quot;')}"/>`;
    expect(frag('p="100 100" Attachments="10 11"', tag('10 11')).doc.atoms.get(40)!.ringOf).toHaveLength(6);
    // atoms changed in ChemDraw: where the file has it decides
    expect(frag(`${midpoint} Attachments="10 11"`, tag('10 11 12')).doc.atoms.get(40)!.ringOf).toBeUndefined();
  });
  it('and a multicentre point stays one', () => {
    const { doc } = read(`<fragment id="2">${ring}<n id="40" p="100 100" NodeType="MultiAttachment" Attachments="10 11 12 13 14 15"/></fragment>`);
    expect(doc.atoms.get(40)!.variable).toBeUndefined();
    expect(doc.atoms.get(40)!.multi).toHaveLength(6);
  });
});
