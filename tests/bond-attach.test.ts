// @vitest-environment jsdom
//
// ChemDraw's BeginAttach and EndAttach: which character of a label a bond meets, counted from 0
// in the label text (0 or none is the default). A bond to the O of "PhO" runs straight into the O
// rather than slanting to the P on the atom, and the indices go with their atoms when the bond is
// flipped. (Reading and writing the attributes is done in the CDXML reader and writer.)

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { Renderer, withMeasure } from '../src/render/renderer';
import { arialWidth } from '../src/text-metrics';
import { Doc } from '../src/model';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;
const measure = (t: string, s: number) => arialWidth(t, s);

// "PhO" left-justified on node 1 (its P on the atom), a bond from it up and right to carbon 2
const file = (attrs: string) => '<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.40" LabelSize="10"><page id="9"><fragment id="8">'
  + '<n id="1" p="100 100" NodeType="Fragment"><t p="97 103.6" LabelJustification="Left" LabelAlignment="Left"><s font="3" size="10" face="96">PhO</s></t></n>'
  + `<n id="2" p="120 90"/><b id="3" ${attrs}/></fragment></page></CDXML>`;

const bondOf = (doc: Doc) => [...doc.bonds.values()][0];
const phoOf = (doc: Doc) => [...doc.atoms.values()].find((a) => a.label === 'PhO')!;
const attrsOf = (out: string) => {
  const dom = new DOMParser().parseFromString(out.replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml');
  // (the last: a label's own structure, written inside its node, comes first)
  const bs = dom.getElementsByTagName('b'), b = bs[bs.length - 1];
  return { B: b.getAttribute('B'), E: b.getAttribute('E'), begin: b.getAttribute('BeginAttach'), end: b.getAttribute('EndAttach') };
};

describe('BeginAttach and EndAttach', () => {
  it('aim the bond at the middle of that character', () => withMeasure(measure, () => {
    const doc = readCdxml(file('B="1" E="2"')).doc;
    doc.edit('Attach', () => doc.updateBond(bondOf(doc).id, { beginAttach: 2 }));
    const r = new Renderer(noCanvas, noCanvas);
    const p = phoOf(doc), q = doc.atoms.get(bondOf(doc).a2)!;
    // P is centred on the atom, so the O's middle is past the P and the h
    const o = r.attachPoint(doc, p, 2);
    expect(o.x).toBeCloseTo(p.x - measure('P', 10) / 2 + measure('Ph', 10) + measure('O', 10) / 2, 6);
    // (on the line of the label: the middle of its capitals is level with the atom)
    expect(o.y).toBeCloseTo(p.y, 6);
    // the bond runs on the line from there to the carbon, starting clear of the label
    const [s, e] = r.bondEnds(doc, p, q);
    expect(e.x).toBeCloseTo(q.x, 6);
    expect(e.y).toBeCloseTo(q.y, 6);
    const cross = (s.x - o.x) * (q.y - o.y) - (s.y - o.y) * (q.x - o.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
    expect(s.x).toBeGreaterThan(o.x);
    // the same bond with no index starts from the P
    doc.edit('Clear', () => doc.updateBond(bondOf(doc).id, { beginAttach: undefined }));
    const [s0] = r.bondEnds(doc, p, q);
    const cross0 = (s0.x - p.x) * (q.y - p.y) - (s0.y - p.y) * (q.x - p.x);
    expect(Math.abs(cross0)).toBeLessThan(1e-6);
    expect(s0.x).toBeLessThan(s.x);
  }));

  it('mean the atom itself when 0 or not a character of the label', () => withMeasure(measure, () => {
    const doc = readCdxml(file('B="1" E="2"')).doc;
    doc.edit('Attach', () => doc.updateBond(bondOf(doc).id, { beginAttach: 2 }));
    const r = new Renderer(noCanvas, noCanvas);
    const p = phoOf(doc);
    for (const i of [0, 3, 12, undefined]) expect(r.attachPoint(doc, p, i)).toBe(p);
  }));

  it('go with their atoms when the bond is turned round, and are dropped for a new atom', () => {
    const doc = readCdxml(file('B="1" E="2"')).doc;
    doc.edit('Attach', () => doc.updateBond(bondOf(doc).id, { beginAttach: 2 }));
    const b = bondOf(doc);
    doc.edit('Flip', () => doc.updateBond(b.id, { a1: b.a2, a2: b.a1 }));
    expect(bondOf(doc).beginAttach).toBeUndefined();
    expect(bondOf(doc).endAttach).toBe(2);
    const c = doc.atoms.get(b.a2)!;
    let n = 0;
    doc.edit('Move end', () => { n = doc.addAtom(c.x, c.y + 20, 6).id; doc.updateBond(b.id, { a2: n }); });
    expect(bondOf(doc).endAttach).toBeUndefined();
  });

  it('are dropped when the label is retyped, and come back with it on undo', () => {
    const doc = readCdxml(file('B="1" E="2"')).doc;
    doc.edit('Attach', () => doc.updateBond(bondOf(doc).id, { beginAttach: 2 }));
    const p = phoOf(doc);
    doc.edit('Same', () => doc.updateAtom(p.id, { label: 'PhO' }));
    expect(bondOf(doc).beginAttach).toBe(2);
    doc.edit('Retype', () => doc.updateAtom(p.id, { label: 'OH' }));
    expect(bondOf(doc).beginAttach).toBeUndefined();
    doc.undo();
    expect(bondOf(doc).beginAttach).toBe(2);
  });
});
