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
import { readCdxml, encodeTagValue, GEO_TAG, CURVE_ARROW_TAG, GROUP_TAG, FILL_TAG } from '../src/io/cdxml';
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
    // moved 20 pt right in ChemDraw: it rewrites the group's box and moves its curves
    const bb = g.getAttribute('BoundingBox')!.split(' ').map(Number);
    g.setAttribute('BoundingBox', [bb[0] + 20, bb[1], bb[2] + 20, bb[3]].join(' '));
    for (const c of all(g, 'curve')) c.setAttribute('CurvePoints', c.getAttribute('CurvePoints')!.split(' ').map((v, i) => Number(v) + (i % 2 ? 0 : 20)).join(' '));
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

describe('the CDXML audit, writing side (3): R26', () => {
  const body = '<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><b id="20" B="10" E="11"/></fragment>'
    + '<graphic id="30" BoundingBox="10 0 0 0" GraphicType="Orbital" OrbitalType="sShaded" Center3D="0 0 0" MajorAxisEnd3D="10 0 0" MinorAxisEnd3D="0 10 0"/>'
    + '<t id="31" p="0 40"><s font="3" size="10" face="0">MW 28</s></t>'
    + '<bracketedgroup id="40" BracketedObjectIDs="10 11" RepeatCount="2"/>'
    + '<chemicalproperty id="50" ChemicalPropertyDisplayID="31" ChemicalPropertyType="2" BasisObjects="2"/>';
  /** As a copy is written: the drawing without the file it came from. */
  const fresh = () => { const d = readCdxml(file(body)).doc; d.source = null; return d; };

  it('writes orbitals back as orbitals, and kept objects pointed at the ids written now', () => {
    const doc = fresh();
    // the ids written now are not the file's
    doc.edit('Move', () => doc.moveAtoms(new Set([...doc.atoms.keys()]), 5, 0));
    const x = parse(writeCdxml(doc));
    const orb = all(x, 'graphic').find((g) => g.getAttribute('GraphicType') === 'Orbital')!;
    expect(orb.getAttribute('OrbitalType')).toBe('sShaded');
    const nodes = all(x, 'n').map((n) => n.getAttribute('id'));
    const bg = all(x, 'bracketedgroup')[0];
    expect(bg.getAttribute('BracketedObjectIDs')!.split(' ').sort()).toEqual([...nodes].sort());
    expect(bg.getAttribute('RepeatCount')).toBe('2');
    const cp = all(x, 'chemicalproperty')[0];
    const cap = all(x, 't').find((t) => t.textContent === 'MW 28')!;
    expect(cp.getAttribute('ChemicalPropertyDisplayID')).toBe(cap.getAttribute('id'));
    expect(cp.getAttribute('BasisObjects')).toBe(all(x, 'fragment')[0].getAttribute('id'));
    // every id written once
    const ids = all(x, '*').filter((e) => e.nodeName !== 'font').map((e) => e.getAttribute('id')).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    // and through CDX
    const back = readCdxml(viaCdx(writeCdxml(doc))).doc;
    expect([...back.shapes.values()].some((s) => s.orbital === 'sShaded')).toBe(true);
    expect(back.kept).toHaveLength(2);
  });

  it('drops a kept object when what it names is gone', () => {
    const doc = fresh();
    const cap = [...doc.captions.values()][0];
    doc.edit('Delete', () => { doc.removeCaption(cap.id); for (const a of [...doc.atoms.keys()]) doc.removeAtom(a); });
    const x = parse(writeCdxml(doc));
    expect(all(x, 'bracketedgroup')).toHaveLength(0);
    expect(all(x, 'chemicalproperty')).toHaveLength(0);
  });
});

describe('the CDXML audit, writing side (4): R21', () => {
  const c = [60, 60], E = (t: number) => [c[0] + 35 * Math.cos(t), c[1] + 25.4 * Math.sin(t)];
  const T = E(0.5), H = E(0.5 - (200 * Math.PI) / 180);
  const arrow = `<arrow id="5" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="${H[0]} ${H[1]} 0" Tail3D="${T[0]} ${T[1]} 0" Center3D="60 60 0" MajorAxisEnd3D="95 60 0" MinorAxisEnd3D="60 85.4 0" AngularSize="200"/>`;
  const read = () => readCdxml(file(arrow + '<fragment id="2"><n id="3" p="200 150"/><n id="4" p="214.4 150"/><b id="6" B="3" E="4"/></fragment>')).doc;
  const nums = (e: Element, k: string) => e.getAttribute(k)!.split(' ').map(Number);

  it('writes an arc on an ellipse back as ChemDraw\'s arc arrow when moved or recoloured', () => {
    const doc = read();
    const r = doc.arrows.get(5)!;
    doc.edit('Move', () => doc.updateArrow(5, { tail: { x: r.tail.x + 10, y: r.tail.y + 5 }, head: { x: r.head.x + 10, y: r.head.y + 5 }, color: '#ff0000' }));
    const x = parse(writeCdxml(doc));
    expect(all(x, 'curve')).toHaveLength(0);
    const a = all(x, 'arrow')[0];
    expect(a.getAttribute('AngularSize')).toBe('200');
    expect(nums(a, 'Center3D').slice(0, 2)).toEqual([70, 65]);
    expect(nums(a, 'MajorAxisEnd3D').slice(0, 2)).toEqual([105, 65]);
    expect(nums(a, 'MinorAxisEnd3D')[1]).toBeCloseTo(90.4, 2);
    // read back: the same arc
    const back = readCdxml(writeCdxml(doc)).doc.arrows.get(5)!;
    back.bez!.forEach((p, i) => { expect(p.x).toBeCloseTo(r.bez![i].x, 3); expect(p.y).toBeCloseTo(r.bez![i].y, 3); });
  });

  it('turns and scales the ellipse with its ends', () => {
    const doc = read();
    const r = doc.arrows.get(5)!;
    // turned 90° about the tail and made twice as long
    const turn = (p: { x: number; y: number }) => ({ x: r.tail.x - 2 * (p.y - r.tail.y), y: r.tail.y + 2 * (p.x - r.tail.x) });
    doc.edit('Turn', () => doc.updateArrow(5, { head: turn(r.head) }));
    const a = all(parse(writeCdxml(doc)), 'arrow')[0];
    const cc = nums(a, 'Center3D'), ma = nums(a, 'MajorAxisEnd3D');
    expect(Math.hypot(ma[0] - cc[0], ma[1] - cc[1])).toBeCloseTo(70, 3);
    expect(ma[0] - cc[0]).toBeCloseTo(0, 3);
  });

  it('writes it as a curve once its shape is changed here', () => {
    const doc = read();
    const r = doc.arrows.get(5)!;
    doc.edit('Bend', () => doc.updateArrow(5, { bez: r.bez!.map((p) => ({ x: p.x, y: p.y * 1.5 })) }));
    const x = parse(writeCdxml(doc));
    expect(all(x, 'curve')).toHaveLength(1);
    expect(all(x, 'arrow')).toHaveLength(0);
  });
});

describe('our tags carry what was written beside them (CDXML audit E1–E5)', () => {
  const tagOf = (e: Element, name: string) => JSON.parse(Array.from(e.children).find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === name)!.getAttribute('Value')!);

  it('a design shape\'s tag holds its first curve\'s points (E1)', () => {
    const doc = newDoc();
    doc.edit('Add', () => { doc.addShape({ kind: 'geo', geo: 'star5', x1: 0, y1: 0, x2: 40, y2: 40, filled: true, color: '#1f5fbf' } as never); });
    const g = all(parse(writeCdxml(doc)), 'group')[0];
    const curve = all(g, 'curve')[0];
    expect(tagOf(g, GEO_TAG).seen).toEqual({ curve: curve.getAttribute('CurvePoints') });
  });

  it('a curved arrow\'s tag holds the CurveType written (E2)', () => {
    const doc = newDoc();
    doc.edit('Add', () => { doc.addArrow({ tail: { x: 0, y: 0 }, head: { x: 60, y: 0 }, bez: [{ x: 0.3, y: 0.4 }, { x: 0.7, y: -0.4 }], headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'dashed', headLength: 8, headWidth: 3, sweep: 0 } as never); });
    const c = all(parse(writeCdxml(doc)), 'curve')[0];
    expect(tagOf(c, CURVE_ARROW_TAG).seen.curveType).toBe(Number(c.getAttribute('CurveType')));
  });

  it('a contracted label\'s group tag names its label (E3)', () => {
    const doc = newDoc();
    doc.edit('Draw', () => { const a = doc.addAtom(0, 0), b = doc.addAtom(14.4, 0, 6, { label: 'OMe', group: 'OC' }); doc.addBond(a.id, b.id); });
    const n = all(parse(writeCdxml(doc)), 'n').find((e) => e.textContent === 'OMe')!;
    expect(tagOf(n, GROUP_TAG)).toEqual({ label: 'OMe', smiles: 'OC' });
  });

  it('a styled fill\'s tag holds the colour written (E5)', () => {
    const doc = newDoc();
    doc.edit('Add', () => { doc.addShape({ kind: 'rect', x1: 0, y1: 0, x2: 40, y2: 20, filled: true, fill: 'faded', color: '#1F5FBF' } as never); });
    const x = parse(writeCdxml(doc));
    const g = all(x, 'graphic')[0];
    const seen = tagOf(g, FILL_TAG).seen.color as string;
    const idx = Number(g.getAttribute('color') ?? 0);
    const c = all(x, 'color')[idx - 2];
    const hex = idx < 2 ? ['#000000', '#ffffff'][idx] : '#' + ['r', 'g', 'b'].map((k) => Math.round(Number(c.getAttribute(k)) * 255).toString(16).padStart(2, '0')).join('');
    expect(seen).toBe(hex);
  });
});

describe('the CDXML audit, R18 and R33 (reading and writing)', () => {
  const pho = (attrs: string) => file('<fragment id="8"><n id="1" p="100 100" NodeType="Fragment"><t p="97 103.6" LabelJustification="Left" LabelAlignment="Left"><s font="3" size="10" face="96">PhO</s></t></n>'
    + `<n id="2" p="120 90"/><b id="3" ${attrs}/></fragment>`);
  const lastBond = (xml: string) => { const bs = all(parse(xml), 'b'); return bs[bs.length - 1]; };

  it('R18: a bond keeps the label character it meets (BeginAttach / EndAttach), through a fresh copy and CDX', () => {
    const doc = readCdxml(pho('B="1" E="2" BeginAttach="2"')).doc;
    const b = [...doc.bonds.values()][0];
    expect(b.beginAttach).toBe(2);
    // drawn from its end in ChemDraw: the index goes with its atom
    const back = readCdxml(pho('B="2" E="1" Display="WedgeEnd" EndAttach="2"')).doc;
    const bb = [...back.bonds.values()][0];
    expect(back.atoms.get(bb.a1)!.label).toBe('PhO');
    expect(bb.beginAttach).toBe(2);
    doc.source = null;
    const out = lastBond(writeCdxml(doc));
    expect(out.getAttribute('BeginAttach')).toBe('2');
    expect(out.getAttribute('EndAttach')).toBeNull();
    expect([...readCdxml(viaCdx(writeCdxml(doc))).doc.bonds.values()][0].beginAttach).toBe(2);
  });

  it('R18: an index no longer on its atom\'s label is not written', () => {
    const doc = readCdxml(pho('B="1" E="2" BeginAttach="2"')).doc;
    const b = [...doc.bonds.values()][0];
    doc.edit('Retype', () => doc.updateAtom(b.a1, { label: 'O' }));
    expect(lastBond(writeCdxml(doc)).getAttribute('BeginAttach')).toBeNull();
  });

  it('R33: a symbol with no SymbolType is a lone pair', () => {
    const doc = readCdxml(file('<graphic id="5" BoundingBox="10 10 14 14" GraphicType="Symbol"/>')).doc;
    expect([...doc.shapes.values()][0].symbol).toBe('LonePair');
  });

  it('R33: a shadowed oval keeps its shadow size, in hundredths of its line width', () => {
    const doc = readCdxml(file('<graphic id="5" BoundingBox="0 0 0 0" GraphicType="Oval" OvalType="Circle Shadowed" LineWidth="1" ShadowSize="300" Center3D="50 50 0" MajorAxisEnd3D="70 50 0" MinorAxisEnd3D="50 70 0"/>')).doc;
    const s = [...doc.shapes.values()][0];
    expect(s.shadowSize).toBeCloseTo(3, 5);
    doc.source = null;
    const g = all(parse(writeCdxml(doc)), 'graphic')[0];
    const lw = Number(g.getAttribute('LineWidth') ?? doc.style.lineWidth);
    expect(Number(g.getAttribute('ShadowSize')) * lw / 100).toBeCloseTo(3, 1);
  });
});

describe('the CDXML audit, writing side: R32 and R11', () => {
  it('R32: a label stacked below its atom is written back as LabelAlignment Below, through a fresh copy', () => {
    const body = '<fragment id="2"><n id="3" p="100 100" NodeType="Fragment"><t p="96 103.6" LabelJustification="Left" LabelAlignment="Below" LineStarts="2 4"><s font="3" size="10" face="96">NMe</s></t></n>'
      + '<n id="4" p="87.5 92.8"/><n id="5" p="112.5 92.8"/><b id="6" B="3" E="4"/><b id="7" B="3" E="5"/></fragment>';
    const doc = readCdxml(file(body)).doc;
    const a = [...doc.atoms.values()].find((x) => x.label === 'NMe')!;
    expect(a.stacked).toBe('down');
    doc.source = null;
    const t = all(parse(writeCdxml(doc)), 't').find((e) => e.textContent === 'NMe')!;
    expect(t.getAttribute('LabelAlignment')).toBe('Below');
    expect([...readCdxml(viaCdx(writeCdxml(doc))).doc.atoms.values()].find((x) => x.label === 'NMe')!.stacked).toBe('down');
  });

  const poster = (body: string) => `<?xml version="1.0" encoding="UTF-8" ?><CDXML CreationProgram="ChemDraw 25.0.2.14" BondLength="14.40"><page id="1" BoundingBox="0 0 5121 5040" Width="5121" Height="5040" HeightPages="8" WidthPages="11" DrawingSpace="poster">${body}</page></CDXML>`;
  const cap = '<t id="10" p="100 100"><s font="3" size="10" face="0">x</s></t>';

  it('R11: a poster stays one poster when saved again, and when written afresh', () => {
    const doc = readCdxml(poster(cap)).doc;
    expect(doc.page?.poster).toBe(true);
    // unchanged: written as it was
    expect(writeCdxml(doc)).toBe(poster(cap));
    // a caption moved: the poster keeps its size three ways
    const c = [...doc.captions.values()][0];
    doc.edit('Move', () => doc.updateCaption(c.id, { x: 300 }));
    const pg = all(parse(writeCdxml(doc)), 'page')[0];
    expect(pg.getAttribute('DrawingSpace')).toBe('poster');
    expect(Number(pg.getAttribute('Width'))).toBeCloseTo(5121, 1);
    expect(pg.getAttribute('BoundingBox')!.split(' ').map(Number)).toEqual([0, 0, 5121, 5040]);
    expect(pg.getAttribute('WidthPages')).toBe('11');
    // written afresh (a copy): still a poster
    doc.source = null;
    const fresh = all(parse(writeCdxml(doc)), 'page')[0];
    expect(fresh.getAttribute('DrawingSpace')).toBe('poster');
    expect(Number(fresh.getAttribute('Height'))).toBeCloseTo(5040, 1);
    const back = readCdxml(viaCdx(writeCdxml(doc))).doc;
    expect(back.page?.poster).toBe(true);
    expect(back.page?.w).toBeCloseTo(5121, 0);
  });

  it('R11: a poster made into paper pages loses its poster size', () => {
    const doc = readCdxml(poster(cap)).doc;
    doc.page = { w: 540, h: 720 };
    const pg = all(parse(writeCdxml(doc)), 'page')[0];
    expect(pg.getAttribute('DrawingSpace')).toBeNull();
    expect(pg.getAttribute('Width')).toBeNull();
  });
});

describe('the CDXML audit, writing side (5): R41, R42', () => {
  const arrow = (extra: Record<string, unknown> = {}) => ({ tail: { x: 0, y: 0 }, head: { x: 60, y: 0 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 8, headWidth: 3, ...extra } as never);
  const curved = (extra: Record<string, unknown> = {}) => arrow({ bez: [{ x: 0.3, y: 0.4 }, { x: 0.7, y: -0.4 }], ...extra });

  it('R42: our arrowheads are written with their 3/4 notch, and read back as ours', () => {
    const doc = newDoc();
    doc.edit('Add', () => { doc.addArrow(arrow()); });
    const xml = writeCdxml(doc);
    const a = all(parse(xml), 'arrow')[0];
    const hs = Number(a.getAttribute('HeadSize'));
    expect(Number(a.getAttribute('ArrowheadCenterSize'))).toBe(Math.round(hs * 0.75));
    expect([...readCdxml(xml).doc.arrows.values()][0].headCenter).toBeUndefined();
  });

  it("R42: ChemDraw's notch comes back as it was, also when the arrow is changed", () => {
    for (const [attr, want] of [['', 875], [' ArrowheadCenterSize="500"', 500], [' ArrowheadCenterSize="1000"', 1000]] as const) {
      const doc = readCdxml(file(`<arrow id="5" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000"${attr} ArrowheadWidth="250" Head3D="50 10 0" Tail3D="10 10 0"/>`)).doc;
      const r = [...doc.arrows.values()][0];
      doc.edit('Move', () => doc.updateArrow(r.id, { head: { x: 70, y: 30 } }));
      const a = all(parse(writeCdxml(doc)), 'arrow')[0];
      expect(Number(a.getAttribute('ArrowheadCenterSize'))).toBe(want);
    }
  });

  it('R41: a curved arrow writes its head size and shape on the curve, only when not the default', () => {
    const doc = newDoc();
    const lw = doc.style.lineWidth;
    doc.edit('Add', () => { doc.addArrow(curved({ headType: 'hollow', headLength: lw * 15, headWidth: lw * 4 })); doc.addArrow(curved({ headLength: lw * 10, headWidth: lw * 2.5, tail: { x: 0, y: 40 }, head: { x: 60, y: 40 } })); });
    const [c1, c2] = all(parse(writeCdxml(doc)), 'curve');
    expect([c1.getAttribute('HeadSize'), c1.getAttribute('ArrowheadWidth'), c1.getAttribute('ArrowheadType')]).toEqual(['1500', '400', 'Hollow']);
    expect([c2.getAttribute('HeadSize'), c2.getAttribute('ArrowheadWidth'), c2.getAttribute('ArrowheadType')]).toEqual([null, null, null]);
  });

  it("R41: a curved arrow's head changed in ChemDraw wins over our tag; unchanged, the tag's exact sizes stay", () => {
    const doc = newDoc();
    const lw = doc.style.lineWidth;
    doc.edit('Add', () => { doc.addArrow(curved({ headLength: lw * 12.345, headWidth: lw * 3 })); });
    const xml = writeCdxml(doc);
    const same = [...readCdxml(xml).doc.arrows.values()][0];
    expect(same.headLength).toBeCloseTo(lw * 12.345, 9);
    const edited = xml.replace(/HeadSize="\d+"/, 'HeadSize="2000"').replace(/ArrowheadWidth="\d+"/, 'ArrowheadWidth="600" ArrowheadType="Angle"');
    const back = [...readCdxml(edited).doc.arrows.values()][0];
    expect(back.headLength).toBeCloseTo(lw * 20, 6);
    expect(back.headWidth).toBeCloseTo(lw * 6, 6);
    expect(back.headType).toBe('angle');
    // and through CDX
    const cdx = [...readCdxml(viaCdx(xml)).doc.arrows.values()][0];
    expect(cdx.headLength).toBeCloseTo(lw * 12.345, 6);
  });
});

describe('the CDXML audit, writing side (6): R24, arrows an older ChemDraw kept only as graphics', () => {
  // (as the reader takes them: an arrow read from the graphic in its place)
  const legacyDoc = (arrow: string, graphic: string) => {
    const doc = readCdxml(file(arrow)).doc;
    const text = file(graphic);
    doc.source!.text = text;
    (doc.source as { xml?: unknown }).xml = undefined;
    return { doc, text };
  };
  const line = () => legacyDoc('<arrow id="5" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="50 10 0" Tail3D="10 10 0"/>',
    '<graphic id="5" BoundingBox="50 10 10 10" GraphicType="Line" ArrowType="FullHead" HeadSize="1000"/>');

  it('an unchanged one is left as it is', () => {
    const { doc, text } = line();
    expect(writeCdxml(doc)).toBe(text);
  });

  it('a changed one becomes a ChemDraw arrow in its place, with its id, and no copy is left behind', () => {
    const { doc } = line();
    const r = [...doc.arrows.values()][0];
    doc.edit('Move', () => doc.updateArrow(r.id, { head: { x: 70, y: 30 } }));
    const x = parse(writeCdxml(doc));
    expect(all(x, 'graphic')).toHaveLength(0);
    const arrows = all(x, 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0].getAttribute('id')).toBe('5');
    expect(arrows[0].getAttribute('Head3D')).toBe('70.00 30.00 0');
    expect(arrows[0].getAttribute('ArrowheadHead')).toBe('Full');
  });

  it('one made into a curve becomes a ChemDraw curve in its place', () => {
    const { doc } = line();
    const r = [...doc.arrows.values()][0];
    doc.edit('Bend', () => doc.updateArrow(r.id, { bez: [{ x: 0.3, y: 0.4 }, { x: 0.7, y: -0.4 }] }));
    const x = parse(writeCdxml(doc));
    expect(all(x, 'graphic')).toHaveLength(0);
    expect(all(x, 'curve').map((c) => c.getAttribute('id'))).toEqual(['5']);
    expect(all(x, 'arrow')).toHaveLength(0);
  });

  it('an arc is written as a ChemDraw arc arrow; a deleted one is gone', () => {
    const { doc } = legacyDoc('<arrow id="5" ArrowheadHead="Full" HeadSize="1000" Head3D="40 10 0" Tail3D="10 40 0" Center3D="10 10 0" MajorAxisEnd3D="40 10 0" MinorAxisEnd3D="10 40 0" AngularSize="-90"/>',
      '<graphic id="5" BoundingBox="40 10 10 10" GraphicType="Arc" ArrowType="FullHead" AngularSize="-90"/>');
    const r = [...doc.arrows.values()][0];
    doc.edit('Colour', () => doc.updateArrow(r.id, { color: '#ff0000' }));
    const x = parse(writeCdxml(doc));
    expect(all(x, 'graphic')).toHaveLength(0);
    expect(all(x, 'arrow')[0].getAttribute('AngularSize')).not.toBeNull();
    const { doc: d2 } = line();
    d2.edit('Delete', () => d2.removeArrow([...d2.arrows.keys()][0]));
    const y = parse(writeCdxml(d2));
    expect([all(y, 'graphic').length, all(y, 'arrow').length]).toEqual([0, 0]);
  });

  it('read from the graphics themselves: unchanged they save as they were; changed, as ChemDraw arrows that read back the same', () => {
    const graphics = '<graphic id="10" BoundingBox="80 20 20 20" GraphicType="Line" ArrowType="FullHead" HeadSize="1000"/><graphic id="11" BoundingBox="80 40 20 40" GraphicType="Line" ArrowType="HalfHead" HeadSize="1000"/>'
      + '<graphic id="12" BoundingBox="80 60 20 60" GraphicType="Line" ArrowType="Equilibrium" HeadSize="1000"/><graphic id="13" BoundingBox="80 80 20 80" GraphicType="Line" ArrowType="Resonance" HeadSize="1000"/>'
      + '<graphic id="14" BoundingBox="80 100 20 100" GraphicType="Line" ArrowType="RetroSynthetic" HeadSize="1000"/><graphic id="15" BoundingBox="80 120 20 120" GraphicType="Line" ArrowType="Hollow" HeadSize="1000"/>'
      + '<graphic id="16" BoundingBox="80 140 20 140" GraphicType="Line" ArrowType="NoHead"/>'
      + '<graphic id="18" BoundingBox="150 50 120 50" GraphicType="Arc" ArrowType="FullHead" HeadSize="1000" AngularSize="90"/><graphic id="19" BoundingBox="150 120 120 120" GraphicType="Arc" ArrowType="NoHead" AngularSize="-120"/>';
    const text = file(graphics);
    const doc = readCdxml(text).doc;
    expect(doc.arrows.size).toBe(8);
    expect(writeCdxml(doc)).toBe(text);
    const before = [...doc.arrows.values()];
    doc.edit('Colour', () => { for (const r of doc.arrows.values()) doc.updateArrow(r.id, { color: '#ff0000' }); });
    const out = writeCdxml(doc), x = parse(out);
    // (the plain line stays a line)
    expect(all(x, 'graphic').map((g) => g.getAttribute('id'))).toEqual(['16']);
    expect(all(x, 'arrow').map((a) => a.getAttribute('id'))).toEqual(['10', '11', '12', '13', '14', '15', '18', '19']);
    const after = [...readCdxml(out).doc.arrows.values()];
    expect(after).toHaveLength(8);
    after.forEach((b, i) => {
      const a = before[i];
      for (const k of ['headStyle', 'tailStyle', 'headType', 'equilibrium', 'headCenter'] as const) expect([i, k, b[k]]).toEqual([i, k, a[k]]);
      for (const k of ['sweep', 'headLength', 'headWidth'] as const) expect(b[k]).toBeCloseTo(a[k] as number, 2);
      expect(b.shaftSpacing ?? 0).toBeCloseTo(a.shaftSpacing ?? 0, 2);
      for (const end of ['head', 'tail'] as const) { expect(b[end].x).toBeCloseTo(a[end].x, 1); expect(b[end].y).toBeCloseTo(a[end].y, 1); }
    });
  });
});

describe('what a round trip through ChemDraw 25 showed (writing side)', () => {
  it("a caption with ChemDraw's variable spacing is written with it, not LineHeight auto, also when changed or copied", () => {
    const text = file('<t id="5" p="10 10" CaptionLineHeight="variable" LineStarts="4 7"><s font="3" size="10" face="0">AAA\nBBB</s></t>', '');
    const doc = readCdxml(text).doc;
    const c = [...doc.captions.values()][0];
    expect(c.inkLines).toBe(true);
    doc.edit('Move', () => doc.updateCaption(c.id, { x: 40 }));
    const check = (xml: string) => {
      const t = all(parse(xml), 't')[0];
      expect([t.getAttribute('LineHeight'), t.getAttribute('CaptionLineHeight')]).toEqual([null, 'variable']);
      expect([...readCdxml(xml).doc.captions.values()][0].inkLines).toBe(true);
    };
    check(writeCdxml(doc));
    doc.source = null;
    check(writeCdxml(doc));
    check(viaCdx(writeCdxml(doc)));
    // our own captions keep single spacing (LineHeight auto)
    const d2 = newDoc();
    d2.edit('Add', () => { d2.addCaption({ x: 0, y: 0, runs: [{ text: 'AAA\nBBB' }] } as never); });
    expect(all(parse(writeCdxml(d2)), 't')[0].getAttribute('LineHeight')).toBe('auto');
  });

  it("separate pieces ChemDraw keeps in one fragment stay in it: unchanged byte for byte, and when edited", () => {
    const text = file('<fragment id="2" BoundingBox="10 10 100 40"><n id="3" p="10 10"/><n id="4" p="24.4 10"/><n id="5" p="60 10"/><n id="6" p="74.4 10"/><n id="7" p="100 40"/><b id="8" B="3" E="4"/><b id="9" B="5" E="6"/></fragment>');
    const doc = readCdxml(text).doc;
    expect(writeCdxml(doc)).toBe(text);
    const a = [...doc.atoms.values()][0];
    doc.edit('Move', () => doc.updateAtom(a.id, { x: a.x + 2 }));
    expect(all(parse(writeCdxml(doc)), 'fragment')).toHaveLength(1);
    // a piece broken off here gets a fragment of its own, as before
    const d2 = readCdxml(text).doc;
    const b = [...d2.bonds.values()][0];
    d2.edit('Delete', () => d2.removeBond(b.id));
    expect(all(parse(writeCdxml(d2)), 'fragment')).toHaveLength(2);
  });
});
