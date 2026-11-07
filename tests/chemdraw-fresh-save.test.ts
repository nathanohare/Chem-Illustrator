// @vitest-environment jsdom
//
// A copy to ChemDraw is a fresh save. What real drawings lost that way (2026-11-03, compared with
// ChemDraw's own picture of each): labels running left, label sizes, italics, attachment colours, tints.

import { readFileSync } from 'fs';
import { join } from 'path';
import { zlibSync } from 'fflate';
import { emfInWmf } from '../src/render/wmf-read';
import { bondWidths, doubleBondGap } from '../src/style';
import { cdxToCdxml, cdxmlToCdx } from '../src/io/cdx';
import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { labelPieces } from '../src/chem/labels';
import { toSymbolPieces } from '../src/richtext';
import { Doc } from '../src/model';

const table = '<fonttable><font id="3" name="Arial"/></fonttable><colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="0.18" g="0.306" b="0.78"/><color r="0.6" g="0.2" b="0.6"/></colortable>';
const fresh = (body: string) => {
  const { doc } = readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="30" LabelSize="10" LabelFont="3">${table}<page id="1">${body}</page></CDXML>`);
  doc.source = null;
  return { doc, out: new DOMParser().parseFromString(writeCdxml(doc), 'application/xml') };
};
const label = (attrs: string, runs: string, t = '') => `<fragment id="2"><n id="10" p="50 50"/><n id="11" p="80 50" ${attrs}><t ${t}>${runs}</t></n><b id="20" B="10" E="11"/></fragment>`;
const node = (d: Document) => [...d.querySelectorAll('n')].find((n) => n.getAttribute('id') === '11')!;
const runsOf = (d: Document) => [...node(d).querySelectorAll('t > s')].map((s) => [s.textContent, Number(s.getAttribute('face'))]);

describe('a fresh save', () => {
  it("keeps an arrow's own bold width and dash length, and a box's dash length", () => {
    const arrow = (a: string) => `<arrow id="5" ArrowheadHead="Full" ${a} Head3D="50 10 0" Tail3D="10 10 0"/>`;
    const { doc, out } = fresh(arrow('LineType="Bold" BoldWidth="2"') + '<arrow id="6" ArrowheadHead="Full" LineType="Dashed" HashSpacing="2.5" Head3D="50 30 0" Tail3D="10 30 0"/><graphic id="7" BoundingBox="90 90 20 50" GraphicType="Rectangle" RectangleType="Dashed" HashSpacing="2.5"/>');
    expect(doc.arrows.get(5)!.boldWidth).toBe(2);
    expect(doc.arrows.get(6)!.hashSpacing).toBe(2.5);
    expect(doc.shapes.get(7)!.hashSpacing).toBe(2.5);
    const byId = (id: string) => [...out.querySelectorAll('arrow,graphic')].find((e) => e.getAttribute('id') === id)!;
    expect(Number(byId('5').getAttribute('BoldWidth'))).toBe(2);
    expect(Number(byId('6').getAttribute('HashSpacing'))).toBe(2.5);
    expect(Number(byId('7').getAttribute('HashSpacing'))).toBe(2.5);
  });
  it('keeps a label of mixed styles: [(S,S)-28Rh], the 28 bold and on the line', () => {
    const runs = '<s font="3" size="10" face="96">[</s><s font="3" size="10" face="98">(S,S)</s><s font="3" size="10">-</s><s font="3" size="10" face="1">28</s><s font="3" size="10" face="96">Rh]</s>';
    const { doc, out } = fresh(label('NodeType="Unspecified"', runs));
    expect(doc.atoms.get(11)!.labelMarks).toBe('./////=!!...');
    expect(runsOf(out)).toEqual([['[', 96], ['(S,S)', 98], ['-', 0], ['28', 1], ['Rh]', 96]]);
    const pieces = labelPieces('[(S,S)-28Rh]', false, './////=!!...');
    const digits = pieces.filter((p) => /\d/.test(p.text));
    expect(digits.map((p) => p.text).join('')).toBe('28');
    for (const p of digits) { expect(p.bold).toBe(true); expect(p.sub).toBeFalsy(); }
  });
  it('draws a label as ChemDraw does when its node says it runs left: MeO stays MeO', () => {
    const { doc, out } = fresh('<fragment id="2"><n id="10" p="80 50"/><n id="11" p="50 50" NodeType="Fragment" LabelDisplay="Right"><t LabelJustification="Right"><s font="3" size="10" face="96">MeO</s></t></n><b id="20" B="10" E="11"/></fragment>');
    expect(doc.atoms.get(11)!.label).toBe('OMe');
    expect(runsOf(out).map((r) => r[0]).join('')).toBe('MeO');
  });
  it("keeps a stacked label's LineHeight auto", () => {
    const { doc, out } = fresh(label('Element="7" NumHydrogens="1"', '<s font="3" size="12" face="96">NH</s>', 'LabelAlignment="Below" LineHeight="auto"'));
    expect(doc.atoms.get(11)!.stackedLoose).toBe(true);
    expect(node(out).querySelector('t')!.getAttribute('LineHeight')).toBe('auto');
    expect(fresh(label('Element="7" NumHydrogens="1"', '<s font="3" size="12" face="96">NH</s>', 'LabelAlignment="Below"')).doc.atoms.get(11)!.stackedLoose).toBeUndefined();
  });
  it('turns a formula label set to run left, not a name', () => {
    const write = (label: string) => {
      const doc = new Doc();
      let id = 0;
      doc.edit('Draw', () => {
        const c = doc.addAtom(50, 50), a = doc.addAtom(80, 50, 6, { label, just: 'left', fixedDir: true });
        id = a.id;
        doc.addBond(c.id, a.id);
      });
      const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
      return [...out.querySelectorAll('n')].find((n) => n.getAttribute('id') === String(id))!.querySelector('t')!.textContent;
    };
    expect(write('OMe')).toBe('MeO');
    expect(write('(3,4)-MDP')).toBe('(3,4)-MDP');
  });
  it('says which way a label from a file ran, even where we would run it that way ourselves', () => {
    // R4 on the left end of a bond, as ChemDraw had it; ChemDraw left to itself runs it elsewhere
    const { out } = fresh(label('NodeType="GenericNickname" LabelDisplay="Right" Element="6"', '<s font="3" size="10" face="96">R</s><s font="3" size="10" face="64">4</s>', 'LabelJustification="Right"'));
    expect(node(out).getAttribute('LabelDisplay')).toBe('Right');
  });
  it('runs a label left or right when its node says so, whatever its LabelAlignment', () => {
    const { doc } = fresh(label('NodeType="Fragment" LabelDisplay="Left"', '<s font="3" size="10" face="96">N(CHPh2)</s>', 'LabelJustification="Left" LabelAlignment="Below"'));
    expect(doc.atoms.get(11)!.stacked).toBeUndefined();
    expect(doc.atoms.get(11)!.just).toBe('right');
  });
  it('writes a label running left as it is drawn: HO, not OH', () => {
    const { out } = fresh(label('Element="8" LabelDisplay="Right" NumHydrogens="1"', '<s font="3" size="10" face="96">HO</s>', 'LabelJustification="Right"'));
    expect(runsOf(out).map((r) => r[0]).join('')).toBe('HO');
    expect(node(out).querySelector('t')!.getAttribute('LabelJustification')).toBe('Right');
    // (ChemDraw takes the way from this, not from the justification: tested in ChemDraw 25)
    expect(node(out).getAttribute('LabelDisplay')).toBe('Right');
  });
  it('still writes a label running right as OH', () => {
    const { out } = fresh(label('Element="8" NumHydrogens="1"', '<s font="3" size="10" face="96">OH</s>'));
    expect(runsOf(out).map((r) => r[0]).join('')).toBe('OH');
  });
  it("keeps a label at its text's size, whatever the node's LabelSize says", () => {
    const { doc, out } = fresh(label('Element="7" NumHydrogens="0" LabelSize="16.2"', '<s font="3" size="22.6" face="97">N</s>'));
    expect(doc.atoms.get(11)!.s).toBeCloseTo(2.26, 6);
    expect(Number(node(out).querySelector('s')!.getAttribute('size'))).toBeCloseTo(22.6, 6);
  });
  it('keeps the italic t of tBu to the t', () => {
    const { doc, out } = fresh(label('NodeType="Nickname"', '<s font="3" size="10" face="98">t</s><s font="3" size="10" face="96">Bu</s>'));
    expect(doc.atoms.get(11)!.face).toBeUndefined();
    expect(runsOf(out)).toEqual([['t', 98], ['Bu', 96]]);
  });
  it('keeps a raised letter italic', () => {
    const { doc, out } = fresh(label('NodeType="Fragment"', '<s font="3" size="10" face="96">O</s><s font="3" size="10" face="66">n</s><s font="3" size="10" face="96">Pr</s>'));
    expect(doc.atoms.get(11)!.labelMarks).toBe('.*..');
    expect(runsOf(out).find((r) => r[0] === 'n')![1]).toBe(66);
    expect(labelPieces('OnPr', false, '.*..').find((p) => p.text === 'n')).toMatchObject({ sup: true, italic: true });
  });
  it("keeps a wavy attachment's colour", () => {
    const { doc, out } = fresh('<fragment id="2"><n id="10" p="50 50"/><n id="11" p="80 50" NodeType="ExternalConnectionPoint" ExternalConnectionType="Wavy" color="4"/><b id="20" B="10" E="11"/></fragment>');
    expect(doc.atoms.get(11)!.color).toBe('#2e4ec7');
    expect(node(out).getAttribute('color')).not.toBeNull();
  });
  it('keeps a tint at its round FadePercent', () => {
    const { out } = fresh('<graphic id="30" BoundingBox="72 50 64.4 50" color="5" GraphicType="Oval" OvalType="Circle" FadePercent="300" Center3D="64.4 50 0" MajorAxisEnd3D="72 50 0" MinorAxisEnd3D="64.4 57.6 0"/>');
    expect(out.querySelector('graphic')!.getAttribute('FadePercent')).toBe('300');
  });
  it('keeps a bold blue atom number bold and blue, and an uncoloured one in its atom\'s colour', () => {
    const num = (nodeColor: string, run: string) => `<fragment id="2"><n id="10" p="50 50"/><n id="11" p="80 50" ${nodeColor} ShowAtomNumber="yes" AtomNumber="4"><objecttag TagType="Unknown" Name="number"><t p="84 44" BoundingBox="84 40 88 44"><s font="3" size="7" ${run}>4</s></t></objecttag></n><b id="20" B="10" E="11"/></fragment>`;
    const numRun = (d: Document) => node(d).querySelector('objecttag[Name="number"] s')!;
    const { doc, out } = fresh(num('', 'color="4" face="1"'));
    expect(doc.atoms.get(11)!.numberLabel).toMatchObject({ color: '#2e4ec7', face: 1 });
    const blue = out.querySelectorAll('colortable color');
    const idx = Number(numRun(out).getAttribute('color'));
    const c = blue[idx - 2];
    expect([c.getAttribute('r'), c.getAttribute('g'), c.getAttribute('b')].map(Number).map((v) => Math.round(v * 255))).toEqual([46, 78, 199]);
    expect(numRun(out).getAttribute('face')).toBe('1');
    // a plain number on a coloured atom: in the atom's colour, with nothing of its own
    const plain = fresh(num('color="5"', 'color="5"'));
    expect(plain.doc.atoms.get(11)!.numberLabel?.color).toBeUndefined();
    expect(numRun(plain.out).getAttribute('color')).toBe(node(plain.out).getAttribute('color'));
    expect(numRun(plain.out).hasAttribute('face')).toBe(false);
  });
  it('keeps a space that follows a Symbol letter in the Symbol font', () => {
    const { doc } = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML><fonttable><font id="3" name="Arial"/><font id="23" name="Symbol"/></fonttable><page id="1"><t id="5" p="100 100" Justification="Center"><s font="23" size="12" face="0">\u00a8 </s><s font="3" size="12" face="0">made up text</s></t></page></CDXML>');
    doc.source = null;
    const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    const fonts = new Map([...out.querySelectorAll('fonttable font')].map((f) => [f.getAttribute('id'), f.getAttribute('name')]));
    const runs = [...out.querySelectorAll('t > s')].map((s) => [fonts.get(s.getAttribute('font')), s.textContent]);
    expect(runs).toEqual([['Symbol', '\u00a8 '], ['Arial', 'made up text']]);
  });
  it('keeps a bullet ChemDraw wrote in the Symbol font in that font, with line starts counted as written', () => {
    const { doc } = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML><fonttable><font id="3" name="Arial"/><font id="23" name="Symbol"/></fonttable><page id="1"><t id="5" p="100 100" LineStarts="6 12"><s font="3" size="8" face="0">first\n</s><s font="23" size="8" face="0">\u00b7 </s><s font="3" size="8" face="0">two</s></t></page></CDXML>');
    const cap = [...doc.captions.values()][0];
    expect(cap.runs.find((r) => r.text.startsWith('\u2022'))?.symbolFont).toBe(true);
    doc.source = null;
    const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    const fonts = new Map([...out.querySelectorAll('fonttable font')].map((f) => [f.getAttribute('id'), f.getAttribute('name')]));
    const runs = [...out.querySelectorAll('t > s')].map((s) => [fonts.get(s.getAttribute('font')), s.textContent]);
    expect(runs).toContainEqual(['Symbol', '\u00b7 ']);
    expect(out.querySelector('t')!.getAttribute('LineStarts')).toBe('6 12');
    // a bullet typed here still goes out in Arial
    expect(toSymbolPieces('\u2022 x')).toEqual([{ text: '\u2022 x', symbol: false }]);
  });
  it('leaves NeedsClean off a label ChemDraw cannot interpret', () => {
    const { out } = fresh(label('NodeType="Unspecified"', '<s font="3" size="10" face="96">(3,4)-XYZ</s>'));
    expect(node(out).getAttribute('NodeType')).toBe('Unspecified');
    expect(node(out).hasAttribute('NeedsClean')).toBe(false);
    expect(fresh(label('Element="8" NumHydrogens="1"', '<s font="3" size="10" face="96">OH</s>')).out.querySelector('n[id="11"]')!.getAttribute('NeedsClean')).toBe('yes');
  });
  it("keeps a label ChemDraw couldn't interpret as Unspecified while it is unchanged", () => {
    const { doc, out } = fresh(label('NodeType="Unspecified"', '<s font="3" size="10" face="96">(3,4)-XYZ</s>'));
    expect(node(out).getAttribute('NodeType')).toBe('Unspecified');
    expect(node(out).hasAttribute('NeedsClean')).toBe(false);
    expect(node(out).querySelector('fragment')).toBeNull();
    // retyped: worked out again
    doc.edit('Label', () => doc.updateAtom(11, { label: 'OMe' }));
    doc.source = null;
    const again = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    expect(node(again).getAttribute('NodeType')).not.toBe('Unspecified');
  });
  it('keeps a minus sign ChemDraw wrote in Arial in Arial', () => {
    const { doc } = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML><fonttable><font id="3" name="Arial"/></fonttable><page id="1"><t id="5" p="100 100"><s font="3" size="8" face="0">\u2212' + '10 \u00baC</s></t></page></CDXML>');
    doc.source = null;
    const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    const fonts = new Map([...out.querySelectorAll('fonttable font')].map((f) => [f.getAttribute('id'), f.getAttribute('name')]));
    expect([...out.querySelectorAll('t > s')].map((s) => [fonts.get(s.getAttribute('font')), s.textContent])).toEqual([['Arial', '\u221210 \u00baC']]);
    // typed here, a minus still goes in Symbol as ChemDraw writes it
    expect(toSymbolPieces('\u2212')).toEqual([{ text: '-', symbol: true }]);
  });
  it("keeps ChemDraw's own FadePercent where a round one gives the same tint here (72, not 70)", () => {
    // on black, 72 and 70 both round to #ededed here, but ChemDraw draws 72 a level darker
    const rect = (f: number) => `<graphic id="31" BoundingBox="10 10 40 30" color="3" GraphicType="Rectangle" FadePercent="${f}"/>`;
    const { doc, out } = fresh(rect(72));
    expect(out.querySelector('graphic')!.getAttribute('FadePercent')).toBe('72');
    // the round one still comes out round
    expect(fresh(rect(70)).out.querySelector('graphic')!.getAttribute('FadePercent')).toBe('70');
    // a fill changed since: worked out from the new tint, not the old value
    const s = [...doc.shapes.values()][0];
    doc.edit('Fill', () => doc.updateShape(s.id, { fillColor: '#cccccc' }));
    doc.source = null;
    const again = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    expect(again.querySelector('graphic')!.getAttribute('FadePercent')).toBe('200');
  });
});

describe('a fresh save, labels placed by ChemDraw', () => {
  const body = (attr: string) => `<fragment id="2"><n id="10" p="50 50" AS="S"><objecttag TagType="Unknown" ${attr} Name="stereo"><t p="42.56 48.4"><s size="4.5">(S)</s></t></objecttag></n><n id="11" p="80 50"/><b id="20" B="10" E="11"/></fragment>`;
  const write = (attr: string) => {
    const { doc } = readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="30"><page id="1">${body(attr)}</page></CDXML>`);
    doc.source = null;
    return new DOMParser().parseFromString(writeCdxml(doc), 'application/xml').querySelector('objecttag[Name="stereo"]')!;
  };
  it("keeps a stereo label ChemDraw placed as an offset, which it would move otherwise", () => {
    const tag = write('PositioningType="offset" PositioningOffset="-7.44 -1.60"');
    expect(tag.getAttribute('PositioningType')).toBe('offset');
    expect(tag.getAttribute('PositioningOffset')).toBe('-7.44 -1.60');
  });
  it('adds no offset to one that had none', () => {
    expect(write('').hasAttribute('PositioningType')).toBe(false);
  });
  it("keeps a centered label's LabelDisplay", () => {
    const { doc } = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="30" LabelSize="10"><page id="1"><fragment id="2"><n id="10" p="50 50"/><n id="11" p="80 50" NodeType="Nickname" LabelDisplay="Center"><t LabelJustification="Center" Justification="Center"><s size="10" face="96">Ph</s></t></n><b id="20" B="10" E="11"/></fragment></page></CDXML>');
    doc.source = null;
    const out = new DOMParser().parseFromString(writeCdxml(doc), 'application/xml');
    expect([...out.querySelectorAll('n')].find((n) => n.getAttribute('id') === '11')!.getAttribute('LabelDisplay')).toBe('Center');
  });
});

describe('a filled circle recolored in ChemDraw', () => {
  const oval = (color: string, tag: object) => `<graphic id="30" BoundingBox="72 50 64.4 50" color="${color}" GraphicType="Oval" OvalType="Circle Filled" Center3D="64.4 50 0" MajorAxisEnd3D="72 50 0" MinorAxisEnd3D="64.4 57.6 0"><objecttag TagType="String" Name="Chem Illustrator fill" Visible="no" Value="${JSON.stringify(tag).replace(/"/g, '&quot;')}"/></graphic>`;
  const read = (body: string) => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML>${table}<page id="1">${body}</page></CDXML>`).doc.shapes.get(30)!;
  it('takes ChemDraw\'s color over an old tag that says only its own', () => {
    const s = read(oval('5', { fillColor: '#a52a2a', color: '#a52a2a' }));
    expect(s.color).toBe('#993399');
    expect(s.fillColor).toBe('#993399');
  });
  it('keeps the tag when it is the same color, give or take rounding', () => {
    const s = read(oval('4', { fillColor: '#2f4fc8', color: '#2f4fc8' }));
    expect(s.fillColor).toBe('#2f4fc8');
  });
});

describe('pictures ChemDraw packs in a CDX', () => {
  const emf = () => new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'chemdraw-clipboard', 'from-powerpoint', 'picture.emf')));
  const hex = (b: Uint8Array) => Buffer.from(b).toString('hex').toUpperCase();
  const page = (attrs: string) => `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><embeddedobject id="9" BoundingBox="10 10 110 60" ${attrs}/></page></CDXML>`;
  const shown = (xml: string) => [...readCdxml(xml).doc.shapes.values()][0];
  it('shows a compressed enhanced metafile, and carries it through CDX unchanged', () => {
    const packed = zlibSync(emf());
    const xml = page(`CompressedEnhancedMetafile="${hex(packed)}" UncompressedEnhancedMetafileSize="${emf().length}"`);
    const pic = shown(xml);
    expect(pic.kind).toBe('picture');
    expect(pic.src?.startsWith('data:image/x-emf')).toBe(true);
    const back = cdxToCdxml(cdxmlToCdx(xml));
    expect(back).toContain(`CompressedEnhancedMetafile="${hex(packed)}"`);
    expect(back).toContain(`UncompressedEnhancedMetafileSize="${emf().length}"`);
    expect(shown(back).src).toBe(pic.src);
  });
  it('finds the enhanced metafile Windows keeps inside a metafile', () => {
    const e = emf();
    // [MS-WMF]: the 18-byte header, the EMF cut into two escape records, and the closing record
    const piece = (data: Uint8Array) => {
      const size = 44 + data.length + (data.length & 1);
      const out = new Uint8Array(size);
      const v = new DataView(out.buffer);
      v.setUint32(0, size / 2, true);
      v.setUint16(4, 0x0626, true);
      v.setUint16(6, 0x000f, true);
      v.setUint16(8, size - 10, true);
      v.setUint32(10, 0x43464d57, true);
      v.setUint32(14, 1, true);
      v.setUint32(18, 0x00010000, true);
      v.setUint32(32, data.length, true);
      v.setUint32(36, 0, true);
      v.setUint32(40, e.length, true);
      out.set(data, 44);
      return out;
    };
    const head = new Uint8Array(18);
    new DataView(head.buffer).setUint16(2, 9, true);
    const cut = e.length >> 1;
    const end = new Uint8Array([3, 0, 0, 0, 0, 0]);
    const parts = [head, piece(e.subarray(0, cut)), piece(e.subarray(cut)), end];
    const wmf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { wmf.set(p, at); at += p.length; }
    expect(emfInWmf(wmf)).toEqual(e);
    expect(shown(page(`WindowsMetafile="${hex(wmf)}"`)).src?.startsWith('data:image/x-emf')).toBe(true);
    expect(emfInWmf(new Uint8Array(40))).toBeNull();
  });
});

describe('a bond with its own widths', () => {
  // ChemDraw spaces a double bond's lines by the bond's own BondLength (465 double bonds measured in a real file)
  it('spaces a double bond by its own bond length, not the line width scale', () => {
    const { doc } = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.40" BondSpacing="18" LineWidth="0.60" BoldWidth="2" MarginWidth="1.60"><page id="1"><fragment id="2"><n id="3" p="0 0"/><n id="4" p="18 0"/><b id="5" B="3" E="4" Order="2" LineWidth="1" MarginWidth="2" BoldWidth="2.50" BondLength="18"/></fragment></page></CDXML>');
    const b = [...doc.bonds.values()][0];
    const w = bondWidths(doc.style, b);
    expect(w.lineWidth).toBeCloseTo(1, 5);
    expect(w.marginWidth).toBe(2);
    expect(doubleBondGap({ ...doc.style, bondLength: w.bondLength })).toBeCloseTo(3.24, 5);
  });
});
