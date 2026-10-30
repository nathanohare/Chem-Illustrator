// Turning a drawn structure to match a view of its 3-D model (the 3-D Model window's Place on
// Page): each atom goes where the model's atom is seen, scaled to the drawing's bond length and
// kept centred where the structure was. Its depth comes too, so the bond nearer the reader is
// in front where two cross, and wedges and hashes point the way their bonds now lie. Each atom
// also keeps its 3-D position (CDXML's xyz, as ChemDraw keeps after a 3-D turn), so two placed
// views of one molecule turn into each other in a reaction animation.

import type { Doc } from '../model';
import { layerByDepth } from './crossing';
import { ringsThroughBond } from './aromatic';

/**
 * Move the drawn atoms to the view. `map` is the molfile's atom index → drawn atom id (−1 for
 * atoms made from a label), `view` the model's atoms as seen (Å; y up, z towards the reader), the
 * drawn atoms first in molfile order. Call inside an edit. Returns how many stereocentres could
 * not be shown from this view (a bond pointing straight at the reader leaves no wedge that reads
 * right): turning the model a little fixes that.
 */
export function placeView(doc: Doc, map: number[], view: [number, number, number][]): { unshown: number } {
  const pairs: [number, [number, number, number]][] = [];
  const seen = new Set<number>();
  map.forEach((id, i) => {
    if (id < 0 || seen.has(id) || !doc.atoms.has(id) || !view[i]) return;
    seen.add(id);
    pairs.push([id, view[i]]);
  });
  if (!pairs.length) return { unshown: 0 };
  // Å to drawing units: the drawn bond length over the model's mean bond between drawn atoms
  const at = new Map(pairs);
  const lens: number[] = [];
  for (const b of doc.bonds.values()) {
    const p = at.get(b.a1), q = at.get(b.a2);
    if (p && q) lens.push(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  const mean = lens.length ? lens.reduce((s, v) => s + v, 0) / lens.length : 1.5;
  const s = (doc.style.bondLength || 14.4) / mean;
  const old = pairs.map(([id]) => doc.atoms.get(id)!);
  const cx = old.reduce((t, a) => t + a.x, 0) / old.length, cy = old.reduce((t, a) => t + a.y, 0) / old.length;
  const mx = pairs.reduce((t, [, v]) => t + v[0], 0) / pairs.length, my = pairs.reduce((t, [, v]) => t + v[1], 0) / pairs.length;
  const mz = pairs.reduce((t, [, v]) => t + v[2], 0) / pairs.length;
  for (const [id, [x, y, z]] of pairs) {
    const px = cx + (x - mx) * s, py = cy - (y - my) * s, depth = (z - mz) * s;
    // ChemDraw's xyz has the reader at −z
    doc.updateAtom(id, { x: px, y: py, depth, xyz: [px, py, -depth] });
  }
  // each stereocentre drawn with a wedge gets one again, on the bond that leaves it most steeply
  // towards or away from the reader (a wedge or a hashed wedge as it points): on a turned
  // structure the old wedge can lie nearly flat, or point the wrong way for the hydrogen the
  // reader no longer sees
  const centres = new Set<number>();
  for (const b of doc.bonds.values()) if ((b.display === 'wedge' || b.display === 'hashWedge') && at.has(b.a1) && at.has(b.a2)) centres.add(b.a1);
  for (const b of doc.bonds.values()) if (centres.has(b.a1) && (b.display === 'wedge' || b.display === 'hashWedge')) doc.updateBond(b.id, { display: 'solid' });
  const taken = new Set<number>();
  const L = doc.style.bondLength || 14.4;
  const P = (id: number) => { const a = doc.atoms.get(id)!; return [a.x, a.y, a.depth ?? 0] as const; };
  const det = (u: readonly number[], v: readonly number[], w: readonly number[]) =>
    u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
  type Choice = { id: number; score: number; n: number; toward: boolean };
  const choices = new Map<number, Choice[]>();
  for (const c of centres) {
    const pc = P(c);
    const nbrs = (doc.adj.get(c) ?? []).map((bid) => doc.bonds.get(bid)!).filter((b) => b && at.has(b.a1 === c ? b.a2 : b.a1));
    const others = (n: number) => nbrs.map((b) => (b.a1 === c ? b.a2 : b.a1)).filter((o) => o !== n);
    // a wedge on c–n reads (with the other bonds flat on the page) as the centre's real handedness
    const reads = (n: number, toward: boolean): number => {
      const os = others(n);
      if (os.length < 2) return 0;
      const v = (id: number, flat: boolean) => { const p = P(id); return [p[0] - pc[0], p[1] - pc[1], flat ? 0 : p[2] - pc[2]]; };
      const w = v(n, true);
      w[2] = (toward ? 1 : -1) * L * 0.5;
      let least = Infinity;
      for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) {
        const seen = det(w, v(os[i], true), v(os[j], true)), real = det(v(n, false), v(os[i], false), v(os[j], false));
        if (Math.sign(seen) !== Math.sign(real)) return 0;
        least = Math.min(least, Math.abs(seen) / L ** 3);
      }
      return least;
    };
    const list: Choice[] = [];
    for (const b of nbrs) {
      if (b.order !== 1 || b.display !== 'solid') continue;
      const n = b.a1 === c ? b.a2 : b.a1;
      const an = doc.atoms.get(n)!;
      const toward = (an.depth ?? 0) >= pc[2];
      const clear = reads(n, toward);
      if (clear < 0.005) continue;
      const ring = ringsThroughBond(doc, b.id).length > 0;
      list.push({ id: b.id, n, toward, score: clear + (Math.abs((an.depth ?? 0) - pc[2]) / L) * 0.2 + (ring ? 0 : 0.1) - (centres.has(n) ? 0.2 : 0) });
    }
    choices.set(c, list.sort((p, q) => q.score - p.score));
  }
  // the centres with fewest good bonds choose first, so crowded ring fusions all get one
  let unshown = 0;
  for (const c of [...centres].sort((p, q) => choices.get(p)!.length - choices.get(q)!.length)) {
    const best = choices.get(c)!.find((ch) => !taken.has(ch.id));
    if (!best) {
      // no bond left that reads right (a crowded ring fusion): draw the centre's hydrogen, wedged
      const vc = view[map.indexOf(c)];
      const h = vc && view.findIndex((p, i) => i >= map.length && Math.hypot(p[0] - vc[0], p[1] - vc[1], p[2] - vc[2]) < 1.25);
      if (h === undefined || h < 0) { unshown++; continue; }
      const [x, y, z] = view[h];
      const hx = cx + (x - mx) * s, hy = cy - (y - my) * s, depth = (z - mz) * s;
      const atom = doc.addAtom(hx, hy, 1, { depth, xyz: [hx, hy, -depth] });
      doc.addBond(c, atom.id, 1, depth >= P(c)[2] ? 'wedge' : 'hashWedge');
      continue;
    }
    taken.add(best.id);
    doc.updateBond(best.id, { a1: c, a2: best.n, display: best.toward ? 'wedge' : 'hashWedge' });
  }
  layerByDepth(doc, at.keys());
  return { unshown };
}
