// One six-membered ring drawn four ways: flat, as a chair, as the other (flipped) chair, and as
// a boat. Tab goes from one to the next; on a chair with things on it, Tab walks the ring round
// (each atom one place on, clockwise), [ walks it back, and Shift+Tab flips the chair. \ goes
// straight between the flat drawing and the chair. Every
// substituent keeps its face of the ring (up or down), so the molecule and its stereochemistry
// never change: a wedge on the flat ring becomes an axial or equatorial bond on that face.
//
// The chair and boat shapes are the conformer templates' own (conformers.json, made by
// scripts/make-conformers.py): their 2-D drawing for where atoms go, their 3-D shape (xyz) for
// which face each axial and equatorial bond is on. Nothing here makes up a shape.
//
// Faces are told apart without saving anything: up or down is measured against the ring's
// normal taken in the ring's own atom order (lowest id first, then its lower-id neighbour), so a
// drawing and its mirror image differ, as they should. The flat drawing is read from its
// wedges; a chair or boat is read back by fitting the template to it.

import type { Doc, Bond, BondDisplay } from '../model';
import type { Vec } from '../geom';
import { templateById } from './templates';
import { ringBonds, ringsThroughBond } from './aromatic';

export type RingView = 'flat' | 'chair' | 'chair-flip' | 'boat';
export const RING_VIEWS: RingView[] = ['flat', 'chair', 'chair-flip', 'boat'];
export const RING_VIEW_NAMES: Record<RingView, string> = { flat: 'Flat', chair: 'Chair', 'chair-flip': 'Flipped chair', boat: 'Boat' };

type V3 = [number, number, number];

/** A shape for six ring atoms: where each goes, its two free bonds, and the 3-D shape behind it. */
interface Shape {
  /** Ring atoms on the page (bond length 1, middle at 0, y down). */
  at: Vec[];
  /** Depth of each ring atom towards the reader (bond length 1). */
  z: number[];
  /** Each ring atom's two free bonds: page direction, depth change, and 3-D direction. */
  stubs: { d: Vec; z: number; xyz: V3 }[][];
  /** Ring atoms in 3-D. */
  xyz: V3[];
  /** +1 when the 3-D shape is turned (not mirrored) into the page view, −1 when mirrored. */
  hand: number;
}

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const det3 = (a: V3, b: V3, c: V3): number => dot3(a, cross(b, c));

/** The ring's normal for atoms taken in this order (Newell's method). */
function normalOf(pts: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  });
  return n;
}

/** A conformer template with its axial and equatorial bonds (atoms 0–5 the ring, then two per ring atom). */
function shapeFrom(id: string, mirror: boolean): Shape | null {
  const t = templateById(id);
  if (!t || !t.z || !t.xyz || t.atoms.length < 18) return null;
  const m = mirror ? -1 : 1;
  const P = (i: number): Vec => ({ x: m * t.atoms[i][0], y: t.atoms[i][1] });
  const X = (i: number): V3 => [m * t.xyz![i][0], t.xyz![i][1], t.xyz![i][2]];
  const at = [0, 1, 2, 3, 4, 5].map(P);
  const stubs = at.map((p, i) => {
    const ends = t.bonds.filter(([a, b]) => (a === i && b >= 6) || (b === i && a >= 6)).map(([a, b]) => (a === i ? b : a));
    return ends.map((e) => ({ d: { x: P(e).x - p.x, y: P(e).y - p.y }, z: t.z![e] - t.z![i], xyz: sub3(X(e), X(i)) }));
  });
  if (stubs.some((s) => s.length !== 2)) return null;
  // whether the page view (x, y down, depth towards the reader) is the 3-D shape turned or mirrored:
  // the sign of the fitted linear map's determinant, from Σ xyz·viewᵀ over the centred atoms
  const n = t.atoms.length;
  const mean = (f: (i: number) => V3): V3 => { const s: V3 = [0, 0, 0]; for (let i = 0; i < n; i++) { const v = f(i); s[0] += v[0] / n; s[1] += v[1] / n; s[2] += v[2] / n; } return s; };
  const V = (i: number): V3 => [P(i).x, P(i).y, t.z![i]];
  const mx = mean(X), mv = mean(V);
  const C: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const x = sub3(X(i), mx), v = sub3(V(i), mv);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r][c] += x[r] * v[c];
  }
  const hand = Math.sign(det3(C[0] as V3, C[1] as V3, C[2] as V3)) || 1;
  return { at, z: [0, 1, 2, 3, 4, 5].map((i) => t.z![i]), stubs, xyz: [0, 1, 2, 3, 4, 5].map(X), hand };
}

let shapes: Partial<Record<RingView, Shape | null>> | null = null;
function shapeOf(v: Exclude<RingView, 'flat'>): Shape | null {
  shapes ??= { chair: shapeFrom('chair-ae', false), 'chair-flip': shapeFrom('chair-ae', true), boat: shapeFrom('boat-ae', false) };
  return shapes[v] ?? null;
}

/** A regular hexagon with a corner at the top (bond length 1). */
const HEXAGON: Vec[] = [0, 1, 2, 3, 4, 5].map((k) => ({ x: Math.cos((-90 + 60 * k) * Math.PI / 180), y: Math.sin((-90 + 60 * k) * Math.PI / 180) }));

// ------------------------------------------------------------------ finding the ring

export interface ViewRing {
  /** The ring's atoms in their own order (lowest id first, then its lower-id neighbour). */
  ring: number[];
  /** Each ring atom's substituents: the first atom out, and every atom behind it. */
  subs: { at: number; first: number; bond: number; branch: number[] }[];
}

/**
 * The one six-membered ring of single bonds the selection is about: all its atoms selected, or
 * else the only such ring in the selected structure. Null (with why) when there is none, or
 * when the ring is fused or bridged (its substituents join up again), which can't change shape.
 */
export function viewRingOf(doc: Doc, atoms: Iterable<number>): { ring: ViewRing } | { why: string } {
  const sel = new Set(atoms);
  if (!sel.size) return { why: 'Select a cyclohexane ring first.' };
  const sixRings = (bonds: Iterable<number>, into: Map<string, number[]>) => {
    for (const bid of bonds) for (const r of ringsThroughBond(doc, bid)) if (r.length === 6) into.set([...r].sort((a, b) => a - b).join(','), r);
  };
  // A ring with all its atoms selected has all its bonds between selected atoms, so those rings
  // are found from the selection's own bonds. Only when there is none is the rest of the
  // structure looked at (for its one ring). Walking whole structures for every ring made each
  // molfile of a big structure (which asks once per six-membered ring) take time in its size
  // squared: a third of a second for 600 atoms, on every edit.
  const inner = new Set<number>();
  for (const id of sel) for (const bid of doc.adj.get(id) ?? []) { const b = doc.bonds.get(bid); if (b && sel.has(b.a1) && sel.has(b.a2)) inner.add(bid); }
  const own = new Map<string, number[]>();
  sixRings(inner, own);
  const whole = [...own.values()].filter((r) => r.every((id) => sel.has(id)));
  let all = whole;
  let frags = 1;
  if (!whole.length) {
    const rings = new Map<string, number[]>();
    const seenBonds = new Set<number>();
    // only the structures the selection touches: walking the whole drawing here froze big drawings for minutes
    const fs: Set<number>[] = [];
    for (const id of sel) if (doc.atoms.has(id) && !fs.some((f) => f.has(id))) fs.push(doc.fragmentOf(id));
    for (const f of fs) for (const id of f) for (const bid of doc.adj.get(id) ?? []) if (!seenBonds.has(bid)) { seenBonds.add(bid); sixRings([bid], rings); }
    all = [...rings.values()];
    frags = fs.length;
  }
  const picked = whole.length === 1 ? whole[0] : whole.length === 0 && all.length === 1 && frags === 1 ? all[0] : null;
  if (!picked) return { why: all.length ? 'Select the atoms of just one six-membered ring.' : 'There is no six-membered ring here to draw as a chair.' };
  const ringBondsOk = picked.every((id, i) => {
    const next = picked[(i + 1) % 6];
    const b = (doc.adj.get(id) ?? []).map((bid) => doc.bonds.get(bid)!).find((x) => x.a1 === next || x.a2 === next);
    return !!b && b.order === 1;
  });
  if (!ringBondsOk) return { why: 'Only a ring of single bonds can be drawn as a chair or a boat.' };
  if (picked.some((id) => doc.atoms.get(id)!.multi)) return { why: 'This ring is bonded to a metal through its middle.' };
  // the ring's own order: lowest id first, then towards its lower-id neighbour
  const start = picked.indexOf(Math.min(...picked));
  let ring = [...picked.slice(start), ...picked.slice(0, start)];
  if (ring[5] < ring[1]) ring = [ring[0], ...ring.slice(1).reverse()];
  const inRing = new Set(ring);
  const subs: ViewRing['subs'] = [];
  for (const at of ring) {
    for (const bid of doc.adj.get(at) ?? []) {
      const b = doc.bonds.get(bid)!;
      const first = b.a1 === at ? b.a2 : b.a1;
      if (inRing.has(first)) continue;
      // everything behind the first atom; reaching the ring again means a fused or bridged ring
      const branch = [first];
      const seen = new Set([at, first]);
      for (let i = 0; i < branch.length; i++) {
        for (const nb of doc.adj.get(branch[i]) ?? []) {
          const o = doc.bonds.get(nb)!;
          const n = o.a1 === branch[i] ? o.a2 : o.a1;
          // back at the ring (other than through the bond it came by): fused or bridged
          if (inRing.has(n) && !(n === at && branch[i] === first)) return { why: 'A fused or bridged ring keeps its shape: only a ring on its own can be redrawn.' };
          if (seen.has(n)) continue;
          seen.add(n);
          branch.push(n);
        }
      }
      subs.push({ at, first, bond: bid, branch });
    }
    if (subs.filter((s) => s.at === at).length > 2) return { why: 'A ring atom with more than two things on it can\'t be drawn as a chair.' };
  }
  return { ring: { ring, subs } };
}

// ------------------------------------------------------------------ reading the drawing

export interface ViewFit {
  view: RingView;
  /** Ring atom i (in ViewRing order) sits at shape position pos[i]. */
  pos: number[];
  /** How far the drawing is from the shape, per bond length. */
  misfit: number;
  /** The page turn (radians) and size that take the shape onto the drawing. */
  turn: number;
  scale: number;
  centre: Vec;
}

/** The best fit of shape points to drawn points, turned and scaled but never mirrored. */
function fitPoints(model: Vec[], drawn: Vec[]): { misfit: number; turn: number; scale: number; centre: Vec } {
  const n = drawn.length;
  const cm = { x: model.reduce((s, p) => s + p.x, 0) / n, y: model.reduce((s, p) => s + p.y, 0) / n };
  const cd = { x: drawn.reduce((s, p) => s + p.x, 0) / n, y: drawn.reduce((s, p) => s + p.y, 0) / n };
  let re = 0, im = 0, mm = 0;
  for (let i = 0; i < n; i++) {
    const a = { x: model[i].x - cm.x, y: model[i].y - cm.y }, b = { x: drawn[i].x - cd.x, y: drawn[i].y - cd.y };
    re += a.x * b.x + a.y * b.y;
    im += a.x * b.y - a.y * b.x;
    mm += a.x * a.x + a.y * a.y;
  }
  const scale = Math.hypot(re, im) / (mm || 1);
  const turn = Math.atan2(im, re);
  const c = Math.cos(turn), s = Math.sin(turn);
  let err = 0;
  for (let i = 0; i < n; i++) {
    const a = { x: model[i].x - cm.x, y: model[i].y - cm.y };
    const p = { x: cd.x + scale * (a.x * c - a.y * s), y: cd.y + scale * (a.x * s + a.y * c) };
    err += (p.x - drawn[i].x) ** 2 + (p.y - drawn[i].y) ** 2;
  }
  return { misfit: Math.sqrt(err / n) / (scale || 1), turn, scale, centre: { x: cd.x - scale * (cm.x * c - cm.y * s), y: cd.y - scale * (cm.x * s + cm.y * c) } };
}

/** Every way round the six places: ring atom i at (k ± i) mod 6. */
const ORDERS: number[][] = [];
for (const dir of [1, -1]) for (let k = 0; k < 6; k++) ORDERS.push([0, 1, 2, 3, 4, 5].map((i) => (((k + dir * i) % 6) + 6) % 6));

const score = (f: { misfit: number; turn: number }) => f.misfit + 0.05 * Math.abs(f.turn) / Math.PI;

/** Which way the ring is drawn now, and how well. */
export function fitView(doc: Doc, vr: ViewRing): ViewFit {
  const drawn = vr.ring.map((id) => { const a = doc.atoms.get(id)!; return { x: a.x, y: a.y }; });
  let best: ViewFit | null = null;
  for (const view of RING_VIEWS) {
    const model = view === 'flat' ? HEXAGON : shapeOf(view)?.at;
    if (!model) continue;
    for (const pos of ORDERS) {
      const f = fitPoints(pos.map((p) => model[p]), drawn);
      // A chair turned half round looks the same on the page as its mirror image (each atom
      // where the opposite one was, its depth the other way), so which it is can't be seen.
      // Shapes are drawn upright, so the reading that needs the least turning wins.
      if (!best || score(f) < score(best) - 1e-9) best = { view, pos, ...f };
    }
  }
  return best!;
}

/** How near a drawing must be to a shape to be read as it (per bond length). */
const FITS = 0.15;

/** +1 for a substituent on the ring's top face (by the ring's own order), −1 underneath, 0 not shown. */
export type Face = 1 | -1 | 0;

/** Which face of the ring each substituent is on, by its first atom. */
export function facesOf(doc: Doc, vr: ViewRing, fit: ViewFit = fitView(doc, vr)): Map<number, Face> {
  const out = new Map<number, Face>();
  const shape = fit.view !== 'flat' && fit.misfit < FITS ? shapeOf(fit.view) : null;
  if (shape) {
    // read each bond as the axial or equatorial bond it lies nearest, and take that bond's face
    const n = normalOf(fit.pos.map((p) => shape.xyz[p]));
    const c = Math.cos(-fit.turn), s = Math.sin(-fit.turn);
    for (const i of [0, 1, 2, 3, 4, 5]) {
      const here = vr.subs.filter((x) => x.at === vr.ring[i]);
      const stubs = shape.stubs[fit.pos[i]];
      const a = doc.atoms.get(vr.ring[i])!;
      const near = here.map((x) => {
        const b = doc.atoms.get(x.first)!;
        const d = { x: (b.x - a.x) * c - (b.y - a.y) * s, y: (b.x - a.x) * s + (b.y - a.y) * c };
        const l = Math.hypot(d.x, d.y) || 1;
        return stubs.map((st) => (d.x * st.d.x + d.y * st.d.y) / (l * (Math.hypot(st.d.x, st.d.y) || 1)));
      });
      const faceOf = (k: number): Face => (Math.sign(dot3(stubs[k].xyz, n)) * shape.hand) as Face;
      if (here.length === 1) out.set(here[0].first, faceOf(near[0][0] >= near[0][1] ? 0 : 1));
      else if (here.length === 2) {
        // the pair that fits best: one on each bond
        const k = near[0][0] + near[1][1] >= near[0][1] + near[1][0] ? 0 : 1;
        out.set(here[0].first, faceOf(k));
        out.set(here[1].first, faceOf(1 - k));
      }
    }
    return out;
  }
  // flat (or drawn some other way): wedges from the ring atom say the face
  const pts: V3[] = vr.ring.map((id) => { const a = doc.atoms.get(id)!; return [a.x, a.y, 0]; });
  const nz = Math.sign(normalOf(pts)[2]) || 1;
  for (const at of vr.ring) {
    const here = vr.subs.filter((x) => x.at === at);
    const seen = here.map((x): Face => {
      const b = doc.bonds.get(x.bond)!;
      const sense = wedgeFrom(b, at);
      return sense === 0 ? 0 : ((sense * nz) as Face);
    });
    here.forEach((x, k) => {
      let f = seen[k];
      if (f === 0 && here.length === 2 && seen[1 - k] !== 0) f = (-seen[1 - k]) as Face;
      out.set(x.first, f);
    });
  }
  return out;
}

/** +1 for a wedge from this atom (towards the reader), −1 for a hashed wedge, 0 otherwise. */
function wedgeFrom(b: Bond, at: number): number {
  if (b.order !== 1 || b.a1 !== at) return 0;
  return b.display === 'wedge' || b.display === 'bold' ? 1 : b.display === 'hashWedge' || b.display === 'hash' ? -1 : 0;
}

/** True when the ring is drawn as a chair or boat now (read from its shape). */
export function shownAs(doc: Doc, vr: ViewRing): RingView | null {
  const f = fitView(doc, vr);
  return f.misfit < FITS ? f.view : null;
}

// ------------------------------------------------------------------ redrawing

export interface RingLayout {
  /** New page position (and depth) of every atom that moves. */
  moves: Map<number, { x: number; y: number; depth?: number }>;
  /** Bonds whose look changes (wedges on a flat ring, plain on a chair), with their ends. */
  bonds: Map<number, { display: BondDisplay; a1: number; a2: number }>;
}

const rot = (v: Vec, a: number): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/**
 * Where everything goes to draw the ring as `view`, with ring atom i at shape place pos[i],
 * keeping each substituent on its face. The ring keeps its middle; substituents move as a piece.
 */
export function layoutRing(doc: Doc, vr: ViewRing, view: RingView, pos: number[], faces: Map<number, Face>, L: number, centre: Vec): RingLayout | null {
  const moves: RingLayout['moves'] = new Map();
  const bonds: RingLayout['bonds'] = new Map();
  const ringAt: Vec[] = [];
  // where each substituent's first atom goes: direction from its ring atom, length (bond lengths), depth
  const subTo = new Map<number, { dir: Vec; len: number; depth?: number }>();
  if (view === 'flat') {
    vr.ring.forEach((_, i) => ringAt.push({ x: centre.x + L * HEXAGON[pos[i]].x, y: centre.y + L * HEXAGON[pos[i]].y }));
    const nz = Math.sign(normalOf(ringAt.map((p): V3 => [p.x, p.y, 0]))[2]) || 1;
    vr.ring.forEach((id, i) => {
      const here = vr.subs.filter((x) => x.at === id);
      const out = { x: ringAt[i].x - centre.x, y: ringAt[i].y - centre.y };
      const len = Math.hypot(out.x, out.y) || 1;
      const radial = { x: out.x / len, y: out.y / len };
      // two on one atom: spread either side of straight out, the up one (wedge) clockwise of it
      const spread = here.length === 2 ? 30 * Math.PI / 180 : 0;
      const ordered = here.length === 2 && (faces.get(here[0].first) ?? 0) < (faces.get(here[1].first) ?? 0) ? [here[1], here[0]] : here;
      ordered.forEach((x, k) => {
        const first = doc.atoms.get(x.first)!, ring = doc.atoms.get(id)!;
        // (as long as it was, but never shorter than nine tenths of a bond)
        subTo.set(x.first, { dir: rot(radial, here.length === 2 ? (k === 0 ? -spread : spread) : 0), len: Math.max(0.9, Math.hypot(first.x - ring.x, first.y - ring.y) / L) });
        const f = faces.get(x.first) ?? 0;
        const b = doc.bonds.get(x.bond)!;
        const display: BondDisplay = f === 0 ? (wedgeFrom(b, id) ? 'solid' : b.display) : f * nz > 0 ? 'wedge' : 'hashWedge';
        if (display !== b.display || (f !== 0 && b.a1 !== id)) bonds.set(x.bond, { display, a1: f !== 0 ? id : b.a1, a2: f !== 0 ? x.first : b.a2 });
      });
    });
  } else {
    const shape = shapeOf(view);
    if (!shape) return null;
    vr.ring.forEach((_, i) => ringAt.push({ x: centre.x + L * shape.at[pos[i]].x, y: centre.y + L * shape.at[pos[i]].y }));
    const n = normalOf(pos.map((p) => shape.xyz[p]));
    vr.ring.forEach((id, i) => {
      const here = vr.subs.filter((x) => x.at === id);
      const stubs = shape.stubs[pos[i]];
      const faceOf = (k: number) => Math.sign(dot3(stubs[k].xyz, n)) * shape.hand;
      // the equatorial bond: the one lying flatter to the ring
      const eq = Math.abs(dot3(stubs[0].xyz, n)) < Math.abs(dot3(stubs[1].xyz, n)) ? 0 : 1;
      const want = here.map((x) => faces.get(x.first) ?? 0);
      let pick: number[];
      if (here.length === 1) pick = [want[0] === 0 ? eq : faceOf(0) === want[0] ? 0 : 1];
      else if (here.length === 2) {
        const k = want[0] !== 0 ? (faceOf(0) === want[0] ? 0 : 1) : want[1] !== 0 ? (faceOf(0) === want[1] ? 1 : 0) : eq;
        pick = [k, 1 - k];
      } else pick = [];
      here.forEach((x, k) => {
        const st = stubs[pick[k]];
        const l = Math.hypot(st.d.x, st.d.y) || 1;
        subTo.set(x.first, { dir: { x: st.d.x / l, y: st.d.y / l }, len: l, depth: (shape.z[pos[i]] + st.z) * L });
        const b = doc.bonds.get(x.bond)!;
        // the shape shows the face now: a wedge from the ring atom becomes a plain bond
        if (wedgeFrom(b, id)) bonds.set(x.bond, { display: 'solid', a1: b.a1, a2: b.a2 });
      });
      moves.set(id, { ...ringAt[i], depth: shape.z[pos[i]] * L });
    });
  }
  if (view === 'flat') vr.ring.forEach((id, i) => moves.set(id, { ...ringAt[i], depth: undefined }));
  // each substituent moves as a piece: its first atom onto the new bond, the rest turned with it
  for (const x of vr.subs) {
    const ring = doc.atoms.get(x.at)!, first = doc.atoms.get(x.first)!;
    const i = vr.ring.indexOf(x.at);
    const t = subTo.get(x.first)!;
    const old = { x: first.x - ring.x, y: first.y - ring.y };
    const to = { x: ringAt[i].x + t.dir.x * t.len * L, y: ringAt[i].y + t.dir.y * t.len * L };
    const turn = Math.atan2(t.dir.y, t.dir.x) - Math.atan2(old.y, old.x);
    for (const id of x.branch) {
      const a = doc.atoms.get(id)!;
      const r = rot({ x: a.x - first.x, y: a.y - first.y }, turn);
      moves.set(id, { x: to.x + r.x, y: to.y + r.y, depth: id === x.first ? t.depth : a.depth });
    }
  }
  return { moves, bonds };
}

/** Put a layout into the drawing. Call inside an edit. */
export function applyLayout(doc: Doc, lay: RingLayout): void {
  for (const [id, m] of lay.moves) doc.updateAtom(id, { x: m.x, y: m.y, depth: m.depth });
  for (const [id, b] of lay.bonds) doc.updateBond(id, b);
}

// ------------------------------------------------------------------ the steps

/** The next shape place for each ring atom when the ring walks one place round on the page (clockwise when `step` is 1). */
export function walked(view: RingView, pos: number[], step: 1 | -1, turn = 0): number[] {
  const model = view === 'flat' ? HEXAGON : shapeOf(view)!.at;
  // the places in clockwise order on the page (y down: clockwise is increasing angle)
  const cx = model.reduce((s, p) => s + p.x, 0) / 6, cy = model.reduce((s, p) => s + p.y, 0) / 6;
  const ang = model.map((p) => Math.atan2(p.y - cy, p.x - cx) + turn);
  const order = [0, 1, 2, 3, 4, 5].sort((a, b) => ang[a] - ang[b]);
  return pos.map((p) => order[(order.indexOf(p) + step + 6) % 6]);
}

/**
 * A chair walked one place round: every ring atom moves on to about where its neighbour was, in
 * the same chair. Its axial bonds stay axial and its equatorial ones equatorial, so the picture
 * turns but the conformer stays; that takes the mirror-image drawing of the chair (one place on,
 * each atom's axial bond points the other way up the page).
 */
function walkChair(now: 'chair' | 'chair-flip', pos: number[], step: 1 | -1): { view: RingView; pos: number[] } {
  const here = shapeOf(now)!;
  // which face each ring atom's axial bond is on: the conformer
  const axialFace = (sh: Shape, ps: number[], i: number) => {
    const n = normalOf(ps.map((p) => sh.xyz[p]));
    const st = sh.stubs[ps[i]];
    const ax = Math.abs(dot3(st[0].xyz, n)) > Math.abs(dot3(st[1].xyz, n)) ? st[0] : st[1];
    return Math.sign(dot3(ax.xyz, n)) * sh.hand;
  };
  const want = axialFace(here, pos, 0);
  // where each atom should go: its angle round the middle, one sixth of a turn on (y down: clockwise is +)
  const ang = (p: Vec) => Math.atan2(p.y, p.x);
  const goal = pos.map((p) => ang(here.at[p]) + (step * Math.PI) / 3);
  let best: { view: RingView; pos: number[] } = { view: now, pos };
  let bestErr = Infinity;
  for (const view of ['chair', 'chair-flip'] as const) {
    const sh = shapeOf(view)!;
    for (const ps of ORDERS) {
      if (axialFace(sh, ps, 0) !== want) continue;
      let err = 0;
      ps.forEach((p, i) => { const d = Math.abs(((ang(sh.at[p]) - goal[i] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); err += d * d; });
      if (err < bestErr - 1e-9) { bestErr = err; best = { view, pos: ps }; }
    }
  }
  return best;
}

/** For a new view, the places that keep every ring atom nearest where it is now. */
export function nearestPlaces(doc: Doc, vr: ViewRing, view: RingView): number[] {
  const model = view === 'flat' ? HEXAGON : shapeOf(view)?.at;
  if (!model) return [0, 1, 2, 3, 4, 5];
  const drawn = vr.ring.map((id) => doc.atoms.get(id)!);
  const cx = drawn.reduce((s, a) => s + a.x, 0) / 6, cy = drawn.reduce((s, a) => s + a.y, 0) / 6;
  let best = ORDERS[0], bestErr = Infinity;
  for (const pos of ORDERS) {
    // compare directions from the middle, so a flat ring and a chair of another size still match up
    let err = 0;
    pos.forEach((p, i) => {
      const a = Math.atan2(drawn[i].y - cy, drawn[i].x - cx), b = Math.atan2(model[p].y, model[p].x);
      const d = Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      err += d * d;
    });
    if (err < bestErr - 1e-9) { bestErr = err; best = pos; }
  }
  return best;
}

/**
 * Is a ring (atoms in order round it) drawn as a regular hexagon, give or take? Then it is flat:
 * no chair or boat comes near. (The two ways round are all that need trying: a hexagon's other
 * starting places are the same fit turned.)
 */
function nearlyHexagon(doc: Doc, ring: number[]): boolean {
  const drawn = ring.map((id) => { const a = doc.atoms.get(id)!; return { x: a.x, y: a.y }; });
  return [ORDERS[0], ORDERS[6]].some((pos) => fitPoints(pos.map((p) => HEXAGON[p]), drawn).misfit < 0.05);
}

/**
 * What the chemistry engine is shown for rings drawn as chairs or boats, which show their
 * stereo by their shape, not by wedges: each such ring as it would be drawn flat, with wedges on
 * the faces its shape shows (positions and bonds to use in place of the drawing's; the drawing
 * itself is not touched). Null when there are none. A substituent that is itself a shaped ring
 * keeps its drawing.
 */
export function flatStandIn(doc: Doc, atoms: Set<number>): RingLayout | null {
  let out: RingLayout | null = null;
  const done = new Set<string>();
  const looked = new Set<number>();
  for (const id of atoms) {
    const a = doc.atoms.get(id);
    // (a ring atom with a stereocentre on it has three or four bonds)
    if (!a || a.multi || doc.degree(id) < 3) continue;
    for (const bid of doc.adj.get(id) ?? []) {
      // (a chair or boat is a ring of single bonds; each bond is looked round once)
      if (looked.has(bid) || doc.bonds.get(bid)!.order !== 1) continue;
      looked.add(bid);
      for (const r of ringsThroughBond(doc, bid, 6)) {
        if (r.length !== 6) continue;
        const key = [...r].sort((x, y) => x - y).join(',');
        if (done.has(key)) continue;
        done.add(key);
        if (out && r.some((x) => out!.moves.has(x))) continue;
        // (quick looks first, at the ring's own atoms and bonds: almost every ring is drawn flat,
        // and finding a ring's substituents walks the rest of its structure)
        if (!ringBonds(doc, r).every((x) => doc.bonds.get(x)!.order === 1) || nearlyHexagon(doc, r)) continue;
        const rough = fitView(doc, { ring: r, subs: [] });
        if (rough.view === 'flat' || rough.misfit >= FITS) continue;
        const got = viewRingOf(doc, r);
        if (!('ring' in got)) continue;
        const vr = got.ring;
        const fit = fitView(doc, vr);
        if (fit.view === 'flat' || fit.misfit >= FITS) continue;
        const faces = facesOf(doc, vr, fit);
        if (![...faces.values()].some((f) => f !== 0)) continue;
        const ats = vr.ring.map((x) => doc.atoms.get(x)!);
        const centre = { x: ats.reduce((t, p) => t + p.x, 0) / 6, y: ats.reduce((t, p) => t + p.y, 0) / 6 };
        const lay = layoutRing(doc, vr, 'flat', nearestPlaces(doc, vr, 'flat'), faces, doc.style.bondLength * (ats[0].s ?? 1), centre);
        if (!lay) continue;
        out ??= { moves: new Map(), bonds: new Map() };
        for (const [k, v] of lay.moves) if (!out.moves.has(k)) out.moves.set(k, v);
        for (const [k, v] of lay.bonds) out.bonds.set(k, v);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ one step, as the keys and menus take it

/** What a key or a menu asks of the ring: a shape, the next or the other chair, or a walk round. */
export type RingStep = RingView | 'next' | 'flip' | 'cw' | 'ccw';

const NEXT: Record<RingView, RingView> = { flat: 'chair', chair: 'chair-flip', 'chair-flip': 'boat', boat: 'flat' };

/** The shape the ring is drawn in now (anything that fits none is taken as flat). */
export function viewNow(doc: Doc, vr: ViewRing): { view: RingView; fit: ViewFit } {
  const fit = fitView(doc, vr);
  return { view: fit.misfit < FITS ? fit.view : 'flat', fit };
}

/**
 * Redraw the ring for one step, keeping every substituent on its face. Call inside an edit.
 * Returns the shape it is drawn in now.
 */
export function stepRing(doc: Doc, vr: ViewRing, step: RingStep): RingView {
  const { view: now, fit } = viewNow(doc, vr);
  const faces = facesOf(doc, vr, fit);
  let view: RingView = now;
  let pos: number[];
  if ((step === 'cw' || step === 'ccw') && (now === 'chair' || now === 'chair-flip')) {
    ({ view, pos } = walkChair(now, fit.pos, step === 'cw' ? 1 : -1));
  } else if (step === 'cw' || step === 'ccw') {
    pos = fit.misfit < FITS ? walked(now, fit.pos, step === 'cw' ? 1 : -1, fit.turn) : walked('flat', nearestPlaces(doc, vr, 'flat'), step === 'cw' ? 1 : -1);
  } else {
    view = step === 'next' ? NEXT[now] : step === 'flip' ? (now === 'chair' ? 'chair-flip' : 'chair') : step;
    pos = nearestPlaces(doc, vr, view);
  }
  const atoms = vr.ring.map((id) => doc.atoms.get(id)!);
  const centre = { x: atoms.reduce((s, a) => s + a.x, 0) / 6, y: atoms.reduce((s, a) => s + a.y, 0) / 6 };
  const L = doc.style.bondLength * (atoms[0].s ?? 1);
  const lay = layoutRing(doc, vr, view, pos, faces, L, centre);
  if (lay) applyLayout(doc, lay);
  return view;
}
