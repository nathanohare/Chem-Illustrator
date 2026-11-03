// @vitest-environment jsdom
//
// Saving keeps what it doesn't need to change, and what it saves comes back from CDX and from
// ChemDraw: groups whose ids clash with other objects, the print record of an unchanged page,
// repeat groups listed in another order, bond orders and looks we don't draw, dotted lines, a
// design shape's saved box, and tag values outside Windows-1252 (CDXML audit R10, R15, R25, R39,
// E6 and E7).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml, encodeTagValue, GEO_TAG } from '../src/io/cdxml';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';
import { bracketsAround } from '../src/objects';
import { ACS_1996 } from '../src/style';

const parse = (t: string) => new DOMParser().parseFromString(t.replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml').documentElement;
const all = (e: Element, name: string) => Array.from(e.getElementsByTagName(name));
const viaCdx = (xml: string) => cdxToCdxml(cdxmlToCdx(xml));
const newDoc = () => { const d = new Doc(); d.style = { ...ACS_1996 }; return d; };
const file = (body: string, root = '') => `<?xml version="1.0" encoding="UTF-8" ?><CDXML CreationProgram="ChemDraw 25.0.2.14" BondLength="14.40"${root}><page id="1" BoundingBox="0 0 540 720" HeightPages="1" WidthPages="1">${body}</page></CDXML>`;

describe('saving keeps what it need not change', () => {
  it('groups things whose ids are the same as other kinds of thing (R10)', () => {
    const doc = newDoc();
    doc.edit('Draw', () => {
      const a = doc.addAtom(0, 0, 6, { id: 1 } as never), b = doc.addAtom(14.4, 0, 6, { id: 2 } as never);
      doc.addBond(a.id, b.id);
      doc.addCaption({ id: 3, x: 0, y: 30, runs: [{ text: 'x' }], grp: 1 } as never);
    });
    doc.edit('Group', () => {
      for (const a of doc.atoms.values()) doc.updateAtom(a.id, { grp: 1 });
      for (const c of doc.captions.values()) doc.updateCaption(c.id, { grp: 1 });
    });
    const xml = writeCdxml(doc);
    const back = readCdxml(xml).doc;
    const grps = new Set([...back.atoms.values(), ...back.captions.values()].map((e) => e.grp));
    expect(grps.size).toBe(1);
    expect([...grps][0]).toBeDefined();
  });

  it('keeps the file\'s own print record while its page is the size it was (R15)', () => {
    // a scaled page setup: the margins and the record don't add up to the page
    const pi = '00030000004800480000000002DE0240FFEEFFEE030602520367052803FC00020000004800480000000002DE0240000100000064000000010001010100000001270F000100010000000000000000000000000002001901900000000000600000000000000000000100000000000000000000000000000000';
    const doc = readCdxml(file('<fragment id="2"><n id="3" p="100 100"/></fragment>', ` PrintMargins="10 10 10 10" MacPrintInfo="${pi}"`)).doc;
    doc.edit('move', () => doc.moveAtoms(new Set([...doc.atoms.keys()]), 5, 0));
    const out = parse(writeCdxml(doc));
    expect(out.getAttribute('MacPrintInfo')).toBe(pi);
    expect(out.getAttribute('PrintMargins')).toBe('10 10 10 10');
  });

  it('leaves a repeat group as the file has it when only its order differs (R25)', () => {
    const doc = newDoc();
    doc.edit('d', () => {
      const a = [0, 1, 2, 3].map((i) => doc.addAtom(312 + i * 12.47, i % 2 ? 92.8 : 100));
      for (let i = 0; i < 3; i++) doc.addBond(a[i].id, a[i + 1].id, 1);
      const [l, r] = bracketsAround({ x1: 318, y1: 84, x2: 343, y2: 108 }, 'square');
      doc.addShape(l);
      doc.addShape({ ...r, repeat: 'n' });
    });
    // as ChemDraw might list it: the closing bracket first, the atoms the other way round, and a
    // setting of its own
    const x = parse(writeCdxml(doc));
    const grp = all(x, 'bracketedgroup')[0];
    const atts = all(grp, 'bracketattachment');
    grp.insertBefore(atts[1], atts[0]);
    grp.setAttribute('BracketedObjectIDs', grp.getAttribute('BracketedObjectIDs')!.split(' ').reverse().join(' '));
    grp.setAttribute('RepeatPattern', 'HeadToTail');
    const back = readCdxml(new XMLSerializer().serializeToString(x)).doc;
    const end = [...back.atoms.values()][0];
    back.edit('Color', () => back.updateAtom(end.id, { color: '#c00000' }));
    const g2 = all(parse(writeCdxml(back)), 'bracketedgroup');
    expect(g2).toHaveLength(1);
    expect(g2[0].getAttribute('RepeatPattern')).toBe('HeadToTail');
  });

  it('keeps bond orders and looks we don\'t draw when only the colour changes (R39)', () => {
    const doc = readCdxml(file('<fragment id="2"><n id="3" p="100 100"/><n id="4" p="114.4 100"/><n id="5" p="128.8 100"/><n id="6" p="143.2 100"/>'
      + '<b id="7" B="3" E="4" Order="2.5"/><b id="8" B="4" E="5" Display="HollowWedgeBegin"/><b id="9" B="5" E="6" Order="2" Display2="Dash"/></fragment>')).doc;
    doc.edit('Color', () => { for (const b of doc.bonds.values()) doc.updateBond(b.id, { color: '#c00000' }); });
    const bs = all(parse(writeCdxml(doc)), 'b');
    const by = (id: string) => bs.find((b) => b.getAttribute('id') === id)!;
    expect(by('7').getAttribute('Order')).toBe('2.5');
    expect(by('8').getAttribute('Display')).toBe('HollowWedgeBegin');
    expect(by('9').getAttribute('Order')).toBe('2');
    expect(by('9').getAttribute('Display2')).toBe('Dash');
    for (const b of bs) expect(b.hasAttribute('color')).toBe(true);
    // a changed order is written afresh
    const one = [...doc.bonds.values()][0];
    doc.edit('Order', () => doc.updateBond(one.id, { order: 3 }));
    expect(all(parse(writeCdxml(doc)), 'b').find((b) => b.getAttribute('id') === '7')!.getAttribute('Order')).toBe('3');
  });
});

describe('what is saved comes back from CDX and ChemDraw', () => {
  it('keeps a dotted line dotted (E6), and reads the attribute of older files', () => {
    const doc = newDoc();
    doc.edit('Draw', () => { doc.addShape({ kind: 'line', x1: 0, y1: 0, x2: 60, y2: 0, dotted: true }); });
    const xml = writeCdxml(doc);
    expect(xml).not.toContain('ChemIllustratorDotted');
    for (const t of [xml, viaCdx(xml)]) {
      const s = [...readCdxml(t).doc.shapes.values()][0];
      expect(s.dotted).toBe(true);
      expect(s.dashed).toBe(true);
    }
    const old = file('<graphic id="2" BoundingBox="0 0 60 0" GraphicType="Line" LineType="Dashed" ChemIllustratorDotted="yes"/>');
    expect([...readCdxml(old).doc.shapes.values()][0].dotted).toBe(true);
  });

  it('keeps a design shape\'s saved box in its tag, so a move in ChemDraw still moves it (E6)', () => {
    const doc = newDoc();
    doc.edit('Draw', () => { doc.addShape({ kind: 'geo', geo: 'fcDecision', x1: 0, y1: 0, x2: 100, y2: 60 } as never); });
    const xml = writeCdxml(doc);
    expect(xml).not.toContain('ChemIllustratorBox');
    const x = parse(viaCdx(xml));
    const g = all(x, 'group').find((e) => all(e, 'objecttag').some((t) => t.getAttribute('Name') === GEO_TAG))!;
    // moved 20 pt right in ChemDraw: it rewrites the group's box
    const bb = g.getAttribute('BoundingBox')!.split(' ').map(Number);
    g.setAttribute('BoundingBox', [bb[0] + 20, bb[1], bb[2] + 20, bb[3]].join(' '));
    const s = [...readCdxml(new XMLSerializer().serializeToString(x)).doc.shapes.values()].find((v) => v.kind === 'geo')!;
    expect(s.x1).toBeCloseTo(20, 1);
    expect((s as unknown as Record<string, unknown>).savedBox).toBeUndefined();
  });

  it('keeps tag values outside Windows-1252 through CDX (E7), and reads older raw values', () => {
    const alt = 'α-helix → β ≥ 5 µM 😀';
    const doc = newDoc();
    doc.edit('Draw', () => { const a = doc.addAtom(0, 0); const b = doc.addAtom(14.4, 0); doc.addBond(a.id, b.id); doc.updateAtom(a.id, { alt }); });
    const xml = writeCdxml(doc);
    // (ASCII only in the file)
    expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(xml.slice(xml.indexOf('Chem Illustrator alt')))).toBe(false);
    for (const t of [xml, viaCdx(xml)]) expect([...readCdxml(t).doc.atoms.values()].find((a) => a.alt)?.alt).toBe(alt);
    // a value that starts with a quote comes back as it was
    expect(encodeTagValue('"quoted"')).not.toBe('"quoted"');
    const q = newDoc();
    q.edit('Draw', () => { const a = q.addAtom(0, 0); q.updateAtom(a.id, { alt: '"quoted"' }); });
    expect([...readCdxml(writeCdxml(q)).doc.atoms.values()][0].alt).toBe('"quoted"');
    // plain ASCII is saved as it is, and an older file's raw value reads as it is
    expect(encodeTagValue('plain text')).toBe('plain text');
    const old = file('<fragment id="2"><n id="3" p="100 100"><objecttag TagType="String" Name="Chem Illustrator alt text" Value="café" Visible="no"/></n></fragment>');
    expect([...readCdxml(old).doc.atoms.values()][0].alt).toBe('café');
  });

  it('writes an opened file\'s tags the same way when saved again', () => {
    const doc = newDoc();
    doc.edit('Draw', () => { const a = doc.addAtom(0, 0); doc.updateAtom(a.id, { alt: 'ΔG‡' }); doc.addAtom(30, 0); });
    const back = readCdxml(writeCdxml(doc)).doc;
    back.edit('move', () => back.moveAtoms(new Set([[...back.atoms.keys()][1]]), 5, 0));
    const again = writeCdxml(back);
    for (const t of [again, viaCdx(again)]) expect([...readCdxml(t).doc.atoms.values()].find((a) => a.alt)?.alt).toBe('ΔG‡');
  });
});
