// @vitest-environment jsdom
//
// Reading fixes from the CDXML audit (findings R4, R5, R6, R8, R9), each against a small drawing
// written the way ChemDraw 25 saves it.

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { Renderer } from '../src/render/renderer';

const doc = (body: string, root = '') => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML${root}><colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/></colortable><page id="1">${body}</page></CDXML>`).doc;
const PNG = '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8CFC0F01F0005000201E3F7B3E60000000049454E44AE426082';

describe('the CDXML audit, reading side', () => {
  it('R5: a label runs the way its node and justification say, not its LabelAlignment', () => {
    const d = doc('<fragment id="2"><n id="10" p="10 10"/><n id="11" p="24.4 10" LabelDisplay="Left"><t LabelJustification="Left" LabelAlignment="Right"><s font="3" size="10" face="0">OH</s></t></n><b id="20" B="10" E="11"/></fragment>');
    expect(d.atoms.get(11)!.just).toBe('right');
    const e = doc('<fragment id="2"><n id="10" p="10 10"/><n id="11" p="24.4 10"><t LabelJustification="Right" LabelAlignment="Right"><s font="3" size="10" face="0">PCy3</s></t></n><b id="20" B="10" E="11"/></fragment>');
    expect(e.atoms.get(11)!.just).toBe('left');
  });

  it("R6: a counter-ion read as text keeps its circled charge", () => {
    const d = doc('<fragment id="2"><n id="10" p="50 50" NodeType="Fragment" NeedsClean="yes"><t p="45 54"><s font="3" size="10" face="96">BF4</s></t></n><graphic id="30" BoundingBox="64 44 60 44" GraphicType="Symbol" SymbolType="CircleMinus"/></fragment>');
    expect(d.captions.size).toBe(1);
    expect([...d.shapes.values()].some((s) => s.kind === 'symbol' || s.symbol === 'CircleMinus')).toBe(true);
  });

  it('R8, R9: a picture keeps its place among the shapes and its turn', () => {
    const d = doc(`<embeddedobject id="5" BoundingBox="50 50 130 90" Z="21986" RotationAngle="${30 * 65536}" PNG="${PNG}"/>`);
    const s = d.shapes.get(5)!;
    expect(s.z).toBe(21986);
    expect(s.rot).toBeCloseTo(30, 6);
  });

  it('R4: a wedge on a ring\'s aromatic bond is filled, as on a single bond', () => {
    const d = doc('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><n id="12" p="15 -26"/><b id="20" B="10" E="11" Order="1.5" Display="WedgeBegin"/><b id="21" B="11" E="12" Order="1.5"/><b id="22" B="12" E="10" Order="1.5"/></fragment>');
    const starts: number[] = [];
    const rec = () => ({ moveTo() { starts.push(1); }, lineTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {} });
    const batch = { thin: rec(), bold: rec(), dashed: rec(), fills: { moveTo() { fills++; }, lineTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {} }, tips: rec() };
    let fills = 0;
    const b = d.bonds.get(20)!;
    (new Renderer({ getContext: () => null } as any, { getContext: () => null } as any) as any).bondPaths(d, b, d.atoms.get(b.a1), d.atoms.get(b.a2), batch);
    expect(fills).toBeGreaterThan(0);
  });
});
