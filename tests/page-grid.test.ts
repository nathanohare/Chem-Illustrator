// @vitest-environment jsdom
//
// The drawing as a grid of pages (page-grid.ts): pages added as the drawing grows, fixed edges it
// can't go past, the pages in use, wrapping a paste at the page's edge, and the grid in the CDXML file.

import { describe, expect, it } from 'vitest';
import { Doc, keepOnPage, type PageSetup } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { hatchBand } from '../src/ui/page-grid-view';
import {
  pageExtent, pageCount, wallRect, inWalls, clampMove, crossesWalls, scrollBox, usedPages, pagesToPrint,
  setWall, wrapPieces, pageTag, readPageTag, atFirstPage, parsePageLook, DEFAULT_PAGE_LOOK, fixedCount, extentRect,
} from '../src/page-grid';

const letter = (more: Partial<PageSetup> = {}): PageSetup => ({ w: 540, h: 720, grow: true, ...more });
const box = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });

function drawing(x: number, y: number): Doc {
  const doc = new Doc();
  doc.edit('build', () => { const a = doc.addAtom(x, y, 6).id, b = doc.addAtom(x + 14, y, 6).id; doc.addBond(a, b, 1); });
  return doc;
}

describe('the pages a drawing has', () => {
  it('starts with one page', () => {
    expect(pageExtent(letter(), null)).toEqual({ c0: 0, c1: 0, r0: 0, r1: 0 });
    expect(pageExtent(letter(), box(10, 10, 100, 100))).toEqual({ c0: 0, c1: 0, r0: 0, r1: 0 });
  });

  it('adds whole pages as the drawing goes past them, right and down', () => {
    expect(pageExtent(letter(), box(10, 10, 600, 100))).toEqual({ c0: 0, c1: 1, r0: 0, r1: 0 });
    expect(pageExtent(letter(), box(10, 10, 1100, 1500))).toEqual({ c0: 0, c1: 2, r0: 0, r1: 2 });
    // right on a boundary is still the page before it
    expect(pageExtent(letter(), box(10, 10, 540, 720))).toEqual({ c0: 0, c1: 0, r0: 0, r1: 0 });
  });

  it('shrinks back when things go, never below one page', () => {
    expect(pageCount(pageExtent(letter(), box(10, 10, 20, 20)))).toEqual({ across: 1, down: 1 });
  });

  it('keeps as many pages as the file was set to have', () => {
    expect(pageCount(pageExtent(letter({ across: 3, down: 2 }), box(10, 10, 20, 20)))).toEqual({ across: 3, down: 2 });
  });

  it('never grows past the fixed top and left edges (a new drawing\'s)', () => {
    expect(pageExtent(letter(), box(-300, -300, 20, 20))).toEqual({ c0: 0, c1: 0, r0: 0, r1: 0 });
  });

  it('grows up and left when those edges are free', () => {
    expect(pageExtent(letter({ walls: {} }), box(-300, -800, 20, 20))).toEqual({ c0: -1, c1: 0, r0: -2, r1: 0 });
  });

  it('keeps to a fixed right edge, which is always the grid\'s edge', () => {
    expect(pageExtent(letter({ walls: { l: 0, t: 0, r: 1 } }), box(10, 10, 2000, 20))).toEqual({ c0: 0, c1: 1, r0: 0, r1: 0 });
    expect(pageExtent(letter({ walls: { l: 0, t: 0, r: 1 } }), box(10, 10, 20, 20))).toEqual({ c0: 0, c1: 1, r0: 0, r1: 0 });
  });

  it('is a set number of pages when kept to them', () => {
    const p = letter({ grow: false, across: 2, down: 3 });
    expect(pageExtent(p, box(10, 10, 5000, 5000))).toEqual({ c0: 0, c1: 1, r0: 0, r1: 2 });
    expect(wallRect(p)).toEqual(box(0, 0, 1080, 2160));
  });
});

describe('fixed edges', () => {
  it('are a box things stay inside, open on free sides', () => {
    const w = wallRect(letter());
    expect(w.x1).toBe(0);
    expect(w.y1).toBe(0);
    expect(w.x2).toBe(Infinity);
    expect(inWalls({ x: -5, y: 30 }, w)).toEqual({ x: 0, y: 30 });
    expect(inWalls({ x: 900, y: 30 }, w)).toEqual({ x: 900, y: 30 });
  });

  it('stop a move at the edge', () => {
    const w = wallRect(letter({ walls: { l: 0, t: 0, r: 0 } }));
    expect(clampMove(box(10, 10, 50, 50), { x: -30, y: -30 }, w)).toEqual({ x: -10, y: -10 });
    expect(clampMove(box(10, 10, 50, 50), { x: 600, y: 0 }, w)).toEqual({ x: 490, y: 0 });
    expect(crossesWalls(box(-1, 10, 50, 50), w)).toBe(true);
    expect(crossesWalls(box(0, 10, 50, 50), w)).toBe(false);
  });

  it('are fixed where the grid\'s edge is when ticked, and three at most are allowed', () => {
    const p = letter();
    const w = setWall(p, box(10, 10, 1200, 20), 'r', true);
    expect(w).toEqual({ l: 0, t: 0, r: 2 });
    expect(fixedCount(w)).toBe(3);
    expect(setWall({ ...p, walls: w }, null, 'l', false)).toEqual({ t: 0, r: 2 });
  });

  it('let the window scroll a page past each open side', () => {
    const p = letter();
    const s = scrollBox(p, pageExtent(p, null), null);
    expect(s).toEqual(box(0, 0, 1080, 1440));
  });
});

describe('pages in use', () => {
  it('counts something across a boundary as on both pages', () => {
    const used = usedPages(letter(), [box(500, 10, 600, 20)]);
    expect([...used].sort()).toEqual(['0,0', '1,0']);
  });

  it('prints every page, or only those in use', () => {
    const e = pageExtent(letter(), box(10, 10, 600, 800));
    const used = usedPages(letter(), [box(10, 10, 20, 20)]);
    expect(pagesToPrint(e, used, false)).toHaveLength(4);
    expect(pagesToPrint(e, used, true)).toEqual([{ c: 0, r: 0 }]);
  });
});

describe('wrapping a paste at the page\'s edge', () => {
  it('starts a new row when the next piece would go past the edge, in reading order', () => {
    const boxes = [box(0, 0, 100, 50), box(120, 0, 220, 50), box(240, 0, 340, 50)];
    const moves = wrapPieces(boxes, 0, 250, 0, 10);
    const at = boxes.map((b, i) => ({ x: b.x1 + moves[i].x, y: b.y1 + moves[i].y }));
    expect(at[0]).toEqual({ x: 0, y: 0 });
    expect(at[1]).toEqual({ x: 110, y: 0 });
    expect(at[2]).toEqual({ x: 0, y: 60 });
  });

  it('keeps things above and below one another in a row so', () => {
    // a reagent above an arrow, then a product
    const boxes = [box(0, 0, 60, 10), box(0, 20, 60, 30), box(80, 15, 180, 40)];
    const moves = wrapPieces(boxes, 0, 500, 100, 10);
    expect(moves[1].y - moves[0].y).toBe(0);
    expect(boxes[0].y1 + moves[0].y).toBe(100);
  });

  it('puts a piece too wide for the room on a row of its own', () => {
    const moves = wrapPieces([box(0, 0, 50, 10), box(60, 0, 900, 10)], 0, 300, 0, 10);
    expect(moves[1]).toEqual({ x: 0 - 60, y: 20 });
  });
});

describe('the page grid in the file', () => {
  it('writes nothing extra for a new drawing\'s page', () => {
    expect(pageTag(letter())).toBeNull();
    expect(pageTag(letter({ walls: { l: 0, t: 0 } }))).toBeNull();
  });

  it('keeps fixed edges and a set number of pages', () => {
    const doc = drawing(100, 100);
    doc.page = letter({ walls: { t: 0, r: 1 } });
    const back = readCdxml(writeCdxml(doc)).doc;
    expect(back.page?.walls).toEqual({ t: 0, r: 1 });
    expect(back.page?.grow).toBe(true);
    const kept = drawing(100, 100);
    kept.page = letter({ grow: false, across: 2, down: 3 });
    const xml = writeCdxml(kept);
    expect(xml).toMatch(/WidthPages="2"/);
    expect(xml).toMatch(/HeightPages="3"/);
    const back2 = readCdxml(xml).doc;
    expect(back2.page).toMatchObject({ grow: false, across: 2, down: 3 });
  });

  it('reads only sensible fixed edges', () => {
    expect(readPageTag('nonsense')).toBeNull();
    expect(readPageTag(JSON.stringify({ walls: { l: 0, t: 0, r: 1, b: 1 } }))?.walls).toEqual({ l: 0, t: 0, r: 1 });
    expect(readPageTag(JSON.stringify({ walls: { l: 'x' } }))?.walls).toEqual({});
  });

  it('writes the page count the grid has', () => {
    const doc = drawing(700, 900);
    doc.page = letter();
    const xml = writeCdxml(doc);
    expect(xml).toMatch(/WidthPages="2"/);
    expect(xml).toMatch(/HeightPages="2"/);
  });

  it('puts pages added above or to the left first, as ChemDraw has them, and leaves the drawing as it was', () => {
    const doc = drawing(-300, 100);
    doc.page = letter({ walls: { t: 0 } });
    const before = doc.bounds()!;
    const undo = (doc as unknown as { undoStack: unknown[] }).undoStack.length;
    const xml = atFirstPage(doc, () => writeCdxml(doc));
    expect(xml).toMatch(/WidthPages="2"/);
    const saved = readCdxml(xml).doc;
    expect(saved.bounds()!.x1).toBeCloseTo(before.x1 + 540, 3);
    expect(saved.page?.walls).toEqual({ t: 0 });
    // the drawing on screen is as it was, with nothing to undo
    expect(doc.bounds()).toEqual(before);
    expect((doc as unknown as { undoStack: unknown[] }).undoStack.length).toBe(undo);
    expect(doc.page.walls).toEqual({ t: 0 });
  });

  it('keeps a drawing on a set number of pages', () => {
    const doc = drawing(1500, 100);
    doc.page = letter({ grow: false, across: 2, down: 1 });
    expect(keepOnPage(doc)).toBe(true);
    expect(doc.bounds()!.x2).toBeLessThanOrEqual(1080);
    expect(extentRect(doc.page, pageExtent(doc.page, doc.bounds())).x2).toBe(1080);
  });
});

describe('the page grid settings', () => {
  it('keeps what it understands and the defaults for the rest', () => {
    expect(parsePageLook(null)).toEqual(DEFAULT_PAGE_LOOK);
    const got = parsePageLook({ lineStyle: 'dotted', lineWidth: 2, lineColour: '#ff0000', lineOpacity: 9, emptyShade: 'huge', grid: false });
    expect(got.lineStyle).toBe('dotted');
    expect(got.lineWidth).toBe(2);
    expect(got.lineColour).toBe('#ff0000');
    expect(got.lineOpacity).toBe(DEFAULT_PAGE_LOOK.lineOpacity);
    expect(got.emptyShade).toBe(DEFAULT_PAGE_LOOK.emptyShade);
    expect(got.grid).toBe(false);
  });
});

describe('the hatching along fixed edges', () => {
  const view = box(-100, -100, 400, 300);
  it('runs on round a corner where two fixed edges meet, cut on the diagonal', () => {
    const walls = wallRect(letter());
    // the left edge's strip reaches up to the outside corner; the top edge's out to it
    expect(hatchBand('l', walls, 7, view)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 307 }, { x: -7, y: 307 }, { x: -7, y: -7 }]);
    expect(hatchBand('t', walls, 7, view)).toEqual([{ x: 0, y: 0 }, { x: 407, y: 0 }, { x: 407, y: -7 }, { x: -7, y: -7 }]);
  });

  it('stops square where the other edge is free, and is skipped out of view', () => {
    const walls = wallRect(letter({ walls: { l: 0 } }));
    expect(hatchBand('l', walls, 7, view)).toEqual([{ x: 0, y: -107 }, { x: 0, y: 307 }, { x: -7, y: 307 }, { x: -7, y: -107 }]);
    expect(hatchBand('l', wallRect(letter({ walls: { l: 5 } })), 7, view)).toBeNull();
  });

  it('reads the hatching settings within their ranges', () => {
    const got = parsePageLook({ hatchSpacing: 5, hatchLength: 999, hatchCorner: 'mirror', hatchAngle: 135 });
    expect(got.hatchSpacing).toBe(5);
    expect(got.hatchLength).toBe(DEFAULT_PAGE_LOOK.hatchLength);
    expect(got.hatchCorner).toBe('mirror');
    expect(got.hatchAngle).toBe(135);
  });
});
