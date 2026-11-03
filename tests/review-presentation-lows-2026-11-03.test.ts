// @vitest-environment jsdom
//
// Low findings from the 2026-11-03 review of Presentation's objects and slide show
// (reviews/2026-11-03/presentation.md), each with the case that showed it.

import { describe, expect, it, vi } from 'vitest';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { AUTO_STEPS_DEFAULTS, markPieces, stepAnims, stepPieces } from '../src/deck/auto-steps';
import { readQmOutput } from '../src/chem/qm-output';
import { bondLayer, crossingBonds, crossingBondsCached } from '../src/chem/crossing';
import { Turner } from '../src/deck/turn-render';
import { axisView } from '../src/deck/turn3d';
import { plainMeasure } from '../src/chem/reaction';
import { arrangeSmart, insertSlot, makeSmart, setSlotRuns, readSmart, slotName, type TextPart } from '../src/chem/smart-scheme';
import { SmartPane, type SmartPaneHooks } from '../src/ui/smart-pane';
import type { Selection } from '../src/editor/arrange';

const sel = (): Selection => ({ atoms: new Set(), bonds: new Set(), captions: new Set(), arrows: new Set(), shapes: new Set() });

function textScheme(names: string[]) {
  const doc = new Doc();
  const m = plainMeasure(doc);
  const s = sel();
  let id = 0;
  doc.edit('make', () => {
    const caps = names.map((t, i) => doc.addCaption({ x: 100 + i * 150, y: 100, runs: [{ text: t }], justify: 'center' }));
    for (const c of caps) s.captions.add(c.id);
    for (let i = 0; i + 1 < caps.length; i++) s.arrows.add(doc.addArrow({
      headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
      tail: { x: 135 + i * 150, y: 100 }, head: { x: 215 + i * 150, y: 100 }, step: { reactants: ['c' + caps[i].id], products: ['c' + caps[i + 1].id], above: [], below: [], manual: true },
    }).id);
    id = makeSmart(doc, m, s)!;
    arrangeSmart(doc, m, id, { layout: 'line' });
  });
  return { doc, m, id };
}

describe('L4: the Smart Scheme pane while a row is being typed in', () => {
  // (jsdom has no isContentEditable)
  if (!('isContentEditable' in HTMLElement.prototype) || document.createElement('div').isContentEditable === undefined) {
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', { configurable: true, get(this: HTMLElement) { return this.contentEditable === 'true'; } });
  }

  it('shows a species added on the page (its + buttons leave the caret in the row), and what is typed lands on the right species', () => {
    const { doc, m, id } = textScheme(['ArBr', 'ArAr′', 'ArCHO']);
    const noop = () => {};
    let pane!: SmartPane;
    const hooks = {
      doc: () => doc, measure: () => m, selected: () => id,
      screenRect: (r: { x1: number; y1: number; x2: number; y2: number }) => r, area: () => ({ x1: 0, y1: 0, x2: 1000, y2: 800 }),
      slotRuns: (f: number, k: number, parts: TextPart[]) => { doc.edit('Type Species', () => setSlotRuns(doc, m, f, k, parts)); pane.refresh(); },
      work: () => new DOMRect(0, 0, 1000, 800),
      stepRuns: noop, toStructure: noop, toText: noop, stepToStructure: noop, stepToText: noop, selectHolder: noop, dock: noop, add: noop, remove: noop, move: noop, arrange: noop, secondLoop: noop, format: noop, ungroup: noop,
    } as unknown as SmartPaneHooks;
    pane = new SmartPane(hooks);
    pane.refresh();
    const rows = () => [...document.querySelectorAll('.smart-pane .sp-slot')];
    expect(rows().length).toBe(3);
    // typing in the second species (not finished yet)
    const second = document.querySelector<HTMLElement>('.smart-pane .sp-rich[data-key="s1"]')!;
    second.focus();
    expect(document.activeElement).toBe(second);
    (pane as unknown as { fields: Map<string, { insert(t: string): void }> }).fields.get('s1')!.insert('X');
    // a species put in before it, from the page
    doc.edit('Add Species', () => insertSlot(doc, m, id, 0, 'ArI'));
    pane.refresh();
    expect(rows().length).toBe(4);
    // the caret is still in the same species' row (now the third), with what was typed
    const now = document.activeElement as HTMLElement;
    expect(now.dataset.key).toBe('s2');
    expect(now.textContent).toContain('X');
    // finished: it goes to that species, not to the one that took its place
    now.blur();
    const names = readSmart(doc, m, id)!.slots.map((sl) => slotName(doc, sl));
    expect(names[1]).toBe('ArI');
    expect(names[2]).toContain('X');
    expect(names[2]).toContain('ArAr');
  });
});

describe('L1: Auto-Animate Steps', () => it(' Auto-Animate Steps comes off with one Undo, pieces, animations and keyframes together', () => {
  const host = new Doc();
  const d = Deck.blank(host);
  d.attach();
  d.addCanvasSlide();
  const i = d.index;
  const doc = d.docOf(i);
  doc.edit('make', () => {
    const caps = ['ArBr', 'ArAr′', 'ArCHO'].map((t, k) => doc.addCaption({ x: 100 + k * 150, y: 100, runs: [{ text: t }], justify: 'center' }));
    for (let k = 0; k + 1 < caps.length; k++) doc.addArrow({
      headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5,
      tail: { x: 135 + k * 150, y: 100 }, head: { x: 215 + k * 150, y: 100 }, step: { reactants: ['c' + caps[k].id], products: ['c' + caps[k + 1].id], above: [], below: [], manual: true },
    });
  });
  const m = plainMeasure(doc);
  const all = { atoms: new Set<number>(), bonds: new Set<number>(), captions: new Set<number>(), arrows: new Set<number>(), shapes: new Set<number>() };
  const pieces = stepPieces(doc, m, all)!;
  const keysBefore = JSON.stringify(d.slides[i].canvas!.keys);
  const marked = () => [...d.docOf(i).captions.values()].filter((c) => c.piece !== undefined).length;
  // as the app does it
  d.rebuildSlide(i, 'Auto-Animate Steps', (sd) => { markPieces(sd, pieces); return stepAnims(sd, pieces, AUTO_STEPS_DEFAULTS, [], { data: d.slides[i].canvas!, size: d.size }); });
  expect(marked()).toBe(3);
  expect(d.slides[i].anims!.length).toBeGreaterThan(2);
  expect(d.slides[i].canvas!.keys.length).toBe(2);
  expect(d.undoLabel).toContain('Auto-Animate Steps');
  expect(d.undo()).toBe(true);
  expect(marked()).toBe(0);
  expect(d.slides[i].anims ?? []).toEqual([]);
  expect(JSON.stringify(d.slides[i].canvas!.keys)).toBe(keysBefore);
  expect(d.redo()).toBe(true);
  expect(marked()).toBe(3);
  expect(d.slides[i].canvas!.keys.length).toBe(2);
}));

/** A long Gaussian optimization's log (about 43 MB), as in the review's timing. */
function bigLog(): string {
  const geom = (k: number) => ' Standard orientation:\n ---------------------------------------------------------------------\n Center     Atomic      Atomic             Coordinates (Angstroms)\n Number     Number       Type             X           Y           Z\n ---------------------------------------------------------------------\n' +
    Array.from({ length: 80 }, (_, i) => `     ${i + 1}          6           0        ${(i * 0.1 + k * 1e-4).toFixed(6)}    0.100000    0.200000`).join('\n') + '\n ---------------------------------------------------------------------\n';
  const step = (k: number) => geom(k) + ` SCF Done:  E(RB3LYP) =  -${(1000 + k * 1e-5).toFixed(9)}     A.U. after   12 cycles\n` + ' filler line of a long optimization output with forces and convergence tables\n'.repeat(60);
  const parts = [' Entering Gaussian System, Link 0=g16\n #p opt freq b3lyp/6-31g(d) empiricaldispersion=gd3bj\n scrf=(smd,solvent=thf)\n ----------\n'];
  for (let k = 0; k < 4000; k++) parts.push(step(k));
  parts.push(' Sum of electronic and thermal Enthalpies=           -1000.100000\n Sum of electronic and thermal Free Energies=        -1000.123456\n Normal termination of Gaussian 16\n');
  return parts.join('');
}

describe('L2: reading a long Gaussian log for an energy diagram', () => {
  it('finds the route, energies and geometry without going through the whole file line by line', () => {
    const text = bigLog();
    expect(text.length).toBeGreaterThan(40e6);
    const split = vi.spyOn(String.prototype, 'split');
    try {
      const r = readQmOutput(text, 'big.log')!;
      // the route section over two lines, the last SCF energy, the thermochemistry, the last geometry
      expect(r.theory).toBe('B3LYP-D3(BJ)/6-31G(d), SMD(THF)');
      expect(r.scf).toBeCloseTo(-(1000 + 3999e-5), 6);
      expect(r.free).toBeCloseTo(-1000.123456, 6);
      expect(r.enthalpy).toBeCloseTo(-1000.1, 6);
      expect(r.atoms.length).toBe(80);
      // nothing split the whole file (it was split into lines just to find the route: 200 ms of the 230)
      const biggest = Math.max(0, ...split.mock.contexts.map((s) => String(s).length));
      expect(biggest).toBeLessThan(1e6);
    } finally {
      split.mockRestore();
    }
  });
});

describe('L3: Turn in 3-D on a big structure', () => {
  /** A 200-atom zigzag chain in rows, as in the review's timing, its rows in front of and behind the page in turn. */
  function chain(): Doc {
    const doc = new Doc();
    doc.edit('chain', () => {
      const L = doc.style.bondLength;
      let prev: number | null = null;
      for (let i = 0; i < 200; i++) {
        const a = doc.addAtom(200 + (i % 20) * L * 0.9, 100 + Math.floor(i / 20) * L * 0.8 + (i % 2) * 0.4 * L);
        doc.updateAtom(a.id, { depth: Math.floor(i / 20) % 2 ? 3 * L : -3 * L });
        if (prev !== null) doc.addBond(prev, a.id, 1);
        prev = a.id;
      }
    });
    return doc;
  }

  it('finds the crossing bonds of a structure turned edge-on without looking round each bond (n² lookups once its atoms pile up)', () => {
    const turned = new Turner(chain()).at(axisView('x', 80));
    // what is in front where bonds cross, and the gaps drawn for it: the same crossings as looking round each bond
    const near = vi.spyOn(turned, 'atomsNear');
    const cached = [...turned.bonds.values()].map((b) => crossingBondsCached(turned, b).map((o) => o.id).sort((x, y) => x - y));
    expect(near).not.toHaveBeenCalled();
    near.mockRestore();
    const looked = [...turned.bonds.values()].map((b) => crossingBonds(turned, b).map((o) => o.id).sort((x, y) => x - y));
    expect(cached).toEqual(looked);
    expect(cached.some((c) => c.length)).toBe(true);
  });

  it('keeps the crossings right after an edit (worked out again only near what moved)', () => {
    const doc = new Turner(chain()).at(axisView('x', 80));
    for (const b of doc.bonds.values()) crossingBondsCached(doc, b);
    const a = [...doc.atoms.values()][37];
    doc.edit('move', () => doc.updateAtom(a.id, { x: a.x + 9, y: a.y - 6 }));
    for (const b of doc.bonds.values()) expect(crossingBondsCached(doc, b).map((o) => o.id).sort((x, y) => x - y)).toEqual(crossingBonds(doc, b).map((o) => o.id).sort((x, y) => x - y));
  });

  it('puts bonds in front by depth without looking round each bond', () => {
    const doc = chain();
    const t = new Turner(doc);
    const spy = vi.spyOn(Doc.prototype, 'atomsNear');
    try {
      const turned = t.at(axisView('x', 80));
      expect(spy).not.toHaveBeenCalled();
      // of two bonds that cross, the one nearer the reader there is in front
      let pairs = 0;
      const depth = (id: number) => turned.atoms.get(id)!.depth!;
      for (const b of turned.bonds.values()) for (const o of crossingBonds(turned, b)) {
        const mb = (depth(b.a1) + depth(b.a2)) / 2, mo = (depth(o.a1) + depth(o.a2)) / 2;
        if (Math.abs(mb - mo) < 1) continue;
        pairs++;
        expect(bondLayer(mb > mo ? b : o)).toBeGreaterThan(bondLayer(mb > mo ? o : b));
      }
      expect(pairs).toBeGreaterThan(10);
    } finally {
      spy.mockRestore();
    }
  });
});
