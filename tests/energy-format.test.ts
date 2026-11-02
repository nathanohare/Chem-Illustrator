// @vitest-environment jsdom
//
// The Energy Diagram window's Position column (each species' place along the reaction
// coordinate) and its Format part (font, sizes, line widths, axis color and titles, background).

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { columnXs, ENERGY_DEFAULTS, putEnergy, type EnergyData } from '../src/design/energy';
import { plainText } from '../src/richtext';

const data = (more: Partial<EnergyData> = {}): EnergyData => ({
  ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol', w: 200, h: 120,
  paths: [{ name: '', color: '#000000', points: [{ label: 'SM', g: 0 }, { label: 'TS‡', g: 20 }, { label: 'Int', g: 5 }, { label: 'P', g: -4 }] }],
  ...more,
});

describe('species positions along the reaction coordinate', () => {
  it('spaces columns evenly when none are given, as before', () => {
    expect(columnXs(4, 200)).toEqual([25, 75, 125, 175]);
    expect(columnXs(4, 200, [null, 3, null, null])).toEqual([25, 75, 125, 175]);
  });

  it('places them by the numbers typed, the ends half a column in', () => {
    const x = columnXs(4, 200, [0, 1, 1.5, 3]);
    expect(x[0]).toBeCloseTo(25);
    expect(x[3]).toBeCloseTo(175);
    expect(x[1]).toBeCloseTo(75);
    expect(x[2]).toBeCloseTo(100);
  });

  it('fills a gap evenly between the numbers either side', () => {
    const x = columnXs(4, 200, [0, null, 4, 6]);
    expect(x[1]).toBeCloseTo(25 + (2 / 6) * 150);
  });

  it('draws the levels where the positions say', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    doc.edit('e', () => putEnergy(doc, m, data({ xs: [0, 1, 1.25, 3] }), { x: 100, y: 100 }));
    const f = [...doc.shapes.values()].find((s) => s.energy)!.frame!;
    const levels = f.shapes.map((id) => doc.shapes.get(id)!).filter((s) => s.kind === 'line' && s.bold).map((s) => (s.x1 + s.x2) / 2 - 100);
    expect(levels.map((v) => Math.round(v))).toEqual(columnXs(4, 200, [0, 1, 1.25, 3]).map((v) => Math.round(v)));
  });
});

describe('the diagram\'s format', () => {
  it('gives text, lines, axes and background the look asked for, and keeps it', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    const look = { font: 'Lato', labelSize: 11, valueSize: 8, axisSize: 9, levelWidth: 3, joinWidth: 0.5, axisWidth: 1.2, axisColor: '#2f5597', xTitle: 'Reaction progress', yTitle: 'Free energy', background: '#fff2cc', border: '#000000', borderWidth: 0.75 };
    doc.edit('e', () => putEnergy(doc, m, data({ look }), { x: 100, y: 100 }));
    const s = [...doc.shapes.values()].find((x) => x.energy)!;
    expect(s.energy!.look).toEqual(look);
    expect(s).toMatchObject({ filled: true, fillColor: '#fff2cc', color: '#000000', lineWidth: 0.75 });
    const caps = s.frame!.captions.map((id) => doc.captions.get(id)!);
    const named = (t: string) => caps.find((c) => plainText(c.runs) === t)!;
    expect(named('SM').runs[0]).toMatchObject({ font: 'Lato', size: 11 });
    expect(named('0.0').runs[0]).toMatchObject({ font: 'Lato', size: 8 });
    expect(named('Reaction progress').runs[0]).toMatchObject({ size: 9 });
    expect(named('Free energy')).toBeTruthy();
    const lines = s.frame!.shapes.map((id) => doc.shapes.get(id)!).filter((x) => x.kind === 'line');
    expect(lines.filter((x) => x.bold).every((x) => x.lineWidth === 3)).toBe(true);
    expect(lines.some((x) => x.dashed && x.lineWidth === 0.5)).toBe(true);
    expect(lines.some((x) => x.color === '#2f5597' && x.lineWidth === 1.2)).toBe(true);
  });

  it('without a look, the frame stays unfilled and borderless', () => {
    const doc = new Doc();
    doc.edit('e', () => putEnergy(doc, plainMeasure(doc), data(), { x: 100, y: 100 }));
    expect([...doc.shapes.values()].find((x) => x.energy)).toMatchObject({ filled: false, lineWidth: 0 });
  });
});
