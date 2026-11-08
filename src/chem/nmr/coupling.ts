// Proton coupling constants (J, Hz) from the 2D structure, by bond path and the atoms along it:
// geminal, vicinal (free rotation, alkene cis/trans, aromatic ortho), meta/para and allylic
// long-range couplings, and H-F couplings. Values are textbook typical values (Pretsch et al.,
// Structure Determination of Organic Compounds; Reich's tables), refined on the SI test set.
// Phase 4 replaces the free-rotation average with Karplus values from 3D conformers.

import { ringInfo } from './env';

export interface JAtom { el: string; arom: boolean; h: number; q?: number; /** set on stereocentres */ legacy?: string | null }
export interface JBond { u: number; v: number; o: number; ez?: 'E' | 'Z' | null }
export interface JGraph { atoms: JAtom[]; bonds: JBond[] }

/** A coupling between the hydrogens on heavy atom a and those on heavy atom b (a === b: geminal),
 *  or (b an F atom) between the hydrogens on a and that fluorine. */
export interface Coupling { a: number; b: number; j: number; kind: string }

interface Nb { n: number; o: number; bond: number }

export let DIASTEREOTOPIC = true;
export const MULT_OPTS = { merge: 1.0, min: 1.7 };
export function setJOptions(o: { diastereotopic?: boolean; merge?: number; min?: number }) { if (o.diastereotopic !== undefined) DIASTEREOTOPIC = o.diastereotopic; if (o.merge !== undefined) MULT_OPTS.merge = o.merge; if (o.min !== undefined) MULT_OPTS.min = o.min; }

const ELNEG: Record<string, number> = { H: 2.2, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Cl: 3.16, Br: 2.96, I: 2.66, S: 2.58, P: 2.19, Si: 1.9, B: 2.04, Se: 2.55, Sn: 1.96 };

export function predictCouplings(g: JGraph): Coupling[] {
  const nbs: Nb[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, i) => { nbs[b.u].push({ n: b.v, o: b.o, bond: i }); nbs[b.v].push({ n: b.u, o: b.o, bond: i }); });
  const ring = ringInfo({ atoms: g.atoms.map((a) => ({ el: a.el, q: a.q ?? 0, arom: a.arom, h: a.h })), bonds: g.bonds.map(({ u, v, o }) => ({ u, v, o })) });
  const at = g.atoms;
  const hyb = (i: number) => {
    if (at[i].arom) return 2;
    const os = nbs[i].map((x) => x.o);
    if (os.includes(3) || os.filter((o) => o === 2).length >= 2) return 1;
    return os.includes(2) ? 2 : 3;
  };
  const out: Coupling[] = [];
  const add = (a: number, b: number, j: number, kind: string) => { if (Math.abs(j) >= 0.3) out.push({ a: Math.min(a, b), b: Math.max(a, b), j, kind }); };
  const isC = (i: number) => at[i].el === 'C';
  // sum of electronegativity excess of substituents (not H, not the path atoms)
  const subst = (i: number, skip: number[]) => nbs[i].filter((x) => !skip.includes(x.n)).reduce((t, x) => t + Math.max(0, (ELNEG[at[x.n].el] ?? 2.5) - 2.2), 0);

  // geminal: sp2 =CH2 (1-2 Hz); sp3 CH2 only shows its geminal coupling when its two protons are
  // diastereotopic: in a chiral molecule (any stereocentre), within the ring or next to the centre
  const chiral = at.some((a) => a.legacy);
  at.forEach((a, i) => {
    if (a.el === 'C' && a.h === 2 && hyb(i) === 2 && !a.arom) add(i, i, 1.5, 'gem-sp2');
    else if (DIASTEREOTOPIC && chiral && a.el === 'C' && a.h === 2 && hyb(i) === 3) {
      const near = ring.atom[i] > 0 || nbs[i].some((x) => at[x.n].legacy || nbs[x.n].some((y) => at[y.n].legacy));
      if (near) add(i, i, nbs[i].some((x) => x.o === 2 || at[x.n].arom || hyb(x.n) === 2) ? -14.5 : -12.8, 'gem-sp3');
    }
  });

  // vicinal H-C-X-H
  g.bonds.forEach((b, bi) => {
    const { u, v } = b;
    if (!at[u].h || !at[v].h) return;
    if (!isC(u) || !isC(v)) return; // N-H / O-H usually exchange, so no coupling is seen
    if (at[u].arom && at[v].arom) {
      const r = ring.bond[bi];
      const het = (x: number) => nbs[x].some((y) => at[y.n].arom && at[y.n].el !== 'C');
      if (r === 6) {
        // pyridine-like: H2-H3 ~4.8 when one end is next to the ring N; ~6.3 next to N+ (pyridinium, N-oxide)
        const plus = (x: number) => nbs[x].some((y) => at[y.n].arom && at[y.n].el === 'N' && (at[y.n].q ?? 0) > 0);
        add(u, v, plus(u) || plus(v) ? 6.3 : het(u) || het(v) ? 5.0 : 7.9, 'ortho');
      } else if (r === 5) {
        const ringHet = (x: number) => nbs[x].find((y) => at[y.n].arom && at[y.n].el !== 'C');
        const hu = ringHet(u), hv = ringHet(v);
        const el = (hu ?? hv) ? at[(hu ?? hv)!.n].el : 'C';
        // 2,3-coupling (next to the heteroatom) vs 3,4
        const j23: Record<string, number> = { O: 1.8, S: 5.0, N: 2.7, Se: 5.6 };
        const j34: Record<string, number> = { O: 3.3, S: 3.6, N: 3.4, Se: 4.0 };
        add(u, v, hu || hv ? j23[el] ?? 2.5 : j34[firstRingHetero(u)] ?? 3.4, 'ortho5');
      } else add(u, v, 7.5, 'ortho');
      return;
    }
    if (b.o === 2) {
      // alkene: cis ~10.8 (smaller in small rings), trans ~16.5; electronegative substituents lower
      // both. Carbon substituents leave cis alone (cis-2-butene 10.8, styrene 10.9, methyl acrylate
      // 10.4) while heteroatoms lower it (vinyl acetate 6.3, Z-1-chloropropene 7.0).
      const r = ring.bond[bi];
      const e = subst(u, [v]) + subst(v, [u]);
      const heteroSubst = (i: number) => nbs[i].filter((x) => x.n !== (i === u ? v : u) && !isC(x.n)).reduce((t, x) => t + Math.max(0, (ELNEG[at[x.n].el] ?? 2.5) - 2.2), 0);
      let cis = r === 3 ? 1.5 : r === 4 ? 2.8 : r === 5 ? 5.5 : r === 6 ? 10.0 : 10.8 - 3.7 * (heteroSubst(u) + heteroSubst(v));
      let trans = 17.2 - 2.5 * e;
      if (at[u].h === 2 || at[v].h === 2) {
        // terminal vinyl: both couplings, the =CH2 protons are inequivalent
        out.push({ a: Math.min(u, v), b: Math.max(u, v), j: trans, kind: 'trans' });
        out.push({ a: Math.min(u, v), b: Math.max(u, v), j: cis, kind: 'cis' });
        return;
      }
      // a 1,2-disubstituted cis alkene conjugated to an aryl or C=O is larger (cis-stilbene 12.2,
      // Z-methyl cinnamate 12.7, Z-methyl crotonate 11.5)
      const conj = (i: number) => (nbs[i].some((x) => x.n !== (i === u ? v : u) && isC(x.n) && hyb(x.n) !== 3) ? 1 : 0);
      if (!r) cis += 0.7 * (conj(u) + conj(v));
      cis = Math.max(cis, 1.5); trans = Math.max(trans, 10);
      add(u, v, r ? cis : b.ez === 'E' ? trans : b.ez === 'Z' ? cis : (cis + trans) / 2, r ? 'cis' : b.ez === 'E' ? 'trans' : 'cis');
      return;
    }
    if (b.o === 1) {
      const hu = hyb(u), hv = hyb(v);
      // aldehyde H on sp3 CH: 1-3 Hz
      const ald = (x: number) => !at[x].arom && nbs[x].some((y) => y.o === 2 && at[y.n].el === 'O');
      if (ald(u) || ald(v)) { add(u, v, hu === 3 || hv === 3 ? 1.8 : 7.5, 'CHO'); return; }
      if (hu === 2 && hv === 2) { add(u, v, 11.0, 's-trans diene'); return; }
      if (hu === 1 || hv === 1) return;
      if (hu === 2 || hv === 2) { add(u, v, 6.8, 'allylic-vic'); return; }
      // sp3-sp3, rotating: ~7.2, lowered by electronegative substituents (Altona-like)
      const e = subst(u, [v]) + subst(v, [u]);
      const r = ring.bond[bi];
      let j = 7.3 - 0.2 * e;
      if (r === 3) j = 7.0; // cyclopropane, cis/trans averaged
      else if (r === 4) j = 7.5;
      else if (r === 5) j = 7.0;
      else if (r === 6) j = 6.5; // ax-ax/ax-eq/eq-eq average until 3D
      add(u, v, Math.max(j, 3.5), 'vic');
    }
  });

  // four-bond: aromatic meta, allylic, propargylic; five-bond aromatic para (small)
  for (let x = 0; x < at.length; x++) {
    for (const p of nbs[x]) for (const q of nbs[x]) {
      if (p.n >= q.n) continue;
      // H-C(p)...C(q)-H through x (meta in rings)
      const a = p.n, b = q.n;
      if (!at[a].h || !at[b].h || !isC(a) || !isC(b)) continue;
      if (at[a].arom && at[b].arom && at[x].arom) {
        const r = ring.atom[x];
        const nextToN = (y: number) => nbs[y].some((z) => at[z.n].arom && at[z.n].el === 'N');
        // pyridine: H2-H6 across the N ~0; H3-H5 (N para to the middle carbon) 1.4; H2-H4 1.8
        if (r === 6 && at[x].el !== 'C') continue;
        const nTwoAway = (y: number) => nbs[y].some((z) => z.n !== x && at[z.n].arom && nextToN(z.n));
        add(a, b, r === 5 ? (at[x].el === 'C' ? 1.5 : 1.0) : nextToN(a) || nextToN(b) ? 1.8 : nTwoAway(a) && nTwoAway(b) ? 1.4 : 1.6, 'meta');
      } else if (!at[a].arom && hyb(a) === 3 && p.o === 1 && q.o === 2 && hyb(b) === 2 && !at[b].arom) {
        add(a, b, -1.5, 'allylic');
      } else if (!at[b].arom && hyb(b) === 3 && q.o === 1 && p.o === 2 && hyb(a) === 2 && !at[a].arom) {
        add(a, b, -1.5, 'allylic');
      }
    }
  }
  // propargylic H-C-C≡C-H
  g.bonds.forEach((b) => {
    if (b.o !== 3) return;
    for (const [s, t] of [[b.u, b.v], [b.v, b.u]]) {
      if (!at[t].h) continue;
      for (const p of nbs[s]) if (p.n !== t && at[p.n].h && isC(p.n) && hyb(p.n) === 3) add(p.n, t, 2.5, 'propargylic');
    }
  });

  // H-F
  at.forEach((f, fi) => {
    if (f.el !== 'F') return;
    for (const p of nbs[fi]) {
      if (at[p.n].h) add(p.n, fi, at[p.n].h === 1 && hyb(p.n) === 2 ? 80 : at[p.n].h === 3 ? 0 : 47.5, 'HF-gem');
      for (const q of nbs[p.n]) {
        if (q.n === fi || !at[q.n].h) continue;
        if (at[q.n].arom && at[p.n].arom) add(q.n, fi, 8.8, 'HF-ortho');
        else if (p.o === 2 || q.o === 2) add(q.n, fi, 20, 'HF-vic-sp2');
        else add(q.n, fi, at[p.n].h || nbs[p.n].filter((x) => at[x.n].el === 'F').length === 1 ? 21 : 1.0, 'HF-vic');
        if (at[p.n].arom) for (const r of nbs[q.n]) if (r.n !== p.n && at[r.n].arom && at[r.n].h) add(r.n, fi, 5.5, 'HF-meta');
      }
    }
  });
  return dedupe(out);

  function firstRingHetero(i: number): string {
    // atom i is a 3/4-position carbon of a 5-ring: find the ring heteroatom two bonds away
    for (const p of nbs[i]) for (const q of nbs[p.n]) if (at[q.n].arom && at[q.n].el !== 'C') return at[q.n].el;
    return 'C';
  }
}

function dedupe(cs: Coupling[]): Coupling[] {
  const seen = new Set<string>();
  return cs.filter((c) => {
    const k = `${c.a},${c.b},${c.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** First-order multiplet text for the hydrogens of one group, from (J, number of equivalent
 *  partner nuclei) pairs: couplings within `merge` Hz are treated as equal, those below `min` are
 *  not resolved. E.g. [[7.9, 1], [1.6, 2]] -> { mult: 'dt', j: [7.9, 1.6] }. */
export function multiplet(partners: [number, number][], merge = 1.0, min = 1.7): { mult: string; j: number[] } {
  const ps = partners.filter(([j]) => Math.abs(j) >= min).map(([j, n]) => [Math.abs(j), n] as [number, number]).sort((x, y) => y[0] - x[0]);
  const groups: { j: number; n: number }[] = [];
  for (const [j, n] of ps) {
    const g = groups.find((x) => Math.abs(x.j - j) <= merge);
    if (g) { g.j = (g.j * g.n + j * n) / (g.n + n); g.n += n; } else groups.push({ j, n });
  }
  const L = ['', 'd', 't', 'q', 'p', 'sext', 'sept', 'oct', 'non'];
  if (!groups.length) return { mult: 's', j: [] };
  if (groups.length > 3 || groups.some((x) => x.n >= L.length)) return { mult: 'm', j: groups.map((x) => +x.j.toFixed(1)) };
  return { mult: groups.map((x) => L[x.n]).join(''), j: groups.map((x) => +x.j.toFixed(1)) };
}

export interface ProtonGroup { atoms: number[]; shift: number; n: number; mult: string; j: number[] }

/** Proton groups (hydrogens on atoms with the same environment code are equivalent) with their
 *  predicted first-order multiplets. shifts: predicted 1H shift per heavy atom (NaN when none). */
export function protonGroups(g: JGraph, shifts: number[], codes: string[]): ProtonGroup[] {
  const cs = predictCouplings(g);
  const cls = new Map<string, number[]>();
  g.atoms.forEach((a, i) => {
    if (!a.h || Number.isNaN(shifts[i])) return;
    const k = codes[i];
    if (!cls.has(k)) cls.set(k, []);
    cls.get(k)!.push(i);
  });
  const out: ProtonGroup[] = [];
  for (const atoms of cls.values()) {
    const rep = atoms[0], same = new Set(atoms);
    const partners: [number, number][] = [];
    for (const c of cs) {
      if (c.a !== rep && c.b !== rep) continue;
      const other = c.a === rep ? c.b : c.a;
      if (other === rep) { partners.push([c.j, 1]); continue; } // geminal / vinyl pair partner
      if (same.has(other) && g.atoms[other].el !== 'F') continue; // equivalent protons do not split each other
      partners.push([c.j, g.atoms[other].el === 'F' ? 1 : g.atoms[other].h]);
    }
    const m = multiplet(partners, MULT_OPTS.merge, MULT_OPTS.min);
    out.push({ atoms, shift: atoms.reduce((t, i) => t + shifts[i], 0) / atoms.length, n: atoms.reduce((t, i) => t + g.atoms[i].h, 0), mult: m.mult, j: m.j });
  }
  return out;
}
