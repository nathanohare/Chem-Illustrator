// @vitest-environment jsdom
//
// A drawing from ChemDraw keeps how it looked (Nate, 2026-11-03: paste must be lossless): ring
// fills, bold labels, right-justified phosphines (Cy₃P), and the layers of crossing bonds. The test
// drawing is our own, as ChemDraw 25 saved it (tests/fixtures/chemdraw-clipboard/README.md).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readCdxml, cycleOf } from '../src/io/cdxml';
import { cdxToCdxml } from '../src/io/cdx';
import { fitPasted } from '../src/io/fit-drawing';
import { insertDrawing } from '../src/io/clipboard';
import { crossingGaps } from '../src/chem/crossing';
import { Doc } from '../src/model';
import { labelSpec, layoutLabel } from '../src/chem/labels';
import { ACS_1996, bondWidths, labelBold } from '../src/style';

const dir = 'tests/fixtures/chemdraw-clipboard/';
const fromChemDraw = () => readCdxml(readFileSync(dir + 'clip-props.cd.cdxml', 'utf8')).doc;
const fromClipboard = () => readCdxml(cdxToCdxml(new Uint8Array(readFileSync(dir + 'clip-props.cd.cdx')))).doc;

describe('a drawing from ChemDraw', () => {
  for (const [how, read] of [['saved as CDXML', fromChemDraw], ['copied (CDX)', fromClipboard]] as const) {
    it(`keeps its ring fills, ${how}`, () => {
      const doc = read();
      const fills = [...doc.shapes.values()].filter((s) => s.kind === 'ring');
      expect(fills.map((s) => s.fillColor).sort()).toEqual(['#bedaff', '#beffbe']);
      for (const s of fills) {
        expect(s.filled).toBe(true);
        expect(s.ring).toHaveLength(6);
        expect(s.ring!.every((id) => doc.atoms.has(id))).toBe(true);
      }
    });
  }

  it('keeps its bold labels, and they stay bold pasted into a drawing with plain labels', () => {
    const doc = fromChemDraw();
    expect(doc.style.labelFace).toBe(97);
    const labelled = [...doc.atoms.values()].filter((a) => a.label);
    expect(labelled.length).toBeGreaterThan(4);
    for (const a of labelled) expect(labelBold(doc.style, a)).toBe(true);
    fitPasted(doc, ACS_1996);
    for (const a of doc.atoms.values()) if (a.label) expect(labelBold(ACS_1996, a)).toBe(true);
  });

  it('keeps its hash spacing and wedge widths pasted into a drawing of another style', () => {
    const doc = fromChemDraw();
    const before = [...doc.bonds.values()].map((b) => bondWidths(doc.style, b));
    fitPasted(doc, ACS_1996);
    [...doc.bonds.values()].forEach((b, i) => {
      const w = bondWidths(ACS_1996, b);
      expect(w.hashSpacing).toBeCloseTo(before[i].hashSpacing, 3);
      expect(w.boldWidth).toBeCloseTo(before[i].boldWidth, 3);
      expect(w.marginWidth).toBeCloseTo(before[i].marginWidth, 3);
    });
  });

  it('keeps the layers of crossing bonds: the gray bonds behind', () => {
    const doc = fromChemDraw();
    const gray = [...doc.bonds.values()].filter((b) => b.color === '#808080');
    const black = [...doc.bonds.values()].filter((b) => !b.color);
    expect(gray.length).toBe(4);
    const top = Math.max(...gray.map((b) => b.z ?? -Infinity));
    expect(black.filter((b) => b.z !== undefined).every((b) => b.z! > top)).toBe(true);
  });
});

describe('phosphine labels', () => {
  const runs = (label: string, just: 'left' | 'right') => {
    const spec = labelSpec(15, label, 0, 0, 1, 1, true, false)!;
    return layoutLabel(spec, [{ x: 0, y: 1 }], 10, (t, s) => t.length * s * 0.6, just).runs.map((r) => (r.size < 10 ? '_' : '') + r.text).join('');
  };
  it('read Cy₃P, Ph₃P and tBu₃P on the right, as ChemDraw shows them, with the counts lowered', () => {
    expect(runs('PCy3', 'left')).toBe('Cy_3P');
    expect(runs('PPh3', 'left')).toBe('Ph_3P');
    expect(runs('PtBu3', 'left')).toBe('tBu_3P');
    expect(runs('PCy3', 'right')).toBe('PCy_3');
  });
});

describe('ring fills from bonds', () => {
  it('go round the loop in order, and only a closed one', () => {
    const doc = fromChemDraw();
    const fill = [...doc.shapes.values()].find((s) => s.kind === 'ring')!;
    const bonds = [...doc.bonds.values()].filter((b) => fill.ring!.includes(b.a1) && fill.ring!.includes(b.a2)).map((b) => b.id);
    const ring = cycleOf(doc, bonds)!;
    expect(ring).toHaveLength(6);
    expect(cycleOf(doc, bonds.slice(1))).toBeNull();
  });
});

describe('what ChemDraw says crosses', () => {
  it('leaves gaps where ChemDraw does, near misses included', () => {
    const doc = fromChemDraw();
    const gray = doc.bonds.get(1038)!;
    expect(gray.crossing).toEqual(expect.arrayContaining([1017, 1018, 1025, 1040]));
    // the bonds it lists know it too
    expect(doc.bonds.get(1025)!.crossing).toContain(1038);
    const withList = crossingGaps(doc, gray, 3);
    const geometric = crossingGaps(doc, { ...gray, crossing: undefined }, 3);
    expect(withList.length).toBeGreaterThan(geometric.length);
  });

  it('are the copies when pasted', () => {
    const src = fromChemDraw();
    const doc = new Doc();
    const sel = insertDrawing(doc, src, { x: 0, y: 0 });
    for (const id of sel.bonds) for (const o of doc.bonds.get(id)!.crossing ?? []) expect(sel.bonds.has(o)).toBe(true);
    expect([...sel.bonds].some((id) => doc.bonds.get(id)!.crossing?.length)).toBe(true);
  });
});

describe('labels ChemDraw centres', () => {
  it('sit with their middle on the atom (Ru, Si)', () => {
    const spec = { ...labelSpec(44, 'Ru', 0, 0, 3, 3, true, false)!, centred: true };
    const lay = layoutLabel(spec, [{ x: 1, y: 0 }], 10, (t, s) => t.length * s * 0.6, 'auto');
    const x1 = Math.min(...lay.boxes.map((b) => b.x1)), x2 = Math.max(...lay.boxes.map((b) => b.x2));
    expect(x1 + x2).toBeCloseTo(0, 6);
  });
});

describe('ChemDraw shapes and highlights', () => {
  const cdxml = `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.4" LineWidth="1"><colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="0" g="0.4157" b="0.8353"/><color r="1" g="0.2706" b="0.2706"/></colortable><page id="1">
<fragment id="2" Z="1"><n id="10" p="50 50" Z="2" highlightColor="5"/><n id="11" p="64.4 50" Z="3"/><b id="20" B="10" E="11" Z="4"/></fragment>
<graphic id="30" BoundingBox="72 50 64.4 50" Z="9" color="4" GraphicType="Oval" OvalType="Circle" FadePercent="300" Center3D="64.4 50 0" MajorAxisEnd3D="72 50 0" MinorAxisEnd3D="64.4 57.6 0"/></page></CDXML>`;
  it('fill a faded circle with its colour faded, keeping the outline, and draw it over the structure behind', () => {
    const { doc } = readCdxml(cdxml);
    const s = doc.shapes.get(30)!;
    expect(s.filled).toBe(true);
    expect(s.color).toBe('#006ad5');
    expect(s.fillColor).toBe('#b3d2f2');
    expect(s.stack).toBeGreaterThan(doc.atoms.get(11)!.stack!);
  });
  it('keep ChemDraw atom highlights, as large as ChemDraw draws them', () => {
    const { doc } = readCdxml(cdxml);
    const a = doc.atoms.get(10)!;
    expect(a.highlight).toBe('#ff4545');
    expect(a.hl?.shape).toBe('round');
    expect(0.27 * 14.4 * a.hl!.size!).toBeCloseTo(0.27 * 14.4 + 0.5, 6);
  });
});

describe("ChemDraw's own clipboard", () => {
  it('reads the same as the saved drawing (ChemDraw puts only CDX on it, no CDXML)', () => {
    const formats = readFileSync(dir + 'from-chemdraw/formats.txt', 'utf8');
    expect(formats).toContain('ChemDraw Interchange Format');
    expect(formats).not.toMatch(/xml/i);
    const a = readCdxml(cdxToCdxml(new Uint8Array(readFileSync(dir + 'from-chemdraw/chemdraw-interchange-format.cdx')))).doc;
    const b = fromChemDraw();
    expect([a.atoms.size, a.bonds.size, a.shapes.size, a.captions.size]).toEqual([b.atoms.size, b.bonds.size, b.shapes.size, b.captions.size]);
    expect(a.style.labelFace).toBe(97);
    expect([...a.shapes.values()].filter((s) => s.kind === 'ring')).toHaveLength(2);
    expect([...a.bonds.values()].filter((x) => x.crossing?.length).length).toBe([...b.bonds.values()].filter((x) => x.crossing?.length).length);
  });
});

describe('frames pasted from ChemDraw', () => {
  it('keep their line width in a drawing with thinner lines', () => {
    const doc = fromChemDraw();
    const frames = [...doc.shapes.values()].filter((s) => s.kind === 'rect');
    const before = frames.map((s) => s.lineWidth ?? doc.style.lineWidth);
    fitPasted(doc, ACS_1996);
    frames.forEach((s, i) => expect(doc.shapes.get(s.id)!.lineWidth ?? ACS_1996.lineWidth).toBeCloseTo(before[i], 6));
  });
});
