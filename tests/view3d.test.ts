// @vitest-environment jsdom
// Views of a 3-D model that draw cleanly: from most angles a cage such as quinine's puts an atom
// on top of another (or on a bond) once flattened, so Place on Page first turns the model the
// least it takes to keep them apart, and Best View finds the cleanest view outright.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { Doc } from '../src/model';
import { addMolfile, toMolfile } from '../src/chem/molfile';
import { buildModel, type Model3d } from '../src/chem/model3d-build';
import { placeView } from '../src/chem/place3d';
import { StructureChecks } from '../src/chem/warnings';
import { skeleton, clutter, cleanerNearby, cleanestView, turn, axisTurn, ident, type P3 } from '../src/chem/view3d';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);

const QUININE = 'COc1ccc2nccc([C@@H](O)[C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)c2c1';

/** The model as the viewer holds it before any turn: y up, z towards the reader. */
const baseOf = (m: Model3d): P3[] => m.atoms.map((_, i) => {
  const xyz = m.conformers[0].xyz;
  return [xyz[3 * i], -xyz[3 * i + 1], -xyz[3 * i + 2]];
});

/** A turn from a seeded sequence, so the test sees the same views every run. */
function views(n: number): ReturnType<typeof axisTurn>[] {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => {
    const a: P3 = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], k = Math.hypot(...a);
    return axisTurn(a[0] / k, a[1] / k, a[2] / k, rnd() * 2 * Math.PI);
  });
}

describe('judging a view', () => {
  const sk = { atoms: [0, 1, 2, 3], bonds: [[0, 1], [1, 2], [2, 3]] as [number, number][], L: 1.5 };

  it('finds nothing wrong with a flat zigzag', () => {
    const v: P3[] = [[0, 0, 0], [1.3, 0.75, 0], [2.6, 0, 0], [3.9, 0.75, 0]];
    expect(clutter(v, sk)).toEqual({ score: 0, overlaps: 0 });
  });

  it('counts an atom seen on top of another, or on a bond', () => {
    const onAtom: P3[] = [[0, 0, 0], [1.3, 0.75, 0], [1.3, 0.75, -1.5], [0.05, 0, -1.5]];
    expect(clutter(onAtom, sk).overlaps).toBeGreaterThan(0);
    const onBond: P3[] = [[0, 0, 0], [3, 0, 0], [1.5, 0.05, 1.5], [1.5, 1.5, 1.5]];
    expect(clutter(onBond, sk).overlaps).toBeGreaterThan(0);
  });

  it('scores a bond seen end on, without calling it an overlap', () => {
    const c = clutter([[0, 0, 0], [0.1, 0, 1.5]], { atoms: [0, 1], bonds: [[0, 1]], L: 1.5 });
    expect(c.overlaps).toBe(0);
    expect(c.score).toBeGreaterThan(0);
  });
});

describe('quinine from any angle', () => {
  let model: Model3d;
  let molblock: string;
  let want: string;
  beforeAll(() => {
    const m = RDKit.get_mol(QUININE);
    molblock = m.get_molblock();
    want = m.get_smiles();
    m.delete();
    model = buildModel(molblock, 2, 1)!;
  }, 30000);

  it('is tangled from most angles, and a small turn (or the cleanest view) frees it', () => {
    const base = baseOf(model), sk = skeleton(model.atoms.map((a) => a.z), model.bonds, base);
    let tangled = 0;
    const turns: number[] = [];
    for (const r of views(40)) {
      if (clutter(turn(r, base), sk).overlaps) tangled++;
      const near = cleanerNearby(base, r, sk, 45);
      const rot = near?.rot ?? cleanestView(base, sk);
      if (near) turns.push(near.deg);
      expect(clutter(turn(rot, base), sk).overlaps).toBe(0);
    }
    expect(tangled).toBeGreaterThan(20);
    expect(turns.length).toBeGreaterThanOrEqual(36);
    expect(turns.reduce((s, d) => s + d, 0) / turns.length).toBeLessThan(20);
    expect(clutter(turn(cleanestView(base, sk), base), sk).score).toBeLessThanOrEqual(2);
  });

  it('places without the drawing warning of atoms on top of each other, and keeps its stereo', () => {
    const base = baseOf(model), sk = skeleton(model.atoms.map((a) => a.z), model.bonds, base);
    let kept = 0;
    const rs = views(8);
    for (const r of rs) {
      const rot = cleanerNearby(base, r, sk, 45)?.rot ?? cleanestView(base, sk);
      const doc = new Doc();
      doc.bulk(() => addMolfile(doc, molblock, 200, 200));
      const ex = toMolfile(doc, doc.atoms.keys());
      let unshown = 0;
      doc.bulk(() => ({ unshown } = placeView(doc, ex.map, turn(rot, base))));
      const checks = new StructureChecks(doc);
      checks.update();
      const onTop = [...checks.atoms.values()].flat().filter((w) => /on top of|on a bond|through/i.test(w));
      expect(onTop).toEqual([]);
      const m = RDKit.get_mol(toMolfile(doc, doc.atoms.keys()).molblock);
      if (!unshown && m.get_smiles() === want) kept++;
      m.delete();
    }
    // as before, the window takes back a view whose wedges can't read right; most must
    expect(kept).toBeGreaterThanOrEqual(6);
  }, 30000);

  it('turns the cleanest view in the page to lie like the drawing', () => {
    const base = baseOf(model), sk = skeleton(model.atoms.map((a) => a.z), model.bonds, base);
    const drawn = turn(ident(), base).map(([x, y]) => ({ x: x * 10, y: -y * 10 }));
    const v = turn(cleanestView(base, sk, drawn), base);
    // the methoxy end and the vinyl end keep their left-right order
    const ox = drawn[0].x < drawn[drawn.length - 1].x;
    expect(v[0][0] < v[v.length - 1][0]).toBe(ox);
  });
});
