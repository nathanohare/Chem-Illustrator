// @vitest-environment jsdom
//
// CDX properties the CDXML audit (2026-11-03) found lost on the way to or from CDX, each checked
// through a CDXML → CDX → CDXML round trip. Values are from the published CDX property pages.

import { describe, it, expect } from 'vitest';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';

const doc = (attrs: string, body: string) =>
  `<?xml version="1.0" encoding="UTF-8" ?><CDXML LabelFont="3" LabelSize="10" LabelFace="96" CaptionFont="3" CaptionSize="10"${attrs}>` +
  `<fonttable><font id="3" charset="iso-8859-1" name="Arial"/></fonttable><page id="1" BoundingBox="0 0 540 720">${body}</page></CDXML>`;
const round = (xml: string) => new DOMParser().parseFromString(cdxToCdxml(cdxmlToCdx(xml)), 'application/xml').documentElement;
const first = (root: Element, name: string) => root.getElementsByTagName(name)[0];

describe('CDX keeps', () => {
  it('the print settings (MacPrintInfo, WinPrintInfo), which hold the paper', () => {
    const mac = 'AB'.repeat(120), win = '0102030405';
    const back = round(doc(` MacPrintInfo="${mac}" WinPrintInfo="${win}"`, ''));
    expect(back.getAttribute('MacPrintInfo')).toBe(mac);
    expect(back.getAttribute('WinPrintInfo')).toBe(win);
  });

  it('what a bracket is for (BracketUsage), and its repeat pattern and flip', () => {
    const back = round(doc('', '<graphic id="2" BoundingBox="10 10 20 40" GraphicType="Bracket" BracketType="Square" BracketUsage="SRU" PolymerRepeatPattern="HeadToHead" PolymerFlipType="Flip"/>' +
      '<bracketedgroup id="3" BracketUsage="MultipleGroup" RepeatCount="3"/>'));
    const g = first(back, 'graphic');
    expect([g.getAttribute('BracketUsage'), g.getAttribute('PolymerRepeatPattern'), g.getAttribute('PolymerFlipType')]).toEqual(['SRU', 'HeadToHead', 'Flip']);
    expect(first(back, 'bracketedgroup').getAttribute('BracketUsage')).toBe('MultipleGroup');
  });

  it("an atom's, bond's and text's own label and caption styles", () => {
    const back = round(doc('', '<fragment id="2"><n id="3" p="0 0" LabelSize="8" LabelFont="3" LabelFace="1"/><n id="4" p="14 0"/>' +
      '<b id="5" B="3" E="4" LabelSize="8"/></fragment><t id="6" p="50 50" CaptionSize="14" CaptionFace="2"><s font="3" size="14" face="2">x</s></t>'));
    const n = first(back, 'n'), b = first(back, 'b'), t = back.querySelector('page > t')!;
    expect([n.getAttribute('LabelSize'), n.getAttribute('LabelFont'), n.getAttribute('LabelFace')]).toEqual(['8', '3', '1']);
    expect(b.getAttribute('LabelSize')).toBe('8');
    expect([t.getAttribute('CaptionSize'), t.getAttribute('CaptionFace')]).toEqual(['14', '2']);
    // (an atom without a style of its own gets none)
    expect(back.getElementsByTagName('n')[1].hasAttribute('LabelSize')).toBe(false);
  });

  it('every orbital type', () => {
    for (const type of ['s', 'oval', 'lobe', 'p', 'dxy', 'sShaded', 'sFilled', 'ovalFilled', 'dxyFilled']) {
      const back = round(doc('', `<graphic id="2" BoundingBox="0 0 10 10" GraphicType="Orbital" OrbitalType="${type}"/>`));
      expect(first(back, 'graphic').getAttribute('OrbitalType')).toBe(type);
    }
  });

  it('enhanced stereo (abs, and, or)', () => {
    for (const type of ['Absolute', 'And', 'Or']) {
      const back = round(doc('', `<fragment id="2"><n id="3" p="0 0" EnhancedStereoType="${type}" EnhancedStereoGroupNum="2"/></fragment>`));
      expect([first(back, 'n').getAttribute('EnhancedStereoType'), first(back, 'n').getAttribute('EnhancedStereoGroupNum')]).toEqual([type, '2']);
    }
  });

  it('element and generic lists, NOT lists too', () => {
    const back = round(doc('', '<fragment id="2"><n id="3" p="0 0" NodeType="ElementList" ElementList="9 17 35"/>' +
      '<n id="4" p="20 0" NodeType="ElementList" ElementList="NOT 17"/><n id="5" p="40 0" NodeType="GenericNickname" GenericList="NOT R X A"/></fragment>'));
    const ns = back.getElementsByTagName('n');
    expect([ns[0].getAttribute('ElementList'), ns[1].getAttribute('ElementList'), ns[2].getAttribute('GenericList')]).toEqual(['9 17 35', 'NOT 17', 'NOT R X A']);
  });

  it('the documented generic-list bytes', () => {
    // the documentation's own example: NOT [R, X, A]
    const xml = doc('', '<fragment id="2"><n id="3" p="0 0" GenericList="NOT R X A"/></fragment>');
    const bytes = Array.from(cdxmlToCdx(xml));
    const want = [0x41, 0x04, 17, 0, 0xfd, 0xff, 3, 0, 0, 0, 0x52, 3, 0, 0, 0, 0x58, 3, 0, 0, 0, 0x41];
    expect(bytes.join(',')).toContain(want.join(','));
  });

  it("an object tag's placing (absolute, angle), and a chemical property's type", () => {
    const back = round(doc('', '<fragment id="2"><n id="3" p="0 0"><objecttag id="4" TagType="String" Name="x" Value="y" PositioningType="angle" PositioningAngle="30"/></n></fragment>' +
      '<chemicalproperty id="5" ChemicalPropertyType="ChemicalName" ChemicalPropertyDisplayID="6"/>'));
    const tag = first(back, 'objecttag');
    expect([tag.getAttribute('PositioningType'), tag.getAttribute('PositioningAngle')]).toEqual(['angle', '30']);
    expect(first(back, 'chemicalproperty').getAttribute('ChemicalPropertyType')).toBe('ChemicalName');
  });

  it('enumerated values it has no name for, as their numbers', () => {
    // (ChemDraw's AS values beyond the documented ones; a lone pair drawn as a bar, SymbolType 13)
    const back = round(doc('', '<fragment id="2"><n id="3" p="0 0" AS="9"/></fragment><graphic id="4" BoundingBox="0 0 4 4" GraphicType="Symbol" SymbolType="13"/>'));
    expect(first(back, 'n').getAttribute('AS')).toBe('9');
    expect(first(back, 'graphic').getAttribute('SymbolType')).toBe('13');
  });
});
