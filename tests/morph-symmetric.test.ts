// @vitest-environment jsdom
//
// Reaction animation: a symmetric structure is paired the way round it is drawn. Propane to
// acetone once paired its two methyls swapped (as good a fit to the bonds), so the drawing
// twisted over halfway through when only a C=O had to appear.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Renderer, withMeasure } from '../src/render/renderer';
import { arialWidth } from '../src/text-metrics';
import { planOf, buildSteps } from '../src/morph/clip';
import { flow } from '../src/morph/frame';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;
const L = 14.4;

/** Propane, an arrow, acetone; `order` is the order the product's atoms are drawn in, 3 being the O (it once decided the pairing). */
function propaneToAcetone(order: number[]): Doc {
  const doc = new Doc();
  doc.edit('Build', () => {
    const at = (x0: number, o: boolean) => {
      const xs = [x0, x0 + L * 0.866, x0 + L * 1.732, x0 + L * 0.866], ys = [100, 100 - L / 2, 100, 100 - L * 1.5];
      const made: ReturnType<typeof doc.addAtom>[] = [];
      for (const i of o ? order : [0, 1, 2]) made[i] = doc.addAtom(xs[i], ys[i], i === 3 ? 8 : 6);
      const [a, b, c, ox] = made;
      doc.addBond(a.id, b.id); doc.addBond(b.id, c.id);
      if (ox) doc.addBond(b.id, ox.id, 2);
    };
    at(0, false);
    doc.addArrow({ tail: { x: 40, y: 95 }, head: { x: 80, y: 95 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5 });
    at(100, true);
  });
  return doc;
}

/** As pasted from CCC>>CC(=O)C, where the methyls once swapped: RDKit's coordinates, not quite symmetric. */
function pasted(): Doc {
  const doc = new Doc();
  doc.edit('Build', () => {
    const id = new Map<number, number>();
    for (const [k, z, x, y] of [[1, 6, 205.60972047930323, 363.95456822213697], [2, 6, 218.10623118811822, 356.8005390447467], [3, 6, 230.5509011057927, 364.04672962860894],
      [7, 6, 317.4131557748773, 373.8351454631695], [8, 6, 304.96794995211576, 366.59296308841056], [9, 8, 305.01979297567743, 352.1921232101861], [10, 6, 292.4709011057927, 373.7473003399124]]) id.set(k, doc.addAtom(x, y, z).id);
    for (const [a, b, o] of [[1, 2, 1], [2, 3, 1], [7, 8, 1], [8, 9, 2], [8, 10, 1]]) doc.addBond(id.get(a)!, id.get(b)!, o);
    doc.addArrow({ tail: { x: 241.35, y: 360.42 }, head: { x: 281.67, y: 360.42 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5 });
  });
  return doc;
}

describe('a symmetric structure in a reaction animation', () => {
  const cases: [string, () => Doc][] = [
    ['as pasted', pasted],
    ...[[0, 1, 2, 3], [2, 1, 3, 0], [2, 1, 0, 3], [1, 3, 2, 0], [3, 2, 1, 0]].map((o) => [`product drawn ${o.join('')}`, () => propaneToAcetone(o)] as [string, () => Doc]),
  ];
  for (const [name, make] of cases) it(`propane to acetone (${name}): the carbons stay where they are, with no twist`, () => withMeasure((t, s) => arialWidth(t, s), () => {
    const doc = make();
    const steps = buildSteps(doc, planOf(doc), new Renderer(noCanvas, noCanvas));
    expect(steps.length).toBe(1);
    const s = steps[0];
    expect(s.error).toBeFalsy();
    expect(s.opt.flip ?? null).toBeNull();
    // left stays left: each carbon pairs with the one on its own side of the middle carbon
    const midA = [...s.A.nodes.keys()].find((k) => s.A.nbr.get(k)!.length === 2)!;
    const midB = s.map.nmap.get(midA)!;
    const half = flow(s.A, s.B, s.map.nmap, 0.5, s.opt.flip ?? null);
    expect(s.map.nmap.size).toBe(3);
    for (const [a, b] of s.map.nmap) {
      const pa = s.A.nodes.get(a)!.p, pb = s.B.nodes.get(b)!.p;
      const sideA = Math.sign(Math.round(pa.x - s.A.nodes.get(midA)!.p.x)), sideB = Math.sign(Math.round(pb.x - s.B.nodes.get(midB)!.p.x));
      expect(sideA).toBe(sideB);
      // and halfway, it hasn't moved
      const q = half.get(a)!;
      expect(Math.hypot(q.x - pa.x, q.y - pa.y)).toBeLessThan(0.5);
    }
  }));
});
