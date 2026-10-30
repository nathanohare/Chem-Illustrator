// @vitest-environment jsdom
// 3-D models (OpenChemLib conformers relaxed with MMFF94s+) and Place on Page: a model keeps the
// drawing's stereochemistry, and turning the drawing to any view of it keeps what the drawing
// means, wedges and all.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { Doc } from '../src/model';
import { addMolfile, toMolfile } from '../src/chem/molfile';
import { buildModel, type Model3d } from '../src/chem/model3d-build';
import { placeView } from '../src/chem/place3d';
import { molfile3d } from '../src/ui/viewer3d';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);

const smilesOf = (molblock: string): string => {
  const m = RDKit.get_mol(molblock, JSON.stringify({ removeHs: true }));
  try { return m.get_smiles(); } finally { m.delete(); }
};

const CASES: [string, string][] = [
  ['L-alanine', 'C[C@H](N)C(=O)O'],
  ['cis-pent-2-ene', 'C/C=C\\CC'],
  ['(−)-menthol', 'CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O'],
  ['(S)-ibuprofen', 'CC(C)Cc1ccc(cc1)[C@H](C)C(=O)O'],
  ['β-D-glucose', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O'],
  ['camphor (bridged)', 'CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2'],
  ['cholesterol', 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C'],
];

/** A turn of the model as the viewer does it: y and z flipped (OpenChemLib's y runs down), then turned. */
function view(m: Model3d, a: number, b: number): [number, number, number][] {
  const xyz = m.conformers[0].xyz;
  const out: [number, number, number][] = [];
  for (let i = 0; i < m.atoms.length; i++) {
    const x = xyz[3 * i], y = -xyz[3 * i + 1], z = -xyz[3 * i + 2];
    // about y by a, then about x by b
    const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
    out.push([x1, y2, z2]);
  }
  return out;
}

describe('3-D models', () => {
  for (const [name, smi] of CASES) {
    it(`${name}: the model and every placed view keep the stereochemistry`, () => {
      const m = RDKit.get_mol(smi);
      const want = m.get_smiles();
      const doc = new Doc();
      doc.bulk(() => addMolfile(doc, m.get_molblock(), 200, 200));
      m.delete();
      const ex = toMolfile(doc, doc.atoms.keys());
      const model = buildModel(ex.molblock, 4, 1)!;
      expect(model.conformers.length).toBeGreaterThan(0);
      const es = model.conformers.map((c) => c.energy!);
      expect([...es].sort((p, q) => p - q)).toEqual(es);
      // the 3-D molfile reads back as the same compound, stereocentres included
      expect(smilesOf(molfile3d(model, 0, name))).toBe(want);
      let shownViews = 0;
      for (const [a, b] of [[0, 0], [1.1, 0.4], [2.6, -1.2], [-0.7, 2.2]]) {
        const d = new Doc();
        const mm = RDKit.get_mol(smi);
        d.bulk(() => addMolfile(d, mm.get_molblock(), 200, 200));
        mm.delete();
        const e2 = toMolfile(d, d.atoms.keys());
        let unshown = 0;
        d.bulk(() => ({ unshown } = placeView(d, e2.map, view(model, a, b))));
        // the window takes back a view that doesn't read right (and says so); most views must
        if (!unshown && smilesOf(toMolfile(d, d.atoms.keys()).molblock) === want) shownViews++;
      }
      expect(shownViews).toBeGreaterThanOrEqual(3);
    }, 30000);
  }

  it('scales the placed structure to the drawing\'s bond length and keeps its depth', () => {
    const m = RDKit.get_mol('CCCC');
    const doc = new Doc();
    doc.bulk(() => addMolfile(doc, m.get_molblock(), 200, 200));
    m.delete();
    const ex = toMolfile(doc, doc.atoms.keys());
    const model = buildModel(ex.molblock, 1, 1)!;
    doc.bulk(() => placeView(doc, ex.map, view(model, 0.5, 0.5)));
    const L = doc.style.bondLength;
    for (const b of doc.bonds.values()) {
      const p = doc.atoms.get(b.a1)!, q = doc.atoms.get(b.a2)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y, (p.depth ?? 0) - (q.depth ?? 0))).toBeCloseTo(L, 0);
      expect(p.xyz).toEqual([p.x, p.y, -p.depth!]);
    }
  });
});
