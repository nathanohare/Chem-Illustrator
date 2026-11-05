// @vitest-environment jsdom
//
// Lone pairs and orbitals turn with what they are on. A lone pair stuck to an atom keeps its two
// dots across the atom's bond when the structure is turned or flipped (it used to keep its page
// orientation); an orbital's lobes turn when they are turned, on their own or as a group, in a
// drawing as on a slide; and a turned lobe is saved turned for ChemDraw.

import { describe, it, expect } from 'vitest';
import { Doc, type Shape } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { makePin, pinSymbols, shapeAxis } from '../src/chem/pins';
import { orbitalShapes, shapeCentre } from '../src/chem/orbitals';
import { shapeTurn } from '../src/objects';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml, GEO_TAG } from '../src/io/cdxml';
import { ACS_1996 } from '../src/style';

window.requestAnimationFrame = () => 0;

function editor(doc: Doc): Editor {
  const scene = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  ed.setTool('select');
  return ed;
}

const mid = (s: Shape) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
const deg = (d: number) => ((Math.round(d) % 360) + 360) % 360;

/** A metal with a ligand straight up and one straight down, a lone pair above the top ligand's atom (dots side by side). */
function complex() {
  const doc = new Doc();
  doc.style = { ...ACS_1996 };
  const L = doc.style.bondLength;
  const ids = doc.edit('Build', () => {
    // (carbons, so no labels need measuring)
    const m = doc.addAtom(100, 100).id;
    const top = doc.addAtom(100, 100 - L).id, bottom = doc.addAtom(100, 100 + L).id;
    const side = doc.addAtom(100 + L, 100).id;
    doc.addBond(m, top); doc.addBond(m, bottom); doc.addBond(m, side);
    const at = { x: 100, y: 100 - L - 5 };
    const pair = doc.addShape({ kind: 'symbol', symbol: 'LonePair', x1: at.x - 1.12, y1: at.y, x2: at.x + 1.12, y2: at.y }).id;
    return { m, top, bottom, side, pair };
  });
  return { doc, ...ids };
}

describe('a lone pair on an atom', () => {
  it('is stuck to its atom with the way it points', () => {
    const { doc, pair } = complex();
    const s = doc.shapes.get(pair)!;
    expect(s.pin?.dir).toBeDefined();
  });

  it('turns with its structure: the dots stay across the bond', () => {
    const { doc, pair, m, top, bottom, side } = complex();
    const ed = editor(doc);
    // the structure turned, without the lone pair in the selection
    for (const id of [m, top, bottom, side]) ed.sel.atoms.add(id);
    for (const b of doc.bonds.keys()) ed.sel.bonds.add(b);
    expect(ed.rotateBy(-90)).toBe(true);
    const s = doc.shapes.get(pair)!;
    const t = doc.atoms.get(top)!, mm = doc.atoms.get(m)!;
    // the top ligand now points left; its lone pair is to the left of it, the dots one above the other
    expect(t.x).toBeLessThan(mm.x - 5);
    expect(mid(s).x).toBeLessThan(t.x);
    expect(Math.abs(s.x2 - s.x1)).toBeLessThan(0.01);
    expect(Math.abs(s.y2 - s.y1)).toBeCloseTo(2.24, 2);
  });

  it('turns with its structure when it is selected too', () => {
    const { doc, pair, m, top, bottom, side } = complex();
    const ed = editor(doc);
    for (const id of [m, top, bottom, side]) ed.sel.atoms.add(id);
    for (const b of doc.bonds.keys()) ed.sel.bonds.add(b);
    ed.sel.shapes.add(pair);
    ed.rotateBy(30);
    const s = doc.shapes.get(pair)!;
    const t = doc.atoms.get(top)!, mm = doc.atoms.get(m)!;
    const bond = { x: t.x - mm.x, y: t.y - mm.y };
    const dots = { x: s.x2 - s.x1, y: s.y2 - s.y1 };
    // still across the bond
    expect(Math.abs(bond.x * dots.x + bond.y * dots.y)).toBeLessThan(1e-6);
  });

  it('keeps a way it was turned to by hand, and turns from there with its structure', () => {
    const { doc, pair, m, top, bottom, side } = complex();
    const ed = editor(doc);
    // the pair alone, turned a quarter turn: its dots now one above the other, on the bond's line
    ed.sel.shapes.add(pair);
    ed.rotateBy(90);
    let s = doc.shapes.get(pair)!;
    expect(Math.abs(s.x2 - s.x1)).toBeLessThan(0.01);
    ed.sel = { atoms: new Set([m, top, bottom, side]), bonds: new Set(doc.bonds.keys()), captions: new Set(), arrows: new Set(), shapes: new Set() };
    ed.rotateBy(90);
    s = doc.shapes.get(pair)!;
    const t = doc.atoms.get(top)!, mm = doc.atoms.get(m)!;
    const bond = { x: t.x - mm.x, y: t.y - mm.y };
    const dots = { x: s.x2 - s.x1, y: s.y2 - s.y1 };
    // along the bond, as it was set
    expect(Math.abs(bond.x * dots.y - bond.y * dots.x)).toBeLessThan(1e-6);
  });

  it('flips with its structure', () => {
    const { doc, pair, m, top, bottom, side } = complex();
    const ed = editor(doc);
    for (const id of [m, top, bottom, side]) ed.sel.atoms.add(id);
    ed.flip('v');
    const s = doc.shapes.get(pair)!;
    // the top ligand is now at the bottom, its pair below it, dots still side by side
    expect(mid(s).y).toBeGreaterThan(doc.atoms.get(top)!.y);
    expect(Math.abs(s.y2 - s.y1)).toBeLessThan(0.01);
  });
});

describe('orbitals', () => {
  /** A p orbital on a carbon of ethane drawn across the page (its lobes up and down), and its parts. */
  function onAtom() {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const L = doc.style.bondLength;
    const ids = doc.edit('Build', () => {
      const a = doc.addAtom(100, 100).id, b = doc.addAtom(100 + L, 100).id;
      doc.addBond(a, b);
      const at = doc.atoms.get(a)!;
      const lobes = orbitalShapes({ kind: 'p', look: 'shaded', angle: 0, size: L }, at).map((sh) => {
        const pin = makePin(doc, 'atom', [a], shapeCentre(sh), shapeAxis(sh)) ?? undefined;
        return doc.addShape({ ...sh, grp: 1, ...(pin ? { pin } : {}) }).id;
      });
      return { a, b, lobes };
    });
    return { doc, ...ids };
  }

  it('lobes stuck to an atom are drawn turned', () => {
    const { doc, lobes } = onAtom();
    // the back lobe points down: half a turn
    expect(shapeTurn(doc.shapes.get(lobes[0])!)).toBe(180);
  });

  it('turn with the structure they are on, still meeting at the atom', () => {
    const { doc, a, b, lobes } = onAtom();
    const ed = editor(doc);
    ed.sel.atoms.add(a); ed.sel.atoms.add(b);
    ed.sel.bonds.add([...doc.bonds.keys()][0]);
    ed.rotateBy(90);
    const [back, front] = lobes.map((id) => doc.shapes.get(id)!);
    expect(deg(front.rot ?? 0)).toBe(90);
    expect(deg(back.rot ?? 0)).toBe(270);
    // each lobe's point is on the atom: its middle half a lobe out from it, along the way it points
    const at = doc.atoms.get(a)!;
    for (const s of [back, front]) {
      const ax = shapeAxis(s)!, h = (s.y2 - s.y1) / 2;
      expect(mid(s).x - ax.x * h).toBeCloseTo(at.x, 6);
      expect(mid(s).y - ax.y * h).toBeCloseTo(at.y, 6);
    }
  });

  /** An sp³ orbital on its own (no atom), as Chemistry ▸ Orbital puts one in the middle of the view. */
  function loose() {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const lobes = doc.edit('Orbital', () => orbitalShapes({ kind: 'sp3', look: 'shaded', angle: 0, size: 20 }, { x: 100, y: 100 }).map((sh) => doc.addShape({ ...sh, grp: 1 }).id));
    return { doc, lobes };
  }

  it('turn as a group: each lobe turns and goes round the middle', () => {
    const { doc, lobes } = loose();
    const ed = editor(doc);
    for (const id of lobes) ed.sel.shapes.add(id);
    ed.rotateBy(90);
    const [back, front] = lobes.map((id) => doc.shapes.get(id)!);
    expect(deg(front.rot ?? 0)).toBe(90);
    expect(deg(back.rot ?? 0)).toBe(270);
    // the two lobes still meet at one point
    const tip = (s: Shape) => { const ax = shapeAxis(s)!, h = (s.y2 - s.y1) / 2; return { x: mid(s).x - ax.x * h, y: mid(s).y - ax.y * h }; };
    expect(tip(back).x).toBeCloseTo(tip(front).x, 6);
    expect(tip(back).y).toBeCloseTo(tip(front).y, 6);
  });

  it('turn on their own, about their middles', () => {
    const { doc, lobes } = loose();
    const ed = editor(doc);
    const before = mid(doc.shapes.get(lobes[1])!);
    ed.sel.shapes.add(lobes[1]);
    expect(ed.rotateHandle()).not.toBeNull();
    ed.rotateBy(45);
    const s = doc.shapes.get(lobes[1])!;
    expect(s.rot).toBeCloseTo(45, 6);
    expect(mid(s).x).toBeCloseTo(before.x, 6);
    expect(mid(s).y).toBeCloseTo(before.y, 6);
  });

  it('flip to point the other way', () => {
    const { doc, lobes } = loose();
    const ed = editor(doc);
    for (const id of lobes) ed.sel.shapes.add(id);
    ed.flip('v');
    const [back, front] = lobes.map((id) => doc.shapes.get(id)!);
    expect(deg(front.rot ?? 0)).toBe(180);
    expect(deg(back.rot ?? 0)).toBe(0);
  });

  it('are saved turned for ChemDraw and read back as they were', () => {
    const { doc, lobes } = loose();
    const ed = editor(doc);
    ed.sel.shapes.add(lobes[1]);
    ed.rotateBy(90);
    const xml = writeCdxml(doc);
    // the front lobe's outline, as ChemDraw sees it, lies to the right of its middle (it points right)
    const dom = new DOMParser().parseFromString(xml, 'text/xml');
    const tagOf = (g: Element) => [...g.children].find((k) => k.nodeName === 'objecttag' && k.getAttribute('Name') === GEO_TAG)?.getAttribute('Value') ?? '';
    const turned = [...dom.getElementsByTagName('group')].find((g) => { const t = tagOf(g); return t.includes('orbLobe') && JSON.parse(t).rot === 90; })!;
    expect(turned).toBeDefined();
    const pts = turned.getElementsByTagName('curve')[0].getAttribute('CurvePoints')!.split(' ').map(Number);
    const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    // a lobe is longer than it is wide; turned a quarter turn it is wider than it is tall
    expect(w).toBeGreaterThan(h);
    const { doc: back } = readCdxml(xml);
    const s = [...back.shapes.values()].find((x) => x.geo === 'orbLobe' && x.rot === 90);
    expect(s).toBeDefined();
  });

  it('a lobe saved stuck to atoms that are not where it is any more comes loose on opening', () => {
    const { doc, lobes } = onAtom();
    const s = doc.shapes.get(lobes[1])!;
    // as if the atoms were numbered afresh: its pin names the other carbon
    s.pin = { ...s.pin!, ref: [...s.pin!.ref].reverse() };
    pinSymbols(doc);
    expect(doc.shapes.get(lobes[1])!.pin).toBeUndefined();
    // the other, still right, keeps its pin
    expect(doc.shapes.get(lobes[0])!.pin).toBeDefined();
  });
});
