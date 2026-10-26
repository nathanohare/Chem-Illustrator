// @vitest-environment jsdom
// A slide with many animated parts in the slide show: each part's picture is only the size of the
// part, not of the whole screen, and starting the show builds the slide once.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/deck/slide-view', () => ({
  paintSlide: (c: HTMLCanvasElement, w: number, h: number, dpr: number, p: { size: { w: number; h: number } }) => {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const k = Math.min(w / p.size.w, h / p.size.h);
    return { x: (w - p.size.w * k) / 2, y: (h - p.size.h * k) / 2, k };
  },
  drawDrawing: () => undefined,
}));

import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { Player } from '../src/deck/playback';
import { newAnim } from '../src/deck/animation';

const noop = () => undefined;
const ctx = new Proxy({}, { get: () => noop, set: () => true });
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

describe('Slide show layers', () => {
  it('gives each animated part a canvas of its own size, and builds the first slide once', () => {
    (globalThis as any).requestAnimationFrame = () => 1;
    (globalThis as any).cancelAnimationFrame = noop;
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.setLayout('blank');
    const anims = [];
    for (let i = 0; i < 20; i++) {
      const s = host.edit('s', () => host.addShape({ kind: 'rect', x1: 40 + (i % 10) * 85, y1: 60 + Math.floor(i / 10) * 120, x2: 110 + (i % 10) * 85, y2: 140 + Math.floor(i / 10) * 120 } as never)) as { id: number };
      anims.push(newAnim({ kind: 'shape', id: s.id }, 'fade'));
    }
    d.slides[0].anims = anims;

    const made: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, o?: ElementCreationOptions) => {
      const el = create(tag, o);
      if (tag === 'canvas') made.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement);
    const p = new Player(create('canvas'), d);
    // as the show starts: its size (the ink asks where the slide is), the first slide, then the window's resize event
    p.resize(1920, 1080, 1.5);
    expect(p.slidePlace.k).toBe(2);
    p.show(0, { transition: true });
    p.resize(1920, 1080, 1.5);
    spy.mockRestore();

    const screen = 2880 * 1620;
    const full = made.filter((c) => c.width * c.height >= screen);
    // the slide's still parts, once
    expect(full.length).toBe(1);
    // and 20 boxes of 70 x 80 points (plus room round them), each a canvas of about 260 x 290
    expect(made.length).toBe(21);
    for (const c of made.filter((x) => !full.includes(x))) expect(c.width * c.height).toBeLessThan(300 * 300);
  });
});
