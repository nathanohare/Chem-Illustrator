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
import { tint } from '../src/colours';
import { readCdxml } from '../src/io/cdxml';
import { readFileSync } from 'node:fs';
import { crossingBonds, crossingGaps, crossingGapsCached } from '../src/chem/crossing';

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

  it('writes bold labels bold, with the formula bit, as the drawing and each label have them', () => {
    const doc = newDoc();
    doc.style = { ...doc.style, labelFace: 97 };
    doc.bulk(() => {
      const a = doc.addAtom(0, 0, 8, { label: 'OMe' }), b = doc.addAtom(21.6, 0);
      const c = doc.addAtom(43.2, 0, 7, { label: 'NMe2', face: 96 });
      doc.addBond(a.id, b.id); doc.addBond(b.id, c.id);
    });
    const { xml, cdx } = copied(doc);
    for (const x of [xml, cdx]) {
      expect(x.getAttribute('LabelFace')).toBe('97');
      const face = (text: string) => all(x, 'n').map((n) => n.querySelector(':scope > t')).filter((t) => t?.textContent === text).flatMap((t) => all(t!, 's').map((s) => Number(s.getAttribute('face'))));
      expect(face('OMe').every((f) => (f & 97) === 97)).toBe(true);
      expect(face('NMe2').every((f) => (f & 1) === 0)).toBe(true);
    }
  });

  it('gives ChemDraw back its own test drawing: ring fills, widths, bold labels, stacking', () => {
    const text = readFileSync('tests/fixtures/chemdraw-clipboard/clip-props.cd.cdxml', 'utf8');
    const want = parse(text);
    const { doc } = readCdxml(text);
    const { xml, cdx } = copied(doc);
    for (const x of [xml, cdx]) {
      // the two ring fills, each round its own ring of bonds, in ChemDraw's colours
      const rgb = (root: Element, e: Element) => { const c = all(root, 'color')[Number(e.getAttribute('bgcolor')) - 2]; return ['r', 'g', 'b'].map((k) => Math.round(Number(c.getAttribute(k)) * 255)).join(','); };
      expect(all(x, 'ColoredMolecularArea').map((e) => rgb(x, e)).sort()).toEqual(all(want, 'ColoredMolecularArea').map((e) => rgb(want, e)).sort());
      expect(all(x, 'ColoredMolecularArea').every((e) => e.getAttribute('BasisObjects')!.split(' ').length === 6)).toBe(true);
      // bold labels
      expect(Number(x.getAttribute('LabelFace')) & 1).toBe(1);
      // the gray bonds stay behind the black ones they cross
      // (not the bonds inside abbreviations: those stand for the label)
      const bonds = all(x, 'b').filter((b) => b.parentElement!.parentElement!.nodeName !== 'n');
      const gray = bonds.filter((b) => b.getAttribute('color')), black = bonds.filter((b) => !b.getAttribute('color'));
      expect(Math.max(...gray.map((b) => Number(b.getAttribute('Z'))))).toBeLessThan(Math.min(...black.map((b) => Number(b.getAttribute('Z')))));
    }
    // and reading the copy back gives the same ring fills
    const back = readCdxml(writeCdxml(extractDrawing(doc, null))).doc;
    expect([...back.shapes.values()].filter((s) => s.kind === 'ring' && s.ring?.length === 6)).toHaveLength(2);
  });

  it('lists the bonds ChemDraw said cross, near misses too, and centres Ru as ChemDraw does', () => {
    const text = readFileSync('tests/fixtures/chemdraw-clipboard/clip-props.cd.cdxml', 'utf8');
    const want = parse(text);
    const { doc } = readCdxml(text);
    // a bond named by where its ends are, so lists from two files compare
    const pairs = (root: Element) => {
      const at = new Map(all(root, 'n').map((n) => [n.getAttribute('id'), n.getAttribute('p')!.split(' ').map((v) => Math.round(Number(v)))]));
      const name = new Map(all(root, 'b').map((b) => [b.getAttribute('id'), [at.get(b.getAttribute('B')), at.get(b.getAttribute('E'))].map((p) => p!.join(',')).sort().join('-')]));
      const out = new Set<string>();
      for (const b of all(root, 'b')) for (const o of (b.getAttribute('CrossingBonds') ?? '').split(/\s+/).filter(Boolean)) out.add([name.get(b.getAttribute('id')), name.get(o)].sort().join(' x '));
      return [...out].sort();
    };
    expect(pairs(want).length).toBeGreaterThan(0);
    const { xml, cdx } = copied(doc);
    for (const x of [xml, cdx]) {
      expect(pairs(x)).toEqual(pairs(want));
      const ru = all(x, 'n').find((n) => n.getAttribute('Element') === '44')!.querySelector(':scope > t')!;
      for (const k of ['Justification', 'LabelJustification', 'LabelAlignment']) expect(ru.getAttribute(k)).toBe('Center');
      expect(Number(ru.getAttribute('p')!.split(' ')[0])).toBeCloseTo(420, 0);
    }
    // a near miss moved well away is no longer listed
    const listed = [...doc.bonds.values()].find((b) => b.crossing?.length)!;
    expect(listed).toBeDefined();
    doc.edit('Move', () => doc.moveAtoms(new Set([listed.a1, listed.a2]), 200, 200));
    const moved = parse(writeCdxml(extractDrawing(doc, null), { name: 'Clipboard.cdxml' }));
    expect(pairs(moved).length).toBeLessThan(pairs(want).length);
  });

  it('leaves the gap ChemDraw leaves at a near miss, on screen too', () => {
    const { doc } = readCdxml(readFileSync('tests/fixtures/chemdraw-clipboard/clip-props.cd.cdxml', 'utf8'));
    const half = doc.style.marginWidth + doc.style.lineWidth;
    // a bond with near misses and nothing crossing it outright
    const lone = [...doc.bonds.values()].filter((b) => b.crossing?.length && !crossingBonds(doc, b).length && crossingGaps(doc, b, half).length);
    expect(lone.length).toBeGreaterThan(0);
    for (const b of lone) expect(crossingGapsCached(doc, b, half)).toEqual(crossingGaps(doc, b, half));
  });

  it('writes highlights as ChemDraw\'s highlightColor, and reads them back the same', () => {
    const doc = newDoc();
    const L = doc.style.bondLength;
    const disc = { shape: 'round' as const, size: (0.27 * L + doc.style.lineWidth / 2) / (0.27 * L) };
    doc.edit('Draw', () => {
      const a = doc.addAtom(0, 0, 6, { highlight: '#ffd966', hl: disc });
      const b = doc.addAtom(L, 0);
      doc.addBond(a.id, b.id, 1, 'Solid', { highlight: '#9fc5e8', hl: disc });
    });
    const { xml, cdx } = copied(doc);
    const colourOf = (root: Element, i: string | null) => { const c = all(root, 'color')[Number(i) - 2]; return '#' + ['r', 'g', 'b'].map((k) => Math.round(Number(c.getAttribute(k)) * 255).toString(16).padStart(2, '0')).join(''); };
    expect(colourOf(xml, all(xml, 'n').find((n) => n.hasAttribute('highlightColor'))!.getAttribute('highlightColor'))).toBe('#ffd966');
    expect(colourOf(xml, all(xml, 'b').find((n) => n.hasAttribute('highlightColor'))!.getAttribute('highlightColor'))).toBe('#9fc5e8');
    // read back from the CDXML and from the CDX (where our hidden tags carry it)
    for (const x of [xml, cdx]) {
      const back = readCdxml(new XMLSerializer().serializeToString(x)).doc;
      const atom = [...back.atoms.values()].find((a) => a.highlight)!, bond = [...back.bonds.values()].find((b) => b.highlight)!;
      expect([atom.highlight, bond.highlight]).toEqual(['#ffd966', '#9fc5e8']);
      expect(atom.hl?.shape).toBe('round');
      expect(atom.hl?.size).toBeCloseTo(disc.size, 3);
    }
    // and a ChemDraw file with only highlightColor (no tags of ours) reads as the same disc
    const bare = new XMLSerializer().serializeToString(xml).replace(/<objecttag[^>]*Name="[^"]*[Hh]ighlight[^"]*"[^>]*\/>/g, '');
    const fromChemDraw = readCdxml(bare).doc;
    expect([...fromChemDraw.atoms.values()].find((a) => a.highlight)?.hl?.size).toBeCloseTo(disc.size, 3);
  });

  it('writes a box or circle filled with a pale tint of its own colour as ChemDraw\'s faded shape', () => {
    const doc = newDoc();
    doc.edit('Draw', () => {
      doc.addShape({ kind: 'oval', x1: 0, y1: 0, x2: 40, y2: 40, color: '#c00000', filled: true, fillColor: tint('#c00000', 0.8) });
      doc.addShape({ kind: 'rect', x1: 60, y1: 0, x2: 120, y2: 40, color: '#c00000', filled: true, fillColor: '#3366ff' });
    });
    const { xml, cdx } = copied(doc);
    for (const x of [xml, cdx]) {
      const oval = all(x, 'graphic').find((g) => g.getAttribute('GraphicType') === 'Oval')!;
      expect(oval.getAttribute('FadePercent')).toBe('200');
      expect(oval.getAttribute('OvalType') ?? '').not.toMatch(/Filled/);
      // a fill of another colour stays a filled box
      const rect = all(x, 'graphic').find((g) => g.getAttribute('GraphicType') === 'Rectangle')!;
      expect(rect.hasAttribute('FadePercent')).toBe(false);
      expect(rect.getAttribute('RectangleType')).toMatch(/Filled/);
      // read back: the same fill and outline
      const back = readCdxml(new XMLSerializer().serializeToString(x)).doc;
      const o = [...back.shapes.values()].find((s) => s.kind === 'oval')!;
      expect([o.filled, o.color, o.fillColor]).toEqual([true, '#c00000', tint('#c00000', 0.8)]);
    }
    // ChemDraw's own (no tag of ours) reads as the same tint, give or take rounding
    const bare = new XMLSerializer().serializeToString(xml).replace(/<objecttag[^>]*\/>/g, '');
    const o = [...readCdxml(bare).doc.shapes.values()].find((s) => s.kind === 'oval')!;
    expect(o.fillColor).toBe(tint('#c00000', 0.8));
  });

  it('writes a turned box (a diamond) with ChemDraw\'s middle and axis ends', () => {
    const doc = newDoc();
    doc.edit('Draw', () => { doc.addShape({ kind: 'rect', x1: 40, y1: 40, x2: 60, y2: 70, rot: 30 }); });
    const t = (30 * Math.PI) / 180;
    for (const x of Object.values(copied(doc))) {
      const g = all(x, 'graphic').find((e) => e.getAttribute('GraphicType') === 'Rectangle')!;
      const p = (k: string) => g.getAttribute(k)!.split(' ').map(Number);
      expect(p('Center3D').slice(0, 2)).toEqual([50, 55]);
      const maj = p('MajorAxisEnd3D'), min = p('MinorAxisEnd3D');
      expect(maj[0]).toBeCloseTo(50 + 10 * Math.cos(t), 1); expect(maj[1]).toBeCloseTo(55 + 10 * Math.sin(t), 1);
      expect(min[0]).toBeCloseTo(50 - 15 * Math.sin(t), 1); expect(min[1]).toBeCloseTo(55 + 15 * Math.cos(t), 1);
      // the box round its turned corners
      const [x1, y1, x2, y2] = p('BoundingBox');
      expect(x2 - x1).toBeCloseTo(2 * (10 * Math.cos(t) + 15 * Math.sin(t)), 1);
      expect(y2 - y1).toBeCloseTo(2 * (10 * Math.sin(t) + 15 * Math.cos(t)), 1);
    }
    // and read back, the same turned box
    for (const x of Object.values(copied(doc))) {
      const r = [...readCdxml(new XMLSerializer().serializeToString(x)).doc.shapes.values()].find((s) => s.kind === 'rect')!;
      expect(r.rot).toBeCloseTo(30, 1);
      expect([r.x1, r.y1, r.x2, r.y2].map((v) => +v.toFixed(1))).toEqual([40, 40, 60, 70]);
    }
    // an upright box has none of them
    const flat = newDoc();
    flat.edit('Draw', () => { flat.addShape({ kind: 'rect', x1: 40, y1: 40, x2: 60, y2: 70 }); });
    expect(all(copied(flat).xml, 'graphic')[0].hasAttribute('Center3D')).toBe(false);
  });

  it('writes a stray carbon from ChemDraw as a plain atom, with no CH4 label', () => {
    const doc = newDoc();
    doc.edit('Draw', () => { doc.addAtom(10, 10, 6, { bare: true }); doc.addAtom(60, 10); });
    for (const x of Object.values(copied(doc))) {
      const [bare, lone] = all(x, 'n');
      expect(bare.querySelector(':scope > t')).toBeNull();
      expect(bare.hasAttribute('NumHydrogens')).toBe(false);
      // (a lone carbon of our own still shows CH4)
      expect(lone.querySelector(':scope > t')?.textContent).toBe('CH4');
    }
  });
  it('writes a frame of its own width as the graphic\'s LineWidth, or BoldWidth when bold, and reads it back', () => {
    const doc = newDoc();
    doc.edit('Draw', () => {
      doc.addShape({ kind: 'rect', x1: 0, y1: 0, x2: 80, y2: 40, rounded: true, radius: 6, lineWidth: 1.44 });
      doc.addShape({ kind: 'line', x1: 0, y1: 60, x2: 80, y2: 60, bold: true, lineWidth: 3.6 });
      doc.addShape({ kind: 'oval', x1: 100, y1: 0, x2: 140, y2: 40 });
    });
    for (const x of Object.values(copied(doc))) {
      const [rect, line, oval] = ['Rectangle', 'Line', 'Oval'].map((k) => all(x, 'graphic').find((e) => e.getAttribute('GraphicType') === k)!);
      expect(Number(rect.getAttribute('LineWidth'))).toBeCloseTo(1.44, 2);
      expect(rect.hasAttribute('BoldWidth')).toBe(false);
      // (the corner in hundredths of the box's own width)
      expect(rect.getAttribute('CornerRadius')).toBe(String(Math.round((6 / 1.44) * 100)));
      expect(Number(line.getAttribute('BoldWidth'))).toBeCloseTo(3.6, 2);
      expect(line.hasAttribute('LineWidth')).toBe(false);
      expect(oval.hasAttribute('LineWidth') || oval.hasAttribute('BoldWidth')).toBe(false);
      const shapes = [...readCdxml(new XMLSerializer().serializeToString(x)).doc.shapes.values()];
      const r = shapes.find((s) => s.kind === 'rect')!, l = shapes.find((s) => s.kind === 'line')!, o = shapes.find((s) => s.kind === 'oval')!;
      expect(r.lineWidth).toBeCloseTo(1.44, 2);
      expect(r.radius).toBeCloseTo(6, 1);
      expect(l.lineWidth).toBeCloseTo(3.6, 2);
      expect(o.lineWidth).toBeUndefined();
    }
  });
  it('writes a turned picture with ChemDraw\'s RotationAngle, and a label\'s LabelDisplay as its justification', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const doc = newDoc();
    doc.edit('Insert', () => { doc.addShape({ kind: 'picture', x1: 0, y1: 0, x2: 40, y2: 20, src: png, px: { w: 1, h: 1 }, rot: -30 } as never); });
    for (const x of Object.values(copied(doc))) {
      const eo = all(x, 'embeddedobject')[0];
      expect(Number(eo.getAttribute('RotationAngle')) / 65536).toBeCloseTo(330, 3);
      expect(eo.getAttribute('BoundingBox')!.split(' ').map(Number)).toEqual([0, 0, 40, 20]);
      expect([...readCdxml(new XMLSerializer().serializeToString(x)).doc.shapes.values()][0].rot).toBeCloseTo(-30, 3);
    }
    // a ChemDraw label written with LabelDisplay: turned to run the other way, it says so too
    const file = '<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.40" LabelSize="10"><page id="1"><fragment id="2">'
      + '<n id="3" p="100 100" NodeType="Fragment" LabelDisplay="Left"><t id="4" p="96 103.9" LabelJustification="Right" LabelAlignment="Right" Justification="Right"><s font="3" size="10" face="96">MeO2C</s></t></n>'
      + '<n id="5" p="114.4 100"/><b id="6" B="3" E="5"/></fragment></page></CDXML>';
    const opened = readCdxml(file).doc;
    const me = [...opened.atoms.values()].find((a) => a.label)!;
    opened.edit('Flip', () => { opened.updateAtom(me.id, { just: me.just === 'left' ? 'right' : 'left' }); });
    const n = all(parse(writeCdxml(opened)), 'n').find((e) => e.getAttribute('id') === '3')!;
    const lj = n.getElementsByTagName('t')[0].getAttribute('LabelJustification');
    expect(n.getAttribute('LabelDisplay')).toBe(lj);
    expect([...readCdxml(writeCdxml(opened)).doc.atoms.values()].find((a) => a.label)!.just).toBe(opened.atoms.get(me.id)!.just);
  });
});
