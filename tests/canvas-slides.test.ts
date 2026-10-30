// @vitest-environment jsdom
//
// Canvas slides: a slide with no edge, shown through keyframes (slide-shaped windows on it). The
// keyframes are added, moved, zoomed and taken away as steps of the deck's history, carried by
// copies of the slide, scaled with the slide size, drawn through in the slide list and the show,
// and saved in PowerPoint files and read back.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Deck, WIDE, STANDARD } from '../src/deck/deck';
import {
  addKeyframe, insertKeyframe, keyframeAround, keyRect, keyAt, keysBounds, moveKeyframe, removeKeyframe, snapKeyframe, zoomByCorner,
  canvasTag, readCanvasTag, clampZoom, ZOOM_MIN, shownRect, slidePlace, syncCamera, isCamera, distanceDur, timedCamera, viewBetween, cameraAt,
  withCameraMoves, PARALLAX_MAX, type CanvasData,
} from '../src/deck/canvas';
import { routeEnds } from '../src/deck/canvas-look';
import { keyframeDoc, animSegments, hiddenAt, splitCanvas } from '../src/deck/canvas-export';
import { slideParts } from '../src/deck/animation';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { buildSteps, type Anim } from '../src/deck/animation';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };
const size = { w: 960, h: 540 };

function deck(): { d: Deck; host: Doc } {
  const host = new Doc();
  const d = Deck.blank(host);
  d.attach();
  return { d, host };
}

describe('keyframes', () => {
  it('adds the next keyframe half a slide along, level with the one before, after it in the show', () => {
    const c: CanvasData = { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 2000, y: 100, zoom: 2 }] };
    const a = addKeyframe(c, size, 0);
    expect(a.index).toBe(1);
    expect(a.canvas.keys.map((k) => k.id)).toEqual([1, 3, 2]);
    expect(a.canvas.keys[1]).toMatchObject({ x: 480, y: 0, zoom: 1 });
    // a zoomed-out keyframe moves on by half its own width
    const b = addKeyframe(c, size);
    expect(b.canvas.keys[2]).toMatchObject({ x: 2000 + 960, y: 100, zoom: 2 });
    // the canvas given is not changed
    expect(c.keys).toHaveLength(2);
  });

  it('fits a keyframe round a box, zooming in at most 2×', () => {
    const k = keyframeAround({ x1: 100, y1: 100, x2: 2020, y2: 400 }, size, 0, 1);
    expect(k.zoom).toBeCloseTo(2);
    expect((keyRect(k, size).x1 + keyRect(k, size).x2) / 2).toBeCloseTo(1060);
    // a tiny box: only as far in as the limit
    const small = keyframeAround({ x1: 0, y1: 0, x2: 10, y2: 10 }, size);
    expect(small.zoom).toBe(ZOOM_MIN);
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('inserts, removes and reorders keyframes, keeping at least one', () => {
    const c: CanvasData = { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }] };
    const two = insertKeyframe(c, { id: 1, x: 500, y: 0, zoom: 1 }).canvas;
    expect(two.keys.map((k) => k.id)).toEqual([1, 2]);
    expect(removeKeyframe(c, 0)).toBeNull();
    expect(removeKeyframe(two, 0)!.keys.map((k) => k.id)).toEqual([2]);
    expect(moveKeyframe(two, 1, 0).keys.map((k) => k.id)).toEqual([2, 1]);
  });

  it('zooms a keyframe by a corner about the opposite one, keeping the slide shape', () => {
    const k = { id: 1, x: 0, y: 0, zoom: 1 };
    // the bottom-right corner dragged out to (1920, 600): twice as wide, the top-left stays
    const z = zoomByCorner(k, size, 2, { x: 1920, y: 600 });
    expect(z).toMatchObject({ x: 0, y: 0, zoom: 2 });
    // the bottom-left corner dragged in: the top-right corner stays
    const z2 = zoomByCorner(k, size, 3, { x: 900, y: 10 });
    expect(z2.zoom).toBe(ZOOM_MIN);
    expect(keyRect(z2, size).x2).toBe(960);
    expect(keyRect(z2, size).y1).toBe(0);
  });

  it('snaps a moved keyframe level with its neighbours in the show', () => {
    const c: CanvasData = { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 500, y: 7, zoom: 1 }] };
    expect(snapKeyframe(c, 1, c.keys[1], size, 10).y).toBe(0);
    expect(snapKeyframe(c, 1, { ...c.keys[1], y: 40 }, size, 10).y).toBe(40);
  });

  it('finds the tab, corners and outline of a keyframe under the pointer', () => {
    const c: CanvasData = { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 480, y: 0, zoom: 1 }] };
    expect(keyAt(c, size, { x: 5, y: 5 }, 1)).toEqual({ index: 0, part: 'move' });
    expect(keyAt(c, size, { x: 1440, y: 540 }, 1)).toEqual({ index: 1, part: 'corner', corner: 2 });
    expect(keyAt(c, size, { x: 960, y: 300 }, 1)).toEqual({ index: 0, part: 'move', edge: true });
    expect(keyAt(c, size, { x: 700, y: 300 }, 1)).toBeNull();
    // the keyframe picked is tried first where two meet
    expect(keyAt(c, size, { x: 960, y: 0 }, 1, 0)).toMatchObject({ index: 0 });
    expect(keysBounds(c, size)).toEqual({ x1: 0, y1: 0, x2: 1440, y2: 540 });
  });

  it('keeps keyframes in a tag and reads them back, turning down what is not one', () => {
    const c: CanvasData = { keys: [{ id: 1, x: -12.5, y: 3, zoom: 1 }, { id: 4, x: 900, y: 0, zoom: 2.5 }] };
    expect(readCanvasTag(canvasTag(c))).toEqual(c);
    expect(readCanvasTag('nonsense')).toBeNull();
    expect(readCanvasTag('{"keys":[]}')).toBeNull();
    expect(readCanvasTag('{"keys":[[1,0,0,99],[1,5,5,"x"]]}')).toEqual({ keys: [{ id: 1, x: 0, y: 0, zoom: 40 }] });
  });
});

describe('canvas slides in a deck', () => {
  it('adds a canvas slide as one undo step: blank, with one keyframe where the slide would be', () => {
    const { d } = deck();
    d.addCanvasSlide();
    expect(d.slides).toHaveLength(2);
    expect(d.index).toBe(1);
    expect(d.current!.layout).toBe('blank');
    expect(d.current!.canvas).toEqual({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }] });
    expect(d.page().view).toEqual({ x1: 0, y1: 0, x2: d.size.w, y2: d.size.h });
    expect(d.page(0).view).toBeUndefined();
    d.undo();
    expect(d.slides).toHaveLength(1);
  });

  it('changes keyframes as steps of the history, and copies of the slide have their own', () => {
    const { d } = deck();
    d.addCanvasSlide();
    const one = d.current!.canvas!;
    d.setCanvas(addKeyframe(one, d.size).canvas, 'Add keyframe');
    expect(d.current!.canvas!.keys).toHaveLength(2);
    expect(d.page(1, 1).view!.x1).toBeCloseTo(d.size.w / 2);
    // the same keyframes again change nothing
    const edits = d.edits;
    d.setCanvas(d.current!.canvas!);
    expect(d.edits).toBe(edits);
    d.undo();
    expect(d.current!.canvas!.keys).toHaveLength(1);
    d.redo();
    expect(d.current!.canvas!.keys).toHaveLength(2);
    d.duplicate();
    expect(d.slides[2].canvas).toEqual(d.slides[1].canvas);
    expect(d.slides[2].canvas).not.toBe(d.slides[1].canvas);
    // a normal slide has no keyframes to set
    d.go(0);
    d.setCanvas({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }] });
    expect(d.slides[0].canvas).toBeUndefined();
  });

  it('moves and scales keyframes with the drawing when the slide size changes, and undoes it', () => {
    const { d } = deck();
    d.addCanvasSlide();
    d.setCanvas({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 960, y: 0, zoom: 1 }] });
    d.setSize(STANDARD, 'fit');
    const k = Math.min(STANDARD.w / WIDE.w, STANDARD.h / WIDE.h);
    const second = keyRect(d.current!.canvas!.keys[1], d.size);
    // its middle went where the drawing under it went
    expect((second.x1 + second.x2) / 2).toBeCloseTo(STANDARD.w / 2 + (1440 - WIDE.w / 2) * k);
    expect(second.x2 - second.x1).toBeCloseTo(WIDE.w * k);
    d.undo();
    expect(d.size).toEqual(WIDE);
    expect(d.current!.canvas!.keys[1]).toEqual({ id: 2, x: 960, y: 0, zoom: 1 });
  });

  it('draws a keyframe filling the slide\'s place, and clips to it', () => {
    const page = { size: WIDE, master: Deck.blank(new Doc()).master, layout: 'blank' as const, index: 0, view: { x1: 960, y1: 0, x2: 2880, y2: 1080 } };
    // a 480 × 270 picture of a keyframe twice the slide's size: a quarter point per pixel
    const at = slidePlace(480, 270, page);
    expect(at.k).toBeCloseTo(0.25);
    expect(at.x + 960 * at.k).toBeCloseTo(0);
    expect(shownRect(page)).toEqual(page.view);
    expect(shownRect({ ...page, view: undefined })).toEqual({ x1: 0, y1: 0, x2: WIDE.w, y2: WIDE.h });
  });

  it('saves a canvas slide in a PowerPoint file and reads its keyframes back', async () => {
    const { d, host } = deck();
    d.addCanvasSlide();
    host.edit('Ring', () => { host.addAtom(3000, 200); });
    d.setCanvas({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 2500, y: -40, zoom: 1.5 }] });
    const bytes = await writePptx({
      size: d.size, master: d.master,
      slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes, canvas: s.canvas })),
    }, opts);
    const back = readPptx(bytes);
    expect(back.slides).toHaveLength(2);
    expect(back.slides[0].canvas).toBeUndefined();
    expect(back.slides[1].canvas).toEqual(d.slides[1].canvas);
    // into a deck, as opening the file does
    const d2 = Deck.blank(new Doc());
    d2.load(back.slides.map((s) => d2.makeSlide(s.layout, s.contents, s.notes, s, back.master)), back.size, back.master);
    expect(d2.slides[1].canvas!.keys[1].zoom).toBe(1.5);
  });
});

describe('moving between keyframes', () => {
  const k = (id: number, x: number, y = 0, zoom = 1) => ({ id, x, y, zoom });
  const fade = (id: number): Anim => ({ target: { kind: 'caption', id }, effect: 'fade', start: 'click', dur: 0.5, delay: 0 });

  it('keeps one move to each keyframe after the first, in their order, where the moves were', () => {
    const keys = [k(1, 0), k(2, 960), k(3, 1920)];
    const a = syncCamera([fade(7)], keys);
    expect(a.map((x) => (isCamera(x) ? x.target.id : 'fade'))).toEqual(['fade', 2, 3]);
    // a move set to fly-over and started with the one before, then the keyframes swapped:
    // the slots keep when they play, the moves keep how they move
    const b = a.map((x, i) => (i === 1 ? { ...x, move: 'fly' as const } : i === 2 ? { ...x, start: 'with' as const } : x));
    const c = syncCamera(b, [k(1, 0), k(3, 1920), k(2, 960)]);
    expect(c.map((x) => [x.target.id, x.start, x.move ?? null])).toEqual([[7, 'click', null], [3, 'click', 'pan'], [2, 'with', 'fly']]);
    // a keyframe taken out takes its move with it; one put in between gets a move in its turn
    expect(syncCamera(a, [k(1, 0), k(3, 1920)]).filter(isCamera).map((x) => x.target.id)).toEqual([3]);
    const d = syncCamera(a, [k(1, 0), k(4, 500), k(2, 960), k(3, 1920)]);
    expect(d.filter(isCamera).map((x) => x.target.id)).toEqual([4, 2, 3]);
    expect(d.every((x) => x.effect)).toBe(true);
    // the first keyframe has none: the slide starts there
    expect(syncCamera(a, [k(2, 960)]).filter(isCamera)).toEqual([]);
  });

  it('times a move by its distance, from 0.6 s to 1.5 s, and a cut takes none', () => {
    expect(distanceDur(k(1, 0), k(2, 100), size)).toBe(0.6);
    expect(distanceDur(k(1, 0), k(2, 50000), size)).toBe(1.5);
    const keys = [k(1, 0), k(2, 960), k(3, 1920)];
    const anims = syncCamera([], keys);
    anims[1] = { ...anims[1], move: 'cut' };
    const t = timedCamera(anims, keys, size);
    expect(t[0].dur).toBeCloseTo(distanceDur(keys[0], keys[1], size));
    expect(t[1].dur).toBe(0);
  });

  it('glides from one keyframe to the next, and a fly-over pulls back on the way', () => {
    const a = k(1, 0), b = k(2, 3840, 0, 2);
    expect(viewBetween(a, b, 0, 'pan', size)).toEqual(keyRect(a, size));
    const end = viewBetween(a, b, 1, 'pan', size), rb = keyRect(b, size);
    expect(end.x1).toBeCloseTo(rb.x1);
    expect(end.x2).toBeCloseTo(rb.x2);
    const mid = viewBetween(a, b, 0.5, 'pan', size), fly = viewBetween(a, b, 0.5, 'fly', size);
    // half way in zoom (by ratio), and slide-shaped
    expect((mid.x2 - mid.x1) / size.w).toBeCloseTo(Math.SQRT2);
    expect((mid.x2 - mid.x1) / (mid.y2 - mid.y1)).toBeCloseTo(size.w / size.h);
    expect(fly.x2 - fly.x1).toBeGreaterThan(mid.x2 - mid.x1);
  });

  it('says where the view is as the show plays the steps', () => {
    const keys = [k(1, 0), k(2, 960), k(3, 1920)];
    const anims = [fade(7), ...syncCamera([], keys)];
    anims[2] = { ...anims[2], start: 'after', dur: 1, byDistance: undefined };
    // click 1: the fade; click 2: the move to keyframe 2 and, after it, the move to keyframe 3
    const steps = buildSteps(timedCamera(anims, keys, size));
    expect(cameraAt(steps, keys, 0, -1)).toEqual({ at: 0 });
    expect(cameraAt(steps, keys, 1, -1)).toEqual({ at: 0 });
    const d = steps[1].items[0].end;
    expect(cameraAt(steps, keys, 1, d / 2)).toMatchObject({ from: 0, to: 1, p: 0.5, move: 'pan' });
    expect(cameraAt(steps, keys, 1, d + 0.5)).toMatchObject({ from: 1, to: 2, p: 0.5 });
    expect(cameraAt(steps, keys, 2, -1)).toEqual({ at: 2 });
  });

  it('keeps the moves in the slide tag, among the other animations, and puts them back', () => {
    const keys = [k(1, 0), k(2, 960), k(3, 1920)];
    const anims = [fade(7), ...syncCamera([], keys), fade(8)];
    anims[1] = { ...anims[1], move: 'fly', byDistance: undefined, dur: 2 };
    const tag = canvasTag({ keys }, anims);
    expect(readCanvasTag(tag)).toEqual({ keys });
    const back = withCameraMoves([fade(7), fade(8)], tag);
    expect(back).toEqual(anims.map((a) => (a.byDistance === undefined ? (({ byDistance: _, ...r }) => r)(a) : a)));
    expect(withCameraMoves([fade(7)], 'not json')).toEqual([fade(7)]);
  });

  it('adds and takes out moves with the keyframes, in the same step of the history', () => {
    const { d } = deck();
    d.addCanvasSlide();
    d.setCanvas(addKeyframe(d.current!.canvas!, d.size).canvas, 'Add keyframe');
    expect(d.current!.anims!.map((a) => a.effect)).toEqual(['camera']);
    d.undo();
    expect(d.current!.anims).toBeUndefined();
    d.redo();
    // the pane can reorder a move and change it, but not take it out
    d.setAnims([]);
    expect(d.current!.anims).toHaveLength(1);
    d.setAnims([{ ...d.current!.anims![0], move: 'fade' }]);
    expect(d.current!.anims![0].move).toBe('fade');
  });

  it('saves the moves in a PowerPoint file with the other animations and reads them back in place', async () => {
    const { d, host } = deck();
    d.addCanvasSlide();
    let cap = 0;
    host.edit('Text', () => { cap = host.addCaption({ x: 100, y: 100, runs: [{ text: 'Product' }], justify: 'left' }).id; });
    d.setCanvas({ keys: [k(1, 0), k(2, 960), k(3, 1920)] });
    const moves = d.current!.anims!;
    d.setAnims([moves[0], { ...fade(cap), start: 'with' }, { ...moves[1], move: 'fly' }]);
    const bytes = await writePptx({
      size: d.size, master: d.master,
      slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes, canvas: s.canvas, anims: s.anims })),
    }, opts);
    const back = readPptx(bytes).slides[1];
    expect(back.anims!.map((a) => [a.effect, a.start, a.move ?? null])).toEqual([['camera', 'click', 'pan'], ['fade', 'with', null], ['camera', 'click', 'fly']]);
  });
});

describe('the look of a canvas', () => {
  it('keeps titles, zones and the background look in the tag, turning down what makes no sense', () => {
    const c: CanvasData = {
      keys: [{ id: 1, x: 0, y: 0, zoom: 1, title: 'Fragment A', tint: '#ffb3b3' }, { id: 2, x: 900, y: 0, zoom: 1 }],
      look: { route: ['#fff7e6', '#e6f0ff'], texture: 'hex', parallax: 0.5 },
    };
    expect(readCanvasTag(canvasTag(c))).toEqual(c);
    const odd = '{"keys":[[1,0,0,1,"",42]],"look":{"route":["red","#000000"],"texture":"stars","parallax":3}}';
    expect(readCanvasTag(odd)).toEqual({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }], look: { parallax: PARALLAX_MAX } });
  });

  it('gives a new keyframe the title and zone of the one before, and keeps the look as keyframes change', () => {
    const { d } = deck();
    d.addCanvasSlide();
    d.setCanvas({ keys: [{ id: 1, x: 0, y: 0, zoom: 1, title: 'Endgame', tint: '#9ad0ff' }], look: { texture: 'dots' } });
    const next = addKeyframe(d.current!.canvas!, d.size);
    expect(next.canvas.keys[1]).toMatchObject({ title: 'Endgame', tint: '#9ad0ff', x: 480 });
    // keyframes given on their own keep the canvas's look; a look set to nothing goes
    d.setCanvas(next.canvas);
    expect(d.current!.canvas!.look).toEqual({ texture: 'dots' });
    d.setCanvas({ keys: d.current!.canvas!.keys, look: undefined });
    expect(d.current!.canvas!.look).toBeUndefined();
    d.undo();
    expect(d.current!.canvas!.look).toEqual({ texture: 'dots' });
    // the page of a keyframe carries its title and the canvas, for drawing its background and screen
    expect(d.page(1, 1)).toMatchObject({ title: 'Endgame', canvas: d.current!.canvas });
  });

  it('runs the route gradient from the first keyframe to the last, or across them all when the route comes back', () => {
    const [a, b] = routeEnds({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 3000, y: 540, zoom: 1 }] }, size);
    expect(a).toEqual({ x: 480, y: 270 });
    expect(b).toEqual({ x: 3480, y: 810 });
    const [c, e] = routeEnds({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 1000, y: 0, zoom: 1 }, { id: 3, x: 100, y: 0, zoom: 1 }] }, size);
    expect(c.x).toBe(0);
    expect(e.x).toBe(1960);
  });
});

describe('a canvas slide as a slide for each keyframe', () => {
  const fade = (target: Anim['target'], exit = false): Anim => ({ target, effect: 'fade', start: 'click', dur: 0.5, delay: 0, ...(exit ? { exit: true } : {}) });

  it('cuts the drawing to a keyframe, moved and scaled to fill the slide', () => {
    const d = new Doc();
    let a = 0, far = 0;
    d.edit('x', () => {
      a = d.addAtom(1000, 100).id;
      far = d.addCaption({ x: 5000, y: 0, runs: [{ text: 'far away' }], justify: 'left' }).id;
    });
    const one = keyframeDoc(d, keyRect({ id: 1, x: 960, y: 0, zoom: 1 }, size), size);
    expect(one.atoms.get(a)).toMatchObject({ x: 40, y: 100 });
    expect(one.captions.has(far)).toBe(false);
    // a keyframe twice the slide's size: everything half as big
    const two = keyframeDoc(d, keyRect({ id: 1, x: 0, y: 0, zoom: 2 }, size), size);
    expect(two.atoms.get(a)).toMatchObject({ x: 500, y: 50 });
    expect(two.style.bondLength).toBeCloseTo(d.style.bondLength / 2);
    // the canvas itself is not changed
    expect(d.atoms.get(a)).toMatchObject({ x: 1000, y: 100 });
  });

  it('gives each keyframe the animations played there, and leaves off what is not in yet', () => {
    const d = new Doc();
    let p = 0, q = 0;
    d.edit('x', () => {
      p = d.addCaption({ x: 100, y: 100, runs: [{ text: 'A' }], justify: 'left' }).id;
      q = d.addCaption({ x: 1100, y: 100, runs: [{ text: 'B' }], justify: 'left' }).id;
    });
    const c: CanvasData = { keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 960, y: 0, zoom: 1 }, { id: 3, x: 480, y: 0, zoom: 1 }] };
    const [m2, m3] = syncCamera([], c.keys);
    const anims = [fade({ kind: 'caption', id: p }), m2, fade({ kind: 'caption', id: q }), m3, fade({ kind: 'caption', id: p }, true)];
    const { segs, moves } = animSegments(anims, c, size);
    expect(segs.map((s) => s.length)).toEqual([1, 1, 1]);
    expect(moves.map((m) => m?.target.id ?? null)).toEqual([null, 2, 3]);
    const parts = slideParts(d);
    const text = (id: number) => parts.find((x) => x.sel.captions.has(id));
    expect(hiddenAt(parts, segs, 0)).toEqual([text(q)]);
    expect(hiddenAt(parts, segs, 1)).toEqual([]);
    expect(hiddenAt(parts, segs, 2)).toEqual([]);
  });

  it('turns the moves into transitions: Morph for a pan, a fade, nothing for a cut, a slide on the way for a fly-over', () => {
    const doc = new Doc();
    const keys = [{ id: 1, x: 0, y: 0, zoom: 1, title: 'Route' }, { id: 2, x: 960, y: 0, zoom: 1 }, { id: 3, x: 1920, y: 0, zoom: 1 }, { id: 4, x: 5000, y: 3000, zoom: 1 }, { id: 5, x: 0, y: 0, zoom: 1 }];
    const moves = syncCamera([], keys).map((a, i) => ({ ...a, move: (['pan', 'fade', 'fly', 'cut'] as const)[i] }));
    const master = Deck.blank(new Doc()).master;
    const out = splitCanvas({ id: 7, layout: 'blank', doc, notes: 'Say this', anims: moves, canvas: { keys }, transition: { kind: 'push', dur: 1 } }, master, size);
    expect(out.map((s) => s.transition?.kind ?? 'none')).toEqual(['push', 'morph', 'fade', 'morph', 'morph', 'none']);
    // the fly-over's slide on the way moves on by itself
    expect(out[3].part?.via).toBe(true);
    expect(out[3].transition?.advanceAfter).toBeCloseTo(0.01);
    expect(out.map((s) => s.part?.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.every((s) => s.part?.count === 6 && s.part.uid === out[0].part!.uid)).toBe(true);
    // the first keeps the canvas slide and its id and notes; a titled keyframe has a title
    expect(out[0].part?.keep?.canvas).toEqual({ keys });
    expect(out[0]).toMatchObject({ id: 7, notes: 'Say this', layout: 'title-only' });
    expect([...out[0].doc.captions.values()].map((c) => [c.ph, c.runs[0].text])).toEqual([['title', 'Route']]);
    expect(out[1]).toMatchObject({ id: undefined, notes: '', layout: 'blank' });
  });

  it('opens again as the canvas, or as PowerPoint\'s slides when PowerPoint changed them and they are wanted', async () => {
    const { d, host } = deck();
    d.addCanvasSlide();
    host.edit('Text', () => { host.addCaption({ x: 1200, y: 100, runs: [{ text: 'Step two' }], justify: 'left' }); });
    d.setCanvas({ keys: [{ id: 1, x: 0, y: 0, zoom: 1 }, { id: 2, x: 960, y: 0, zoom: 1 }] });
    const data = () => ({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ id: s.id, layout: s.layout, doc: d.docOf(i), notes: s.notes, canvas: s.canvas, anims: s.anims })) });
    const bytes = await writePptx(data(), opts);
    const files = unzipSync(bytes);
    expect(Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(3);
    const back = readPptx(bytes);
    expect(back.slides).toHaveLength(2);
    expect(back.canvasEdited).toBeUndefined();
    expect(back.slides[1].canvas).toEqual(d.slides[1].canvas);
    expect(back.slides[1].contents.captions.map((c) => c.x)).toEqual([1200]);
    // PowerPoint changes the text on keyframe 2's slide
    const edited = { ...files, 'ppt/slides/slide3.xml': strToU8(strFromU8(files['ppt/slides/slide3.xml']).replace('Step two', 'Step 2')) };
    const changed = zipSync(edited);
    const asCanvas = readPptx(changed);
    expect(asCanvas.canvasEdited).toBe(1);
    expect(asCanvas.slides).toHaveLength(2);
    const asSlides = readPptx(changed, { edited: 'slides' });
    expect(asSlides.slides).toHaveLength(3);
    expect(asSlides.slides[2].canvas).toBeUndefined();
    expect(JSON.stringify(asSlides.slides[2].contents)).toContain('Step 2');
  });
});
