// Newman and sawhorse projections (Chemistry ▸ Newman Projection…): the groups on the two ends
// of a bond as worked out by chem/newman.ts, drawn as an ordinary circle, lines and text inside
// an invisible frame that keeps the numbers and which structure and bond it shows, so the
// projection is drawn again when that structure changes, and double-clicking it opens the window
// again (as energy diagrams do). In CDXML and Office files it is a circle, lines and text, and the
// frame's numbers travel with it.

import { Doc, type Arrow, type Caption, type Frame, type Shape } from '../model';
import type { Vec } from '../geom';
import type { Measure } from '../editor/arrange';
import { chemRuns } from '../text/chemtext';
import { frameBox, frameMembers } from '../editor/frames';
import { tokenize } from '../chem/labels';
import { sizeRanks, type NewmanGroup } from '../chem/newman';
import type { NewmanLook } from './newman-prefs';

export { DEFAULT_NEWMAN_PREFS, NEWMAN_LOOK, parseNewmanPrefs, type NewmanLook, type NewmanPrefs, type RankLook } from './newman-prefs';

/** What a projection keeps: the view it shows and where it came from. */
export interface NewmanData {
  kind: 'newman' | 'sawhorse';
  front: NewmanGroup[];
  back: NewmanGroup[];
  /** Degrees the back atom is turned from the conformer (the dial). */
  turn: number;
  /**
   * The drawn structure it shows and the bond, front atom first (drawn atom ids), while linked:
   * `key` is the structure as it was (atoms, labels, bonds and wedges), so a change to it redraws
   * the projection. In a file, ids change: `at` keeps where the bond's two atoms were drawn, and
   * they are found again there on opening.
   */
  link?: { atoms: number[]; front: number; back: number; key: string; at?: [number, number, number, number] };
  /** The viewing mark (eye and dotted arrow) drawn on the structure, while there is one. */
  mark?: { arrows: number[]; shapes: number[]; color: string; at: [number, number, number, number] };
  /** Which conformer (0 = the most stable), its energy above the lowest (kcal/mol) and how it was worked out. */
  conformer: number;
  energy?: number;
  method?: string;
  /** Where the conformation came from: the most stable, as drawn, or a turned angle. */
  source: 'stable' | 'drawn' | 'angle';
  look: NewmanLook;
}

export interface NewmanParts { captions: number[]; arrows: number[]; shapes: number[] }

const RAD = Math.PI / 180;
/** Unit vector at `deg` clockwise from up, on the page (y down). */
const dir = (deg: number): Vec => ({ x: Math.sin(deg * RAD), y: -Math.cos(deg * RAD) });

/** The label written the other way round, for a group on the left (CH3 → H3C, CO2Me → MeO2C). */
export function reversedLabel(label: string): string {
  const toks = tokenize(label);
  if (toks.length < 2 || toks.some((t) => t.kind === 'other')) return label;
  return toks.map((t) => t.text + (t.count > 1 || t.explicit ? String(t.count) : '') + t.charge).reverse().join('');
}

/** Angles the back groups are drawn at: turned by `offset` when they would sit on a front group. */
export function backAngles(front: NewmanGroup[], back: NewmanGroup[], turn: number, offset: number): number[] {
  const angles = back.map((g) => g.angle + turn);
  const eclipsed = back.some((_, i) => front.some((f) => Math.abs(((angles[i] - f.angle + 540) % 360) - 180) < Math.max(4, offset * 0.6)));
  return eclipsed ? angles.map((a) => a + offset) : angles;
}

/**
 * Draw the projection centred at `c` (the front atom). Returns what was made (the caller puts it
 * in a frame). Call inside an edit.
 */
export function drawNewman(doc: Doc, m: Measure, d: NewmanData, c: Vec): NewmanParts {
  const out: NewmanParts = { captions: [], arrows: [], shapes: [] };
  const L = doc.style.bondLength, lw = doc.style.lineWidth;
  const look = d.look;
  const R = look.radius * L, end = R * (1 + look.reach);
  // ring members (the ring runs on round through the bond) are joined by an arc, not written or ranked
  const ranks = (gs: NewmanGroup[]): (0 | 1 | 2)[] => { const own = gs.filter((g) => g.ring === undefined); const r = sizeRanks(own); return gs.map((g) => (g.ring === undefined ? r[own.indexOf(g)] : 2)); };
  const fr = ranks(d.front), br = ranks(d.back);
  const ringTips: { front: boolean; tip: Vec; u: Vec }[] = [];
  const line = (a: Vec, b: Vec, color = '#000000'): number => { const id = doc.addShape({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color }).id; out.shapes.push(id); return id; };
  const bondInk = (rank: number) => (look.ranks[rank].bond ? look.ranks[rank].color : '#000000');
  // labels go on after the lines: the front ones first, then the back ones, slid round clear of them
  const jobs: { g: NewmanGroup; rank: number; u: Vec; tip: Vec; back: boolean; bond: number }[] = [];
  const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
  /**
   * A group's label, at the end of its own bond: beside the bond's end for a bond running left
   * or right (the attached atom nearest it, so H3C and HO on the left), above or below it for one
   * running up or down. A label that would sit on another is moved out along its bond (the bond
   * drawn longer) or a little round (the bond's end turned to meet it), whichever is the smaller
   * move, so the bond always reaches its label.
   */
  const label = (g: NewmanGroup, rank: number, u: Vec, tip: Vec, bond: number) => {
    const rl = look.ranks[rank];
    const style = (text: string) => chemRuns(text).map((r) => ({ ...r, ...(rl.color !== '#000000' ? { color: rl.color } : {}), ...(rl.bold ? { bold: true } : {}), ...(rl.italic ? { italic: true } : {}) }));
    const measure = (text: string) => { const c = doc.addCaption({ x: 0, y: 0, runs: style(text), justify: 'left', chem: false }); const b = m.captionBox(c); doc.removeCaption(c.id); return b; };
    // written forwards, or backwards when it sits to the left of its bond (H3C, HO)
    const fwd = g.label, rev = reversedLabel(g.label);
    const bf = measure(fwd), br = rev === fwd ? bf : measure(rev);
    const h = bf.y2 - bf.y1, gap = 0.08 * L;
    // the letters fill about the middle 70% of the line's height: the box's edges are kept that close
    const ink = 0.35 * h;
    // above or below its bond, a label is centred on the atom the bond meets (the C of CO2Me)
    let atomShift = 0;
    const sym = /^[A-Z][a-z]?/.exec(fwd)?.[0];
    if (sym && sym !== fwd) { const ob = measure(sym); atomShift = (bf.x2 - bf.x1) / 2 - (ob.x2 - ob.x1) / 2; }
    type Mode = 'right' | 'left' | 'up' | 'down';
    const width = (mode: Mode) => (mode === 'left' ? br.x2 - br.x1 : bf.x2 - bf.x1);
    const centreFor = (t: Vec, mode: Mode): Vec => {
      const w = width(mode);
      if (mode === 'right') return { x: t.x + w / 2 + gap, y: t.y + u.y * ink * 0.6 };
      if (mode === 'left') return { x: t.x - w / 2 - gap, y: t.y + u.y * ink * 0.6 };
      // above it, the bond stops short of any subscript
      return { x: t.x + atomShift, y: mode === 'up' ? t.y - (0.5 * h + gap * 0.5) : t.y + ink + gap };
    };
    const boxAt = (p: Vec, mode: Mode) => { const w = width(mode); return { x1: p.x - w / 2, y1: p.y - ink, x2: p.x + w / 2, y2: p.y + ink }; };
    // clear of the other labels, the circle, and every other bond
    const hits = (p: Vec, mode: Mode) => {
      const r = boxAt(p, mode), e = 0.06 * L;
      if (placed.some((q) => r.x1 - e < q.x2 && q.x1 < r.x2 + e && r.y1 - e < q.y2 && q.y1 < r.y2 + e)) return true;
      if (d.kind === 'newman' && Math.hypot(Math.max(r.x1 - c.x, 0, c.x - r.x2), Math.max(r.y1 - c.y, 0, c.y - r.y2)) < R + 0.04 * L) return true;
      for (const id of out.shapes) {
        const l = id === bond ? undefined : doc.shapes.get(id);
        if (l?.kind !== 'line') continue;
        for (let i = 0; i <= 12; i++) {
          const q = { x: l.x1 + ((l.x2 - l.x1) * i) / 12, y: l.y1 + ((l.y2 - l.y1) * i) / 12 };
          if (q.x > r.x1 - e && q.x < r.x2 + e && q.y > r.y1 - e && q.y < r.y2 + e) return true;
        }
      }
      return false;
    };
    // the bond may not cross another label on its way out
    const from = (() => { const l = doc.shapes.get(bond); return l ? { x: l.x1, y: l.y1 } : tip; })();
    const crosses = (e: Vec) => {
      for (let i = 1; i <= 24; i++) {
        const q = { x: from.x + ((e.x - from.x) * i) / 24, y: from.y + ((e.y - from.y) * i) / 24 };
        if (placed.some((r) => q.x > r.x1 + 0.5 && q.x < r.x2 - 0.5 && q.y > r.y1 + 0.5 && q.y < r.y2 - 0.5)) return true;
      }
      return false;
    };
    const first: Mode = Math.abs(u.x) > 0.34 ? (u.x > 0 ? 'right' : 'left') : u.y < 0 ? 'up' : 'down';
    // where it can go, the least change first: at the bond's end as usual; beside (or above or
    // below) the bond's end instead, the way eclipsed groups are written side by side; then
    // the bond drawn longer, or its end turned a little, so the bond always reaches the label
    const tries: { at: Vec; mode: Mode; cost: number }[] = [{ at: tip, mode: first, cost: 0 }];
    const others: Mode[] = first === 'up' || first === 'down' ? ['right', 'left'] : ['up', 'down'];
    for (const mode of others) tries.push({ at: tip, mode, cost: 0.2 * L + (mode === 'left' && u.x > 0.1 ? 0.1 * L : 0) + (mode === 'right' && u.x < -0.1 ? 0.1 * L : 0) });
    const t = { x: -u.y, y: u.x };
    for (let k = 1; k <= 60; k++) {
      const st = k * 0.05 * L;
      tries.push({ at: { x: tip.x + u.x * st, y: tip.y + u.y * st }, mode: first, cost: 0.2 * L + st });
      tries.push({ at: { x: tip.x + t.x * st, y: tip.y + t.y * st }, mode: first, cost: 0.2 * L + st * 1.4 });
      tries.push({ at: { x: tip.x - t.x * st, y: tip.y - t.y * st }, mode: first, cost: 0.2 * L + st * 1.4 });
    }
    tries.sort((p, q) => p.cost - q.cost);
    const pick = tries.find((x) => !hits(centreFor(x.at, x.mode), x.mode) && !crosses(x.at)) ?? tries.find((x) => !hits(centreFor(x.at, x.mode), x.mode)) ?? tries[0];
    if (pick.at !== tip) doc.updateShape(bond, { x2: pick.at.x, y2: pick.at.y });
    const text = pick.mode === 'left' ? rev : fwd;
    const cap = doc.addCaption({ x: 0, y: 0, runs: style(text), justify: 'left', chem: false });
    const b = m.captionBox(cap);
    const ctr = centreFor(pick.at, pick.mode);
    placed.push(boxAt(ctr, pick.mode));
    doc.updateCaption(cap.id, { x: ctr.x - (b.x2 - b.x1) / 2 - b.x1 + cap.x, y: ctr.y - h / 2 - b.y1 + cap.y });
    out.captions.push(cap.id);
  };

  if (d.kind === 'newman') {
    const back = backAngles(d.front, d.back, d.turn, look.offset);
    // back bonds first, from the circle out
    d.back.forEach((g, i) => {
      const u = dir(back[i]);
      const a = { x: c.x + u.x * R, y: c.y + u.y * R }, b = { x: c.x + u.x * end, y: c.y + u.y * end };
      const bond = line(a, b, bondInk(br[i]));
      jobs.push({ g, rank: br[i], u, tip: b, back: true, bond });
    });
    out.shapes.push(doc.addShape({ kind: 'oval', x1: c.x - R, y1: c.y - R, x2: c.x + R, y2: c.y + R, color: '#000000', filled: true, fillColor: '#ffffff' }).id);
    d.front.forEach((g, i) => {
      const u = dir(g.angle);
      const b = { x: c.x + u.x * end, y: c.y + u.y * end };
      const bond = line(c, b, bondInk(fr[i]));
      jobs.push({ g, rank: fr[i], u, tip: b, back: false, bond });
    });
    if (look.dot) out.shapes.push(doc.addShape({ kind: 'oval', x1: c.x - 1.6 * lw, y1: c.y - 1.6 * lw, x2: c.x + 1.6 * lw, y2: c.y + 1.6 * lw, color: '#000000', filled: true, fillColor: '#000000', lineWidth: 0 }).id);
  } else {
    // sawhorse: the molecule seen from above and to one side, the back atom up and to the right.
    // Each group leaves its atom at the tetrahedral angle (a third of its length along the bond).
    const yaw = 48 * RAD, pitch = 32 * RAD, sep = 1.35 * L, arm = 0.95 * L;
    const project = (x: number, y: number, z: number): Vec => {
      const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
      const y2 = y * Math.cos(pitch) + z1 * Math.sin(pitch);
      return { x: c.x + x1, y: c.y - y2 };
    };
    const cb = project(0, 0, sep);
    const spoke = (deg: number, z0: number, dz: number) => {
      const s = 0.943 * arm;
      return project(Math.sin(deg * RAD) * s, Math.cos(deg * RAD) * s, z0 + dz * arm);
    };
    const unit = (a: Vec, b: Vec) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
    d.back.forEach((g, i) => {
      const b = spoke(g.angle + d.turn, sep, 0.333);
      const bond = line(cb, b, bondInk(br[i]));
      jobs.push({ g, rank: br[i], u: unit(cb, b), tip: b, back: true, bond });
    });
    line(c, cb);
    d.front.forEach((g, i) => {
      const b = spoke(g.angle, 0, -0.333);
      const bond = line(c, b, bondInk(fr[i]));
      jobs.push({ g, rank: fr[i], u: unit(c, b), tip: b, back: false, bond });
    });
  }
  for (const j of jobs) if (j.g.ring !== undefined) ringTips.push({ front: !j.back, tip: j.tip, u: j.u });
  const fTip = ringTips.find((t) => t.front), bTip = ringTips.find((t) => !t.front);
  if (fTip && bTip) {
    // the rest of the ring: an arc from one ring bond's end to the other's, bowed away from the middle
    const mid = { x: (fTip.tip.x + bTip.tip.x) / 2 - c.x, y: (fTip.tip.y + bTip.tip.y) / 2 - c.y };
    const chord = { x: bTip.tip.x - fTip.tip.x, y: bTip.tip.y - fTip.tip.y };
    const outward = chord.x * mid.y - chord.y * mid.x;
    const sweep = (outward > 0 ? -1 : 1) * 110 * RAD;
    out.arrows.push(doc.addArrow({ tail: fTip.tip, head: bTip.tip, headStyle: 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep, headLength: 0, headWidth: 0 } as Omit<Arrow, 'id'>).id);
  }
  for (const j of jobs.filter((j) => !j.back && (j.g.ring === undefined || !bTip))) label(j.g, j.rank, j.u, j.tip, j.bond);
  for (const j of jobs.filter((j) => j.back && (j.g.ring === undefined || !fTip))) label(j.g, j.rank, j.u, j.tip, j.bond);
  return out;
}

/**
 * Draw a projection in a frame of its own centred at `c`, or draw the one in frame `id` again
 * (what it drew before goes). Returns the frame's id. Call inside an edit.
 */
export function putNewman(doc: Doc, m: Measure, d: NewmanData, c: Vec, id?: number): number {
  const old = id !== undefined ? doc.shapes.get(id) : undefined;
  if (old?.frame) {
    for (const x of old.frame.captions) doc.removeCaption(x);
    for (const x of old.frame.arrows) doc.removeArrow(x);
    for (const x of old.frame.shapes) doc.removeShape(x);
  }
  const parts = drawNewman(doc, m, d, c);
  const pad = 0.2 * doc.style.bondLength;
  const frame: Frame = { atoms: [], captions: parts.captions, arrows: parts.arrows, shapes: parts.shapes, padX: pad, padY: pad, fit: true };
  const b = frameBox(doc, frame, m) ?? { x1: c.x - 20, y1: c.y - 20, x2: c.x + 20, y2: c.y + 20 };
  const name = d.kind === 'newman' ? 'Newman projection' : 'Sawhorse projection';
  if (old) { doc.updateShape(old.id, { ...b, frame, newman: d }); return old.id; }
  return doc.addShape({ kind: 'geo', geo: 'rect', ...b, filled: false, lineWidth: 0, color: '#000000', frame, newman: d, name }).id;
}

/** Where a projection's front atom was drawn (the centre it is drawn round again). */
export function newmanCentre(doc: Doc, s: Shape): Vec | null {
  const f = s.frame;
  if (!f || !s.newman) return null;
  const circle = f.shapes.map((id) => doc.shapes.get(id)).find((x) => x?.kind === 'oval');
  if (circle && s.newman.kind === 'newman') return { x: (circle.x1 + circle.x2) / 2, y: (circle.y1 + circle.y2) / 2 };
  // a sawhorse: the front atom starts the most lines (its bonds and the one to the back atom)
  const starts = new Map<string, { p: Vec; n: number }>();
  for (const id of f.shapes) {
    const x = doc.shapes.get(id);
    if (x?.kind !== 'line') continue;
    const k = `${Math.round(x.x1 * 100)},${Math.round(x.y1 * 100)}`;
    const e = starts.get(k) ?? { p: { x: x.x1, y: x.y1 }, n: 0 };
    e.n++;
    starts.set(k, e);
  }
  let best: { p: Vec; n: number } | null = null;
  for (const e of starts.values()) if (!best || e.n > best.n) best = e;
  return best ? best.p : null;
}

/** The projection a thing belongs to (its frame's id), if any. */
export function newmanFrameOf(doc: Doc, kind: 'atom' | 'bond' | 'caption' | 'arrow' | 'shape', id: number): number | null {
  if (kind === 'shape' && doc.shapes.get(id)?.newman) return id;
  for (const s of doc.shapes.values()) {
    if (!s.newman || !s.frame) continue;
    const f = s.frame;
    if (kind === 'caption' && f.captions.includes(id)) return s.id;
    if (kind === 'arrow' && f.arrows.includes(id)) return s.id;
    if (kind === 'shape' && f.shapes.includes(id)) return s.id;
    if (kind === 'atom' || kind === 'bond') {
      const atom = kind === 'atom' ? id : doc.bonds.get(id)?.a1;
      if (atom !== undefined && frameMembers(doc, f).atoms.has(atom)) return s.id;
    }
  }
  return null;
}

/**
 * The viewing-direction mark on the structure (an eye looking along the bond at its front atom,
 * with a dotted arrow), as in textbook figures. Returns what was made. Call inside an edit.
 */
export function drawEyeMark(doc: Doc, front: Vec, back: Vec, color = '#1a56db'): { arrows: number[]; shapes: number[] } {
  const L = doc.style.bondLength, lw = doc.style.lineWidth;
  const ux = (front.x - back.x), uy = (front.y - back.y), l = Math.hypot(ux, uy) || 1;
  const u = { x: ux / l, y: uy / l }, n = { x: -u.y, y: u.x };
  const tip = { x: front.x + u.x * 0.35 * L, y: front.y + u.y * 0.35 * L };
  const tail = { x: front.x + u.x * 1.9 * L, y: front.y + u.y * 1.9 * L };
  const arrows: number[] = [], shapes: number[] = [];
  arrows.push(doc.addArrow({ tail, head: tip, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'dashed', noGo: false, equilibrium: false, sweep: 0, headLength: lw * 7, headWidth: lw * 2.6, color } as Omit<Arrow, 'id'>).id);
  // the eye, side on: two lids meeting at the corner nearest the arrow, closed by the eyeball's curve
  const s = 0.6 * L;
  const corner = { x: tail.x + u.x * 0.15 * L, y: tail.y + u.y * 0.15 * L };
  const lidEnd = (k: number) => ({ x: corner.x + u.x * s + n.x * k * s * 0.62, y: corner.y + u.y * s + n.y * k * s * 0.62 });
  for (const k of [1, -1]) { const e = lidEnd(k); shapes.push(doc.addShape({ kind: 'line', x1: corner.x, y1: corner.y, x2: e.x, y2: e.y, color }).id); }
  arrows.push(doc.addArrow({ tail: lidEnd(1), head: lidEnd(-1), headStyle: 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 110 * RAD, headLength: 0, headWidth: 0, color } as Omit<Arrow, 'id'>).id);
  return { arrows, shapes };
}

/** A caption's look, for tests. */
export const captionText = (c: Caption): string => c.runs.map((r) => r.text).join('');

/**
 * The structure as far as its projection cares: its atoms (ids, elements, labels, charges,
 * isotopes) and bonds (orders and wedges, which way round), not where they are drawn.
 */
export function structureKey(doc: Doc, ids: Iterable<number>): string {
  const set = [...ids].filter((id) => doc.atoms.has(id)).sort((p, q) => p - q);
  const inSet = new Set(set);
  const atoms = set.map((id) => { const a = doc.atoms.get(id)!; return `${id}:${a.z}:${a.label ?? ''}:${a.charge}:${a.isotope}`; });
  const bonds: string[] = [];
  for (const id of set) for (const bid of doc.adj.get(id) ?? []) {
    const b = doc.bonds.get(bid);
    if (b && b.a1 === id && inSet.has(b.a2)) bonds.push(`${b.a1}-${b.a2}:${b.order}:${b.display}`);
  }
  return atoms.join(',') + '|' + bonds.sort().join(',');
}

/** Draw a projection's viewing mark at the bond as it is now drawn (the old one goes). Returns the mark. Call inside an edit. */
export function putMark(doc: Doc, d: NewmanData, color: string): NewmanData['mark'] {
  if (d.mark) {
    for (const x of d.mark.arrows) doc.removeArrow(x);
    for (const x of d.mark.shapes) doc.removeShape(x);
  }
  const f = d.link && doc.atoms.get(d.link.front), b = d.link && doc.atoms.get(d.link.back);
  if (!f || !b) return undefined;
  return { ...drawEyeMark(doc, f, b, color), color, at: [f.x, f.y, b.x, b.y] };
}

/**
 * After a change: a linked projection's viewing mark follows its bond when the structure moves,
 * and the projections whose structure changed (an atom, label, bond or wedge) are returned, to be
 * worked out again. One whose bond is gone lets go of it. Call inside an edit (doc.beforeCommit).
 */
export function refitNewman(doc: Doc, before: ReadonlyMap<string, unknown>): number[] {
  const stale: number[] = [];
  let bondsTouched = false;
  for (const k of before.keys()) if (k[0] === 'b') { bondsTouched = true; break; }
  for (const s of [...doc.shapes.values()]) {
    const d = s.newman;
    if (!d?.link) continue;
    const link = d.link;
    // a mark with a piece deleted is the person's to keep or delete: it is no longer moved
    if (d.mark && (d.mark.arrows.some((x) => !doc.arrows.has(x)) || d.mark.shapes.some((x) => !doc.shapes.has(x)))) {
      doc.updateShape(s.id, { newman: { ...d, mark: undefined } });
      continue;
    }
    if (!bondsTouched && !link.atoms.some((id) => before.has('a' + id)) && !before.has('a' + link.front) && !before.has('a' + link.back)) continue;
    const f = doc.atoms.get(link.front), b = doc.atoms.get(link.back);
    const joined = f && b && (doc.adj.get(f.id) ?? []).some((bid) => { const x = doc.bonds.get(bid); return !!x && (x.a1 === b.id || x.a2 === b.id) && x.order === 1; });
    if (!joined) { doc.updateShape(s.id, { newman: { ...d, link: undefined } }); continue; }
    if (d.mark && (Math.abs(d.mark.at[0] - f.x) + Math.abs(d.mark.at[1] - f.y) + Math.abs(d.mark.at[2] - b.x) + Math.abs(d.mark.at[3] - b.y) > 1e-6)) {
      const moved = d.mark.arrows.some((x) => before.has('r' + x)) || d.mark.shapes.some((x) => before.has('s' + x));
      // moved along with the structure: it is where it should be already
      const mark = moved ? { ...d.mark, at: [f.x, f.y, b.x, b.y] as [number, number, number, number] } : putMark(doc, d, d.mark.color);
      doc.updateShape(s.id, { newman: { ...d, mark } });
    }
    if (structureKey(doc, doc.fragmentOf(link.front)) !== link.key) stale.push(s.id);
  }
  return stale;
}

/**
 * A projection's numbers as a file keeps them: the bond by where its atoms are drawn (ids change
 * between files), its mark by its colour, found again by its lines on opening.
 */
export function newmanForFile(doc: Doc, d: NewmanData): NewmanData {
  const f = d.link && doc.atoms.get(d.link.front), b = d.link && doc.atoms.get(d.link.back);
  if (!d.link || !f || !b) { const { link: _l, mark: _m, ...rest } = d; return rest; }
  const at: [number, number, number, number] = [f.x, f.y, b.x, b.y];
  return { ...d, link: { atoms: [], front: -1, back: -1, key: '', at }, ...(d.mark ? { mark: { arrows: [], shapes: [], color: d.mark.color, at: d.mark.at } } : {}) };
}

/** After opening a file: each projection finds its bond again where it was drawn, and its viewing mark by its lines; one that can't lets go. */
export function relinkNewman(doc: Doc): void {
  const near = (x: number, y: number) => {
    let best: number | null = null, bd = 0.75;
    for (const a of doc.atoms.values()) { const dd = Math.hypot(a.x - x, a.y - y); if (dd < bd) { bd = dd; best = a.id; } }
    return best;
  };
  for (const s of [...doc.shapes.values()]) {
    const d = s.newman;
    if (!d?.link?.at) continue;
    const [fx, fy, bx, by] = d.link.at;
    const f = near(fx, fy), b = near(bx, by);
    const joined = f !== null && b !== null && (doc.adj.get(f) ?? []).some((bid) => { const x = doc.bonds.get(bid); return !!x && (x.a1 === b || x.a2 === b); });
    if (!joined) { const { link: _l, mark: _m, ...rest } = d; doc.updateShape(s.id, { newman: rest }); continue; }
    const atoms = [...doc.fragmentOf(f!)];
    const link = { atoms, front: f!, back: b!, key: structureKey(doc, atoms) };
    let mark: NewmanData['mark'];
    if (d.mark) {
      // the mark as it would be drawn, matched line for line with what is on the page
      const tmp = new Doc();
      tmp.style = { ...doc.style };
      const [mfx, mfy, mbx, mby] = d.mark.at;
      let want: { arrows: number[]; shapes: number[] } = { arrows: [], shapes: [] };
      tmp.bulk(() => { want = drawEyeMark(tmp, { x: mfx, y: mfy }, { x: mbx, y: mby }, d.mark!.color); });
      const close = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 0.5;
      const arrows = want.arrows.map((id) => { const w = tmp.arrows.get(id)!; return [...doc.arrows.values()].find((a) => close(a.tail, w.tail) && close(a.head, w.head))?.id; });
      const shapes = want.shapes.map((id) => { const w = tmp.shapes.get(id)!; return [...doc.shapes.values()].find((x) => x.kind === 'line' && close({ x: x.x1, y: x.y1 }, { x: w.x1, y: w.y1 }) && close({ x: x.x2, y: x.y2 }, { x: w.x2, y: w.y2 }))?.id; });
      if (arrows.every((x) => x !== undefined) && shapes.every((x) => x !== undefined)) mark = { arrows: arrows as number[], shapes: shapes as number[], color: d.mark.color, at: d.mark.at };
    }
    const { mark: _m, ...rest } = d;
    doc.updateShape(s.id, { newman: { ...rest, link, ...(mark ? { mark } : {}) } });
  }
}
