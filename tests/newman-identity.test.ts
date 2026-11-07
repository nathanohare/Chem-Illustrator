// @vitest-environment jsdom
// Newman projections must show every group as what it is and every stereocenter the right way
// round. A drawn H on a wedge used to be moved to the end of the atom list by OpenChemLib as it
// built the 3-D model, so the model's atom numbers no longer matched the molfile's and labels
// landed on the wrong groups (an H shown as H3C, an Et shown where the H was). Here every
// stereoisomer of a few structures, drawn as a chemist would (labels, drawn H on wedges, or
// plain skeletal), is checked group by group and against RDKit's CIP labels, both ways down the
// bond and for both the conformer search and the "as drawn" pose.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { Doc, type BondDisplay } from '../src/model';
import { addMolfile, toMolfile, type MolExport } from '../src/chem/molfile';
import { searchModel } from '../src/chem/model3d-build';
import { buildPose } from '../src/chem/pose3d';
import { depthCues } from '../src/editor/perspective';
import { newmanView, sameAtomOrder, type NewmanMol, type NewmanView, type NewmanGroup } from '../src/chem/newman';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);

/** A group on a stereocenter: an element, or a label (Et, Me), with how its bond is drawn. */
interface Sub { z?: number; label?: string; display: BondDisplay }

/**
 * Two stereocenters A–B drawn as in Nate's figure: A with a group back-left, one up and one down,
 * B with one up, one up-right and one down-right; each list in that order.
 */
function drawPair(a: Sub[], b: Sub[]) {
  const doc = new Doc();
  const L = doc.style.bondLength || 14.4;
  const ids: { A: number; B: number; a: number[]; b: number[] } = { A: 0, B: 0, a: [], b: [] };
  doc.bulk(() => {
    const A = doc.addAtom(100, 100), B = doc.addAtom(100 + L * 0.866, 100 - L * 0.5);
    ids.A = A.id; ids.B = B.id;
    doc.addBond(A.id, B.id);
    const posA = [[-0.866, -0.5], [0, -1], [0, 1]], posB = [[0, -1], [0.866, -0.5], [0.866, 0.5]];
    const put = (c: typeof A, subs: Sub[], pos: number[][], into: number[]) => subs.forEach((s, k) => {
      const at = doc.addAtom(c.x + pos[k][0] * L, c.y + pos[k][1] * L, s.z ?? 6, s.label ? { label: s.label } : {});
      into.push(at.id);
      doc.addBond(c.id, at.id, 1, s.display);
    });
    put(A, a, posA, ids.a);
    put(B, b, posB, ids.b);
  });
  return { doc, ...ids };
}

/** RDKit's CIP label of each molfile atom that has one. */
function cipLabels(molblock: string): Map<number, 'R' | 'S'> {
  const m = RDKit.get_mol(molblock);
  const tags = JSON.parse(m.get_stereo_tags()) as { CIP_atoms: [number, string][] };
  m.delete();
  return new Map(tags.CIP_atoms.map(([i, t]) => [i, t.includes('R') ? 'R' : 'S']));
}

/**
 * The handedness a projection shows at its front or back atom, from the groups' angles alone:
 * the front groups lean towards the reader and the back ones away, the other atom straight
 * behind (or in front). `priority` lists the labels highest first, '*' for the other atom.
 */
function handedness(v: NewmanView, end: 'front' | 'back', priority: string[]): 'R' | 'S' {
  type P = [number, number, number];
  const lean = end === 'front' ? 0.33 : -0.33;
  const gs = end === 'front' ? v.front : v.back;
  const vec = (label: string): P => {
    if (label === '*') return end === 'front' ? [0, 0, -1] : [0, 0, 1];
    const g = gs.filter((x) => x.label === label);
    expect(g.length, `one ${label} on the ${end} atom`).toBe(1);
    const t = (g[0].angle * Math.PI) / 180;
    return [Math.sin(t), Math.cos(t), lean];
  };
  const [p1, p2, p3, p4] = priority.map(vec);
  const d = (p: P): P => [p[0] - p4[0], p[1] - p4[1], p[2] - p4[2]];
  const a = d(p1), b = d(p2), c = d(p3);
  const vol = a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  // x right, y up, z towards the reader: a clockwise 1 → 2 → 3 with 4 away gives a negative volume
  return vol < 0 ? 'R' : 'S';
}

/** Each group's label is the drawn atom's own (its label, or its element), when it is a drawn atom. */
function expectLabelsMatchDrawing(doc: Doc, ex: MolExport, gs: NewmanGroup[]): void {
  const sym: Record<number, string> = { 1: 'H', 8: 'OH', 17: 'Cl', 35: 'Br' };
  for (const g of gs) {
    const id = ex.map[g.atom];
    if (id === undefined || id < 0) continue;
    const a = doc.atoms.get(id)!;
    if (a.label) expect(g.label).toBe(a.label);
    else if (sym[a.z]) expect(g.label).toBe(sym[a.z]);
  }
}

/** The label function the Newman window uses: a group drawn as a label keeps it. */
const drawnLabels = (doc: Doc, ex: MolExport) => (i: number): string | null => {
  const id = ex.map[i];
  const a = id !== undefined && id >= 0 ? doc.atoms.get(id) : undefined;
  return a?.label && (doc.adj.get(a.id) ?? []).length === 1 ? a.label : null;
};

/** Both ends of every projection checked: the groups, then the handedness against RDKit's. */
function checkAll(doc: Doc, A: number, B: number, expectA: string[], expectB: string[], prioA: string[], prioB: string[], opts: { pose?: boolean } = {}) {
  const ex = toMolfile(doc, doc.atoms.keys());
  const cip = cipLabels(ex.molblock);
  const ia = ex.map.indexOf(A), ib = ex.map.indexOf(B);
  expect(cip.has(ia) && cip.has(ib), 'RDKit sees both stereocenters').toBe(true);
  const drawn = drawnLabels(doc, ex);
  const shapes: { mol: NewmanMol; xyz: number[] }[] = [];
  const model = searchModel(ex.molblock, { starts: 30, window: 6, rmsd: 0.3 })!;
  expect(sameAtomOrder(model, ex.molblock)).toBe(true);
  for (const c of model.conformers.slice(0, 4)) shapes.push({ mol: model, xyz: c.xyz });
  if (opts.pose) {
    const r = buildPose(ex.molblock, depthCues(doc, ex), doc.style.bondLength || 14.4);
    expect('problem' in r ? r.message : '').toBe('');
    if (!('problem' in r)) {
      const mol = { atoms: r.pose.z.map((z) => ({ z, charge: 0 })), bonds: r.pose.bonds.map(([a, b]) => ({ a, b, order: 1 })) };
      expect(sameAtomOrder(mol, ex.molblock)).toBe(true);
      shapes.push({ mol, xyz: r.pose.pts.flat() });
    }
  }
  for (const { mol, xyz } of shapes) {
    for (const [f, b, ef, eb, pf, pb] of [[ia, ib, expectA, expectB, prioA, prioB], [ib, ia, expectB, expectA, prioB, prioA]] as const) {
      const v = newmanView(mol, xyz, f, b, { drawn });
      expect(v.front.map((g) => g.label).sort()).toEqual([...ef].sort());
      expect(v.back.map((g) => g.label).sort()).toEqual([...eb].sort());
      expectLabelsMatchDrawing(doc, ex, [...v.front, ...v.back]);
      expect(handedness(v, 'front', pf)).toBe(cip.get(f));
      expect(handedness(v, 'back', pb)).toBe(cip.get(b));
    }
  }
}

const flip = (d: BondDisplay): BondDisplay => (d === 'wedge' ? 'hashWedge' : d === 'hashWedge' ? 'wedge' : d);

describe('Newman projections show every group as itself, the right way round', () => {
  // Nate's figure: 3-bromo-4-methylhexane with Et and Me as labels and both H drawn on wedges
  it('3-bromo-4-methylhexane drawn with labels and wedged H: all four stereoisomers', () => {
    const baseA: Sub[] = [{ label: 'Et', display: 'hashWedge' }, { z: 1, display: 'wedge' }, { z: 35, display: 'solid' }];
    const baseB: Sub[] = [{ label: 'Me', display: 'wedge' }, { z: 1, display: 'hashWedge' }, { label: 'Et', display: 'solid' }];
    const seen = new Set<string>();
    for (const fa of [false, true]) {
      for (const fb of [false, true]) {
        const a = baseA.map((s) => (fa ? { ...s, display: flip(s.display) } : s));
        const b = baseB.map((s) => (fb ? { ...s, display: flip(s.display) } : s));
        const { doc, A, B } = drawPair(a, b);
        checkAll(doc, A, B, ['Et', 'H', 'Br'], ['Me', 'H', 'Et'], ['Br', '*', 'Et', 'H'], ['*', 'Et', 'Me', 'H'], { pose: true });
        const ex = toMolfile(doc, doc.atoms.keys());
        const cip = cipLabels(ex.molblock);
        seen.add(`${cip.get(ex.map.indexOf(A))}${cip.get(ex.map.indexOf(B))}`);
      }
    }
    expect([...seen].sort()).toEqual(['RR', 'RS', 'SR', 'SS']);
  }, 120000);

  it('2,3-dibromobutane drawn with Me labels and wedged H: meso and both enantiomers', () => {
    const baseA: Sub[] = [{ label: 'Me', display: 'hashWedge' }, { z: 1, display: 'wedge' }, { z: 35, display: 'solid' }];
    const baseB: Sub[] = [{ z: 35, display: 'wedge' }, { z: 1, display: 'hashWedge' }, { label: 'Me', display: 'solid' }];
    for (const fb of [false, true]) {
      for (const fa of [false, true]) {
        const a = baseA.map((s) => (fa ? { ...s, display: flip(s.display) } : s));
        const b = baseB.map((s) => (fb ? { ...s, display: flip(s.display) } : s));
        const { doc, A, B } = drawPair(a, b);
        checkAll(doc, A, B, ['Me', 'H', 'Br'], ['Br', 'H', 'Me'], ['Br', '*', 'Me', 'H'], ['Br', '*', 'Me', 'H']);
      }
    }
  }, 120000);

  it('3-chlorobutan-2-ol drawn skeletal (no H atoms drawn): all four stereoisomers', () => {
    for (const smi of ['C[C@@H](O)[C@@H](C)Cl', 'C[C@@H](O)[C@H](C)Cl', 'C[C@H](O)[C@@H](C)Cl', 'C[C@H](O)[C@H](C)Cl']) {
      const m = RDKit.get_mol(smi);
      const doc = new Doc();
      let ids: number[] = [];
      doc.bulk(() => { ids = addMolfile(doc, m.get_molblock(), 200, 200); });
      m.delete();
      // SMILES atoms: 0 CH3, 1 C2, 2 O, 3 C3, 4 CH3, 5 Cl
      checkAll(doc, ids[1], ids[3], ['CH3', 'H', 'OH'], ['CH3', 'H', 'Cl'], ['OH', '*', 'CH3', 'H'], ['Cl', '*', 'CH3', 'H'], { pose: true });
    }
  }, 120000);

  it('keeps a drawn H in the middle of the atom list at its own place in the 3-D model', () => {
    const { doc } = drawPair(
      [{ label: 'Et', display: 'hashWedge' }, { z: 1, display: 'wedge' }, { z: 35, display: 'solid' }],
      [{ label: 'Me', display: 'wedge' }, { z: 1, display: 'hashWedge' }, { label: 'Et', display: 'solid' }],
    );
    const ex = toMolfile(doc, doc.atoms.keys());
    // the drawn H atoms come last in the molfile, so OpenChemLib has nothing to move
    const heavy = ex.map.map((id) => (id >= 0 ? doc.atoms.get(id)!.z : 6));
    const firstH = heavy.indexOf(1);
    expect(firstH).toBeGreaterThan(0);
    expect(heavy.slice(firstH).every((z) => z === 1)).toBe(true);
    const model = searchModel(ex.molblock, { starts: 5, window: 6, rmsd: 0.3 })!;
    ex.map.forEach((id, i) => { if (id >= 0) expect(model.atoms[i].z).toBe(doc.atoms.get(id)!.z); });
  }, 60000);

  it('says when a model numbers its atoms differently from the molfile', () => {
    const pair = drawPair(
      [{ z: 17, display: 'solid' }, { z: 1, display: 'wedge' }, { z: 35, display: 'solid' }],
      [{ z: 9, display: 'solid' }, { z: 1, display: 'solid' }, { z: 8, display: 'solid' }],
    );
    const mb = toMolfile(pair.doc, pair.doc.atoms.keys()).molblock;
    const ok = searchModel(mb, { starts: 3, window: 6, rmsd: 0.3 })!;
    expect(sameAtomOrder(ok, mb)).toBe(true);
    const swapped = { ...ok, atoms: [...ok.atoms] };
    [swapped.atoms[2], swapped.atoms[3]] = [swapped.atoms[3], swapped.atoms[2]];
    expect(sameAtomOrder(swapped, mb)).toBe(false);
  }, 60000);
});
