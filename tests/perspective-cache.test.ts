// @vitest-environment jsdom
// The 3-D shapes Perspective builds are kept per drawing so a structure turns on from where it
// is, but only the ones used last: a long session posing many structures doesn't keep them all.
import { it, expect } from 'vitest';
import { Doc } from '../src/model';
import { POSES_KEPT, posesKept, prepareTurn, structuresOf, type PerspectiveHost } from '../src/editor/perspective';

it('keeps only the shapes used last', async () => {
  const doc = new Doc();
  const L = doc.style.bondLength;
  doc.edit('chains', () => {
    for (let m = 0; m < POSES_KEPT + 20; m++) {
      // a different chain length each time, so each is its own structure
      let prev = doc.addAtom(0, 40 * m).id;
      for (let k = 0; k <= m % 7 + 1; k++) { const a = doc.addAtom(L * (k + 1), 40 * m + (k % 2 ? 7 : 0)).id; doc.addBond(prev, a, 1); prev = a; }
    }
  });
  let built = 0;
  const host: PerspectiveHost = { pose: async () => { built++; return { problem: 'hints' as const, message: 'stub' }; }, smiles: async () => null };
  const all = structuresOf(doc, doc.atoms.keys());
  for (const s of all) await prepareTurn(doc, [s], true, host);
  expect(posesKept(doc)).toBeLessThanOrEqual(POSES_KEPT);
  // the last one used is still kept: turning it again builds nothing
  const before = built;
  await prepareTurn(doc, [all[all.length - 1]], true, host);
  expect(built).toBe(before);
});
