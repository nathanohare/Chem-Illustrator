// TLC plates and electrophoresis gels (Insert ▸ TLC Plate…, Insert ▸ Gel…): lanes of spots or
// bands typed as short lists ("0.45, 0.2 faint streak"), drawn as ordinary boxes, ovals, lines and
// text inside an invisible frame that keeps the numbers, so double-clicking it opens them again
// and resizing it draws it again to fill the new box (as energy diagrams do). The colours of the
// plate and spots follow the stain or the gel's dye; every one is a choice in the window.

import type { Caption, Doc, Entity, Frame, Shape } from '../model';
import type { Rect, Vec } from '../geom';
import type { Measure } from '../editor/arrange';
import { frameBox, frameMembers } from '../editor/frames';
import { shapeBox } from '../objects';
import { chemRuns } from '../text/chemtext';
import { drawMo, MO_PRESETS, type MoSpec } from './mo';
import { drawCrystal, type CrystalSpec } from './xray';
import { isInkId } from './geo';

/** A TLC plate, a gel, or a molecular orbital diagram (design/mo.ts), which is kept and redrawn the same way. */
export type PlateKind = 'tlc' | 'gel' | 'mo' | 'crystal';

export interface PlateLane {
  /** Under a TLC lane or over a gel lane ("SM", "co", "P", "1"). */
  label: string;
  /** The spots (Rf) or bands (size) as typed: "0.45, 0.2 faint streak". */
  marks: string;
  /** A gel's size marker: its sizes are written beside the gel. */
  ladder?: boolean;
}

export interface PlateData {
  kind: PlateKind;
  lanes: PlateLane[];
  /** The stain (TLC_LOOKS) or the gel's dye (GEL_LOOKS). */
  look: string;
  /** The plate or gel's size in points. */
  w: number;
  h: number;
  /** TLC: write each spot's Rf beside it. */
  rf: boolean;
  /** TLC: the pencil lines at the start (origin) and the solvent front. */
  lines: boolean;
  /** Lane names. */
  labels: boolean;
  /** A line under a TLC plate (the eluent: "20% EtOAc/hexanes") or under a gel. */
  note: string;
  /** Gel: what the sizes are in, and whether the marker's sizes are written beside it. */
  unit: 'bp' | 'kb' | 'kDa';
  sizes: boolean;
  /** An MO diagram's levels and titles. */
  mo?: MoSpec;
  /** A crystal structure from a CIF file (kind 'crystal'). */
  crystal?: CrystalSpec;
  /** How far the plate sits inside its frame on each side, as last drawn. */
  margins?: { l: number; t: number; r: number; b: number };
}

/** One spot or band read from a lane's text. */
export interface PlateMark {
  /** Rf (TLC) or size (gel). */
  at: number;
  /** 0 (barely there) to 1. */
  strength: number;
  /** Width relative to the usual. */
  size: number;
  /** TLC: how far it streaks down, in Rf. */
  tail: number;
  color?: string;
}

export interface TlcLook { id: string; name: string; plate: string; spot: string; /** Drawn as in a notebook: outlines only. */ outline?: boolean }
export interface GelLook { id: string; name: string; gel: string; band: string; well: string }

export const TLC_LOOKS: TlcLook[] = [
  { id: 'pencil', name: 'Notebook sketch (circled spots)', plate: '#ffffff', spot: '#333333', outline: true },
  { id: 'uv', name: 'UV 254 nm (dark spots on green)', plate: '#d8f0cf', spot: '#4a3c6e' },
  { id: 'kmno4', name: 'KMnO₄ (yellow on purple)', plate: '#c27bb3', spot: '#f1d27b' },
  { id: 'anisaldehyde', name: 'p-Anisaldehyde (colored spots on pink)', plate: '#f7e8ec', spot: '#7b3c8f' },
  { id: 'cam', name: 'CAM / Hanessian\'s (blue spots)', plate: '#eef3fb', spot: '#22408c' },
  { id: 'pma', name: 'Phosphomolybdic acid (dark green on yellow-green)', plate: '#e9eec3', spot: '#2c4a3b' },
  { id: 'vanillin', name: 'Vanillin (colored spots on cream)', plate: '#fbf6e9', spot: '#4f5d8a' },
  { id: 'ninhydrin', name: 'Ninhydrin (purple spots)', plate: '#ffffff', spot: '#9a3b8c' },
  { id: 'iodine', name: 'Iodine (brown spots)', plate: '#fbf4d8', spot: '#8a5a2b' },
];

export const GEL_LOOKS: GelLook[] = [
  { id: 'etbr', name: 'DNA, ethidium bromide (orange on black)', gel: '#151517', band: '#ffd08a', well: '#3a3a3f' },
  { id: 'sybr', name: 'DNA, SYBR (green on black)', gel: '#111613', band: '#b4f59a', well: '#2f3a32' },
  { id: 'inverted', name: 'DNA, inverted (black on white)', gel: '#ffffff', band: '#1a1a1a', well: '#9a9a9a' },
  { id: 'coomassie', name: 'Protein, Coomassie (blue on pale)', gel: '#eef1f7', band: '#25368f', well: '#b9c0d6' },
  { id: 'silver', name: 'Protein, silver stain (brown on cream)', gel: '#f3efe4', band: '#3d3022', well: '#c9bfa8' },
];

/** Marker sizes to start a ladder lane from: common DNA and protein markers. */
export const LADDERS: { id: string; name: string; unit: PlateData['unit']; sizes: number[] }[] = [
  { id: '1kb', name: '1 kb DNA ladder (10 to 0.5 kb)', unit: 'kb', sizes: [10, 8, 6, 5, 4, 3, 2, 1.5, 1, 0.5] },
  { id: '100bp', name: '100 bp DNA ladder (1500 to 100 bp)', unit: 'bp', sizes: [1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100] },
  { id: 'protein', name: 'Protein marker (250 to 10 kDa)', unit: 'kDa', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10] },
];

const COLOURS: Record<string, string> = {
  red: '#c0392b', pink: '#d4588f', orange: '#e08a2e', yellow: '#e2c23b', green: '#3f8f4f', blue: '#2b5bb5',
  purple: '#7b3c8f', violet: '#6b4bb0', brown: '#8a5a2b', black: '#222222', grey: '#777777', gray: '#777777', white: '#ffffff',
};

/** The spots or bands in a lane's text: numbers, each with words after it (faint, strong, big, small, streak, a colour). */
export function parseMarks(text: string): PlateMark[] {
  const out: PlateMark[] = [];
  for (const part of text.split(/[,;\n]+/)) {
    const words = part.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const at = parseFloat(words[0].replace(',', '.'));
    if (!Number.isFinite(at) || at < 0) continue;
    const m: PlateMark = { at, strength: 0.85, size: 1, tail: 0 };
    for (const w of words.slice(1)) {
      if (/^(faint|weak|trace)$/.test(w)) m.strength = 0.4;
      else if (/^(strong|dark|heavy|intense)$/.test(w)) m.strength = 1;
      else if (/^(big|large|wide)$/.test(w)) m.size = 1.4;
      else if (/^(small|tiny)$/.test(w)) m.size = 0.65;
      else if (/^(streak|streaky|tail|tailing)$/.test(w)) m.tail = 0.12;
      else if (COLOURS[w]) m.color = COLOURS[w];
      else if (/^#[0-9a-f]{6}$/.test(w)) m.color = w;
    }
    out.push(m);
  }
  return out;
}

/** A colour part way from `a` (t = 0) to `b` (t = 1). */
export function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  const k = Math.max(0, Math.min(1, t));
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('');
}

/** Rf of a spot, as written: two decimals. */
export const rfText = (rf: number): string => rf.toFixed(2);

/** A size as written beside a marker (whole numbers stay whole: 1000, 1.5, 0.5). */
export const sizeText = (s: number): string => String(Number(s.toPrecision(4)));

/**
 * Where a band of `size` runs to, from 0 (the top of the run) to 1 (the bottom): log-linear,
 * as fragments run in a gel, between the largest and smallest sizes on it (with a little room).
 */
export function bandPosition(size: number, biggest: number, smallest: number): number {
  if (!(size > 0) || !(biggest > 0) || !(smallest > 0)) return 0.5;
  if (biggest <= smallest) return 0.5;
  const hi = Math.log10(biggest), lo = Math.log10(smallest), room = (hi - lo) * 0.06;
  return Math.max(0, Math.min(1, (hi + room - Math.log10(size)) / (hi - lo + 2 * room)));
}

export interface PlateParts { captions: number[]; arrows: number[]; shapes: number[] }

/** Starting lanes for a new plate or gel. */
export function newPlate(kind: PlateKind, L: number): PlateData {
  if (kind === 'crystal') return { kind, look: '', w: Math.round(20 * L), h: Math.round(14 * L), rf: false, lines: false, labels: true, note: '', unit: 'bp', sizes: false, lanes: [] };
  if (kind === 'mo') {
    const spec = MO_PRESETS[0].spec;
    return { kind, look: '', w: Math.round(14 * L), h: Math.round(12 * L), rf: false, lines: false, labels: true, note: '', unit: 'bp', sizes: false, lanes: [], mo: { ...spec, levels: spec.levels.map((l) => ({ ...l })), labelBack: 'white' } };
  }
  if (kind === 'tlc') {
    return {
      kind, look: 'pencil', w: Math.round(9 * L), h: Math.round(11 * L), rf: true, lines: true, labels: true, note: '', unit: 'bp', sizes: true,
      lanes: [{ label: 'SM', marks: '0.55' }, { label: 'co', marks: '0.55, 0.30' }, { label: 'rxn', marks: '0.55 faint, 0.30' }],
    };
  }
  const ladder = LADDERS[0];
  return {
    kind, look: 'etbr', w: Math.round(12 * L), h: Math.round(11 * L), rf: false, lines: false, labels: true, note: '', unit: ladder.unit, sizes: true,
    lanes: [{ label: 'M', marks: ladder.sizes.join(', '), ladder: true }, { label: '1', marks: '3' }, { label: '2', marks: '3, 1.2 faint' }],
  };
}

/**
 * Draw the plate or gel with its top left corner at `at`. Returns what was made (the caller puts
 * it in a frame). Call inside an edit.
 */
export function drawPlate(doc: Doc, m: Measure, d: PlateData, at: Vec): PlateParts {
  if (d.kind === 'mo') return d.mo ? drawMo(doc, m, d.mo, at, d.w, d.h) : { captions: [], arrows: [], shapes: [] };
  if (d.kind === 'crystal') return d.crystal ? drawCrystal(doc, m, d.crystal, at, d.w, d.h) : { captions: [], arrows: [], shapes: [] };
  const out: PlateParts = { captions: [], arrows: [], shapes: [] };
  const lw = doc.style.lineWidth, L = doc.style.bondLength;
  const n = Math.max(1, d.lanes.length);
  const laneW = d.w / n;
  const x = (k: number) => at.x + (k + 0.5) * laneW;
  const gap = 0.3 * L;
  const caption = (text: string, target: Vec, anchor: 'above' | 'below' | 'left' | 'right', extra: Partial<Caption> = {}, color?: string): Rect => {
    const runs = chemRuns(text).map((r) => (color ? { ...r, color } : r));
    const c = doc.addCaption({ x: 0, y: 0, runs, justify: 'left', chem: false, ...extra });
    const b = m.captionBox(c);
    const w = b.x2 - b.x1, h = b.y2 - b.y1;
    const want = anchor === 'above' ? { x: target.x - w / 2, y: target.y - h } : anchor === 'below' ? { x: target.x - w / 2, y: target.y }
      : anchor === 'left' ? { x: target.x - w, y: target.y - h / 2 } : { x: target.x, y: target.y - h / 2 };
    doc.updateCaption(c.id, { x: want.x - b.x1, y: want.y - b.y1 });
    out.captions.push(c.id);
    return m.captionBox(doc.captions.get(c.id)!);
  };
  const shape = (s: Omit<Shape, 'id'>) => out.shapes.push(doc.addShape(s).id);

  if (d.kind === 'tlc') {
    const look = TLC_LOOKS.find((t) => t.id === d.look) ?? TLC_LOOKS[0];
    shape({ kind: 'rect', x1: at.x, y1: at.y, x2: at.x + d.w, y2: at.y + d.h, filled: look.plate !== '#ffffff', fillColor: look.plate, color: '#000000' });
    const origin = at.y + d.h * 0.88, front = at.y + d.h * 0.08;
    if (d.lines) {
      shape({ kind: 'line', x1: at.x, y1: origin, x2: at.x + d.w, y2: origin, color: '#6b6b6b', lineWidth: lw * 0.6 });
      shape({ kind: 'line', x1: at.x, y1: front, x2: at.x + d.w, y2: front, color: '#6b6b6b', lineWidth: lw * 0.6, dashed: true });
    }
    const yOf = (rf: number) => origin - Math.max(0, Math.min(1, rf)) * (origin - front);
    const r0 = Math.min(laneW * 0.2, 0.45 * L);
    const small = { size: Math.round(doc.style.captionSize * 0.8 * 10) / 10 };
    d.lanes.forEach((lane, k) => {
      const cx = x(k);
      for (const s of parseMarks(lane.marks)) {
        const rx = r0 * s.size, ry = rx * 0.72;
        const top = yOf(s.at) - ry, bottom = yOf(Math.max(0, s.at - s.tail)) + ry;
        const ink = s.color ?? look.spot;
        if (look.outline) {
          shape({ kind: 'oval', x1: cx - rx, y1: top, x2: cx + rx, y2: bottom, color: ink, dashed: s.strength < 0.6, lineWidth: lw });
        } else {
          shape({ kind: 'oval', x1: cx - rx, y1: top, x2: cx + rx, y2: bottom, filled: true, fillColor: mix(look.plate, ink, s.strength), color: mix(look.plate, ink, s.strength), lineWidth: 0 });
        }
        if (d.rf) {
          // (beside the spot, in its lane: lanes are wide enough for "0.45" at 80 % size)
          caption(rfText(s.at), { x: cx + rx + gap * 0.4, y: yOf(s.at) }, 'right', { runs: [{ text: rfText(s.at), ...small }] });
        }
      }
    });
    let bottom = at.y + d.h + gap * 0.6;
    if (d.labels) {
      let lowest = bottom;
      d.lanes.forEach((lane, k) => { if (lane.label.trim()) lowest = Math.max(lowest, caption(lane.label.trim(), { x: x(k), y: bottom }, 'below').y2); });
      bottom = lowest + gap * 0.4;
    }
    if (d.note.trim()) caption(d.note.trim(), { x: at.x + d.w / 2, y: bottom }, 'below');
    return out;
  }

  // a gel: wells along the top, bands run down by size (log scale), marker sizes on the left
  const look = GEL_LOOKS.find((g) => g.id === d.look) ?? GEL_LOOKS[0];
  shape({ kind: 'rect', x1: at.x, y1: at.y, x2: at.x + d.w, y2: at.y + d.h, filled: true, fillColor: look.gel, color: look.gel === '#ffffff' ? '#000000' : look.gel, lineWidth: look.gel === '#ffffff' ? lw : 0 });
  const lanes = d.lanes.map((l) => ({ lane: l, marks: parseMarks(l.marks) }));
  const all = lanes.flatMap((l) => l.marks.map((q) => q.at)).filter((v) => v > 0);
  const biggest = all.length ? Math.max(...all) : 1, smallest = all.length ? Math.min(...all) : 1;
  const runTop = at.y + d.h * 0.11, runBottom = at.y + d.h * 0.95;
  const yOf = (size: number) => runTop + bandPosition(size, biggest, smallest) * (runBottom - runTop);
  const wellW = laneW * 0.66, wellH = Math.max(lw * 2, d.h * 0.035);
  const bandH = Math.max(lw * 2, d.h * 0.018);
  lanes.forEach(({ marks }, k) => {
    const cx = x(k);
    shape({ kind: 'rect', x1: cx - wellW / 2, y1: at.y + d.h * 0.04, x2: cx + wellW / 2, y2: at.y + d.h * 0.04 + wellH, filled: true, fillColor: look.well, color: look.well, lineWidth: 0 });
    for (const b of marks) {
      const h = bandH * b.size, y = yOf(b.at);
      const ink = mix(look.gel, b.color ?? look.band, b.strength);
      shape({ kind: 'rect', x1: cx - (wellW / 2) * 0.97, y1: y - h / 2, x2: cx + (wellW / 2) * 0.97, y2: y + h / 2, filled: true, fillColor: ink, color: ink, lineWidth: 0, rounded: true, radius: h / 2 });
    }
  });
  if (d.sizes) {
    // the marker lanes' sizes, down the left side (one column for every marker)
    const marked = new Set<number>();
    for (const { lane, marks } of lanes) if (lane.ladder) for (const q of marks) marked.add(q.at);
    let left = at.x - gap * 0.5;
    if (marked.size) {
      let widest = 0;
      // top to bottom; a size whose label would sit on the one above is left out (its band still shows)
      let below = -Infinity;
      for (const s of [...marked].sort((p, q) => q - p)) {
        const y = yOf(s);
        if (y - below < doc.style.captionSize * 0.95) continue;
        const r = caption(sizeText(s), { x: left, y }, 'left');
        below = y;
        widest = Math.max(widest, r.x2 - r.x1);
      }
      caption(d.unit, { x: left - widest / 2, y: runTop - gap * 1.2 }, 'above');
      left -= widest;
    }
  }
  if (d.labels) d.lanes.forEach((lane, k) => { if (lane.label.trim()) caption(lane.label.trim(), { x: x(k), y: at.y - gap * 0.4 }, 'above'); });
  if (d.note.trim()) caption(d.note.trim(), { x: at.x + d.w / 2, y: at.y + d.h + gap * 0.6 }, 'below');
  return out;
}

/** Where the plate goes in its frame's box, and its size (when drawn again, or resized by hand). */
export function plateFromBox(b: Rect, d: PlateData, L: number): { at: Vec; w: number; h: number } {
  const g = d.margins ?? { l: 0.3 * L, t: 0.3 * L, r: 0.3 * L, b: 0.3 * L };
  return { at: { x: b.x1 + g.l, y: b.y1 + g.t }, w: Math.max(2 * L, b.x2 - b.x1 - g.l - g.r), h: Math.max(2 * L, b.y2 - b.y1 - g.t - g.b) };
}

/**
 * Draw a plate in a frame of its own with its top left at `at`, or draw the one in frame `id`
 * again (what it drew before goes; structures and pictures put on it stay). Returns the frame's
 * id. Call inside an edit.
 */
export function putPlate(doc: Doc, m: Measure, d: PlateData, at: Vec, id?: number): number {
  const old = id !== undefined ? doc.shapes.get(id) : undefined;
  const kept: Pick<Frame, 'atoms' | 'shapes'> = { atoms: [], shapes: [] };
  if (old?.frame) {
    const f = old.frame;
    for (const c of f.captions) doc.removeCaption(c);
    for (const r of f.arrows) doc.removeArrow(r);
    for (const s of f.shapes) {
      const sh = doc.shapes.get(s);
      if (sh && (sh.kind === 'line' || sh.kind === 'rect' || sh.kind === 'oval' || (sh.kind === 'geo' && isInkId(sh.geo)))) doc.removeShape(s); else if (sh) kept.shapes.push(s);
    }
    kept.atoms = f.atoms.filter((a) => doc.atoms.has(a));
  }
  const parts = drawPlate(doc, m, d, at);
  const pad = 0.3 * doc.style.bondLength;
  const frame: Frame = { atoms: kept.atoms, captions: parts.captions, arrows: parts.arrows, shapes: [...parts.shapes, ...kept.shapes], padX: pad, padY: pad, fit: true };
  const b = frameBox(doc, frame, m) ?? { x1: at.x, y1: at.y, x2: at.x + d.w, y2: at.y + d.h };
  const r = (v: number) => Math.round(v * 100) / 100;
  const plate: PlateData = { ...d, margins: { l: r(at.x - b.x1), t: r(at.y - b.y1), r: r(b.x2 - at.x - d.w), b: r(b.y2 - at.y - d.h) } };
  const name = d.kind === 'tlc' ? 'TLC plate' : d.kind === 'gel' ? 'Gel' : d.kind === 'crystal' ? 'Crystal structure' : 'MO diagram';
  if (old) { doc.updateShape(old.id, { ...b, frame, plate }); return old.id; }
  return doc.addShape({ kind: 'geo', geo: 'rect', ...b, filled: false, lineWidth: 0, color: '#000000', frame, plate, name }).id;
}

/** The plate or gel a thing belongs to (its frame's id), if any. */
export function plateFrameOf(doc: Doc, kind: 'atom' | 'bond' | 'caption' | 'arrow' | 'shape', id: number): number | null {
  if (kind === 'shape' && doc.shapes.get(id)?.plate) return id;
  for (const s of doc.shapes.values()) {
    if (!s.plate || !s.frame) continue;
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

/** At the end of a change: a plate whose frame was resized by hand is drawn again to fill it. */
export function refitPlates(doc: Doc, before: ReadonlyMap<string, Entity | null>, m: Measure): void {
  for (const s of [...doc.shapes.values()]) {
    if (!s.plate || !s.frame) continue;
    const old = before.get('s' + s.id) as Shape | null | undefined;
    if (!old) continue;
    const a = shapeBox(old), b = shapeBox(s);
    if (Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) + Math.abs(a.x2 - b.x2) + Math.abs(a.y2 - b.y2) < 1e-6) continue;
    const f = s.frame;
    const touched = f.captions.some((id) => before.has('c' + id)) || f.arrows.some((id) => before.has('r' + id)) || f.shapes.some((id) => before.has('s' + id));
    if (touched) continue;
    const p = plateFromBox(b, s.plate, doc.style.bondLength);
    putPlate(doc, m, { ...s.plate, w: p.w, h: p.h }, p.at, s.id);
  }
}
