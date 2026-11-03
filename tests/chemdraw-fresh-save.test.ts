// @vitest-environment jsdom
//
// A copy to ChemDraw is a fresh save. What real drawings lost that way (2026-11-03, compared with
// ChemDraw's own picture of each): labels running left, label sizes, italics, attachment colours, tints.

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { labelPieces } from '../src/chem/labels';

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
  it('turns a formula label set to run left, not a name', () => {
    const left = 'LabelDisplay="Right"', j = 'LabelJustification="Right"';
    const text = (attrs: string, run: string) => runsOf(fresh(label(attrs, `<s font="3" size="10" face="96">${run}</s>`, j)).out).map((r) => r[0]).join('');
    expect(text(`NodeType="Fragment" ${left}`, 'MeO')).toBe('MeO');
    expect(text(`NodeType="Unspecified" ${left}`, '(3,4)-MDP')).toBe('(3,4)-MDP');
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
});
