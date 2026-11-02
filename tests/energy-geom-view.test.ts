// @vitest-environment jsdom
//
// How an energy diagram draws a species' geometry from a Gaussian or ORCA file (review of #321):
// its 3-D look (balls and sticks, sticks, space-filling, lines) or a 2-D structure, the angle it
// is seen from, which hydrogens show, and atoms hidden or faded; or no geometry at all.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { ENERGY_DEFAULTS, geomBestRotation, geomHidden, geomSpec, putEnergy, type EnergyData, type GeomView } from '../src/design/energy';
import { crystalShapes, turnView } from '../src/design/xray';
import { qmBonds } from '../src/chem/qm-bonds';
import type { QmAtom } from '../src/chem/qm-output';
import { cleanView } from '../src/ui/geom-view-dialog';

/** An SN2 transition state: phenoxide coming in on a methyl group as bromide leaves. */
function sn2(): QmAtom[] {
  const atoms: QmAtom[] = [];
  const A = (el: string, x: number, y: number, z: number) => atoms.push({ el, x, y, z } as QmAtom);
  A('C', 0, 0, 0); A('H', 0, 1.07, 0); A('H', 0, -0.53, 0.93); A('H', 0, -0.53, -0.93);
  A('Br', 2.45, 0, 0); A('O', -2.05, 0, 0);
  // the ring, its first carbon on the oxygen
  const cx = -4.85;
  for (let k = 0; k < 6; k++) A('C', cx + 1.39 * Math.cos((Math.PI * k) / 3), 1.39 * Math.sin((Math.PI * k) / 3), 0);
  for (let k = 1; k < 6; k++) A('H', cx + 2.47 * Math.cos((Math.PI * k) / 3), 2.47 * Math.sin((Math.PI * k) / 3), 0);
  return atoms;
}

const diagram = (view?: GeomView, more: Partial<EnergyData> = {}): EnergyData => ({
  ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol', w: 220, h: 150, structures: '3d',
  paths: [{ name: '', color: '#000000', points: [{ label: 'SM', g: 0 }, { label: 'TS1‡', g: 20, geom: sn2(), ...(view ? { view } : {}) }, { label: 'P', g: -5 }] }],
  ...more,
});

function draw(d: EnergyData) {
  const doc = new Doc();
  const m = plainMeasure(doc);
  doc.edit('e', () => putEnergy(doc, m, d, { x: 100, y: 100 }));
  return doc;
}
const ovals = (doc: Doc) => [...doc.shapes.values()].filter((s) => s.kind === 'oval');

describe('a species\' geometry on an energy diagram', () => {
  const atoms = sn2();
  const bonds = qmBonds(atoms, true);

  it('finds the bonds being made and broken', () => {
    expect(bonds.filter((b) => b.partial).length).toBe(2);
  });

  it('takes its look from the diagram, or its own', () => {
    expect(geomSpec(atoms, bonds).view.style).toBe('ball');
    expect(geomSpec(atoms, bonds, undefined, 'fill').view.style).toBe('fill');
    expect(geomSpec(atoms, bonds, { style: 'stick' }, 'fill').view.style).toBe('stick');
    // space-filling atoms are bigger than balls
    const r = (look: 'ball' | 'fill') => Math.max(...crystalShapes(geomSpec(atoms, bonds, { style: look }), { ...geomSpec(atoms, bonds, { style: look }).view, zoom: 1 }).filter((s) => s.kind === 'ball').map((s) => s.axes![0]));
    expect(r('fill')).toBeGreaterThan(2 * r('ball'));
    // lines: no balls at all
    const wire = geomSpec(atoms, bonds, { style: 'wire' });
    expect(crystalShapes(wire, { ...wire.view, zoom: 1 }).some((s) => s.kind === 'ball')).toBe(false);
  });

  it('hides hydrogens as asked: all shown, only those of bonds being made or broken, or none', () => {
    const hs = atoms.map((a, i) => (a.el === 'H' ? i : -1)).filter((i) => i >= 0);
    expect(geomHidden(atoms, bonds, {}).size).toBe(0);
    expect([...geomHidden(atoms, bonds, { hydrogens: 'none' })].sort()).toEqual([...hs].sort());
    // no hydrogen is on a bond being made or broken here
    expect(geomHidden(atoms, bonds, { hydrogens: 'moving' }).size).toBe(hs.length);
    expect(geomHidden(atoms, bonds, { hidden: [4] }).has(4)).toBe(true);
  });

  it('draws hidden atoms not at all and faded ones paler', () => {
    const all = ovals(draw(diagram())).length;
    const fewer = ovals(draw(diagram({ hidden: [4], hydrogens: 'none' }))).length;
    expect(fewer).toBe(all - 1 - atoms.filter((a) => a.el === 'H').length);
    const spec = geomSpec(atoms, bonds, { faded: [6, 7, 8, 9, 10, 11] });
    const shapes = crystalShapes(spec, { ...spec.view, zoom: 1 });
    const ring = shapes.filter((s) => s.kind === 'ball' && s.atom === 7)[0];
    const methyl = shapes.filter((s) => s.kind === 'ball' && s.atom === 0)[0];
    expect(ring.faded).toBe(true);
    expect(methyl.faded).toBeFalsy();
    // faded toward white: a grey carbon gets lighter
    const light = (c: string) => parseInt(c.slice(1, 3), 16);
    expect(light(ring.fill)).toBeGreaterThan(light(methyl.fill));
  });

  it('is seen from the angle it was turned to', () => {
    const best = geomBestRotation(atoms);
    const turned = turnView(best, 0, 90);
    expect(geomSpec(atoms, bonds).view.rotation).toEqual(best);
    expect(geomSpec(atoms, bonds, { rot: turned }).view.rotation).toEqual(turned);
  });

  it('one species can be a 2-D structure while the rest are 3-D', () => {
    const doc = draw(diagram({ style: '2d' }));
    // no balls: drawn as a skeleton (text labels for O and Br)
    expect(ovals(doc).length).toBe(0);
  });

  it('keeps only what a view says', () => {
    expect(cleanView({ style: 'ball', hydrogens: 'all', hidden: [], faded: [3, 3, 1], fade: 0.6 })).toEqual({ style: 'ball', faded: [1, 3] });
  });
});
