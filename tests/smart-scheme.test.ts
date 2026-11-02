// @vitest-environment jsdom
//
// Smart Schemes: a scheme or a catalytic cycle kept as one object. Its species are slots in the
// order the arrows join them; slots can be added, taken out and reordered, the layout switched,
// and it survives saving to CDXML (where every id changes).

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { CYCLE_PRESETS, buildCycle } from '../src/chem/cycles';
import { arrangeSmart, cleanSmart, fillHolder, fillHoldersDrawn, holderToSlotText, insertSlot, makeSmart, markupRuns, moveSlot, readSmart, refitSmart, removeSlot, runsMarkup, setSlotRuns, setSlotText, setStepRuns, setStepText, slotName, slotToHolder, smartFrameOf, smartMarks, ungroupSmart } from '../src/chem/smart-scheme';
import { chemRuns } from '../src/text/chemtext';
import { plainText } from '../src/richtext';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import type { Selection } from '../src/editor/arrange';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { extractDrawing, insertDrawing } from '../src/io/clipboard';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
const opts: PptxOptions = { async picture(d) { return { png: PNG, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', box: d.bounds()! }; }, async svgToPng() { return PNG; } };

const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

/** Three species in a line, joined by two arrows with conditions, as a Smart Scheme. */
function line() {
  const doc = new Doc();
  const m = plainMeasure(doc);
  const s = sel();
  let id = 0;
  doc.edit('make', () => {
    const names = ['ArBr', 'ArAr′', 'ArCHO'];
    const caps = names.map((t, i) => doc.addCaption({ x: i * 120, y: 0, runs: [{ text: t }], justify: 'center' }));
    for (const c of caps) s.captions.add(c.id);
    const cond = doc.addCaption({ x: 60, y: -10, runs: chemRuns('Pd(PPh3)4'), justify: 'center' });
    s.captions.add(cond.id);
    for (let i = 0; i < 2; i++) {
      const r = doc.addArrow({
        headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
        tail: { x: i * 120 + 35, y: 0 }, head: { x: i * 120 + 85, y: 0 },
        step: { reactants: ['c' + caps[i].id], products: ['c' + caps[i + 1].id], above: i === 0 ? ['c' + cond.id] : [], below: [], manual: true },
      });
      s.arrows.add(r.id);
    }
    id = makeSmart(doc, m, s)!;
  });
  return { doc, m, id };
}

const names = (doc: Doc, m: ReturnType<typeof plainMeasure>, id: number) => readSmart(doc, m, id)!.slots.map((sl) => slotName(doc, sl));

describe('Smart Schemes', () => {
  it('reads a scheme as slots in arrow order, and finds its frame from any part', () => {
    const { doc, m, id } = line();
    const s = doc.shapes.get(id)!;
    expect(s.smart?.layout).toBe('line');
    expect(s.lineWidth).toBe(0);
    const read = readSmart(doc, m, id)!;
    expect(read.chain).toBe(true);
    expect(read.closed).toBe(false);
    expect(names(doc, m, id)).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
    expect(read.links.length).toBe(2);
    expect(read.links[0].above.length).toBe(1);
    const cap = read.slots[1].caption!;
    expect(smartFrameOf(doc, 'caption', cap)).toBe(id);
    expect(smartFrameOf(doc, 'arrow', read.links[1].arrow.id)).toBe(id);
  });

  it('adds a species after one, joining it in with a new arrow', () => {
    const { doc, m, id } = line();
    doc.edit('add', () => insertSlot(doc, m, id, 0, 'Int'));
    expect(names(doc, m, id)).toEqual(['ArBr', 'Int', 'ArAr′', 'ArCHO']);
    const read = readSmart(doc, m, id)!;
    expect(read.links.length).toBe(3);
    // the first step keeps its conditions
    expect(plainText(doc.captions.get(read.links[0].above[0].caption!)!.runs)).toBe('Pd(PPh3)4');
    // laid out in a line again: left to right
    const xs = read.slots.map((s) => (s.box.x1 + s.box.x2) / 2);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    // and at the end, and before the first
    doc.edit('add', () => insertSlot(doc, m, id, 3, 'End'));
    doc.edit('add', () => insertSlot(doc, m, id, -1, 'Start'));
    expect(names(doc, m, id)).toEqual(['Start', 'ArBr', 'Int', 'ArAr′', 'ArCHO', 'End']);
  });

  it('takes a species out with the step after it, and moves one to another place', () => {
    const { doc, m, id } = line();
    doc.edit('add', () => insertSlot(doc, m, id, 2, 'X'));
    doc.edit('remove', () => removeSlot(doc, m, id, 1));
    expect(names(doc, m, id)).toEqual(['ArBr', 'ArCHO', 'X']);
    expect(readSmart(doc, m, id)!.links.length).toBe(2);
    doc.edit('move', () => moveSlot(doc, m, id, 2, 0));
    expect(names(doc, m, id)).toEqual(['X', 'ArBr', 'ArCHO']);
    // never fewer than two
    doc.edit('remove', () => removeSlot(doc, m, id, 0));
    expect(removeSlot(doc, m, id, 0)).toBe(false);
  });

  it('retypes species and conditions, and adds or clears conditions', () => {
    const { doc, m, id } = line();
    doc.edit('t', () => setSlotText(doc, m, id, 0, 'PhB(OH)_2'));
    expect(names(doc, m, id)[0]).toBe('PhB(OH)2');
    doc.edit('t', () => setStepText(doc, m, id, 1, 'below', 'DMF, 80 °C'));
    let read = readSmart(doc, m, id)!;
    expect(read.links[1].below.length).toBe(1);
    doc.edit('t', () => setStepText(doc, m, id, 0, 'above', ''));
    read = readSmart(doc, m, id)!;
    expect(read.links[0].above.length).toBe(0);
  });

  it('switches to a cycle (closing the loop) and back to a line (opening it)', () => {
    const { doc, m, id } = line();
    doc.edit('c', () => arrangeSmart(doc, m, id, { layout: 'cycle' }));
    let read = readSmart(doc, m, id)!;
    expect(read.closed).toBe(true);
    expect(read.links.length).toBe(3);
    expect(doc.shapes.get(id)!.smart!.layout).toBe('cycle');
    doc.edit('l', () => arrangeSmart(doc, m, id, { layout: 'line' }));
    read = readSmart(doc, m, id)!;
    expect(read.closed).toBe(false);
    expect(read.links.length).toBe(2);
    expect(names(doc, m, id)).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
  });

  it('marks each species and offers a + between them and after the last', () => {
    const { doc, m, id } = line();
    const marks = smartMarks(doc, m, id)!;
    expect(marks.boxes.length).toBe(3);
    expect(marks.adds.map((a) => a.after)).toEqual([0, 1, 2]);
  });

  it('a species moved by hand takes its arrows and their conditions with it', () => {
    const { doc, m, id } = line();
    const read = readSmart(doc, m, id)!;
    const cap = read.slots[2].caption!;
    const arrow = read.links[1].arrow.id;
    const headBefore = { ...doc.arrows.get(arrow)!.head };
    doc.beforeCommit = (before) => refitSmart(doc, before, m);
    doc.edit('drag', () => { const c = doc.captions.get(cap)!; doc.updateCaption(cap, { x: c.x + 60, y: c.y + 40 }); });
    const head = doc.arrows.get(arrow)!.head;
    expect(head.x).toBeGreaterThan(headBefore.x + 20);
    expect(head.y).toBeGreaterThan(headBefore.y + 10);
  });

  it('a catalytic cycle from the Catalytic Cycle window becomes a cycle Smart Scheme', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    let id: number | null = null;
    doc.edit('cycle', () => {
      const made = buildCycle(doc, m, CYCLE_PRESETS.find((p) => p.id === 'suzuki')!.spec, { names: 'short', reagentArrows: true }, { x: 300, y: 300 });
      const s = sel();
      for (const c of made.captions) s.captions.add(c);
      for (const r of made.arrows) s.arrows.add(r);
      id = makeSmart(doc, m, s, { layout: 'cycle', reagentArrows: true });
    });
    expect(id).not.toBeNull();
    const read = readSmart(doc, m, id!)!;
    expect(read.closed).toBe(true);
    expect(read.slots.length).toBe(4);
    expect(doc.shapes.get(id!)!.smart!.layout).toBe('cycle');
    // adding a species keeps it a closed loop of five
    doc.edit('add', () => insertSlot(doc, m, id!, 1, 'X'));
    const again = readSmart(doc, m, id!)!;
    expect(again.slots.length).toBe(5);
    expect(again.closed).toBe(true);
    // reagent arrows go with the cycle's steps
    expect([...doc.arrows.values()].filter((r) => r.reagentFor !== undefined).every((r) => doc.shapes.get(id!)!.frame!.arrows.includes(r.id))).toBe(true);
  });

  it('two loops turning together become a Smart Scheme laid out by hand', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    let id: number | null = null;
    doc.edit('cycle', () => {
      const made = buildCycle(doc, m, CYCLE_PRESETS.find((p) => p.id === 'sonogashira')!.spec, { names: 'short', reagentArrows: true }, { x: 300, y: 300 });
      const s = sel();
      for (const c of made.captions) s.captions.add(c);
      for (const r of made.arrows) s.arrows.add(r);
      id = makeSmart(doc, m, s, { layout: 'cycle' });
    });
    expect(doc.shapes.get(id!)!.smart!.free).toBe(true);
    expect(arrangeSmart(doc, m, id!)).toBe(false);
  });

  it('Ungroup leaves the scheme as ordinary things', () => {
    const { doc, id } = line();
    const before = doc.captions.size + doc.arrows.size;
    doc.edit('u', () => ungroupSmart(doc, id));
    expect(doc.shapes.has(id)).toBe(false);
    expect(doc.captions.size + doc.arrows.size).toBe(before);
  });

  it('survives saving to CDXML: the frame finds its scheme again, in the same order', () => {
    const { doc, m, id } = line();
    doc.edit('add', () => insertSlot(doc, m, id, 2, 'Last'));
    doc.edit('c', () => arrangeSmart(doc, m, id, { layout: 'rows', perRow: 2 }));
    const xml = writeCdxml(doc);
    // ChemDraw sees ordinary text and arrows; our tag keeps the layout
    expect(xml).toMatch(/Chem Illustrator shape/);
    const back = readCdxml(xml).doc;
    const frame = [...back.shapes.values()].find((s) => s.smart)!;
    expect(frame).toBeTruthy();
    expect(frame.smart).toEqual({ layout: 'rows', perRow: 2 });
    const bm = plainMeasure(back);
    expect(names(back, bm, frame.id)).toEqual(['ArBr', 'ArAr′', 'ArCHO', 'Last']);
  });

  it('survives saving a slide to PowerPoint: the frame travels in the scheme\'s picture', async () => {
    const { doc, m, id } = line();
    doc.edit('c', () => arrangeSmart(doc, m, id, { layout: 'cycle' }));
    const d = Deck.design(new Doc(), { w: 720, h: 405 });
    const slide = d.docOf(0);
    slide.restoreContents(doc.contents());
    const bytes = await writePptx({ size: d.size, master: d.master, slides: [{ layout: 'blank', doc: slide, notes: '' }] }, opts);
    const back = readPptx(bytes).slides[0].contents;
    const host = new Doc();
    host.restoreContents(back);
    const frame = [...host.shapes.values()].find((s) => s.smart)!;
    expect(frame?.smart?.layout).toBe('cycle');
    const read = readSmart(host, plainMeasure(host), frame.id)!;
    expect(read.slots.map((sl) => slotName(host, sl))).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
    expect(read.closed).toBe(true);
  });

  it('copies and pastes as a second scheme of its own, leaving the first one alone', () => {
    const { doc, m, id } = line();
    const part = extractDrawing(doc, null);
    const sel = insertDrawing(doc, part, { x: 400, y: 300 });
    const copy = [...sel.shapes].find((s) => doc.shapes.get(s)?.smart)!;
    expect(copy).not.toBe(id);
    const f = doc.shapes.get(copy)!.frame!;
    for (const c of f.captions) expect(sel.captions.has(c)).toBe(true);
    for (const a of f.arrows) expect(sel.arrows.has(a)).toBe(true);
    expect(names(doc, m, copy)).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
    // the copy's arrows name the copied species
    for (const a of f.arrows) for (const r of doc.arrows.get(a)!.step!.products) expect(sel.captions.has(Number(r.slice(1)))).toBe(true);
    expect(names(doc, m, id)).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
  });

  it('cleans data read from a file', () => {
    expect(cleanSmart({ layout: 'cycle', anticlockwise: true, perRow: 99 })).toEqual({ layout: 'cycle', anticlockwise: true });
    expect(cleanSmart({ layout: 'spiral' })).toBeNull();
    expect(cleanSmart(null)).toBeNull();
  });

  it('writes caption text with _ and ^ for the species list, and reads it back', () => {
    for (const t of ['L_nPd^0', 'Pd(PPh3)4', 'ArPd^{II}X', 'X^−', 'Step 2']) {
      const runs = markupRuns(t);
      expect(runsMarkup(runs), t).toBe(t);
    }
  });

  it('takes formatted text from the species list as it is, without working the chemistry out again', () => {
    const { doc, m, id } = line();
    doc.edit('t', () => setSlotRuns(doc, m, id, 0, [{ text: 'Step 2' }, { text: 'a', sup: true }]));
    const c = doc.captions.get(readSmart(doc, m, id)!.slots[0].caption!)!;
    expect(c.runs.map((r) => [r.text, !!r.sub, !!r.sup])).toEqual([['Step 2', false, false], ['a', false, true]]);
    // a plain 2 after a letter stays plain when it was typed so
    doc.edit('t', () => setStepRuns(doc, m, id, 1, 'below', [{ text: ' H2O ' }]));
    const read = readSmart(doc, m, id)!;
    const below = doc.captions.get(read.links[1].below[0].caption!)!;
    expect(below.runs.map((r) => r.text)).toEqual(['H2O']);
  });

  it('turns a species into a dashed box to draw in, and back to its text', () => {
    const { doc, m, id } = line();
    let box: number | null = null;
    doc.edit('s', () => { box = slotToHolder(doc, m, id, 1); });
    expect(box).not.toBeNull();
    const sh = doc.shapes.get(box!)!;
    expect(sh.dashed).toBe(true);
    expect(plainText(sh.holder!.runs!)).toBe('ArAr′');
    const read = readSmart(doc, m, id)!;
    expect(read.slots.length).toBe(3);
    expect(read.slots[1].holder).toBe(box);
    expect(slotName(doc, read.slots[1])).toMatch(/draw or paste/);
    // the steps lead to and from the box
    expect(read.links[0].to).toBe(1);
    expect(read.links[1].from).toBe(1);
    doc.edit('t', () => { holderToSlotText(doc, m, id, 1); });
    expect(doc.shapes.has(box!)).toBe(false);
    expect(names(doc, m, id)).toEqual(['ArBr', 'ArAr′', 'ArCHO']);
  });

  it('a structure pasted into the box becomes that species', () => {
    const { doc, m, id } = line();
    let box = 0;
    doc.edit('s', () => { box = slotToHolder(doc, m, id, 1)!; });
    const src = new Doc();
    src.edit('d', () => { const a = src.addAtom(0, 0), b = src.addAtom(26, 15), c = src.addAtom(52, 0); src.addBond(a.id, b.id, 1); src.addBond(b.id, c.id, 1); });
    doc.edit('p', () => {
      const sh = doc.shapes.get(box)!;
      const got = insertDrawing(doc, src, { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 });
      expect(fillHolder(doc, m, box, [...got.atoms])).toBe(true);
    });
    expect(doc.shapes.has(box)).toBe(false);
    const read = readSmart(doc, m, id)!;
    expect(read.slots.length).toBe(3);
    expect(read.slots[1].items[0].atoms.length).toBe(3);
    expect(names(doc, m, id)).toEqual(['ArBr', 'Structure', 'ArCHO']);
    expect(read.links.map((l) => [l.from, l.to])).toEqual([[0, 1], [1, 2]]);
  });

  it('atoms drawn inside the box become that species, where they were drawn', () => {
    const { doc, m, id } = line();
    let box = 0;
    doc.edit('s', () => { box = slotToHolder(doc, m, id, 1)!; });
    doc.beforeCommit = (before) => fillHoldersDrawn(doc, before, m);
    const sh = doc.shapes.get(box)!;
    const cx = (sh.x1 + sh.x2) / 2, cy = (sh.y1 + sh.y2) / 2;
    let first = 0;
    doc.edit('bond', () => { const a = doc.addAtom(cx - 13, cy), b = doc.addAtom(cx + 13, cy); doc.addBond(a.id, b.id, 1); first = a.id; });
    expect(doc.shapes.has(box)).toBe(false);
    expect(doc.atoms.get(first)!.x).toBeCloseTo(cx - 13);
    expect(smartFrameOf(doc, 'atom', first)).toBe(id);
    expect(readSmart(doc, m, id)!.slots[1].items[0].atoms).toContain(first);
  });

  it('keeps a dashed species box when saved to CDXML', () => {
    const { doc, m, id } = line();
    doc.edit('s', () => { slotToHolder(doc, m, id, 2); });
    const back = readCdxml(writeCdxml(doc)).doc;
    const frame = [...back.shapes.values()].find((x) => x.smart)!;
    const read = readSmart(back, plainMeasure(back), frame.id)!;
    expect(read.slots.length).toBe(3);
    expect(read.slots[2].holder).toBeDefined();
    expect(plainText(back.shapes.get(read.slots[2].holder!)!.holder!.runs!)).toBe('ArCHO');
  });
});
