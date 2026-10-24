import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { bondsFrom, parseSequence, type ReadGraph, type Vocab } from '../src/recognise/molscribe';
import { addRead, kekulize, parseSymbol, readBonds } from '../src/recognise/to-drawing';
import { cropWhite, inkBox, resize } from '../src/recognise/picture';

/** A ring of n atoms read with aromatic bonds. */
function ring(symbols: string[], extra: [number, number, number][] = []): ReadGraph {
  const n = symbols.length;
  const edges = symbols.map(() => symbols.map(() => 0));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; edges[i][j] = edges[j][i] = 4; }
  for (const [a, b, t] of extra) edges[a][b] = edges[b][a] = t;
  const coords = symbols.map((_, i) => [0.5 + 0.3 * Math.cos((2 * Math.PI * i) / n), 0.5 + 0.3 * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
  return { smiles: '', symbols, coords, edges, atomScores: symbols.map(() => 1), confidence: 1 };
}

const doubles = (g: ReadGraph) => {
  const atoms = g.symbols.map(parseSymbol), bonds = readBonds(g);
  const ok = kekulize(atoms, bonds);
  return { ok, n: bonds.filter((b) => b.order === 2).length };
};

describe('structure reader: atoms', () => {
  it('reads elements, charges, hydrogens and groups', () => {
    expect(parseSymbol('C')).toMatchObject({ z: 6, charge: 0, aromatic: false });
    expect(parseSymbol('c')).toMatchObject({ z: 6, aromatic: true });
    expect(parseSymbol('Cl')).toMatchObject({ z: 17 });
    expect(parseSymbol('[NH+]')).toMatchObject({ z: 7, charge: 1, h: 1 });
    expect(parseSymbol('[O-]')).toMatchObject({ z: 8, charge: -1 });
    expect(parseSymbol('[nH]')).toMatchObject({ z: 7, aromatic: true, h: 1 });
    expect(parseSymbol('[13CH3]')).toMatchObject({ z: 6, isotope: 13, h: 3 });
    expect(parseSymbol('[C@@H]')).toMatchObject({ z: 6, h: 1 });
    expect(parseSymbol('[OMe]')).toMatchObject({ label: 'OMe' });
    expect(parseSymbol('[OMe]').z).toBeUndefined();
    expect(parseSymbol('[CO2Et]')).toMatchObject({ label: 'CO2Et' });
    expect(parseSymbol('[R1]')).toMatchObject({ label: 'R1' });
    expect(parseSymbol('*')).toMatchObject({ label: 'R' });
  });
});

describe('structure reader: aromatic rings', () => {
  it('gives benzene, pyridine and pyrrole alternating bonds', () => {
    expect(doubles(ring(['c', 'c', 'c', 'c', 'c', 'c']))).toEqual({ ok: true, n: 3 });
    expect(doubles(ring(['n', 'c', 'c', 'c', 'c', 'c']))).toEqual({ ok: true, n: 3 });
    expect(doubles(ring(['[nH]', 'c', 'c', 'c', 'c']))).toEqual({ ok: true, n: 2 });
    expect(doubles(ring(['n', 'c', 'c', 'c', 'c']))).toEqual({ ok: true, n: 2 });
    expect(doubles(ring(['o', 'c', 'c', 'c', 'c']))).toEqual({ ok: true, n: 2 });
  });

  it('gives naphthalene five double bonds', () => {
    const g = ring(['c', 'c', 'c', 'c', 'c', 'c', 'c', 'c', 'c', 'c'], [[0, 5, 4]]);
    expect(doubles(g)).toEqual({ ok: true, n: 5 });
  });

  it('leaves an atom with a double bond out of the ring alone (pyridone)', () => {
    const g = ring(['[nH]', 'c', 'c', 'c', 'c', 'c', 'O']);
    // the O isn't in the ring: take its ring bonds out and join it to c1 with a double bond
    for (const i of [0, 5]) g.edges[6][i] = g.edges[i][6] = 0;
    g.edges[5][0] = g.edges[0][5] = 4;
    g.edges[1][6] = g.edges[6][1] = 2;
    expect(doubles(g)).toEqual({ ok: true, n: 3 });
  });

  it('places the structure at the bond length, keeping the picture\'s layout', () => {
    const doc = new Doc();
    let placed = { ids: [] as number[], problems: [] as string[] };
    doc.edit('Read', () => { placed = addRead(doc, ring(['c', 'c', 'c', 'c', 'c', '[OMe]']), 300, 300, 100, 100); });
    expect(placed.ids.length).toBe(6);
    const bonds = [...doc.bonds.values()];
    const lens = bonds.map((b) => { const a = doc.atoms.get(b.a1)!, c = doc.atoms.get(b.a2)!; return Math.hypot(a.x - c.x, a.y - c.y); });
    for (const l of lens) expect(l).toBeCloseTo(doc.style.bondLength, 3);
    expect(doc.atoms.get(placed.ids[5])!.label).toBe('OMe');
  });
});

describe('structure reader: decoding', () => {
  const v: Vocab = { itos: ['<pad>', '<sos>', '<eos>', '<unk>', '<mask>', 'C', 'l', 'O', '(', ')', '=', '[', ']', 'M', 'e'], offset: 15, maxx: 64, maxy: 64, special: 5, layers: 6, heads: 8, dk: 32, maxLen: 480, size: 384 };
  const x = (f: number) => 15 + Math.round(f * 63), y = (f: number) => 15 + 64 + Math.round(f * 63);

  it('turns tokens into SMILES with each atom\'s place', () => {
    // C (x y) ( = O (x y) ) Cl (x y) [OMe] (x y) <eos>
    const seq = [5, x(0), y(0), 8, 10, 7, x(0.5), y(0.25), 9, 5, 6, x(1), y(1), 11, 7, 13, 14, 12, x(0.25), y(0.75), 2];
    const r = parseSequence(v, seq);
    expect(r.smiles).toBe('C(=O)Cl[OMe]');
    expect(r.symbols).toEqual(['C', 'O', 'Cl', '[OMe]']);
    expect(r.coords[1][0]).toBeCloseTo(0.5, 1);
    expect(r.indices).toEqual([3, 8, 13, 20]);
  });

  it('averages each bond both ways round, wedges turning into hashes', () => {
    const k = 2, P = new Float32Array(k * k * 7);
    const set = (a: number, b: number, ps: number[]) => ps.forEach((p, t) => { P[(a * k + b) * 7 + t] = p; });
    set(0, 0, [1, 0, 0, 0, 0, 0, 0]); set(1, 1, [1, 0, 0, 0, 0, 0, 0]);
    set(0, 1, [0, 0.2, 0, 0, 0, 0.8, 0]); set(1, 0, [0, 0.3, 0, 0, 0, 0, 0.7]);
    const { edges, edgeScores } = bondsFrom(P, k);
    expect(edges[0][1]).toBe(5);
    expect(edges[1][0]).toBe(6);
    expect(edgeScores[0][1]).toBeCloseTo(0.75);
  });
});

describe('structure reader: pictures', () => {
  it('crops white margins and resizes like OpenCV', () => {
    const w = 10, h = 8, data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let yy = 2; yy < 5; yy++) for (let xx = 3; xx < 7; xx++) { const i = (yy * w + xx) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
    const p = { width: w, height: h, data };
    expect(inkBox(p)).toEqual({ x: 3, y: 2, w: 4, h: 3 });
    const c = cropWhite(p, 5);
    expect([c.width, c.height]).toEqual([14, 13]);
    const r = resize(c, 28, 26);
    expect([r.width, r.height]).toEqual([28, 26]);
    expect(r.data[(13 * 28 + 14) * 4]).toBe(0);
    expect(r.data[0]).toBe(255);
  });
});
