// @vitest-environment jsdom
//
// \ on a selected cyclohexane goes straight between the flat drawing and the chair, from any
// shape, and the molecule (stereocenters and all) stays the same.
import { it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import type { BondDisplay } from '../src/model';
import { toMolfile } from '../src/chem/molfile';
import { viewNow, viewRingOf } from '../src/chem/ring-views';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { plainMeasure } from '../src/chem/reaction';

window.requestAnimationFrame = () => 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); }, 30000);
const canon = (doc: Doc): string => { const m = RDKit.get_mol(toMolfile(doc, doc.atoms.keys()).molblock); try { return m.get_smiles(); } finally { m.delete(); } };

it('\\ toggles flat and chair from any shape, keeping the stereochemistry', () => {
  const doc = new Doc();
  const L = doc.style.bondLength;
  const ring: number[] = [];
  const subs: [number, BondDisplay][] = [[0, 'wedge'], [1, 'hashWedge'], [3, 'wedge']];
  doc.edit('build', () => {
    for (let k = 0; k < 6; k++) { const t = (-90 + 60 * k) * Math.PI / 180; ring.push(doc.addAtom(200 + L * Math.cos(t), 200 + L * Math.sin(t)).id); }
    ring.forEach((id, k) => doc.addBond(id, ring[(k + 1) % 6], 1));
    for (const [k, d] of subs) { const t = (-90 + 60 * k) * Math.PI / 180; const a = doc.atoms.get(ring[k])!; doc.addBond(ring[k], doc.addAtom(a.x + L * Math.cos(t), a.y + L * Math.sin(t)).id, 1, d); }
  });
  const want = canon(doc);
  expect(want).toContain('@');
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas'), host = document.createElement('div');
  host.append(scene, overlay); document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  Object.assign(ed, { measure: () => plainMeasure(doc), fullMeasure: () => plainMeasure(doc) });
  ed.sel.atoms = new Set(doc.atoms.keys());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const press = (chord: string) => { const step = (ed as any).ringKey(chord); expect(step).not.toBeNull(); ed.ringStep(step); };
  const view = () => { const got = viewRingOf(doc, ring); if (!('ring' in got)) throw new Error(got.why); return viewNow(doc, got.ring).view; };
  press('\\');
  expect(view()).toBe('chair');
  expect(canon(doc)).toBe(want);
  press('\\');
  expect(view()).toBe('flat');
  expect(canon(doc)).toBe(want);
  // from the flipped chair and the boat (reached from the menu) straight back to flat
  for (const shape of ['chair-flip', 'boat'] as const) {
    ed.ringStep(shape);
    expect(view()).toBe(shape);
    press('\\');
    expect(view()).toBe('flat');
    expect(canon(doc)).toBe(want);
  }
});
