// @vitest-environment jsdom
// Looking round a canvas slide in the slide show (review item 47): drag to pan and scroll to zoom
// anywhere on the canvas, kept inside it; the mini-map shows while looking round; a click, Next
// or Esc glides back to where the show was; any other slide can't be looked round.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/deck/slide-view', async (orig) => ({
  ...(await orig<typeof import('../src/deck/slide-view')>()),
  paintSlide: (c: HTMLCanvasElement, w: number, h: number, dpr: number, p: { size: { w: number; h: number } }) => {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const k = Math.min(w / p.size.w, h / p.size.h);
    return { x: (w - p.size.w * k) / 2, y: (h - p.size.h * k) / 2, k };
  },
  drawDrawing: () => undefined,
  drawCanvasUnder: () => undefined,
  drawScreen: () => undefined,
  drawKeyTitle: () => undefined,
}));

import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { Player } from '../src/deck/playback';

const noop = () => undefined;
const ctx = new Proxy({}, { get: () => noop, set: () => true });
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

function canvasShow() {
  const host = new Doc();
  const d = Deck.blank(host);
  d.attach();
  d.addCanvasSlide();
  const s = d.slides[1];
  s.canvas!.keys.push({ id: 2, x: 2000, y: 0, zoom: 1 });
  const doc = d.docOf(1);
  doc.edit('a', () => { doc.addAtom(100, 100); doc.addAtom(2600, 300); });
  const p = new Player(document.createElement('canvas'), d);
  p.resize(1600, 900, 1);
  return { d, p };
}

afterEach(() => vi.useRealTimers());

describe('looking round a canvas slide in the show', () => {
  it('pans and zooms from where the show is, and only on a canvas slide', () => {
    vi.useFakeTimers();
    const { d, p } = canvasShow();
    p.show(0);
    expect(p.canLookRound).toBe(false);
    expect(p.panBy(10, 0)).toBe(false);
    p.show(1);
    expect(p.canLookRound).toBe(true);
    expect(p.freeView).toBeNull();
    // dragging right moves the view left (the canvas follows the hand)
    expect(p.panBy(100, 0)).toBe(true);
    const v = p.freeView!;
    const k = p.slidePlace.k;
    expect(v.x1).toBeCloseTo(-100 / k, 3);
    expect(p.lookingRound).toBe(true);
    // zooming in twice as far halves the part in view, round the point under the pointer
    const w = v.x2 - v.x1;
    p.zoomAt(2);
    const z = p.freeView!;
    expect(z.x2 - z.x1).toBeCloseTo(w / 2, 3);
    expect((z.y2 - z.y1) / (z.x2 - z.x1)).toBeCloseTo(d.size.h / d.size.w, 6);
    // no closer than a twelfth of a slide, no further out than the whole canvas
    for (let i = 0; i < 20; i++) p.zoomAt(2);
    expect(p.freeView!.x2 - p.freeView!.x1).toBeCloseTo(d.size.w / 12, 3);
    for (let i = 0; i < 40; i++) p.zoomAt(0.5);
    expect(p.freeView!.x2 - p.freeView!.x1).toBeLessThan(4000);
    // and never off the canvas
    for (let i = 0; i < 40; i++) p.panBy(-5000, -5000);
    const c = p.freeView!;
    expect((c.x1 + c.x2) / 2).toBeLessThan(3200);
  });

  it('Next glides back to where the show was instead of going on', () => {
    vi.useFakeTimers();
    const { p } = canvasShow();
    p.show(1);
    p.panBy(300, 200);
    const before = p.done;
    p.next();
    expect(p.lookingRound).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(p.freeView).toBeNull();
    expect(p.i).toBe(1);
    expect(p.done).toBe(before);
  });

  it('a new slide forgets the look round', () => {
    vi.useFakeTimers();
    const { p } = canvasShow();
    p.show(1);
    p.zoomAt(1.5);
    p.show(0);
    expect(p.freeView).toBeNull();
  });

  it('starts looking round on its own (a right-click, L, a button), and the map moves the view while looking', () => {
    vi.useFakeTimers();
    const { p } = canvasShow();
    p.show(0);
    expect(p.startLookRound()).toBe(false);
    p.show(1);
    expect(p.startLookRound()).toBe(true);
    expect(p.lookingRound).toBe(true);
    const v = p.freeView!;
    expect(p.centreOn({ x: 2400, y: 200 })).toBe(true);
    const c = p.freeView!;
    expect((c.x1 + c.x2) / 2).toBeCloseTo(2400, 0);
    expect(c.x2 - c.x1).toBeCloseTo(v.x2 - v.x1, 6);
  });

  it('follows the show\'s own links: the slide picker, looking round, a look at a keyframe', async () => {
    vi.useFakeTimers();
    const { d, p } = canvasShow();
    const { ShowActions } = await import('../src/ui/show-actions');
    const grid = vi.fn(), look = vi.fn();
    const a = new ShowActions(d, p, document.createElement('canvas'), { go: noop, next: noop, prev: noop, end: noop, open: noop, grid, look });
    p.show(1);
    a.follow('#grid');
    expect(grid).toHaveBeenCalled();
    a.follow('#look');
    expect(look).toHaveBeenCalled();
    expect(p.lookingRound).toBe(true);
    const fly = vi.spyOn(p, 'flyTo');
    a.follow('#key=2');
    expect(fly).toHaveBeenCalledWith(1, false);
  });
});
