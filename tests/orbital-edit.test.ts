// @vitest-environment jsdom
//
// Orbitals can be changed after they are put in: each part remembers how its orbital was asked for
// (Shape.orb), so the orbital is read back (with the angle, size and place its shapes have now)
// and drawn again with new settings, on the same atom and in the same group. The settings are
// kept through CDXML and PowerPoint files. A single lobe goes in the most open space round an atom.

import { describe, it, expect } from 'vitest';
import { Doc, type Shape } from '../src/model';
import { Editor } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';
import { angleOfDir, openDirection, orbitalAtom, orbitalParts, orbitalShapes, orbitalsAmong, putOrbital, readAngle, readOrbital, redrawOrbital, takenDirections, type OrbitalSpec } from '../src/chem/orbitals';
import { shapeAxis } from '../src/chem/pins';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml, ORBITAL_TAG, orbitalTag } from '../src/io/cdxml';
import { splitSlide } from '../src/deck/split-slide';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
import { boxOf } from '../src/objects';
import { ACS_1996 } from '../src/style';

window.requestAnimationFrame = () => 0;

function editor(doc: Doc): Editor {
  const scene = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  const host = document.createElement('div');
  host.append(scene, overlay);
  document.body.append(host);
  const ed = new Editor(doc, new Renderer(scene, overlay), host);
  ed.paused = true;
  ed.setTool('select');
  return ed;
}

/** Two carbons side by side (no labels to measure). */
function ethane() {
  const doc = new Doc();
  doc.style = { ...ACS_1996 };
  const L = doc.style.bondLength;
  const { a, b } = doc.edit('Build', () => {
    const a = doc.addAtom(100, 100).id, b = doc.addAtom(100 + L, 100).id;
    doc.addBond(a, b);
    return { a, b };
  });
  return { doc, a, b, L };
}

const tip = (s: Shape) => { const ax = shapeAxis(s)!, h = Math.abs(s.y2 - s.y1) / 2; return { x: (s.x1 + s.x2) / 2 - ax.x * h, y: (s.y1 + s.y2) / 2 - ax.y * h }; };

describe('an orbital remembers how it was asked for', () => {
  it('each part is tagged with the type, phases and its place in the orbital', () => {
    const parts = orbitalShapes({ kind: 'sp3', look: 'colour', angle: 30, size: 20, flip: true }, { x: 0, y: 0 });
    expect(parts.map((p) => p.orb)).toEqual([
      { kind: 'sp3', look: 'colour', flip: true, part: 0 },
      { kind: 'sp3', look: 'colour', flip: true, part: 1 },
    ]);
  });

  const kinds: OrbitalSpec[] = [
    { kind: 'p', look: 'shaded', angle: 30, size: 22 },
    { kind: 'sp3', look: 'outline', angle: 200, size: 18 },
    { kind: 'sp', look: 'colour', angle: 90, size: 25, flip: true },
    { kind: 'd', look: 'shaded', angle: 10, size: 20 },
    { kind: 'dz2', look: 'shaded', angle: 0, size: 20 },
    { kind: 's', look: 'shaded', angle: 0, size: 20 },
    { kind: 'lobe', look: 'shaded', angle: 135, size: 16 },
  ];
  for (const spec of kinds) {
    it(`is read back from its parts: ${spec.kind}`, () => {
      const at = { x: 50, y: 70 };
      const parts = orbitalShapes(spec, at).map((s, i) => ({ ...s, id: i + 1 }) as Shape);
      const got = readOrbital(parts)!;
      expect(got.spec.kind).toBe(spec.kind);
      expect(got.spec.look).toBe(spec.look);
      expect(!!got.spec.flip).toBe(!!spec.flip);
      expect(got.spec.size).toBeCloseTo(spec.size, 6);
      expect(got.spec.angle).toBeCloseTo(spec.angle, 6);
      expect(got.at.x).toBeCloseTo(at.x, 6);
      expect(got.at.y).toBeCloseTo(at.y, 6);
    });
  }

  it('shapes that are not an orbital are not read as one', () => {
    expect(readOrbital([{ id: 1, kind: 'oval', x1: 0, y1: 0, x2: 10, y2: 10 }])).toBeNull();
  });
});

describe('an orbital on an atom', () => {
  it('is put in grouped and stuck to its atom', () => {
    const { doc, a } = ethane();
    const ids = doc.edit('Orbital', () => putOrbital(doc, { kind: 'p', look: 'shaded', angle: 0, size: 20 }, doc.atoms.get(a)!, a));
    const parts = ids.map((id) => doc.shapes.get(id)!);
    expect(parts.every((s) => s.grp !== undefined && s.grp === parts[0].grp)).toBe(true);
    expect(parts.every((s) => s.pin?.on === 'atom' && s.pin.ref[0] === a)).toBe(true);
    expect(orbitalAtom(doc, parts)).toBe(a);
    expect(orbitalParts(doc, ids[0]).map((s) => s.id).sort()).toEqual([...ids].sort());
  });

  it('keeps the angle it was turned to when read back', () => {
    const { doc, a, b } = ethane();
    const ids = doc.edit('Orbital', () => putOrbital(doc, { kind: 'p', look: 'shaded', angle: 0, size: 20 }, doc.atoms.get(a)!, a));
    const ed = editor(doc);
    ed.sel.atoms.add(a); ed.sel.atoms.add(b);
    ed.sel.bonds.add([...doc.bonds.keys()][0]);
    ed.rotateBy(90);
    const got = readOrbital(ids.map((id) => doc.shapes.get(id)!))!;
    expect(got.spec.angle).toBeCloseTo(90, 4);
    const at = doc.atoms.get(a)!;
    expect(got.at.x).toBeCloseTo(at.x, 4);
    expect(got.at.y).toBeCloseTo(at.y, 4);
  });

  it('is drawn again with new settings: same atom, group and angle', () => {
    const { doc, a } = ethane();
    const ids = doc.edit('Orbital', () => putOrbital(doc, { kind: 'p', look: 'shaded', angle: 60, size: 20 }, doc.atoms.get(a)!, a));
    const grp = doc.shapes.get(ids[0])!.grp;
    const parts = ids.map((id) => doc.shapes.get(id)!);
    const now = readOrbital(parts)!;
    const made = doc.edit('Change', () => redrawOrbital(doc, parts, { ...now.spec, kind: 'sp3', look: 'colour' }));
    expect(ids.some((id) => doc.shapes.has(id))).toBe(false);
    const fresh = made.map((id) => doc.shapes.get(id)!);
    expect(fresh.every((s) => s.grp === grp && s.pin?.ref[0] === a && s.orb?.kind === 'sp3' && s.orb.look === 'colour')).toBe(true);
    const back = readOrbital(fresh)!;
    expect(back.spec.angle).toBeCloseTo(60, 6);
    // the lobes' points are on the atom
    const at = doc.atoms.get(a)!;
    for (const s of fresh) { expect(tip(s).x).toBeCloseTo(at.x, 6); expect(tip(s).y).toBeCloseTo(at.y, 6); }
  });

  it('a p orbital becomes a single lobe and back again', () => {
    const { doc, a } = ethane();
    const ids = doc.edit('Orbital', () => putOrbital(doc, { kind: 'p', look: 'shaded', angle: 0, size: 20 }, doc.atoms.get(a)!, a));
    const one = doc.edit('Change', () => redrawOrbital(doc, ids.map((id) => doc.shapes.get(id)!), { kind: 'lobe', look: 'shaded', angle: 0, size: 20 }));
    expect(one.length).toBe(1);
    const two = doc.edit('Change', () => redrawOrbital(doc, orbitalParts(doc, one[0]), { kind: 'p', look: 'shaded', angle: 0, size: 20 }));
    expect(two.length).toBe(2);
    expect(orbitalsAmong(doc, two).length).toBe(1);
  });

  it('several orbitals selected are listed once each', () => {
    const { doc, a, b } = ethane();
    const ids = doc.edit('Orbitals', () => [
      ...putOrbital(doc, { kind: 'p', look: 'shaded', angle: 0, size: 20 }, doc.atoms.get(a)!, a),
      ...putOrbital(doc, { kind: 'p', look: 'shaded', angle: 0, size: 20 }, doc.atoms.get(b)!, b),
    ]);
    expect(orbitalsAmong(doc, ids).length).toBe(2);
  });
});

describe('the Pointing box', () => {
  it('reads Auto, a blank or a number of degrees', () => {
    expect(readAngle('Auto')).toBe('auto');
    expect(readAngle('')).toBe('auto');
    expect(readAngle('90')).toBe(90);
    expect(readAngle('-90°')).toBe(270);
    expect(readAngle('370')).toBe(10);
  });
});

describe('the single-lobe button', () => {
  it('finds the most open space between bonds', () => {
    expect(openDirection([])).toEqual({ x: 0, y: -1 });
    // one bond to the right: the lobe points left
    const d = openDirection([{ x: 1, y: 0 }]);
    expect(d.x).toBeCloseTo(-1, 6);
    expect(d.y).toBeCloseTo(0, 6);
    // a bent atom with bonds down-left and down-right: straight up
    expect(angleOfDir(openDirection([{ x: -0.87, y: 0.5 }, { x: 0.87, y: 0.5 }]))).toBeCloseTo(0, 4);
  });

  it('puts a lobe on a clicked atom, its point on the atom, away from the bond, stuck to it', () => {
    const { doc, a } = ethane();
    const ed = editor(doc);
    ed.setTool('sym-lobe');
    (ed as unknown as { placeSymbol(k: string, h: unknown, p: unknown, aim?: unknown): void }).placeSymbol('Lobe', { kind: 'atom', id: a }, doc.atoms.get(a)!);
    const lobes = [...doc.shapes.values()].filter((s) => s.orb?.kind === 'lobe');
    expect(lobes.length).toBe(1);
    const s = lobes[0];
    // the bond goes right, so the lobe points left
    expect(s.rot).toBeCloseTo(270, 4);
    expect(s.pin?.ref[0]).toBe(a);
    const at = doc.atoms.get(a)!;
    expect(tip(s).x).toBeCloseTo(at.x, 6);
    expect(tip(s).y).toBeCloseTo(at.y, 6);
    // a second lobe keeps clear of the first and of the bond
    (ed as unknown as { placeSymbol(k: string, h: unknown, p: unknown): void }).placeSymbol('Lobe', { kind: 'atom', id: a }, at);
    const second = [...doc.shapes.values()].filter((x) => x.orb?.kind === 'lobe').find((x) => x.id !== s.id)!;
    const r = second.rot ?? 0;
    expect(Math.min(Math.abs(r - 270), 360 - Math.abs(r - 270))).toBeGreaterThan(60);
    expect(Math.min(Math.abs(r - 90), 360 - Math.abs(r - 90))).toBeGreaterThan(60);
    expect(takenDirections(doc, a).length).toBe(3);
  });

  it('dragged round its atom, points at the pointer', () => {
    const { doc, a } = ethane();
    const ed = editor(doc);
    ed.setTool('sym-lobe');
    (ed as unknown as { placeSymbol(k: string, h: unknown, p: unknown, aim?: unknown): void }).placeSymbol('Lobe', { kind: 'atom', id: a }, doc.atoms.get(a)!, { x: 0, y: 1 });
    const s = [...doc.shapes.values()].find((x) => x.orb?.kind === 'lobe')!;
    expect(s.rot).toBeCloseTo(180, 4);
  });

  it('uses the phases and length last picked', () => {
    const { doc, a, L } = ethane();
    const ed = editor(doc);
    ed.lobeLook = () => ({ look: 'colour', size: 2, flip: false });
    (ed as unknown as { placeSymbol(k: string, h: unknown, p: unknown): void }).placeSymbol('Lobe', { kind: 'atom', id: a }, doc.atoms.get(a)!);
    const s = [...doc.shapes.values()].find((x) => x.orb?.kind === 'lobe')!;
    expect(s.orb?.look).toBe('colour');
    expect(Math.abs(s.y2 - s.y1)).toBeCloseTo(2 * L, 6);
  });
});

describe('orbital settings in files', () => {
  it('CDXML keeps them on lobes and on the sphere of an s orbital, still stuck to the atom', () => {
    const { doc, a, b } = ethane();
    doc.edit('Orbitals', () => {
      putOrbital(doc, { kind: 'sp2', look: 'colour', angle: 45, size: 20, flip: true }, doc.atoms.get(a)!, a);
      putOrbital(doc, { kind: 's', look: 'shaded', angle: 0, size: 20 }, doc.atoms.get(b)!, b);
    });
    const xml = writeCdxml(doc);
    expect(xml).toContain(ORBITAL_TAG);
    const { doc: back } = readCdxml(xml);
    const tagged = [...back.shapes.values()].filter((s) => s.orb);
    expect(tagged.length).toBe(3);
    const list = orbitalsAmong(back, tagged.map((s) => s.id));
    expect(list.length).toBe(2);
    const sp2 = list.map((p) => readOrbital(p)!).find((o) => o.spec.kind === 'sp2')!;
    expect(sp2.spec.look).toBe('colour');
    expect(sp2.spec.flip).toBe(true);
    expect(sp2.spec.angle).toBeCloseTo(45, 3);
    expect(sp2.spec.size).toBeCloseTo(20, 3);
    // the s orbital's sphere is stuck to its atom again
    const sphere = tagged.find((s) => s.kind === 'oval')!;
    expect(sphere.orb?.kind).toBe('s');
    expect(sphere.pin?.on).toBe('atom');
  });

  it('a damaged tag is ignored', () => {
    expect(orbitalTag('{"kind":"p"}')).toBeUndefined();
    expect(orbitalTag('not json')).toBeUndefined();
    expect(orbitalTag('{"kind":"p","look":"shaded","part":1,"colours":["#000"]}')).toEqual({ kind: 'p', look: 'shaded', part: 1 });
  });

  it('on a slide, an s orbital on its own goes in a drawing (which keeps its settings), not a plain PowerPoint oval', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    doc.edit('Orbital', () => putOrbital(doc, { kind: 's', look: 'shaded', angle: 0, size: 20 }, { x: 300, y: 300 }));
    const parts = splitSlide(doc);
    expect(parts.shapes.some((s) => s.orb)).toBe(false);
    expect(parts.drawings.some((d) => [...d.shapes].some((id) => doc.shapes.get(id)?.orb))).toBe(true);
  });

  it('PowerPoint keeps them, on lobes (PowerPoint shapes) and in drawings', async () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const opts: PptxOptions = {
      async picture(d) {
        const pts = [...d.atoms.values()];
        const b = pts.length ? boxOf(pts) : { x1: 0, y1: 0, x2: 10, y2: 10 };
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', png: PNG, box: { x1: b.x1 - 5, y1: b.y1 - 5, x2: b.x2 + 5, y2: b.y2 + 5 } };
      },
      async svgToPng() { return PNG; },
    };
    const host = new Doc();
    const deck = Deck.blank(host);
    deck.attach();
    deck.addSlide('blank');
    host.edit('Draw', () => {
      const L = host.style.bondLength;
      const a = host.addAtom(300, 300).id, b = host.addAtom(300 + L, 300).id;
      host.addBond(a, b);
      putOrbital(host, { kind: 'sp3', look: 'shaded', angle: 300, size: 20 }, host.atoms.get(a)!, a);
      putOrbital(host, { kind: 's', look: 'colour', angle: 0, size: 15 }, { x: 600, y: 200 });
    });
    const bytes = await writePptx({ size: deck.size, master: deck.master, slides: deck.slides.map((s, i) => ({ layout: s.layout, doc: deck.docOf(i), notes: s.notes })) }, opts);
    const back = readPptx(bytes);
    const shapes = back.slides[1].contents.shapes.filter((s) => s.orb);
    const kinds = shapes.map((s) => s.orb!.kind).sort();
    expect(kinds).toEqual(['s', 'sp3', 'sp3']);
    const lobes = shapes.filter((s) => s.orb!.kind === 'sp3') as Shape[];
    expect(readOrbital(lobes)!.spec.angle).toBeCloseTo(300, 2);
    expect(shapes.find((s) => s.orb!.kind === 's')!.orb!.look).toBe('colour');
  });
});
