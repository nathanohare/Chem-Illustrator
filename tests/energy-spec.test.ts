// @vitest-environment jsdom
//
// Energy diagrams, the detailed review list: brackets between any two species, a line style
// for each pathway, ΔH beside ΔG, 2-D structures as well as 3-D, and the lengths of the bonds
// being made and broken on transition states. Also dotted lines through CDXML and PowerPoint.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { plainText } from '../src/richtext';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { ENERGY_DEFAULTS, bracketText, joinDash, putEnergy, type EnergyData } from '../src/design/energy';
import { qmBonds, skeletonMolfile } from '../src/chem/qm-bonds';
import { energyKind, flatFor } from '../src/ui/energy-dialog';
import type { QmAtom } from '../src/chem/qm-output';

const A = (el: string, x: number, y: number, z = 0): QmAtom => ({ el, x, y, z });

const BENZENE: QmAtom[] = (() => {
  const out: QmAtom[] = [];
  for (let k = 0; k < 6; k++) out.push(A('C', 1.397 * Math.cos((k * Math.PI) / 3), 1.397 * Math.sin((k * Math.PI) / 3)));
  for (let k = 0; k < 6; k++) out.push(A('H', 2.48 * Math.cos((k * Math.PI) / 3), 2.48 * Math.sin((k * Math.PI) / 3)));
  return out;
})();

// acetaldehyde: CH3–CH=O
const ACETALDEHYDE: QmAtom[] = [
  A('C', 0, 0), A('C', 1.50, 0), A('O', 2.10, 1.05), A('H', 2.05, -0.95),
  A('H', -0.36, 1.03), A('H', -0.36, -0.51, 0.89), A('H', -0.36, -0.51, -0.89),
];

// two methyls 2.20 Å apart: a C–C bond being made
const TS: QmAtom[] = [
  A('C', 0, 0), A('H', -0.36, 1.03), A('H', -0.36, -0.51, 0.89), A('H', -0.36, -0.51, -0.89),
  A('C', 2.2, 0), A('H', 2.56, 1.03), A('H', 2.56, -0.51, 0.89), A('H', 2.56, -0.51, -0.89),
];

describe('bonds from a computed geometry', () => {
  it('finds benzene\'s three double bonds, alternating', () => {
    const b = qmBonds(BENZENE);
    const dbl = b.filter((x) => x.order === 2);
    expect(dbl.length).toBe(3);
    // no carbon has two
    const per = new Map<number, number>();
    for (const x of dbl) for (const k of [x.i, x.j]) per.set(k, (per.get(k) ?? 0) + 1);
    expect([...per.values()].every((n) => n === 1)).toBe(true);
  });

  it('finds a C=O and leaves the C–C single', () => {
    const b = qmBonds(ACETALDEHYDE);
    expect(b.find((x) => x.i === 1 && x.j === 2)!.order).toBe(2);
    expect(b.find((x) => x.i === 0 && x.j === 1)!.order).toBe(1);
  });

  it('finds the bond being made in a transition state, only there', () => {
    expect(qmBonds(TS).some((b) => b.partial)).toBe(false);
    const p = qmBonds(TS, true).filter((b) => b.partial);
    expect(p.length).toBe(1);
    expect([p[0].i, p[0].j]).toEqual([0, 4]);
    expect(p[0].d).toBeCloseTo(2.2, 5);
  });

  it('writes a molfile of the heavy atoms for the 2-D layout', () => {
    const { molblock, index } = skeletonMolfile(ACETALDEHYDE, qmBonds(ACETALDEHYDE));
    expect(index).toEqual([0, 1, 2]);
    expect(molblock).toMatch(/\n {2}3 {2}2 {2}0/);
    expect(molblock).toMatch(/\n {2}2 {2}3 {2}2 {2}0/);
  });

  it('maps the engine\'s layout back onto the geometry', async () => {
    const flat = await flatFor(ACETALDEHYDE, 'Int', async () => [[0, 0], [1, 0], [1.5, -0.87]]);
    expect(flat!.length).toBe(7);
    expect(flat![2]).toEqual([1.5, -0.87]);
    expect(flat![3]).toBeNull();
    expect(await flatFor(ACETALDEHYDE, 'Int', async () => null)).toBeNull();
  });
});

describe('energy diagrams: the detailed list', () => {
  const d = (more: Partial<EnergyData> = {}): EnergyData => ({
    ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol', w: 240, h: 150,
    paths: [{ name: '', color: '#000000', points: [{ label: 'SM', g: 0 }, { label: 'TS1‡', g: 21.4 }, { label: 'Int', g: 5.1 }, { label: 'TS2‡', g: 18.0 }, { label: 'P', g: -7.2 }] }],
    ...more,
  });
  const put = (data: EnergyData) => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    const id = doc.edit('e', () => putEnergy(doc, m, data, { x: 100, y: 100 }));
    return { doc, m, id };
  };
  const texts = (doc: Doc) => [...doc.captions.values()].map((c) => plainText(c.runs));
  const doubles = (doc: Doc) => [...doc.arrows.values()].filter((r) => r.headStyle === 'full' && r.tailStyle === 'full');

  it('draws brackets between any two species: ΔG‡ up to a transition state, else ΔG', () => {
    const { doc } = put(d({ brackets: [{ path: 0, from: 2, to: 3 }, { path: 0, from: 0, to: 4 }, { path: 0, from: 0, to: 2 }] }));
    expect(texts(doc)).toContain('ΔG‡ = 12.9');
    expect(texts(doc)).toContain('ΔG = −7.2');
    expect(texts(doc)).toContain('ΔG = 5.1');
    expect(doubles(doc).length).toBe(3);
  });

  it('leaves out a bracket that points at nothing', () => {
    const { doc } = put(d({ brackets: [{ path: 0, from: 1, to: 1 }, { path: 3, from: 0, to: 1 }, { path: 0, from: 0, to: 9 }] }));
    expect(doubles(doc).length).toBe(0);
  });

  it('labels a bracket from what it climbs to', () => {
    const fmt = (g: number) => (g < 0 ? '−' : '') + Math.abs(g).toFixed(1);
    expect(bracketText({ quantity: 'ΔH' }, { label: 'A', g: 0 }, { label: 'TS‡', g: 10 }, fmt)).toBe('ΔH^‡ = 10.0');
    expect(bracketText({ quantity: 'ΔG' }, { label: 'TS‡', g: 10 }, { label: 'B', g: 2 }, fmt)).toBe('ΔG = −8.0');
  });

  it('joins each pathway in its own line style', () => {
    const two = d();
    two.paths.push({ name: 'B', color: '#c00000', dash: 'dotted', points: two.paths[0].points.map((q) => ({ ...q, g: q.g! + 2 })) });
    const { doc } = put(two);
    const lines = [...doc.shapes.values()].filter((s) => s.kind === 'line');
    expect(lines.some((s) => s.dotted && s.color === '#c00000')).toBe(true);
    expect(lines.some((s) => s.dashed && !s.dotted && (s.color ?? '#000000') === '#000000')).toBe(true);
    expect(joinDash({ style: 'curve' }, {})).toBe('solid');
    expect(joinDash({ style: 'levels' }, {})).toBe('dashed');
  });

  it('dots a curve too, and dashes it', () => {
    const one = d({ style: 'curve' });
    one.paths[0].dash = 'dotted';
    expect([...put(one).doc.shapes.values()].filter((s) => s.kind === 'line' && s.dotted).length).toBe(4 * 16);
    one.paths[0].dash = 'dashed';
    expect([...put(one).doc.arrows.values()].some((r) => r.line === 'dashed')).toBe(true);
  });

  it('shows the lengths of the bonds being made on a transition state, as balls and sticks', () => {
    const data = d({ structures: '3d', distances: true });
    data.paths[0].points[1].geom = TS;
    data.paths[0].points[2].geom = ACETALDEHYDE;
    const { doc } = put(data);
    expect(texts(doc)).toContain('2.20');
    expect([...doc.shapes.values()].some((s) => s.kind === 'line' && s.dashed)).toBe(true);
    // not asked: no lengths
    expect(texts(put({ ...data, distances: false }).doc)).not.toContain('2.20');
  });

  it('draws 2-D structures: labelled heteroatoms, double bonds, the TS bond dashed with its length', () => {
    const data = d({ structures: '2d', distances: true });
    data.paths[0].points[1].geom = TS;
    data.paths[0].points[2].geom = ACETALDEHYDE;
    const { doc, m, id } = put(data);
    expect(texts(doc)).toContain('O');
    expect(texts(doc)).toContain('2.20');
    // no balls
    expect([...doc.shapes.values()].some((s) => s.kind === 'oval')).toBe(false);
    // CH3–CH=O: one line for C–C, two for C=O, plus the TS's dashed C···C
    const frameLines = doc.shapes.get(id)!.frame!.shapes.map((k) => doc.shapes.get(k)!).filter((s) => s.kind === 'line');
    expect(frameLines.length).toBeGreaterThan(4);
    // drawn again: replaced, not added to
    const before = doc.shapes.size;
    doc.edit('again', () => putEnergy(doc, m, { ...doc.shapes.get(id)!.energy!, digits: 2 }, { x: 100, y: 100 }, id));
    expect(doc.shapes.size).toBe(before);
  });

  it('lays a 2-D structure out by the engine\'s layout when it has one', () => {
    const data = d({ structures: '2d' });
    data.paths[0].points[2].geom = ACETALDEHYDE;
    data.paths[0].points[2].flat = [[0, 0], [1, 0], [1.5, -0.87], null, null, null, null];
    const { doc } = put(data);
    const o = [...doc.captions.values()].find((c) => plainText(c.runs) === 'O')!;
    expect(o).toBeTruthy();
  });

  it('writes water as H₂O and an alcohol bonded to the right as HO', () => {
    const water: QmAtom[] = [A('O', 0, 0, 0.117), A('H', 0, 0.757, -0.469), A('H', 0, -0.757, -0.469)];
    const data = d({ structures: '2d' });
    data.paths[0].points[0].geom = water;
    expect(texts(put(data).doc)).toContain('H2O');
  });

  it('picks the file energy for the axis', () => {
    expect(energyKind('ΔG')).toBe('G');
    expect(energyKind('ΔG°')).toBe('G');
    expect(energyKind('ΔH')).toBe('H');
    expect(energyKind('ΔE')).toBe('E');
    expect(energyKind('E')).toBe('E');
  });

  it('keeps brackets, line styles, 2-D layouts and file energies through CDXML, and dotted lines', () => {
    const data = d({ structures: '2d', distances: true, brackets: [{ path: 0, from: 2, to: 3 }] });
    data.paths[0].dash = 'dotted';
    data.paths[0].points[2].geom = ACETALDEHYDE;
    data.paths[0].points[2].flat = [[0, 0], [1, 0], [1.5, -0.87], null, null, null, null];
    data.paths[0].points[2].ehs = { G: -153.1, H: -153.05, E: -153.2 };
    const { doc } = put(data);
    const back = readCdxml(writeCdxml(doc)).doc;
    const f = [...back.shapes.values()].find((s) => s.energy)!;
    expect(f.energy!.brackets).toEqual([{ path: 0, from: 2, to: 3 }]);
    expect(f.energy!.paths[0].dash).toBe('dotted');
    expect(f.energy!.structures).toBe('2d');
    expect(f.energy!.distances).toBe(true);
    expect(f.energy!.paths[0].points[2].ehs).toEqual({ G: -153.1, H: -153.05, E: -153.2 });
    expect(f.energy!.paths[0].points[2].flat![2]).toEqual([1.5, -0.87]);
    expect([...back.shapes.values()].some((s) => s.kind === 'line' && s.dotted)).toBe(true);
    // ChemDraw is given dashes
    expect(writeCdxml(doc)).toMatch(/LineType="Dashed"><objecttag TagType="String" Name="Chem Illustrator dotted" Value="yes"/);
  });
});
