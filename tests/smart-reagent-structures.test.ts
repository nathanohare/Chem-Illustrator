// @vitest-environment jsdom
//
// What joins or leaves a catalytic cycle (or sits above or below a scheme's arrow) can be a
// structure: a dashed box to draw or paste it in, kept on the step, and back to text again.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { CYCLE_PRESETS, buildCycle } from '../src/chem/cycles';
import { fillHolder, makeSmart, readSmart, stepHolder, stepHolderToText, stepPartKind, stepToHolder } from '../src/chem/smart-scheme';
import type { Selection } from '../src/editor/arrange';
import { plainText } from '../src/richtext';

const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

function suzuki(reagentArrows = true) {
  const doc = new Doc();
  const m = plainMeasure(doc);
  let id = 0;
  doc.edit('cycle', () => {
    const made = buildCycle(doc, m, CYCLE_PRESETS.find((p) => p.id === 'suzuki')!.spec, { names: 'short', reagentArrows }, { x: 300, y: 300 });
    const s = sel();
    for (const c of made.captions) s.captions.add(c);
    for (const r of made.arrows) s.arrows.add(r);
    id = makeSmart(doc, m, s, { layout: 'cycle', reagentArrows })!;
  });
  return { doc, m, id };
}

describe('structures joining and leaving a cycle', () => {
  it('turns what joins at a step into a dashed box, keeping its text to go back to', () => {
    const { doc, m, id } = suzuki();
    const read0 = readSmart(doc, m, id)!;
    const k = read0.links.findIndex((l) => l.above.some((it) => it.caption !== undefined && plainText(doc.captions.get(it.caption)!.runs) === 'Ar–X'));
    expect(k).toBeGreaterThanOrEqual(0);
    let box: number | null = null;
    doc.edit('box', () => { box = stepToHolder(doc, m, id, k, 'above'); });
    expect(box).not.toBeNull();
    const l = readSmart(doc, m, id)!.links[k];
    expect(stepPartKind(doc, l, 'above')).toBe('box');
    expect(stepHolder(doc, l, 'above')).toBe(box);
    expect(doc.shapes.get(id)!.frame!.shapes).toContain(box);
    // and back
    doc.edit('text', () => stepHolderToText(doc, m, id, k, 'above'));
    const back = readSmart(doc, m, id)!.links[k];
    expect(stepPartKind(doc, back, 'above')).toBe('text');
    expect(back.above.map((it) => plainText(doc.captions.get(it.caption!)!.runs))).toEqual(['Ar–X']);
  });

  it('a structure put in the box becomes what joins at that step', () => {
    const { doc, m, id } = suzuki();
    let box: number | null = null;
    doc.edit('box', () => { box = stepToHolder(doc, m, id, 0, 'above'); });
    let atom = 0;
    doc.edit('fill', () => {
      const s = doc.shapes.get(box!)!;
      const a = doc.addAtom((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 35), b = doc.addAtom((s.x1 + s.x2) / 2 + 20, (s.y1 + s.y2) / 2, 6);
      doc.addBond(a.id, b.id, 1);
      atom = Math.min(a.id, b.id);
      expect(fillHolder(doc, m, box!, [a.id, b.id])).toBe(true);
    });
    const read = readSmart(doc, m, id)!;
    expect(read.slots.length).toBe(4);
    expect(read.links[0].arrow.step!.above).toContain('a' + atom);
    expect(stepPartKind(doc, read.links[0], 'above')).toBe('structure');
    expect(doc.shapes.has(box!)).toBe(false);
  });

  it('a step with nothing there yet gets a box too', () => {
    const { doc, m, id } = suzuki();
    const read0 = readSmart(doc, m, id)!;
    const k = read0.links.findIndex((l) => !l.below.length);
    expect(k).toBeGreaterThanOrEqual(0);
    let box: number | null = null;
    doc.edit('box', () => { box = stepToHolder(doc, m, id, k, 'below'); });
    expect(box).not.toBeNull();
    expect(stepPartKind(doc, readSmart(doc, m, id)!.links[k], 'below')).toBe('box');
  });
});
