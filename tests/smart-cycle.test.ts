// @vitest-environment jsdom
//
// A second loop for a Smart Scheme's cycle (review of #318: two circular pathways that meet).
// The scheme's loop is read back as the Catalytic Cycle window's table, structures kept as
// drawn, and drawn again with two loops as one Smart Scheme.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { CYCLE_PRESETS, buildCycle, type CycleLoop } from '../src/chem/cycles';
import { makeSmart, readSmart } from '../src/chem/smart-scheme';
import { rebuildSmartCycle, smartCycleStart } from '../src/chem/smart-cycle';
import type { Selection } from '../src/editor/arrange';
import { plainText } from '../src/richtext';

const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

/** Suzuki's cycle as a Smart Scheme, its first species a drawn structure (two atoms) with a label. */
function suzuki() {
  const doc = new Doc();
  const m = plainMeasure(doc);
  let id = 0, label = 0;
  const atoms: number[] = [];
  doc.edit('cycle', () => {
    const a = doc.addAtom(0, 0, 46), b = doc.addAtom(30, 0, 15);
    doc.addBond(a.id, b.id, 1);
    atoms.push(a.id, b.id);
    const made = buildCycle(doc, m, CYCLE_PRESETS.find((p) => p.id === 'suzuki')!.spec, { names: 'short', reagentArrows: false }, { x: 300, y: 300 }, [{ atoms }]);
    const s = sel();
    for (const x of atoms) s.atoms.add(x);
    for (const c of made.captions) s.captions.add(c);
    for (const r of made.arrows) s.arrows.add(r);
    // a compound number under the structure
    const at = doc.atoms.get(a.id)!;
    label = doc.addCaption({ x: at.x, y: at.y + 25, runs: [{ text: '1', bold: true }], justify: 'center' }).id;
    s.captions.add(label);
    id = makeSmart(doc, m, s, { layout: 'cycle' })!;
  });
  return { doc, m, id, atoms, label };
}

describe('a second loop for a Smart Scheme cycle', () => {
  it('reads the loop back as the window\'s table, the structure kept as drawn', () => {
    const { doc, m, id } = suzuki();
    const st = smartCycleStart(doc, m, id)!;
    expect(st).not.toBeNull();
    expect(st.loop.stations.length).toBe(4);
    expect(st.drawn[0]).toMatch(/as drawn/);
    expect(st.drawn.slice(1).every((x) => x === null)).toBe(true);
    // the steps' names as written, what comes in above the arrow
    expect(st.loop.steps.map((s) => s.name)).toContain('OA');
    expect(st.loop.steps.some((s) => s.inn !== '')).toBe(true);
    expect(st.look.names).toBe('full');
  });

  it('draws two loops turning together as one Smart Scheme, the structure and its label kept', () => {
    const { doc, m, id, atoms, label } = suzuki();
    const st = smartCycleStart(doc, m, id)!;
    const second: CycleLoop = { stations: ['CuX', 'Cu–C≡CR', 'CuX·HNEt_3'], steps: [{ short: '', name: 'TM', inn: '', out: '' }, { short: '', name: '', inn: '', out: '' }, { short: '', name: '', inn: 'HC≡CR', out: '' }], middle: '' };
    const label0 = doc.captions.get(label)!;
    const a0 = doc.atoms.get(atoms[0])!;
    const offset = { x: label0.x - a0.x, y: label0.y - a0.y };
    let made: ReturnType<typeof rebuildSmartCycle> = null;
    let smart: number | null = null;
    doc.edit('two', () => {
      made = rebuildSmartCycle(doc, m, id, { loops: [st.loop, second], join: { kind: 'mesh', a: 1, b: 0 } }, st.look, [0, 1, 2, 3]);
      const s = sel();
      for (const x of made!.atoms) s.atoms.add(x);
      for (const c of [...made!.captions, ...made!.kept]) s.captions.add(c);
      for (const r of made!.arrows) s.arrows.add(r);
      smart = makeSmart(doc, m, s, { layout: 'cycle' });
    });
    expect(made).not.toBeNull();
    // the old frame is gone and a new one holds both loops, laid out by hand
    expect(doc.shapes.has(id)).toBe(false);
    expect(smart).not.toBeNull();
    const data = doc.shapes.get(smart!)!.smart!;
    expect(data.free).toBe(true);
    const read = readSmart(doc, m, smart!)!;
    expect(read.slots.length).toBe(7);
    expect(read.links.length).toBe(7);
    // the structure is still there, and its label moved with it
    expect(atoms.every((a) => doc.atoms.has(a))).toBe(true);
    const a1 = doc.atoms.get(atoms[0])!, l1 = doc.captions.get(label)!;
    expect(l1.x - a1.x).toBeCloseTo(offset.x, 6);
    expect(l1.y - a1.y).toBeCloseTo(offset.y, 6);
    // the old loop's text is not left behind twice
    const texts = [...doc.captions.values()].map((c) => plainText(c.runs));
    expect(texts.filter((t) => t === 'OA').length).toBe(1);
    expect(texts).toContain('CuX');
  });

  it('only a single closed loop laid out as a cycle can take a second loop', () => {
    const { doc, m, id } = suzuki();
    doc.edit('line', () => { doc.updateShape(id, { smart: { ...doc.shapes.get(id)!.smart!, free: true } }); });
    expect(smartCycleStart(doc, m, id)).toBeNull();
  });
});
