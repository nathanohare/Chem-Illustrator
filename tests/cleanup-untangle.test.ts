// @vitest-environment jsdom
// Clean Up Structure untangles cages and bridged polycycles drawn (or pasted) with bonds crossing,
// keeps every stereocentre, and offers other layouts and turns when pressed again.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { addMolfile, toMolfile } from '../src/chem/molfile';
import { cleanUpOptions, cleanUpWays, looksTangled, turnOption } from '../src/chem/cleanup';
import { countCrossings, untangleSystem } from '../src/chem/untangle';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

// the editor draws on the next frame; there is no canvas to draw on here
window.requestAnimationFrame = () => 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
}, 30000);

const ASPIDOPHYTINE = 'CN1[C@@H]2C=C[C@@]34CCCN5[C@]3([C@]2(CC5)C6=C1C(=C(C=C6)OC)OC)OC(=O)C4';
const MORPHINE = 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O';

/** A structure as the chemistry engine lays it out from SMILES (CoordGen), the way a paste does. */
function pasted(smi: string): Doc {
  const m = RDKit.get_mol(smi);
  m.set_new_coords(true);
  const doc = new Doc();
  doc.bulk(() => addMolfile(doc, m.get_molblock(), 200, 200));
  m.delete();
  return doc;
}
const smilesOf = (doc: Doc) => {
  const m = RDKit.get_mol(toMolfile(doc, doc.atoms.keys()).molblock);
  try { return m.get_smiles(); } finally { m.delete(); }
};
const canonical = (smi: string) => { const m = RDKit.get_mol(smi); try { return m.get_smiles(); } finally { m.delete(); } };
const crossings = (doc: Doc) => {
  const L = doc.style.bondLength;
  const pos = new Map([...doc.atoms.values()].map((a) => [a.id, { x: a.x / L, y: a.y / L }]));
  return countCrossings([...doc.bonds.values()].map((b) => [b.a1, b.a2]), pos);
};
const apply = (doc: Doc, f: Set<number>) => {
  const w = cleanUpWays(doc, f)[0];
  doc.bulk(() => {
    for (const [id, p] of w.moves) doc.updateAtom(id, { x: p.x, y: p.y });
    for (const [id, d] of w.displays) doc.updateBond(id, { display: d });
  });
};
const centre = (doc: Doc) => {
  const a = [...doc.atoms.values()];
  return { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length };
};

describe('Clean Up untangles cages', () => {
  it('aspidophytine pasted from SMILES: far fewer crossing bonds, same molecule, same place', () => {
    const doc = pasted(ASPIDOPHYTINE);
    const before = crossings(doc);
    expect(before).toBeGreaterThanOrEqual(4);
    expect(looksTangled(doc, doc.fragments()[0])).toBe(true);
    const c0 = centre(doc);
    apply(doc, doc.fragments()[0]);
    expect(crossings(doc)).toBeLessThanOrEqual(1);
    expect(smilesOf(doc)).toBe(canonical(ASPIDOPHYTINE));
    const c1 = centre(doc);
    expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeLessThan(1e-6);
    // nothing on top of anything else
    const atoms = [...doc.atoms.values()];
    const L = doc.style.bondLength;
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) expect(Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y)).toBeGreaterThan(L * 0.35);
  });

  it('morphine: its usual one crossing at most, a layout with none on offer, its five stereocentres kept', () => {
    const doc = pasted(MORPHINE);
    expect(crossings(doc)).toBeGreaterThan(0);
    const L = doc.style.bondLength;
    const opts = cleanUpOptions(doc, doc.fragments()[0]);
    const crossingsOf = (o: (typeof opts)[number]) => countCrossings([...doc.bonds.values()].map((b) => [b.a1, b.a2]), new Map([...o.pos].map(([i, p]) => [i, { x: p.x / L, y: p.y / L }])));
    expect(opts.some((o) => crossingsOf(o) === 0)).toBe(true);
    apply(doc, doc.fragments()[0]);
    expect(crossings(doc)).toBeLessThanOrEqual(1);
    expect(smilesOf(doc)).toBe(canonical(MORPHINE));
  });

  it('lays a ring system down as regular polygons with a bridge across (norbornane drawn tangled)', () => {
    // norbornane: bridgeheads 0 and 3; ring atoms 0-5 and bridge atom 6, given as two rings
    const nbr = [[1, 5, 6], [0, 2], [1, 3], [2, 4, 6], [3, 5], [4, 0], [0, 3]];
    const ways = untangleSystem({ nbr, atoms: [0, 1, 2, 3, 4, 5, 6], rings: [[0, 1, 2, 3, 6], [0, 6, 3, 4, 5]], seeds: [] });
    expect(ways.length).toBeGreaterThan(0);
    expect(ways[0].crossings).toBe(0);
    for (const w of ways) expect(w.pos.size).toBe(7);
  });

  it('leaves a cleanly drawn bridged structure alone (camphor, cubane)', () => {
    for (const smi of ['CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2', 'C12C3C4C1C5C2C3C45']) {
      const doc = pasted(smi);
      const was = crossings(doc);
      apply(doc, doc.fragments()[0]);
      expect(crossings(doc)).toBeLessThanOrEqual(was);
      expect(smilesOf(doc)).toBe(canonical(smi));
    }
  });
});

describe('Clean Up options', () => {
  it('offers different layouts of a cage, then turns and flips, all the same molecule', () => {
    const doc = pasted(ASPIDOPHYTINE);
    const f = doc.fragments()[0];
    const opts = cleanUpOptions(doc, f);
    expect(opts.length).toBeGreaterThan(3);
    expect(opts[0].label).toBe('Best fit');
    expect(opts.some((o) => o.label.startsWith('Layout'))).toBe(true);
    expect(opts.some((o) => o.label.startsWith('Flipped'))).toBe(true);
    for (const o of opts) {
      const copy = pasted(ASPIDOPHYTINE);
      copy.bulk(() => {
        for (const [id, p] of o.pos) copy.updateAtom(id, { x: p.x, y: p.y });
        for (const [id, d] of o.displays) copy.updateBond(id, { display: d });
      });
      expect(smilesOf(copy), o.label).toBe(canonical(ASPIDOPHYTINE));
    }
  });

  it('a cyclohexane ring turned 60° is the same picture, so it is offered once', () => {
    const doc = pasted('C1CCCCC1');
    const opts = cleanUpOptions(doc, doc.fragments()[0]);
    const turned = opts.filter((o) => o.label.startsWith('Turned'));
    // turned 30° each way look alike, and so do the flips
    expect(turned.length).toBe(1);
    expect(opts.length).toBe(2);
  });

  it('flipping turns wedges over and moves atoms to the other side', () => {
    const doc = pasted('C[C@H](N)C(=O)O');
    const o = cleanUpOptions(doc, doc.fragments()[0])[0];
    const flipped = turnOption(o, 0, true);
    for (const [id, d] of o.displays) {
      const want = d === 'wedge' ? 'hashWedge' : d === 'hashWedge' ? 'wedge' : d;
      expect(flipped.displays.get(id)).toBe(want);
    }
    const ids = [...o.pos.keys()];
    const cx = ids.reduce((s, id) => s + o.pos.get(id)!.x, 0) / ids.length;
    for (const id of ids) expect(flipped.pos.get(id)!.x - cx).toBeCloseTo(cx - o.pos.get(id)!.x, 6);
  });
});

describe('Clean Up pressed again', () => {
  const editorFor = (doc: Doc) => {
    const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
    const host = document.createElement('div');
    host.append(scene, overlay);
    document.body.append(host);
    const ed = new Editor(doc, new Renderer(scene, overlay), host);
    ed.paused = true;
    return ed;
  };

  it('steps through the other ways, keeping the same molecule, then comes round again', () => {
    const doc = pasted(ASPIDOPHYTINE);
    const ed = editorFor(doc);
    ed.sel.atoms = new Set(doc.atoms.keys());
    const first = ed.cleanUp();
    expect(first).not.toBe(false);
    if (!first) throw new Error('nothing cleaned up');
    expect(first.k).toBe(0);
    const at0 = new Map([...doc.atoms.values()].map((a) => [a.id, { x: a.x, y: a.y }]));
    const second = ed.cleanUp();
    expect(second && second.k).toBe(1);
    expect([...doc.atoms.values()].some((a) => Math.hypot(a.x - at0.get(a.id)!.x, a.y - at0.get(a.id)!.y) > 1)).toBe(true);
    expect(smilesOf(doc)).toBe(canonical(ASPIDOPHYTINE));
    // all the way round brings back the first
    for (let i = 2; i <= first.of; i++) ed.cleanUp();
    for (const a of doc.atoms.values()) expect(Math.hypot(a.x - at0.get(a.id)!.x, a.y - at0.get(a.id)!.y)).toBeLessThan(1e-6);
  });

  it('with nothing selected, a tidy drawing is left alone', () => {
    const doc = pasted('C1CCCCC1');
    const ed = editorFor(doc);
    ed.cleanUp();
    const at = new Map([...doc.atoms.values()].map((a) => [a.id, { x: a.x, y: a.y }]));
    expect(ed.cleanUp()).toBe(false);
    for (const a of doc.atoms.values()) expect(Math.hypot(a.x - at.get(a.id)!.x, a.y - at.get(a.id)!.y)).toBeLessThan(1e-6);
  });
});
