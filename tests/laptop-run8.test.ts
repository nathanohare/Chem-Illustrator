// @vitest-environment jsdom
//
// Fixes from laptop test run 8: SMILES in sheet cells, color palette names, energy diagrams
// (lone ions drawn as lines, distance labels, the turned axis title in pictures, copying a
// diagram picked on its own) and a diagram in a sheet cell.

import { describe, expect, it } from 'vitest';
import { chemPieces, showsChem } from '../src/sheet/cell-text';
import { parsePalettes } from '../src/palettes';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { plainText } from '../src/richtext';
import { ENERGY_DEFAULTS, putEnergy, type EnergyData } from '../src/design/energy';
import { itemBounds, type Item } from '../src/render/vector';
import { extractDrawing } from '../src/io/clipboard';
import { Workbook } from '../src/sheet/workbook';
import { ERR } from '../src/sheet/values';
import type { QmAtom } from '../src/chem/qm-output';

describe('a sheet cell holding SMILES', () => {
  it('keeps its ring digits on the line', () => {
    for (const s of ['C1CCNCC1', 'O=C1CCCC1', 'C1CC2CCCC2C1']) {
      expect(chemPieces(s)).toEqual([{ text: s, pos: 'base' }]);
      expect(showsChem(undefined, s)).toBe(false);
    }
  });
  it('still lowers the counts of a formula', () => {
    expect(chemPieces('C2H5OH').some((p) => p.pos === 'sub')).toBe(true);
    expect(chemPieces('C10H12').some((p) => p.pos === 'sub')).toBe(true);
  });
});

describe('color palettes saved by older versions', () => {
  it('take American names', () => {
    const got = parsePalettes([{ name: 'Colour-blind safe (Okabe–Ito)', colors: ['#000000'] }, { name: 'My colours 2', colors: [] }]);
    expect(got.map((p) => p.name)).toEqual(['Color-blind safe (Okabe–Ito)', 'My colors 2']);
  });
});

const A = (el: string, x: number, y: number, z = 0): QmAtom => ({ el, x, y, z });
// F⁻ + CH3Cl: the reactant complex, and the SN2 transition state F···CH3···Cl
const RC: QmAtom[] = [A('C', 0, 0), A('H', -0.36, 1.03), A('H', -0.36, -0.51, 0.89), A('H', -0.36, -0.51, -0.89), A('Cl', 1.78, 0), A('F', -2.6, 0)];
const TS: QmAtom[] = [A('C', 0, 0), A('H', 0, 1.07), A('H', 0, -0.535, 0.927), A('H', 0, -0.535, -0.927), A('F', -1.95, 0), A('Cl', 2.3, 0)];

const diagram = (more: Partial<EnergyData>) => {
  const data: EnergyData = {
    ...ENERGY_DEFAULTS, quantity: 'ΔH', unit: 'kcal/mol', w: 240, h: 150, distances: true,
    paths: [{ name: '', color: '#000000', points: [{ label: 'R', g: 0 }, { label: 'RC', g: -10, geom: RC }, { label: 'TS‡', g: 5, geom: TS }, { label: 'P', g: -15 }] }],
    ...more,
  };
  const doc = new Doc();
  const m = plainMeasure(doc);
  const id = doc.edit('e', () => putEnergy(doc, m, data, { x: 100, y: 100 }));
  return { doc, m, id };
};

describe('energy diagrams', () => {
  it('draws a lone ion as a small ball when the geometries are lines', () => {
    const { doc } = diagram({ structures: '3d', look3d: 'wire' });
    // F⁻ in the complex, and F and Cl on the transition state (only dashed bonds reach them)
    expect([...doc.shapes.values()].filter((s) => s.kind === 'oval').length).toBe(3);
  });

  it('keeps a 2-D transition state\'s bond lengths clear of its atom labels', () => {
    const { doc, m } = diagram({ structures: '2d' });
    const box = (t: string) => [...doc.captions.values()].filter((c) => plainText(c.runs) === t).map((c) => m.captionBox(c));
    const ch3 = box('CH3')[0];
    expect(ch3).toBeTruthy();
    for (const t of ['1.95', '2.30']) {
      const b = box(t)[0];
      expect(b.x1 < ch3.x2 && ch3.x1 < b.x2 && b.y1 < ch3.y2 && ch3.y1 < b.y2).toBe(false);
    }
  });

  it('copies as itself when picked by its frame alone', () => {
    const { doc, id } = diagram({});
    const part = extractDrawing(doc, { atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set([id]) });
    expect(part.captions.size).toBeGreaterThan(5);
    expect(part.shapes.size).toBeGreaterThan(5);
  });
});

describe('a picture with text turned to read upwards', () => {
  it('takes in the text\'s height to the left of where it starts', () => {
    const t: Item = { kind: 'text', text: '−1', x: 81, y: 159, size: 7.5, family: 'Arial', bold: false, italic: false, color: '#000', widths: [4, 4], angle: 90 };
    const b = itemBounds([t])!;
    expect(b.x1).toBeCloseTo(81 - 7.5 * 0.8, 5);
    expect(b.y1).toBeCloseTo(159 - 8, 5);
  });
});

describe('a diagram in a sheet cell', () => {
  it('has no value, not #VALUE!', () => {
    const wb = new Workbook();
    wb.chem = { structure: () => ERR.value('There is no structure in this cell') } as unknown as Workbook['chem'];
    wb.edit('Put', () => wb.sheet.setCell(0, 0, { structure: { id: 1, contents: { atoms: [], bonds: [], captions: [], arrows: [], shapes: [] } } }));
    wb.recalc();
    expect(wb.sheet.values.get(0) ?? '').toBe('');
  });
});
