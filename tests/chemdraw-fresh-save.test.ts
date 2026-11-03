// @vitest-environment jsdom
//
// A copy to ChemDraw is a fresh save. What real drawings lost that way (2026-11-03, compared with
// ChemDraw's own picture of each): labels running left, label sizes, italics, attachment colours, tints.

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
