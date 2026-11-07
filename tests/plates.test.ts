// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { ACS_1996 } from '../src/style';
import { POINTS } from '../src/editor/arrange';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { bandPosition, mix, spotRows, spotSummary, spotText, newPlate, parseMarks, putPlate, plateFrameOf, plateFromBox, rfAtY, setMarkAt, tlcGeometry, tlcSpotAt } from '../src/design/plates';

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

  it('moves one spot to a new Rf and keeps its words', () => {
    expect(setMarkAt('0.55 streak, 0.30 faint', 0, 0.7)).toBe('0.70 streak, 0.30 faint');
    expect(setMarkAt('0.55 streak, 0.30 faint', 1, 0.12)).toBe('0.55 streak, 0.12 faint');
    // (what parseMarks skips isn't counted)
    expect(setMarkAt('abc, 0.4; 0.2 blue', 1, 0.25)).toBe('abc, 0.4; 0.25 blue');
    expect(setMarkAt('0.5', 3, 0.1)).toBe('0.5');
  });

  it('reads the Rf from a height on the plate, between the start line and the solvent front', () => {
    const d = newPlate('tlc', 30);
    const at = { x: 0, y: 0 };
    const g = tlcGeometry(d, at, 30);
    expect(rfAtY(d, at, 30, g.origin)).toBe(0);
    expect(rfAtY(d, at, 30, g.front)).toBe(1);
    expect(rfAtY(d, at, 30, (g.origin + g.front) / 2)).toBe(0.5);
    expect(rfAtY(d, at, 30, g.origin + 50)).toBe(0);
    expect(rfAtY(d, at, 30, g.front - 50)).toBe(1);
  });

  it('finds the spot under the pointer', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const L = doc.style.bondLength;
    const d = newPlate('tlc', L);
    let id = 0;
    doc.edit('TLC', () => { id = putPlate(doc, POINTS, d, { x: 10, y: 20 }); });
    const s = doc.shapes.get(id)!;
    const at = plateFromBox({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }, s.plate!, L).at;
    expect(at.x).toBeCloseTo(10, 5);
    expect(at.y).toBeCloseTo(20, 5);
    const g = tlcGeometry(d, at, L);
    // lane 2 ("co"): 0.55 and 0.30
    const cx = at.x + 1.5 * g.laneW;
    expect(tlcSpotAt(d, at, L, { x: cx, y: g.yOf(0.3) })).toEqual({ lane: 1, index: 1 });
    expect(tlcSpotAt(d, at, L, { x: cx, y: g.yOf(0.55) })).toEqual({ lane: 1, index: 0 });
    expect(tlcSpotAt(d, at, L, { x: cx, y: g.yOf(0.9) })).toBeNull();
    expect(tlcSpotAt(d, at, L, { x: at.x - 5, y: g.yOf(0.3) })).toBeNull();
  });

  it('keeps a locked plate locked through a saved file', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    doc.edit('TLC', () => { putPlate(doc, POINTS, { ...newPlate('tlc', doc.style.bondLength), locked: true }, { x: 0, y: 0 }); });
    const back = readCdxml(writeCdxml(doc)).doc;
    const plate = [...back.shapes.values()].find((s) => s.plate)?.plate;
    expect(plate?.locked).toBe(true);
    expect(plate?.lanes.map((l) => l.marks)).toEqual(['0.55', '0.55, 0.30', '0.55 faint, 0.30']);
  });

  it('shows a lane\'s spots as rows (Rf and Description) and writes them back', () => {
    const rows = spotRows('0.55 faint streak, 0.30; 0.1 big blue, 0.2 dark tiny grey');
    expect(rows).toEqual([
      { rf: '0.55', strength: 'faint', size: '', streak: true, color: '' },
      { rf: '0.30', strength: '', size: '', streak: false, color: '' },
      { rf: '0.1', strength: '', size: 'large', streak: false, color: 'blue' },
      { rf: '0.2', strength: 'strong', size: 'small', streak: false, color: 'gray' },
    ]);
    const text = spotText(rows);
    expect(text).toBe('0.55 faint streak, 0.30, 0.1 large blue, 0.2 strong small gray');
    // the plate draws the same spots from the rewritten text
    expect(parseMarks(text)).toEqual(parseMarks('0.55 faint streak, 0.30; 0.1 big blue, 0.2 dark tiny grey'));
    expect(spotText([...rows, { rf: ' ', strength: 'faint', size: '', streak: false, color: '' }])).toBe(text);
    expect(spotSummary(rows[0])).toBe('Faint, streak');
    expect(spotSummary(rows[1])).toBe('Normal');
    expect(spotSummary(rows[2])).toBe('Large, blue');
  });
});
