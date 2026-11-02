// Tab's ways of putting a template down, without repeats. Two ways count as one when they draw
// the same atoms in the same places (a symmetric template turned or mirrored onto itself) or,
// when the template is joined to a structure, when they make the same molecule: a naphthalene
// fused onto a naphthalene four ways is one compound (2,3-benzo, so "anthracene"), not four.
// A way that adds nothing (every atom lands on an atom already there) is dropped too.
//
// The molecule is compared by its graph, as the drawing would have it after the template went
// down (atoms that land on atoms are shared, double bonds moved round as placeTemplate does):
// elements, charges, labels, bonds and their orders, refined round the graph until it settles
// (Weisfeiler-Lehman), which tells apart the structures a template can make. Kekulé forms of the
// same ring count as one: an atom's double bonds are counted, not where they go.

import type { Doc } from '../model';
import { type Template, type Placement, templatePoints, rematch } from './templates';
import { atomAt, MERGE_FRACTION } from './chemgeom';
import { elementNumber } from './elements';

export interface ChoiceLike {
  pl: Placement;
  existing: Map<number, number>;
  bondFrom?: number;
  noMerge?: boolean;
}

/** The most bonds (counting a double bond as two) carbon, nitrogen and oxygen take, before a positive charge adds one. */
const MAX_VALENCE: Record<number, number> = { 6: 4, 7: 3, 8: 2 };

/** Structures bigger than this are compared by where the atoms go only (the graph sums would slow the pointer). */
const MAX_ATOMS = 600;

/** A short, stable hash of a string (cyrb53). */
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Where the template's atoms would go: the drawn atom each lands on, or null for a new one. */
function landing(doc: Doc, t: Template, c: ChoiceLike): (number | null)[] {
  const pts = templatePoints(t, c.pl);
  const tol = c.pl.scale * MERGE_FRACTION;
  const used = new Set<number>(c.existing.values());
  return t.atoms.map((_, i) => {
    let id = c.existing.get(i);
    if (id === undefined && !c.noMerge) id = atomAt(doc, pts[i], tol, used)?.id;
    if (id === undefined) return null;
    used.add(id);
    return id;
  });
}

/** The atoms' places and elements, in no particular order: the same for two ways that draw the same thing. */
export function drawnSignature(t: Template, pl: Placement): string {
  const pts = templatePoints(t, pl);
  const tol = Math.max(1e-6, pl.scale * 0.05);
  return pts.map((p, i) => `${Math.round(p.x / tol)},${Math.round(p.y / tol)},${t.atoms[i][2]},${t.atoms[i][3] ?? 0},${t.atoms[i][4] ?? ''}`).sort().join(' ');
}

/**
 * The molecule the drawing would hold round the template once it is put down this way (the
 * structures it touches, and the template), as a hash; null when that can't be told cheaply.
 * '' when the template would add nothing.
 */
export function moleculeSignature(doc: Doc, t: Template, c: ChoiceLike): string | null {
  const land = landing(doc, t, c);
  const ids: (number | string)[] = land.map((id, i) => id ?? `n${i}`);
  // the drawn structures the template touches
  const seeds = land.filter((id): id is number => id !== null);
  if (c.bondFrom !== undefined) seeds.push(c.bondFrom);
  const drawn = new Set<number>();
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop()!;
    if (drawn.has(id) || !doc.atoms.has(id)) continue;
    drawn.add(id);
    if (drawn.size > MAX_ATOMS) return null;
    for (const bid of doc.adj.get(id) ?? []) {
      const b = doc.bonds.get(bid);
      if (b) stack.push(b.a1 === id ? b.a2 : b.a1);
    }
  }
  // nodes and their own labels
  const label = new Map<number | string, string>();
  for (const id of drawn) {
    const a = doc.atoms.get(id)!;
    label.set(id, `${a.z}|${a.charge}|${a.label ?? ''}|${a.isotope}|${a.multi ? 'm' : ''}`);
  }
  t.atoms.forEach(([, , el, charge, lab], i) => { if (land[i] === null) label.set(`n${i}`, `${elementNumber(el) ?? 6}|${charge ?? 0}|${lab ?? ''}|0|`); });
  const key = (a: number | string, b: number | string) => (String(a) < String(b) ? `${a}~${b}` : `${b}~${a}`);
  const edges = new Map<string, [number | string, number | string, number]>();
  for (const id of drawn) {
    for (const bid of doc.adj.get(id) ?? []) {
      const b = doc.bonds.get(bid);
      if (b && drawn.has(b.a1) && drawn.has(b.a2)) edges.set(key(b.a1, b.a2), [b.a1, b.a2, b.order]);
    }
  }
  // the template's bonds, double bonds moved as placeTemplate moves them next to drawn ones
  const hasDouble = (id: number) => (doc.adj.get(id) ?? []).some((bid) => (doc.bonds.get(bid)?.order ?? 0) >= 2);
  const satisfied = (i: number) => land[i] !== null && hasDouble(land[i]!);
  const doubles = t.atoms.some((_, i) => satisfied(i)) ? rematch(t, satisfied) : null;
  let added = land.some((id) => id === null);
  t.bonds.forEach(([i, j, order, display], k) => {
    const a = ids[i], b = ids[j];
    if (a === b || edges.has(key(a, b))) return;
    let o = order;
    if (doubles && (o === 1 || o === 2) && !display) o = doubles.has(k) ? 2 : 1;
    else if (o === 2 && (satisfied(i) || satisfied(j))) o = 1;
    edges.set(key(a, b), [a, b, o]);
    added = true;
  });
  if (c.bondFrom !== undefined && !edges.has(key(c.bondFrom, ids[t.attach]))) {
    edges.set(key(c.bondFrom, ids[t.attach]), [c.bondFrom, ids[t.attach], 1]);
    added = true;
  }
  if (!added) return '';
  // an atom given more bonds than it can have (the template laid over the structure): a way to skip
  const valence = new Map<number | string, number>();
  for (const [a, b, o] of edges.values()) { valence.set(a, (valence.get(a) ?? 0) + o); valence.set(b, (valence.get(b) ?? 0) + o); }
  let over = false;
  for (const [id, l] of label) {
    const [z, charge, lab] = l.split('|');
    const max = lab ? undefined : MAX_VALENCE[Number(z)];
    if (max !== undefined && (valence.get(id) ?? 0) > max + Math.max(0, Number(charge) || 0) + 0.01) over = true;
  }
  // Kekulé forms alike: an atom's double bonds counted, single and double bonds alike otherwise
  const nbrs = new Map<number | string, [number | string, string][]>();
  const doublesAt = new Map<number | string, number>();
  for (const id of label.keys()) nbrs.set(id, []);
  for (const [a, b, o] of edges.values()) {
    const kind = o === 1 || o === 2 || o === 1.5 ? 's' : String(o);
    nbrs.get(a)?.push([b, kind]);
    nbrs.get(b)?.push([a, kind]);
    if (o === 2) { doublesAt.set(a, (doublesAt.get(a) ?? 0) + 1); doublesAt.set(b, (doublesAt.get(b) ?? 0) + 1); }
    if (o === 1.5) { doublesAt.set(a, (doublesAt.get(a) ?? 0) + 0.5); doublesAt.set(b, (doublesAt.get(b) ?? 0) + 0.5); }
  }
  let cur = new Map<number | string, string>();
  for (const [id, l] of label) cur.set(id, hash(`${l}|${Math.round(doublesAt.get(id) ?? 0)}`));
  let classes = new Set(cur.values()).size;
  for (let round = 0; round < label.size; round++) {
    const next = new Map<number | string, string>();
    for (const [id, l] of cur) next.set(id, hash(l + '(' + nbrs.get(id)!.map(([n, k]) => `${k}${cur.get(n)}`).sort().join(',') + ')'));
    cur = next;
    const n = new Set(cur.values()).size;
    if (n === classes) break;
    classes = n;
  }
  return (over ? '!' : '') + hash(`${label.size}/${edges.size}/` + [...cur.values()].sort().join(','));
}

/**
 * The ways to offer, best first, with repeats left out (see above). `chemistry`: compare the
 * molecules made, as well as the drawing (for a template joined to a structure; a template put
 * down on its own is turned and mirrored for the look, so only drawings that match are repeats).
 */
export function distinctChoices<C extends ChoiceLike>(doc: Doc, t: Template, choices: C[], chemistry: boolean): C[] {
  if (choices.length < 2) return choices;
  // wedges and depths: the molecule's graph can't tell the ways apart, so compare drawings only
  const stereo = !!t.z || t.bonds.some(([, , , d]) => d && d !== 'solid' && d !== 'bold');
  const sigs = choices.map((c) => {
    const m = chemistry && !stereo ? moleculeSignature(doc, t, c) : null;
    return m === null ? `d:${drawnSignature(t, c.pl)}` : m === '' ? '' : `m:${m}`;
  });
  // ways that add nothing, or overload an atom, are left out while there are better ones
  const good = sigs.some((g) => g && !g.startsWith('m:!'));
  const out: C[] = [];
  const seen = new Set<string>();
  choices.forEach((c, i) => {
    const g = sigs[i];
    if (!g || (good && g.startsWith('m:!')) || seen.has(g)) return;
    seen.add(g);
    out.push(c);
  });
  return out.length ? out : choices.slice(0, 1);
}
