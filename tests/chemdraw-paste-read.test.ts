// @vitest-environment jsdom
//
// A drawing from ChemDraw keeps how it looked (Nate, 2026-11-03: paste must be lossless): ring
// fills, bold labels, right-justified phosphines (Cy₃P), and the layers of crossing bonds. The test
// drawing is our own, as ChemDraw 25 saved it (tests/fixtures/chemdraw-clipboard/README.md).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readCdxml, cycleOf } from '../src/io/cdxml';
import { cdxToCdxml } from '../src/io/cdx';
import { fitPasted } from '../src/io/clipboard';
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
