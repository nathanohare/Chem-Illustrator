// @vitest-environment jsdom
// The Perspective tools: turning a structure as a flat sheet (wedges turn over with it) and in
// its real 3-D shape, picked by the drawing's wedges and bold bonds (BINAP's two twists), with
// every stereocentre kept.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { Doc } from '../src/model';
import { addMolfile, toMolfile } from '../src/chem/molfile';
import { ringsThroughBond } from '../src/chem/aromatic';
import { buildPose } from '../src/chem/pose3d';
import { anglesTurn, apply, choosePose, dragTurn, facingNormal, keepsStereo, neighbours, drawingFrame, mirrored, type V3 } from '../src/chem/perspective';
import { depthCues, flatten, prepareTurn, stillMeans, structuresOf, type PerspectiveHost } from '../src/editor/perspective';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);

const smilesOf = (molblock: string): string | null => {
  const m = RDKit.get_mol(molblock, JSON.stringify({ removeHs: true }));
  try { return m?.get_smiles() ?? null; } finally { m?.delete(); }
};

const host: PerspectiveHost = {
  pose: async (molblock, cues, L) => buildPose(molblock, cues, L),
  smiles: async (molblock) => smilesOf(molblock),
};

function draw(smiles: string): Doc {
  const m = RDKit.get_mol(smiles);
  const doc = new Doc();
  doc.bulk(() => addMolfile(doc, m.get_molblock(), 200, 200));
  m.delete();
  return doc;
}

const meaning = (doc: Doc) => smilesOf(toMolfile(doc, doc.atoms.keys()).molblock);

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('turns', () => {
  it('a drag across turns about the up–down axis, the near side following the pointer', () => {
    const R = dragTurn(150, 0, false); // a quarter turn
    close(apply(R, [0, 0, 1]), [1, 0, 0]);
    close(apply(dragTurn(0, 150, false), [0, 0, 1]), [0, 1, 0]);
  });

  it('Shift turns one way only, in 15° steps', () => {
    const R = dragTurn(40, 10, true); // 24° across → 30°, the 6° down ignored
    const p = apply(R, [1, 0, 0]);
    expect(p[1]).toBeCloseTo(0, 9);
    expect(Math.acos(p[0]) * 180 / Math.PI).toBeCloseTo(30, 6);
  });

  it('typed angles: z is clockwise on the page (y runs down)', () => {
    close(apply(anglesTurn(0, 0, 90), [1, 0, 0]), [0, 1, 0]);
    close(apply(anglesTurn(90, 0, 0), [0, -1, 0]), [0, 0, 1]); // the top tips towards the reader
  });

  it('the normal of a flat drawing faces the reader', () => {
    close(facingNormal([[0, 0, 0], [10, 0, 0], [0, 10, 0], [5, 5, 0]])!, [0, 0, 1]);
    expect(facingNormal([[0, 0, 0], [1, 1, 1], [2, 2, 2]])).toBeNull();
  });
});

describe('Perspective (flat)', () => {
  it('turned past edge-on, the wedges swap so the stereocentre keeps its configuration', async () => {
    const doc = draw('C[C@H](N)C(=O)O');
    const want = meaning(doc);
    const prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), false, host);
    const xs = [...doc.atoms.values()].map((a) => a.x);
    const c = prep.turn.centre[0];
    let left = 0;
    doc.bulk(() => { left = prep.turn.apply(doc, dragTurn(300, 0, false), true); }); // half a turn
    expect(left).toBe(0);
    // seen from behind: left and right change places
    [...doc.atoms.values()].forEach((a, i) => expect(a.x).toBeCloseTo(2 * c - xs[i], 6));
    expect(meaning(doc)).toBe(want);
    expect(await stillMeans(doc, prep.turn, host)).toBe(true);
    // a quarter turn less: still the right way round
    doc.bulk(() => prep.turn.apply(doc, dragTurn(100, 30, false), true));
    expect(meaning(doc)).toBe(want);
  });

  it('keeps going from where a turn left it, and Flatten forgets the depth', async () => {
    const doc = draw('c1ccccc1C');
    let prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), false, null);
    doc.bulk(() => prep.turn.apply(doc, dragTurn(60, 0, false), true));
    const first = [...doc.atoms.values()].map((a) => [a.x, a.y, a.depth!]);
    prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), false, null);
    doc.bulk(() => prep.turn.apply(doc, dragTurn(-60, 0, false), true));
    // turned back: as drawn again (flat)
    [...doc.atoms.values()].forEach((a) => expect(Math.abs(a.depth!)).toBeLessThan(1e-6));
    expect(first.some(([, , d]) => Math.abs(d) > 1)).toBe(true);
    doc.bulk(() => flatten(doc, doc.atoms.keys()));
    for (const a of doc.atoms.values()) { expect(a.depth).toBeUndefined(); expect(a.xyz).toBeUndefined(); }
  });
});

/** BINAP drawn flat, with the distal ring of one naphthalene marked nearer (bold) or further (hashed). */
function binap(mark: 'bold' | 'hash' | null): { doc: Doc; twist: () => number } {
  const doc = draw('c1ccc(cc1)P(c2ccccc2)c3ccc4ccccc4c3-c5c(ccc6ccccc56)P(c7ccccc7)c8ccccc8');
  const rings = new Map<string, number[]>();
  for (const b of doc.bonds.values()) for (const r of ringsThroughBond(doc, b.id)) if (r.length === 6) rings.set([...r].sort((p, q) => p - q).join(), r);
  const ringOf = (id: number) => [...rings.values()].filter((r) => r.includes(id));
  // the axis: the single bond between two naphthalenes, in no ring
  const axis = [...doc.bonds.values()].find((b) => b.order === 1 && !ringsThroughBond(doc, b.id).length && doc.atoms.get(b.a1)!.z === 6 && doc.atoms.get(b.a2)!.z === 6)!;
  const [a, b] = [axis.a1, axis.a2];
  const near = ringOf(b)[0];
  const distal = [...rings.values()].find((r) => r !== near && r.filter((x) => near.includes(x)).length === 2)!;
  if (mark) doc.bulk(() => { for (const bd of doc.bonds.values()) if (distal.includes(bd.a1) && distal.includes(bd.a2)) doc.updateBond(bd.id, { display: mark }); });
  const nbr = (x: number, not: number) => doc.neighbors(x).map((n) => n.id).find((n) => n !== not && doc.neighbors(n).some((m) => m.z === 15))!;
  const p = nbr(a, b), q = nbr(b, a);
  const twist = () => {
    const P = (id: number): V3 => { const t = doc.atoms.get(id)!; return [t.x, t.y, t.depth ?? 0]; };
    const [w, x, y, z] = [P(p), P(a), P(b), P(q)];
    const s = (u: V3, v: V3): V3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
    const cr = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dt = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const b1 = s(x, w), b2 = s(y, x), b3 = s(z, y);
    const n1 = cr(b1, b2), n2 = cr(b2, b3);
    return Math.atan2(dt(cr(n1, n2), b2) / Math.hypot(...b2), dt(n1, n2)) * 180 / Math.PI;
  };
  return { doc, twist };
}

describe('3-D Perspective', () => {
  it('BINAP: bold or hashed bonds on a naphthalene pick its twist, and the turned drawing is the real shape', async () => {
    const twists: number[] = [];
    for (const mark of ['bold', 'hash'] as const) {
      const { doc, twist } = binap(mark);
      const want = meaning(doc);
      const prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), true, host);
      expect(prep.notes).toEqual([]);
      doc.bulk(() => prep.turn.apply(doc, dragTurn(0, 0, false), true));
      const t = twist();
      // the naphthalenes stand at roughly right angles, not flat as drawn
      expect(Math.abs(t)).toBeGreaterThan(55);
      expect(Math.abs(t)).toBeLessThan(125);
      twists.push(t);
      expect(meaning(doc)).toBe(want);
      // the bold ring is nearer the reader than the middle of the structure (or the hashed one further)
      const ring = [...doc.bonds.values()].filter((b) => b.display === mark).flatMap((b) => [b.a1, b.a2]);
      const all = [...doc.atoms.values()].filter((x) => x.z !== 1);
      const mid = all.reduce((s, x) => s + x.depth!, 0) / all.length;
      const ringMid = ring.reduce((s, id) => s + doc.atoms.get(id)!.depth!, 0) / ring.length;
      expect(Math.sign(ringMid - mid)).toBe(mark === 'bold' ? 1 : -1);
    }
    expect(Math.sign(twists[0])).toBe(-Math.sign(twists[1]));
  }, 60000);

  it('keeps every wedged stereocentre at any angle it can show it, and goes on from where it was', async () => {
    const doc = draw('CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O');
    const want = meaning(doc);
    let prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), true, host);
    expect(prep.notes).toEqual([]);
    let shown = 0;
    for (const [dx, dy] of [[0, 0], [80, 20], [-200, 90], [140, -260]]) {
      let left = 0;
      doc.bulk(() => { left = prep.turn.apply(doc, dragTurn(dx, dy, false), true); });
      if (!left && meaning(doc) === want) shown++;
    }
    expect(shown).toBeGreaterThanOrEqual(3);
    // turned: the next turn goes on from these positions (no jump back to a fresh fit)
    doc.bulk(() => prep.turn.apply(doc, dragTurn(30, 10, false), true));
    prep.turn.remember(doc);
    const at = [...doc.atoms.values()].filter((a) => a.z !== 1).map((a) => [a.id, a.x, a.y]);
    prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), true, host);
    doc.bulk(() => prep.turn.apply(doc, dragTurn(0, 0, false), true));
    for (const [id, x, y] of at) {
      expect(doc.atoms.get(id)!.x).toBeCloseTo(x, 3);
      expect(doc.atoms.get(id)!.y).toBeCloseTo(y, 3);
    }
  }, 60000);

  it('a structure with an R group has no 3-D shape: it is turned flat, with a note', async () => {
    const doc = draw('CC(C)C');
    const first = [...doc.atoms.values()][0];
    doc.bulk(() => doc.updateAtom(first.id, { label: 'R' }));
    const prep = await prepareTurn(doc, structuresOf(doc, doc.atoms.keys()), true, host);
    expect(prep.notes.length).toBe(1);
    expect(prep.turn.pieces[0].solid).toBe(false);
  });
});

describe('choosing the shape', () => {
  it('a mirror image is never taken for a wedged stereocentre', () => {
    const doc = draw('C[C@H](N)C(=O)O');
    const ex = toMolfile(doc, doc.atoms.keys());
    const cues = depthCues(doc, ex);
    const r = buildPose(ex.molblock, cues, doc.style.bondLength);
    expect('pose' in r).toBe(true);
    if (!('pose' in r)) return;
    const nb = neighbours(r.pose.pts.length, r.pose.bonds);
    const M = drawingFrame(r.pose.pts, 10);
    expect(keepsStereo(M, cues, nb, doc.style.bondLength)).toBe(true);
    expect(keepsStereo(mirrored(M), cues, nb, doc.style.bondLength)).toBe(false);
    // offered in either hand, the right one is taken
    const pick = choosePose([mirrored(r.pose.pts)], r.pose.bonds, cues, doc.style.bondLength);
    expect('k' in pick && pick.mirror).toBe(true);
  });
});
