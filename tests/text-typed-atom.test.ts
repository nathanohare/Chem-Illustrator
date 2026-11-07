// @vitest-environment jsdom
//
// Nate (2026-11-06): "N" typed with the Text tool on empty canvas stayed text; set to Chemical it
// read as NH3 (hydrogens that were never shown) under a dotted "read as chemistry" line that
// looked like a lone pair, and the benzene ring tool on it drew a ring around it instead of
// making pyridine. An atom, a one-atom formula or a group typed on its own now becomes an atom
// with that label, read just as written until it is bonded.

import { beforeAll, describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { Renderer } from '../src/render/renderer';
import { Editor } from '../src/editor/editor';
import { toMolfile } from '../src/chem/molfile';
import { atomWarnings } from '../src/chem/warnings';
import { readSpecies } from '../src/chem/species';

window.requestAnimationFrame = () => 0;
const noop = () => undefined;
const ctx: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 5, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    : k === 'getTransform' ? () => new DOMMatrix()
    : k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient' ? () => ({ addColorStop: noop })
    : noop),
  set: () => true,
});
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;

let last: Editor | null = null;
afterEach(() => { if (last) last.paused = true; });

function setup() {
  document.body.innerHTML = '';
  const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const doc = new Doc();
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  last = ed;
  ed.setTool('text');
  return { doc, ed };
}

/** Type this into a new caption at (100, 100), as the Text tool does when typing stops. */
function typeText(doc: Doc, ed: Editor, text: string): boolean {
  let id = 0;
  doc.edit('Caption', () => { id = doc.addCaption({ x: 100, y: 100, runs: [{ text }], justify: 'left' }).id; });
  return (ed as unknown as { labelFromText(c: number, t: string, at: { x: number; y: number }): boolean }).labelFromText(id, text, { x: 100, y: 100 });
}

type Mol = { get_smiles(): string; delete(): void } | null;
let RDKit: { get_mol(s: string): Mol };
beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); });
const smilesOf = (doc: Doc, opts = {}) => {
  const m = RDKit.get_mol(toMolfile(doc, doc.atoms.keys(), '', opts).molblock);
  const s = m?.get_smiles() ?? null;
  m?.delete();
  return s;
};

describe('an atom typed with the Text tool on its own', () => {
  it('becomes an atom shown and read just as typed (N is N, not NH3)', () => {
    const { doc, ed } = setup();
    expect(typeText(doc, ed, 'N')).toBe(true);
    expect(doc.captions.size).toBe(0);
    const a = [...doc.atoms.values()][0];
    expect([a.z, a.label]).toEqual([7, 'N']);
    // the first letter where the typed one was
    expect(a.x).toBeGreaterThan(100);
    expect(a.y).toBeLessThan(100);
    expect(smilesOf(doc)).toBe('[N]');
    // no "too few bonds" box on it
    expect(atomWarnings(doc, a)).toEqual([]);
  });

  it('reads formulas of one atom and groups as written', () => {
    const cases: [string, string][] = [['NH2', '[NH2]'], ['H2O', 'O'], ['NH3', 'N'], ['Cl', '[Cl]'], ['OMe', 'C[O]']];
    for (const [text, smiles] of cases) {
      const { doc, ed } = setup();
      expect(typeText(doc, ed, text), text).toBe(true);
      expect(smilesOf(doc), text).toBe(smiles);
      // the label shows what was typed (H2O, not OH2)
      expect([...doc.atoms.values()][0].label ?? '', text).toBe(text);
    }
  });

  it('becomes an ordinary atom once bonded (a ring through N is pyridine, a bond from it NH2)', () => {
    const { doc, ed } = setup();
    typeText(doc, ed, 'N');
    const n = [...doc.atoms.keys()][0];
    doc.edit('Ring', () => {
      const ring = [n];
      for (let k = 1; k < 6; k++) ring.push(doc.addAtom(100 + 10 * k, 100).id);
      ring.forEach((id, k) => doc.addBond(id, ring[(k + 1) % 6], k % 2 ? 1 : 2));
    });
    expect(doc.atoms.get(n)!.label).toBeNull();
    expect(smilesOf(doc)).toBe('c1ccncc1');

    const two = setup();
    typeText(two.doc, two.ed, 'N');
    const m = [...two.doc.atoms.keys()][0];
    two.doc.edit('Bond', () => two.doc.addBond(m, two.doc.addAtom(130, 100).id));
    expect(smilesOf(two.doc)).toBe('CN');
  });

  it('leaves compounds of more than one atom, ions, numbers and longer text as text', () => {
    for (const text of ['CH2Cl2', 'DMAP', 'MeOH', 'Na+', 'BF4−', 'II', 'IV', 'Step 2', 'rt', '1a']) {
      const { doc, ed } = setup();
      expect(typeText(doc, ed, text), text).toBe(false);
      expect(doc.captions.size, text).toBe(1);
      expect(doc.atoms.size, text).toBe(0);
    }
  });

  it('is always on, and Undo keeps the text as text', () => {
    const { doc, ed } = setup();
    expect(typeText(doc, ed, 'N')).toBe(true);
    expect(doc.captions.size).toBe(0);
    doc.undo();
    expect(doc.captions.size).toBe(1);
    expect(doc.atoms.size).toBe(0);
  });

  it('leaves labels made any other way as they are when bonded', () => {
    const doc = new Doc();
    let a = 0, b = 0;
    doc.edit('Draw', () => {
      a = doc.addAtom(0, 0, 7, { label: 'N', fileLabel: true }).id;
      doc.addBond(a, doc.addAtom(14, 0).id);
      b = doc.addAtom(0, 30, 8, { label: 'OH' }).id;
      doc.addBond(b, doc.addAtom(14, 30).id);
    });
    expect(doc.atoms.get(a)!.label).toBe('N');
    expect(doc.atoms.get(b)!.label).toBe('OH');
  });
});

describe('a text box set to Chemical holding one atom', () => {
  it('reads N as a nitrogen atom, with no hydrogens added', () => {
    const doc = new Doc();
    const sp = readSpecies('N', { fragments: true })!;
    const mb = toMolfile(doc, [], '', { species: [{ graph: sp.graph, x: 0, y: 0 }] }).molblock;
    const m = RDKit.get_mol(mb);
    expect(m?.get_smiles()).toBe('[N]');
    m?.delete();
  });
});
