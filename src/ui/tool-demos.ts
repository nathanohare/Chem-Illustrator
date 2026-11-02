// Demo clips for the tools that take more than a click (review item 17). Hold the pointer on such
// a tool's button and a short demo plays beside it: the steps, drawn frame by frame by the app's own
// drawing engine from a script, not a recording. Each demo is a few numbered steps; each step says
// what to do and shows it happening, with the pointer (pressed or not) and any key pressed.

import { Doc } from '../model';
import type { Rect, Vec } from '../geom';
import { arcCenter } from '../geom';
import { recordPicture } from '../render/picture';
import { Renderer } from '../render/renderer';
import { bondHapto } from '../chem/hapto';
import { chainPoints } from '../chem/chemgeom';
import { fragmentRuns } from '../chem/fragments';
import { stepRing, viewRingOf, type RingStep } from '../chem/ring-views';
import type { DemoLook } from '../settings';

/** Where the pointer is in a frame, in the drawing's points, and whether its button is down. */
export interface DemoPointer extends Vec { down?: boolean }

/** One frame of a demo: the drawing, the pointer, a key being pressed, and what is selected. */
export interface DemoFrame {
  doc: Doc;
  pointer?: DemoPointer | null;
  key?: string | null;
  /** Shown as selected (a pale box round it, as on the canvas). */
  selected?: Rect | null;
}

export interface ToolDemo {
  title: string;
  /** What to do at each step, and how long the step takes to play. */
  steps: { say: string; ms: number }[];
  /** The frame `t` of the way (0 to 1) through step `step`. */
  frame(step: number, t: number): DemoFrame;
}

// ------------------------------------------------------------------ helpers for the scripts

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** Eased in and out, so the pointer starts and stops like a hand. */
const ease = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
/** The part of `t` between `a` and `b`, as 0 to 1. */
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const mix = (p: Vec, q: Vec, t: number): Vec => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const at = (p: Vec, dx: number, dy: number): Vec => ({ x: p.x + dx, y: p.y + dy });

/** A curved (mechanism) arrow drawn `t` of the way along its arc, as when it is being dragged out. */
function curvedArrow(doc: Doc, tail: Vec, head: Vec, sweep: number, t: number, half = false): void {
  if (t <= 0.02) return;
  const lw = doc.style.lineWidth;
  let end = head, s = sweep;
  if (t < 1) {
    // the point t of the way round the finished arc
    const { center, radius } = arcCenter(tail, head, sweep);
    const a0 = Math.atan2(tail.y - center.y, tail.x - center.x);
    const a1 = Math.atan2(head.y - center.y, head.x - center.x);
    let d = a1 - a0;
    // the way round that turns through the arrow's sweep
    const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
    d = wrap(d);
    if (Math.abs(Math.abs(d) - Math.abs(sweep)) > 1e-3) d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
    end = { x: center.x + radius * Math.cos(a0 + d * t), y: center.y + radius * Math.sin(a0 + d * t) };
    s = sweep * t;
  }
  doc.addArrow({
    tail, head: end, sweep: s, headStyle: half ? 'halfLeft' : 'full', tailStyle: 'none', headType: 'solid', line: 'solid',
    noGo: false, equilibrium: false, headLength: lw * 10, headWidth: lw * 2.5,
  });
}

/** Ring atoms round a centre, the first at the top. */
function ringAt(doc: Doc, c: Vec, n: number, r: number, z = 6): number[] {
  const ids: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (-90 + (360 / n) * k) * Math.PI / 180;
    ids.push(doc.addAtom(c.x + r * Math.cos(a), c.y + r * Math.sin(a), z).id);
  }
  return ids;
}

function boxOfAtoms(doc: Doc, ids: Iterable<number>, pad: number): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of ids) {
    const a = doc.atoms.get(id);
    if (!a) continue;
    x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y); x2 = Math.max(x2, a.x); y2 = Math.max(y2, a.y);
  }
  return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
}

// ------------------------------------------------------------------ the demos

/** What a script gives for each frame besides the drawing it drew into. */
type Extras = Omit<DemoFrame, 'doc'>;

/** A demo from a script that draws each frame into a fresh drawing (as one change to it). */
function scripted(title: string, steps: ToolDemo['steps'], draw: (d: Doc, step: number, t: number) => Extras): ToolDemo {
  return {
    title,
    steps,
    frame(step, t) {
      const doc = new Doc();
      let rest: Extras = {};
      doc.bulk(() => { rest = draw(doc, step, t); });
      return { doc, ...rest };
    },
  };
}

const L0 = new Doc().style.bondLength;

/** The head of the arrow being dragged out (the last one drawn), or `or` before there is one. */
const lastHead = (d: Doc, or: Vec): Vec => [...d.arrows.values()].pop()?.head ?? or;

/** Hydroxide adding to acetaldehyde: two electron-pair arrows. */
function curvedDemo(): ToolDemo {
  const L = L0;
  const c = { x: 2.6 * L, y: 0 }, o = { x: c.x, y: c.y - L };
  const t1 = { x: 0.25 * L, y: -0.55 * L }, h1 = at(c, -0.42 * L, -0.2 * L);
  const t2 = at(c, 0.2 * L, -0.5 * L), h2 = at(o, 0.42 * L, 0.02 * L);
  const start = { x: -1.2 * L, y: 1.4 * L };
  const scene = (d: Doc) => {
    d.addAtom(0, 0, 8, { charge: -1, label: 'HO' });
    const ci = d.addAtom(c.x, c.y).id;
    d.addBond(ci, d.addAtom(o.x, o.y, 8).id, 2);
    d.addBond(ci, d.addAtom(c.x + 0.866 * L, c.y + 0.5 * L).id, 1);
    d.addBond(ci, d.addAtom(c.x - 0.866 * L, c.y + 0.5 * L, 1).id, 1);
  };
  return scripted('Curved arrow', [
    { say: 'Press on the electrons that move: a lone pair, an atom or a bond', ms: 1100 },
    { say: 'Drag to where they go. The arrow snaps to the atom', ms: 1300 },
    { say: 'The next arrow the same way: the C=O π bond moves onto O', ms: 1500 },
  ], (d, step, t) => {
    scene(d);
    if (step === 0) return { pointer: { ...mix(start, t1, ease(span(t, 0, 0.7))), down: t > 0.8 } };
    if (step === 1) {
      curvedArrow(d, t1, h1, 1.9, ease(t));
      return { pointer: { ...lastHead(d, t1), down: t < 0.95 } };
    }
    curvedArrow(d, t1, h1, 1.9, 1);
    const g = ease(span(t, 0.3, 0.9));
    curvedArrow(d, t2, h2, -3.4, g);
    const p = t < 0.3 ? mix(h1, t2, ease(span(t, 0, 0.25))) : d.arrows.size > 1 ? lastHead(d, t2) : t2;
    return { pointer: { ...p, down: t > 0.27 && t < 0.95 } };
  });
}

/** Bromine split by light: two one-electron (half-headed) arrows. */
function fishhookDemo(): ToolDemo {
  const L = L0;
  const t1 = { x: 0.8 * L, y: -0.18 * L }, h1 = { x: 0.1 * L, y: -0.72 * L };
  const t2 = { x: 0.8 * L, y: 0.18 * L }, h2 = { x: 1.5 * L, y: 0.72 * L };
  const start = { x: -0.8 * L, y: 1.3 * L };
  return scripted('Curved half-headed arrow', [
    { say: 'Press on the bond the electron leaves', ms: 1000 },
    { say: 'Drag to the atom it goes to: a one-electron arrow', ms: 1200 },
    { say: 'The other electron goes the other way', ms: 1300 },
  ], (d, step, t) => {
    d.addBond(d.addAtom(0, 0, 35).id, d.addAtom(1.6 * L, 0, 35).id, 1);
    if (step === 0) return { pointer: { ...mix(start, t1, ease(span(t, 0, 0.7))), down: t > 0.8 } };
    if (step === 1) {
      curvedArrow(d, t1, h1, -2, ease(t), true);
      return { pointer: { ...lastHead(d, t1), down: t < 0.95 } };
    }
    curvedArrow(d, t1, h1, -2, 1, true);
    const g = ease(span(t, 0.3, 0.9));
    curvedArrow(d, t2, h2, -2, g, true);
    const p = t < 0.3 ? mix(h1, t2, ease(span(t, 0, 0.25))) : d.arrows.size > 1 ? lastHead(d, t2) : t2;
    return { pointer: { ...p, down: t > 0.27 && t < 0.95 } };
  });
}

/** Iron bonded η⁵ to a cyclopentadienyl ring. */
function haptoDemo(): ToolDemo {
  const L = L0;
  const fe = { x: 0, y: 1.9 * L }, mid = { x: 0, y: 0.05 * L }, start = { x: 1.8 * L, y: 2.8 * L };
  return scripted('Hapto (η) bond', [
    { say: 'Press on the metal', ms: 1000 },
    { say: 'Drag into the ring (or onto a C=C bond)', ms: 1200 },
    { say: 'Let go: η⁵, one bond to the middle of the ring', ms: 1400 },
  ], (d, step, t) => {
    const ring = ringAt(d, { x: 0, y: 0 }, 5, L * 0.85);
    ring.forEach((id, i) => d.addBond(id, ring[(i + 1) % 5], i === 0 || i === 2 ? 2 : 1));
    const metal = d.addAtom(fe.x, fe.y, 26).id;
    if (step === 0) return { pointer: { ...mix(start, fe, ease(span(t, 0, 0.7))), down: t > 0.8 } };
    if (step === 1) {
      const p = mix(fe, mid, ease(t));
      if (t > 0.05) d.addShape({ kind: 'line', x1: fe.x, y1: fe.y - 0.35 * L, x2: p.x, y2: p.y, dashed: true });
      return { pointer: { ...p, down: true } };
    }
    bondHapto(d, metal, ring);
    return { pointer: { ...at(mid, 0.6 * L * ease(t), 0.4 * L * ease(t)), down: false } };
  });
}

/** A zig-zag chain dragged out, its count beside the pointer. */
function chainDemo(): ToolDemo {
  const L = L0;
  const start = { x: 0, y: 0 }, end = { x: 6 * L * 0.866, y: 0 }, from = { x: -0.8 * L, y: 1.6 * L };
  const chain = (d: Doc, p: Vec, count: boolean) => {
    const pts = chainPoints(start, p, L);
    if (pts.length < 2) return;
    const ids = pts.map((q) => d.addAtom(q.x, q.y).id);
    for (let i = 1; i < ids.length; i++) d.addBond(ids[i - 1], ids[i], 1);
    if (count) d.addCaption({ x: p.x + 0.5 * L, y: p.y + 1.3 * L, runs: [{ text: String(ids.length) }], justify: 'left' });
  };
  return scripted('Chain', [
    { say: 'Press where the chain starts', ms: 900 },
    { say: 'Drag: it grows a bond at a time, with the count beside the pointer', ms: 1600 },
    { say: 'Let go. Or click and type how many atoms', ms: 1200 },
  ], (d, step, t) => {
    if (step === 0) return { pointer: { ...mix(from, start, ease(span(t, 0, 0.7))), down: t > 0.8 } };
    if (step === 1) { const p = mix(start, end, ease(t)); chain(d, p, true); return { pointer: { ...p, down: true } }; }
    chain(d, end, false);
    return { pointer: { ...at(end, 0.5 * L * ease(t), 0.8 * L * ease(t)), down: false } };
  });
}

/** A cyclohexane put down, its groups drawn, then Tab through its shapes. */
function ringDemo(): ToolDemo {
  const L = L0;
  const from = { x: -2 * L, y: 2.2 * L }, centre = { x: 0, y: 0 };
  const dir = (k: number) => (-90 + 60 * k) * Math.PI / 180;
  const ring = (d: Doc) => {
    const ids = ringAt(d, centre, 6, L);
    ids.forEach((id, k) => d.addBond(id, ids[(k + 1) % 6], 1));
    return ids;
  };
  /** Where group k's bond ends, drawn flat: straight out from the ring. */
  const tip = (k: number): Vec => ({ x: 2 * L * Math.cos(dir(k)), y: 2 * L * Math.sin(dir(k)) });
  /** trans-2-methylcyclohexanol: OH on a wedge, methyl on a hashed wedge. */
  const groups = (d: Doc, ids: number[], show: number) => {
    const sub = (k: number, z: number, display: 'wedge' | 'hashWedge') => { const p = tip(k); d.addBond(ids[k], d.addAtom(p.x, p.y, z).id, 1, display); };
    if (show > 0) sub(0, 8, 'wedge');
    if (show > 1) sub(1, 6, 'hashWedge');
  };
  /** The molecule taken through these steps, selected. */
  const shaped = (d: Doc, steps: RingStep[]): Extras => {
    const ids = ring(d);
    groups(d, ids, 2);
    for (const s of steps) {
      const got = viewRingOf(d, ids);
      if ('ring' in got) stepRing(d, got.ring, s);
    }
    return { selected: boxOfAtoms(d, d.atoms.keys(), L * 0.35) };
  };
  return scripted('Cyclohexane and its shapes', [
    { say: 'Click to put a cyclohexane down', ms: 1000 },
    { say: 'Draw its groups: wedges say which face each is on', ms: 1300 },
    { say: 'Select it and press Tab: the chair, groups axial or equatorial', ms: 1400 },
    { say: 'Tab again: the flipped chair. Then a boat, then flat again', ms: 1600 },
    { say: 'On a chair, Tab walks the ring round and Shift+Tab flips it', ms: 1600 },
  ], (d, step, t) => {
    if (step === 0) {
      if (t > 0.75) ring(d);
      return { pointer: { ...mix(from, centre, ease(span(t, 0, 0.65))), down: t > 0.7 && t < 0.85 } };
    }
    if (step === 1) {
      const ids = ring(d);
      groups(d, ids, t < 0.45 ? 0 : t < 0.8 ? 1 : 2);
      const top = d.atoms.get(ids[0])!, next = d.atoms.get(ids[1])!;
      const p = t < 0.45 ? mix(centre, mix(top, tip(0), ease(span(t, 0.15, 0.4))), ease(span(t, 0, 0.15)))
        : mix(next, tip(1), ease(span(t, 0.5, 0.78)));
      return { pointer: { ...p, down: (t > 0.15 && t < 0.42) || (t > 0.5 && t < 0.79) } };
    }
    const tab = (a: number, b: number) => t > a && t < b;
    if (step === 2) return { ...shaped(d, t < 0.35 ? [] : ['chair']), key: tab(0.2, 0.5) ? 'Tab' : null };
    if (step === 3) return { ...shaped(d, t < 0.25 ? ['chair'] : t < 0.5 ? ['chair', 'next'] : t < 0.75 ? ['chair', 'next', 'next'] : ['chair', 'next', 'next', 'next']), key: tab(0.12, 0.3) || tab(0.37, 0.55) || tab(0.62, 0.8) ? 'Tab' : null };
    return { ...shaped(d, t < 0.3 ? ['chair'] : t < 0.65 ? ['chair', 'cw'] : ['chair', 'cw', 'flip']), key: tab(0.15, 0.35) ? 'Tab' : tab(0.5, 0.7) ? 'Shift+Tab' : null };
  });
}

/** Two lone pairs on methanol's oxygen: one in the open, one aimed. */
function lonePairDemo(): ToolDemo {
  const L = L0;
  const o = { x: 0.866 * L, y: -0.5 * L }, from = { x: -0.5 * L, y: -2 * L };
  const pair = (d: Doc, ang: number) => {
    const r = 0.5 * L;
    const u = { x: Math.cos(ang), y: Math.sin(ang) };
    const c = at(o, u.x * r, u.y * r);
    const n = { x: -u.y, y: u.x };
    d.addShape({ kind: 'symbol', symbol: 'LonePair', x1: c.x - n.x * 1.12, y1: c.y - n.y * 1.12, x2: c.x + n.x * 1.12, y2: c.y + n.y * 1.12 });
  };
  const up = -Math.PI / 2;
  return scripted('Lone pair', [
    { say: 'Click an atom: the pair goes in its most open space', ms: 1100 },
    { say: 'Or press on the atom and drag round it to aim the pair', ms: 1600 },
  ], (d, step, t) => {
    const oi = d.addAtom(o.x, o.y, 8).id;
    d.addBond(d.addAtom(0, 0).id, oi, 1);
    d.addBond(oi, d.addAtom(1.732 * L, 0, 1).id, 1);
    if (step === 0) {
      if (t > 0.75) pair(d, up);
      return { pointer: { ...mix(from, o, ease(span(t, 0, 0.6))), down: t > 0.65 && t < 0.8 } };
    }
    pair(d, up);
    const a0 = Math.PI * 0.95, a1 = Math.PI * 1.22;
    const ang = a0 + (a1 - a0) * ease(span(t, 0.2, 0.85));
    if (t > 0.2) pair(d, ang);
    const p = t < 0.2 ? o : at(o, Math.cos(ang) * 1.3 * L, Math.sin(ang) * 1.3 * L);
    return { pointer: { ...p, down: t > 0.1 && t < 0.92 } };
  });
}

/** 2-Butanone cut between the carbonyl and the ethyl: the two pieces' formulas and exact masses. */
function fragmentDemo(): ToolDemo {
  const L = L0;
  const p = { x: 1.1 * L, y: -1.25 * L }, q = { x: 1.55 * L, y: 0.65 * L };
  return scripted('Mass fragmentation', [
    { say: 'Drag a line across the bonds that break (or click one bond)', ms: 1400 },
    { say: 'Each piece is labeled with its formula and exact mass', ms: 1600 },
  ], (d, step, t) => {
    const pts = [{ x: 0, y: 0 }, { x: 0.866 * L, y: -0.5 * L }, { x: 1.732 * L, y: 0 }, { x: 2.598 * L, y: -0.5 * L }];
    const ids = pts.map((v) => d.addAtom(v.x, v.y).id);
    for (let i = 1; i < ids.length; i++) d.addBond(ids[i - 1], ids[i], 1);
    d.addBond(ids[1], d.addAtom(0.866 * L, -1.5 * L, 8).id, 2);
    if (step === 0) {
      const e = mix(p, q, ease(span(t, 0.2, 0.9)));
      if (t > 0.2) d.addShape({ kind: 'line', x1: p.x, y1: p.y, x2: e.x, y2: e.y, dashed: true });
      return { pointer: { ...(t < 0.2 ? mix(at(p, -1.5 * L, -0.5 * L), p, ease(span(t, 0, 0.18))) : e), down: t > 0.18 && t < 0.95 } };
    }
    d.addShape({ kind: 'line', x1: p.x, y1: p.y, x2: q.x, y2: q.y, dashed: true });
    if (t > 0.15) {
      // (the neutral pieces' exact masses, as the chemistry engine gives them)
      d.addCaption({ x: q.x - 3.4 * L, y: q.y + 0.6 * L, runs: fragmentRuns('C2H3O', 43.0184), justify: 'left' });
      d.addCaption({ x: q.x + 0.6 * L, y: q.y + 0.6 * L, runs: fragmentRuns('C2H5', 29.0391), justify: 'left' });
    }
    return { pointer: { ...at(q, 1.2 * L * ease(t), -0.9 * L * ease(t)), down: false } };
  });
}

const MAKERS: Record<string, () => ToolDemo> = {
  'arrow-curved': curvedDemo,
  'arrow-fishhook': fishhookDemo,
  'bond-hapto': haptoDemo,
  chain: chainDemo,
  'ring-6': ringDemo,
  'sym-lonepair': lonePairDemo,
  fragment: fragmentDemo,
};
const made = new Map<string, ToolDemo>();

/** The tools that have a demo. */
export const DEMO_TOOLS = Object.keys(MAKERS);

/** The demo for a tool (by its toolbar name), or null when it has none. */
export function demoFor(tool: string): ToolDemo | null {
  const make = MAKERS[tool];
  if (!make) return null;
  let d = made.get(tool);
  if (!d) made.set(tool, (d = make()));
  return d;
}

// ------------------------------------------------------------------ playing a demo

/** The part of the drawing a demo's frames use, so the picture holds still while it plays. */
export function demoView(demo: ToolDemo): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const take = (r: Rect) => { x1 = Math.min(x1, r.x1); y1 = Math.min(y1, r.y1); x2 = Math.max(x2, r.x2); y2 = Math.max(y2, r.y2); };
  demo.steps.forEach((_, i) => {
    for (const t of [0, 0.5, 1]) {
      const f = demo.frame(i, t);
      const pic = recordPicture(f.doc, 2);
      if (pic) take(pic.box);
      if (f.selected) take(f.selected);
    }
  });
  if (!isFinite(x1)) return { x1: -20, y1: -20, x2: 20, y2: 20 };
  return { x1: x1 - 4, y1: y1 - 4, x2: x2 + 4, y2: y2 + 4 };
}

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;

/** Paint one frame into a canvas `w` × `h` CSS pixels, with `view` fitted in it. */
export function paintFrame(canvas: HTMLCanvasElement, f: DemoFrame, view: Rect, w: number, h: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const k = canvas.width / w;
  const vw = view.x2 - view.x1, vh = view.y2 - view.y1;
  const fit = Math.min(w / vw, h / vh, 3);
  const ox = (w - vw * fit) / 2 - view.x1 * fit, oy = (h - vh * fit) / 2 - view.y1 * fit;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  if (f.selected) {
    const s = f.selected;
    ctx.fillStyle = 'rgba(27, 111, 168, 0.08)';
    ctx.strokeStyle = 'rgba(27, 111, 168, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.fillRect(ox + s.x1 * fit, oy + s.y1 * fit, (s.x2 - s.x1) * fit, (s.y2 - s.y1) * fit);
    ctx.strokeRect(ox + s.x1 * fit + 0.5, oy + s.y1 * fit + 0.5, (s.x2 - s.x1) * fit, (s.y2 - s.y1) * fit);
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.setTransform(k * fit, 0, 0, k * fit, k * ox, k * oy);
  const r = new Renderer(noCanvas, noCanvas);
  r.showWarnings = false;
  r.drawDocument(ctx, f.doc);
  ctx.restore();
  if (f.pointer) pointerAt(ctx, ox + f.pointer.x * fit, oy + f.pointer.y * fit, !!f.pointer.down);
  if (f.key) keyCap(ctx, f.key, w, h);
}

/** The pointer: an arrow, with a ring round its tip while the button is down. */
function pointerAt(ctx: CanvasRenderingContext2D, x: number, y: number, down: boolean): void {
  if (down) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(27, 111, 168, 0.18)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 14);
  ctx.lineTo(x + 3.6, y + 10.6);
  ctx.lineTo(x + 6.4, y + 16.2);
  ctx.lineTo(x + 8.6, y + 15.2);
  ctx.lineTo(x + 5.9, y + 9.8);
  ctx.lineTo(x + 10.4, y + 9.8);
  ctx.closePath();
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
}

/** The key being pressed, as a key cap in the lower right corner. */
function keyCap(ctx: CanvasRenderingContext2D, key: string, w: number, h: number): void {
  ctx.font = '600 11px system-ui, sans-serif';
  const tw = ctx.measureText(key).width;
  const bw = tw + 14, bh = 20, x = w - bw - 6, y = h - bh - 6;
  ctx.fillStyle = '#f3f5f7';
  ctx.strokeStyle = '#9aa7b3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect?.(x + 0.5, y + 0.5, bw, bh, 3);
  if (!ctx.roundRect) ctx.rect(x + 0.5, y + 0.5, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.textBaseline = 'middle';
  ctx.fillText(key, x + 7.5, y + bh / 2 + 1);
}

/** A canvas `w` × `h` CSS pixels, sharp on the screen in use. */
export function demoCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const k = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  return c;
}

/** About 15 frames a second is plenty for a pointer moving and an arrow growing. */
const FRAME_MS = 66;
/** The finished drawing holds this long before the demo starts again. */
const HOLD_MS = 1600;

/** Plays a demo in a canvas, round and round, telling `onStep` as each step starts. */
export class DemoPlayer {
  readonly canvas: HTMLCanvasElement;
  private view: Rect;
  private raf = 0;
  private started = 0;
  private lastKey = '';
  private step = -1;

  constructor(readonly demo: ToolDemo, readonly w: number, readonly h: number, private onStep: (i: number) => void = () => {}) {
    this.canvas = demoCanvas(w, h);
    this.view = demoView(demo);
  }

  /** The step and how far through it, `ms` after starting (the last step held at its end). */
  private when(ms: number): { i: number; t: number } {
    const total = this.demo.steps.reduce((s, x) => s + x.ms, 0);
    let left = ms % (total + HOLD_MS);
    for (let i = 0; i < this.demo.steps.length; i++) {
      const d = this.demo.steps[i].ms;
      if (left < d) return { i, t: left / d };
      left -= d;
    }
    return { i: this.demo.steps.length - 1, t: 1 };
  }

  play(): void {
    this.stop();
    this.started = performance.now();
    this.step = -1;
    const tick = (now: number) => {
      const { i, t } = this.when(now - this.started);
      const key = `${i}:${Math.floor((t * this.demo.steps[i].ms) / FRAME_MS)}`;
      if (key !== this.lastKey) {
        this.lastKey = key;
        this.show(i, t);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** One still frame: the end of step `i`, or `t` of the way through it. */
  show(i: number, t = 1): void {
    if (i !== this.step) { this.step = i; this.onStep(i); }
    paintFrame(this.canvas, this.demo.frame(i, t), this.view, this.w, this.h);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastKey = '';
  }
}

/** Still frames: the end of each step, side by side (for anyone who turns animation off). */
export function demoStills(demo: ToolDemo, w: number, h: number): HTMLCanvasElement[] {
  const view = demoView(demo);
  return demo.steps.map((_, i) => {
    const c = demoCanvas(w, h);
    paintFrame(c, { ...demo.frame(i, 1), pointer: null }, view, w, h);
    return c;
  });
}

// ------------------------------------------------------------------ showing a demo on a long hover

/** How long the pointer rests on a tool before its demo shows. */
export const DEMO_DELAY_MS = 1000;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The demo card for a tool, in the chosen look, with a player when it moves. */
export function demoCard(demo: ToolDemo, look: Exclude<DemoLook, 'off'>): { el: HTMLElement; player: DemoPlayer | null } {
  const el = document.createElement('div');
  el.className = `tool-demo tool-demo-${look}`;
  el.setAttribute('role', 'tooltip');
  const head = document.createElement('div');
  head.className = 'td-head';
  const title = document.createElement('b');
  title.textContent = demo.title;
  head.append(title);
  el.append(head);
  const still = look === 'frames' || reducedMotion();
  if (still) {
    const strip = document.createElement('div');
    strip.className = 'td-strip';
    const n = demo.steps.length;
    const w = n > 3 ? 70 : 88;
    demoStills(demo, w, 64).forEach((c, i) => {
      const f = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.textContent = `${i + 1}. ${demo.steps[i].say}`;
      f.append(c, cap);
      strip.append(f);
    });
    el.append(strip);
    return { el, player: null };
  }
  if (look === 'tip') {
    const p = new DemoPlayer(demo, 200, 84, (i) => { say.textContent = demo.steps[i].say; });
    const say = document.createElement('div');
    say.className = 'td-say';
    el.append(p.canvas, say);
    return { el, player: p };
  }
  const replay = document.createElement('button');
  replay.className = 'td-replay';
  replay.type = 'button';
  replay.textContent = '↻ Replay';
  head.append(replay);
  const list = document.createElement('ol');
  list.className = 'td-steps';
  for (const s of demo.steps) {
    const li = document.createElement('li');
    li.textContent = s.say;
    list.append(li);
  }
  const p = new DemoPlayer(demo, 250, 120, (i) => {
    list.querySelectorAll('li').forEach((li, k) => { li.classList.toggle('now', k === i); li.classList.toggle('done', k < i); });
  });
  replay.addEventListener('click', () => p.play());
  el.append(p.canvas, list);
  return { el, player: p };
}

/**
 * Demos on a long hover over the tool buttons anywhere in `root` (the bar, toolboxes and open
 * palettes): the pointer resting on a button with a demo for `DEMO_DELAY_MS` shows it beside the
 * button. Leaving the button (unless into the card), pressing it, or Escape puts it away.
 */
export function watchToolHover(root: Document | HTMLElement, look: () => DemoLook): () => void {
  let timer = 0, leaveTimer = 0;
  let shown: { el: HTMLElement; player: DemoPlayer | null; button: HTMLElement; title: string | null } | null = null;
  const hide = () => {
    clearTimeout(timer);
    clearTimeout(leaveTimer);
    if (!shown) return;
    shown.player?.stop();
    shown.el.remove();
    // the button's own tip comes back
    if (shown.title !== null && !shown.button.title) shown.button.title = shown.title;
    shown = null;
  };
  const show = (button: HTMLElement, demo: ToolDemo) => {
    const l = look();
    if (l === 'off' || !button.isConnected) return;
    hide();
    const { el, player } = demoCard(demo, l);
    // the card takes the place of the button's own tip
    const title = button.getAttribute('title');
    button.removeAttribute('title');
    document.body.append(el);
    const r = button.getBoundingClientRect();
    // beside an open palette rather than over its other tools
    const side = (button.closest('.flyout') ?? button).getBoundingClientRect();
    const gap = 6, W = window.innerWidth, H = window.innerHeight;
    const right = side.right + gap + el.offsetWidth <= W - 4;
    let left = right ? side.right + gap : side.left - gap - el.offsetWidth;
    let top = r.top;
    // a button along the top: below it
    if (left < 4) { left = Math.min(Math.max(4, r.left), W - el.offsetWidth - 4); top = r.bottom + gap; }
    top = Math.max(4, Math.min(top, H - el.offsetHeight - 4));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
    el.addEventListener('pointerleave', () => { leaveTimer = window.setTimeout(hide, 250); });
    player?.play();
    shown = { el, player, button, title };
  };
  const toolButton = (e: Event) => (e.target as HTMLElement | null)?.closest?.<HTMLElement>('button[data-tool]') ?? null;
  const over = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const b = toolButton(e);
    if (!b) return;
    if (shown?.button === b) { clearTimeout(leaveTimer); return; }
    const demo = demoFor(b.dataset.tool ?? '');
    clearTimeout(timer);
    if (!demo || look() === 'off') return;
    timer = window.setTimeout(() => show(b, demo), DEMO_DELAY_MS);
  };
  const out = (e: PointerEvent) => {
    const b = toolButton(e);
    if (!b || (e.relatedTarget instanceof Node && b.contains(e.relatedTarget))) return;
    clearTimeout(timer);
    if (shown?.button === b) leaveTimer = window.setTimeout(hide, 250);
  };
  const down = (e: PointerEvent) => { if (!shown?.el.contains(e.target as Node)) hide(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && shown) hide(); };
  root.addEventListener('pointerover', over as EventListener);
  root.addEventListener('pointerout', out as EventListener);
  root.addEventListener('pointerdown', down as EventListener, true);
  root.addEventListener('keydown', key as EventListener, true);
  return () => {
    hide();
    root.removeEventListener('pointerover', over as EventListener);
    root.removeEventListener('pointerout', out as EventListener);
    root.removeEventListener('pointerdown', down as EventListener, true);
    root.removeEventListener('keydown', key as EventListener, true);
  };
}
