// Drawing an X-ray structure: ORTEP (thermal ellipsoids) or ball-and-stick, seen from any
// direction, as a list of shapes in drawing order. Ported from Chem SI Assistant
// (si_assistant/core/xray_draw.py, same author and licence).
//
// The view is flat (orthographic), as crystal structures are drawn. Each atom's ellipsoid (the
// surface its displacement parameters U enclose with the chosen probability, 50% by default)
// shows as the ellipse of its outline from that direction, with its three principal ellipses
// (where the surface faces the viewer); hydrogen atoms as small spheres. Bonds and atoms are
// drawn back to front, so nearer ones hide farther ones.
//
// The crystal viewer draws these shapes on its canvas, and Place on Page turns the same shapes
// into ovals, lines and text in a frame (`drawCrystal`), so what is seen is what is placed.

import type { Doc, Shape } from '../model';
import type { Measure } from '../editor/arrange';
import type { Vec } from '../geom';
import { COVALENT, eigSym3, ident3, mmul, mT, mvec, sub3, type M3, type V3 } from '../chem/crystal';
import { inkId } from './geo';

/** The ellipsoid's size for a probability: c with P(χ²₃ ≤ c²) = p. */
export const PROBABILITY_SCALE: Record<number, number> = { 30: 1.1932, 50: 1.5382, 70: 1.9144, 90: 2.5003 };
const PT_PER_A = 28;
const H_RADIUS = 0.14;
const BOND_WIDTH = 0.085;
const STICK_RADIUS = 0.1;

/** Element colours (as in Jmol/CPK, a little darker for print). */
const COLOURS: Record<string, string> = {
  H: '#ffffff', C: '#8c8c8c', N: '#3050f8', O: '#e60d0d', F: '#7fd34d', Cl: '#1fbf1f', Br: '#a62929', I: '#940094', S: '#e6c21f', P: '#ff8000',
  B: '#ffb5b5', Si: '#d0b080', Se: '#e09000', Na: '#ab5cf2', K: '#8f40d4', Li: '#cc80ff', Mg: '#56c400', Al: '#bfa6a6', Fe: '#e06633', Co: '#f090a0',
  Ni: '#50d050', Cu: '#c88033', Zn: '#7d80b0', Pd: '#006985', Pt: '#d0d0e0', Rh: '#0a7d8c', Ru: '#248f8f', Ir: '#175487', Au: '#ffd123', Ag: '#c0c0c0',
  Sn: '#668080', Ti: '#bfc2c7', Zr: '#94e0e0', Mn: '#9c7ac7', Cr: '#8a99c7', Mo: '#54b5b5', W: '#2194d6', D: '#ffffc0',
};

/** One atom of a placed crystal structure, as saved with the figure (Å; U as u11 u22 u33 u12 u13 u23, Cartesian). */
export interface XAtom {
  label: string;
  el: string;
  xyz: V3;
  u: [number, number, number, number, number, number];
  aniso?: boolean;
  part?: string;
  mol: number;
  own?: boolean;
}

export interface XView {
  /** Å → screen axes (rows). */
  rotation: M3;
  zoom: number;
  style: 'ortep' | 'ball';
  probability: 30 | 50 | 70 | 90;
  hydrogens: boolean;
  colour: boolean;
  principal: boolean;
  labels: boolean;
  labelSize: number;
  /** Label → offset from its atom (pt), where dragged. */
  labelOffsets: Record<string, [number, number]>;
  hiddenMolecules: number[];
  hiddenParts: string[];
}

/** A crystal structure figure: what is drawn and how it is seen. */
export interface CrystalSpec {
  name: string;
  atoms: XAtom[];
  bonds: [number, number][];
  view: XView;
  /** The crystal data table: [label, value] in text marks (*italic*, _{sub}, ^{sup}). */
  table?: [string, string][];
  /** The cell's axes a, b and c as columns (Å), for looking along them. */
  axes?: M3;
  /** Whether growing the molecules stopped early (a polymer or network). */
  partial?: boolean;
}

export const defaultView = (): XView => ({
  rotation: ident3(), zoom: 1, style: 'ortep', probability: 50, hydrogens: true, colour: true, principal: true,
  labels: true, labelSize: 9, labelOffsets: {}, hiddenMolecules: [], hiddenParts: [],
});

const uMat = (u: XAtom['u']): M3 => [[u[0], u[3], u[4]], [u[3], u[1], u[5]], [u[4], u[5], u[2]]];
const isH = (el: string) => el === 'H' || el === 'D';

// ---------------------------------------------------------------- views

/** A rotation showing the molecule spread out: its longest extent across the page, looking along its thinnest direction. */
export function bestRotation(xyz: V3[]): M3 {
  if (xyz.length < 3) return ident3();
  const c = [0, 1, 2].map((k) => xyz.reduce((s, p) => s + p[k], 0) / xyz.length);
  const cov: M3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of xyz) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += (p[i] - c[i]) * (p[j] - c[j]);
  const { v } = eigSym3(cov);
  // rows: largest, middle, smallest spread
  const r: M3 = [[v[0][2], v[1][2], v[2][2]], [v[0][1], v[1][1], v[2][1]], [v[0][0], v[1][0], v[2][0]]];
  const det = r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
  if (det < 0) r[2] = [-r[2][0], -r[2][1], -r[2][2]];
  return r;
}

/** A rotation looking along `direction` (it points at the viewer). */
export function axisRotation(direction: V3): M3 {
  const n = Math.hypot(...direction) || 1;
  const z: V3 = [direction[0] / n, direction[1] / n, direction[2] / n];
  let up: V3 = [0, 1, 0];
  if (Math.abs(z[1]) > 0.95) up = [1, 0, 0];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let x = cross(up, z);
  const nx = Math.hypot(...x) || 1;
  x = [x[0] / nx, x[1] / nx, x[2] / nx];
  return [x, cross(z, x), z];
}

/** The view turned about the screen's axes: dy about the vertical axis (drag left / right), dx about the horizontal one, dz in the page's plane. */
export function turnView(rotation: M3, dxDeg: number, dyDeg: number, dzDeg = 0): M3 {
  const about = (axis: number, deg: number): M3 => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const m = ident3();
    const [i, j] = [[1, 2], [2, 0], [0, 1]][axis];
    m[i][i] = c; m[i][j] = -s; m[j][i] = s; m[j][j] = c;
    return m;
  };
  return mmul(mmul(mmul(about(1, dyDeg), about(0, dxDeg)), about(2, dzDeg)), rotation);
}

// ---------------------------------------------------------------- shapes

export interface XShape {
  kind: 'ellipse' | 'polyline' | 'polygon' | 'ball' | 'text';
  /** Larger = nearer the viewer (drawn later). */
  depth: number;
  points?: [number, number][];
  centre?: [number, number];
  /** Ellipse: semi-axes (pt); ball: (radius, radius). */
  axes?: [number, number];
  /** Ellipse: its first axis, degrees clockwise on the page (y down). */
  angle?: number;
  fill: string;
  stroke: string;
  width: number;
  text?: string;
  size?: number;
  /** A label's atom ("C1"): for dragging. */
  key?: string;
  /** A label's atom's position (pt), which the label is offset from. */
  anchor?: [number, number];
  /** A stick half (ball-and-stick): 0 runs from its atom to the bond's middle, 1 from the middle to its atom. */
  half?: 0 | 1;
}

function visible(c: CrystalSpec, v: XView): number[] {
  const out: number[] = [];
  c.atoms.forEach((a, i) => {
    if (v.hiddenMolecules.includes(a.mol) || (a.part && v.hiddenParts.includes(a.part))) return;
    if (isH(a.el) && !v.hydrogens) return;
    out.push(i);
  });
  return out;
}

/** An element's colour, lighter (an ellipsoid's fill: its outline and principal ellipses stay readable). */
function tintOf(colour: string): string {
  const rgb = [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16));
  return '#' + rgb.map((v) => Math.round(v + (255 - v) * 0.35).toString(16).padStart(2, '0')).join('');
}

/** Eigen of a symmetric 2 × 2 [[a, b], [b, d]]: values ascending and the vector of the larger. */
function eig2(a: number, b: number, d: number): { w: [number, number]; major: [number, number] } {
  const t = (a + d) / 2, s = Math.sqrt(((a - d) / 2) ** 2 + b * b);
  const w1 = t + s, w0 = t - s;
  let major: [number, number] = Math.abs(b) > 1e-14 ? [b, w1 - a] : a >= d ? [1, 0] : [0, 1];
  const n = Math.hypot(...major) || 1;
  major = [major[0] / n, major[1] / n];
  return { w: [w0, w1], major };
}

/** The shapes of the drawing, back to front, in points (y down), centred on the structure. */
export function crystalShapes(c: CrystalSpec, v: XView): XShape[] {
  const r = v.rotation;
  const keep = visible(c, v);
  if (!keep.length) return [];
  const centre: V3 = [0, 1, 2].map((k) => keep.reduce((s, i) => s + c.atoms[i].xyz[k], 0) / keep.length) as V3;
  const scale = PT_PER_A * v.zoom;
  const screen = new Map<number, V3>(keep.map((i) => [i, mvec(r, sub3(c.atoms[i].xyz, centre))]));
  const pt = (p: V3): [number, number] => [p[0] * scale, -p[1] * scale];
  const out: XShape[] = [];
  const radius = new Map<number, number>();
  const outline = new Map<number, number | { c: number; inv: [number, number, number] }>();
  const cc = PROBABILITY_SCALE[v.probability] ?? 1.5382;
  for (const i of keep) {
    const a = c.atoms[i], s = screen.get(i)!;
    const colour = v.colour ? COLOURS[a.el] ?? '#b0b0b0' : '#ffffff';
    const hyd = isH(a.el);
    if (v.style === 'ball' || hyd) {
      let rad = hyd && v.style !== 'ball' ? H_RADIUS : Math.max(0.15, 0.38 * (COVALENT[a.el] ?? 1) + 0.05);
      if (hyd && v.style === 'ball') rad = 0.17;
      radius.set(i, rad);
      outline.set(i, rad);
      out.push({ kind: v.style === 'ball' || v.colour ? 'ball' : 'ellipse', depth: s[2], centre: pt(s), axes: [rad * scale, rad * scale], angle: 0, fill: colour, stroke: '#000000', width: hyd ? 0.5 : 0.6 });
      continue;
    }
    // ORTEP: the outline of the ellipsoid, and its principal ellipses
    let u = mmul(mmul(r, uMat(a.u)), mT(r));
    u = [0, 1, 2].map((p) => [0, 1, 2].map((q) => (u[p][q] + u[q][p]) / 2)) as M3;
    const e = eig2(u[0][0], u[0][1], u[1][1]);
    const w = [Math.max(1e-5, e.w[0]), Math.max(1e-5, e.w[1])];
    out.push({
      kind: 'ellipse', depth: s[2], centre: pt(s), axes: [cc * Math.sqrt(w[1]) * scale, cc * Math.sqrt(w[0]) * scale],
      angle: (Math.atan2(-e.major[1], e.major[0]) * 180) / Math.PI, fill: v.colour ? tintOf(colour) : '#ffffff', stroke: '#000000', width: 0.7,
    });
    radius.set(i, cc * Math.sqrt((w[0] + w[1]) / 2));
    const det = u[0][0] * u[1][1] - u[0][1] * u[1][0] || 1e-12;
    outline.set(i, { c: cc, inv: [u[1][1] / det, -u[0][1] / det, u[0][0] / det] });
    if (v.principal && a.aniso) {
      for (const line of principalEllipses(u, cc)) out.push({ kind: 'polyline', depth: s[2] + 1e-6, points: line.map((p) => pt([s[0] + p[0], s[1] + p[1], s[2] + p[2]])), fill: 'none', stroke: '#000000', width: 0.45 });
    }
  }
  // bonds: from the edge of one atom's outline to the other's (so they never run over an atom)
  const kept = new Set(keep);
  const reach = (k: number, d: [number, number]) => {
    const o = outline.get(k)!;
    if (typeof o === 'number') return o;
    const q = d[0] * (o.inv[0] * d[0] + o.inv[1] * d[1]) + d[1] * (o.inv[1] * d[0] + o.inv[2] * d[1]);
    return q > 1e-12 ? o.c / Math.sqrt(q) : 0;
  };
  for (const [i, j] of c.bonds) {
    if (!kept.has(i) || !kept.has(j)) continue;
    let a = screen.get(i)!, b = screen.get(j)!;
    const d = sub3(b, a);
    const length = Math.hypot(d[0], d[1]);
    if (length < 1e-6) continue;
    const unit: [number, number] = [d[0] / length, d[1] / length];
    const ra = reach(i, unit), rb = reach(j, [-unit[0], -unit[1]]);
    if (ra + rb >= length) continue;
    a = [a[0] + d[0] * (ra / length), a[1] + d[1] * (ra / length), a[2] + d[2] * (ra / length)];
    b = [b[0] - d[0] * (rb / length), b[1] - d[1] * (rb / length), b[2] - d[2] * (rb / length)];
    const hyd = isH(c.atoms[i].el) || isH(c.atoms[j].el);
    if (v.style === 'ball') { out.push(...stick(a, b, scale, c, i, j, v, pt)); continue; }
    out.push({ kind: 'polyline', depth: (a[2] + b[2]) / 2 - 1e-3, points: [pt(a), pt(b)], fill: 'none', stroke: '#000000', width: BOND_WIDTH * (hyd ? 0.6 : 1) * scale });
  }
  out.sort((p, q) => p.depth - q.depth);
  if (v.labels) out.push(...labels(c, keep, screen, radius, scale, v, pt));
  return out;
}

/** The parts of the ellipsoid's three principal ellipses that face the viewer (Å, relative to its centre). */
function principalEllipses(u: M3, c: number, n = 72): V3[][] {
  const { w, v } = eigSym3(u);
  const axes = [0, 1, 2].map((k) => { const s = c * Math.sqrt(Math.max(1e-6, w[k])); return [v[0][k] * s, v[1][k] * s, v[2][k] * s] as V3; });
  const inv = inverseSym(u);
  const out: V3[][] = [];
  for (const [p, q] of [[0, 1], [1, 2], [0, 2]]) {
    let run: V3[] = [];
    for (let k = 0; k <= n; k++) {
      const t = (2 * Math.PI * k) / n;
      const point: V3 = [0, 1, 2].map((d) => axes[p][d] * Math.cos(t) + axes[q][d] * Math.sin(t)) as V3;
      const normal = mvec(inv, point);
      if (normal[2] > 0) run.push(point);
      else if (run.length) { if (run.length > 1) out.push(run); run = []; }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

function inverseSym(m: M3): M3 {
  const { w, v } = eigSym3(m);
  const out: M3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < 3; k++) { const iw = 1 / Math.max(1e-9, w[k]); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i][j] += v[i][k] * v[j][k] * iw; }
  return out;
}

/** A ball-and-stick bond: two halves in the colours of their atoms. */
function stick(a: V3, b: V3, scale: number, c: CrystalSpec, i: number, j: number, v: XView, pt: (p: V3) => [number, number]): XShape[] {
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const out: XShape[] = [];
  for (const [s, e, k, half] of [[a, mid, i, 0], [mid, b, j, 1]] as [V3, V3, number, 0 | 1][]) {
    const colour = v.colour ? COLOURS[c.atoms[k].el] ?? '#b0b0b0' : '#ffffff';
    const p0 = pt(s), p1 = pt(e);
    const d = [p1[0] - p0[0], p1[1] - p0[1]];
    const len = Math.hypot(d[0], d[1]);
    if (len < 1e-9) continue;
    const n = [(-d[1] / len) * STICK_RADIUS * scale, (d[0] / len) * STICK_RADIUS * scale];
    out.push({ kind: 'polygon', depth: (s[2] + e[2]) / 2 - 1e-3, points: [[p0[0] + n[0], p0[1] + n[1]], [p1[0] + n[0], p1[1] + n[1]], [p1[0] - n[0], p1[1] - n[1]], [p0[0] - n[0], p0[1] - n[1]]], fill: colour, stroke: '#000000', width: 0.4, half });
  }
  return out;
}

/**
 * Labels of the non-hydrogen atoms, on the open side of each (away from its bonds), or where
 * dragged. An atom shown twice (a molecule completed by symmetry) is labelled once: on the
 * asymmetric unit's own atom, else the nearest copy.
 */
function labels(c: CrystalSpec, keep: number[], screen: Map<number, V3>, radius: Map<number, number>, scale: number, v: XView, pt: (p: V3) => [number, number]): XShape[] {
  const kept = new Set(keep);
  const nbr = new Map<number, number[]>();
  for (const [i, j] of c.bonds) if (kept.has(i) && kept.has(j)) { nbr.set(i, [...(nbr.get(i) ?? []), j]); nbr.set(j, [...(nbr.get(j) ?? []), i]); }
  const out: XShape[] = [];
  const seen = new Set<string>();
  for (const i of [...keep].sort((p, q) => Number(!c.atoms[p].own) - Number(!c.atoms[q].own) || screen.get(q)![2] - screen.get(p)![2])) {
    const a = c.atoms[i];
    if (isH(a.el) || seen.has(a.label)) continue;
    seen.add(a.label);
    const [x, y] = pt(screen.get(i)!);
    const off = v.labelOffsets[a.label] ?? openSide(i, nbr.get(i) ?? [], screen, (radius.get(i) ?? 0.3) * scale, a.label, v.labelSize);
    out.push({ kind: 'text', depth: 1e9, centre: [x + off[0], y + off[1]], anchor: [x, y], text: a.label, size: v.labelSize, key: a.label, fill: '#000000', stroke: 'none', width: 0 });
  }
  return out;
}

/** Where a label goes from its atom (pt, y down; the text's start on its baseline): in the middle of the widest open angle between the atom's bonds as seen, just outside the atom. */
function openSide(i: number, bonded: number[], screen: Map<number, V3>, radiusPt: number, text: string, size: number): [number, number] {
  const angles: number[] = [];
  const p = screen.get(i)!;
  for (const j of bonded) { const q = screen.get(j)!; const dx = q[0] - p[0], dy = q[1] - p[1]; if (Math.hypot(dx, dy) > 1e-6) angles.push(Math.atan2(dy, dx)); }
  let angle: number;
  if (!angles.length) angle = Math.PI / 4;
  else {
    angles.sort((a, b) => a - b);
    const gaps = angles.map((a, k) => ((angles[(k + 1) % angles.length] - a + 2 * Math.PI) % (2 * Math.PI)) || 2 * Math.PI);
    let best = 0;
    const key = (m: number) => [Math.round(gaps[m] * 1000), -Math.abs(Math.sin(angles[m] + gaps[m] / 2 - Math.PI / 4))];
    for (let m = 1; m < gaps.length; m++) { const a = key(m), b = key(best); if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) best = m; }
    angle = angles[best] + gaps[best] / 2;
  }
  const dx = Math.cos(angle), dy = -Math.sin(angle);
  const w = 0.58 * size * text.length, h = 0.72 * size;
  const dist = radiusPt + 2.5 + Math.abs(dx) * (w / 2) + Math.abs(dy) * (h / 2);
  return [dx * dist - w / 2, dy * dist + h / 2];
}

/** [x0, y0, x1, y1] the shapes cover (pt), labels included. */
export function shapesBounds(items: XShape[]): [number, number, number, number] {
  const xs: number[] = [], ys: number[] = [];
  for (const s of items) {
    if (s.kind === 'ellipse' || s.kind === 'ball') { const rad = Math.max(...s.axes!); xs.push(s.centre![0] - rad, s.centre![0] + rad); ys.push(s.centre![1] - rad, s.centre![1] + rad); }
    else if (s.kind === 'text') { const w = 0.6 * s.size! * s.text!.length; xs.push(s.centre![0], s.centre![0] + w); ys.push(s.centre![1] - s.size!, s.centre![1] + 0.3 * s.size!); }
    else for (const [x, y] of s.points!) { xs.push(x); ys.push(y); }
  }
  if (!xs.length) return [0, 0, 1, 1];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The zoom at which the drawing (labels aside) fits `w` × `h` points. */
export function fittingZoom(c: CrystalSpec, v: XView, w: number, h: number): number {
  const b = shapesBounds(crystalShapes(c, { ...v, zoom: 1, labels: false }));
  const pad = v.labels ? 2.5 * v.labelSize : 0;
  return Math.min(8, Math.max(0.05, Math.min((w - pad) / Math.max(1, b[2] - b[0]), (h - pad) / Math.max(1, b[3] - b[1]))));
}

/** Paint the shapes on a canvas (already scaled to points, origin where the drawing's centre goes). */
export function paintShapes(ctx: CanvasRenderingContext2D, items: XShape[], font = 'Arial'): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of items) {
    ctx.lineWidth = s.width;
    ctx.strokeStyle = s.stroke;
    if (s.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(s.centre![0], s.centre![1], Math.max(0.01, s.axes![0]), Math.max(0.01, s.axes![1]), ((s.angle ?? 0) * Math.PI) / 180, 0, 2 * Math.PI);
      if (s.fill !== 'none') { ctx.fillStyle = s.fill; ctx.fill(); }
      ctx.stroke();
    } else if (s.kind === 'ball') {
      const [x, y] = s.centre!, r = s.axes![0];
      const g = ctx.createRadialGradient(x - 0.3 * r, y - 0.3 * r, 0, x - 0.3 * r, y - 0.3 * r, 1.3 * r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, s.fill);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
    } else if (s.kind === 'polyline' || s.kind === 'polygon') {
      ctx.beginPath();
      s.points!.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.kind === 'polygon') { ctx.closePath(); ctx.fillStyle = s.fill; ctx.fill(); }
      ctx.stroke();
    } else if (s.kind === 'text') {
      ctx.font = `${s.size}px ${font}`;
      ctx.lineWidth = s.size! * 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(s.text!, s.centre![0], s.centre![1]);
      ctx.fillStyle = '#000000';
      ctx.fillText(s.text!, s.centre![0], s.centre![1]);
    }
  }
}

// ---------------------------------------------------------------- on the page

export interface CrystalParts { captions: number[]; arrows: number[]; shapes: number[] }

/**
 * Where drawCrystal puts each atom's centre on the page (fitted to `w` × `h` points with its
 * top left at `at`), and the points per Å it draws at: for marks drawn over it (distances).
 */
export function crystalPlacer(c: CrystalSpec, at: Vec, w: number, h: number): { place: (i: number) => Vec | null; scale: number } {
  const v: XView = { ...c.view, zoom: fittingZoom(c, c.view, w, h) };
  const b = shapesBounds(crystalShapes(c, v));
  const dx = at.x + w / 2 - (b[0] + b[2]) / 2, dy = at.y + h / 2 - (b[1] + b[3]) / 2;
  const keep = visible(c, v);
  const scale = PT_PER_A * v.zoom;
  if (!keep.length) return { place: () => null, scale };
  const centre: V3 = [0, 1, 2].map((k) => keep.reduce((s, i) => s + c.atoms[i].xyz[k], 0) / keep.length) as V3;
  const kept = new Set(keep);
  return {
    scale,
    place: (i) => {
      if (!kept.has(i)) return null;
      const s = mvec(v.rotation, sub3(c.atoms[i].xyz, centre));
      return { x: s[0] * scale + dx, y: -s[1] * scale + dy };
    },
  };
}

/**
 * Draw the structure into the drawing as ovals, lines, ink lines and text, fitted to `w` × `h`
 * points with its top left at `at`. Call inside an edit; the caller puts the parts in a frame.
 */
export function drawCrystal(doc: Doc, _m: Measure, c: CrystalSpec, at: Vec, w: number, h: number): CrystalParts {
  const out: CrystalParts = { captions: [], arrows: [], shapes: [] };
  const v: XView = { ...c.view, zoom: fittingZoom(c, c.view, w, h) };
  const items = crystalShapes(c, v);
  const b = shapesBounds(items);
  const dx = at.x + w / 2 - (b[0] + b[2]) / 2, dy = at.y + h / 2 - (b[1] + b[3]) / 2;
  const P = (p: [number, number]): Vec => ({ x: p[0] + dx, y: p[1] + dy });
  const shape = (s: Omit<Shape, 'id'>) => out.shapes.push(doc.addShape(s).id);
  // lines as ink (a filled outline), which keeps its width in every program the drawing goes to
  const ink = (pts: Vec[], width: number, color: string, name: string) => {
    const r = width / 2 + 0.5;
    const box = { x1: Math.min(...pts.map((q) => q.x)) - r, y1: Math.min(...pts.map((q) => q.y)) - r, x2: Math.max(...pts.map((q) => q.x)) + r, y2: Math.max(...pts.map((q) => q.y)) + r };
    shape({ kind: 'geo', geo: inkId(width, pts, box), ...box, filled: true, fillColor: color, color, lineWidth: 0, name });
  };
  const outlined = new Set<string>();
  for (const s of items) {
    if (s.kind === 'ellipse' || s.kind === 'ball') {
      const p = P(s.centre!), [rx, ry] = s.axes!;
      shape({
        kind: 'oval', x1: p.x - rx, y1: p.y - ry, x2: p.x + rx, y2: p.y + ry, ...(s.angle ? { rot: s.angle } : {}),
        filled: s.fill !== 'none', fillColor: s.fill, ...(s.kind === 'ball' ? { fill: 'shaded' as const } : {}), color: s.stroke, lineWidth: s.width,
      });
    } else if (s.kind === 'polyline') {
      ink(s.points!.map(P), s.width, s.stroke, s.points!.length === 2 ? 'Bond' : 'Principal ellipse');
    } else if (s.kind === 'polygon') {
      // a stick half: the whole stick's outline (once, under both halves), then its colour from
      // its atom to the bond's middle (the half drawn later rounds over the other at the middle)
      const [p0, p1, p2, p3] = s.points!.map(P);
      const a = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 }, z = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const width = Math.hypot(p0.x - p3.x, p0.y - p3.y);
      const [atom, mid] = s.half === 1 ? [z, a] : [a, z];
      const key = `${mid.x.toFixed(2)},${mid.y.toFixed(2)}`;
      if (!outlined.has(key)) {
        outlined.add(key);
        ink([atom, { x: 2 * mid.x - atom.x, y: 2 * mid.y - atom.y }], width + 2 * s.width, s.stroke, 'Bond outline');
      }
      ink([atom, mid], width, s.fill, 'Bond');
    } else if (s.kind === 'text') {
      const p = P(s.centre!);
      out.captions.push(doc.addCaption({ x: p.x, y: p.y, runs: [{ text: s.text!, size: s.size }], justify: 'left', chem: false }).id);
    }
  }
  return out;
}

/** A grown crystal structure as a figure's atoms (rounded, so the figure stays small when saved). */
export function specAtoms(atoms: { label: string; element: string; xyz: V3; u: M3; anisotropic: boolean; part: string; molecule: number; own: boolean }[]): XAtom[] {
  const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
  return atoms.map((a) => ({
    label: a.label, el: a.element, xyz: a.xyz.map((x) => r(x, 4)) as V3,
    u: [a.u[0][0], a.u[1][1], a.u[2][2], a.u[0][1], a.u[0][2], a.u[1][2]].map((x) => r(x, 5)) as XAtom['u'],
    ...(a.anisotropic ? { aniso: true } : {}), ...(a.part ? { part: a.part } : {}), mol: a.molecule, ...(a.own ? { own: true } : {}),
  }));
}
