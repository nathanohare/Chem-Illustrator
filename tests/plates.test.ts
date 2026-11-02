import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { ACS_1996 } from '../src/style';
import { POINTS } from '../src/editor/arrange';
import { bandPosition, mix, newPlate, parseMarks, putPlate, plateFrameOf } from '../src/design/plates';

describe('TLC plates and gels', () => {
  it('reads spots with their words', () => {
    expect(parseMarks('0.45, 0.2 faint streak; 0.1 big blue')).toEqual([
      { at: 0.45, strength: 0.85, size: 1, tail: 0 },
      { at: 0.2, strength: 0.4, size: 1, tail: 0.12 },
      { at: 0.1, strength: 0.85, size: 1.4, tail: 0, color: '#2b5bb5' },
    ]);
    expect(parseMarks('abc, , -1')).toEqual([]);
  });

  it('runs bands on a log scale, big ones at the top', () => {
    const top = bandPosition(10, 10, 0.5), bottom = bandPosition(0.5, 10, 0.5), mid = bandPosition(Math.sqrt(5), 10, 0.5);
    expect(top).toBeLessThan(0.1);
    expect(bottom).toBeGreaterThan(0.9);
    expect(mid).toBeCloseTo(0.5, 5);
  });

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });

  it('draws a plate in a frame that keeps its lanes, and draws it again in place', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const d = newPlate('tlc', doc.style.bondLength);
    let id = 0;
    doc.edit('TLC', () => { id = putPlate(doc, POINTS, d, { x: 0, y: 0 }); });
    const frame = doc.shapes.get(id)!;
    expect(frame.plate?.lanes.length).toBe(3);
    // a plate, two lines, and the spots (1 + 2 + 2)
    const ovals = frame.frame!.shapes.filter((s) => doc.shapes.get(s)?.kind === 'oval');
    expect(ovals.length).toBe(5);
    const someCaption = frame.frame!.captions[0];
    expect(plateFrameOf(doc, 'caption', someCaption)).toBe(id);
    const before = doc.shapes.size;
    doc.edit('Edit', () => { putPlate(doc, POINTS, { ...frame.plate!, lanes: [{ label: 'A', marks: '0.5' }] }, { x: 0, y: 0 }, id); });
    expect(doc.shapes.get(id)!.plate!.lanes.length).toBe(1);
    expect(doc.shapes.size).toBeLessThan(before);
  });

  it('draws a gel with its marker sizes', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const d = newPlate('gel', doc.style.bondLength);
    let id = 0;
    doc.edit('Gel', () => { id = putPlate(doc, POINTS, d, { x: 0, y: 0 }); });
    const texts = doc.shapes.get(id)!.frame!.captions.map((c) => doc.captions.get(c)!.runs.map((r) => r.text).join(''));
    expect(texts).toContain('10');
    expect(texts).toContain('0.5');
    expect(texts).toContain('kb');
  });
});
