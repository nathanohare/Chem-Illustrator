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

describe('the CDXML audit, reading side (2)', () => {
  it('R1: things in groups inside groups keep the whole nesting', () => {
    const d = doc('<group id="1"><group id="2"><t id="10" p="10 10"><s>a</s></t></group><t id="11" p="40 10"><s>b</s></t></group>');
    const a = d.captions.get(10)!, b = d.captions.get(11)!;
    expect(a.grp).toBe(b.grp);
    expect(a.grpPath).toEqual([a.grp, expect.any(Number)]);
    expect(b.grpPath).toBeUndefined();
  });

  it('R3: a closed curve inside a structure (a perspective ring\'s ellipse) is kept as a shape, and a headless open curve as a line', () => {
    const d = doc('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><b id="20" B="10" E="11"/><curve id="30" CurveType="1" Closed="yes" CurvePoints="10 10 0 10 0 20 0 30 10 30 20 30 20 20 20 10 10 10"/><curve id="31" CurvePoints="40 0 40 0 50 10 60 0 60 0 60 0"/></fragment>');
    const s = d.shapes.get(30)!;
    expect(s.kind).toBe('geo');
    expect(s.geo!.startsWith('path:')).toBe(true);
    expect(d.arrows.get(31)!.headStyle).toBe('none');
  });

  it("ChemDraw's aromatic bond (Order 1.5) is one line; its dashed one is Order 2 with Display2 Dash", () => {
    const d = doc('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><n id="12" p="60 0"/><b id="20" B="10" E="11" Order="1.5"/><b id="21" B="11" E="12" Order="2" Display2="Dash"/></fragment>');
    expect(d.bonds.get(20)!.plain).toBe(true);
    expect(d.bonds.get(21)!.order).toBe(1.5);
    expect(d.bonds.get(21)!.plain).toBeUndefined();
  });
});

describe('the CDXML audit, reading side (3): R26', () => {
  it('keeps orbital types, and plain bracketed groups and chemical properties with the things they name', () => {
    const d = doc('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><b id="20" B="10" E="11"/></fragment><graphic id="30" BoundingBox="10 0 0 0" GraphicType="Orbital" OrbitalType="sShaded" Center3D="0 0 0" MajorAxisEnd3D="10 0 0" MinorAxisEnd3D="0 10 0"/><bracketedgroup id="40" BracketedObjectIDs="10 11"/><chemicalproperty id="50" ChemicalPropertyDisplayID="30" BasisObjects="2"/>');
    expect(d.shapes.get(30)!.orbital).toBe('sShaded');
    expect(d.kept).toHaveLength(2);
    expect(d.kept[0].xml).toContain('bracketedgroup');
    expect(d.kept[0].refs).toEqual({ 10: 'a10', 11: 'a11' });
    expect(d.kept[1].refs['30']).toBe('s30');
  });
});

describe('the CDXML audit, reading side (4): R21', () => {
  it('an arc arrow on an ellipse follows the ellipse (checked against ChemDraw 25\'s picture)', () => {
    const c = [60, 60], E = (t: number) => [c[0] + 35 * Math.cos(t), c[1] + 25.4 * Math.sin(t)];
    const T = E(0.5), H = E(0.5 - (200 * Math.PI) / 180);
    const d = doc(`<arrow id="5" ArrowheadHead="Full" Head3D="${H[0]} ${H[1]} 0" Tail3D="${T[0]} ${T[1]} 0" Center3D="60 60 0" MajorAxisEnd3D="95 60 0" MinorAxisEnd3D="60 85.4 0" AngularSize="200"/>`);
    const r = d.arrows.get(5)!;
    expect(r.sweep).toBe(0);
    expect(r.bez!.length).toBe(3 * 3 - 1);
    // the middle of the path is on the ellipse, at the far side (x near 25)
    const mid = r.bez![2];
    const u = { x: r.head.x - r.tail.x, y: r.head.y - r.tail.y };
    const p = { x: r.tail.x + mid.x * u.x - mid.y * u.y, y: r.tail.y + mid.x * u.y + mid.y * u.x };
    expect(((p.x - 60) / 35) ** 2 + ((p.y - 60) / 25.4) ** 2).toBeCloseTo(1, 2);
  });
});

describe('the CDXML audit, reading side (5): R19, R20', () => {
  it('R20: a carbon written out (=CH2) stays shown', () => {
    const d = doc('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="14.4 0" NumHydrogens="2"><t><s>CH2</s></t></n><b id="20" B="10" E="11" Order="2"/></fragment>');
    expect(d.atoms.get(11)!.showCarbon).toBe(true);
  });
  it('R19: line starts counted in characters (older ChemDraw) break at the right places', async () => {
    const { applyLineEnds } = await import('../src/io/cdxml');
    const runs = [{ text: '• Ab cd\n• Ef gh' }];
    // ChemDraw 21: characters, with the text's own newline already there
    applyLineEnds(runs, [8, 15]);
    expect(runs[0].text).toBe('• Ab cd\n• Ef gh');
    const bytes = [{ text: 'é ab cd' }];
    applyLineEnds(bytes, [6, 8]);
    expect(bytes[0].text).toBe('é ab\ncd');
  });
});
