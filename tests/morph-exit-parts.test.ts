// @vitest-environment jsdom
// Morph after an exit animation: what the slide's exit animations took away stays away (it isn't
// painted as a piece of the morph, popping back and fading out again).

import { describe, it, expect, vi } from 'vitest';

const painted: { shapes: number[]; captions: number; x1?: number }[] = [];
vi.mock('../src/deck/slide-view', () => ({
  paintSlide: (_c: unknown, _w: number, _h: number, _d: number, _page: unknown, doc: { shapes: Map<number, { x1: number }>; captions: Map<number, unknown> }) => {
    painted.push({ shapes: [...doc.shapes.keys()], captions: doc.captions.size, x1: [...doc.shapes.values()][0]?.x1 });
    return { x: 0, y: 0, k: 1 };
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

describe('Morph after an exit animation', () => {
  it('leaves out what the slide\'s exit animation took away', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    (globalThis as any).requestAnimationFrame = () => 1;
    (globalThis as any).cancelAnimationFrame = noop;

    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    // slide 1: a "Step 1" box at x = 100 that fades out on a click
    const box = host.edit('s', () => host.addShape({ kind: 'rect', x1: 100, y1: 100, x2: 200, y2: 160 } as never)) as { id: number };
    d.slides[0].anims = [newAnim({ kind: 'shape', id: box.id }, 'fade', true)];
    // and a box at x = 300 that stays
    host.edit('s', () => host.addShape({ kind: 'rect', x1: 300, y1: 100, x2: 400, y2: 160 } as never));
    // slide 2: a different box, and a Morph transition
    d.addSlide('blank');
    host.edit('s', () => host.addShape({ kind: 'ellipse', x1: 500, y1: 100, x2: 600, y2: 160 } as never));
    d.slides[1].transition = { kind: 'morph', dur: 1 } as never;
    d.go(0);

    const p = new Player(document.createElement('canvas'), d);
    p.resize(960, 540, 1);
    p.show(0);
    p.next(); // click: the box fades out
    now += 2000;
    p.paint();
    expect(p.done).toBe(1);
    painted.length = 0;
    p.next(); // Morph to slide 2
    now += 100;
    p.paint();
    // the morph paints each part it moves on its own; the faded-out box (x = 100) should not be one
    const fadedBoxInMorph = painted.some((x) => x.shapes.length === 1 && x.shapes[0] === box.id && x.captions === 0 && x.x1 === 100);
    expect(fadedBoxInMorph).toBe(false);
    expect(painted.some((x) => x.shapes.length === 1 && x.x1 === 300)).toBe(true);
  });
});
