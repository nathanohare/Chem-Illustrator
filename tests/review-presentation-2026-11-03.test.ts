// @vitest-environment jsdom
//
// Fixes from the 2026-11-03 review of Presentation's objects and slide show
// (reviews/2026-11-03/presentation.md), each with the case that showed it:
// - a Smart Scheme built step by step (Auto-Animate Steps) comes back from PowerPoint as a Smart Scheme
// - a Smart Scheme's dashed species and reagent boxes come back from PowerPoint
// - retyping or recoloring a species of a cycle leaves its arcs where the layout put them
// - Turn in 3-D views stay with their own animations when one plays on a trigger
// - a second loop is not offered while a step has a structure joining or leaving it

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { CYCLE_PRESETS, buildCycle } from '../src/chem/cycles';
import { arrangeSmart, fillHolder, makeSmart, readSmart, refitSmart, setSlotRuns, slotName, slotToHolder, stepPartKind, stepToHolder } from '../src/chem/smart-scheme';
import { smartCycleStart, structureReagents } from '../src/chem/smart-cycle';
import { refitFrames } from '../src/editor/frames';
import { markPieces, stepPieces } from '../src/deck/auto-steps';
import { newAnim, type Anim } from '../src/deck/animation';
import { axisView, viewAngle } from '../src/deck/turn3d';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import type { Selection } from '../src/editor/arrange';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
// (as the app's pictures are: room round what is drawn for line widths and arrowheads)
const opts: PptxOptions = {
  async picture(d) { const b = d.bounds()!; return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', box: { x1: b.x1 - 4, y1: b.y1 - 4, x2: b.x2 + 4, y2: b.y2 + 4 } }; },
  async svgToPng() { return PNG; },
};
const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });
const arrow = (doc: Doc, t: number, h: number, y: number, re: string, pr: string) => doc.addArrow({
  headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
  tail: { x: t, y }, head: { x: h, y }, step: { reactants: [re], products: [pr], above: [], below: [], manual: true },
}).id;

/** Species as text boxes in a line, joined by arrows, as a Smart Scheme laid out as `layout`. */
function textScheme(names: string[], layout: 'line' | 'cycle' = 'line') {
  const doc = new Doc();
  const m = plainMeasure(doc);
  const s = sel();
  let id = 0;
  doc.edit('make', () => {
    const caps = names.map((t, i) => doc.addCaption({ x: 100 + i * 150, y: 100, runs: [{ text: t }], justify: 'center' }));
    for (const c of caps) s.captions.add(c.id);
    for (let i = 0; i + 1 < caps.length; i++) s.arrows.add(arrow(doc, 135 + i * 150, 215 + i * 150, 100, 'c' + caps[i].id, 'c' + caps[i + 1].id));
    id = makeSmart(doc, m, s)!;
    arrangeSmart(doc, m, id, { layout });
  });
  return { doc, m, id };
}

/** What a Smart Scheme reads as: its species, steps, and what sits above its first arrow. */
function summary(doc: Doc) {
  const f = [...doc.shapes.values()].find((s) => s.smart);
  const r = f ? readSmart(doc, plainMeasure(doc), f.id) : null;
  return r && { names: r.slots.map((sl) => slotName(doc, sl)), links: r.links.length, chain: r.chain, above0: r.links[0] ? stepPartKind(doc, r.links[0], 'above') : null };
}

/** A slide holding `doc`, saved for PowerPoint and read back. */
async function throughPowerPoint(doc: Doc): Promise<Doc> {
  const d = Deck.design(new Doc(), { w: 720, h: 405 });
  const slide = d.docOf(0);
  slide.restoreContents(doc.contents());
  const bytes = await writePptx({ size: d.size, master: d.master, slides: [{ layout: 'blank', doc: slide, notes: '' }] }, opts);
  const back = new Doc();
  back.restoreContents(readPptx(bytes).slides[0].contents);
  return back;
}

describe('Smart Schemes through PowerPoint', () => {
  it('one built step by step (each step a picture of its own) is still the same Smart Scheme', async () => {
    const { doc, m, id } = textScheme(['ArBr', 'ArAr′', 'ArCHO']);
    const f = doc.shapes.get(id)!.frame!;
    const pieces = stepPieces(doc, m, { atoms: new Set(f.atoms), captions: new Set(f.captions), arrows: new Set(f.arrows), shapes: new Set(f.shapes) })!;
    doc.edit('Auto-Animate Steps', () => markPieces(doc, pieces));
    const want = summary(doc);
    expect(want?.names).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
    expect(summary(await throughPowerPoint(doc))).toEqual(want);
  });

  it('keeps the dashed boxes a species and a reagent wait in', async () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    const s = sel();
    let id = 0;
    doc.edit('make', () => {
      const L = doc.style.bondLength;
      const ring = (x0: number) => {
        const ids: number[] = [];
        for (let k = 0; k < 6; k++) ids.push(doc.addAtom(x0 + L * Math.cos((k * Math.PI) / 3), 100 + L * Math.sin((k * Math.PI) / 3)).id);
        for (let k = 0; k < 6; k++) doc.addBond(ids[k], ids[(k + 1) % 6], 1);
        return ids;
      };
      const a = ring(100), b = ring(250);
      const c = doc.addCaption({ x: 400, y: 100, runs: [{ text: 'Product' }], justify: 'center' });
      for (const x of [...a, ...b]) s.atoms.add(x);
      s.captions.add(c.id);
      s.arrows.add(arrow(doc, 135, 205, 100, 'a' + Math.min(...a), 'a' + Math.min(...b)));
      s.arrows.add(arrow(doc, 285, 360, 100, 'a' + Math.min(...b), 'c' + c.id));
      id = makeSmart(doc, m, s)!;
    });
    doc.edit('reagent box', () => stepToHolder(doc, m, id, 0, 'above'));
    doc.edit('species box', () => slotToHolder(doc, m, id, 2));
    const want = summary(doc);
    expect(want).toMatchObject({ links: 2, above0: 'box' });
    expect(summary(await throughPowerPoint(doc))).toEqual(want);
  });
});

describe('a Smart Scheme cycle keeps its arcs', () => {
  const withRefit = (doc: Doc, m: ReturnType<typeof plainMeasure>) => { doc.beforeCommit = (before) => { refitSmart(doc, before, m); refitFrames(doc, before, m); }; };
  const arcs = (doc: Doc) => JSON.stringify([...doc.arrows.values()].map((a) => [a.tail, a.head, a.sweep]));

  it('when a species is retyped or recolored', () => {
    const { doc, m, id } = textScheme(['ArBr', 'ArAr′', 'ArCHO', 'ArOH'], 'cycle');
    withRefit(doc, m);
    const was = arcs(doc);
    doc.edit('Type Species', () => setSlotRuns(doc, m, id, 1, [{ text: 'ArAr' }]));
    expect(arcs(doc)).toBe(was);
    const c = readSmart(doc, m, id)!.slots[2].caption!;
    doc.edit('Color', () => doc.updateCaption(c, { color: '#c00000' }));
    expect(arcs(doc)).toBe(was);
  });

  it('and they still follow a species dragged by hand', () => {
    const { doc, m, id } = textScheme(['ArBr', 'ArAr′', 'ArCHO', 'ArOH'], 'cycle');
    withRefit(doc, m);
    const read = readSmart(doc, m, id)!;
    const c = read.slots[1].caption!;
    const into = read.links.find((l) => l.to === 1)!.arrow.id;
    const head = { ...doc.arrows.get(into)!.head };
    doc.edit('Move', () => { const x = doc.captions.get(c)!; doc.updateCaption(c, { x: x.x + 40, y: x.y + 30 }); });
    const now = doc.arrows.get(into)!.head;
    expect(Math.hypot(now.x - head.x, now.y - head.y)).toBeGreaterThan(10);
  });
});

describe('Turn in 3-D through PowerPoint', () => {
  it('each turn keeps its own view when one plays on a trigger', async () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.setLayout('blank');
    const mol = (x: number) => {
      let id = 0;
      host.edit('m', () => { const a = host.addAtom(x, 100), b = host.addAtom(x + 12, 93), c = host.addAtom(x + 25, 100); host.addBond(a.id, b.id); host.addBond(b.id, c.id); id = a.id; });
      return id;
    };
    const a = mol(100), b = mol(300);
    let btn = 0;
    host.edit('button', () => { btn = host.addShape({ kind: 'rect', x1: 10, y1: 10, x2: 40, y2: 40 }).id; });
    const vA = axisView('y', 120), vB = axisView('x', 60);
    const list: Anim[] = [
      { ...newAnim({ kind: 'atom', id: a }, 'turn3d'), view: vA, trigger: { kind: 'shape', id: btn } },
      { ...newAnim({ kind: 'atom', id: b }, 'turn3d'), view: vB },
    ];
    const bytes = await writePptx({ size: d.size, master: d.master, slides: d.slides.map((s, i) => ({ layout: s.layout, doc: d.docOf(i), notes: s.notes, anims: list })) }, opts);
    const got = readPptx(bytes).slides[0].anims!.filter((x) => x.effect === 'turn3d');
    expect(got).toHaveLength(2);
    expect(viewAngle(got.find((x) => !x.trigger)!.view!, vB)).toBeLessThan(1e-3);
    expect(viewAngle(got.find((x) => x.trigger)!.view!, vA)).toBeLessThan(1e-3);
  });
});

describe('a second loop for a Smart Scheme cycle', () => {
  it('is not offered while a step has a structure joining it (it would be left behind)', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    let id = 0;
    doc.edit('cycle', () => {
      const made = buildCycle(doc, m, CYCLE_PRESETS.find((p) => p.id === 'suzuki')!.spec, { names: 'short', reagentArrows: false }, { x: 300, y: 300 });
      const s = sel();
      for (const c of made.captions) s.captions.add(c);
      for (const r of made.arrows) s.arrows.add(r);
      id = makeSmart(doc, m, s, { layout: 'cycle' })!;
    });
    expect(smartCycleStart(doc, m, id)).not.toBeNull();
    let box: number | null = null;
    doc.edit('box', () => { box = stepToHolder(doc, m, id, 0, 'above'); });
    expect(structureReagents(doc, m, id)).toBe(true);
    expect(smartCycleStart(doc, m, id)).toBeNull();
    doc.edit('fill', () => {
      const s = doc.shapes.get(box!)!;
      const a = doc.addAtom((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 35), b = doc.addAtom((s.x1 + s.x2) / 2 + 20, (s.y1 + s.y2) / 2, 6);
      doc.addBond(a.id, b.id, 1);
      fillHolder(doc, m, box!, [a.id, b.id]);
    });
    expect(smartCycleStart(doc, m, id)).toBeNull();
  });
});
