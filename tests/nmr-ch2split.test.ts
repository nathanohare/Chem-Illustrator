// @vitest-environment jsdom
// Diastereotopic CH2: the two protons predicted apart (proton3d.ts), shown as two rows and two spins.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Molecule, Resources } from 'openchemlib';
import type { NamerGraph } from '../src/chem/namer-graph';
import type { JGraph } from '../src/chem/nmr/coupling';
import { absoluteMolfile, ch2Flags } from '../src/chem/model3d-build';
import { ch2Topology, treeSplit, type Ch2SplitTrees } from '../src/chem/nmr/proton3d';
import { predictSpectrum } from '../src/chem/nmr/spectrum';
import { nmrRows, siText, splitRows } from '../src/ui/nmr-panel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);
const molOf = (smi: string) => { const m = RDKit.get_mol(smi); try { return m.get_molblock(); } finally { m.delete(); } };
const flags = (smi: string) => ch2Flags(Molecule.fromMolfile(absoluteMolfile(molOf(smi))));

describe('diastereotopic CH2 flags', () => {
  it('finds the CH2 next to a stereocentre, not the one in an achiral chain', () => {
    // (S)-2-methylbutanoic acid: C0 C1(stereo) C2H2 C3H3 ; butanoic acid: no stereocentre
    expect(flags('C[C@H](CC)C(=O)O').diaCH2).toEqual([2]);
    expect(flags('CCCC(=O)O').diaCH2).toEqual([]);
  });
  it('flags ring CH2 of a substituted cyclohexane', () => {
    expect(flags('CC(C)(C)C1CCCCC1').diaCH2.length).toBeGreaterThan(0);
  });
});

describe('CH2 structure features', () => {
  it('reads ring size and distance to the stereocentre', () => {
    const mol = Molecule.fromMolfile(absoluteMolfile(molOf('O[C@H]1CCC[C@@H]1C')));
    const atoms = [], bonds = [];
    for (let i = 0; i < mol.getAllAtoms(); i++) atoms.push({ z: mol.getAtomicNo(i), charge: 0 });
    for (let b = 0; b < mol.getAllBonds(); b++) bonds.push({ a: mol.getBondAtom(0, b), b: mol.getBondAtom(1, b), order: mol.getBondOrder(b), aromatic: mol.isAromaticBond(b) });
    const f = ch2Topology({ atoms, bonds }, 2, ch2Flags(mol).stereo);
    expect(f.slice(0, 3)).toEqual([1, 5, 1]);
  });
});

describe('the shipped trees', () => {
  const trees = JSON.parse(readFileSync('public/nmr/nmr-ch2split.json', 'utf8')) as Ch2SplitTrees;
  it('give the same gaps as the Python fit (scripts/nmr/proton3d_fit.py)', () => {
    expect(treeSplit(trees, new Array(33).fill(0))).toBeCloseTo(0.10805, 4);
    // a ring CH2 next to a stereocentre (NMRShiftDB2 training row)
    const x = [0.0, 0.00014658144122154496, 0.0016873709009951308, 0.0, 0.0018874269350802613, 7.529913870773296e-06, 0.0006257392401669559, 0.0053871762820943084, 0.0, 0.0, 1.0000000000000002, 0.002246140172433915, 0.0, -0.0001318950894452131, 0.0010702781255302364, 0.0, 0.0012334427349709176, 9.748987193512204e-06, 0.0029229069754462085, 0.011534418625646019, 0.0, 0.0, 0.5000000000000001, 0.00970407957007685, 1.0, 6.0, 1.0, 13.0, 0.0, 0.0, 0.0, 0.0, 35.0];
    expect(treeSplit(trees, x)).toBeCloseTo(0.62317, 4);
  });
});

const atom = (el: string, h: number) => ({ el, q: 0, iso: 0, legacy: null, cip: null, tag: null, arom: false, xh: 0, h, rad: 0, deg: 0 });
const bond = (u: number, v: number, o = 1) => ({ u, v, o, ez: null, ring: false });
const hit = (value: number) => ({ value, spread: 0.1, radius: 3, n: 12 });

describe('two rows for a CH2 with a gap', () => {
  // CH3-CH2-CH(OH)-CH3: C1 is the CH2
  const g: NamerGraph = { atoms: [atom('C', 3), atom('C', 2), atom('C', 1), atom('O', 1), atom('C', 3)], bonds: [bond(0, 1), bond(1, 2), bond(2, 3), bond(2, 4)] };
  const rows = nmrRows(g, [
    { atom: 0, c13: hit(10.0), h1: hit(0.94), hCount: 3 }, { atom: 1, c13: hit(32.0), h1: hit(1.47), hCount: 2 },
    { atom: 2, c13: hit(69.0), h1: hit(3.72), hCount: 1 }, { atom: 3, c13: null, h1: hit(1.6), hCount: 1 }, { atom: 4, c13: hit(23.0), h1: hit(1.19), hCount: 3 },
  ]);
  rows[1].mult = 'p'; rows[1].j = [7.0];
  it('splits the CH2 about its shift and keeps one carbon value', () => {
    const out = splitRows(rows, { 1: 0.1 }, g);
    const ch2 = out.filter((r) => r.atoms[0] === 1);
    expect(ch2.map((r) => r.h1!.value)).toEqual([1.52, 1.42].map((v) => expect.closeTo(v, 6)));
    expect(ch2.map((r) => r.hCount)).toEqual([1, 1]);
    expect(ch2.filter((r) => r.c13).length).toBe(1);
    expect(ch2[0].mult).toBe('dp');
    expect(siText(out, 'CDCl3')).toContain('1.52 (dp, J = 12.5, 7.0 Hz, 1H), 1.42 (dp, J = 12.5, 7.0 Hz, 1H)');
  });
  it('leaves small gaps as one row', () => {
    expect(splitRows(rows, { 1: 0.01 }, g)).toHaveLength(rows.length);
  });
});

describe('spectrum with a CH2 gap', () => {
  const C = (h: number) => ({ el: 'C', arom: false, h });
  // isolated CH2 (both neighbours without H): an AB quartet when its protons are apart
  const g: JGraph = { atoms: [C(0), C(2), C(0)], bonds: [{ u: 0, v: 1, o: 1 }, { u: 1, v: 2, o: 1 }] };
  const h1 = [NaN, 2.5, NaN];
  it('is a singlet without a gap and an AB quartet with one', () => {
    const lines = (gap: Record<number, number>) => {
      const s = predictSpectrum(g, h1, ['a', 'b', 'c'], 400, 'accurate', 0.9, [], gap);
      const hz = [...s.lines.hz].filter((_, k) => s.lines.intensity[k] > 0.01).sort((a, b) => a - b);
      return hz.filter((f, k) => k === 0 || f - hz[k - 1] > 1); // line positions (closer than 1 Hz merged)
    };
    expect(lines({}).length).toBe(1);
    const ab = lines({ 1: 0.2 });
    expect(ab.length).toBe(4);
    expect(Math.abs(ab[1] - ab[0])).toBeCloseTo(12.5, 1);
  });
});
