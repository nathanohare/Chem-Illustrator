// Drawing what curved arrows make. The electron-pushing arrows drawn on a structure are read as
// electrons moving (a full head moves a pair, a fishhook one), and the next intermediate is drawn
// from them: bonds made and broken, charges and radicals moved, lone pairs drawn where the
// starting structure showed them. Before that the arrows are checked: each must start at
// electrons there are (a lone pair, a negative charge, a radical, a bond) and end somewhere they
// can go, and nothing may end up with more than an octet (a five-bond carbon). The checks follow
// the usual electron bookkeeping (formal charge = valence electrons − non-bonding electrons −
// bonds), so they don't depend on how the arrows look.

import type { Arrow, Atom, Doc, Shape } from '../model';
import { Doc as Drawing, isMetalAtom, outsideValence } from '../model';
import type { Rect, Vec } from '../geom';
import { add, angleOf, DEG, dist, fromAngle, mul, norm, normAngle, perp, sub } from '../geom';
import type { Measure } from '../editor/arrange';
import { arrowPoints, isCurved } from '../objects';
import { hasImplicitH, implicitHydrogens, SYMBOLS, valenceOfBonds } from './elements';
import { groupNumber } from './electrons';
import { headEnd, isAtomSymbol, pairOwner, pushEndAt, symbolSpot, tailEnd, type PushEnd } from './mechanism';
import { sproutDir } from './chemgeom';
import { atomWarnings } from './warnings';

/** Something wrong (or worth a second look) with the arrows: what, and the arrows, atoms and bonds it is about. */
export interface PushIssue {
  /** An error stops the next structure being drawn; a warning is only said. */
  level: 'error' | 'warning';
  text: string;
  arrows: number[];
  atoms: number[];
  bonds: number[];
}

/** One arrow read as electrons moving: how many (2 for a full head, 1 for a fishhook), from where to where. */
export interface PushStep { arrow: number; k: number; from: PushEnd; to: PushEnd }

/** What a set of arrows does to the structure they are drawn on. */
export interface PushReading {
  steps: PushStep[];
  /** Change in each atom's non-bonding electrons. */
  dn: Map<number, number>;
  /** Change in the electrons of the bond between two atoms (key "a-b", lower id first). */
  de: Map<string, number>;
  /** The atoms the arrows change, with their charge, unpaired electrons and hydrogens after. */
  after: Map<number, { charge: number; radical: Atom['radical']; h: number | null }>;
  issues: PushIssue[];
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const unkey = (k: string): [number, number] => k.split('-').map(Number) as [number, number];
const bump = <K>(m: Map<K, number>, k: K, by: number) => m.set(k, (m.get(k) ?? 0) + by);

/** An electron-pushing arrow: curved, one-way, with a head (full or fishhook). */
export function isPushArrow(r: Arrow): boolean {
  return isCurved(r) && !r.equilibrium && !r.elbow && r.headStyle !== 'none';
}

/** What an arrow's end is on: what it is stuck to, else what lies under it. */
export function arrowEnd(doc: Doc, m: Measure, r: Arrow, which: 'tail' | 'head'): PushEnd {
  const pin = r.pin?.[which];
  if (pin && pin.ref.slice(0, pin.on === 'atom' ? 1 : 2).every((id) => doc.atoms.has(id))) {
    if (pin.on === 'atom') return { kind: 'atom', id: pin.ref[0] };
    const [a1, a2] = pin.ref;
    const b = doc.bondBetween(a1, a2);
    return b ? { kind: 'bond', id: b.id } : { kind: 'gap', a1, a2 };
  }
  const p = r[which];
  const e = pushEndAt(doc, m, p);
  if (which === 'head') return headEnd(doc, e, p);
  const t = tailEnd(doc, e, p);
  if (t.kind !== 'pair') return t;
  const o = pairOwner(doc, doc.shapes.get(t.id)!);
  return o === null ? { kind: 'point', p } : { kind: 'atom', id: o };
}

const NAMES: Record<number, string> = { 1: 'hydrogen', 5: 'boron', 6: 'carbon', 7: 'nitrogen', 8: 'oxygen', 9: 'fluorine', 14: 'silicon', 15: 'phosphorus', 16: 'sulfur', 17: 'chlorine', 35: 'bromine', 53: 'iodine' };

/** "this carbon", "this O⁻", "“OMe”": how a message names an atom. */
function atomWord(a: Atom): string {
  if (a.label) return `“${a.label}”`;
  const sign = a.charge ? (Math.abs(a.charge) > 1 ? String(Math.abs(a.charge)) : '') + (a.charge > 0 ? '+' : '−') : '';
  if (!sign && NAMES[a.z]) return `this ${NAMES[a.z]}`;
  return `this ${SYMBOLS[a.z] ?? '?'}${sign}`;
}

/** Valence electrons of a main-group element (null for the rest). */
function valenceElectrons(z: number): number | null {
  if (z === 1) return 1;
  const g = groupNumber(z);
  if (g === null) return null;
  return g <= 2 ? g : g >= 13 ? g - 10 : null;
}

/** B, C, N, O and F: atoms that can't go past an octet. */
const OCTET = new Set([5, 6, 7, 8, 9]);

interface Electrons { v: number; h: number; bonds: number; nb: number }

/**
 * An atom's electrons as drawn: valence electrons, hydrogens, bonds and non-bonding electrons
 * (lone pairs and unpaired ones). Null where they can't be told simply: a label, a metal or an
 * atom bonded to one, a ring's middle, a point of attachment.
 */
function electronsOf(doc: Doc, id: number): Electrons | null {
  const a = doc.atoms.get(id);
  if (!a || a.label || a.multi || a.attach || isMetalAtom(a)) return null;
  const v = valenceElectrons(a.z);
  if (v === null) return null;
  const orders: number[] = [];
  for (const bid of doc.adj.get(id) ?? []) {
    const b = doc.bonds.get(bid)!;
    if (outsideValence(b) || isMetalAtom(doc.atoms.get(b.a1 === id ? b.a2 : b.a1))) return null;
    orders.push(b.order);
  }
  const bonds = valenceOfBonds(orders, a.z);
  const h = hasImplicitH(a.z) ? implicitHydrogens(a.z, doc.valenceSum(id), a.charge) : 0;
  return { v, h, bonds, nb: v - a.charge - bonds - h };
}

/** The arrows among these that push electrons, in the order they were drawn. */
export function pushArrowsOf(doc: Doc, ids: Iterable<number>): Arrow[] {
  return [...ids].map((id) => doc.arrows.get(id)).filter((r): r is Arrow => !!r && isPushArrow(r)).sort((a, b) => a.id - b.id);
}

/**
 * Read arrows as electrons moving, and check them: every arrow starts at electrons that are
 * there and ends where they can go, and no atom ends past its octet.
 */
export function readPushes(doc: Doc, m: Measure, arrows: Arrow[]): PushReading {
  const issues: PushIssue[] = [];
  const say = (level: PushIssue['level'], text: string, about: { arrows?: number[]; atoms?: number[]; bonds?: number[] }) =>
    issues.push({ level, text, arrows: about.arrows ?? [], atoms: about.atoms ?? [], bonds: about.bonds ?? [] });
  const steps: PushStep[] = [];
  const dn = new Map<number, number>(), de = new Map<string, number>();
  // where each atom's electrons went, to tell a backwards arrow
  const gaveTo = new Map<number, number[]>();
  for (const r of arrows) {
    const k = r.headStyle === 'full' ? 2 : 1;
    if (r.tailStyle !== 'none') { say('warning', 'A double-headed curved arrow doesn\'t show which way electrons go, so it was left out.', { arrows: [r.id] }); continue; }
    const from = arrowEnd(doc, m, r, 'tail'), to = arrowEnd(doc, m, r, 'head');
    if (from.kind === 'point') { say('error', 'This arrow doesn\'t start on a lone pair, a bond or an atom. Start it at the electrons that move.', { arrows: [r.id] }); continue; }
    if (to.kind === 'point') { say('error', 'This arrow doesn\'t point at an atom, a bond or the gap where a new bond forms.', { arrows: [r.id] }); continue; }
    const src = from.kind === 'atom' ? [from.id] : pairOf(doc, from);
    // where the electrons go: onto an atom (as a lone pair), or into a bond (old or new)
    let dest: { atom: number } | { bond: [number, number] } | null = null;
    if (to.kind === 'atom') {
      if (from.kind === 'atom' && from.id === to.id) { say('error', 'This arrow starts and ends on the same atom.', { arrows: [r.id], atoms: [to.id] }); continue; }
      if (from.kind !== 'atom' && src.includes(to.id)) dest = { atom: to.id };
      else if (from.kind === 'atom') dest = { bond: [from.id, to.id] };
      else {
        // a bond's electrons reaching for another atom: the new bond is from the end nearer it
        const t = doc.atoms.get(to.id)!;
        const [x, y] = src.map((id) => doc.atoms.get(id)!);
        dest = { bond: [dist(x, t) <= dist(y, t) ? x.id : y.id, to.id] };
      }
    } else {
      const pq = pairOf(doc, to);
      if (from.kind !== 'atom' && key(src[0], src[1]) === key(pq[0], pq[1])) { say('error', 'This arrow starts and ends on the same bond.', { arrows: [r.id], atoms: pq }); continue; }
      if (!src.some((id) => pq.includes(id))) {
        say('error', to.kind === 'gap'
          ? 'This arrow makes a new bond between two atoms its electrons don\'t come from. The electrons for a new bond come from one of its two atoms (a lone pair) or a bond to one of them.'
          : 'This arrow moves electrons into a bond they aren\'t next to. Point it at the atom they go to instead, or start it on that bond\'s atom or a bond beside it.', { arrows: [r.id], atoms: pq });
        continue;
      }
      dest = { bond: pq };
    }
    steps.push({ arrow: r.id, k, from, to });
    if (from.kind === 'atom') bump(dn, from.id, -k); else bump(de, key(src[0], src[1]), -k);
    if ('atom' in dest) bump(dn, dest.atom, k);
    else {
      bump(de, key(dest.bond[0], dest.bond[1]), k);
      if (from.kind === 'atom') gaveTo.set(from.id, [...(gaveTo.get(from.id) ?? []), dest.bond[1] === from.id ? dest.bond[0] : dest.bond[1]]);
    }
  }

  // bonds: whole numbers of pairs, none below nothing, none past a triple bond
  const arrowsAt = (ids: number[]) => steps.filter((s) => [s.from, s.to].some((e) => endAtoms(doc, e).some((id) => ids.includes(id)))).map((s) => s.arrow);
  for (const [kk, d] of de) {
    if (!d) continue;
    const [a1, a2] = unkey(kk);
    const b = doc.bondBetween(a1, a2);
    const about = { arrows: arrowsAt([a1, a2]), atoms: [a1, a2], bonds: b ? [b.id] : [] };
    if (b && b.order === 1.5) { say('error', 'Arrows can\'t be read around an aromatic ring drawn with a circle or dashed bonds. Draw it with alternating single and double bonds.', about); continue; }
    if (b && (outsideValence(b) || b.display === 'dative')) { say('error', 'Arrows into or out of a partial, dative or hapto bond can\'t be read.', about); continue; }
    const after = (b?.order ?? 0) + d / 2;
    if (!Number.isInteger(after)) say('error', 'A bond would be left with one electron. Each fishhook (half-headed) arrow moves one electron, so a bond made or broken that way needs two: one from each side.', about);
    else if (after < 0) say('error', `This bond hasn't the electrons to give: ${(b?.order ?? 0) === 1 ? 'a single bond holds one pair' : `it has ${b?.order ?? 0} pairs`}, and the arrows take ${-d / 2}.`, about);
    else if (after > 3) say('error', 'This would make a bond of more than three pairs.', about);
  }

  // atoms: electrons to give, and no more than an octet after
  const touched = new Set<number>(dn.keys());
  for (const kk of de.keys()) for (const id of unkey(kk)) touched.add(id);
  const after = new Map<number, { charge: number; radical: Atom['radical']; h: number | null }>();
  // too many electrons on an atom only because an arrow started where there were none: that arrow is the problem
  const crowded: PushIssue[] = [];
  for (const id of touched) {
    const a = doc.atoms.get(id)!;
    const dnA = dn.get(id) ?? 0;
    let share = 0;
    for (const [kk, d] of de) if (unkey(kk).includes(id)) share += d / 2;
    const charge = a.charge - dnA - share;
    const radical: Atom['radical'] = dnA % 2 === 0 ? a.radical : a.radical === 'doublet' ? undefined : 'doublet';
    const e = electronsOf(doc, id);
    after.set(id, { charge: Number.isInteger(charge) ? charge : a.charge, radical, h: e ? e.h : null });
    if (!e || !Number.isInteger(charge)) continue;
    const about = { arrows: arrowsAt([id]), atoms: [id] };
    const nb = e.nb + dnA, bonds = e.bonds + share;
    const who = atomWord(a), Who = who[0].toUpperCase() + who.slice(1);
    if (nb < 0) {
      let text: string;
      if (e.nb === 0) text = `${Who} has no lone pair to give. Arrows start at electrons: a lone pair, a negative charge or a bond.`;
      else if (e.nb === 1 && dnA < -1) text = `${Who} has one unpaired electron, not a pair: a fishhook (half-headed) arrow moves one electron.`;
      else text = `More arrows start at ${who} than it has lone pairs for.`;
      // a backwards arrow: from where electrons are wanted to where they are
      const back = (gaveTo.get(id) ?? []).some((o) => { const eo = electronsOf(doc, o); return !!eo && eo.nb >= 2; });
      if (back) text += ' Is the arrow drawn the wrong way around? It should run from the electrons to where they go.';
      say('error', text, about);
      continue;
    }
    if (a.z === 1 && nb + 2 * bonds > 2) { say('error', 'This hydrogen would have two bonds. An arrow should take the electrons of its old bond away (from its bond to an atom).', about); continue; }
    const shell = nb + 2 * (bonds + e.h);
    if (OCTET.has(a.z) && shell > 8) {
      const n = bonds + e.h;
      const pi = (doc.adj.get(id) ?? []).some((bid) => (doc.bonds.get(bid)?.order ?? 0) >= 2);
      crowded.push({ level: 'error', arrows: about.arrows, atoms: about.atoms, bonds: [], text: `${Who} would end up with ${n > 4 ? `${n} bonds` : `${shell} electrons`}${e.h && n > 4 ? ` (counting its ${e.h} H)` : ''}: more than an octet. Another arrow should take a pair away from it${pi ? ', such as from its double bond onto the other atom' : ', from one of its bonds'}.` });
      continue;
    }
    if (OCTET.has(a.z) && Math.abs(charge) >= 2) say('warning', `${Who} ends up with a ${Math.abs(charge)}${charge > 0 ? '+' : '−'} charge. Check that is meant.`, about);
  }
  const empty = new Set(issues.filter((i) => /no lone pair to give|than it has lone pairs|not a pair/.test(i.text)).flatMap((i) => i.arrows));
  issues.push(...crowded.filter((i) => !i.arrows.some((r) => empty.has(r))));
  return { steps, dn, de, after, issues };
}

/** The two atoms of a bond or gap end; an atom end's one atom. */
function endAtoms(doc: Doc, e: PushEnd): number[] {
  if (e.kind === 'atom') return [e.id];
  if (e.kind === 'bond' || e.kind === 'gap') return pairOf(doc, e);
  return [];
}

function pairOf(doc: Doc, e: PushEnd): [number, number] {
  if (e.kind === 'gap') return [e.a1, e.a2];
  if (e.kind === 'bond') { const b = doc.bonds.get(e.id)!; return [b.a1, b.a2]; }
  return [-1, -1];
}

/** The atoms the arrows change. */
export function pushedAtoms(reading: PushReading): Set<number> {
  const out = new Set<number>(reading.dn.keys());
  for (const kk of reading.de.keys()) for (const id of unkey(kk)) out.add(id);
  return out;
}

/** The drawn lone pairs, radical dots and circled charges on each atom. */
function symbolsByAtom(doc: Doc, atoms: Set<number>): Map<number, Shape[]> {
  const out = new Map<number, Shape[]>();
  for (const s of doc.shapes.values()) {
    if (!isAtomSymbol(s)) continue;
    const o = s.pin?.on === 'atom' && atoms.has(s.pin.ref[0]) ? s.pin.ref[0] : pairOwner(doc, s);
    if (o === null || !atoms.has(o)) continue;
    out.set(o, [...(out.get(o) ?? []), s]);
  }
  return out;
}

const centre = (s: Pick<Shape, 'x1' | 'y1' | 'x2' | 'y2'>): Vec => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
const turn = (p: Vec, ang: number): Vec => ({ x: p.x * Math.cos(ang) - p.y * Math.sin(ang), y: p.x * Math.sin(ang) + p.y * Math.cos(ang) });

/**
 * The next intermediate, as a drawing of its own: the structures the arrows are drawn on, copied
 * with the arrows' changes made and everything else left where it was drawn: a new bond to
 * another structure brings that structure alongside (moved and turned whole, so its other bonds
 * point away), and a structure that comes away is moved off a little. Lone pairs,
 * radical dots and circled charges are drawn as the starting drawing had them. The atoms keep
 * their ids (new bonds and symbols get new ones). Null when there is nothing to draw.
 */
export function productDrawing(doc: Doc, m: Measure, reading: PushReading): Drawing | null {
  const touched = pushedAtoms(reading);
  if (!touched.size) return null;
  const atoms = new Set<number>();
  for (const id of touched) if (!atoms.has(id)) for (const x of doc.fragmentOf(id)) atoms.add(x);
  const out = new Drawing();
  out.style = { ...doc.style };
  const L = doc.style.bondLength;
  const symbols = symbolsByAtom(doc, atoms);
  const showsPairs = [...symbols.values()].some((l) => l.some((s) => s.symbol === 'LonePair'));
  let maxId = 0;
  for (const k of ['atoms', 'bonds', 'captions', 'arrows', 'shapes'] as const) for (const id of doc[k].keys()) maxId = Math.max(maxId, id);
  out.reserveIds(maxId);
  // how far each atom's structure was turned (to turn its symbols with it)
  const turned = new Map<number, number>();
  const formed: [number, number][] = [];
  const broken: [number, number][] = [];
  out.bulk(() => {
    for (const id of atoms) {
      const a = doc.atoms.get(id)!;
      const copy = structuredClone(a);
      delete copy.grp; delete copy.xyz; delete copy.alt;
      if (copy.multi) copy.multi = copy.multi.filter((x) => atoms.has(x));
      out.addAtom(a.x, a.y, a.z, copy);
    }
    for (const b of doc.bonds.values()) {
      if (!atoms.has(b.a1) || !atoms.has(b.a2)) continue;
      const copy = structuredClone(b);
      delete copy.z;
      out.addBond(b.a1, b.a2, b.order, b.display, copy);
    }
    for (const [id, x] of reading.after) {
      const a = out.atoms.get(id)!;
      const patch: Partial<Atom> = { charge: x.charge, radical: x.radical };
      // a circled charge stays circled only while there is still a charge of one to circle
      if (a.hideCharge && (x.charge !== a.charge || Math.abs(x.charge) !== 1)) patch.hideCharge = Math.abs(x.charge) === 1 ? a.hideCharge : undefined;
      if (x.charge !== a.charge) delete a.stereoLabel;
      out.updateAtom(id, patch);
    }
    for (const [kk, d] of reading.de) {
      if (!d) continue;
      const [a1, a2] = unkey(kk);
      const b = out.bondBetween(a1, a2);
      const order = (b?.order ?? 0) + d / 2;
      if (!Number.isInteger(order) || order < 0) continue;
      if (b && order === 0) { out.removeBond(b.id); broken.push([a1, a2]); }
      else if (b) out.updateBond(b.id, { order, ...(order !== b.order && b.display !== 'solid' && b.display !== 'bold' ? { display: 'solid' } : {}), dpos: 'auto', ...(order === 1 ? { circle: undefined } : {}), showStereo: undefined, stereoLabel: undefined });
      else if (order > 0) formed.push([a1, a2]);
    }
    // a new bond to another structure brings it alongside
    for (const [p, q] of formed) {
      if (out.bondBetween(p, q)) continue;
      const order = (reading.de.get(key(p, q)) ?? 0) / 2;
      const sideP = out.fragmentOf(p);
      if (!sideP.has(q)) {
        const sideQ = out.fragmentOf(q);
        // the smaller structure moves to the larger one
        const [anchor, mover, moving] = sideQ.size <= sideP.size ? [p, q, sideQ] : [q, p, sideP];
        const ang = bringAlongside(out, anchor, mover, moving, doc.atoms.get(mover)!);
        for (const id of moving) turned.set(id, (turned.get(id) ?? 0) + ang);
      }
      out.addBond(p, q, order);
    }
    // a structure that came away moves off a little, so it looks apart
    for (const [p, q] of broken) {
      const sideP = out.fragmentOf(p);
      if (sideP.has(q)) continue;
      const sideQ = out.fragmentOf(q);
      const [from, off, moving] = sideQ.size <= sideP.size ? [p, q, sideQ] : [q, p, sideP];
      const d = mul(norm(sub(out.atoms.get(off)!, out.atoms.get(from)!)), 0.6 * L);
      for (const id of moving) { const a = out.atoms.get(id)!; out.updateAtom(id, { x: a.x + d.x, y: a.y + d.y }); }
    }

    // hydrogens are kept as they were: where the usual valences would now give another number (a
    // carbene, an odd ion), the atom is written out with them
    for (const [id, x] of reading.after) {
      if (x.h === null || reading.issues.some((i) => i.level === 'error' && i.atoms.includes(id))) continue;
      const a = out.atoms.get(id)!;
      if (!hasImplicitH(a.z)) continue;
      const h = implicitHydrogens(a.z, out.valenceSum(id), a.charge);
      if (h !== x.h) out.updateAtom(id, { label: (SYMBOLS[a.z] ?? '') + (x.h ? 'H' + (x.h > 1 ? x.h : '') : ''), fileLabel: false });
    }

    // lone pairs, radical dots and circled charges, as the starting drawing showed them
    const pm = { atomBoxes: (a: Atom) => m.atomBoxes(a) } as Measure;
    for (const id of atoms) {
      const list = symbols.get(id) ?? [];
      const was = doc.atoms.get(id)!, now = out.atoms.get(id)!;
      const x = reading.after.get(id);
      const pairs = list.filter((s) => s.symbol === 'LonePair');
      if (!x) {
        // unchanged: the same symbols, where they were round it (turned with its structure)
        const ang = turned.get(id) ?? 0;
        for (const s of list) {
          const c = centre(s), off = turn(sub(c, was), ang);
          const h1 = turn(sub({ x: s.x1, y: s.y1 }, c), ang), h2 = turn(sub({ x: s.x2, y: s.y2 }, c), ang);
          const at = add(now, off);
          const { id: _id, pin: _pin, ...rest } = structuredClone(s);
          out.addShape({ ...rest, x1: at.x + h1.x, y1: at.y + h1.y, x2: at.x + h2.x, y2: at.y + h2.y });
        }
        continue;
      }
      const dnA = reading.dn.get(id) ?? 0;
      const nPairs = pairs.length || (showsPairs && dnA > 0) ? Math.max(0, pairs.length + Math.trunc(dnA / 2)) : 0;
      const nDots = x.radical === 'doublet' ? 1 : 0;
      const circle = now.hideCharge && Math.abs(now.charge) === 1 ? (now.charge > 0 ? 'CirclePlus' : 'CircleMinus') : null;
      const taken: Vec[] = [];
      const put = (kind: 'LonePair' | 'Electron' | 'CirclePlus' | 'CircleMinus', size: number) => {
        const { dir, at } = symbolSpot(out, pm, id, taken, size);
        taken.push(at);
        const n = perp(dir);
        const half = kind === 'LonePair' ? 1.12 : kind === 'Electron' ? 0 : size / 2;
        const box = kind === 'LonePair'
          ? { x1: at.x - n.x * half, y1: at.y - n.y * half, x2: at.x + n.x * half, y2: at.y + n.y * half }
          : { x1: at.x - half, y1: at.y - half, x2: at.x + half, y2: at.y + half };
        out.addShape({ kind: 'symbol', symbol: kind, ...box });
      };
      if (circle) put(circle, 4.5);
      for (let i = 0; i < nPairs; i++) put('LonePair', 2.6);
      for (let i = 0; i < nDots; i++) put('Electron', 1.4);
    }
  });

  // what the usual chemistry warnings say about the changed atoms that have labels
  for (const id of touched) {
    const a = out.atoms.get(id);
    if (!a || !a.label || doc.atoms.get(id)!.label !== a.label) continue;
    const w = atomWarnings(out, a).find((t) => t.startsWith('Too many bonds'));
    if (w && !reading.issues.some((i) => i.atoms.includes(id))) reading.issues.push({ level: 'error', text: w, arrows: reading.steps.filter((s) => endAtoms(doc, s.from).includes(id) || endAtoms(doc, s.to).includes(id)).map((s) => s.arrow), atoms: [id], bonds: [] });
  }
  return out;
}

/**
 * Bring a structure alongside another for a new bond from `anchor` to `mover`: `mover` goes a
 * bond length off `anchor` in the most open direction (leaning towards where it was drawn), and
 * its structure turns so its other bonds point away. Gives the angle it was turned by.
 */
function bringAlongside(doc: Drawing, anchor: number, mover: number, moving: Set<number>, drawnAt: Vec): number {
  const a = doc.atoms.get(anchor)!, v = doc.atoms.get(mover)!;
  const L = doc.style.bondLength;
  const base = angleOf(sproutDir(doc, anchor));
  const toward = angleOf(sub(drawnAt, a));
  const nbrs = doc.neighbors(mover).filter((n) => moving.has(n.id));
  const back = nbrs.length ? angleOf(sub(nbrs.reduce((s, n) => add(s, n), { x: 0, y: 0 }), mul(v, nbrs.length))) : null;
  const others = [...doc.atoms.values()].filter((x) => !moving.has(x.id));
  const pts = [...moving].map((id) => doc.atoms.get(id)!);
  let best = { score: Infinity, ang: 0, at: { x: 0, y: 0 } };
  const off = (x: number, y: number) => Math.min(Math.abs(normAngle(x - y)), 2 * Math.PI - Math.abs(normAngle(x - y)));
  for (let k = -12; k < 12; k++) {
    const dir = base + k * 15 * DEG;
    const at = add(a, fromAngle(dir, L));
    // its own bonds point on away from the new one
    const ang = back === null ? 0 : dir - back;
    let clash = 0;
    for (const p of pts) {
      const q = add(at, turn(sub(p, v), ang));
      for (const o of others) {
        if (o.id === anchor && p.id === mover) continue;
        const d = dist(q, o);
        if (d < 0.9 * L) clash += (0.9 * L - d) / L;
      }
    }
    const score = 10 * clash + off(dir, base) + 0.5 * off(dir, toward);
    if (score < best.score) best = { score, ang, at };
  }
  for (const p of pts) {
    const q = add(best.at, turn(sub(p, v), best.ang));
    doc.updateAtom(p.id, { x: q.x, y: q.y });
  }
  return best.ang;
}

/** The box round some atoms and arrows (for placing what comes after them). */
export function boxOf(doc: Doc, atoms: Iterable<number>, arrows: Iterable<number>): Rect | null {
  let b: Rect | null = null;
  const grow = (p: Vec) => { b = b ? { x1: Math.min(b.x1, p.x), y1: Math.min(b.y1, p.y), x2: Math.max(b.x2, p.x), y2: Math.max(b.y2, p.y) } : { x1: p.x, y1: p.y, x2: p.x, y2: p.y }; };
  for (const id of atoms) { const a = doc.atoms.get(id); if (a) grow(a); }
  for (const id of arrows) { const r = doc.arrows.get(id); if (r) for (const p of arrowPoints(r, 12)) grow(p); }
  return b;
}
