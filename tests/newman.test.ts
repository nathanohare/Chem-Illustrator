// @vitest-environment jsdom
// Newman and sawhorse projections: the view down a bond keeps the drawn stereocentres the right
// way round, groups are named and ranked by size, conformers that look the same down the bond are
// one picture, and a projection keeps its numbers and its tie to the structure through a CDXML
// file (which Word, PowerPoint and Excel files carry too) and through copy and paste.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { Resources } from 'openchemlib';
import { Doc } from '../src/model';
import { addMolfile, toMolfile } from '../src/chem/molfile';
import { searchModel } from '../src/chem/model3d-build';
import { newmanConformers, newmanView, sizeRanks, groupLabel, neighbours, type NewmanMol } from '../src/chem/newman';
import { DEFAULT_NEWMAN_PREFS, NEWMAN_LOOK, captionText, newmanCentre, newmanFrameOf, parseNewmanPrefs, putMark, putNewman, refitNewman, reversedLabel, structureKey, type NewmanData } from '../src/design/newman';
import { plainMeasure } from '../src/chem/reaction';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { remapFrames } from '../src/io/remap-refs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  Resources.registerFromNodejs();
}, 30000);

/** A structure drawn from SMILES, with its molfile and a conformer search. */
function drawn(smiles: string) {
  const m = RDKit.get_mol(smiles);
  const doc = new Doc();
  doc.bulk(() => addMolfile(doc, m.get_molblock(), 200, 200));
  m.delete();
  const ex = toMolfile(doc, doc.atoms.keys());
  const model = searchModel(ex.molblock, { starts: 60, window: 6, rmsd: 0.3 })!;
  return { doc, ex, model };
}

/** Index of the atom in a model with this element bonded to `to` and not `not`, for picking groups. */
const cw = (from: number, to: number) => ((to - from) % 360 + 360) % 360;

describe('the view down a bond', () => {
  it('puts the groups the right way round (a hand-built geometry)', () => {
    // front atom at the middle, back atom straight away from the viewer (+z), one front group up
    // and one to the viewer's right, which, looking along +z with y up, is −x
    const mol: NewmanMol = { atoms: [{ z: 6, charge: 0 }, { z: 6, charge: 0 }, { z: 9, charge: 0 }, { z: 17, charge: 0 }, { z: 35, charge: 0 }, { z: 1, charge: 0 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }, { a: 0, b: 3, order: 1 }, { a: 1, b: 4, order: 1 }, { a: 1, b: 5, order: 1 }] };
    const xyz = [0, 0, 0, 0, 0, 1.5, 0, 1, -0.4, -1, 0, -0.4, 0, -1, 1.9, 0, 1, 1.9];
    const v = newmanView(mol, xyz, 0, 1);
    const angle = (atom: number) => [...v.front, ...v.back].find((g) => g.atom === atom)!.angle;
    // Cl (the largest front group) is up; F is a quarter turn anticlockwise from it
    expect(angle(3)).toBeCloseTo(0, 5);
    expect(angle(2)).toBeCloseTo(270, 5);
    expect(angle(4)).toBeCloseTo(90, 5);
    expect(angle(5)).toBeCloseTo(270, 5);
  });

  it('keeps (R)-butan-2-ol R: looking from C2 to C3, OH → CH3 → H runs clockwise', () => {
    expect(RDKit.get_mol('CC[C@@H](C)O').get_stereo_tags()).toContain('(R)');
    const { model } = drawn('CC[C@@H](C)O');
    // molfile atoms: 0 C, 1 C3, 2 C2, 3 CH3, 4 O
    for (const c of model.conformers) {
      const v = newmanView(model, c.xyz, 2, 1);
      const oh = v.front.find((g) => g.label === 'OH')!, me = v.front.find((g) => g.label === 'CH3')!, h = v.front.find((g) => g.label === 'H')!;
      expect(cw(oh.angle, me.angle)).toBeLessThan(cw(oh.angle, h.angle));
    }
    // and its mirror image the other way
    const s = drawn('CC[C@H](C)O').model;
    const v = newmanView(s, s.conformers[0].xyz, 2, 1);
    const oh = v.front.find((g) => g.label === 'OH')!, me = v.front.find((g) => g.label === 'CH3')!, h = v.front.find((g) => g.label === 'H')!;
    expect(cw(oh.angle, me.angle)).toBeGreaterThan(cw(oh.angle, h.angle));
  }, 60000);

  it('names the groups and ranks them by size', () => {
    const { model } = drawn('C[C@@H](O)[C@H](C)c1ccccc1');
    const nb = neighbours(model);
    expect(groupLabel(model, 0, 1, nb)).toBe('CH3');
    const v = newmanView(model, model.conformers[0].xyz, 1, 3);
    expect(v.front.map((g) => g.label).sort()).toEqual(['CH3', 'H', 'OH']);
    expect(v.back.map((g) => g.label).sort()).toEqual(['CH3', 'H', 'Ph']);
    // Ph > CH3 > H on the back atom; CH3 > OH > H on the front
    const rank = (gs: typeof v.back, label: string) => sizeRanks(gs)[gs.findIndex((g) => g.label === label)];
    expect([rank(v.back, 'Ph'), rank(v.back, 'CH3'), rank(v.back, 'H')]).toEqual([0, 1, 2]);
    expect([rank(v.front, 'CH3'), rank(v.front, 'OH'), rank(v.front, 'H')]).toEqual([0, 1, 2]);
    // the largest front group is straight up
    expect(v.front.find((g) => g.label === 'CH3')!.angle).toBeCloseTo(0, 5);
  }, 60000);

  it('writes labels the other way round on the left', () => {
    expect(reversedLabel('CH3')).toBe('H3C');
    expect(reversedLabel('CO2Me')).toBe('MeO2C');
    expect(reversedLabel('OH')).toBe('HO');
    expect(reversedLabel('H')).toBe('H');
  });

  it('keeps each picture down the bond once: butane has anti and two gauche', () => {
    const { model } = drawn('CCCC');
    const pics = newmanConformers(model, model.conformers, 1, 2);
    expect(pics.length).toBe(3);
    expect(pics[0].energy).toBe(0);
    expect(Math.abs(Math.abs(pics[0].view.dihedral) - 180)).toBeLessThan(15);
    for (const p of pics.slice(1)) {
      expect(Math.abs(Math.abs(p.view.dihedral) - 60)).toBeLessThan(15);
      expect(p.energy!).toBeGreaterThan(0.3);
      expect(p.energy!).toBeLessThan(1.5);
    }
    const total = pics.reduce((s, p) => s + (p.population ?? 0), 0);
    expect(total).toBeCloseTo(1, 5);
  }, 60000);
});

describe('a projection on the page', () => {
  /** A butane drawn, and its most stable projection put beside it, linked, with its mark. */
  function placed() {
    const { doc, ex, model } = drawn('CCCC');
    const ids = [...doc.atoms.keys()];
    const [front, back] = [ex.map[1], ex.map[2]];
    const pic = newmanConformers(model, model.conformers, 1, 2)[0];
    const d: NewmanData = { kind: 'newman', front: pic.view.front, back: pic.view.back, turn: 0, conformer: 0, source: 'stable', look: structuredClone(NEWMAN_LOOK), link: { atoms: ids, front, back, key: structureKey(doc, ids) } };
    const m = plainMeasure(doc);
    let frame = 0;
    doc.edit('Newman', () => {
      d.mark = putMark(doc, d, '#1a56db');
      frame = putNewman(doc, m, d, { x: 400, y: 200 });
    });
    return { doc, frame, front, back, m };
  }

  it('is a circle, six bonds and two red CH3 labels in a frame that knows its parts', () => {
    const { doc, frame } = placed();
    const f = doc.shapes.get(frame)!.frame!;
    expect(f.shapes.map((id) => doc.shapes.get(id)!.kind).sort()).toEqual(['line', 'line', 'line', 'line', 'line', 'line', 'oval']);
    const caps = f.captions.map((id) => doc.captions.get(id)!);
    expect(caps.map(captionText).filter((t) => /C/.test(t)).length).toBe(2);
    for (const c of caps) if (/C/.test(captionText(c))) expect(c.runs[0].color).toBe('#e00000');
    expect(newmanFrameOf(doc, 'caption', f.captions[0])).toBe(frame);
    const c = newmanCentre(doc, doc.shapes.get(frame)!)!;
    expect(c.x).toBeCloseTo(400, 5);
    expect(c.y).toBeCloseTo(200, 5);
  }, 60000);

  it('moves its viewing mark with the structure, and asks to be worked out again when the structure changes', () => {
    const { doc, frame, front } = placed();
    const markBefore = doc.shapes.get(frame)!.newman!.mark!;
    const arrow0 = doc.arrows.get(markBefore.arrows[0])!;
    // the structure moved: the mark is drawn again at the bond; nothing to work out
    let stale: number[] = [];
    doc.edit('Move', () => {
      for (const a of [...doc.atoms.values()]) doc.updateAtom(a.id, { x: a.x + 30, y: a.y });
    });
    doc.edit('check', () => { stale = refitNewman(doc, new Map([...doc.atoms.keys()].map((id) => ['a' + id, null]))); });
    const mark = doc.shapes.get(frame)!.newman!.mark!;
    const arrow1 = doc.arrows.get(mark.arrows[0])!;
    expect(arrow1.head.x - arrow0.head.x).toBeCloseTo(30, 5);
    expect(stale).toEqual([]);
    // an atom turned into N: it is worked out again
    doc.edit('Make N', () => doc.updateAtom(front, { z: 7 }));
    doc.edit('check', () => { stale = refitNewman(doc, new Map([['a' + front, null]])); });
    expect(stale).toEqual([frame]);
  }, 60000);

  it('lets go of a bond that is gone', () => {
    const { doc, frame, front, back } = placed();
    const bond = [...doc.bonds.values()].find((b) => (b.a1 === front && b.a2 === back) || (b.a1 === back && b.a2 === front))!;
    doc.edit('Delete', () => doc.removeBond(bond.id));
    doc.edit('check', () => refitNewman(doc, new Map([['b' + bond.id, null]])));
    expect(doc.shapes.get(frame)!.newman!.link).toBeUndefined();
  }, 60000);

  it('keeps its numbers, bond and mark through a CDXML file', () => {
    const { doc, frame } = placed();
    const back = readCdxml(writeCdxml(doc)).doc;
    const s = [...back.shapes.values()].find((x) => x.newman)!;
    expect(s).toBeTruthy();
    const d = s.newman!;
    expect(d.front.length).toBe(3);
    expect(d.look.ranks[0].color).toBe('#e00000');
    expect(s.frame!.captions.length).toBe(doc.shapes.get(frame)!.frame!.captions.length);
    // the bond found again where it was drawn, and the mark by its lines
    expect(d.link).toBeTruthy();
    expect(back.atoms.has(d.link!.front) && back.atoms.has(d.link!.back)).toBe(true);
    expect(d.link!.key).toBe(structureKey(back, back.fragmentOf(d.link!.front)));
    expect(d.mark?.arrows.every((x) => back.arrows.has(x))).toBe(true);
    expect(d.mark?.shapes.every((x) => back.shapes.has(x))).toBe(true);
  }, 60000);

  it('follows a copy of its structure, and lets go when copied alone', () => {
    const { doc, frame } = placed();
    const d = doc.shapes.get(frame)!.newman!;
    // copy everything: new ids for every atom, the frame and the mark
    const atoms = new Map<number, number>(), shapes = new Map<number, number>(), arrows = new Map<number, number>(), captions = new Map<number, number>();
    doc.edit('Copy', () => {
      for (const a of [...doc.atoms.values()]) { const { id, ...rest } = a; atoms.set(id, doc.addAtom(rest.x, rest.y + 200).id); }
      for (const b of [...doc.bonds.values()]) doc.addBond(atoms.get(b.a1)!, atoms.get(b.a2)!, b.order);
      for (const r of d.mark!.arrows) { const { id: _i, ...rest } = doc.arrows.get(r)!; arrows.set(r, doc.addArrow(rest).id); }
      for (const x of d.mark!.shapes) { const { id: _i, ...rest } = doc.shapes.get(x)!; shapes.set(x, doc.addShape(rest).id); }
      const { id: _i, ...rest } = doc.shapes.get(frame)!;
      shapes.set(frame, doc.addShape(rest).id);
      remapFrames(doc, { atoms, captions, shapes, arrows });
    });
    const copy = doc.shapes.get(shapes.get(frame)!)!.newman!;
    expect(copy.link!.front).toBe(atoms.get(d.link!.front));
    expect(copy.mark!.arrows[0]).toBe(arrows.get(d.mark!.arrows[0]));
    // alone
    const alone = new Map<number, number>();
    doc.edit('Copy alone', () => {
      const { id: _i, ...rest } = doc.shapes.get(frame)!;
      alone.set(frame, doc.addShape(rest).id);
      remapFrames(doc, { atoms: new Map(), captions: new Map(), shapes: alone, arrows: new Map() });
    });
    expect(doc.shapes.get(alone.get(frame)!)!.newman!.link).toBeUndefined();
  }, 60000);
});

describe('Newman settings', () => {
  it('reads back what was kept and fills in the rest', () => {
    expect(parseNewmanPrefs(null)).toEqual(DEFAULT_NEWMAN_PREFS);
    const p = parseNewmanPrefs({ look: { radius: 9, ranks: [{ color: '#00ff00', bold: true }, 'junk'] }, kind: 'sawhorse', chart: { unit: 'kJ/mol', names: 'nope' } });
    expect(p.look.radius).toBe(2);
    expect(p.look.ranks[0]).toEqual({ color: '#00ff00', bold: true, italic: false, bond: false });
    expect(p.look.ranks[1]).toEqual(NEWMAN_LOOK.ranks[1]);
    expect(p.kind).toBe('sawhorse');
    expect(p.chart.unit).toBe('kJ/mol');
    expect(p.chart.names).toBe('textbook');
  });
});
