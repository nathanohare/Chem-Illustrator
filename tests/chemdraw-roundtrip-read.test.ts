// @vitest-environment jsdom
//
// What a round trip through ChemDraw 25 showed we read differently from it (2026-11-03): its dashed
// aromatic bonds as it saves them, and its usual (variable) line spacing in captions.

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { layoutText } from '../src/text/layout';

const read = (body: string) => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1"><fonttable><font id="3" name="Arial"/></fonttable><page id="1">${body}</page></CDXML>`).doc;

describe('a dashed aromatic bond as ChemDraw saves it', () => {
  it('is Order 1.5 with Display2 Dash, drawn dashed; Order 1.5 alone is one line', () => {
    const d = read('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="14.4 0"/><n id="12" p="14.4 14.4"/><b id="20" B="10" E="11" Order="1.5" Display2="Dash" DoublePosition="Right"/><b id="21" B="11" E="12" Order="1.5"/></fragment>');
    expect(d.bonds.get(20)!.order).toBe(1.5);
    expect(d.bonds.get(20)!.plain).toBeFalsy();
    expect(d.bonds.get(21)!.plain).toBe(true);
  });
});

describe("ChemDraw's variable line spacing", () => {
  const caption = (attr: string) => [...read(`<t id="5" p="10 10"${attr} LineStarts="4 7"><s font="3" size="10">AAA\nBBB</s></t>`).captions.values()][0];
  it('is read from CaptionLineHeight="variable" and from a text with no line height, not from LineHeight="auto"', () => {
    expect(caption(' CaptionLineHeight="variable"').inkLines).toBe(true);
    expect(caption('').inkLines).toBe(true);
    expect(caption(' LineHeight="auto"').inkLines).toBeUndefined();
    expect(caption(' LineHeight="14"').inkLines).toBeUndefined();
  });
  it('puts lines as close as their ink lets them: 7/6 of the capitals\' height for AAA over BBB', () => {
    const c = caption('');
    const w = (t: string, s: number) => t.length * s * 0.6;
    const ink = layoutText(c, 10, w).lines, single = layoutText({ ...c, inkLines: undefined }, 10, w).lines;
    expect(ink[1].y - ink[0].y).toBeCloseTo((7 / 6) * 7.16, 1);
    expect(single[1].y - single[0].y).toBeCloseTo(11.5, 6);
  });
});
