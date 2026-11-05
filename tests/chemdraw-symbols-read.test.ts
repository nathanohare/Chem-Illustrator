// @vitest-environment jsdom
//
// Symbols, ring-fusion H marks and arrow marks from CDXML, and drawn at the sizes ChemDraw 25 draws
// them (measured from its SVGs at several sizes and line widths, 2026-11-03).

import { describe, it, expect } from 'vitest';
import { readCdxml, CURVE_ARROW_TAG } from '../src/io/cdxml';
import { cdxmlToCdx, cdxToCdxml } from '../src/io/cdx';
import { freeformPoints } from '../src/design/geo';
import { recordPicture } from '../src/render/picture';

const read = (body: string, root = 'LineWidth="1"') => readCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML ${root}><page id="1">${body}</page></CDXML>`);

interface Seg { k: string; x: number; y: number }
/** Every stroked line in the picture of this drawing, as [start, end]. */
const lines = (doc: ReturnType<typeof read>['doc']): [Seg, Seg][] => {
  const out: [Seg, Seg][] = [];
  for (const i of recordPicture(doc)!.items) {
    if (i.kind !== 'path' || !i.stroke) continue;
    const segs = i.segs as Seg[];
    segs.forEach((g, k) => { if (g.k === 'L' && segs[k - 1]) out.push([segs[k - 1], g]); });
  }
  return out;
};
const across = (l: [Seg, Seg]) => Math.hypot(l[1].x - l[0].x, l[1].y - l[0].y);

describe('ring-fusion H marks', () => {
  const frag = (attr: string) => read(`<fragment id="2"><n id="10" p="50 50" ${attr}/><n id="11" p="24 65"/><n id="12" p="76 65"/><n id="13" p="50 20"/><b id="20" B="10" E="11"/><b id="21" B="10" E="12"/><b id="22" B="10" E="13"/></fragment>`);
  it('read from HDot and HDash, with no warning', () => {
    for (const [attr, want] of [['HDot="yes"', 'dot'], ['HDash="yes"', 'dash']] as const) {
      const { doc, stats } = frag(attr);
      expect(doc.atoms.get(10)!.hDot).toBe(want);
      expect(stats.skipped).toEqual({});
    }
    expect(frag('').doc.atoms.get(10)!.hDot).toBeUndefined();
  });
});

describe('a label stacked above or below', () => {
  it('wins over centred', () => {
    const { doc } = read('<fragment id="2"><n id="10" p="50 50"/><n id="11" p="80 50" Element="7" NumHydrogens="0"><t Justification="Center" LabelAlignment="Below"><s font="3" size="10">NMe</s></t></n><b id="20" B="10" E="11"/></fragment>');
    const a = doc.atoms.get(11)!;
    expect(a.stacked).toBe('down');
    expect(a.centred).toBeUndefined();
  });
});

describe('symbols', () => {
  const sym = (type: string, box = '100 100 106 100') => [...read(`<graphic id="30" BoundingBox="${box}" GraphicType="Symbol" SymbolType="${type}"/>`).doc.shapes.values()][0];
  it('keep their two points where ChemDraw has two: a lone pair, its bar, a radical ion', () => {
    for (const type of ['LonePair', 'LonePairBar', 'RadicalCation', 'RadicalAnion']) {
      expect(sym(type, '100 100 100 106')).toMatchObject({ kind: 'symbol', symbol: type, x1: 100, y1: 100, x2: 100, y2: 106 });
    }
  });
  it('map Dagger one to one, a centre and a width', () => {
    expect(sym('Dagger')).toMatchObject({ symbol: 'Dagger', x1: 97, y1: 97, x2: 103, y2: 103 });
  });
  it("draw a radical cation's sign about its second point, as long as ChemDraw 25 draws it", () => {
    const { doc } = read('<graphic id="30" BoundingBox="100 100 106 100" GraphicType="Symbol" SymbolType="RadicalCation"/>');
    const arms = lines(doc);
    expect(arms).toHaveLength(2);
    for (const l of arms) {
      expect(across(l)).toBeCloseTo(6.333, 2);
      expect((l[0].x + l[1].x) / 2).toBeCloseTo(106, 6);
    }
  });
  it("draw a plus as long as ChemDraw 25 draws it, however wide its box", () => {
    const { doc } = read('<graphic id="30" BoundingBox="100 100 112 100" GraphicType="Symbol" SymbolType="Plus"/>');
    for (const l of lines(doc)) expect(across(l)).toBeCloseTo(6.333, 2);
  });
});

describe('arrow marks', () => {
  const arrow = (mark: string) => read(`<arrow id="5" ArrowheadHead="Full" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" ${mark} Head3D="130 60 0" Tail3D="30 60 0"/>`).doc;
  const marks = (mark: string) => lines(arrow(mark)).filter((l) => Math.abs(l[0].y - l[1].y) > 1);
  it('read NoGo Hash and Dipole', () => {
    const hash = arrow('NoGo="Hash"').arrows.get(5)!;
    expect([hash.noGo, hash.noGoKind]).toEqual([true, 'hash']);
    const cross = arrow('NoGo="Cross"').arrows.get(5)!;
    expect([cross.noGo, cross.noGoKind]).toEqual([true, undefined]);
    expect(arrow('Dipole="yes"').arrows.get(5)!.dipole).toBe(true);
    expect(arrow('Dipole="no"').arrows.get(5)!.dipole).toBeUndefined();
  });
  it('draw where ChemDraw 25 draws them, sized by the head width', () => {
    // no-go cross: 2 head half-widths each way about the middle
    for (const l of marks('NoGo="Cross"')) {
      expect(Math.abs(l[1].x - l[0].x)).toBeCloseTo(10, 6);
      expect(Math.abs(l[1].y - l[0].y)).toBeCloseTo(10, 6);
    }
    // hash: two slashes, a half-width each side of the middle, from upper right to lower left
    const hash = marks('NoGo="Hash"');
    expect(hash.map((l) => (l[0].x + l[1].x) / 2).sort((a, b) => a - b)).toEqual([77.5, 82.5]);
    for (const l of hash) {
      expect(Math.abs(l[1].y - l[0].y)).toBeCloseTo(10, 6);
      expect(Math.abs(l[1].x - l[0].x)).toBeCloseTo(5, 6);
      const [top, bottom] = l[0].y < l[1].y ? l : [l[1], l[0]];
      expect(top.x).toBeGreaterThan(bottom.x);
    }
    // dipole: a half-width in from the tail, a head's width long
    const [d] = marks('Dipole="yes"');
    expect(d[0].x).toBeCloseTo(32.5, 6);
    expect(d[1].x).toBeCloseTo(32.5, 6);
    expect(Math.abs(d[1].y - d[0].y)).toBeCloseTo(5, 6);
  });
});

describe('a dipole arrow in CDX', () => {
  it('has a mark with no data, as ChemDraw 25 writes it (it refuses a file with a byte there)', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><arrow id="5" Dipole="yes" Head3D="130 60 0" Tail3D="30 60 0"/></page></CDXML>';
    const cdx = cdxmlToCdx(xml);
    expect(Buffer.from(cdx).toString('hex')).toContain('3a0a0000');
    expect(cdxToCdxml(cdx)).toContain('Dipole="yes"');
  });
});

describe('an open curve with no heads', () => {
  const pts = '150 200 150 200 170 180 190 180 210 200 210 200';
  it('reads as a Freeform curve, with its own points, and dashed or bold as ChemDraw has it', () => {
    const { doc } = read(`<curve id="7" CurvePoints="${pts}"/><curve id="8" CurvePoints="${pts}" CurveType="2"/>`);
    expect(doc.arrows.size).toBe(0);
    const s = doc.shapes.get(7)!;
    expect(s.kind).toBe('geo');
    const f = freeformPoints(s as Required<Pick<typeof s, 'geo' | 'x1' | 'y1' | 'x2' | 'y2'>>)!;
    expect(f.closed).toBe(false);
    expect(f.pts.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[150, 200], [170, 180], [190, 180], [210, 200]]);
    expect(doc.shapes.get(8)!.dashed).toBe(true);
  });
  it('stays an arrow when it has a head, or our tag says it is one', () => {
    const { doc } = read(`<curve id="7" CurvePoints="${pts}" CurveType="8"/><curve id="9" CurvePoints="${pts}"><objecttag TagType="String" Name="${CURVE_ARROW_TAG}" Value="{}" Visible="no"/></curve>`);
    expect(doc.shapes.size).toBe(0);
    expect(doc.arrows.size).toBe(2);
  });
});
