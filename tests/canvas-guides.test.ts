// @vitest-environment jsdom
//
// Guides on a drawing: crosshairs, lines and a grid with ruler ticks, what a grabbed atom snaps to,
// and that they are kept in a CDXML file (where ChemDraw passes over them).

import { describe, it, expect } from 'vitest';
import { DEFAULT_GUIDES, guideAt, guideLines, guidesText, movedGuide, parseGuides, snapToGuides, tickNear, ticksBetween, type CanvasGuides } from '../src/editor/guides';
import { buildGuidesToolbox } from '../src/ui/guides-toolbox';
import { Doc } from '../src/model';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';

const g = (patch: Partial<CanvasGuides> = {}): CanvasGuides => ({ ...DEFAULT_GUIDES, list: [{ kind: 'cross', x: 100, y: 100 }], ...patch });
const area = { x1: 0, y1: 0, x2: 600, y2: 600 };

describe('ticks', () => {
  it('snaps to major, minor between majors, both, or nothing', () => {
    const t = { major: 72, minor: 18 };
    expect(tickNear(80, 0, { ...t, snap: 'major' })).toBe(72);
    expect(tickNear(80, 0, { ...t, snap: 'both' })).toBe(72);
    expect(tickNear(80, 0, { ...t, snap: 'minor' })).toBe(90);
    expect(tickNear(80, 0, { ...t, snap: 'none' })).toBeNull();
    // counted from the crosshair's middle
    expect(tickNear(130, 100, { ...t, snap: 'both' })).toBe(136);
  });
  it('draws minor ticks when there is room, else only major ones', () => {
    expect(ticksBetween(0, 72, 0, { major: 72, minor: 18 }, 5).map((x) => x.major)).toEqual([true, false, false, false, true]);
    expect(ticksBetween(0, 144, 0, { major: 72, minor: 18 }, 30).length).toBe(3);
  });
});

describe('snapping the grabbed atom', () => {
  it('goes onto a crosshair line and slides to a tick along it', () => {
    const s = snapToGuides({ x: 103, y: 150 }, g(), guideLines(g(), area), 6);
    expect(s.at).toEqual({ x: 100, y: 154 });
    expect(s.on.map((l) => l.axis)).toEqual(['x']);
  });
  it('lands on the middle where both lines are near', () => {
    expect(snapToGuides({ x: 97, y: 104 }, g(), guideLines(g(), area), 6).at).toEqual({ x: 100, y: 100 });
  });
  it('stays put away from the guides, with snapping off, or with the guides hidden', () => {
    expect(snapToGuides({ x: 300, y: 300 }, g(), guideLines(g(), area), 6).at).toEqual({ x: 300, y: 300 });
    expect(snapToGuides({ x: 103, y: 150 }, g({ snap: 'none' }), guideLines(g(), area), 6).at).toEqual({ x: 103, y: 150 });
    expect(snapToGuides({ x: 103, y: 150 }, g({ shown: false }), guideLines(g(), area), 6).at).toEqual({ x: 103, y: 150 });
  });
  it('uses the grid lines too', () => {
    const grid = g({ list: [], grid: true });
    expect(snapToGuides({ x: 146, y: 300 }, grid, guideLines(grid, area), 6).at).toEqual({ x: 144, y: 306 });
  });
});

describe('dragging guides', () => {
  it('finds a crosshair by its middle, a line by its line', () => {
    const two = g({ list: [{ kind: 'cross', x: 100, y: 100 }, { kind: 'h', x: 0, y: 300 }] });
    expect(guideAt({ x: 102, y: 101 }, two, 4)).toEqual({ index: 0, part: 'middle' });
    expect(guideAt({ x: 102, y: 400 }, two, 4)).toEqual({ index: 0, part: 'x' });
    expect(guideAt({ x: 400, y: 302 }, two, 4)).toEqual({ index: 1, part: 'y' });
    expect(guideAt({ x: 400, y: 200 }, two, 4)).toBeNull();
  });
  it('moves a crosshair both ways by its middle, one way by a line', () => {
    const c = { kind: 'cross' as const, x: 100, y: 100 };
    expect(movedGuide(c, 'middle', { x: 10, y: 20 })).toEqual({ kind: 'cross', x: 10, y: 20 });
    expect(movedGuide(c, 'x', { x: 10, y: 20 })).toEqual({ kind: 'cross', x: 10, y: 100 });
  });
});

describe('saving', () => {
  it('reads back what it writes, and keeps nothing when there are no guides', () => {
    const k = g({ grid: true, snap: 'minor', major: 36, minor: 9 });
    expect(parseGuides(guidesText(k))).toEqual(k);
    expect(guidesText({ ...k, list: [], grid: false })).toBeNull();
    expect(parseGuides('{"list":[{"kind":"x"}],"major":-3}')).toBeNull();
  });
  it('keeps their colour and how see-through they are, and drops values out of range', () => {
    const k = g({ grid: true, color: '#d81b8c', clear: 0.4 });
    expect(parseGuides(guidesText(k))).toEqual(k);
    const doc = new Doc();
    doc.bulk(() => doc.addAtom(100, 100));
    doc.guides = k;
    expect(readCdxml(writeCdxml(doc)).doc.guides).toEqual(k);
    const odd = parseGuides('{"list":[],"grid":true,"color":"pink","clear":2}')!;
    expect([odd.color, odd.clear]).toEqual([undefined, undefined]);
    expect(parseGuides('{"list":[],"grid":true,"color":"#ABCDEF","clear":0}')!.color).toBe('#abcdef');
  });
  it('goes into a CDXML file as a tag on the page, and comes back', () => {
    const doc = new Doc();
    doc.bulk(() => doc.addAtom(100, 100));
    doc.guides = g({ list: [{ kind: 'cross', x: 120, y: 80 }, { kind: 'v', x: 300, y: 0 }] });
    const text = writeCdxml(doc);
    expect(text).toContain('Name="Chem Illustrator guides"');
    expect(text).toContain('Visible="no"');
    const back = readCdxml(text).doc;
    expect(back.guides?.list).toEqual(doc.guides.list);
  });
});

describe('the toolbox', () => {
  it('adds guides on a tick in the middle of the window, and switches the grid and snapping', () => {
    let now: CanvasGuides | null = null;
    let smart = false;
    const body = document.createElement('div');
    buildGuidesToolbox(body, false, { get: () => now, set: (x) => { now = x; }, centre: () => ({ x: 203, y: 95 }), units: () => 'in', smart: () => smart, setSmart: (on) => { smart = on; } });
    body.querySelector<HTMLButtonElement>('.gt-btn[title^="Add a crosshair"]')!.click();
    expect(now!.list).toEqual([{ kind: 'cross', x: 198, y: 90 }]);
    body.querySelector<HTMLButtonElement>('.gt-btn[title^="Grid"]')!.click();
    expect(now!.grid).toBe(true);
    [...body.querySelectorAll<HTMLButtonElement>('.gt-seg')].find((b) => b.textContent === 'Major')!.click();
    expect(now!.snap).toBe('major');
    const major = body.querySelector<HTMLInputElement>('.gt-num')!;
    expect(major.value).toBe('1');
    major.value = '0.5';
    major.dispatchEvent(new Event('change'));
    expect(now!.major).toBe(36);
    expect(now!.minor).toBe(18);
    const box = body.querySelector<HTMLInputElement>('.gt-check input')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(smart).toBe(true);
  });
});

describe('text above and below arrows in the drawing style', () => {
  it('is kept in a CDXML file and comes back', () => {
    const doc = new Doc();
    doc.bulk(() => doc.addAtom(100, 100));
    doc.style = { ...doc.style, arrowTextSize: 9, arrowTextFont: 'Helvetica' };
    const back = readCdxml(writeCdxml(doc)).doc;
    expect(back.style.arrowTextSize).toBe(9);
    expect(back.style.arrowTextFont).toBe('Helvetica');
  });
  it('keeps the arrow sizes too, and new arrows take them', () => {
    const doc = new Doc();
    doc.bulk(() => doc.addAtom(100, 100));
    doc.style = { ...doc.style, arrowWidth: 1.2, arrowHeadLength: 9 };
    const back = readCdxml(writeCdxml(doc)).doc;
    expect(back.style.arrowWidth).toBe(1.2);
    expect(back.style.arrowHeadLength).toBe(9);
    expect(back.style.arrowHeadWidth).toBeUndefined();
  });
  it('gives new text its size and font', async () => {
    const { newTextLook, textSize } = await import('../src/chem/arrow-text');
    const doc = new Doc();
    expect(newTextLook(doc)).toEqual({});
    doc.style = { ...doc.style, arrowTextSize: doc.style.captionSize - 1, arrowTextFont: 'Helvetica' };
    expect(textSize(doc)).toBe(doc.style.captionSize - 1);
    expect(newTextLook(doc)).toEqual({ size: doc.style.captionSize - 1, font: 'Helvetica' });
  });
});
