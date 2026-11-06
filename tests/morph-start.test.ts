// @vitest-environment jsdom
//
// Reaction animation: which structures the animation starts from. A starting material drawn
// beside another with no + sign between them (an enol and the ketone it attacks, joined by curved
// arrows) is read as a starting material too, in reading order, rather than left out.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { planOf, buildSteps } from '../src/morph/clip';
import { summary } from '../src/morph/mapping';
import { Renderer, withMeasure } from '../src/render/renderer';
import { arialWidth } from '../src/text-metrics';

function straight(doc: Doc, x1: number, x2: number, y: number) {
  return doc.addArrow({ tail: { x: x1, y }, head: { x: x2, y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 2 });
}

/** A fresh drawing: enol (left), acetone, → aldol product; optionally the curved arrow from the C=C to the ketone's carbon. */
function build(curved: boolean, gap = 4) {
  const doc = new Doc();
  return { doc, ...aldolOn(doc, curved, gap) };
}

function aldolOn(doc: Doc, curved: boolean, gap: number) {
  const B = doc.style.bondLength;
  return doc.edit('build', () => {
    const at = (x: number, y: number, z = 6) => doc.addAtom(x * B, y * B, z).id;
    const e = at(0, 0), eMe = at(-0.87, 0.5), eCH2 = at(0.87, 0.5), eO = at(0, -1, 8);
    doc.addBond(e, eMe); doc.addBond(e, eCH2, 2); doc.addBond(e, eO);
    const k = at(gap, 0), k1 = at(gap - 0.87, 0.5), k2 = at(gap + 0.87, 0.5), kO = at(gap, -1, 8);
    doc.addBond(k, k1); doc.addBond(k, k2); doc.addBond(k, kO, 2);
    if (curved) {
      const t = doc.atoms.get(eCH2)!, h = doc.atoms.get(k)!;
      doc.addArrow({ tail: { x: t.x, y: t.y - 2 }, head: { x: h.x - 4, y: h.y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 1.4, headLength: 6, headWidth: 2 });
    }
    const x0 = gap + 3;
    straight(doc, x0 * B, (x0 + 3) * B, 0);
    const p = x0 + 5;
    const p1 = at(p, 0.5), p2 = at(p + 0.87, 0), p3 = at(p + 1.73, 0.5), p4 = at(p + 2.6, 0), p5 = at(p + 3.46, 0.5), p6 = at(p + 2.6, 1);
    const pO = at(p + 0.87, -1, 8), pO2 = at(p + 2.6, -1, 8);
    doc.addBond(p1, p2); doc.addBond(p2, p3); doc.addBond(p3, p4); doc.addBond(p4, p5); doc.addBond(p4, p6);
    doc.addBond(p2, pO, 2); doc.addBond(p4, pO2);
    return { enol: [e, eMe, eCH2, eO], ketone: [k, k1, k2, kO], product: [p1, p2, p3, p4, p5, p6, pO, pO2] };
  });
}

describe('reaction animation starting materials', () => {
  it('starts from the enol and the ketone a curved arrow joins, left to right', () => {
    const { doc, enol, ketone, product } = build(true, 9);
    const plan = planOf(doc);
    expect(plan.groups.length).toBe(2);
    expect(plan.groups[0]).toEqual([...enol, ...ketone]);
    expect([...plan.groups[1]].sort((a, b) => a - b)).toEqual([...product].sort((a, b) => a - b));
  });

  it('needs the curved arrow when the two are drawn far apart', () => {
    const { doc, ketone } = build(false, 9);
    expect(planOf(doc).groups[0]).toEqual(ketone);
  });

  it('takes a structure drawn in line before the starting material, with no + sign', () => {
    const { doc, enol, ketone } = build(false, 4);
    const plan = planOf(doc);
    expect(plan.groups[0]).toEqual([...enol, ...ketone]);
  });

  it('leaves out a structure drawn well away from the scheme', () => {
    const { doc, ketone } = build(false, 4);
    const B = doc.style.bondLength;
    doc.edit('far', () => { const a = doc.addAtom(-30 * B, 0), b = doc.addAtom(-29 * B, 0); doc.addBond(a.id, b.id); });
    const plan = planOf(doc);
    expect(plan.groups[0]).toEqual(expect.arrayContaining(ketone));
    expect(plan.groups[0].length).toBe(8);
  });
});

describe('the enol + ketone step animates', () => {
  it('pairs every atom and forms the new C–C bond', () => withMeasure((t, s) => arialWidth(t, s), () => {
    const { doc } = build(true, 9);
    const [step] = buildSteps(doc, planOf(doc), new Renderer({ getContext: () => null } as unknown as HTMLCanvasElement, { getContext: () => null } as unknown as HTMLCanvasElement));
    expect(step.error).toBeFalsy();
    const sum = summary(step.A, step.B, step.map);
    expect(sum.paired).toBe(8);
    expect(sum.forming.length).toBe(1);
    expect(sum.breaking.length).toBe(0);
  }));
});
