// @vitest-environment jsdom
//
// Office wave 4, presenting and media: emphasis effects, the Morph transition, video and audio
// from files, action buttons and zooms, and ink from the slide show, in the app and through
// PowerPoint files and back.

import { describe, it, expect } from 'vitest';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { newAnim, partStates, slideParts, partOf, transitionXml, readTransition, animName, type Anim, type Transition } from '../src/deck/animation';
import { morphPairs } from '../src/deck/playback';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
export const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
export const opts: PptxOptions = { async picture() { return null; }, async svgToPng() { return PNG; } };

/** A one-slide deck holding a picture, a box and a text box, through PowerPoint and back. */
async function roundTrip(transition: Transition | undefined, anims: (ids: number[]) => Anim[]) {
  const host = new Doc();
  const d = Deck.blank(host);
  d.attach();
  d.setLayout('blank');
  const ids: number[] = [];
  host.edit('Things', () => {
    ids.push(host.addShape({ kind: 'picture', x1: 100, y1: 100, x2: 200, y2: 180, src: DOT, px: { w: 1, h: 1 } }).id);
    ids.push(host.addShape({ kind: 'rect', x1: 300, y1: 100, x2: 400, y2: 180, filled: true }).id);
    ids.push(host.addCaption({ x: 100, y: 300, runs: [{ text: 'Yield 92%' }] }).id);
  });
  const list = anims(ids);
  const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes, transition, anims: list })) }, opts);
  return { xml: strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml']), back: readPptx(bytes) };
}

describe('emphasis effects', () => {
  it('leaves an emphasised part showing, and keeps what the effect did', () => {
    const doc = new Doc();
    let a!: { id: number };
    doc.bulk(() => { a = doc.addShape({ kind: 'rect', x1: 0, y1: 0, x2: 50, y2: 50 }); });
    const parts = slideParts(doc);
    const t = { kind: 'shape' as const, id: a.id };
    const anims = [newAnim(t, 'grow'), newAnim(t, 'spin'), { ...newAnim(t, 'transparency'), opacity: 0.25 }];
    const p = partOf(parts, t)!;
    expect(partStates(parts, anims, 0, -1).get(p)?.visible ?? true).toBe(true);
    // half way through growing
    const mid = partStates(parts, anims, 0, 1).get(p)!;
    expect(mid.emph!.scale).toBeCloseTo(1.25);
    // all three played: half as big again, a whole turn, a quarter see-through
    const end = partStates(parts, anims, 3, -1).get(p)!.emph!;
    expect(end.scale).toBeCloseTo(1.5);
    expect(end.rot).toBeCloseTo(360);
    expect(end.alpha).toBeCloseTo(0.75);
  });

  it('pulses and comes back to its size', () => {
    const doc = new Doc();
    let a!: { id: number };
    doc.bulk(() => { a = doc.addShape({ kind: 'rect', x1: 0, y1: 0, x2: 50, y2: 50 }); });
    const parts = slideParts(doc);
    const t = { kind: 'shape' as const, id: a.id };
    const p = partOf(parts, t)!;
    expect(partStates(parts, [newAnim(t, 'pulse')], 0, 0.25).get(p)!.emph!.scale).toBeGreaterThan(1.05);
    expect(partStates(parts, [newAnim(t, 'pulse')], 1, -1).get(p)!.emph!.scale).toBeCloseTo(1);
    expect(animName(newAnim(t, 'grow'))).toBe('Grow/Shrink');
  });

  it('keeps emphasis effects through PowerPoint and back', async () => {
    const { xml, back } = await roundTrip(undefined, ([pic, box, text]) => [
      newAnim({ kind: 'shape', id: pic }, 'pulse'),
      { ...newAnim({ kind: 'shape', id: box }, 'grow'), scale: 0.5, start: 'after' },
      { ...newAnim({ kind: 'shape', id: box }, 'spin'), turn: -90 },
      { ...newAnim({ kind: 'shape', id: pic }, 'transparency'), opacity: 0.7 },
      { ...newAnim({ kind: 'shape', id: box }, 'colour'), color: '#1e88e5' },
      { ...newAnim({ kind: 'caption', id: text }, 'colour'), color: '#43a047', start: 'with' },
    ]);
    expect(xml).toContain('presetClass="emph"');
    expect(xml).toContain('<p:animRot by="-5400000">');
    expect(xml).toContain('<p:by x="50000" y="50000"/>');
    expect(xml).toContain('<p:attrName>fillcolor</p:attrName>');
    expect(xml).toContain('<p:attrName>style.color</p:attrName>');
    const got = back.slides[0].anims!;
    expect(got.map((a) => a.effect)).toEqual(['pulse', 'grow', 'spin', 'transparency', 'colour', 'colour']);
    expect(got[1].scale).toBeCloseTo(0.5);
    expect(got[1].start).toBe('after');
    expect(got[2].turn).toBeCloseTo(-90);
    expect(got[3].opacity).toBeCloseTo(0.7);
    expect(got[4].color).toBe('#1e88e5');
    expect(got[5].color).toBe('#43a047');
    expect(got[5].start).toBe('with');
    expect(got[2].dur).toBeCloseTo(2);
    expect(got[0].dur).toBeCloseTo(0.5);
  });
});

describe('Morph', () => {
  it('writes Morph for PowerPoint 2019 and later, with a fade for older ones, and reads it back', async () => {
    const x = transitionXml({ kind: 'morph', dur: 2 });
    expect(x).toContain('<p159:morph option="byObject"/>');
    expect(x).toContain('Requires="p159"');
    expect(x).toContain('<mc:Fallback><p:transition spd="slow"><p:fade/>');
    const { back } = await roundTrip({ kind: 'morph', dur: 1.5 }, () => []);
    expect(back.slides[0].transition).toEqual({ kind: 'morph', dur: 1.5 });
  });

  it('pairs the same things on two slides, the title with the title', () => {
    const box = (x: number) => ({ x1: x, y1: 0, x2: x + 10, y2: 10 });
    const a = [
      { kind: 'text', key: 'Route A', role: 'title', box: box(0) },
      { kind: 'drawing', key: '6,6,8|2|0|0', role: '', box: box(100) },
      { kind: 'shape geo', key: '', role: '', box: box(300) },
    ];
    const b = [
      { kind: 'shape geo', key: '', role: '', box: box(50) },
      { kind: 'text', key: 'Route B', role: 'title', box: box(0) },
      { kind: 'drawing', key: '6,6,8|2|0|0', role: '', box: box(400) },
      { kind: 'drawing', key: '7,6|1|0|0', role: '', box: box(110) },
    ];
    const pairs = morphPairs(a, b);
    expect(pairs).toContainEqual([1, 2]);
    expect(pairs).toContainEqual([0, 1]);
    expect(pairs).toContainEqual([2, 0]);
    // a new structure fades in
    expect(pairs.some((p) => p[1] === 3)).toBe(false);
  });

  it('reads a slide with no transition as none', () => {
    const doc = new DOMParser().parseFromString('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>', 'application/xml');
    expect(readTransition(doc.documentElement, () => {})).toBeUndefined();
  });
});

// ---------------------------------------------------------------- media, zooms, actions, ink

import { playWindow, volumeAt, mediaMime } from '../src/deck/media';
import { zoomGrid, summaryParts } from '../src/deck/zoom';
import { geoDef, inkId, isInkId, geoShapeStyle } from '../src/design/geo';
import { inkShape, strokeNear } from '../src/ui/show-ink';
import type { Shape } from '../src/model';

const MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29t';
const MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAA';

/** A deck of slides filled by `fill`, through PowerPoint and back: the slides' contents and the slide XML. */
async function deckTrip(fill: ((doc: Doc, ids: number[]) => void)[]) {
  const host = new Doc();
  const d = Deck.blank(host);
  d.attach();
  d.setLayout('blank');
  for (let i = 1; i < fill.length; i++) d.addSlide('blank');
  const ids = d.slides.map((s) => s.id);
  d.slides.forEach((_, i) => { const doc = d.docOf(i); doc.edit('Fill', () => fill[i](doc, ids)); });
  const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ id: s.id, layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
  const files = unzipSync(bytes);
  const back = readPptx(bytes);
  const deck = new Deck(new Doc());
  deck.load(back.slides.map((s) => deck.makeSlide(s.layout, s.contents, s.notes)), back.size, back.master);
  const shapes = (i: number) => [...deck.docOf(i).shapes.values()];
  return { files, xml: (i: number) => strFromU8(files[`ppt/slides/slide${i + 1}.xml`]), shapes, deck, warnings: back.warnings };
}

describe('video and audio', () => {
  it('plays the part between the trims, faded in and out', () => {
    const m = { src: MP4, trimStart: 2, trimEnd: 3, fadeIn: 1, fadeOut: 2, vol: 0.5 };
    expect(playWindow(m, 20)).toEqual({ start: 2, end: 17 });
    expect(volumeAt(m, 2, 20)).toBe(0);
    expect(volumeAt(m, 2.5, 20)).toBeCloseTo(0.25);
    expect(volumeAt(m, 10, 20)).toBeCloseTo(0.5);
    expect(volumeAt(m, 16, 20)).toBeCloseTo(0.25);
    expect(volumeAt({ ...m, mute: true }, 10, 20)).toBe(0);
    expect(mediaMime('talk.MP4')).toEqual({ mime: 'video/mp4', audio: false });
    expect(mediaMime('intro.mp3')).toEqual({ mime: 'audio/mpeg', audio: true });
    expect(mediaMime('notes.txt')).toBeNull();
  });

  it('keeps a video and a sound, with how they play, through PowerPoint and back', async () => {
    const t = await deckTrip([(doc) => {
      doc.addShape({ kind: 'picture', x1: 100, y1: 100, x2: 420, y2: 280, src: DOT, px: { w: 640, h: 360 }, video: { src: MP4, start: 'click', once: true, trimStart: 1.5, trimEnd: 2, fadeIn: 0.5, vol: 0.66, full: true } });
      doc.addShape({ kind: 'picture', x1: 600, y1: 400, x2: 648, y2: 448, src: DOT, px: { w: 128, h: 128 }, video: { src: MP3, audio: true, hide: true, across: true, fadeOut: 3 } });
    }]);
    const xml = t.xml(0);
    expect(xml).toContain('<p14:trim st="1500" end="2000"/>');
    // MS-PPTX's CT_MediaFade names (laptop bench pp-zoom-morph-media: PowerPoint ignored inDur and outDur)
    expect(xml).toContain('<p14:fade in="500"/>');
    expect(xml).toContain('<p14:fade out="3000"/>');
    expect(xml).toContain('<a:audioFile r:link=');
    expect(xml).toContain('nodeType="interactiveSeq"');
    expect(xml).toContain('cmd="togglePause"');
    expect(xml).toContain('<p:video fullScrn="1">');
    expect(xml).toContain('showWhenStopped="0"');
    expect(Object.keys(t.files).some((f) => /ppt\/media\/media\d+\.mp3$/.test(f))).toBe(true);
    expect(strFromU8(t.files['[Content_Types].xml'])).toContain('Extension="mp3" ContentType="audio/mpeg"');
    const [video, sound] = t.shapes(0).filter((s) => s.video).map((s) => s.video!);
    expect(video).toMatchObject({ start: 'click', once: true, trimStart: 1.5, trimEnd: 2, fadeIn: 0.5, full: true });
    expect(video.vol).toBeCloseTo(0.66);
    expect(video.audio).toBeUndefined();
    expect(sound).toMatchObject({ audio: true, hide: true, across: true, fadeOut: 3, start: 'auto' });
    expect(sound.once).toBeUndefined();
  });

  it('starts an animation put on a slide by itself, round and round, as before', async () => {
    const t = await deckTrip([(doc) => { doc.addShape({ kind: 'picture', x1: 100, y1: 100, x2: 420, y2: 280, src: DOT, px: { w: 40, h: 30 }, video: { src: MP4 } }); }]);
    expect(t.xml(0)).toContain('cmd="playFrom(0.0)"');
    const v = t.shapes(0).find((s) => s.video)!.video!;
    expect(v.start).toBe('auto');
    expect(v.once).toBeUndefined();
  });
});

describe('action buttons and zooms', () => {
  it('gives an action button its jump, saved as PowerPoint\'s action', async () => {
    expect(geoShapeStyle('actNext')!.link).toBe('#next');
    const t = await deckTrip([
      (doc) => {
        doc.addShape({ ...(geoShapeStyle('actNext') as Shape), x1: 860, y1: 470, x2: 910, y2: 520 });
        doc.addShape({ ...(geoShapeStyle('actReturn') as Shape), x1: 800, y1: 470, x2: 850, y2: 520 });
      },
      () => {},
    ]);
    const xml = t.xml(0);
    expect(xml).toContain('prst="actionButtonForwardNext"');
    expect(xml).toContain('action="ppaction://hlinkshowjump?jump=nextslide"');
    expect(xml).toContain('jump=lastslideviewed');
    const links = t.shapes(0).map((s) => s.link).sort();
    expect(links).toEqual(['#next', '#return']);
    expect(t.shapes(0)[0].geo).toBe('actNext');
  });

  it('keeps a Slide Zoom, coming back, through PowerPoint and back', async () => {
    const t = await deckTrip([
      (doc, ids) => { doc.addShape({ kind: 'picture', x1: 100, y1: 200, x2: 260, y2: 290, src: DOT, px: { w: 1, h: 1 }, link: `#slide=${ids[2]}`, zoom: { back: true, to: `#slide=${ids[3]}` } }); },
      () => {}, () => {}, () => {},
    ]);
    const xml = t.xml(0);
    expect(xml).toContain('<pslz:sldZmObj sldId="258"');
    expect(xml).toContain('returnToParent="1"');
    expect(xml).toContain('action="ppaction://hlinksldjump"');
    expect(t.xml(2)).toContain('<p14:creationId');
    const z = t.shapes(0).find((s) => s.zoom)!;
    const ids = t.deck.slides.map((s) => s.id);
    expect(z.link).toBe(`#slide=${ids[2]}`);
    expect(z.zoom).toEqual({ back: true, to: `#slide=${ids[3]}` });
  });

  // laptop bench pp-zoom-morph-media: a Summary Zoom was saved as slide zooms, not PowerPoint's own
  it('makes a Summary Zoom with its sections, saved as PowerPoint\'s Summary Zoom and back', async () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.setLayout('blank');
    for (let i = 1; i < 5; i++) d.addSlide('blank');
    const ids = d.slides.map((s) => s.id);
    const parts = [{ first: ids[1], last: ids[2] }, { first: ids[3], last: ids[4] }];
    d.insertSummary(1, (sd) => {
      parts.forEach((p, k) => sd.addShape({ kind: 'picture', x1: 100 + 300 * k, y1: 200, x2: 340 + 300 * k, y2: 335, src: DOT, px: { w: 1, h: 1 }, link: `#slide=${p.first}`, zoom: { back: true, summary: true, to: `#slide=${p.last}` } }));
    }, parts.map((p) => p.first), ['Synthesis', '']);
    // the summary slide in its own section, each part a section, the slide before in a Default Section
    expect(d.sectionCounts()).toEqual([{ name: 'Default Section', count: 1 }, { name: 'Summary Section', count: 1 }, { name: 'Synthesis', count: 2 }, { name: 'Section 2', count: 2 }]);
    // one step to undo
    d.undo();
    expect(d.slides.length).toBe(5);
    expect(d.sections.length).toBe(0);
    d.redo();
    expect(d.sections.length).toBe(4);

    const bytes = await writePptx({ size: d.size, master: d.master, sections: d.sectionCounts(), slides: d.slides.map((s, i) => ({ id: s.id, layout: s.layout, doc: d.docOf(i), notes: s.notes })) }, opts);
    const files = unzipSync(bytes);
    const xml = strFromU8(files['ppt/slides/slide2.xml']);
    expect(xml).toContain('Requires="psuz"');
    expect(xml).toContain('<a:graphicData uri="http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom"><psuz:summaryZm>');
    expect(xml).not.toContain('pslz:sldZm');
    expect(xml.match(/<psuz:summaryZmObj /g)?.length).toBe(2);
    expect(xml).toContain('<psuz:fixedLayout/></psuz:summaryZm>');
    // each part names its section by the id presentation.xml gives it
    const pres = strFromU8(files['ppt/presentation.xml']);
    const secIds = [...pres.matchAll(/<p14:section name="([^"]*)" id="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    const zoomIds = [...xml.matchAll(/summaryZmObj sectionId="([^"]+)"/g)].map((m) => m[1]);
    expect(zoomIds).toEqual([secIds[2][1], secIds[3][1]]);
    // the second part sits 300 pt to the right of the first in the frame
    expect(xml).toContain(`<a:off x="${300 * 12700}" y="0"/>`);

    const load = (b: Uint8Array) => {
      const back = readPptx(b);
      const deck = new Deck(new Doc());
      deck.load(back.slides.map((s) => deck.makeSlide(s.layout, s.contents, s.notes)), back.size, back.master, back.sections);
      return deck;
    };
    const ours = load(bytes);
    const zs = [...ours.docOf(1).shapes.values()].filter((s) => s.zoom);
    const nid = ours.slides.map((s) => s.id);
    expect(zs.map((z) => z.link)).toEqual([`#slide=${nid[2]}`, `#slide=${nid[4]}`]);
    expect(zs.map((z) => z.zoom)).toEqual([{ back: true, summary: true, to: `#slide=${nid[3]}` }, { back: true, summary: true, to: `#slide=${nid[5]}` }]);

    // one PowerPoint made (no tags of ours): each part plays its section and comes back
    files['ppt/slides/slide2.xml'] = new Uint8Array(new TextEncoder().encode(xml.replace(/<p:custDataLst><p:tags r:id="[^"]+"\/><\/p:custDataLst>/g, '')));
    const theirs = load(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new Uint8Array(v)]))));
    const tz = [...theirs.docOf(1).shapes.values()].filter((s) => s.zoom);
    expect(tz.map((z) => z.zoom)).toEqual([{ back: true, summary: true, to: `#slide=${nid[3]}` }, { back: true, summary: true, to: `#slide=${nid[5]}` }]);
  });

  it('saves a Summary Zoom whose parts no longer start sections as slide zooms', async () => {
    const t = await deckTrip([
      (doc, ids) => { doc.addShape({ kind: 'picture', x1: 100, y1: 200, x2: 260, y2: 290, src: DOT, px: { w: 1, h: 1 }, link: `#slide=${ids[1]}`, zoom: { back: true, summary: true } }); },
      () => {},
    ]);
    expect(t.xml(0)).toContain('pslz:sldZm');
    expect(t.xml(0)).not.toContain('psuz');
  });

  it('lays zooms out in a grid of slide-shaped boxes, and splits a deck into parts', () => {
    const boxes = zoomGrid(4, { w: 960, h: 540 }, { x1: 0, y1: 100, x2: 960, y2: 540 });
    expect(boxes.length).toBe(4);
    for (const b of boxes) expect((b.y2 - b.y1) / (b.x2 - b.x1)).toBeCloseTo(540 / 960);
    expect(boxes.every((b, i) => i === 0 || b.x1 >= boxes[i - 1].x2 || b.y1 >= boxes[i - 1].y2)).toBe(true);
    expect(summaryParts([5, 1, 3], 8)).toEqual([{ first: 1, last: 2 }, { first: 3, last: 4 }, { first: 5, last: 7 }]);
  });
});

describe('ink from the slide show', () => {
  const stroke = { tool: 'pen' as const, color: '#e53935', width: 3, pts: [{ x: 100, y: 100 }, { x: 150, y: 120 }, { x: 200, y: 100 }] };

  it('keeps a stroke as a shape that holds its line, and stretches with its box', () => {
    const sh = inkShape(stroke)!;
    expect(isInkId(sh.geo)).toBe(true);
    expect(sh.x1).toBeCloseTo(98);
    expect(sh.x2).toBeCloseTo(202);
    const out = geoDef(sh.geo).draw(sh.x2 - sh.x1, sh.y2 - sh.y1).body;
    expect(out.length).toBeGreaterThan(6);
    expect(inkShape({ ...stroke, tool: 'highlighter' })!.transparency).toBe(0.5);
    expect(inkId(2, [{ x: 5, y: 5 }], { x1: 0, y1: 0, x2: 10, y2: 10 })).toBe('ink:2:5000,5000');
    expect(strokeNear(stroke, { x: 150, y: 123 }, 2)).toBe(true);
    expect(strokeNear(stroke, { x: 150, y: 140 }, 2)).toBe(false);
  });

  it('goes to PowerPoint as a freeform and comes back as ink', async () => {
    const t = await deckTrip([(doc) => { doc.addShape(inkShape(stroke)!); }]);
    expect(t.xml(0)).toContain('<a:custGeom>');
    const back = t.shapes(0)[0];
    expect(isInkId(back.geo)).toBe(true);
    expect(back.fillColor).toBe('#e53935');
  });
});
