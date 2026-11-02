import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { templateById, placeTemplate, fusePlacements, atomPlacements, freePlacement, templatePoints, type Placement } from '../src/chem/templates';
import { distinctChoices, moleculeSignature } from '../src/chem/template-choices';
import { dist } from '../src/geom';

const L = 14.4;
const tpl = (id: string) => templateById(id)!;

function naphthalene(): Doc {
  const doc = new Doc();
  doc.edit('t', () => placeTemplate(doc, tpl('naphthalene'), { origin: { x: 100, y: 100 }, scale: L, angle: 0.3, mirror: false }, {}));
  return doc;
}

/** The ways of fusing a template onto a drawn bond, as the editor lists them. */
function fusions(doc: Doc, id: string, bondIndex: number) {
  const t = tpl(id);
  const b = [...doc.bonds.values()][bondIndex];
  const p = doc.atoms.get(b.a1)!, q = doc.atoms.get(b.a2)!;
  return fusePlacements(t, p, q).map((pl: Placement) => {
    const pts = templatePoints(t, pl);
    const near = (i: number) => (dist(p, pts[i]) < dist(q, pts[i]) ? p.id : q.id);
    return { pl, existing: new Map([[t.fuse![0], near(t.fuse![0])], [t.fuse![1], near(t.fuse![1])]]) };
  });
}

describe('Tab cycling through template choices', () => {
  it('a naphthalene fused onto the end bond of a naphthalene is one compound, not four', () => {
    const doc = naphthalene();
    // the end bond (C2-C3) of the drawn naphthalene
    const nextToFusion = (a: number) => (doc.adj.get(a) ?? []).some((x) => { const o = doc.bonds.get(x)!; return doc.degree(o.a1 === a ? o.a2 : o.a1) === 3; });
    const end = [...doc.bonds.values()].findIndex((b) => doc.degree(b.a1) === 2 && doc.degree(b.a2) === 2 && !nextToFusion(b.a1) && !nextToFusion(b.a2));
    expect(end).toBeGreaterThanOrEqual(0);
    const all = fusions(doc, 'naphthalene', end);
    expect(all.length).toBe(4);
    const kept = distinctChoices(doc, tpl('naphthalene'), all, true);
    expect(kept.length).toBeLessThan(all.length);
    // never two choices making the same molecule
    const sigs = kept.map((c) => moleculeSignature(doc, tpl('naphthalene'), c));
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('on every bond of a naphthalene, a naphthalene leaves at most two ways', () => {
    const doc = naphthalene();
    for (let i = 0; i < doc.bonds.size; i++) {
      const kept = distinctChoices(doc, tpl('naphthalene'), fusions(doc, 'naphthalene', i), true);
      expect(kept.length).toBeGreaterThanOrEqual(1);
      expect(kept.length).toBeLessThanOrEqual(2);
    }
  });

  it('a way that lays the template back over the ring it fuses to (adding nothing) is left out', () => {
    const doc = naphthalene();
    for (let i = 0; i < doc.bonds.size; i++) {
      for (const c of distinctChoices(doc, tpl('naphthalene'), fusions(doc, 'naphthalene', i), true)) {
        expect(moleculeSignature(doc, tpl('naphthalene'), c)).not.toBe('');
      }
    }
  });

  it('an unsymmetric template keeps the regioisomers apart', () => {
    const doc = naphthalene();
    // indole fused outward on the end bond: the NH can point either way round the new ring system
    let most = 0;
    for (let i = 0; i < doc.bonds.size; i++) most = Math.max(most, distinctChoices(doc, tpl('indole'), fusions(doc, 'indole', i), true).length);
    expect(most).toBeGreaterThanOrEqual(2);
  });

  it('joining a naphthalene to a naphthalene atom by a bond: one way', () => {
    const doc = naphthalene();
    const t = tpl('naphthalene');
    const a = [...doc.atoms.values()].find((x) => doc.degree(x.id) === 2)!;
    const dir = { x: 1, y: 0 };
    const all = atomPlacements(t, a, dir, L, true).map((pl) => ({ pl, existing: new Map<number, number>(), bondFrom: a.id }));
    expect(all.length).toBe(2);
    expect(distinctChoices(doc, t, all, true).length).toBe(1);
  });

  it('on its own, a template keeps every way that looks different, and drops ones that look the same', () => {
    const doc = new Doc();
    const ways = (id: string) => [[false, 0], [true, 0], [true, Math.PI], [false, Math.PI]].map(([mirror, turn]) => (
      { pl: { ...freePlacement({ x: 50, y: 50 }, L, turn as number), mirror: mirror as boolean }, existing: new Map<number, number>() }));
    // naphthalene looks the same all four ways; indole four different ways
    expect(distinctChoices(doc, tpl('naphthalene'), ways('naphthalene'), false).length).toBe(1);
    expect(distinctChoices(doc, tpl('indole'), ways('indole'), false).length).toBe(4);
  });
});
