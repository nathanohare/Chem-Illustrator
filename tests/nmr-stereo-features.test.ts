import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { namerGraph } from '../src/chem/namer-graph';
import { atomDim, BOND_TYPES, bondTypes, graphFeatures } from '../src/chem/nmr/features';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); });

const feats = (smiles: string, v: 1 | 2 = 2) => {
  const mol = RDKit.get_mol(smiles);
  const g = namerGraph(mol);
  mol.delete();
  return graphFeatures(g, v);
};
const stereo = (smiles: string) => feats(smiles).atoms.map((a) => a[8]);

describe('NMR network stereo features (feature set 2)', () => {
  it('keeps feature set 1 as it was', () => {
    const f = feats('C[C@@H](O)CC', 1);
    expect(f.atoms[0]).toHaveLength(8);
    expect(atomDim(1)).toBe(42);
    expect(bondTypes(1)).toBe(BOND_TYPES);
    expect(atomDim(2)).toBe(47);
    expect(bondTypes(2)).toBe(24);
  });

  it('marks a defined centre, and an undefined possible one', () => {
    expect(stereo('C[C@@H](O)CC')[1]).toBe(2);
    expect(stereo('CC(O)CC')[1]).toBe(1);
    expect(stereo('CC(O)C')[1]).toBe(0); // two methyls: no stereocentre
  });

  it('gives enantiomers the same features', () => {
    expect(feats('C[C@@H](O)CC')).toEqual(feats('C[C@H](O)CC'));
    // two centres: (2R,3R) and (2S,3S)
    expect(feats('C[C@@H](O)[C@H](N)CC')).toEqual(feats('C[C@H](O)[C@@H](N)CC'));
    // and the order the SMILES is written in does not matter
    const a = stereo('C[C@@H](O)[C@H](N)CC'), b = stereo('CC[C@@H](N)[C@@H](C)O');
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('tells diastereomers apart', () => {
    const like = stereo('C[C@@H](O)[C@H](N)CC'), unlike = stereo('C[C@@H](O)[C@@H](N)CC');
    expect(like).not.toEqual(unlike);
    expect(new Set(like.filter((s) => s >= 2)).size).toBe(1); // both centres the same hand
    expect(new Set(unlike.filter((s) => s >= 2)).size).toBe(2);
    // cis and trans 2-methylcyclohexanol
    expect(stereo('C[C@@H]1CCCC[C@@H]1O')).not.toEqual(stereo('C[C@@H]1CCCC[C@H]1O'));
  });

  it('puts E/Z into the bond type', () => {
    const e = feats('C/C=C/C').bonds.find((b) => b[2] % BOND_TYPES === 1)!;
    const z = feats('C/C=C\\C').bonds.find((b) => b[2] % BOND_TYPES === 1)!;
    const none = feats('CC=CC').bonds.find((b) => b[2] % BOND_TYPES === 1)!;
    expect([none[2], e[2], z[2]]).toEqual([1, 1 + BOND_TYPES, 1 + 2 * BOND_TYPES]);
  });
});

describe('NMR networks with a CH2 gap output (file version 2)', () => {
  // one network, hidden 4, one layer, all weights zero: every atom gives o2's bias
  const build = (bias: number[]) => {
    const H = 4, D = atomDim(2) + 9;
    const shapes: [string, number[]][] = [
      ['inp.weight', [H, D]], ['inp.bias', [H]], ['msg.0.weight', [H, H]], ['msg.0.bias', [H]], ['bond.0.weight', [bondTypes(2), H]],
      ['self_.0.weight', [H, H]], ['self_.0.bias', [H]], ['agg.0.weight', [H, H]], ['o1.weight', [H, H]], ['o1.bias', [H]],
      ['o2.weight', [3, H]], ['o2.bias', [3]],
    ];
    let off = 0;
    const tensors = shapes.map(([name, shape]) => {
      const n = shape.reduce((a, b) => a * b, 1), t = { name, shape, offset: off };
      off += Math.ceil((2 * n) / 8) * 8;
      return t;
    });
    const head = new TextEncoder().encode(JSON.stringify({ version: 2, features: 2, outputs: 3, models: [{ hidden: H, layers: 1, tensors }], norm: { '13C': [100, 50], '1H': [4, 2.5] }, solvents: [], blend: null }));
    const base = Math.ceil((12 + head.length) / 8) * 8;
    const buf = new ArrayBuffer(base + off);
    new Uint8Array(buf).set(new TextEncoder().encode('NMRN'), 0);
    new DataView(buf).setUint32(4, 2, true);
    new DataView(buf).setUint32(8, head.length, true);
    new Uint8Array(buf).set(head, 12);
    const half = (x: number) => (x === 0 ? 0 : x === 1 ? 0x3c00 : x === -1 ? 0xbc00 : NaN);
    const b = tensors.find((t) => t.name === 'o2.bias')!;
    bias.forEach((x, k) => new DataView(buf).setUint16(base + b.offset + 2 * k, half(x), true));
    return buf;
  };

  it('gives each CH2 a gap between its protons, and nothing to other atoms', async () => {
    const { ShiftNet } = await import('../src/chem/nmr/net');
    const net = new ShiftNet(build([0, 0, 1]));
    const mol = RDKit.get_mol('C[C@@H](O)CC');
    const g = namerGraph(mol);
    mol.delete();
    const p = net.predict(g, 'CDCl3');
    expect(p[0].c13).toBeCloseTo(100, 5);
    expect(p[0].h1).toBeCloseTo(4, 5);
    expect(p[0].h1gap).toBeCloseTo(2.5 * Math.log1p(Math.E), 4);
    const shifts = g.atoms.map((a, atom) => ({ atom, c13: null, h1: null, hCount: a.h }));
    net.apply(g, shifts, 'CDCl3');
    expect(shifts.map((s) => s.h1gap !== undefined)).toEqual([false, false, false, true, false]);
  });
});
