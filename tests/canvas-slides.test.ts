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
  canvasTag, readCanvasTag, clampZoom, ZOOM_MIN, shownRect, slidePlace, type CanvasData,
} from '../src/deck/canvas';
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
