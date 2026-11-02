// @vitest-environment jsdom
//
// A Smart Scheme's own format (the gear on its species list): font and sizes of its text, its
// arrows and its spacing, kept on the scheme and given to species added later.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { CYCLE_PRESETS, buildCycle } from '../src/chem/cycles';
import { cleanSmart, formatSmart, insertSlot, makeSmart, readSmart } from '../src/chem/smart-scheme';
import { cleanFormat, formatDefaults } from '../src/chem/smart-format';
import type { Selection } from '../src/editor/arrange';

const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

function suzuki() {
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
  return { doc, m, id };
}

const texts = (doc: Doc, m: ReturnType<typeof plainMeasure>, id: number) => {
  const read = readSmart(doc, m, id)!;
  const caps = (its: { caption?: number }[]) => its.flatMap((it) => (it.caption !== undefined ? [doc.captions.get(it.caption)!] : []));
  return {
    species: read.slots.flatMap((s) => (s.caption !== undefined ? [doc.captions.get(s.caption)!] : [])),
    conditions: read.links.flatMap((l) => [...caps(l.above), ...caps(l.below), ...caps(l.inside)]),
    arrows: read.links.map((l) => doc.arrows.get(l.arrow.id)!),
  };
};

describe('Smart Scheme format', () => {
  it('gives its text, arrows and spacing the look asked for, and keeps it on the scheme', () => {
    const { doc, m, id } = suzuki();
    doc.edit('format', () => formatSmart(doc, m, id, { font: 'Source Serif 4', speciesSize: 12, textSize: 9, arrowWidth: 1.5, headType: 'angle', headLength: 8 }));
    const t = texts(doc, m, id);
    expect(t.species.length).toBeGreaterThan(0);
    expect(t.conditions.length).toBeGreaterThan(0);
    for (const c of t.species) for (const r of c.runs) expect(r).toMatchObject({ font: 'Source Serif 4', size: 12 });
    for (const c of t.conditions) for (const r of c.runs) expect(r).toMatchObject({ font: 'Source Serif 4', size: 9 });
    for (const a of t.arrows) expect(a).toMatchObject({ lineWidth: 1.5, headType: 'angle', headLength: 8 });
    expect(doc.shapes.get(id)!.smart!.fmt).toEqual({ font: 'Source Serif 4', speciesSize: 12, textSize: 9, arrowWidth: 1.5, headType: 'angle', headLength: 8 });
  });

  it('gives a species added later the same look', () => {
    const { doc, m, id } = suzuki();
    doc.edit('format', () => formatSmart(doc, m, id, { font: 'Lato', speciesSize: 14 }));
    let cap: number | null = null;
    doc.edit('add', () => { cap = insertSlot(doc, m, id, 0); });
    expect(cap).not.toBeNull();
    for (const r of doc.captions.get(cap!)!.runs) expect(r).toMatchObject({ font: 'Lato', size: 14 });
  });

  it('goes back to the drawing style when cleared, and undoes in one step', () => {
    const { doc, m, id } = suzuki();
    doc.edit('format', () => formatSmart(doc, m, id, { arrowWidth: 2 }));
    doc.edit('clear', () => formatSmart(doc, m, id, undefined));
    expect(doc.shapes.get(id)!.smart!.fmt).toBeUndefined();
    for (const a of texts(doc, m, id).arrows) expect(a.lineWidth).toBe(doc.style.lineWidth);
    doc.undo();
    expect(doc.shapes.get(id)!.smart!.fmt).toEqual({ arrowWidth: 2 });
  });

  it('a wider gap to the species makes the cycle larger', () => {
    const a = suzuki(), b = suzuki();
    const g = formatDefaults(b.doc).structGap;
    b.doc.edit('format', () => formatSmart(b.doc, b.m, b.id, { structGap: g * 3 }));
    const size = (x: typeof a) => { const s = x.doc.shapes.get(x.id)!; return s.x2 - s.x1; };
    expect(size(b)).toBeGreaterThan(size(a));
  });

  it('reads back from a file only what makes sense', () => {
    expect(cleanFormat({ font: ' Inter ', speciesSize: 11, headType: 'zigzag', textGap: -3, structGap: 'x' })).toEqual({ font: 'Inter', speciesSize: 11 });
    expect(cleanFormat({})).toBeUndefined();
    expect(cleanSmart({ layout: 'line', fmt: { arrowWidth: 1 } })).toEqual({ layout: 'line', fmt: { arrowWidth: 1 } });
  });
});
