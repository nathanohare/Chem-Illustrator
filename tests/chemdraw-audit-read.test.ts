// @vitest-environment jsdom
//
// Reading fixes from the CDXML audit (findings R4, R5, R6, R8, R9 and on), each against a small drawing
// written the way ChemDraw 25 saves it.

import { describe, it, expect } from 'vitest';
import { readCdxml } from '../src/io/cdxml';
import { Renderer, shaftInto } from '../src/render/renderer';
import { labelSpec, layoutLabel } from '../src/chem/labels';

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

  it("ChemDraw's aromatic bond (Order 1.5) is one line; its dashed one is Order 1.5 with Display2 Dash", () => {
    const d = doc('<fragment id="2"><n id="10" p="0 0"/><n id="11" p="30 0"/><n id="12" p="60 0"/><b id="20" B="10" E="11" Order="1.5"/><b id="21" B="11" E="12" Order="1.5" Display2="Dash"/></fragment>');
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

describe('the CDXML audit, reading side (6): our tags give way to edits made in ChemDraw (E1–E5)', () => {
  const tag = (name: string, value: string) => `<objecttag TagType="String" Name="${name}" Value="${value.replace(/"/g, '&quot;')}"/>`;
  it('E3: a group counts only while the label still says it', () => {
    const g = (shown: string) => doc(`<fragment id="2"><n id="10" p="0 0"/><n id="11" p="14 0" NodeType="Fragment"><t><s>${shown}</s></t>${tag('Chem Illustrator group', JSON.stringify({ label: 'OMe', smiles: '*OC' }))}</n><b id="20" B="10" E="11"/></fragment>`);
    expect(g('OMe').atoms.get(11)!.group).toBe('*OC');
    expect(g('OEt').atoms.get(11)!.group).toBeUndefined();
  });
  it("E4: ChemDraw's RotationAngle wins over our turn tag", () => {
    const d = doc(`<t id="5" p="10 10" RotationAngle="${10 * 65536}"><s>x</s>${tag('Chem Illustrator turn', '30')}</t>`);
    expect(d.captions.get(5)!.rot).toBeCloseTo(10, 6);
  });
  it('E5: a shape recoloured in ChemDraw keeps ChemDraw\'s colour', () => {
    const d = doc(`<graphic id="30" BoundingBox="20 20 0 0" GraphicType="Rectangle" RectangleType="Filled" color="1">${tag('Chem Illustrator fill', JSON.stringify({ fill: 'faded', fillColor: '#ff0000', color: '#ff0000', seen: { color: '#ff0000' } }))}</graphic>`);
    expect(d.shapes.get(30)!.color).not.toBe('#ff0000');
    expect((d.shapes.get(30) as { seen?: unknown }).seen).toBeUndefined();
  });
  it('E2: heads changed in ChemDraw win over our curve tag', () => {
    const d = doc(`<curve id="40" CurveType="0" CurvePoints="0 0 0 0 10 10 20 0 20 0 20 0">${tag('Chem Illustrator arrow', JSON.stringify({ headStyle: 'full', seen: { curveType: 8 } }))}</curve>`);
    expect(d.arrows.get(40)!.headStyle).toBe('none');
  });
});

describe('the CDXML audit, reading side (7): R32, R11', () => {
  const measure = (t: string, s: number) => t.length * s * 0.6;
  it('R32: a label ChemDraw stacks below (or above) keeps one piece per line, lined up on the atom symbol', () => {
    const d = doc('<fragment id="2"><n id="10" p="10 10"/><n id="11" p="22.47 17.2" Element="7" NumHydrogens="0"><t LabelJustification="Left" LabelAlignment="Below"><s font="3" size="10" face="96">NCO2Me</s></t></n><n id="12" p="34.94 10"/><b id="20" B="10" E="11"/><b id="21" B="11" E="12"/></fragment>'
      + '<fragment id="3"><n id="30" p="10 60"/><n id="31" p="22.47 52.8" Element="8" NumHydrogens="0"><t LabelJustification="Left" LabelAlignment="Above"><s font="3" size="10" face="96">OMe</s></t></n><n id="32" p="34.94 60"/><b id="40" B="30" E="31"/><b id="41" B="31" E="32"/></fragment>');
    const n = d.atoms.get(11)!, o = d.atoms.get(31)!;
    expect(n.stacked).toBe('down');
    expect(o.stacked).toBe('up');
    const lay = (label: string, stacked: 'up' | 'down', bonds: { x: number; y: number }[]) =>
      layoutLabel({ ...labelSpec(7, label, 0, 0, 2, 2, true, false)!, stacked }, bonds, 10, measure, 'auto');
    const below = lay('NCO2Me', 'down', [{ x: -0.87, y: -0.5 }, { x: 0.87, y: -0.5 }]);
    const big = below.runs.filter((r) => r.size === 10);
    expect(big.map((r) => r.text)).toEqual(['N', 'C', 'O', 'Me']);
    // each line a label size lower, all starting at the left edge of the N
    expect(big.map((r) => Math.round(r.dy - big[0].dy))).toEqual([0, 10, 20, 30]);
    expect(new Set(big.map((r) => r.dx)).size).toBe(1);
    const above = lay('OMe', 'up', [{ x: -0.87, y: 0.5 }, { x: 0.87, y: 0.5 }]);
    expect(above.runs[1].dy - above.runs[0].dy).toBeCloseTo(-10, 6);
  });

  it('R11: a poster is one sheet of its own size, not a grid of letter pages', () => {
    const d = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1" BoundingBox="0 0 5121 5040" Width="5121" Height="5040" HeightPages="8" WidthPages="11" DrawingSpace="poster"/></CDXML>').doc;
    expect(d.page).toEqual({ w: 5121, h: 5040, grow: false, poster: true });
    const p = readCdxml('<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1" BoundingBox="0 0 1080 720" HeightPages="1" WidthPages="2"/></CDXML>').doc;
    expect(p.page).toMatchObject({ w: 540, h: 720, across: 2 });
    expect(p.page!.poster).toBeUndefined();
  });
});

describe('the CDXML audit, reading side (8): R27, R31, R35, R40, R41, R42, E12', () => {
  const page = (body: string, root = '', fonts = '') => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1"${root}>${fonts}<page id="1">${body}</page></CDXML>`);

  it('R35: a charge the label leaves out, with no circled charge, is not drawn (ChemDraw shows Cl, not Cl−)', () => {
    const d = doc('<fragment id="2"><n id="10" p="10 10"/><n id="11" p="24.4 10" Element="17" Charge="-1" NumHydrogens="0"><t><s font="3" size="10" face="96">Cl</s></t></n><b id="20" B="10" E="11"/></fragment>'
      + '<fragment id="3"><n id="30" p="10 40"/><n id="31" p="24.4 40" Element="7" Charge="1" NumHydrogens="3"><t><s font="3" size="10" face="96">NH3+</s></t></n><b id="40" B="30" E="31"/></fragment>');
    expect(d.atoms.get(11)!.hideCharge).toBe(true);
    expect(d.atoms.get(31)!.hideCharge).toBeFalsy();
  });

  it('R31: an Arial run keeps Arial in a drawing whose captions are in another font', () => {
    const fonts = '<fonttable><font id="3" name="Arial"/><font id="4" name="Times New Roman"/></fonttable>';
    const { doc: d } = page('<t id="5" p="10 10"><s font="3" size="12">Arial</s><s font="4" size="12">Times</s></t>', ' CaptionFont="4"', fonts);
    const runs = [...d.captions.values()][0].runs;
    expect(runs[0].font).toBe('Arial');
    expect(runs[1].font).toBeUndefined();
  });

  it('R41: NoGo="None" is a plain arrow; a curve arrow keeps its own head size and shape', () => {
    const { doc: d } = page('<arrow id="5" NoGo="None" ArrowheadHead="Full" Head3D="50 10 0" Tail3D="10 10 0"/><arrow id="6" NoGo="Cross" ArrowheadHead="Full" Head3D="50 30 0" Tail3D="10 30 0"/>'
      + '<curve id="7" CurvePoints="10 60 10 60 25 40 35 40 50 60 50 60" CurveType="8" HeadSize="1500" ArrowheadWidth="400" ArrowheadType="Hollow"/>');
    expect(d.arrows.get(5)!.noGo).toBe(false);
    expect(d.arrows.get(6)!.noGo).toBe(true);
    const c = d.arrows.get(7)!;
    expect(c.headLength).toBeCloseTo(15, 6);
    expect(c.headWidth).toBeCloseTo(4, 6);
    expect(c.headType).toBe('hollow');
  });

  it("R42: an arrowhead's notch comes from ArrowheadCenterSize (7/8 when missing, as ChemDraw takes it)", () => {
    const { doc: d } = page('<arrow id="5" ArrowheadHead="Full" HeadSize="1000" ArrowheadCenterSize="1000" Head3D="50 10 0" Tail3D="10 10 0"/><arrow id="6" ArrowheadHead="Full" HeadSize="1000" ArrowheadCenterSize="500" Head3D="50 30 0" Tail3D="10 30 0"/><arrow id="7" ArrowheadHead="Full" HeadSize="1000" Head3D="50 50 0" Tail3D="10 50 0"/>');
    expect([5, 6, 7].map((id) => d.arrows.get(id)!.headCenter)).toEqual([1, 0.5, 0.875]);
    // the line runs into the head up to just short of the notch, never stopping before it
    expect(shaftInto(10, 'solid', 1, undefined, 0.5)).toBeLessThan(5);
    expect(shaftInto(10, 'solid', 1)).toBeCloseTo(7, 6);
  });

  it('R27, R40: annotations are no warning; link nodes are', () => {
    const { stats } = page('<annotation id="3" Keyword="x" Content="y"/><fragment id="2"><n id="10" p="10 10" NodeType="VariableAttachment" Attachments="2 11 12"/><n id="11" p="24.4 10"/><n id="12" p="30 20" NodeType="LinkNode"/><b id="20" B="10" E="11"/><b id="21" B="11" E="12"/></fragment>');
    expect(stats.skipped.annotation).toBeUndefined();
    expect(stats.skipped['VariableAttachment node']).toBeUndefined();
    expect(stats.skipped['LinkNode node']).toBe(1);
  });

  it('E12: a design shape tag with values a shape cannot hold leaves them out', () => {
    const tag = JSON.stringify({ kind: 'geo', geo: 'star', x1: 0, y1: 0, x2: 20, y2: 20, lineWidth: 'wide', z: { a: 1 }, id: 99 }).replace(/"/g, '&quot;');
    const { doc: d } = page(`<group id="8" BoundingBox="0 0 20 20"><objecttag TagType="String" Name="Chem Illustrator shape" Value="${tag}"/></group>`);
    const s = [...d.shapes.values()].find((x) => x.kind === 'geo')!;
    expect(s.geo).toBe('star');
    expect(s.lineWidth).toBeUndefined();
    expect(s.z).toBeUndefined();
    expect(s.id).not.toBe(99);
  });
});

describe('the CDXML audit, reading side (9): R24', () => {
  // older files' arrows (Line and Arc graphics with an ArrowType), and the arrows ChemDraw 25 made
  // of the same graphics when it opened and saved them
  const legacy = `<graphic id="10" BoundingBox="80 20 20 20" GraphicType="Line" ArrowType="FullHead" HeadSize="1000"/>
<graphic id="11" BoundingBox="80 40 20 40" GraphicType="Line" ArrowType="HalfHead" HeadSize="1000"/>
<graphic id="12" BoundingBox="80 60 20 60" GraphicType="Line" ArrowType="Equilibrium" HeadSize="1000"/>
<graphic id="13" BoundingBox="80 80 20 80" GraphicType="Line" ArrowType="Resonance" HeadSize="1000"/>
<graphic id="14" BoundingBox="80 100 20 100" GraphicType="Line" ArrowType="RetroSynthetic" HeadSize="1000"/>
<graphic id="15" BoundingBox="80 120 20 120" GraphicType="Line" ArrowType="Hollow" HeadSize="1000"/>
<graphic id="18" BoundingBox="150 50 120 50" GraphicType="Arc" ArrowType="FullHead" HeadSize="1000" AngularSize="90"/>
<graphic id="19" BoundingBox="150 120 120 120" GraphicType="Arc" ArrowType="NoHead" AngularSize="-120"/>`;
  const chemdraw = `
<arrow id="22" Z="1" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="80 20 0" Tail3D="20 20 0" Center3D="50 20 0" MajorAxisEnd3D="110 20 0" MinorAxisEnd3D="50 80 0" />
<arrow id="23" Z="2" ArrowheadHead="HalfLeft" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="80 40 0" Tail3D="20 40 0" Center3D="50 40 0" MajorAxisEnd3D="110 40 0" MinorAxisEnd3D="50 100 0" />
<arrow id="24" Z="3" ArrowheadHead="HalfLeft" ArrowheadTail="HalfLeft" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" ArrowShaftSpacing="300" Head3D="80 60 0" Tail3D="20 60 0" Center3D="50 60 0" MajorAxisEnd3D="110 60 0" MinorAxisEnd3D="50 120 0" />
<arrow id="25" Z="4" ArrowheadHead="Full" ArrowheadTail="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="80 80 0" Tail3D="20 80 0" Center3D="50 80 0" MajorAxisEnd3D="110 80 0" MinorAxisEnd3D="50 140 0" />
<arrow id="26" Z="5" ArrowheadHead="Full" ArrowheadType="Angle" HeadSize="1000" ArrowheadCenterSize="1000" ArrowheadWidth="250" ArrowShaftSpacing="1000" Head3D="80 100 0" Tail3D="20 100 0" Center3D="50 100 0" MajorAxisEnd3D="110 100 0" MinorAxisEnd3D="50 160 0" />
<arrow id="27" Z="6" ArrowheadHead="Full" ArrowheadType="Hollow" HeadSize="1000" ArrowheadCenterSize="1000" ArrowheadWidth="250" ArrowShaftSpacing="1000" Head3D="80 120 0" Tail3D="20 120 0" Center3D="50 120 0" MajorAxisEnd3D="110 120 0" MinorAxisEnd3D="50 180 0" />
<arrow id="30" Z="9" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" AngularSize="90" Head3D="150 50 0" Tail3D="120 80 0" Center3D="120 50 0" MajorAxisEnd3D="150 50 0" MinorAxisEnd3D="120 80 0" />
<arrow id="31" Z="10" ArrowheadType="Solid" AngularSize="120" Head3D="150 120 0" Tail3D="105 145.98 0" Center3D="120 120 0" MajorAxisEnd3D="150 120 0" MinorAxisEnd3D="120 150 0" />
`;
  const read = (body: string) => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML LineWidth="1" BondLength="14.4"><page id="1">${body}</page></CDXML>`);
  it('reads them as the arrows ChemDraw makes of them', () => {
    const ours = read(legacy), theirs = read(chemdraw);
    expect(ours.stats.skipped).toEqual({});
    const a = [...ours.doc.arrows.values()], b = [...theirs.doc.arrows.values()];
    expect(a.length).toBe(8);
    expect(b.length).toBe(8);
    a.forEach((x, i) => {
      const y = b[i];
      for (const k of ['headStyle', 'tailStyle', 'headType', 'line', 'equilibrium', 'noGo', 'headCenter'] as const) expect([i, k, x[k]]).toEqual([i, k, y[k]]);
      for (const k of ['headLength', 'headWidth', 'sweep'] as const) expect(x[k]).toBeCloseTo(y[k] as number, 6);
      expect(x.shaftSpacing ?? 0).toBeCloseTo(y.shaftSpacing ?? 0, 6);
      for (const end of ['head', 'tail'] as const) { expect(x[end].x).toBeCloseTo(y[end].x, 1); expect(x[end].y).toBeCloseTo(y[end].y, 1); }
    });
  });
  it('keeps a line with no head a line', () => {
    const { doc: d } = read('<graphic id="16" BoundingBox="80 140 20 140" GraphicType="Line" ArrowType="NoHead"/>');
    expect(d.arrows.size).toBe(0);
    expect([...d.shapes.values()][0].kind).toBe('line');
  });
});
