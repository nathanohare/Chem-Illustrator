// @vitest-environment jsdom
// Clean Up on a drawing of thousands of structures checks each structure for tangles and works
// out its layouts from that structure's own bonds, not by scanning every bond in the drawing for
// each structure (which froze the window for 9 s on the desktop self-test's 2,000 molecules).
import { it, expect, vi } from 'vitest';
import { Doc } from '../src/model';
import { bondsWithin, cleanUpOptions, looksTangled } from '../src/chem/cleanup';
import { freeRing, placeRing } from '../src/chem/chemgeom';

const L = 14.4;
function rings(n: number): Doc {
  const doc = new Doc();
  doc.bulk(() => {
    for (let i = 0; i < n; i++) {
      const r = placeRing(doc, freeRing({ x: (i % 40) * 3 * L, y: Math.floor(i / 40) * 3 * L }, 6, L), {});
      doc.addBond(r[0], doc.addAtom(doc.atoms.get(r[0])!.x, doc.atoms.get(r[0])!.y - L).id, 1);
    }
  });
  return doc;
}

it('bondsWithin gives just the bonds between the atoms given, each once', () => {
  const doc = rings(3);
  const [f] = doc.fragments();
  const got = bondsWithin(doc, f);
  expect(got.length).toBe(7);
  expect(new Set(got.map((b) => b.id)).size).toBe(7);
  expect(got.every((b) => f.has(b.a1) && f.has(b.a2))).toBe(true);
});

it('checks 2,000 structures without reading every bond of the drawing for each', () => {
  const doc = rings(2000);
  const all = vi.spyOn(doc.bonds, 'values');
  const t0 = performance.now();
  for (const f of doc.fragments()) { looksTangled(doc, f); cleanUpOptions(doc, f); }
  const ms = performance.now() - t0;
  expect(all).not.toHaveBeenCalled();
  expect(ms).toBeLessThan(5000);
});
