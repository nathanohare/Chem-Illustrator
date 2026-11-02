// Reaction energy diagrams (Insert ▸ Energy Diagram): a level for each species at its energy,
// joined by dashed lines or a smooth curve over the transition states, with the energies, the
// names, an axis and the largest barrier marked. One or more pathways share the columns, so
// two routes can be drawn on one diagram. Everything is drawn as ordinary lines, curves and
// text inside an invisible frame that keeps the numbers; editing the numbers draws it again.

import type { Arrow, Caption, Doc, Entity, Frame, Shape } from '../model';
import type { Rect, Vec } from '../geom';
import { sweepThrough } from '../objects';
import { chemRuns } from '../text/chemtext';
import type { Measure } from '../editor/arrange';
import { frameBox, frameMembers } from '../editor/frames';
import { shapeBox } from '../objects';
import { isInkId } from './geo';
import { bestRotation, crystalPlacer, defaultView, drawCrystal, type CrystalSpec } from './xray';
import { COVALENT, mvec, type V3 } from '../chem/crystal';
import { hydrogensOn, qmBonds, type QmBond } from '../chem/qm-bonds';
import type { QmAtom } from '../chem/qm-output';

/** A species at one column: its name and energy (null: this pathway has nothing in that column). */
export interface EnergyPoint {
  label: string;
  g: number | null;
  /** Read from a Gaussian or ORCA file: its energy in hartree (so the unit can change) and its last geometry (Å). */
  eh?: number;
  geom?: QmAtom[];
  /** Each energy the file gave, in hartree (free energy G, enthalpy H, electronic energy E), so the axis can change between them. */
  ehs?: { G?: number; H?: number; E?: number };
  /** The 2-D layout of the geometry's drawn atoms (null: a hydrogen left out), y down, any scale. */
  flat?: ([number, number] | null)[];
}

/** A bracket between two species on one pathway, marking the change from one to the other (ΔG‡ when it climbs to a transition state). */
export interface EnergyBracket { path: number; from: number; to: number }

/** How a pathway's species are joined. */
export type EnergyDash = 'solid' | 'dashed' | 'dotted';

export interface EnergyPath {
  name: string;
  color: string;
  points: EnergyPoint[];
  /** Its joining lines (dashed between levels and solid along a curve when not given). */
  dash?: EnergyDash;
}

export interface EnergyData {
  paths: EnergyPath[];
  /** What the axis measures (ΔG, ΔH, E) and its unit. */
  quantity: string;
  unit: string;
  /** Flat levels joined by dashed lines, or a smooth curve through them (humps at transition states). */
  style: 'levels' | 'curve';
  /** Show each energy above its level. */
  values: boolean;
  /** Decimal places for the energies shown. */
  digits: number;
  /** A vertical axis with its title, and "Reaction coordinate" along the bottom. */
  axis: boolean;
  /** Mark the largest barrier on each pathway (from the lowest point before it to the highest after). */
  barrier: boolean;
  /** Mark the overall change on each pathway (ΔG), first species to last. */
  overall?: boolean;
  /** The level of theory, written at the top left (B3LYP-D3(BJ)/def2-TZVP, SMD(THF)). */
  theory?: string;
  /** Draw each species' geometry (read from its file) beside its level: as balls and sticks (true or '3d') or as a 2-D structure. */
  structures?: boolean | '2d' | '3d';
  /** On transition states' structures, the length (Å) of each bond being made or broken. */
  distances?: boolean;
  /** Brackets between any two species, chosen by hand. */
  brackets?: EnergyBracket[];
  /** The plot's size in points. */
  w: number;
  h: number;
  /** How far the plot sits inside its frame on each side, as last drawn (so it is drawn again in the same place). */
  margins?: { l: number; t: number; r: number; b: number };
}

/** The colours pathways take in turn. */
export const PATH_COLOURS = ['#000000', '#c00000', '#2f5597', '#548235'];

export interface EnergyPreset { id: string; name: string; blurb: string; data: Omit<EnergyData, 'w' | 'h' | 'values' | 'digits' | 'axis' | 'barrier' | 'style'> }

const pts = (list: [string, number | null][]): EnergyPoint[] => list.map(([label, g]) => ({ label, g }));

/** Starting points, with made-up numbers to be typed over. */
export const ENERGY_PRESETS: EnergyPreset[] = [
  {
    id: 'one-step', name: 'One step (SN2, E2, Diels–Alder)', blurb: 'Starting materials, one transition state, products.',
    data: { quantity: 'ΔG', unit: 'kcal/mol', paths: [{ name: '', color: '#000000', points: pts([['SM', 0], ['TS‡', 22], ['P', -8]]) }] },
  },
  {
    id: 'two-step', name: 'Two steps through an intermediate (SN1, E1)', blurb: 'An intermediate between two transition states; the first is rate-limiting.',
    data: { quantity: 'ΔG', unit: 'kcal/mol', paths: [{ name: '', color: '#000000', points: pts([['SM', 0], ['TS1‡', 24], ['Int', 12], ['TS2‡', 16], ['P', -6]]) }] },
  },
  {
    id: 'catalysed', name: 'Catalyzed vs uncatalysed', blurb: 'The same overall change by two routes: one high barrier, or two lower ones.',
    data: {
      quantity: 'ΔG', unit: 'kcal/mol', paths: [
        { name: 'uncatalysed', color: '#c00000', points: pts([['SM', 0], ['', null], ['TS‡', 32], ['', null], ['P', -10]]) },
        { name: 'catalysed', color: '#000000', points: pts([['SM', 0], ['TS1‡', 17], ['Int', 4], ['TS2‡', 14], ['P', -10]]) },
      ],
    },
  },
  {
    id: 'cycle', name: 'Catalytic cycle profile', blurb: 'A cycle as a profile from resting state to product and back: oxidative addition, transmetalation, reductive elimination.',
    data: { quantity: 'ΔG', unit: 'kcal/mol', paths: [{ name: '', color: '#000000', points: pts([['Pd(0)', 0], ['TS-OA‡', 14], ['OA', -6], ['TS-TM‡', 18], ['TM', -2], ['TS-RE‡', 12], ['Pd(0) + P', -20]]) }] },
  },
  {
    id: 'blank', name: 'Blank', blurb: 'Three species to fill in.',
    data: { quantity: 'ΔG', unit: 'kcal/mol', paths: [{ name: '', color: '#000000', points: pts([['A', 0], ['TS‡', 10], ['B', -5]]) }] },
  },
];

export const ENERGY_DEFAULTS = { style: 'levels' as const, values: true, digits: 1, axis: true, barrier: false };

/** The members of a drawn diagram (to put in its frame). */
export interface EnergyParts { captions: number[]; arrows: number[]; shapes: number[] }

/**
 * Draw the diagram with its plot's top left corner at `at`. Returns what was made (the caller
 * puts it in a frame). Call inside an edit.
 */
export function drawEnergy(doc: Doc, m: Measure, d: EnergyData, at: Vec): EnergyParts {
  const out: EnergyParts = { captions: [], arrows: [], shapes: [] };
  const lw = doc.style.lineWidth, L = doc.style.bondLength;
  const n = Math.max(1, ...d.paths.map((p) => p.points.length));
  const all = d.paths.flatMap((p) => p.points.map((q) => q.g).filter((g): g is number => g !== null && isFinite(g)));
  if (!all.length) return out;
  const hi = Math.max(...all), lo = Math.min(...all);
  const colW = d.w / n, bar = Math.min(colW * 0.55, 4 * L);
  const y = (g: number) => (hi === lo ? at.y + d.h / 2 : at.y + ((hi - g) / (hi - lo)) * d.h);
  const x = (k: number) => at.x + (k + 0.5) * colW;

  const caption = (text: string, target: Vec, anchor: 'above' | 'below' | 'left' | 'right' | 'centre', color?: string, extra: Partial<Caption> = {}): Caption => {
    const runs = chemRuns(text).map((r) => (color && color !== '#000000' ? { ...r, color } : r));
    const c = doc.addCaption({ x: 0, y: 0, runs, justify: 'left', ...extra });
    const b = m.captionBox(c);
    const w = b.x2 - b.x1, h = b.y2 - b.y1;
    const want = anchor === 'above' ? { x: target.x - w / 2, y: target.y - h } : anchor === 'below' ? { x: target.x - w / 2, y: target.y }
      : anchor === 'left' ? { x: target.x - w, y: target.y - h / 2 } : anchor === 'right' ? { x: target.x, y: target.y - h / 2 } : { x: target.x - w / 2, y: target.y - h / 2 };
    doc.updateCaption(c.id, { x: want.x - b.x1, y: want.y - b.y1 });
    out.captions.push(c.id);
    return doc.captions.get(c.id)!;
  };
  // points along every line and curve drawn, so a label can be kept off them
  const ink: Vec[] = [];
  const trace = (a: Vec, b: Vec) => {
    const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let i = 0; i <= k; i++) ink.push({ x: a.x + ((b.x - a.x) * i) / k, y: a.y + ((b.y - a.y) * i) / k });
  };
  const line = (x1: number, y1: number, x2: number, y2: number, more: Partial<Shape> = {}) => {
    trace({ x: x1, y: y1 }, { x: x2, y: y2 });
    out.shapes.push(doc.addShape({ kind: 'line', x1, y1, x2, y2, color: '#000000', ...more }).id);
  };
  const arrow = (tail: Vec, head: Vec, more: Partial<Arrow> = {}) =>
    out.arrows.push(doc.addArrow({
      tail, head, headStyle: 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0,
      headLength: lw * 8, headWidth: lw * 2.2, ...more,
    }).id);

  const gap = 0.25 * L;
  const fmt = (g: number) => (g < 0 ? '−' : '') + Math.abs(g).toFixed(d.digits);
  // the column's name goes under the lowest level drawn in it, so pathways share it
  const labelled = new Set<string>();
  d.paths.forEach((p, pi) => {
    const color = p.color || '#000000';
    const tint = color !== '#000000' ? { color } : {};
    const shown = p.points.map((q, k) => ({ q, k })).filter(({ q }) => q.g !== null && isFinite(q.g));
    shown.forEach(({ q, k }, i) => {
      const yy = y(q.g!);
      // a species pathways share (same column, same energy) is drawn once, by the first, in black
      if (d.paths.slice(0, pi).some((o) => o.points[k]?.g === q.g)) return;
      const both = d.paths.slice(pi + 1).some((o) => o.points[k]?.g === q.g);
      const own = both ? '#000000' : color;
      if (d.style === 'levels') line(x(k) - bar / 2, yy, x(k) + bar / 2, yy, { bold: true, ...(own !== '#000000' ? { color: own } : {}) });
      // on a curve, a peak's name goes over it (the curve falls away beneath)
      const prev = shown[i - 1]?.q.g ?? -Infinity, next = shown[i + 1]?.q.g ?? -Infinity;
      const peak = d.style === 'curve' && q.g! > prev && q.g! > next;
      // on a curve, a trough's energy goes under it too (the curve rises on either side)
      const under = d.style === 'curve' && !peak;
      let top = yy - gap - (d.style === 'levels' ? lw : 0), bottom = yy + gap + lw;
      if (d.values && under) bottom = m.captionBox(caption(fmt(q.g!), { x: x(k), y: bottom }, 'below', own)).y2;
      else if (d.values) top = m.captionBox(caption(fmt(q.g!), { x: x(k), y: top }, 'above', own)).y1 - gap / 2;
      const key = `${k}|${q.label}`;
      if (q.label && !labelled.has(key)) {
        labelled.add(key);
        const ink2 = pi && d.paths.length > 1 && !both ? color : undefined;
        if (peak) caption(q.label, { x: x(k), y: top }, 'above', ink2);
        else caption(q.label, { x: x(k), y: bottom }, 'below', ink2);
      }
    });
    // joined: dashed between the ends of the levels, or a smooth S from middle to middle (or
    // in the pathway's own line style)
    const dash = joinDash(d, p);
    for (let i = 0; i + 1 < shown.length; i++) {
      const a = shown[i], b = shown[i + 1];
      const ya = y(a.q.g!), yb = y(b.q.g!);
      if (d.style === 'levels') {
        line(x(a.k) + bar / 2, ya, x(b.k) - bar / 2, yb, { ...dashLook(dash), ...tint });
        continue;
      }
      const p0 = { x: x(a.k), y: ya }, p1 = { x: x(b.k), y: yb };
      for (let t = 0; t < 1; t += 1 / 24) trace(cosineAt(p0, p1, t), cosineAt(p0, p1, t + 1 / 24));
      // dots along a curve: short straight pieces of it, dotted
      if (dash === 'dotted') {
        for (let t = 0; t < 1 - 1e-9; t += 1 / 16) {
          const u = cosineAt(p0, p1, t), v = cosineAt(p0, p1, t + 1 / 16);
          out.shapes.push(doc.addShape({ kind: 'line', x1: u.x, y1: u.y, x2: v.x, y2: v.y, color, dashed: true, dotted: true }).id);
        }
        continue;
      }
      for (const piece of sCurve(p0, p1)) arrow(piece.tail, piece.head, { sweep: piece.sweep, ...(dash === 'dashed' ? { line: 'dashed' as const } : {}), ...tint });
    }
  });

  if (d.overall) {
    // the overall change: a double arrow past the last species, with a dashed line back to the first
    d.paths.forEach((p, pi) => {
      const shown = p.points.map((q, k) => ({ q, k })).filter(({ q }) => q.g !== null && isFinite(q.g));
      if (shown.length < 2) return;
      const a = shown[0], b = shown[shown.length - 1];
      if (Math.abs(b.q.g! - a.q.g!) < 1e-9) return;
      const color = p.color || '#000000';
      const tint = color !== '#000000' ? { color } : {};
      const xx = x(b.k) + bar / 2 + (0.6 + 1.1 * pi) * L;
      line(x(a.k) + bar / 2, y(a.q.g!), xx + 0.3 * L, y(a.q.g!), { dashed: true, color });
      if (d.style === 'curve') line(x(b.k), y(b.q.g!), xx + 0.3 * L, y(b.q.g!), { dashed: true, color });
      trace({ x: xx, y: y(a.q.g!) }, { x: xx, y: y(b.q.g!) });
      arrow({ x: xx, y: y(a.q.g!) }, { x: xx, y: y(b.q.g!) }, { headStyle: 'full', tailStyle: 'full', ...tint });
      const q0 = d.quantity.replace(/‡$/, '');
      caption(`${q0} = ${fmt(b.q.g! - a.q.g!)}`, { x: xx + gap, y: (y(a.q.g!) + y(b.q.g!)) / 2 }, 'right', color);
    });
  }


  if (d.axis) {
    const ax = at.x - 0.6 * L, top = at.y - 1.6 * L, bottom = at.y + d.h + 2.4 * L;
    arrow({ x: ax, y: bottom }, { x: ax, y: top }, { headStyle: 'full' });
    caption(`${d.quantity} (${d.unit.replace('/mol', ' mol^{−1}')})`, { x: ax - gap, y: (top + bottom) / 2 }, 'left', undefined);
    // the axis title reads up the page
    const t = doc.captions.get(out.captions[out.captions.length - 1])!;
    turnUp(doc, m, t, { x: ax - gap, y: (top + bottom) / 2 });
    caption('Reaction coordinate', { x: at.x + d.w / 2, y: bottom + gap }, 'below');
    line(ax, bottom, at.x + d.w, bottom);
  }

  // what is drawn so far, to keep a bracket's label clear of
  const taken = (): Rect[] => out.captions.map((id) => m.captionBox(doc.captions.get(id)!));
  // how badly a label at r would sit: text it covers counts most, then lines it crosses
  const clash = (r: Rect, others: Rect[]) =>
    others.reduce((n, o) => n + Math.max(0, Math.min(r.x2, o.x2) - Math.max(r.x1, o.x1)) * Math.max(0, Math.min(r.y2, o.y2) - Math.max(r.y1, o.y1)), 0)
    + ink.filter((q) => q.x > r.x1 - lw && q.x < r.x2 + lw && q.y > r.y1 - lw && q.y < r.y2 + lw).length;
  /**
   * A double arrow from species `fromK`'s energy to species `toK`'s, beside `toK` (its right,
   * else its left, wherever its label is clearer), with a dashed line across from `fromK`.
   */
  const span = (color: string, fromK: number, fromG: number, toK: number, toG: number, text: string) => {
    const low = Math.min(fromG, toG), high = Math.max(fromG, toG);
    const others = taken();
    // beside the second species on its right, else on its left, as near halfway up as is clear
    let side: 1 | -1 = toK >= fromK ? 1 : -1, f = 0.5, worst = Infinity;
    const sides: (1 | -1)[] = toK >= fromK ? [1, -1] : [-1, 1];
    search: for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
      for (const s of sides) {
        const xx = x(toK) + s * (bar / 2 + 0.4 * L);
        const c = caption(text, { x: xx + s * gap, y: y(low) + (y(high) - y(low)) * t }, s > 0 ? 'right' : 'left', color);
        const bad = clash(m.captionBox(c), others);
        doc.removeCaption(c.id);
        out.captions.pop();
        if (bad < worst) { worst = bad; side = s; f = t; }
        if (!bad) break search;
      }
    }
    const xx = x(toK) + side * (bar / 2 + 0.4 * L);
    trace({ x: xx, y: y(low) }, { x: xx, y: y(high) });
    const from = { x: xx, y: y(low) }, to = { x: xx, y: y(high) };
    arrow(from, to, { headStyle: 'full', tailStyle: 'full', ...(color !== '#000000' ? { color } : {}) });
    // the dashed line runs across from the first species' level (from its edge facing the arrow)
    const fx = x(fromK) + (xx > x(fromK) ? bar / 2 : -bar / 2);
    line(fx, y(fromG), xx + side * 0.3 * L, y(fromG), { dashed: true, color });
    caption(text, { x: xx + side * gap, y: from.y + (to.y - from.y) * f }, side > 0 ? 'right' : 'left', color);
  };
  if (d.barrier) {
    d.paths.forEach((p) => {
      const b = largestBarrier(p);
      if (!b) return;
      span(p.color || '#000000', b.from, b.low, b.top, b.high, `${d.quantity}^‡ = ${fmt(b.high - b.low)}`);
    });
  }

  for (const br of d.brackets ?? []) {
    const p = d.paths[br.path];
    const qa = p?.points[br.from], qb = p?.points[br.to];
    if (!qa || !qb || qa.g === null || qb.g === null || !isFinite(qa.g) || !isFinite(qb.g) || br.from === br.to) continue;
    span(p.color || '#000000', br.from, qa.g, br.to, qb.g, bracketText(d, qa, qb, fmt));
  }

  if (d.paths.length > 1) {
    // a key at the top right
    let ky = at.y - 1.2 * L;
    for (const p of d.paths) {
      const x2 = at.x + d.w, x1 = x2 - 1.6 * L;
      const k = caption(p.name || 'pathway', { x: x1 - gap, y: ky }, 'left', p.color);
      // the key shows a pathway's line style where the pathways differ in it, else its level
      const styled = d.paths.some((o) => joinDash(d, o) !== joinDash(d, p));
      line(x1, ky, x2, ky, { ...(styled ? dashLook(joinDash(d, p)) : { bold: d.style === 'levels' }), ...(p.color !== '#000000' ? { color: p.color } : {}) });
      const b = m.captionBox(k);
      ky += Math.max(b.y2 - b.y1, 0.8 * L);
    }
  }
  if (d.structures) {
    // each species' geometry over its level when it is a peak, under it otherwise, moved on
    // until it is clear of the text, lines and other structures
    const box = Math.min(colW * 0.92, 5 * L), h = box * 0.8;
    const taken: Rect[] = out.captions.map((id) => m.captionBox(doc.captions.get(id)!));
    const clear = (r: Rect) => !taken.some((o) => o.x1 < r.x2 && r.x1 < o.x2 && o.y1 < r.y2 && r.y1 < o.y2)
      && !ink.some((q) => q.x > r.x1 && q.x < r.x2 && q.y > r.y1 && q.y < r.y2);
    const done = new Set<number>();
    d.paths.forEach((p) => {
      const shown = p.points.map((q, k) => ({ q, k })).filter(({ q }) => q.g !== null && isFinite(q.g));
      shown.forEach(({ q, k }, i) => {
        if (!q.geom?.length || done.has(k)) return;
        done.add(k);
        const prev = shown[i - 1]?.q.g ?? -Infinity, next = shown[i + 1]?.q.g ?? -Infinity;
        const up = q.g! > prev && q.g! > next ? -1 : 1;
        const yy = y(q.g!);
        let top = up < 0 ? yy - gap - h : yy + gap;
        const at2 = (t: number): Rect => ({ x1: x(k) - box / 2, y1: t, x2: x(k) + box / 2, y2: t + h });
        for (let n = 0; n < 40 && !clear(at2(top)); n++) top += up * 0.25 * L;
        const ts = /‡/.test(q.label);
        const bonds = qmBonds(q.geom, ts);
        const parts = d.structures === '2d'
          ? drawSkeleton(doc, m, q.geom, bonds, q.flat, at2(top), L, ts && !!d.distances)
          : drawBalls(doc, m, q.geom, bonds, at2(top), ts && !!d.distances);
        taken.push(at2(top));
        out.captions.push(...parts.captions);
        out.shapes.push(...parts.shapes);
      });
    });
  }

  if (d.theory?.trim()) {
    // under everything, at the left
    const all = [...out.captions.map((id) => m.captionBox(doc.captions.get(id)!)), ...out.shapes.map((id) => shapeBox(doc.shapes.get(id)!))];
    const low = Math.max(at.y + d.h, ...all.map((r) => r.y2));
    caption(d.theory.trim(), { x: d.axis ? at.x - 0.6 * L : at.x, y: low + gap }, 'right', undefined, { runs: [{ text: d.theory.trim(), size: doc.style.captionSize * 0.85 }] });
    const c = doc.captions.get(out.captions[out.captions.length - 1])!;
    const b = m.captionBox(c);
    doc.updateCaption(c.id, { y: c.y + (low + gap - b.y1) });
  }

  return out;
}

/** Turn a caption to read up the page, its middle at `p` (it lies to the left of p). */
function turnUp(doc: Doc, m: Measure, c: Caption, p: Vec): void {
  const b = m.captionBox({ ...c, rot: undefined });
  const w = b.x2 - b.x1;
  // turned −90° about (x, y): the text runs up from there, its top towards the left
  const descent = b.y2 - c.y;
  doc.updateCaption(c.id, { x: p.x - descent, y: p.y + w / 2, rot: -90 });
}

/**
 * A smooth climb or fall from p0 to p1, flat at both ends (half a cosine wave), as short arcs:
 * each runs through three points of the wave, so the pieces meet smoothly.
 */
/** A point `t` of the way along the cosine S from p0 to p1 (flat at both ends). */
function cosineAt(p0: Vec, p1: Vec, t: number): Vec {
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + ((p1.y - p0.y) * (1 - Math.cos(Math.PI * t))) / 2 };
}

export function sCurve(p0: Vec, p1: Vec, pieces = 6): { tail: Vec; head: Vec; sweep: number }[] {
  if (Math.abs(p1.y - p0.y) < 1e-6) return [{ tail: p0, head: p1, sweep: 0 }];
  const at = (t: number) => cosineAt(p0, p1, t);
  const out: { tail: Vec; head: Vec; sweep: number }[] = [];
  for (let i = 0; i < pieces; i++) {
    const tail = at(i / pieces), head = at((i + 1) / pieces);
    out.push({ tail, head, sweep: sweepThrough(tail, head, at((i + 0.5) / pieces)) });
  }
  return out;
}

/**
 * The largest climb on a pathway: from the lowest point up to the highest point after it
 * (the energetic span read simply). Columns of the low and high points, and their energies.
 */
export function largestBarrier(p: EnergyPath): { from: number; top: number; low: number; high: number } | null {
  let best: { from: number; top: number; low: number; high: number } | null = null;
  let lowK = -1, low = Infinity;
  p.points.forEach((q, k) => {
    if (q.g === null || !isFinite(q.g)) return;
    if (lowK >= 0 && q.g - low > (best ? best.high - best.low : 0)) best = { from: lowK, top: k, low, high: q.g };
    if (q.g < low) { low = q.g; lowK = k; }
  });
  return best;
}

/** How a pathway's species are joined: its own style, else dashed between levels and solid along a curve. */
export function joinDash(d: Pick<EnergyData, 'style'>, p: Pick<EnergyPath, 'dash'>): EnergyDash {
  return p.dash ?? (d.style === 'levels' ? 'dashed' : 'solid');
}

const dashLook = (dash: EnergyDash): Partial<Shape> => (dash === 'dotted' ? { dashed: true, dotted: true } : dash === 'dashed' ? { dashed: true } : {});

/**
 * A bracket's label: ΔG‡ when it climbs to a transition state (a name with ‡), else ΔG, with
 * the change from the first species to the second.
 */
export function bracketText(d: Pick<EnergyData, 'quantity'>, a: EnergyPoint, b: EnergyPoint, fmt: (g: number) => string): string {
  const q = d.quantity.replace(/[‡]$|\^‡$/, '');
  const up = b.g! > a.g!;
  const ts = up && /‡/.test(b.label);
  return `${q}${ts ? '^‡' : ''} = ${fmt(b.g! - a.g!)}`;
}

/** Where the plot goes in a diagram's frame box, and its size (when it is drawn again, or resized by hand). */
export function plotFromBox(b: Rect, d: EnergyData, L: number): { at: Vec; w: number; h: number } {
  const g = d.margins ?? { l: d.axis ? 2.6 * L : 0.3 * L, t: 2.2 * L, r: 0.3 * L, b: d.axis ? 4.6 * L : 1.6 * L };
  return { at: { x: b.x1 + g.l, y: b.y1 + g.t }, w: Math.max(4 * L, b.x2 - b.x1 - g.l - g.r), h: Math.max(3 * L, b.y2 - b.y1 - g.t - g.b) };
}

/**
 * Draw a diagram in a frame of its own, with the plot's top left at `at`, or draw the diagram
 * in frame `id` again with new numbers (what it drew before goes; structures and pictures put
 * on it stay). Returns the frame's id. Call inside an edit.
 */
export function putEnergy(doc: Doc, m: Measure, d: EnergyData, at: Vec, id?: number): number {
  const old = id !== undefined ? doc.shapes.get(id) : undefined;
  const kept: Pick<Frame, 'atoms' | 'shapes'> = { atoms: [], shapes: [] };
  if (old?.frame) {
    const f = old.frame;
    for (const c of f.captions) doc.removeCaption(c);
    for (const r of f.arrows) doc.removeArrow(r);
    for (const s of f.shapes) {
      const sh = doc.shapes.get(s);
      // lines, and the balls and sticks of structures read from files, are drawn again
      if (sh && (sh.kind === 'line' || (sh.kind === 'oval' && sh.fill === 'shaded') || (sh.kind === 'geo' && isInkId(sh.geo)))) doc.removeShape(s); else if (sh) kept.shapes.push(s);
    }
    kept.atoms = f.atoms.filter((a) => doc.atoms.has(a));
  }
  const parts = drawEnergy(doc, m, d, at);
  const pad = 0.3 * doc.style.bondLength;
  const frame: Frame = { atoms: kept.atoms, captions: parts.captions, arrows: parts.arrows, shapes: [...parts.shapes, ...kept.shapes], padX: pad, padY: pad, fit: true };
  const b = frameBox(doc, frame, m) ?? { x1: at.x, y1: at.y, x2: at.x + d.w, y2: at.y + d.h };
  const r = (v: number) => Math.round(v * 100) / 100;
  const energy: EnergyData = { ...d, margins: { l: r(at.x - b.x1), t: r(at.y - b.y1), r: r(b.x2 - at.x - d.w), b: r(b.y2 - at.y - d.h) } };
  if (old) { doc.updateShape(old.id, { ...b, frame, energy }); return old.id; }
  return doc.addShape({ kind: 'geo', geo: 'rect', ...b, filled: false, lineWidth: 0, color: '#000000', frame, energy, name: 'Energy diagram' }).id;
}

/** The energy diagram a thing belongs to (its frame's id), if any. */
export function energyFrameOf(doc: Doc, kind: 'atom' | 'bond' | 'caption' | 'arrow' | 'shape', id: number): number | null {
  if (kind === 'shape' && doc.shapes.get(id)?.energy) return id;
  for (const s of doc.shapes.values()) {
    if (!s.energy || !s.frame) continue;
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
 * At the end of a change: a diagram whose frame was resized by hand (nothing inside it moved)
 * is drawn again to fill its new box.
 */
export function refitEnergy(doc: Doc, before: ReadonlyMap<string, Entity | null>, m: Measure): void {
  for (const s of [...doc.shapes.values()]) {
    if (!s.energy || !s.frame) continue;
    const old = before.get('s' + s.id) as Shape | null | undefined;
    if (!old) continue;
    const a = shapeBox(old), b = shapeBox(s);
    if (Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) + Math.abs(a.x2 - b.x2) + Math.abs(a.y2 - b.y2) < 1e-6) continue;
    const f = s.frame;
    const touched = f.captions.some((id) => before.has('c' + id)) || f.arrows.some((id) => before.has('r' + id)) || f.shapes.some((id) => before.has('s' + id));
    if (touched) continue;
    const p = plotFromBox(b, s.energy, doc.style.bondLength);
    putEnergy(doc, m, { ...s.energy, w: p.w, h: p.h }, p.at, s.id);
  }
}

/** A geometry read from a file as a ball-and-stick figure: bonds from the covalent radii, turned to show it spread out. */
export function geomSpec(atoms: QmAtom[], found: QmBond[] = qmBonds(atoms)): CrystalSpec {
  const xyz = atoms.map((a): V3 => [a.x, a.y, a.z]);
  const bonds = found.filter((b) => !b.partial).map((b): [number, number] => [b.i, b.j]);
  return {
    name: '', bonds,
    atoms: atoms.map((a, i) => ({ label: a.el + (i + 1), el: a.el, xyz: xyz[i], u: [0.02, 0.02, 0.02, 0, 0, 0], mol: 0 })),
    view: { ...defaultView(), rotation: bestRotation(xyz), style: 'ball', labels: false, principal: false },
  };
}

/** Parts drawn for one structure. */
interface Drawn { captions: number[]; shapes: number[] }

/** A distance (Å) written beside the middle of a bond, on the side away from `centre`. */
function distanceLabel(doc: Doc, m: Measure, a: Vec, b: Vec, centre: Vec, len: number, size: number): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  if ((mid.x - centre.x) * n.x + (mid.y - centre.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const c = doc.addCaption({ x: 0, y: 0, runs: [{ text: len.toFixed(2), size }], justify: 'left', chem: false });
  const r = m.captionBox(c);
  const w = r.x2 - r.x1, h = r.y2 - r.y1;
  // its nearest corner just off the bond's middle
  const off = 0.45 * size;
  const cx = mid.x + n.x * (off + w / 2), cy = mid.y + n.y * (off + h / 2);
  doc.updateCaption(c.id, { x: cx - w / 2 - r.x1, y: cy - h / 2 - r.y1 });
  return c.id;
}

/** A geometry as balls and sticks, the bonds being made or broken (a transition state) dashed, with their lengths when asked. */
function drawBalls(doc: Doc, m: Measure, atoms: QmAtom[], bonds: QmBond[], r: Rect, distances: boolean): Drawn {
  const spec = geomSpec(atoms, bonds);
  const w = r.x2 - r.x1, h = r.y2 - r.y1;
  const parts = drawCrystal(doc, m, spec, { x: r.x1, y: r.y1 }, w, h);
  const out: Drawn = { captions: [...parts.captions], shapes: [...parts.shapes] };
  const partial = bonds.filter((b) => b.partial);
  if (!partial.length) return out;
  const { place, scale } = crystalPlacer(spec, { x: r.x1, y: r.y1 }, w, h);
  const ball = (el: string) => (el === 'H' ? 0.17 : Math.max(0.15, 0.38 * (COVALENT[el] ?? 1) + 0.05)) * scale;
  const pts = atoms.map((_, i) => place(i)).filter((p): p is Vec => !!p);
  const centre = { x: pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1), y: pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1) };
  const lw = doc.style.lineWidth;
  for (const b of partial) {
    const p = place(b.i), q = place(b.j);
    if (!p || !q) continue;
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    const ra = ball(atoms[b.i].el), rb = ball(atoms[b.j].el);
    if (L <= ra + rb) continue;
    const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    const a = { x: p.x + u.x * ra, y: p.y + u.y * ra }, z = { x: q.x - u.x * rb, y: q.y - u.y * rb };
    out.shapes.push(doc.addShape({ kind: 'line', x1: a.x, y1: a.y, x2: z.x, y2: z.y, color: '#000000', dashed: true, lineWidth: lw * 1.2 }).id);
    if (distances) out.captions.push(distanceLabel(doc, m, a, z, centre, b.d, doc.style.captionSize * 0.8));
  }
  return out;
}

/**
 * A geometry as a 2-D structure in box `r`: heavy atoms (carbons as corners, the rest
 * labelled with their hydrogens), multiple bonds from their lengths, the bonds being made or
 * broken dashed (with their lengths when asked). Laid out by `flat` (the engine's 2-D layout)
 * when given, else the geometry seen from its best side.
 */
export function drawSkeleton(doc: Doc, m: Measure, atoms: QmAtom[], bonds: QmBond[], flat: ([number, number] | null)[] | undefined, r: Rect, L: number, distances: boolean): Drawn {
  const out: Drawn = { captions: [], shapes: [] };
  const moving = new Set(bonds.filter((b) => b.partial).flatMap((b) => [b.i, b.j]));
  const shown = (i: number) => atoms[i].el !== 'H' || moving.has(i);
  let raw: ([number, number] | null)[];
  if (flat && flat.length === atoms.length) raw = flat;
  else {
    // seen from the side that spreads it out most
    const keep = atoms.map((_, i) => i).filter(shown);
    const xyz = keep.map((i): V3 => [atoms[i].x, atoms[i].y, atoms[i].z]);
    const rot = bestRotation(xyz.length ? xyz : [[0, 0, 0]]);
    raw = atoms.map((a, i) => { if (!shown(i)) return null; const s = mvec(rot, [a.x, a.y, a.z]); return [s[0], -s[1]]; });
  }
  const idx = atoms.map((_, i) => i).filter((i) => raw[i]);
  if (!idx.length) return out;
  const drawn = bonds.filter((b) => raw[b.i] && raw[b.j]);
  // scaled so a bond is the drawing's bond length or less, to fit the box
  const lens = drawn.filter((b) => !b.partial).map((b) => Math.hypot(raw[b.i]![0] - raw[b.j]![0], raw[b.i]![1] - raw[b.j]![1])).sort((a, b) => a - b);
  const unit = lens.length ? lens[Math.floor(lens.length / 2)] || 1 : 1;
  const xs = idx.map((i) => raw[i]![0] / unit), ys = idx.map((i) => raw[i]![1] / unit);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const w = r.x2 - r.x1, h = r.y2 - r.y1;
  const bl = Math.min(0.8 * L, (w * 0.86) / Math.max(bw + 1, 1), (h * 0.86) / Math.max(bh + 1, 1));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const at = new Map<number, Vec>(idx.map((i) => [i, { x: (r.x1 + r.x2) / 2 + (raw[i]![0] / unit - cx) * bl, y: (r.y1 + r.y2) / 2 + (raw[i]![1] / unit - cy) * bl }]));
  const size = Math.max(5, Math.min(doc.style.captionSize, bl * 0.75));
  // labels: everything but a carbon with bonds drawn
  const labelled = new Set<number>();
  for (const i of idx) {
    const el = atoms[i].el;
    // a carbon is a corner unless only partial bonds reach it (a methyl coming in: CH3)
    if (el === 'C' && drawn.some((b) => !b.partial && (b.i === i || b.j === i))) continue;
    labelled.add(i);
    const nH = el === 'H' ? 0 : hydrogensOn(atoms, bonds, i);
    const hs = nH ? 'H' + (nH > 1 ? `_${nH}` : '') : '';
    // the hydrogens go before the symbol where its one bond leaves to the right (HO–), and
    // in H₂O, H₂S and HCl on their own
    const p = at.get(i)!;
    const nbr = drawn.filter((b) => b.i === i || b.j === i).map((b) => at.get(b.i === i ? b.j : b.i)!);
    const before = !!hs && ((nbr.length === 1 && nbr[0].x > p.x + 0.2 * bl) || (nbr.length === 0 && /^(O|S|Se|F|Cl|Br|I)$/.test(el)));
    const text = before ? hs + el : el + hs;
    const c = doc.addCaption({ x: 0, y: 0, runs: chemRuns(text).map((run) => ({ ...run, size })), justify: 'left' });
    const b = m.captionBox(c);
    // centred on the atom's symbol
    const lead = before ? m.captionBox({ ...c, runs: chemRuns(hs).map((run) => ({ ...run, size })) }) : null;
    const sym = m.captionBox({ ...c, runs: [{ text: el, size }] });
    const shift = lead ? lead.x2 - lead.x1 : 0;
    doc.updateCaption(c.id, { x: c.x + p.x - (sym.x1 + sym.x2) / 2 - shift, y: c.y + p.y - (b.y1 + b.y2) / 2 });
    out.captions.push(c.id);
  }
  const line = (a: Vec, b: Vec, more: Partial<Shape> = {}) => out.shapes.push(doc.addShape({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: '#000000', ...more }).id);
  const centre = { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };
  for (const b of drawn) {
    let p = at.get(b.i)!, q = at.get(b.j)!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1e-6) continue;
    const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }, n = { x: -u.y, y: u.x };
    const trim = 0.42 * size;
    if (labelled.has(b.i)) p = { x: p.x + u.x * trim, y: p.y + u.y * trim };
    if (labelled.has(b.j)) q = { x: q.x - u.x * trim, y: q.y - u.y * trim };
    if (b.partial) {
      line(p, q, { dashed: true });
      if (distances) out.captions.push(distanceLabel(doc, m, p, q, centre, b.d, size * 0.85));
      continue;
    }
    const off = 0.18 * bl;
    if (b.order === 1) { line(p, q); continue; }
    if (b.order === 3) {
      line(p, q);
      for (const s of [1, -1]) line({ x: p.x + n.x * off * s, y: p.y + n.y * off * s }, { x: q.x + n.x * off * s, y: q.y + n.y * off * s });
      continue;
    }
    // a double bond: its second line inside the ring, or on the side with more neighbours, or either side of the middle
    const others = drawn.filter((o) => o !== b && !o.partial && (o.i === b.i || o.j === b.i || o.i === b.j || o.j === b.j))
      .map((o) => at.get([o.i, o.j].find((k) => k !== b.i && k !== b.j)!)!);
    const side = others.reduce((s, o) => s + Math.sign((o.x - p.x) * n.x + (o.y - p.y) * n.y), 0);
    if (side === 0 && (labelled.has(b.i) || labelled.has(b.j) || others.length === 0)) {
      for (const s of [0.5, -0.5]) line({ x: p.x + n.x * off * s, y: p.y + n.y * off * s }, { x: q.x + n.x * off * s, y: q.y + n.y * off * s });
      continue;
    }
    line(p, q);
    const s = side >= 0 ? 1 : -1, cut = 0.14 * len;
    line({ x: p.x + n.x * off * s + u.x * (labelled.has(b.i) ? 0 : cut), y: p.y + n.y * off * s + u.y * (labelled.has(b.i) ? 0 : cut) },
      { x: q.x + n.x * off * s - u.x * (labelled.has(b.j) ? 0 : cut), y: q.y + n.y * off * s - u.y * (labelled.has(b.j) ? 0 : cut) });
  }
  return out;
}
