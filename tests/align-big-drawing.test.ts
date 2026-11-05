// @vitest-environment jsdom
// Align or Distribute moves structures; curved arrows stuck to them may need redrawing, which
// needs every label measured. With no such arrows nothing is measured again: on the 40,000-atom
// self-test drawing that second measuring took about 5 s.
import { it, expect } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { freeRing, placeRing } from '../src/chem/chemgeom';

window.requestAnimationFrame = () => 0;

it('Align measures the labels once when no curved arrow is stuck to anything', () => {
  const doc = new Doc();
  const L = doc.style.bondLength;
  doc.edit('rings', () => { for (let i = 0; i < 20; i++) placeRing(doc, freeRing({ x: i * 4 * L, y: (i % 3) * 10 }, 6, L), {}); });
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas'), host = document.createElement('div');
  host.append(scene, overlay); document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  let measured = 0;
  const m = plainMeasure(doc);
  Object.assign(ed, { measure: () => { measured++; return m; }, fullMeasure: () => m });
  ed.sel.atoms = new Set(doc.atoms.keys());
  ed.sel.bonds = new Set(doc.bonds.keys());
  expect(ed.align('top')).toBe(true);
  expect(measured).toBe(1);
});
