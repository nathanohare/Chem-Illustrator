// Chemistry ▸ Reactions and Schemes ▸ Map Atoms: which atom goes where across each reaction step,
// as atom-atom map numbers. Each starting material is laid onto the products along its bonds,
// element to element, keeping as many of its bonds as it can (the fewest bonds made and broken).
// Where that leaves a choice, the pairing Animate Reaction uses breaks the tie (on steps of up to
// about 50 atoms a side), and pairs chosen by hand in its pairing editor are kept, so fixing a pair
// there fixes the map too.

import type { Doc } from '../model';
import type { Renderer } from '../render/renderer';
import type { Measure } from '../editor/arrange';
import { reactionSteps, schemeItems, plainMeasure } from '../chem/reaction';
import { planOf, configOf } from './clip';
import { sceneOf } from './scene';
import { resolve } from './mapping';
import { matchBonds, type NodeMap } from './match';
import type { MScene } from './scene';
import { mapColour } from '../render/atom-marks';

export interface AtomMap {
  /** The map number of each mapped atom. */
  numbers: Map<number, number>;
  /** Bonds made in each step (product bonds with no partner in the starting materials). */
  made: number[];
  /** Bonds broken (starting-material bonds with no partner in the products). */
  broken: number[];
  /** Reaction steps mapped. */
  steps: number;
  /** Product atoms with no starting-material atom (from reagents over the arrow, or not matched). */
  unmatched: number;
  /** Steps that couldn't be paired, with why. */
  errors: string[];
}

/**
 * Map numbers for one reaction step (`arrow`) or every step of the drawing. Steps are taken in the
 * order the scheme runs, so a product that starts the next step keeps its numbers there, and new
 * starting materials get the next free numbers.
 */
export function mapAtoms(doc: Doc, r: Renderer, opts: { arrow?: number; measure?: Measure } = {}): AtomMap {
  const m = opts.measure ?? plainMeasure(doc);
  const out: AtomMap = { numbers: new Map(), made: [], broken: [], steps: 0, unmatched: 0, errors: [] };
  const arrows = opts.arrow !== undefined ? [opts.arrow] : schemeOrder(doc, m);
  let next = 1;
  for (const arrow of arrows) {
    const plan = planOf(doc, { arrow, measure: m });
    const k = plan.kinds.indexOf('morph');
    if (k < 0) continue;
    const start = plan.groups.slice(0, k + 1).flat();
    const end = plan.groups.slice(k + 1).flat();
    if (!start.length || !end.length) continue;
    const A = sceneOf(doc, start, r), B = sceneOf(doc, end, r);
    let cfg = configOf(doc.arrows.get(arrow)?.morph, A, B);
    let hint: NodeMap;
    try {
      // (the animation's own pairing only breaks ties, and takes seconds on a big step: there, only
      // the pairs chosen by hand are used)
      hint = A.nodes.size * B.nodes.size > HINT_LIMIT && !cfg.pairs?.length ? new Map() : resolve(cfg, A, B).nmap;
    } catch (e) {
      // pairs saved in Animate Reaction that no longer fit: map without them
      out.errors.push((e as Error).message);
      cfg = {};
      hint = resolve({}, A, B).nmap;
    }
    out.steps++;
    const nmap = cfg.exact && cfg.pairs ? sameElement(doc, hint) : chemMap(doc, A, B, hint, new Map(cfg.pairs ?? []));
    const bmap = matchBonds(A, B, nmap);
    for (const id of readingOrder(doc, start)) if (!out.numbers.has(id)) out.numbers.set(id, next++);
    for (const [a, b] of nmap) {
      const n = out.numbers.get(Number(a));
      if (n !== undefined && !out.numbers.has(Number(b))) out.numbers.set(Number(b), n);
    }
    out.unmatched += end.filter((id) => !out.numbers.has(id)).length;
    const kept = new Set(bmap.values());
    for (const key of A.bonds.keys()) if (!bmap.has(key)) out.broken.push(Number(key));
    for (const key of B.bonds.keys()) if (!kept.has(key)) out.made.push(Number(key));
  }
  return out;
}

/** Atoms on one side times the other above which the animation's pairing is not worked out for a step. */
const HINT_LIMIT = 50 * 50;

const zOf = (doc: Doc) => (k: string) => doc.atoms.get(Number(k))?.z;

/** Only pairs of atoms of the same element. */
function sameElement(doc: Doc, m: NodeMap): NodeMap {
  const z = zOf(doc);
  return new Map([...m].filter(([a, b]) => z(a) === z(b)));
}

/**
 * Starting-material atoms (A) to product atoms (B), element to element, keeping as many bonds as
 * possible. Pairs in `forced` (chosen by hand) come first; `hint` (the animation's pairing) breaks ties.
 */
export function chemMap(doc: Doc, A: MScene, B: MScene, hint: NodeMap, forced: NodeMap = new Map()): NodeMap {
  const z = zOf(doc);
  const order = (sc: MScene, u: string, v: string) => { const k = sc.bondBetween(u, v); return k === undefined ? 0 : sc.bonds.get(k)!.order; };
  const deg = (sc: MScene, u: string) => (sc.nbr.get(u) ?? []).length;
  const ringA = ringAtoms(A), ringB = ringAtoms(B);
  /** How alike two atoms are: in a ring or not, and the same number of neighbours. */
  const alike = (x: string, y: string) => (ringA.has(x) === ringB.has(y) ? 3 : 0) + (deg(A, x) === deg(B, y) ? 2 : 0);

  /** Pair along the bonds out from the pairs already made, as far as it goes. */
  const grow = (m: NodeMap, used: Set<string>) => {
    const queue = [...m];
    for (let q = 0; q < queue.length; q++) {
      const [a, b] = queue[q];
      for (const y of B.nbr.get(b) ?? []) {
        if (used.has(y)) continue;
        let best: string | null = null, bestScore = -1;
        for (const x of A.nbr.get(a) ?? []) {
          if (m.has(x) || z(x) !== z(y)) continue;
          const score = (order(A, a, x) === order(B, b, y) ? 4 : 0) + alike(x, y) + (hint.get(x) === y ? 1 : 0);
          if (score > bestScore) { best = x; bestScore = score; }
        }
        if (best === null) continue;
        m.set(best, y);
        used.add(y);
        queue.push([best, y]);
      }
    }
  };
  /** Bonds of these starting-material atoms that the pairing keeps (×10), and those kept with the same order. */
  const keeps = (m: NodeMap, atoms: string[]) => {
    let n = 0;
    for (const u of atoms) {
      for (const v of A.nbr.get(u) ?? []) {
        if (u >= v || !m.has(u) || !m.has(v)) continue;
        const o = order(B, m.get(u)!, m.get(v)!);
        if (o) n += 10 + (o === order(A, u, v) ? 1 : 0);
      }
    }
    return n;
  };

  let m: NodeMap = sameElement(doc, forced);
  let used = new Set(m.values());
  grow(m, used);
  /** The most bonds a starting material's pairing can keep: every one, with its order. */
  const allKept = (atoms: string[]) => {
    let n = 0;
    for (const u of atoms) for (const v of A.nbr.get(u) ?? []) if (u < v) n += 11;
    return n;
  };
  // Each starting material in turn, biggest first, from the seed pair that keeps most of its
  // bonds; then again for what is left of each, so one that falls apart into several products
  // (a Boc group off as CO2 and isobutylene, an acetate as acetic acid, a retro-Diels–Alder) is
  // paired with all of them. A later round only takes a pairing that keeps another bond.
  for (let round = 0, more = true; more && round < 8; round++) {
    more = false;
    for (const frag of components(A).sort((p, q) => q.length - p.length)) {
      if (frag.every((x) => m.has(x))) continue;
      const free = frag.filter((x) => !m.has(x));
      // every atom as a seed for a small structure; for a big one, the rarest element's atoms (a lone
      // N or O rather than every carbon) and those the animation paired, to keep this quick
      const count = new Map<number | undefined, number>();
      for (const x of free) count.set(z(x), (count.get(z(x)) ?? 0) + 1);
      const rare = Math.min(...count.values());
      const big = free.length * B.nodes.size > 20000;
      const seeds = big ? free.filter((x) => count.get(z(x)) === rare || hint.has(x)).slice(0, 60) : free;
      // seed pairs to try: all of them, in drawing order, when there are few; for a big structure the
      // likeliest first (the animation's pair, then atoms most alike), as many as time allows
      let tries: [string, string][] = [];
      for (const x of seeds) for (const y of B.nodes.keys()) if (!used.has(y) && z(x) === z(y)) tries.push([x, y]);
      const budget = Math.max(400, Math.floor(TRIAL_BUDGET / (A.nodes.size + B.nodes.size)));
      const pruned = tries.length > budget;
      if (pruned) {
        const rank = ([x, y]: [string, string]) => (hint.get(x) === y ? 100 : 0) + alike(x, y);
        tries = tries.map((t, i) => ({ t, r: rank(t), i })).sort((p, q) => q.r - p.r || p.i - q.i).slice(0, budget).map((o) => o.t);
      }
      const before = keeps(m, frag), most = allKept(frag);
      let best: { m: NodeMap; used: Set<string>; score: number; kept: number } | null = null;
      for (const [x, y] of tries) {
        const tm: NodeMap = new Map(m), tu = new Set(used);
        tm.set(x, y);
        tu.add(y);
        grow(tm, tu);
        let agree = 0, like = 0;
        for (const k of frag) {
          if (!tm.has(k)) continue;
          if (hint.get(k) === tm.get(k)) agree++;
          like += alike(k, tm.get(k)!);
        }
        // most bonds kept, then atoms most like their partners (a methyl to a methyl, not to a ring carbon)
        const kept = keeps(tm, frag);
        const score = kept * 1000 + like * 10 + frag.filter((k) => tm.has(k)).length * 5 + agree;
        if (!best || score > best.score) best = { m: tm, used: tu, score, kept };
        // (cut short, a structure laid on with every bond kept: nothing better to find)
        if (pruned && kept === most) break;
      }
      if (best && (round === 0 || best.kept > before)) { m = best.m; used = best.used; more = true; }
    }
  }
  // an element with one atom left over on each side: those two
  const left = (sc: MScene, taken: (k: string) => boolean) => {
    const by = new Map<number | undefined, string[]>();
    for (const k of sc.nodes.keys()) if (!taken(k)) by.set(z(k), [...(by.get(z(k)) ?? []), k]);
    return by;
  };
  const la = left(A, (k) => m.has(k)), lb = left(B, (k) => used.has(k));
  for (const [el, as] of la) { const bs = lb.get(el); if (as.length === 1 && bs?.length === 1) { m.set(as[0], bs[0]); used.add(bs[0]); } }
  return m;
}

/** Seed pairs tried for one structure, times the atoms on both sides: keeps a big step to a fraction of a second. */
const TRIAL_BUDGET = 250000;

/** Atoms in a ring: an end of a bond whose ends are still joined without it. */
function ringAtoms(sc: MScene): Set<string> {
  const out = new Set<string>();
  for (const b of sc.bonds.values()) {
    if (out.has(b.b) && out.has(b.e)) continue;
    const seen = new Set([b.b]);
    const stack = [b.b];
    let joined = false;
    while (stack.length && !joined) {
      const u = stack.pop()!;
      for (const v of sc.nbr.get(u) ?? []) {
        if ((u === b.b && v === b.e) || seen.has(v)) continue;
        if (v === b.e) { joined = true; break; }
        seen.add(v);
        stack.push(v);
      }
    }
    if (joined) { out.add(b.b); out.add(b.e); }
  }
  return out;
}

/** The separate structures of a scene, as lists of atom keys. */
function components(sc: MScene): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const k of sc.nodes.keys()) {
    if (seen.has(k)) continue;
    const part: string[] = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const u = stack.pop()!;
      part.push(u);
      for (const v of sc.nbr.get(u) ?? []) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
    out.push(part);
  }
  return out;
}

/** The reaction arrows in the order the scheme runs: a step whose starting material another step makes comes after it. */
function schemeOrder(doc: Doc, m: Measure): number[] {
  const items = schemeItems(doc, m);
  const atomsOf = new Map(items.map((it) => [it.ref, it.atoms]));
  const steps = reactionSteps(doc, items).map(({ arrow, roles }) => ({
    arrow: arrow.id,
    from: new Set(roles.reactants.flatMap((r) => atomsOf.get(r) ?? [])),
    to: new Set(roles.products.flatMap((r) => atomsOf.get(r) ?? [])),
  }));
  const order: number[] = [];
  const left = [...steps];
  while (left.length) {
    // a step none of whose starting atoms is made by another step still to come
    let i = left.findIndex((s) => !left.some((o) => o !== s && [...s.from].some((a) => o.to.has(a))));
    if (i < 0) i = 0;
    order.push(left[i].arrow);
    left.splice(i, 1);
  }
  return order;
}

/** Atoms numbered structure by structure from the left, each walked along its bonds from its leftmost atom. */
function readingOrder(doc: Doc, ids: number[]): number[] {
  const want = new Set(ids);
  const out: number[] = [];
  const seen = new Set<number>();
  const byX = [...want].sort((a, b) => doc.atoms.get(a)!.x - doc.atoms.get(b)!.x || doc.atoms.get(a)!.y - doc.atoms.get(b)!.y);
  for (const s of byX) {
    if (seen.has(s)) continue;
    const q = [s];
    seen.add(s);
    while (q.length) {
      const id = q.shift()!;
      out.push(id);
      const nb = (doc.adj.get(id) ?? []).map((bid) => { const b = doc.bonds.get(bid)!; return b.a1 === id ? b.a2 : b.a1; })
        .filter((x) => want.has(x) && !seen.has(x))
        .sort((a, b) => doc.atoms.get(a)!.x - doc.atoms.get(b)!.x || doc.atoms.get(a)!.y - doc.atoms.get(b)!.y);
      for (const x of nb) { seen.add(x); q.push(x); }
    }
  }
  return out;
}

/** Soft colours for mapped atoms, one per map number (repeating after twelve). */
export { MAP_COLOURS, mapColour } from '../render/atom-marks';
/** Bonds made and broken, when marked. */
export const MADE_COLOUR = '#5cc26b';
export const BROKEN_COLOUR = '#ff7b7b';

export interface MapLook {
  /** Show each map number beside its atom (as the atom number, which ChemDraw shows too). */
  numbers: boolean;
  /** Highlight each atom and its partners in a colour of their own. */
  colours: boolean;
  /** Highlight bonds made (green, in the products) and broken (red, in the starting materials). */
  bonds: boolean;
}

/**
 * Take the map off these atoms (all of them when not given): their map numbers, and the numbers,
 * colours and bond marks Map Atoms put on. Numbers and highlights put on by hand stay.
 */
export function clearAtomMap(doc: Doc, atoms?: Iterable<number>): number {
  const ids = new Set(atoms ?? doc.atoms.keys());
  let n = 0;
  for (const id of ids) {
    const a = doc.atoms.get(id);
    if (!a?.mapNo) continue;
    const ours = String(a.mapNo);
    doc.updateAtom(id, {
      mapNo: undefined,
      ...(a.atomNumber === ours ? { atomNumber: undefined, showNumber: undefined, numberLabel: undefined } : {}),
      ...(a.highlight === mapColour(a.mapNo) ? { highlight: undefined, hl: undefined } : {}),
    });
    n++;
  }
  for (const b of doc.bonds.values()) {
    if ((b.highlight === MADE_COLOUR || b.highlight === BROKEN_COLOUR) && ids.has(b.a1) && ids.has(b.a2)) doc.updateBond(b.id, { highlight: undefined, hl: undefined });
  }
  return n;
}

/**
 * Put a map on the drawing, as one edit's worth of changes (call inside doc.edit). Returns how
 * many atom numbers and highlights put on by hand were left as they were.
 */
export function applyAtomMap(doc: Doc, map: AtomMap, look: MapLook): { keptNumbers: number; keptColours: number } {
  const scope = new Set<number>();
  for (const id of map.numbers.keys()) for (const x of doc.fragmentOf(id)) scope.add(x);
  for (const id of [...map.made, ...map.broken]) { const b = doc.bonds.get(id); if (b) { scope.add(b.a1); scope.add(b.a2); } }
  clearAtomMap(doc, scope);
  let keptNumbers = 0, keptColours = 0;
  for (const [id, n] of map.numbers) {
    const a = doc.atoms.get(id);
    if (!a) continue;
    const patch: Partial<typeof a> = { mapNo: n };
    if (look.numbers) {
      if (a.atomNumber && a.showNumber) keptNumbers++;
      else Object.assign(patch, { atomNumber: String(n), showNumber: true, numberLabel: undefined });
    }
    if (look.colours) {
      if (a.highlight) keptColours++;
      else patch.highlight = mapColour(n);
    }
    doc.updateAtom(id, patch);
  }
  if (look.bonds) {
    for (const [ids, colour] of [[map.made, MADE_COLOUR], [map.broken, BROKEN_COLOUR]] as const) {
      for (const id of ids) {
        const b = doc.bonds.get(id);
        if (!b) continue;
        if (b.highlight) keptColours++;
        else doc.updateBond(id, { highlight: colour });
      }
    }
  }
  return { keptNumbers, keptColours };
}
