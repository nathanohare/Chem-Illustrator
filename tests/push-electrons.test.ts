// @vitest-environment jsdom
//
// Drawing the next intermediate from curved arrows, and checking the arrows first: bonds made and
// broken, charges and radicals moved, lone pairs kept, five-bond carbons and backwards arrows caught.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { pushArrow, pushPins, type PushEnd } from '../src/chem/mechanism';
import { productDrawing, pushArrowsOf, readPushes } from '../src/chem/push-electrons';
import { dist } from '../src/geom';

const L = new Doc().style.bondLength;

/** An electron-pushing arrow from one thing to another, stuck to both (as the curved-arrow tool draws one). */
function push(doc: Doc, from: PushEnd, to: PushEnd, fishhook = false): number {
  const m = plainMeasure(doc);
  const p = pushArrow(doc, m, from, to)!;
  expect(p).not.toBeNull();
  return doc.edit('arrow', () => doc.addArrow({
    tail: p.tail, head: p.head, sweep: p.sweep, ...(p.bez ? { bez: p.bez } : {}), pin: pushPins(doc, p),
    headStyle: fishhook ? 'halfLeft' : 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5,
  }).id);
}

const atom = (id: number): PushEnd => ({ kind: 'atom', id });
const bond = (doc: Doc, a: number, b: number): PushEnd => ({ kind: 'bond', id: doc.bondBetween(a, b)!.id });

function run(doc: Doc) {
  const m = plainMeasure(doc);
  const reading = readPushes(doc, m, pushArrowsOf(doc, doc.arrows.keys()));
  const out = productDrawing(doc, m, reading);
  return { reading, out: out!, errors: reading.issues.filter((i) => i.level === 'error') };
}

/** Hydroxide and bromomethane, side by side. */
function sn2() {
  const doc = new Doc();
  const ids = doc.edit('build', () => {
    const o = doc.addAtom(100, 100, 8, { charge: -1 }).id;
    const c = doc.addAtom(100 + 2 * L, 100, 6).id;
    const br = doc.addAtom(100 + 3 * L, 100, 35).id;
    doc.addBond(c, br, 1);
    return { o, c, br };
  });
  return { doc, ...ids };
}

describe('drawing the next intermediate from curved arrows', () => {
  it('makes and breaks bonds and moves the charges (SN2)', () => {
    const { doc, o, c, br } = sn2();
    push(doc, atom(o), atom(c));
    push(doc, bond(doc, c, br), atom(br));
    const { out, errors } = run(doc);
    expect(errors).toEqual([]);
    expect(out.bondBetween(o, c)?.order).toBe(1);
    expect(out.bondBetween(c, br)).toBeUndefined();
    expect(out.atoms.get(o)!.charge).toBe(0);
    expect(out.atoms.get(br)!.charge).toBe(-1);
    expect(out.atoms.get(c)!.charge).toBe(0);
    // the new bond is a bond long, and the bromide has come away, clear of the rest
    expect(dist(out.atoms.get(o)!, out.atoms.get(c)!)).toBeCloseTo(L, 3);
    expect(dist(out.atoms.get(br)!, out.atoms.get(c)!)).toBeGreaterThan(1.4 * L);
    expect(dist(out.atoms.get(br)!, out.atoms.get(o)!)).toBeGreaterThan(0.9 * L);
    // the starting drawing is left as it was
    expect(doc.bondBetween(c, br)).toBeDefined();
    expect(doc.atoms.get(o)!.charge).toBe(-1);
  });

  it('catches a five-bond carbon: a nucleophile adding to C=O without the π bond moving', () => {
    const doc = new Doc();
    const { o, c, me, nu } = doc.edit('build', () => {
      const c = doc.addAtom(200, 100, 6).id;
      const o = doc.addAtom(200, 100 - L, 8).id;
      const me = doc.addAtom(200 - 0.87 * L, 100 + 0.5 * L, 6).id;
      doc.addBond(c, o, 2); doc.addBond(c, me, 1);
      const nu = doc.addAtom(200 + 2 * L, 100 + 0.5 * L, 6, { charge: -1, label: null }).id;
      return { o, c, me, nu };
    });
    void me;
    // a methyl anion (CH3−) adds to acetaldehyde's carbon
    push(doc, atom(nu), atom(c));
    const bad = run(doc);
    expect(bad.errors.length).toBe(1);
    expect(bad.errors[0].text).toMatch(/5 bonds \(counting its 1 H\).*more than an octet/);
    expect(bad.errors[0].atoms).toEqual([c]);
    // with the π bond going onto the oxygen it is fine: an alkoxide
    push(doc, bond(doc, c, o), atom(o));
    const good = run(doc);
    expect(good.errors).toEqual([]);
    expect(good.out.bondBetween(c, o)?.order).toBe(1);
    expect(good.out.bondBetween(nu, c)?.order).toBe(1);
    expect(good.out.atoms.get(o)!.charge).toBe(-1);
    expect(good.out.atoms.get(nu)!.charge).toBe(0);
  });

  it('says an arrow from a carbocation to a nucleophile is the wrong way round', () => {
    const doc = new Doc();
    const { o, c } = doc.edit('build', () => {
      const c = doc.addAtom(200, 100, 6, { charge: 1 }).id;
      for (const [dx, dy] of [[-0.87, -0.5], [0.87, -0.5], [0, 1]]) doc.addBond(c, doc.addAtom(200 + dx * L, 100 + dy * L, 6).id, 1);
      const o = doc.addAtom(200 + 2.5 * L, 100, 8, { charge: -1 }).id;
      return { o, c };
    });
    push(doc, atom(c), atom(o));
    const { errors } = run(doc);
    expect(errors.length).toBe(1);
    expect(errors[0].text).toMatch(/no lone pair to give.*wrong way round/);
  });

  it('turns a C=O π bond and an enolate round (aldol-type step), with no complaints', () => {
    // enolate O−–C=C attacking bromomethane through its carbon
    const doc = new Doc();
    const ids = doc.edit('build', () => {
      const o = doc.addAtom(100, 100 - L, 8, { charge: -1 }).id;
      const c1 = doc.addAtom(100, 100, 6).id;
      const c2 = doc.addAtom(100 + 0.87 * L, 100 + 0.5 * L, 6).id;
      doc.addBond(o, c1, 1); doc.addBond(c1, c2, 2);
      const me = doc.addAtom(100 + 2.6 * L, 100 + 0.5 * L, 6).id;
      const br = doc.addAtom(100 + 3.6 * L, 100 + 0.5 * L, 35).id;
      doc.addBond(me, br, 1);
      return { o, c1, c2, me, br };
    });
    push(doc, atom(ids.o), bond(doc, ids.o, ids.c1));
    push(doc, bond(doc, ids.c1, ids.c2), atom(ids.me));
    push(doc, bond(doc, ids.me, ids.br), atom(ids.br));
    const { out, errors } = run(doc);
    expect(errors).toEqual([]);
    expect(out.bondBetween(ids.o, ids.c1)?.order).toBe(2);
    expect(out.bondBetween(ids.c1, ids.c2)?.order).toBe(1);
    expect(out.bondBetween(ids.c2, ids.me)?.order).toBe(1);
    expect(out.bondBetween(ids.me, ids.br)).toBeUndefined();
    expect(out.atoms.get(ids.o)!.charge).toBe(0);
    expect(out.atoms.get(ids.br)!.charge).toBe(-1);
  });

  it('breaks a bond evenly with two fishhooks, making two radicals', () => {
    const doc = new Doc();
    const [a, b] = doc.edit('build', () => { const a = doc.addAtom(100, 100, 35).id, b = doc.addAtom(100 + L, 100, 35).id; doc.addBond(a, b, 1); return [a, b]; });
    push(doc, bond(doc, a, b), atom(a), true);
    push(doc, bond(doc, a, b), atom(b), true);
    const { out, errors } = run(doc);
    expect(errors).toEqual([]);
    expect(out.bondBetween(a, b)).toBeUndefined();
    expect(out.atoms.get(a)!.radical).toBe('doublet');
    expect(out.atoms.get(b)!.charge).toBe(0);
    // each radical gets its dot
    expect([...out.shapes.values()].filter((s) => s.symbol === 'Electron').length).toBe(2);
  });

  it('says one fishhook alone leaves a bond with one electron', () => {
    const doc = new Doc();
    const [a, b] = doc.edit('build', () => { const a = doc.addAtom(100, 100, 35).id, b = doc.addAtom(100 + L, 100, 35).id; doc.addBond(a, b, 1); return [a, b]; });
    push(doc, bond(doc, a, b), atom(a), true);
    const { errors } = run(doc);
    expect(errors.some((e) => /one electron/.test(e.text))).toBe(true);
  });

  it('moves a proton: an amine takes H from HCl', () => {
    const doc = new Doc();
    const ids = doc.edit('build', () => {
      const n = doc.addAtom(100, 100, 7).id;
      for (const [dx, dy] of [[-0.87, -0.5], [-0.87, 0.5], [0, 1]]) doc.addBond(n, doc.addAtom(100 + dx * L, 100 + dy * L, 6).id, 1);
      const h = doc.addAtom(100 + 2 * L, 100, 1).id;
      const cl = doc.addAtom(100 + 3 * L, 100, 17).id;
      doc.addBond(h, cl, 1);
      return { n, h, cl };
    });
    push(doc, atom(ids.n), atom(ids.h));
    push(doc, bond(doc, ids.h, ids.cl), atom(ids.cl));
    const { out, errors } = run(doc);
    expect(errors).toEqual([]);
    expect(out.atoms.get(ids.n)!.charge).toBe(1);
    expect(out.atoms.get(ids.cl)!.charge).toBe(-1);
    expect(out.bondBetween(ids.n, ids.h)?.order).toBe(1);
    // the ammonium N keeps no H of its own (trimethylammonium's H is the one drawn)
    expect(out.atoms.get(ids.n)!.label).toBeNull();
  });

  it('says a methyl carbon has no lone pair to give', () => {
    const doc = new Doc();
    const [c, o] = doc.edit('build', () => [doc.addAtom(100, 100, 6).id, doc.addAtom(100 + 2 * L, 100, 8, { charge: 1 }).id]);
    push(doc, atom(c), atom(o));
    const { errors } = run(doc);
    expect(errors[0].text).toMatch(/This carbon has no lone pair to give/);
  });

  it('keeps drawn lone pairs: one fewer on the atom that gave a pair', () => {
    const { doc, o, c, br } = sn2();
    // three lone pairs on the hydroxide's O
    doc.edit('pairs', () => {
      for (const [dx, dy] of [[-0.3, 0], [0, -0.3], [0, 0.3]]) {
        const x = 100 + dx * L, y = 100 + dy * L;
        doc.addShape({ kind: 'symbol', symbol: 'LonePair', x1: x - 1.12, y1: y, x2: x + 1.12, y2: y });
      }
    });
    push(doc, atom(o), atom(c));
    push(doc, bond(doc, c, br), atom(br));
    const { out, errors } = run(doc);
    expect(errors).toEqual([]);
    const pairs = [...out.shapes.values()].filter((s) => s.symbol === 'LonePair');
    const onO = pairs.filter((s) => dist({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }, out.atoms.get(o)!) < 0.6 * L);
    const onBr = pairs.filter((s) => dist({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }, out.atoms.get(br)!) < 0.6 * L);
    expect(onO.length).toBe(2);
    // the drawing shows lone pairs, so the bromide gets the pair it took
    expect(onBr.length).toBe(1);
  });

  it('turns an arrow that starts nowhere into an error, not a guess', () => {
    const { doc, c } = sn2();
    doc.edit('arrow', () => doc.addArrow({
      tail: { x: 0, y: 300 }, head: { x: doc.atoms.get(c)!.x, y: doc.atoms.get(c)!.y - 0.25 * L }, sweep: 1.5,
      headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, headLength: 6, headWidth: 1.5,
    }));
    const { errors } = run(doc);
    expect(errors[0].text).toMatch(/doesn't start on a lone pair/);
  });
});
