// @vitest-environment jsdom
//
// Saving keeps what it doesn't need to change, and what it saves comes back from CDX and from
// ChemDraw: groups whose ids clash with other objects, the print record of an unchanged page,
// repeat groups listed in another order, bond orders and looks we don't draw, dotted lines, a
// design shape's saved box, tag values outside Windows-1252, ChemDraw's calculated properties and
// brackets that lose what they point at, and equations (CDXML audit R10, R15, R25, R39, E6, E7, R14
// and E8).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml, encodeTagValue, GEO_TAG } from '../src/io/cdxml';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';
import { bracketsAround } from '../src/objects';
import { ACS_1996 } from '../src/style';
import { parseGuides } from '../src/editor/guides';

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

describe('ChemDraw\'s links to what is gone, and pictures ChemDraw can\'t hold', () => {
  it('drops a calculated property whose text is gone, and trims its structure to what is left (R14)', () => {
    const body = '<fragment id="2"><n id="3" p="100 100"/><n id="4" p="114.4 100"/><b id="5" B="3" E="4"/></fragment>'
      + '<fragment id="12"><n id="13" p="200 100"/><n id="14" p="214.4 100"/><b id="15" B="13" E="14"/></fragment>'
      + '<t id="6" p="100 120"><s font="3" size="10" face="0">C2H6</s></t><t id="16" p="200 120"><s font="3" size="10" face="0">C2H6</s></t>'
      + '<chemicalproperty id="7" ChemicalPropertyDisplayID="6" ChemicalPropertyIsActive="yes" BasisObjects="2" ChemicalPropertyType="ChemicalName"/>'
      + '<chemicalproperty id="17" ChemicalPropertyDisplayID="16" ChemicalPropertyIsActive="yes" BasisObjects="12 13 14" ChemicalPropertyType="ChemicalName"/>';
    const doc = readCdxml(file(body)).doc;
    // the first one's text deleted, and one atom of the second structure
    const cap = [...doc.captions.values()].find((c) => c.x < 150)!;
    const atom = [...doc.atoms.values()].find((a) => a.x > 210)!;
    doc.edit('Delete', () => { doc.removeCaption(cap.id); doc.removeAtom(atom.id); });
    const ps = all(parse(writeCdxml(doc)), 'chemicalproperty');
    expect(ps.map((p) => p.getAttribute('id'))).toEqual(['17']);
    expect(ps[0].getAttribute('BasisObjects')).toBe('12 13');
  });

  it('drops a bracket\'s attachment when the bracket is gone (R14)', () => {
    const body = '<fragment id="2"><n id="3" p="100 100"/><n id="4" p="114.4 100"/><b id="5" B="3" E="4"/></fragment>'
      + '<graphic id="8" BoundingBox="95 90 95 110" GraphicType="Bracket" BracketType="Square"/><graphic id="9" BoundingBox="120 110 120 90" GraphicType="Bracket" BracketType="Square"/>'
      + '<bracketedgroup id="10" BracketedObjectIDs="3 4"><bracketattachment id="11" GraphicID="8"/><bracketattachment id="12" GraphicID="9"/></bracketedgroup>';
    const doc = readCdxml(file(body)).doc;
    const br = [...doc.shapes.values()].find((s) => s.kind === 'bracket' && Math.min(s.x1, s.x2) > 110)!;
    doc.edit('Delete', () => doc.removeShape(br.id));
    const g = all(parse(writeCdxml(doc)), 'bracketedgroup');
    expect(g).toHaveLength(1);
    expect(all(g[0], 'bracketattachment').map((a) => a.getAttribute('GraphicID'))).toEqual(['8']);
  });

  it('gives ChemDraw a PNG of an equation, with the equation in its tag (E8)', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>');
    const doc = newDoc();
    doc.edit('Insert', () => { doc.addShape({ kind: 'picture', x1: 0, y1: 0, x2: 72, y2: 36, src: svg, px: { w: 10, h: 10 }, math: { tex: 'E=mc^2', size: 12 } } as never); });
    const asked: number[][] = [];
    const raster = (src: string, w: number, h: number) => { asked.push([w, h]); return src === svg ? png : null; };
    const xml = writeCdxml(doc, { raster });
    const eo = all(parse(xml), 'embeddedobject');
    expect(eo).toHaveLength(1);
    expect(eo[0].getAttribute('PNG')).toMatch(/^89504E47/);
    // at about 300 dpi
    expect(asked[0][0]).toBeCloseTo(300, 0);
    for (const t of [xml, viaCdx(xml)]) expect([...readCdxml(t).doc.shapes.values()][0].math?.tex).toBe('E=mc^2');
    // our own clipboard keeps the SVG itself
    const own = all(parse(writeCdxml(doc, { raster, own: true })), 'embeddedobject')[0];
    expect(own.getAttribute('ChemIllustratorPicture')).toBe(svg);
    expect([...readCdxml(writeCdxml(doc, { raster, own: true })).doc.shapes.values()][0].src).toBe(svg);
    // not drawn yet: left out, as before
    expect(all(parse(writeCdxml(doc, { raster: () => null })), 'embeddedobject')).toHaveLength(0);
  });
});

describe('groups inside groups (R1)', () => {
  it('leaves a ChemDraw group of groups as it was when saved again', () => {
    const t = (id: number, x: number, s: string) => `<t id="${id}" p="${x} 100" BoundingBox="${x} 92 ${x + 10} 100"><s font="3" size="10" face="0">${s}</s></t>`;
    const body = `<group id="30">${t(10, 0, 'a')}<group id="37">${t(11, 20, 'b')}${t(12, 40, 'c')}</group></group>`
      + '<fragment id="2"><n id="3" p="100 150"/><n id="4" p="114.4 150"/><b id="5" B="3" E="4"/></fragment>';
    const doc = readCdxml(file(body)).doc;
    const grps = new Set([...doc.captions.values()].map((c) => c.grp));
    expect(grps.size).toBe(1);
    // an edit elsewhere
    doc.edit('Move', () => doc.moveAtoms(new Set([...doc.atoms.keys()]), 5, 0));
    const x = parse(writeCdxml(doc));
    const outer = all(x, 'group').find((g) => g.getAttribute('id') === '30')!;
    const inner = all(outer, 'group').find((g) => g.getAttribute('id') === '37')!;
    expect(inner).toBeDefined();
    expect(all(inner, 't').map((e) => e.getAttribute('id'))).toEqual(['11', '12']);
    expect(all(x, 'group')).toHaveLength(2);
    // taken out of the group here: it leaves both
    const b = [...doc.captions.values()].find((c) => c.runs[0].text === 'b')!;
    doc.edit('Ungroup', () => doc.updateCaption(b.id, { grp: undefined }));
    const y = parse(writeCdxml(doc));
    const tb = all(y, 't').find((e) => e.getAttribute('id') === '11')!;
    expect(tb.parentElement!.nodeName).toBe('page');
  });
});

describe('our page and step tags where ChemDraw keeps them (E10)', () => {
  /** What a ChemDraw re-save does to them: tags on the page and on steps are dropped. */
  const resaved = (xml: string): string => {
    const x = parse(xml);
    for (const e of [...all(x, 'page'), ...all(x, 'step')]) for (const k of [...e.children]) if (k.nodeName === 'objecttag') e.removeChild(k);
    return new XMLSerializer().serializeToString(x);
  };

  it('keeps the guides and a cycle step\'s names through a ChemDraw re-save', () => {
    const doc = newDoc();
    let arrowId = 0, capId = 0;
    doc.edit('Draw', () => {
      const a = doc.addAtom(0, 0), b = doc.addAtom(14.4, 0); doc.addBond(a.id, b.id);
      const c = doc.addAtom(120, 0), d = doc.addAtom(134.4, 0); doc.addBond(c.id, d.id);
      capId = doc.addCaption({ x: 60, y: 20, runs: [{ text: 'step 1' }] } as never).id;
      arrowId = doc.addArrow({ tail: { x: 30, y: 0 }, head: { x: 100, y: 0 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
        step: { reactants: ['a' + a.id], products: ['a' + c.id], above: [], below: [], inside: ['c' + capId], manual: true } } as never).id;
    });
    doc.guides = parseGuides('{"list":[{"kind":"v","x":50}],"grid":true}');
    const xml = writeCdxml(doc);
    const x = parse(xml);
    // nothing of ours left on the page itself or on the step
    for (const e of [...all(x, 'page'), ...all(x, 'step')]) expect([...e.children].some((k) => k.nodeName === 'objecttag')).toBe(false);
    expect(all(x, 'arrow')[0].getElementsByTagName('objecttag')[0]?.getAttribute('Name')).toBe('Chem Illustrator inside');
    for (const t of [resaved(xml), resaved(viaCdx(xml))]) {
      const back = readCdxml(t).doc;
      expect(back.guides?.list).toHaveLength(1);
      const r = [...back.arrows.values()][0];
      expect(r.step?.inside).toHaveLength(1);
      expect(back.captions.has(Number(r.step!.inside![0].slice(1)))).toBe(true);
    }
    // our own file, opened and saved again untouched, comes back the same
    expect(writeCdxml(readCdxml(xml).doc)).toBe(xml);
  });

  it('still reads the tags older files keep on the page', () => {
    const old = file('<objecttag TagType="String" Name="Chem Illustrator guides" Value="{&quot;list&quot;:[{&quot;kind&quot;:&quot;h&quot;,&quot;y&quot;:40}],&quot;grid&quot;:false}" Visible="no"/><fragment id="2"><n id="3" p="100 100"/></fragment>');
    expect(readCdxml(old).doc.guides?.list).toHaveLength(1);
  });
});

describe('the CDXML audit, writing side (2)', () => {
  it('R1: a group rebuilt after an edit keeps the groups inside it', () => {
    const t = (id: number, x: number, s: string) => `<t id="${id}" p="${x} 100" BoundingBox="${x} 92 ${x + 10} 100"><s font="3" size="10" face="0">${s}</s></t>`;
    const body = `<group id="30">${t(10, 0, 'a')}<group id="37">${t(11, 20, 'b')}${t(12, 40, 'c')}</group></group>${t(13, 80, 'd')}`;
    const doc = readCdxml(file(body)).doc;
    const by = (s: string) => [...doc.captions.values()].find((c) => c.runs[0].text === s)!;
    const g = by('a').grp;
    // d joins the group: the group is written again, with b and c still in a group of their own
    doc.edit('Group', () => doc.updateCaption(by('d').id, { grp: g }));
    const x = parse(writeCdxml(doc));
    const groups = all(x, 'group');
    expect(groups).toHaveLength(2);
    const outer = groups.find((e) => e.parentElement!.nodeName === 'page')!;
    const inner = groups.find((e) => e !== outer)!;
    expect(inner.parentElement).toBe(outer);
    expect(all(inner, 't').map((e) => e.textContent)).toEqual(['b', 'c']);
    expect(all(outer, 't').map((e) => e.textContent).sort()).toEqual(['a', 'b', 'c', 'd']);
    // and read back the same
    const back = readCdxml(new XMLSerializer().serializeToString(x)).doc;
    const bb = [...back.captions.values()].find((c) => c.runs[0].text === 'b')!;
    expect(bb.grpPath).toHaveLength(2);
  });

  it('R3: a closed ChemDraw curve is written back as a closed curve, moved with its shape', () => {
    const pts = '10 10 0 10 0 20 0 30 10 30 20 30 20 20 20 10 10 10';
    const body = `<fragment id="2"><n id="3" p="100 150"/><n id="4" p="114.4 150"/><b id="5" B="3" E="4"/></fragment><curve id="30" CurveType="1" Closed="yes" CurvePoints="${pts}"/>`;
    const doc = readCdxml(file(body)).doc;
    const s = doc.shapes.get(30)!;
    expect(s.geo!.startsWith('path:')).toBe(true);
    // unchanged: written as it was
    const same = all(parse(writeCdxml(doc)), 'curve');
    expect(same).toHaveLength(1);
    expect(same[0].getAttribute('CurvePoints')).toBe(pts);
    // made dashed: written again as a closed curve with the same points
    doc.edit('Dash', () => doc.updateShape(30, { dashed: true }));
    const c = all(parse(writeCdxml(doc)), 'curve');
    expect(c).toHaveLength(1);
    expect(all(parse(writeCdxml(doc)), 'group')).toHaveLength(0);
    expect(Number(c[0].getAttribute('CurveType')) & 3).toBe(3);
    expect(c[0].getAttribute('Closed')).toBe('yes');
    expect(c[0].getAttribute('CurvePoints')!.split(' ').map(Number)).toEqual(pts.split(' ').map(Number));
    const back = readCdxml(viaCdx(writeCdxml(doc))).doc;
    const bs = [...back.shapes.values()].find((x) => x.geo?.startsWith('path:'))!;
    expect(bs.geo).toBe(s.geo);
    expect(bs.dashed).toBe(true);
  });

  it('R3: a new drawing with a closed curve shape writes a ChemDraw curve, not a design group', () => {
    const doc = readCdxml(file('<curve id="30" CurveType="1" Closed="yes" CurvePoints="10 10 0 10 0 20 0 30 10 30 20 30 20 20 20 10 10 10"/>')).doc;
    const fresh = newDoc();
    const s = doc.shapes.get(30)!;
    const { id: _id, ...rest } = s;
    fresh.edit('Paste', () => { fresh.addShape(rest); });
    const x = parse(writeCdxml(fresh));
    expect(all(x, 'curve')).toHaveLength(1);
    expect(all(x, 'group')).toHaveLength(0);
  });

  it('writes our dashed aromatic bond as ChemDraw\'s (Order 2, Display2 Dash), and its one-line and ring-circle ones as 1.5', () => {
    const doc = newDoc();
    doc.edit('Draw', () => {
      const a = doc.addAtom(0, 0, 6), b = doc.addAtom(14.4, 0, 6), c = doc.addAtom(28.8, 0, 6), d = doc.addAtom(43.2, 0, 6);
      doc.addBond(a.id, b.id, 1.5);
      doc.addBond(b.id, c.id, 1.5, 'solid', { plain: true });
      doc.addBond(c.id, d.id, 1.5, 'solid', { circle: true });
    });
    const bonds = all(parse(writeCdxml(doc)), 'b');
    expect(bonds.map((e) => [e.getAttribute('Order'), e.getAttribute('Display2')])).toEqual([['2', 'Dash'], ['1.5', null], ['1.5', null]]);
    const back = readCdxml(viaCdx(writeCdxml(doc))).doc;
    const bb = [...back.bonds.values()];
    expect(bb[0].order).toBe(1.5);
    expect(bb[0].plain).toBeUndefined();
    expect(bb[1].plain).toBe(true);
  });
});
