// The Whole Scheme style of Animate Reaction: every structure, arrow and condition stays on screen
// where it is drawn, and each step in turn shows the bonds it breaks (red, fading) and the bonds
// it forms (green), then settles back to the scheme as drawn.
//
// Electrons are counted as curved arrows count them (IUPAC, "electron pushing" and "curly arrows",
// Pure Appl. Chem. 2022, 94, 353): an arrow moves one pair, from a lone pair, a σ bond or a π bond.
// A double bond that becomes a single bond has lost its π pair only: its σ bond is still there, so
// only its second line is marked as breaking. In the same way a single bond that becomes double has
// gained one π bond, and only the new line is marked as forming. A whole bond is marked only when
// the bond itself (its σ bond) goes or comes.

import { Doc } from '../model';
import type { Rect } from '../geom';
import type { Renderer } from '../render/renderer';
import { gifRate, timeline, type Plan, type Step, type Timing } from './clip';

/** A bond a step changes: `lines` 0 for the whole bond (its σ bond goes or comes), else how many π bonds. */
export interface BondChange { id: number; lines: number }

/** The bonds of the drawing that one step breaks (in its starting materials) and forms (in its products). */
export interface BondChanges { breaking: BondChange[]; forming: BondChange[] }

/** Whole bond orders: an aromatic (1.5) bond is no count of pairs. */
const pairs = (order: number) => (Number.isInteger(order) ? order : null);

export function bondChanges(s: Step): BondChanges {
  const breaking: BondChange[] = [], forming: BondChange[] = [];
  if (s.kind === 'turn') return { breaking, forming };
  const carried = new Map<string, string>(s.map.bmap);
  for (const [k, sh] of s.map.shifts) carried.set(k, sh.tgt);
  const back = new Map([...carried].map(([a, b]) => [b, a]));
  // ring bonds that only change Kekulé form are the same aromatic ring drawn the other way
  const kek = s.opt.kekule?.[0] ?? new Set<string>();
  for (const [k, b] of s.A.bonds) {
    const to = carried.get(k);
    if (to === undefined) { breaking.push({ id: Number(k), lines: 0 }); continue; }
    if (kek.has(k)) continue;
    const was = pairs(b.order), now = pairs(s.B.bonds.get(to)?.order ?? 0);
    if (was !== null && now !== null && now < was) breaking.push({ id: Number(k), lines: was - now });
  }
  for (const [k, b] of s.B.bonds) {
    const from = back.get(k);
    if (from === undefined) { forming.push({ id: Number(k), lines: 0 }); continue; }
    if (kek.has(from)) continue;
    const was = pairs(s.A.bonds.get(from)?.order ?? 0), now = pairs(b.order);
    if (was !== null && now !== null && now > was) forming.push({ id: Number(k), lines: now - was });
  }
  const real = (c: BondChange) => Number.isFinite(c.id);
  return { breaking: breaking.filter(real), forming: forming.filter(real) };
}

type RGB = [number, number, number];
/** The colours bonds breaking and forming are shown in, unless chosen otherwise. */
export const DEFAULT_CHANGE_COLORS = { breaking: '#d62828', forming: '#1e9e4a' };
export interface ChangeColors { breaking: string; forming: string }
const BLACK: RGB = [0, 0, 0];

export function hexRgb(hex: string, fallback: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()) ?? /^#?([0-9a-f]{6})$/i.exec(fallback)!;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: RGB, b: RGB, u: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * u)) as RGB;
const css = (c: RGB, alpha = 1) => (alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`);
const ramp = (t: number, lo: number, hi: number) => (t <= lo ? 0 : t >= hi ? 1 : (t - lo) / (hi - lo));

/**
 * A changing bond's colour part way (t from 0 to 1) through its step. Breaking: black to the
 * breaking colour, fading to a pale trace, then back to black as drawn. Forming: black to the
 * forming colour, held, then back to black. Undefined while it is still drawn as it is.
 */
export function changeColor(kind: 'break' | 'form', t: number, colors: ChangeColors = DEFAULT_CHANGE_COLORS): string | undefined {
  const settle = ramp(t, 0.85, 1);
  if (kind === 'break') {
    const c = hexRgb(colors.breaking, DEFAULT_CHANGE_COLORS.breaking);
    const on = ramp(t, 0, 0.3), fade = ramp(t, 0.35, 0.65);
    if (settle > 0) return css(mix(c, BLACK, settle), 0.25 + 0.75 * settle);
    if (on < 1) return css(mix(BLACK, c, on));
    return css(c, 1 - 0.75 * fade);
  }
  const c = hexRgb(colors.forming, DEFAULT_CHANGE_COLORS.forming);
  const on = ramp(t, 0.35, 0.65);
  if (settle > 0) return css(mix(c, BLACK, settle));
  return on > 0 ? css(mix(BLACK, c, on)) : undefined;
}

/** The part of the drawing the scheme takes: its structures, and the arrows, text and lines among them. */
export function schemeCopy(doc: Doc, plan: Plan): Doc {
  const atoms = new Set(plan.groups.flat());
  const out = new Doc();
  out.style = { ...doc.style };
  out.background = doc.background;
  if (!atoms.size) return out;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const grow = (x: number, y: number) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  for (const id of atoms) { const a = doc.atoms.get(id); if (a) grow(a.x, a.y); }
  for (const id of plan.arrows) { const r = id !== null ? doc.arrows.get(id) : undefined; if (r) { grow(r.tail.x, r.tail.y); grow(r.head.x, r.head.y); } }
  const m = 1.5 * doc.style.bondLength;
  const box: Rect = { x1: x1 - m, y1: y1 - m, x2: x2 + m, y2: y2 + m };
  const inside = (x: number, y: number) => x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
  out.bulk(() => {
    for (const id of atoms) {
      const a = doc.atoms.get(id);
      if (!a) continue;
      const copy = structuredClone(a);
      if (copy.multi) copy.multi = copy.multi.filter((x) => atoms.has(x));
      out.addAtom(a.x, a.y, a.z, copy);
    }
    for (const b of doc.bonds.values()) if (atoms.has(b.a1) && atoms.has(b.a2)) out.addBond(b.a1, b.a2, b.order, b.display, structuredClone(b));
    for (const r of doc.arrows.values()) if (plan.arrows.includes(r.id) || (inside(r.tail.x, r.tail.y) && inside(r.head.x, r.head.y))) out.addArrow(structuredClone(r));
    for (const c of doc.captions.values()) if (!c.ph && !c.hidden && inside(c.x, c.y)) out.addCaption(structuredClone(c));
    for (const s of doc.shapes.values()) {
      if (s.hidden) continue;
      const fill = s.kind === 'ring' && !!s.ring?.length && s.ring.every((a) => atoms.has(a));
      const line = s.kind === 'line' && inside(s.x1, s.y1) && inside(s.x2, s.y2);
      if (fill || line) out.addShape(structuredClone(s));
    }
  });
  return out;
}

/**
 * The whole scheme as a clip, with the same frames, size and drawing calls as a morph clip, so the
 * window's preview and its GIF, MP4 and PNG saving work on either.
 */
export class SchemeClip {
  readonly frames: [number, number][];
  readonly box: Rect;
  readonly rate: number;
  readonly changes: BondChanges[];
  private readonly drawing: Doc;
  private readonly plain = new Map<number, string | undefined>();

  constructor(doc: Doc, plan: Plan, readonly steps: Step[], readonly timing: Timing, private r: Renderer, gif = false, readonly colors: ChangeColors = DEFAULT_CHANGE_COLORS, pad = 6) {
    this.rate = gif ? gifRate(timing.fps) : timing.fps;
    this.frames = timeline(steps.length, timing, this.rate);
    this.drawing = schemeCopy(doc, plan);
    this.changes = steps.map(bondChanges);
    for (const b of this.drawing.bonds.values()) this.plain.set(b.id, b.color);
    const b = this.drawing.bounds();
    this.box = b ? { x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad } : { x1: 0, y1: 0, x2: 1, y2: 1 };
  }

  get length(): number { return this.frames.length; }
  get seconds(): number { return this.frames.length / this.rate; }

  /**
   * The colours at (step, t): a whole bond's colour (its σ bond going or coming), and the colour of
   * the π lines of bonds that only change order; everything else as drawn.
   */
  colorsAt(step: number, t: number): { bonds: Map<number, string | undefined>; pi: Map<number, { n: number; color: string }> } {
    const bonds = new Map(this.plain);
    const pi = new Map<number, { n: number; color: string }>();
    const ch = this.changes[step];
    if (!ch) return { bonds, pi };
    const put = (c: BondChange, color: string | undefined) => {
      if (!bonds.has(c.id) || color === undefined) return;
      if (c.lines === 0) bonds.set(c.id, color);
      else pi.set(c.id, { n: c.lines, color });
    };
    for (const c of ch.breaking) put(c, changeColor('break', t, this.colors));
    for (const c of ch.forming) put(c, changeColor('form', t, this.colors));
    return { bonds, pi };
  }

  paintAt(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, step: number, t: number): void {
    const { bonds, pi } = this.colorsAt(step, t);
    for (const b of this.drawing.bonds.values()) {
      const c = bonds.get(b.id);
      if (c === undefined) delete b.color; else b.color = c;
    }
    this.r.piColors = pi.size ? pi : null;
    try {
      this.r.drawDocument(ctx as CanvasRenderingContext2D, this.drawing);
    } finally {
      this.r.piColors = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, i: number, scale: number, paper = '#ffffff'): void {
    const [step, t] = this.frames[Math.max(0, Math.min(this.frames.length - 1, i))] ?? [0, 0];
    const w = Math.ceil((this.box.x2 - this.box.x1) * scale), h = Math.ceil((this.box.y2 - this.box.y1) * scale);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(scale, 0, 0, scale, -this.box.x1 * scale, -this.box.y1 * scale);
    this.paintAt(ctx, step, t);
    ctx.restore();
  }

  size(scale: number): { w: number; h: number } {
    return { w: Math.ceil((this.box.x2 - this.box.x1) * scale), h: Math.ceil((this.box.y2 - this.box.y1) * scale) };
  }
}
