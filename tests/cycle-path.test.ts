// A catalytic cycle's arrows on one smooth path (Nate, screenshot review 2026-11-06: "the arrows
// should remain elliptical when an intermediate is moved up ... the main arrows following a smooth
// path through each of the intermediates"), and Clean Up Cycle, which puts the species back on
// one ellipse.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import type { Vec } from '../src/geom';
import { plainMeasure } from '../src/chem/reaction';
import { CYCLE_PRESETS, buildCycle } from '../src/chem/cycles';
import { cleanUpCycle, makeSmart, readSmart, refitSmart } from '../src/chem/smart-scheme';
import { cycleCurves, fitEllipse, smoothLoop } from '../src/chem/cycle-path';
import { bezAt, bezPoints } from '../src/objects';
import type { Selection } from '../src/editor/arrange';

const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });
const unit = (v: Vec): Vec => { const l = Math.hypot(v.x, v.y); return { x: v.x / l, y: v.y / l }; };
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const text = (doc: Doc, id: number) => doc.captions.get(id)!.runs.map((r) => r.text).join('');

/** Suzuki's cycle (with small arrows for what comes in and goes out) as a cycle Smart Scheme. */
function suzuki() {
  const doc = new Doc();
  const m = plainMeasure(doc);
  let id = 0;
  doc.edit('cycle', () => {
    const made = buildCycle(doc, m, CYCLE_PRESETS.find((p) => p.id === 'suzuki')!.spec, { names: 'short', reagentArrows: true }, { x: 300, y: 300 });
    const s = sel();
    for (const c of made.captions) s.captions.add(c);
    for (const r of made.arrows) s.arrows.add(r);
    id = makeSmart(doc, m, s, { layout: 'cycle', reagentArrows: true })!;
  });
  doc.beforeCommit = (before) => refitSmart(doc, before, m);
  return { doc, m, id };
}

describe('the smooth loop through the species', () => {
  it('is a circle when the species are evenly round one', () => {
    const R = 100;
    const pts = [0, 1, 2, 3].map((k) => ({ x: R * Math.cos((k * Math.PI) / 2), y: R * Math.sin((k * Math.PI) / 2) }));
    for (const piece of smoothLoop(pts)) for (let t = 0; t <= 1; t += 0.125) expect(Math.abs(Math.hypot(bezAt(piece, t).x, bezAt(piece, t).y) - R)).toBeLessThan(0.05 * R);
  });

  it('leaves each point the way it came in, with no corner', () => {
    const pts = [{ x: 0, y: -160 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }];
    const loop = smoothLoop(pts);
    for (let k = 0; k < pts.length; k++) {
      const into = loop[(k + pts.length - 1) % pts.length], out = loop[k];
      const a = unit({ x: into[3].x - into[2].x, y: into[3].y - into[2].y }), b = unit({ x: out[1].x - out[0].x, y: out[1].y - out[0].y });
      expect(Math.abs(cross(a, b))).toBeLessThan(1e-9);
      expect(a.x * b.x + a.y * b.y).toBeGreaterThan(0.99);
    }
  });

  it('cuts each step at the boxes of its two species', () => {
    const pts = [{ x: 0, y: -100 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }];
    const boxes = pts.map((p) => ({ x1: p.x - 20, y1: p.y - 10, x2: p.x + 20, y2: p.y + 10 }));
    const curves = cycleCurves(pts, boxes);
    curves.forEach((c, k) => {
      expect(c).not.toBeNull();
      const a = boxes[k], b = boxes[(k + 1) % 4], s = c![0], e = c![c!.length - 1];
      const onEdge = (r: typeof a, p: Vec) => Math.min(Math.abs(p.x - r.x1), Math.abs(p.x - r.x2), Math.abs(p.y - r.y1), Math.abs(p.y - r.y2)) < 0.01;
      expect(onEdge(a, s)).toBe(true);
      expect(onEdge(b, e)).toBe(true);
    });
  });
});

describe('a cycle Smart Scheme when a species is moved', () => {
  it('keeps every arrow on one smooth path through all the species', () => {
    const { doc, m, id } = suzuki();
    const read = readSmart(doc, m, id)!;
    // the top species dragged straight up (the screenshot's case)
    const top = read.slots.reduce((a, b) => ((a.box.y1 + a.box.y2) < (b.box.y1 + b.box.y2) ? a : b));
    doc.edit('drag', () => { const c = doc.captions.get(top.caption!)!; doc.updateCaption(c.id, { x: c.x, y: c.y - 60 }); });
    const after = readSmart(doc, m, id)!;
    const k = after.slots.findIndex((sl) => sl.caption === top.caption);
    const into = after.links.find((l) => l.to === k)!.arrow, out = after.links.find((l) => l.from === k)!.arrow;
    const pi = bezPoints(into)!, po = bezPoints(out)!;
    expect(pi).not.toBeNull();
    expect(po).not.toBeNull();
    // both are pieces of the one smooth loop through every species' middle (so no corner at it)
    const mids = after.slots.map((sl) => ({ x: (sl.box.x1 + sl.box.x2) / 2, y: (sl.box.y1 + sl.box.y2) / 2 }));
    const loop = smoothLoop(mids).flatMap((piece) => Array.from({ length: 201 }, (_, i) => bezAt(piece, i / 200)));
    const off = (p: Vec) => Math.min(...loop.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
    for (const pts of [pi, po]) for (let t = 0; t <= 1; t += 0.2) expect(off(bezAt(pts, t))).toBeLessThan(1);
    // and they run toward each other's line at the species: in from below-left, out to below-right, level-ish
    const a = unit({ x: pi[3].x - pi[2].x, y: pi[3].y - pi[2].y }), b = unit({ x: po[1].x - po[0].x, y: po[1].y - po[0].y });
    expect(a.x).toBeGreaterThan(0.6);
    expect(b.x).toBeGreaterThan(0.6);
    expect(a.y).toBeLessThan(0);
    expect(b.y).toBeGreaterThan(0);
  });

  it('moves the step names and the small in and out arrows with their arrow', () => {
    const { doc, m, id } = suzuki();
    const read = readSmart(doc, m, id)!;
    const top = read.slots.reduce((a, b) => ((a.box.y1 + a.box.y2) < (b.box.y1 + b.box.y2) ? a : b));
    const k = read.slots.indexOf(top);
    const step = read.links.find((l) => l.from === k)!;
    const small = [...doc.arrows.values()].filter((x) => x.reagentFor === step.arrow.id);
    const wasSmall = small.map((x) => ({ ...x.tail }));
    doc.edit('drag', () => { const c = doc.captions.get(top.caption!)!; doc.updateCaption(c.id, { x: c.x, y: c.y - 60 }); });
    // the small arrows went with it
    small.forEach((x, i) => expect(Math.hypot(doc.arrows.get(x.id)!.tail.x - wasSmall[i].x, doc.arrows.get(x.id)!.tail.y - wasSmall[i].y)).toBeGreaterThan(1));
    // what comes in is still written outside the loop, by its small arrow
    const caps = [...step.above, ...step.below].map((it) => it.caption!).filter((c) => c !== undefined);
    for (const c of caps) expect(text(doc, c).length).toBeGreaterThan(0);
  });

  it('leaves the arrows alone when a species is only retyped', () => {
    const { doc, m, id } = suzuki();
    const read = readSmart(doc, m, id)!;
    const arrows = read.links.map((l) => JSON.stringify(doc.arrows.get(l.arrow.id)));
    doc.edit('type', () => { const c = doc.captions.get(read.slots[1].caption!)!; doc.updateCaption(c.id, { runs: [{ text: 'Pd(OAc)2' }] }); });
    expect(read.links.map((l) => JSON.stringify(doc.arrows.get(l.arrow.id)))).toEqual(arrows);
  });
});

describe('Clean Up Cycle', () => {
  it('fits an upright ellipse exactly through four points', () => {
    const e = fitEllipse([{ x: 0, y: -80 }, { x: 120, y: 0 }, { x: 0, y: 80 }, { x: -120, y: 0 }])!;
    expect(e.c.x).toBeCloseTo(0, 6);
    expect(e.c.y).toBeCloseTo(0, 6);
    expect(e.rx).toBeCloseTo(120, 6);
    expect(e.ry).toBeCloseTo(80, 6);
  });

  it('puts the species on one ellipse and the arrows along it', () => {
    const { doc, m, id } = suzuki();
    const read = readSmart(doc, m, id)!;
    // a species dragged off somewhere
    doc.edit('drag', () => { const c = doc.captions.get(read.slots[2].caption!)!; doc.updateCaption(c.id, { x: c.x + 50, y: c.y + 70 }); });
    let ok = false;
    doc.edit('Clean Up Cycle', () => { ok = cleanUpCycle(doc, m, id); });
    expect(ok).toBe(true);
    const after = readSmart(doc, m, id)!;
    const mids = after.slots.map((sl) => ({ x: (sl.box.x1 + sl.box.x2) / 2, y: (sl.box.y1 + sl.box.y2) / 2 }));
    const e = fitEllipse(mids)!;
    for (const p of mids) expect(Math.abs(((p.x - e.c.x) / e.rx) ** 2 + ((p.y - e.c.y) / e.ry) ** 2 - 1)).toBeLessThan(0.02);
    // every step's arrow lies on that ellipse
    for (const l of after.links) {
      const pts = bezPoints(doc.arrows.get(l.arrow.id)!)!;
      expect(pts).not.toBeNull();
      for (let i = 0; i + 3 < pts.length; i += 3) for (let t = 0; t <= 1; t += 0.25) {
        const p = bezAt(pts, t, i);
        expect(Math.abs(Math.hypot((p.x - e.c.x) / e.rx, (p.y - e.c.y) / e.ry) - 1)).toBeLessThan(0.02);
      }
    }
  });

  it('does nothing to a scheme that is not a cycle', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    let id = 0;
    doc.edit('line', () => {
      const s = sel();
      const a = doc.addCaption({ x: 0, y: 0, runs: [{ text: 'A' }], justify: 'center' }), b = doc.addCaption({ x: 200, y: 0, runs: [{ text: 'B' }], justify: 'center' });
      s.captions.add(a.id); s.captions.add(b.id);
      const r = doc.addArrow({ tail: { x: 40, y: 0 }, head: { x: 160, y: 0 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 10, headWidth: 2.5, step: { reactants: ['c' + a.id], products: ['c' + b.id], above: [], below: [] } });
      s.arrows.add(r.id);
      id = makeSmart(doc, m, s, { layout: 'line' })!;
    });
    let ok = true;
    doc.edit('x', () => { ok = cleanUpCycle(doc, m, id); });
    expect(ok).toBe(false);
  });
});
