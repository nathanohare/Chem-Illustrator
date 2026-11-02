// @vitest-environment jsdom
//
// Arrange in a Row, Column or Grid, and Clean Up doing it by itself when the structures are
// clearly in rows already (two rows of five become an even 2 × 5 grid).

import { describe, expect, it } from 'vitest';
import type { Rect } from '../src/geom';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { defaultColumns, gridOffsets, inferGrid, readRows, usualGap } from '../src/editor/grid-arrange';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

// the editor draws on the next frame; there is no canvas to draw on here
window.requestAnimationFrame = () => 0;

const box = (x: number, y: number, w = 20, h = 20): Rect => ({ x1: x, y1: y, x2: x + w, y2: y + h });
const moved = (b: Rect, d: { x: number; y: number }): Rect => ({ x1: b.x1 + d.x, y1: b.y1 + d.y, x2: b.x2 + d.x, y2: b.y2 + d.y });
const cx = (b: Rect) => (b.x1 + b.x2) / 2, cy = (b: Rect) => (b.y1 + b.y2) / 2;

describe('reading how things are set out', () => {
  it('reads rows top to bottom, each left to right, despite wobbles', () => {
    const bs = [box(100, 3), box(0, 0), box(52, -4), box(0, 60), box(50, 58)];
    expect(readRows(bs)).toEqual([[1, 2, 0], [3, 4]]);
  });

  it('sees two rows of five as a grid five across, one row as a row and one column as a column', () => {
    const two = [...Array(10)].map((_, i) => box((i % 5) * 45 + (i % 3) * 4, Math.floor(i / 5) * 70 + (i % 2) * 6));
    expect(inferGrid(two)).toEqual({ kind: 'grid', cols: 5 });
    expect(inferGrid([box(0, 0), box(40, 5), box(95, -3)])).toEqual({ kind: 'row', cols: 3 });
    expect(inferGrid([box(0, 0), box(4, 40), box(-3, 90)])).toEqual({ kind: 'column', cols: 1 });
    // a last row that is shorter is still a grid
    expect(inferGrid([...two.slice(0, 8)])).toEqual({ kind: 'grid', cols: 5 });
  });

  it('is not sure about uneven rows or things scattered about', () => {
    // 3 then 1 then 3: not a grid
    expect(inferGrid([box(0, 0), box(40, 0), box(80, 0), box(0, 50), box(0, 100), box(40, 100), box(80, 100)])).toBeNull();
    // a column that wanders off sideways
    expect(inferGrid([box(0, 0), box(60, 40), box(0, 90)])).toBeNull();
    // one thing
    expect(inferGrid([box(0, 0)])).toBeNull();
  });
});

describe('setting things out', () => {
  it('a grid: reading order, columns as wide as their widest, even gaps, each centred in its place', () => {
    const bs = [box(0, 0, 30, 20), box(70, 5, 20, 30), box(150, -2, 20, 20), box(3, 60, 20, 20), box(66, 70, 40, 10)];
    const off = gridOffsets(bs, { kind: 'grid', cols: 3, gap: 10 });
    const after = bs.map((b, i) => moved(b, off[i]));
    // first row: 0, 1, 2 centred on one line; second row: 3, 4
    expect(cy(after[0])).toBeCloseTo(cy(after[1]), 6);
    expect(cy(after[1])).toBeCloseTo(cy(after[2]), 6);
    expect(cy(after[3])).toBeCloseTo(cy(after[4]), 6);
    // columns: 0 above 3, 1 above 4
    expect(cx(after[0])).toBeCloseTo(cx(after[3]), 6);
    expect(cx(after[1])).toBeCloseTo(cx(after[4]), 6);
    // column 1 is as wide as its widest (40, from 4): column 0 (30 wide) ends, a gap, then it
    expect(cx(after[1]) - cx(after[0])).toBeCloseTo(30 / 2 + 10 + 40 / 2, 6);
    // row heights: 30 (from 1), then 20
    expect(cy(after[3]) - cy(after[0])).toBeCloseTo(30 / 2 + 10 + 20 / 2, 6);
  });

  it('a row: even gaps, centres on one line; and the whole stays where it was', () => {
    const bs = [box(0, 0, 30, 20), box(50, 12, 10, 40), box(140, -6, 20, 20)];
    const off = gridOffsets(bs, { kind: 'row', gap: 15 });
    const after = bs.map((b, i) => moved(b, off[i]));
    expect(after[1].x1 - after[0].x2).toBeCloseTo(15, 6);
    expect(after[2].x1 - after[1].x2).toBeCloseTo(15, 6);
    expect(cy(after[0])).toBeCloseTo(cy(after[2]), 6);
    const mid = (rs: Rect[]) => ({ x: (Math.min(...rs.map((r) => r.x1)) + Math.max(...rs.map((r) => r.x2))) / 2, y: (Math.min(...rs.map((r) => r.y1)) + Math.max(...rs.map((r) => r.y2))) / 2 });
    expect(mid(after).x).toBeCloseTo(mid(bs).x, 6);
    expect(mid(after).y).toBeCloseTo(mid(bs).y, 6);
  });

  it('defaults to a near-square grid, and keeps the spacing things mostly have', () => {
    expect(defaultColumns(10)).toBe(4);
    expect(defaultColumns(9)).toBe(3);
    expect(defaultColumns(2)).toBe(2);
    const bs = [box(0, 0), box(30, 0), box(62, 0), box(90, 0)];
    expect(usualGap(bs, 14.4)).toBeCloseTo(10, 6);
    // kept within half a bond and four bonds
    expect(usualGap([box(0, 0), box(500, 0), box(1000, 0)], 14.4)).toBeCloseTo(4 * 14.4, 6);
  });
});

describe('in the editor', () => {
  /** A pyridine ring at x, y (a hexagon with one N), and its compound number under it. */
  function pyridine(doc: Doc, x: number, y: number, n: number): { atoms: number[]; num: number } {
    const L = doc.style.bondLength;
    const atoms: number[] = [];
    for (let i = 0; i < 6; i++) atoms.push(doc.addAtom(x + L * Math.cos((i * Math.PI) / 3), y + L * Math.sin((i * Math.PI) / 3), i === 0 ? 7 : 6).id);
    for (let i = 0; i < 6; i++) doc.addBond(atoms[i], atoms[(i + 1) % 6], i % 2 ? 2 : 1);
    const num = doc.addCaption({ x: x - 3, y: y + 1.4 * L, runs: [{ text: String(n) }], justify: 'left' }).id;
    return { atoms, num };
  }
  const editorFor = (doc: Doc) => {
    const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
    const host = document.createElement('div');
    host.append(scene, overlay);
    document.body.append(host);
    const ed = new Editor(doc, new Renderer(scene, overlay), host);
    ed.paused = true;
    // no screen to measure text on here
    const m = plainMeasure(doc);
    Object.assign(ed, { measure: () => m, fullMeasure: () => m });
    return ed;
  };
  const centre = (doc: Doc, atoms: number[]) => ({ x: atoms.reduce((s, id) => s + doc.atoms.get(id)!.x, 0) / atoms.length, y: atoms.reduce((s, id) => s + doc.atoms.get(id)!.y, 0) / atoms.length });

  it('Clean Up evens out two rows of five into a 2 × 5 grid, numbers and all', () => {
    const doc = new Doc();
    const rings = doc.edit('build', () => [...Array(10)].map((_, i) => pyridine(doc, 40 + (i % 5) * 80 + ((i * 7) % 5) * 3, 40 + Math.floor(i / 5) * 90 + ((i * 3) % 4) * 4, i + 1)));
    const numOffset = rings.map((r) => ({ x: doc.captions.get(r.num)!.x - centre(doc, r.atoms).x, y: doc.captions.get(r.num)!.y - centre(doc, r.atoms).y }));
    const ed = editorFor(doc);
    ed.sel.atoms = new Set(doc.atoms.keys());
    expect(ed.cleanUp()).not.toBe(false);
    const cs = rings.map((r) => centre(doc, r.atoms));
    // two rows, each on one line
    for (let i = 1; i < 5; i++) { expect(cs[i].y).toBeCloseTo(cs[0].y, 3); expect(cs[5 + i].y).toBeCloseTo(cs[5].y, 3); }
    // columns line up and are evenly spaced
    for (let i = 0; i < 5; i++) expect(cs[5 + i].x).toBeCloseTo(cs[i].x, 3);
    for (let i = 2; i < 5; i++) expect(cs[i].x - cs[i - 1].x).toBeCloseTo(cs[1].x - cs[0].x, 3);
    // each number moved with its ring, though only the rings were picked
    rings.forEach((r, i) => {
      const c = centre(doc, r.atoms);
      expect(doc.captions.get(r.num)!.x - c.x).toBeCloseTo(numOffset[i].x, 3);
      expect(doc.captions.get(r.num)!.y - c.y).toBeCloseTo(numOffset[i].y, 3);
    });
    // one undo takes it all back
    doc.undo();
    expect(centre(doc, rings[1].atoms).x).not.toBeCloseTo(cs[1].x, 1);
  });

  it('Clean Up leaves structures alone when it isn\'t clear how they go (rows of 1, 2 and 1)', () => {
    const doc2 = new Doc();
    const r2 = doc2.edit('build', () => [pyridine(doc2, 0, 0, 1), pyridine(doc2, 0, 90, 2), pyridine(doc2, 90, 90, 3), pyridine(doc2, 0, 180, 4)]);
    const ed2 = editorFor(doc2);
    ed2.sel.atoms = new Set(doc2.atoms.keys());
    const b2 = r2.map((r) => centre(doc2, r.atoms));
    ed2.cleanUp();
    r2.forEach((r, i) => { const c = centre(doc2, r.atoms); expect(c.x).toBeCloseTo(b2[i].x, 3); expect(c.y).toBeCloseTo(b2[i].y, 3); });
  });

  it('Arrange in a Grid sets out a row of nine three across', () => {
    const doc = new Doc();
    const rings = doc.edit('build', () => [...Array(9)].map((_, i) => pyridine(doc, i * 70, (i % 2) * 8, i + 1)));
    const ed = editorFor(doc);
    ed.sel.atoms = new Set(doc.atoms.keys());
    expect(ed.gridCount()).toBe(9);
    expect(ed.arrangeGrid({ kind: 'grid', cols: 3, gap: 20 })).toBe(true);
    const cs = rings.map((r) => centre(doc, r.atoms));
    // 1 2 3 / 4 5 6 / 7 8 9
    expect(cs[3].x).toBeCloseTo(cs[0].x, 3);
    expect(cs[6].x).toBeCloseTo(cs[0].x, 3);
    expect(cs[1].y).toBeCloseTo(cs[0].y, 3);
    expect(cs[3].y).toBeGreaterThan(cs[0].y + 20);
    // again: already so
    expect(ed.arrangeGrid({ kind: 'grid', cols: 3, gap: 20 })).toBe(false);
    // and into a column
    expect(ed.arrangeGrid({ kind: 'column', gap: 20 })).toBe(true);
    const col = rings.map((r) => centre(doc, r.atoms));
    for (let i = 1; i < 9; i++) { expect(col[i].x).toBeCloseTo(col[0].x, 3); expect(col[i].y).toBeGreaterThan(col[i - 1].y); }
  });
});
