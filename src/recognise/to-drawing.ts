// What the structure reader read, as atoms and bonds in a drawing: elements as atoms, groups it
// read as written (OMe, CO2Et, Boc, R1) as labels the app expands itself, rings it read as
// aromatic given alternating double bonds, and the layout of the picture kept.

import type { Doc } from '../model';
import { elementNumber } from '../chem/elements';
import type { ReadGraph } from './molscribe';

export interface ReadAtom {
  /** The element, or undefined for a group written as a label. */
  z?: number;
  label?: string;
  charge: number;
  isotope?: number;
  /** Written in lower case (aromatic). */
  aromatic: boolean;
  /** Hydrogens written in brackets ([nH], [NH2+]). */
  h: number;
}

const AROMATIC = new Set(['b', 'c', 'n', 'o', 'p', 's', 'se', 'as', 'te']);

/** An atom as the reader wrote it: C, c, Cl, [NH+], [13CH3], [O-], or a group such as [OMe] or [R1]. */
export function parseSymbol(sym: string): ReadAtom {
  const plain = sym.startsWith('[') && sym.endsWith(']') ? sym.slice(1, -1) : sym;
  if (AROMATIC.has(plain)) return { z: elementNumber(plain[0].toUpperCase() + plain.slice(1)), charge: 0, aromatic: true, h: 0 };
  const m = /^(\d+)?([A-Z][a-z]?|b|c|n|o|p|s|se|as|te)(@{0,2})(H(\d*))?([+-]+\d*|\+\d*|-\d*)?$/.exec(plain);
  if (m) {
    const el = m[2], low = el === el.toLowerCase();
    const z = elementNumber(low ? el[0].toUpperCase() + el.slice(1) : el);
    if (z !== undefined) {
      let charge = 0;
      const c = m[6];
      if (c) {
        const sign = c[0] === '+' ? 1 : -1;
        const digits = c.replace(/[+-]/g, '');
        charge = sign * (digits ? parseInt(digits, 10) : c.length);
      }
      return { z, charge, aromatic: low, h: m[4] ? (m[5] ? parseInt(m[5], 10) : 1) : 0, ...(m[1] ? { isotope: parseInt(m[1], 10) } : {}) };
    }
  }
  return { label: plain === '*' ? 'R' : plain, charge: 0, aromatic: false, h: 0 };
}

export interface ReadBond { a: number; b: number; order: number; display: 'solid' | 'wedge' | 'hashWedge'; aromatic: boolean }

export function readBonds(g: ReadGraph): ReadBond[] {
  const out: ReadBond[] = [];
  const n = g.symbols.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const t = g.edges[a]?.[b] ?? 0;
      if (!t) continue;
      if (t === 5) out.push({ a, b, order: 1, display: 'wedge', aromatic: false });
      else if (t === 6) out.push({ a, b, order: 1, display: 'hashWedge', aromatic: false });
      else out.push({ a, b, order: t === 4 ? 1 : t, display: 'solid', aromatic: t === 4 });
    }
  }
  return out;
}

/**
 * Bonds read as aromatic, as single and double bonds: each aromatic atom that needs a double
 * bond gets one (a pyrrole N, O or S, or an atom with a double bond outside the ring, doesn't).
 * Returns false when no such pattern exists (the rings are then left single, to be checked).
 */
export function kekulize(atoms: ReadAtom[], bonds: ReadBond[]): boolean {
  const arom = bonds.filter((b) => b.aromatic);
  if (!arom.length) return true;
  const degree = new Map<number, number>(), hasDouble = new Set<number>();
  for (const b of bonds) {
    for (const x of [b.a, b.b]) degree.set(x, (degree.get(x) ?? 0) + 1);
    if (!b.aromatic && b.order === 2) { hasDouble.add(b.a); hasDouble.add(b.b); }
  }
  const needs = (i: number): 'yes' | 'maybe' | 'no' => {
    const a = atoms[i], d = (degree.get(i) ?? 0) + a.h;
    if (hasDouble.has(i) || a.z === undefined) return 'no';
    if (a.z === 6) return a.charge === 0 ? (d <= 3 ? 'yes' : 'no') : 'maybe';
    if (a.z === 7 || a.z === 15) return a.charge > 0 ? (d <= 3 ? 'yes' : 'no') : d >= 3 ? 'no' : 'maybe';
    if (a.z === 8 || a.z === 16 || a.z === 34) return a.charge > 0 && d <= 2 ? 'yes' : 'no';
    return 'maybe';
  };
  const want = new Map<number, 'yes' | 'maybe'>();
  for (const b of arom) for (const x of [b.a, b.b]) { const w = needs(x); if (w !== 'no') want.set(x, w); }
  const nb = new Map<number, ReadBond[]>();
  for (const b of arom) {
    if (!want.has(b.a) || !want.has(b.b)) continue;
    for (const x of [b.a, b.b]) { if (!nb.has(x)) nb.set(x, []); nb.get(x)!.push(b); }
  }
  const matched = new Set<number>();
  const chosen = new Set<ReadBond>();
  const order = [...want.keys()].sort((x, y) => (nb.get(x)?.length ?? 0) - (nb.get(y)?.length ?? 0));
  let steps = 0;
  const solve = (k: number, maybesLeft: number): boolean => {
    if (++steps > 200000) return false;
    while (k < order.length && matched.has(order[k])) k++;
    if (k === order.length) return true;
    const x = order[k];
    for (const b of nb.get(x) ?? []) {
      const y = b.a === x ? b.b : b.a;
      if (matched.has(y)) continue;
      matched.add(x); matched.add(y); chosen.add(b);
      if (solve(k + 1, maybesLeft)) return true;
      matched.delete(x); matched.delete(y); chosen.delete(b);
    }
    // a pyrrole-type N may stay without one
    if (want.get(x) === 'maybe' && maybesLeft > 0) return solve(k + 1, maybesLeft - 1);
    return false;
  };
  const maybes = [...want.values()].filter((w) => w === 'maybe').length;
  const ok = solve(0, maybes);
  for (const b of arom) { b.order = ok && chosen.has(b) ? 2 : 1; b.aromatic = false; }
  return ok;
}

/** Positions in the picture (the reader's 0 to 1 across, for a picture w × h) as drawing points, one bond length apart on average. */
export function layout(g: ReadGraph, bonds: ReadBond[], w: number, h: number, bondLength: number): [number, number][] {
  const pts = g.coords.map(([x, y]) => [x * w, y * h] as [number, number]);
  const lens = bonds.map((b) => Math.hypot(pts[b.a][0] - pts[b.b][0], pts[b.a][1] - pts[b.b][1])).filter((l) => l > 0).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : Math.max(w, h) / 6;
  const k = bondLength / (median || 1);
  return pts.map(([x, y]) => [x * k, y * k]);
}

export interface Placed { ids: number[]; problems: string[] }

/** Add what was read to the drawing, centred at (cx, cy). */
export function addRead(doc: Doc, g: ReadGraph, w: number, h: number, cx: number, cy: number): Placed {
  const atoms = g.symbols.map(parseSymbol);
  const bonds = readBonds(g);
  const problems: string[] = [];
  if (!kekulize(atoms, bonds)) problems.push('An aromatic ring could not be given alternating double bonds; check its bonds.');
  const pts = layout(g, bonds, w, h, doc.style.bondLength);
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= Math.max(1, pts.length); my /= Math.max(1, pts.length);
  const ids: number[] = [];
  atoms.forEach((a, i) => {
    const atom = doc.addAtom(cx + pts[i][0] - mx, cy + pts[i][1] - my, a.z ?? 6, {
      charge: a.charge, label: a.z === undefined ? a.label ?? 'R' : null, ...(a.isotope ? { isotope: a.isotope } : {}),
    });
    ids.push(atom.id);
  });
  for (const b of bonds) doc.addBond(ids[b.a], ids[b.b], b.order, b.display);
  return { ids, problems };
}
