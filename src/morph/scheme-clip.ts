// The Whole Scheme style of Animate Reaction: every structure, arrow and condition stays on screen
// where it is drawn, and each step in turn shows the bonds it breaks (red, fading) and the bonds
// it forms (green), then settles back to the scheme as drawn. A bond that loses a line (C=C to
// C–C) counts as breaking in the starting material; one that gains a line, as forming in the product.

import { Doc } from '../model';
import type { Rect } from '../geom';
import type { Renderer } from '../render/renderer';
import { gifRate, timeline, type Plan, type Step, type Timing } from './clip';

/** The bonds of the drawing that one step breaks (in its starting materials) and forms (in its products). */
export interface BondChanges { breaking: number[]; forming: number[] }

export function bondChanges(s: Step): BondChanges {
  const breaking: number[] = [], forming: number[] = [];
  if (s.kind === 'turn') return { breaking, forming };
  const carried = new Map<string, string>(s.map.bmap);
  for (const [k, sh] of s.map.shifts) carried.set(k, sh.tgt);
  const back = new Map([...carried].map(([a, b]) => [b, a]));
  for (const [k, b] of s.A.bonds) {
    const to = carried.get(k);
    if (to === undefined || (s.B.bonds.get(to)?.order ?? 0) < b.order) breaking.push(Number(k));
  }
  for (const [k, b] of s.B.bonds) {
    const from = back.get(k);
    if (from === undefined || (s.A.bonds.get(from)?.order ?? 0) < b.order) forming.push(Number(k));
  }
  return { breaking: breaking.filter(Number.isFinite), forming: forming.filter(Number.isFinite) };
}

type RGB = [number, number, number];
export const BREAK_RGB: RGB = [214, 40, 40];
export const FORM_RGB: RGB = [30, 158, 74];
const BLACK: RGB = [0, 0, 0];

const mix = (a: RGB, b: RGB, u: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * u)) as RGB;
const css = (c: RGB, alpha = 1) => (alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`);
const ramp = (t: number, lo: number, hi: number) => (t <= lo ? 0 : t >= hi ? 1 : (t - lo) / (hi - lo));

/**
 * A bond's colour part way (t from 0 to 1) through its step. Breaking: black to red, red fading
 * to a pale trace, then back to black as drawn. Forming: black to green, held, then back to black.
 */
export function changeColor(kind: 'break' | 'form', t: number): string | undefined {
  const settle = ramp(t, 0.85, 1);
  if (kind === 'break') {
    const red = ramp(t, 0, 0.3), fade = ramp(t, 0.35, 0.65);
    if (settle > 0) return css(mix(BREAK_RGB, BLACK, settle), 0.25 + 0.75 * settle);
    if (red < 1) return css(mix(BLACK, BREAK_RGB, red));
    return css(BREAK_RGB, 1 - 0.75 * fade);
  }
  const green = ramp(t, 0.35, 0.65);
  if (settle > 0) return css(mix(FORM_RGB, BLACK, settle));
  return green > 0 ? css(mix(BLACK, FORM_RGB, green)) : undefined;
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

  constructor(doc: Doc, plan: Plan, readonly steps: Step[], readonly timing: Timing, private r: Renderer, gif = false, pad = 6) {
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

  /** The bond colours at (step, t): the step's changes coloured, everything else as drawn. */
  colorsAt(step: number, t: number): Map<number, string | undefined> {
    const out = new Map(this.plain);
    const ch = this.changes[step];
    if (!ch) return out;
    for (const id of ch.breaking) if (out.has(id)) out.set(id, changeColor('break', t) ?? this.plain.get(id));
    for (const id of ch.forming) if (out.has(id)) out.set(id, changeColor('form', t) ?? this.plain.get(id));
    return out;
  }

  paintAt(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, step: number, t: number): void {
    const colors = this.colorsAt(step, t);
    for (const b of this.drawing.bonds.values()) {
      const c = colors.get(b.id);
      if (c === undefined) delete b.color; else b.color = c;
    }
    this.r.drawDocument(ctx as CanvasRenderingContext2D, this.drawing);
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
