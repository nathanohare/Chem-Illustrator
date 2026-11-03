// @vitest-environment jsdom
// Clean Up pressed again (to step through other layouts) must not undo the scheme tidying the
// first press did: the options were worked out from the drawing before that tidy.
import { it, expect } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

window.requestAnimationFrame = () => 0;

function pyridine(doc: Doc, x: number, y: number): number[] {
  const L = doc.style.bondLength;
  const atoms: number[] = [];
  for (let i = 0; i < 6; i++) atoms.push(doc.addAtom(x + L * Math.cos((i * Math.PI) / 3), y + L * Math.sin((i * Math.PI) / 3), i === 0 ? 7 : 6).id);
  for (let i = 0; i < 6; i++) doc.addBond(atoms[i], atoms[(i + 1) % 6], i % 2 ? 2 : 1);
  return atoms;
}
const editorFor = (doc: Doc) => {
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  const m = plainMeasure(doc);
  Object.assign(ed, { measure: () => m, fullMeasure: () => m });
  return ed;
};
const centre = (doc: Doc, atoms: number[]) => ({ x: atoms.reduce((s, id) => s + doc.atoms.get(id)!.x, 0) / atoms.length, y: atoms.reduce((s, id) => s + doc.atoms.get(id)!.y, 0) / atoms.length });

it('Clean Up again keeps the product centred on its arrow', () => {
  const doc = new Doc();
  const L = doc.style.bondLength;
  const ids = doc.edit('build', () => {
    const a = pyridine(doc, 0, 0);
    const r = doc.addArrow({ tail: { x: 1.6 * L, y: 9 }, head: { x: 4.5 * L, y: 9 }, sweep: 0, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5 }).id;
    const b = pyridine(doc, 6.5 * L, 30);
    return { a, r, b };
  });
  const ed = editorFor(doc);
  ed.sel.atoms = new Set(doc.atoms.keys());
  const first = ed.cleanUp();
  expect(first).not.toBe(false);
  const after1 = centre(doc, ids.b);
  const arr = doc.arrows.get(ids.r)!;
  const second = ed.cleanUp();
  expect(second && second.k).toBe(1);
  const after2 = centre(doc, ids.b);
  // the product stays where the scheme tidy put it (give or take its own turn)
  expect(Math.abs(after2.y - after1.y)).toBeLessThan(0.3 * L);
  expect(Math.abs(after2.x - after1.x)).toBeLessThan(0.3 * L);
});

it('Clean Up leaves an already tidy structure alone, however often it is pressed', () => {
  const doc = new Doc();
  doc.edit('build', () => pyridine(doc, 0, 0));
  const ed = editorFor(doc);
  ed.sel.atoms = new Set(doc.atoms.keys());
  ed.cleanUp();
  const v = doc.version;
  const at = [...doc.atoms.values()].map((a) => [a.x, a.y]);
  // a fresh press on the tidy structure (a new window on the same drawing), then again
  const fresh = editorFor(doc);
  fresh.sel.atoms = new Set(doc.atoms.keys());
  expect(fresh.cleanUp()).toBe(false);
  expect(fresh.cleanUp()).toBe(false);
  expect(doc.version).toBe(v);
  expect([...doc.atoms.values()].map((a) => [a.x, a.y])).toEqual(at);
});
