// Torsional energy diagrams (in the Newman Projection window, Chart tab): the energy of a bond's
// conformations against the torsion between two groups, from 0° to 360°, with a Newman
// projection at each minimum and maximum, their names and the barriers between them, as in
// textbook figures of butane. Drawn as ordinary lines, curves and text inside an invisible frame
// that keeps the numbers (as energy diagrams are), so it saves to CDXML and Office files as
// drawn and opens again for editing.

import type { Arrow, Caption, Doc, Frame } from '../model';
import type { Vec } from '../geom';
import type { Measure } from '../editor/arrange';
import { chemRuns } from '../text/chemtext';
import { chordLocal, shapeBox } from '../objects';
import { frameBox } from '../editor/frames';
import { profileAt, type Extremum, type Profile } from '../chem/torsion-profile';
import { norm180, type NewmanGroup } from '../chem/newman';
import { drawEyeMark, drawNewman, type NewmanLook } from './newman';

export type ConformerNames = 'textbook' | 'klyne' | 'none';

export interface TorsionData {
  /** The fitted curve (kcal/mol) and its minima and maxima. */
  profile: Profile;
  extrema: Extremum[];
  /** The groups compared (the torsion is between them) and the view at torsion `phi0`. */
  front: NewmanGroup[];
  back: NewmanGroup[];
  phi0: number;
  unit: 'kcal/mol' | 'kJ/mol';
  /** Newman projections at the minima and maxima. */
  insets: 'all' | 'minima' | 'none';
  /** synperiplanar, gauche, eclipsed, antiperiplanar (textbook); synclinal, anticlinal… (Klyne–Prelog). */
  names: ConformerNames;
  /** The energy of each minimum and maximum, with a dotted arrow up from the lowest. */
  barriers: boolean;
  /** Colour of the barrier arrows and their numbers. */
  barrierColor: string;
  digits: number;
  /** The plot's size in points. */
  w: number;
  h: number;
  method?: string;
  look: NewmanLook;
  /** A boxed sawhorse of the molecule above the plot, with the eye looking down the bond (as in textbook figures). */
  sawhorse?: boolean;
  /** The scan the curve was fitted to (φ in degrees, kcal/mol), for Copy Data. */
  points?: { phi: number; energy: number }[];
}

export const TORSION_DEFAULTS = { unit: 'kcal/mol' as const, insets: 'all' as const, names: 'textbook' as const, barriers: true, barrierColor: '#1a56db', digits: 1 };

const KJ = 4.184;

/** The name of a conformation at torsion φ (between the groups compared). */
export function extremumName(phi: number, kind: 'min' | 'max', names: ConformerNames): string {
  const a = Math.abs(norm180(phi));
  if (names === 'none') return '';
  if (names === 'klyne') return a < 30 ? 'synperiplanar' : a < 90 ? 'synclinal' : a < 150 ? 'anticlinal' : 'antiperiplanar';
  if (a < 30) return kind === 'max' ? 'synperiplanar' : 'eclipsed';
  if (a > 150) return 'antiperiplanar';
  return kind === 'min' ? 'gauche' : 'eclipsed';
}

export interface TorsionParts { captions: number[]; arrows: number[]; shapes: number[] }

/** Draw the diagram with its plot's top left corner at `at`. Call inside an edit. */
export function drawTorsion(doc: Doc, m: Measure, d: TorsionData, at: Vec): TorsionParts {
  const out: TorsionParts = { captions: [], arrows: [], shapes: [] };
  const L = doc.style.bondLength, lw = doc.style.lineWidth;
  const k = d.unit === 'kJ/mol' ? KJ : 1;
  const samples: { phi: number; e: number }[] = [];
  for (let phi = 0; phi <= 360; phi += 5) samples.push({ phi, e: profileAt(d.profile, phi) });
  const lo = Math.min(...samples.map((s) => s.e)), hi = Math.max(...samples.map((s) => s.e));
  const top = hi - lo || 1;
  const x = (phi: number) => at.x + (phi / 360) * d.w;
  const y = (e: number) => at.y + d.h - ((e - lo) / top) * d.h;
  const y0 = at.y + d.h;

  const caption = (text: string, target: Vec, anchor: 'above' | 'below' | 'left' | 'right', extra: Partial<Caption> = {}, color?: string): Caption => {
    const runs = chemRuns(text).map((r) => ({ ...r, ...(color ? { color } : {}) }));
    const c = doc.addCaption({ x: 0, y: 0, runs, justify: 'left', chem: false, ...extra });
    const b = m.captionBox(c);
    const w = b.x2 - b.x1, h = b.y2 - b.y1;
    const want = anchor === 'above' ? { x: target.x - w / 2, y: target.y - h } : anchor === 'below' ? { x: target.x - w / 2, y: target.y }
      : anchor === 'left' ? { x: target.x - w, y: target.y - h / 2 } : { x: target.x, y: target.y - h / 2 };
    doc.updateCaption(c.id, { x: c.x + want.x - b.x1, y: c.y + want.y - b.y1 });
    out.captions.push(c.id);
    return doc.captions.get(c.id)!;
  };
  const line = (a: Vec, b: Vec, more: Record<string, unknown> = {}) => out.shapes.push(doc.addShape({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: '#000000', ...more }).id);
  const arrow = (tail: Vec, head: Vec, more: Partial<Arrow> = {}) => out.arrows.push(doc.addArrow({
    tail, head, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0,
    headLength: lw * 8, headWidth: lw * 2.6, ...more,
  }).id);

  // axes, with "E (kcal/mol)" up the side and φ at the end
  arrow({ x: at.x, y: y0 }, { x: at.x, y: at.y - 0.5 * L });
  arrow({ x: at.x, y: y0 }, { x: at.x + d.w + 1.0 * L, y: y0 });
  const ylab = caption(`E (${d.unit})`, { x: 0, y: 0 }, 'right');
  const yb = m.captionBox(ylab);
  doc.updateCaption(ylab.id, { x: at.x - 0.45 * L - (yb.y2 - ylab.y), y: at.y + d.h * 0.25 + (yb.x2 - yb.x1) / 2, rot: -90 });
  caption('φ', { x: at.x + d.w + 1.3 * L, y: y0 }, 'right', { runs: [{ text: 'φ', italic: true }] });
  for (let phi = 60; phi <= 360; phi += 60) {
    line({ x: x(phi), y: y0 - 0.2 * L }, { x: x(phi), y: y0 + 0.2 * L });
    caption(`${phi}°`, { x: x(phi), y: y0 + 0.3 * L }, 'below', { runs: [{ text: `${phi}°`, bold: true }] });
  }

  // the curve: smooth Bézier pieces through points every 5°
  const P = samples.map((s) => ({ x: x(s.phi), y: y(s.e) }));
  const bez: Vec[] = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    bez.push({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 });
    if (i + 2 < P.length) bez.push(p2);
  }
  const tail = P[0], head = P[P.length - 1];
  // the curve every half degree or so, for keeping words off it (steep parts jump between the 5° points)
  const dense: Vec[] = [];
  for (let i = 0; i + 1 < P.length; i++) for (let k = 0; k < 10; k++) dense.push({ x: P[i].x + ((P[i + 1].x - P[i].x) * k) / 10, y: P[i].y + ((P[i + 1].y - P[i].y) * k) / 10 });
  out.arrows.push(doc.addArrow({
    tail, head, headStyle: 'none', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0,
    headLength: 0, headWidth: 0, color: '#9a9a9a', lineWidth: lw * 1.6, bez: bez.map((q) => chordLocal(tail, head, q)), bent: true,
  }).id);

  // each minimum and maximum: a level, its projection and name, and the climb to it
  const ext = d.extrema.map((e) => ({ ...e }));
  // the curve's ends are the same conformation: show the one at 0° at 360° too (a scan's
  // turning point there can sit a few degrees off, as the fit is not quite symmetric)
  const atZero = ext.find((e) => e.phi < 10 || e.phi > 350);
  if (atZero) { atZero.phi = 0; ext.push({ ...atZero, phi: 360 }); }
  const bar = 0.9 * L;
  const fmt = (e: number) => (e * k).toFixed(d.digits).replace(/^-/, '−');
  /** A projection drawn with its top (or bottom, `fromTop` false) at y, centred on x; returns its top and bottom. */
  const inset = (cx: number, yEdge: number, fromTop: boolean, turn: number) => {
    const parts = drawNewman(doc, m, { kind: 'newman', front: d.front, back: d.back, turn, conformer: 0, source: 'angle', look: d.look }, { x: cx, y: 0 });
    const boxes = [...parts.captions.map((id) => m.captionBox(doc.captions.get(id)!)), ...parts.shapes.map((id) => shapeBox(doc.shapes.get(id)!))];
    const y1 = Math.min(...boxes.map((r) => r.y1)), y2 = Math.max(...boxes.map((r) => r.y2));
    const dy = fromTop ? yEdge - y1 : yEdge - y2;
    for (const id of parts.captions) { const c = doc.captions.get(id)!; doc.updateCaption(id, { y: c.y + dy }); }
    for (const id of parts.shapes) { const sh = doc.shapes.get(id)!; doc.updateShape(id, { y1: sh.y1 + dy, y2: sh.y2 + dy }); }
    for (const id of parts.arrows) { const a = doc.arrows.get(id)!; doc.updateArrow(id, { tail: { x: a.tail.x, y: a.tail.y + dy }, head: { x: a.head.x, y: a.head.y + dy } }); }
    out.captions.push(...parts.captions); out.shapes.push(...parts.shapes); out.arrows.push(...parts.arrows);
    return { y1: y1 + dy, y2: y2 + dy };
  };
  const shown: Extremum[] = [];
  for (const e of ext.sort((p, q) => p.phi - q.phi)) {
    const px = x(e.phi), py = y(e.energy + lo);
    const half = e.phi === 0 || e.phi === 360 ? bar * 0.5 : bar / 2;
    if (e.energy > 0.02) line({ x: Math.max(at.x, px - half), y: py }, { x: Math.min(at.x + d.w, px + half), y: py });
    const name = extremumName(e.phi, e.kind, d.names);
    const show = d.insets === 'all' || (d.insets === 'minima' && e.kind === 'min');
    const turn = norm180(e.phi - d.phi0);
    // the projection at 0° sits clear of the energy axis
    const cx = e.phi === 0 ? px + 2.3 * L : px;
    if (e.kind === 'max') {
      let yy = py - 0.3 * L;
      if (show) yy = inset(cx, yy, false, turn).y1 - 0.1 * L;
      if (name) caption(name, { x: cx, y: yy }, 'above', { runs: [{ text: name, italic: true }] });
    } else {
      let yy = y0 + 1.1 * L;
      if (show) yy = inset(cx, yy, true, turn).y2 + 0.1 * L;
      if (name) caption(name, { x: cx, y: yy }, 'below', { runs: [{ text: name, italic: true }] });
    }
    if (!d.barriers || e.energy <= 0.02 || e.phi === 0) continue;
    // one climb for each distinct height (the mirror-image conformation has the same one)
    if (e.phi !== 360 && shown.some((o) => o.kind === e.kind && Math.abs(o.energy - e.energy) < 0.3)) continue;
    if (e.phi === 360) { const i = shown.findIndex((o) => o.kind === 'max' && Math.abs(o.energy - e.energy) < 0.3); if (i >= 0) continue; }
    shown.push(e);
    arrow({ x: px, y: y0 }, { x: px, y: py + lw }, { line: 'dashed', color: d.barrierColor, headLength: lw * 6, headWidth: lw * 2.2 });
    const text = `${fmt(e.energy)} ${d.unit}`;
    const cap = caption(text, { x: px - 0.2 * L, y: (y0 + py) / 2 }, 'left', { runs: [{ text, bold: true, color: d.barrierColor, size: doc.style.captionSize * 0.9 }] });
    // beside the climb, on whichever side and at whichever height crosses the curve and other words least
    const b0 = m.captionBox(cap), w = b0.x2 - b0.x1, h = b0.y2 - b0.y1;
    const others = out.captions.filter((id) => id !== cap.id).map((id) => m.captionBox(doc.captions.get(id)!));
    const cost = (bx: number, by: number) => {
      if (bx < at.x + 2 || by + h > y0 - 1) return Infinity;
      let n = 0;
      for (const q of dense) if (q.x > bx - 2 && q.x < bx + w + 2 && q.y > by - 2 && q.y < by + h + 2) n++;
      for (const o of others) if (bx < o.x2 && o.x1 < bx + w && by < o.y2 && o.y1 < by + h) n += 50;
      return n;
    };
    let best: Vec | null = null, bestCost = Infinity;
    const tries: Vec[] = [];
    if (e.kind === 'min') tries.push({ x: px - 0.2 * L - w, y: py + 0.12 * L }, { x: px + 0.2 * L, y: py + 0.12 * L });
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const cy = y0 + (py - y0) * f - h / 2;
      tries.push({ x: px - 0.2 * L - w, y: cy }, { x: px + 0.2 * L, y: cy });
    }
    for (const t of tries) { const c = cost(t.x, t.y); if (c < bestCost) { bestCost = c; best = t; } }
    if (best) doc.updateCaption(cap.id, { x: cap.x + best.x - b0.x1, y: cap.y + best.y - b0.y1 });
  }
  if (d.sawhorse) drawSawhorseBox(doc, m, d, at, out);
  return out;
}

/**
 * The molecule as a sawhorse in a box above the plot's left end, with the eye and dotted arrow
 * looking down the bond from the front, as in textbook figures of butane.
 */
function drawSawhorseBox(doc: Doc, m: Measure, d: TorsionData, at: Vec, out: TorsionParts): void {
  const L = doc.style.bondLength;
  // the most stable conformation, the one the reader compares the rest with
  const lowest = [...d.extrema].filter((e) => e.kind === 'min').sort((p, q) => p.energy - q.energy)[0];
  const turn = lowest ? norm180(lowest.phi - d.phi0) : 0;
  const parts = drawNewman(doc, m, { kind: 'sawhorse', front: d.front, back: d.back, turn, conformer: 0, source: 'angle', look: d.look }, { x: 0, y: 0 });
  // where the sawhorse put its two atoms (drawNewman: yaw 48°, pitch 32°, the atoms 1.35 bond lengths apart)
  const sep = 1.35 * L, yaw = (48 * Math.PI) / 180, pitch = (32 * Math.PI) / 180;
  const back = { x: sep * Math.sin(yaw), y: -sep * Math.cos(yaw) * Math.sin(pitch) };
  const mark = drawEyeMark(doc, { x: 0, y: 0 }, back, d.barrierColor);
  const ids = { captions: parts.captions, shapes: [...parts.shapes, ...mark.shapes], arrows: [...parts.arrows, ...mark.arrows] };
  const boxes = [
    ...ids.captions.map((id) => m.captionBox(doc.captions.get(id)!)),
    ...ids.shapes.map((id) => shapeBox(doc.shapes.get(id)!)),
    ...ids.arrows.flatMap((id) => { const a = doc.arrows.get(id)!; return [{ x1: Math.min(a.tail.x, a.head.x), y1: Math.min(a.tail.y, a.head.y), x2: Math.max(a.tail.x, a.head.x), y2: Math.max(a.tail.y, a.head.y) }]; }),
  ];
  const bx1 = Math.min(...boxes.map((r) => r.x1)), by1 = Math.min(...boxes.map((r) => r.y1)), bx2 = Math.max(...boxes.map((r) => r.x2)), by2 = Math.max(...boxes.map((r) => r.y2));
  // above everything drawn so far, its left edge on the energy axis
  const tops = [
    ...out.captions.map((id) => m.captionBox(doc.captions.get(id)!).y1),
    ...out.shapes.map((id) => shapeBox(doc.shapes.get(id)!).y1),
    at.y - 0.5 * L,
  ];
  const pad = 0.3 * L;
  const dx = at.x + pad - bx1, dy = Math.min(...tops) - 0.4 * L - pad - by2;
  for (const id of ids.captions) { const c = doc.captions.get(id)!; doc.updateCaption(id, { x: c.x + dx, y: c.y + dy }); }
  for (const id of ids.shapes) { const sh = doc.shapes.get(id)!; doc.updateShape(id, { x1: sh.x1 + dx, y1: sh.y1 + dy, x2: sh.x2 + dx, y2: sh.y2 + dy }); }
  for (const id of ids.arrows) { const a = doc.arrows.get(id)!; doc.updateArrow(id, { tail: { x: a.tail.x + dx, y: a.tail.y + dy }, head: { x: a.head.x + dx, y: a.head.y + dy } }); }
  const box = doc.addShape({ kind: 'rect', x1: bx1 + dx - pad, y1: by1 + dy - pad, x2: bx2 + dx + pad, y2: by2 + dy + pad, color: '#000000', filled: false });
  out.captions.push(...ids.captions);
  out.shapes.push(box.id, ...ids.shapes);
  out.arrows.push(...ids.arrows);
}

/** The torsion diagram a thing belongs to (its frame's id), if any. */
export function torsionFrameOf(doc: Doc, kind: 'atom' | 'bond' | 'caption' | 'arrow' | 'shape', id: number): number | null {
  if (kind === 'shape' && doc.shapes.get(id)?.torsion) return id;
  for (const s of doc.shapes.values()) {
    if (!s.torsion || !s.frame) continue;
    const f = s.frame;
    if ((kind === 'caption' && f.captions.includes(id)) || (kind === 'arrow' && f.arrows.includes(id)) || (kind === 'shape' && f.shapes.includes(id))) return s.id;
  }
  return null;
}

/** The scan as text to paste into a spreadsheet: φ and the energy, one row each. */
export function torsionCsv(d: Pick<TorsionData, 'points' | 'unit' | 'profile'>): string {
  const k = d.unit === 'kJ/mol' ? KJ : 1;
  const pts = d.points?.length ? d.points : Array.from({ length: 37 }, (_, i) => ({ phi: i * 10, energy: profileAt(d.profile, i * 10) }));
  return [`phi (deg)\tE (${d.unit})`, ...pts.map((p) => `${p.phi}\t${(p.energy * k).toFixed(3)}`)].join('\n');
}

/** Draw a diagram in a frame of its own, or the one in frame `id` again. Returns the frame's id. Call inside an edit. */
export function putTorsion(doc: Doc, m: Measure, d: TorsionData, at: Vec, id?: number): number {
  const old = id !== undefined ? doc.shapes.get(id) : undefined;
  if (old?.frame) {
    for (const x of old.frame.captions) doc.removeCaption(x);
    for (const x of old.frame.arrows) doc.removeArrow(x);
    for (const x of old.frame.shapes) doc.removeShape(x);
  }
  const parts = drawTorsion(doc, m, d, at);
  const pad = 0.3 * doc.style.bondLength;
  const frame: Frame = { atoms: [], captions: parts.captions, arrows: parts.arrows, shapes: parts.shapes, padX: pad, padY: pad, fit: true };
  const b = frameBox(doc, frame, m) ?? { x1: at.x, y1: at.y, x2: at.x + d.w, y2: at.y + d.h };
  if (old) { doc.updateShape(old.id, { ...b, frame, torsion: d }); return old.id; }
  return doc.addShape({ kind: 'geo', geo: 'rect', ...b, filled: false, lineWidth: 0, color: '#000000', frame, torsion: d, name: 'Torsional energy diagram' }).id;
}
