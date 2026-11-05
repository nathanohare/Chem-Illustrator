// Atomic and hybrid orbitals drawn on atoms (Chemistry ▸ Orbitals): s, p, d (cloverleaf and dz²),
// sp/sp²/sp³ hybrids and single lobes, as balloon-shaped lobes (design/geo.ts ORBITAL_LOBE) and
// ovals. The two phases are told apart by shading, by colour, or not at all, as the user picks.
// Each orbital is one group of ordinary shapes, so it can be recoloured, resized or taken apart;
// on an atom, its lobes are stuck to the atom (chem/pins.ts) and go and turn where it goes. Each
// part remembers how its orbital was asked for (Shape.orb), so the orbital can be changed later.

import type { Doc, OrbitalTag, Shape } from '../model';
import type { Vec } from '../geom';
import { ORBITAL_LOBE } from '../design/geo';
import { makePin, shapeAxis } from './pins';

export type OrbitalKind = 's' | 'p' | 'd' | 'dz2' | 'sp' | 'sp2' | 'sp3' | 'lobe';
export type OrbitalLook = 'shaded' | 'colour' | 'outline';

export const ORBITAL_KINDS: { value: OrbitalKind; label: string }[] = [
  { value: 'p', label: 'p (two lobes)' },
  { value: 's', label: 's (sphere)' },
  { value: 'sp3', label: 'sp³ hybrid (big and small lobe)' },
  { value: 'sp2', label: 'sp² hybrid' },
  { value: 'sp', label: 'sp hybrid' },
  { value: 'd', label: 'd (cloverleaf: dxy, dx²−y², dxz, dyz)' },
  { value: 'dz2', label: 'dz² (two lobes and a ring)' },
  { value: 'lobe', label: 'Single lobe' },
];

export const ORBITAL_LOOKS: { value: OrbitalLook; label: string }[] = [
  { value: 'shaded', label: 'One phase shaded gray' },
  { value: 'colour', label: 'Phases in two colors' },
  { value: 'outline', label: 'Outlines only (no phases)' },
];

export interface OrbitalSpec {
  kind: OrbitalKind;
  look: OrbitalLook;
  /** Which way the first (shaded) lobe points: degrees clockwise from straight up. */
  angle: number;
  /** A lobe's length, in points. */
  size: number;
  /** The two phases' colours, for the colour look. */
  colours?: [string, string];
  /** Swap the phases (the shaded lobe at the other end). */
  flip?: boolean;
}

export const PHASE_COLOURS: [string, string] = ['#3b6fb6', '#d0453b'];

/** How one phase is filled and outlined in a look. */
function phase(spec: OrbitalSpec, which: 0 | 1): Partial<Shape> {
  const k = (spec.flip ? 1 - which : which) as 0 | 1;
  if (spec.look === 'outline') return { filled: true, fillColor: '#ffffff', color: '#000000' };
  if (spec.look === 'colour') {
    const c = (spec.colours ?? PHASE_COLOURS)[k];
    return { filled: true, fillColor: c, color: c, transparency: 0.35 };
  }
  return { filled: true, fillColor: k === 0 ? '#9a9a9a' : '#ffffff', color: '#000000' };
}

/** A lobe of length `len` with its point at `at`, pointing `angle` degrees clockwise from up. */
function lobe(at: Vec, angle: number, len: number, fill: Partial<Shape>): Omit<Shape, 'id'> {
  const w = len * 0.62;
  const r = (angle * Math.PI) / 180;
  // the box's middle is half a lobe out from the point
  const cx = at.x + Math.sin(r) * (len / 2), cy = at.y - Math.cos(r) * (len / 2);
  const rot = ((angle % 360) + 360) % 360;
  return { kind: 'geo', geo: ORBITAL_LOBE, x1: cx - w / 2, y1: cy - len / 2, x2: cx + w / 2, y2: cy + len / 2, ...(rot ? { rot } : {}), ...fill };
}

/** How much shorter a hybrid's small back lobe is than its front one (drawn, not to scale). */
const BACK: Record<string, number> = { sp3: 0.3, sp2: 0.36, sp: 0.42 };

/** What each part of an orbital remembers. */
function tagOf(spec: OrbitalSpec, part: number): OrbitalTag {
  return { kind: spec.kind, look: spec.look, ...(spec.flip ? { flip: true } : {}), ...(spec.colours ? { colours: spec.colours } : {}), part };
}

/** The shapes of an orbital centred on `at` (in drawing order: the back lobe first), each tagged with how it was asked for. */
export function orbitalShapes(spec: OrbitalSpec, at: Vec): Omit<Shape, 'id'>[] {
  return untaggedShapes(spec, at).map((sh, part) => ({ ...sh, orb: tagOf(spec, part) }));
}

function untaggedShapes(spec: OrbitalSpec, at: Vec): Omit<Shape, 'id'>[] {
  const a = spec.angle, L = spec.size;
  switch (spec.kind) {
    case 's': {
      const r = L * 0.42;
      return [{ kind: 'oval', x1: at.x - r, y1: at.y - r, x2: at.x + r, y2: at.y + r, ...phase(spec, 0) }];
    }
    case 'p':
      return [lobe(at, a + 180, L, phase(spec, 1)), lobe(at, a, L, phase(spec, 0))];
    case 'lobe':
      return [lobe(at, a, L, phase(spec, 0))];
    case 'sp': case 'sp2': case 'sp3': {
      // the small back lobe shrinks with more s character: sp³ ¼, sp² ⅓, sp ½ of the front's length (drawn, not to scale)
      const back = BACK[spec.kind];
      return [lobe(at, a + 180, L * back, phase(spec, 1)), lobe(at, a, L, phase(spec, 0))];
    }
    case 'd':
      return [45, 135, 225, 315].map((t, i) => lobe(at, a + t, L * 0.85, phase(spec, (i % 2) as 0 | 1)));
    case 'dz2': {
      const rw = L * 0.62, rh = L * 0.2;
      const ring: Omit<Shape, 'id'> = { kind: 'oval', x1: at.x - rw, y1: at.y - rh, x2: at.x + rw, y2: at.y + rh, ...(a % 360 ? { rot: ((a % 360) + 360) % 360 } : {}), ...phase(spec, 1) };
      return [ring, lobe(at, a + 180, L, phase(spec, 0)), lobe(at, a, L, phase(spec, 0))];
    }
  }
}

/**
 * A part of an orbital (a lobe drawn here, the ring of a dz², or ChemDraw's orbital): it points a
 * way from its atom, so it turns when the drawing is turned, in a drawing as on a slide.
 */
export const isOrbitalPart = (s: Pick<Shape, 'kind' | 'geo' | 'orbital' | 'orb'>): boolean => (s.kind === 'geo' && s.geo === ORBITAL_LOBE) || (s.kind === 'oval' && (!!s.orbital || !!s.orb));

/** The middle of a shape's box (where a lobe is stuck to its atom from). */
export const shapeCentre = (s: Pick<Shape, 'x1' | 'y1' | 'x2' | 'y2'>): Vec => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });

const KINDS = new Set<string>(ORBITAL_KINDS.map((k) => k.value));
const LOOKS = new Set<string>(ORBITAL_LOOKS.map((k) => k.value));

/** A lobe's turn from its orbital's angle and its length as a share of the lobe length; null for the sphere of an s and the ring of a dz². */
function lobeOf(kind: OrbitalKind, part: number): { off: number; k: number } | null {
  switch (kind) {
    case 's': return null;
    case 'lobe': return { off: 0, k: 1 };
    case 'p': return part === 0 ? { off: 180, k: 1 } : { off: 0, k: 1 };
    case 'sp': case 'sp2': case 'sp3': return part === 0 ? { off: 180, k: BACK[kind] } : { off: 0, k: 1 };
    case 'd': return { off: [45, 135, 225, 315][part] ?? 45, k: 0.85 };
    case 'dz2': return part === 0 ? null : part === 1 ? { off: 180, k: 1 } : { off: 0, k: 1 };
  }
}

const degrees = (d: number) => { const r = Math.round((((d % 360) + 360) % 360) * 1e4) / 1e4; return r === 360 ? 0 : r; };

/**
 * An orbital read back from its parts: how it was asked for, with the angle, size and middle the
 * shapes have now (turned, resized or moved by hand since). Null when they aren't an orbital's.
 */
export function readOrbital(parts: Shape[]): { spec: OrbitalSpec; at: Vec } | null {
  const tagged = parts.filter((s) => s.orb && KINDS.has(s.orb.kind));
  if (!tagged.length) return null;
  const t = tagged[0].orb!;
  const kind = t.kind as OrbitalKind;
  const base = { kind, look: (LOOKS.has(t.look) ? t.look : 'shaded') as OrbitalLook, ...(t.flip ? { flip: true } : {}), ...(t.colours ? { colours: t.colours } : {}) };
  // a lobe tells the angle, the size and the middle (its point)
  const lobe = tagged.find((s) => s.kind === 'geo' && lobeOf(kind, s.orb!.part));
  if (lobe) {
    const g = lobeOf(kind, lobe.orb!.part)!;
    const len = Math.abs(lobe.y2 - lobe.y1), r = ((lobe.rot ?? 0) * Math.PI) / 180, mid = shapeCentre(lobe);
    return { spec: { ...base, angle: degrees((lobe.rot ?? 0) - g.off), size: len / g.k }, at: { x: mid.x - (Math.sin(r) * len) / 2, y: mid.y + (Math.cos(r) * len) / 2 } };
  }
  // an s orbital's sphere (or a dz²'s ring on its own): its middle, and its size across
  const o = tagged[0];
  const half = Math.abs(o.x2 - o.x1) / 2;
  return { spec: { ...base, angle: kind === 'dz2' ? degrees(o.rot ?? 0) : 0, size: half / (kind === 's' ? 0.42 : 0.62) }, at: shapeCentre(o) };
}

/** The parts of the orbital the shape `id` is part of (the parts grouped with it), or none. */
export function orbitalParts(doc: Doc, id: number): Shape[] {
  const s = doc.shapes.get(id);
  if (!s?.orb) return [];
  if (s.grp === undefined) return [s];
  return [...doc.shapes.values()].filter((x) => x.grp === s.grp && x.orb?.kind === s.orb!.kind);
}

/** The atom an orbital's parts are stuck to, if any. */
export function orbitalAtom(doc: Doc, parts: Shape[]): number | undefined {
  const id = parts.find((s) => s.pin?.on === 'atom')?.pin?.ref[0];
  return id !== undefined && doc.atoms.has(id) ? id : undefined;
}

/** A group number no one has yet. */
function newGroup(doc: Doc): number {
  let top = 0;
  for (const m of [doc.atoms, doc.captions, doc.arrows, doc.shapes] as Map<number, { grp?: number }>[]) for (const e of m.values()) if (e.grp !== undefined && e.grp > top) top = e.grp;
  return top + 1;
}

/**
 * Put an orbital in the drawing (inside an edit), centred on `at`: grouped when it has more than
 * one part, and stuck to `atom` when given. Returns the ids of its parts.
 */
export function putOrbital(doc: Doc, spec: OrbitalSpec, at: Vec, atom?: number, grp?: number): number[] {
  const shapes = orbitalShapes(spec, at);
  const g = grp ?? (shapes.length > 1 ? newGroup(doc) : undefined);
  return shapes.map((sh) => {
    const pin = atom !== undefined ? makePin(doc, 'atom', [atom], shapeCentre(sh), shapeAxis(sh)) ?? undefined : undefined;
    return doc.addShape({ ...sh, ...(g !== undefined ? { grp: g } : {}), ...(pin ? { pin } : {}) }).id;
  });
}

/**
 * Draw an orbital again with other settings (inside an edit): its parts give way to new ones in
 * the same place, group and drawing layer, on the same atom. Returns the new parts' ids.
 */
export function redrawOrbital(doc: Doc, parts: Shape[], spec: OrbitalSpec): number[] {
  const now = readOrbital(parts);
  if (!now) return [];
  const atom = orbitalAtom(doc, parts);
  const at = atom !== undefined ? doc.atoms.get(atom)! : now.at;
  const keep = parts[0];
  const grp = keep.grp;
  for (const s of parts) doc.removeShape(s.id);
  const ids = putOrbital(doc, spec, { x: at.x, y: at.y }, atom, grp);
  // in front of or behind other things as it was
  if (keep.stack !== undefined || keep.z !== undefined) for (const id of ids) doc.updateShape(id, { ...(keep.stack !== undefined ? { stack: keep.stack } : {}), ...(keep.z !== undefined ? { z: keep.z } : {}) });
  return ids;
}

/** The orbitals among these shapes, each as its parts (an orbital is listed once, however many of its parts are given). */
export function orbitalsAmong(doc: Doc, ids: Iterable<number>): Shape[][] {
  const out: Shape[][] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const parts = orbitalParts(doc, id);
    if (!parts.length) continue;
    for (const s of parts) seen.add(s.id);
    out.push(parts);
  }
  return out;
}

/** The orbital types with short names, for the Style panel. */
export const ORBITAL_KIND_NAMES: { value: OrbitalKind; label: string }[] = [
  { value: 'p', label: 'p' }, { value: 's', label: 's' }, { value: 'sp3', label: 'sp³ hybrid' }, { value: 'sp2', label: 'sp² hybrid' }, { value: 'sp', label: 'sp hybrid' },
  { value: 'd', label: 'd (cloverleaf)' }, { value: 'dz2', label: 'dz²' }, { value: 'lobe', label: 'Single lobe' },
];

/** The phase looks with short names, for the Style panel. */
export const ORBITAL_LOOK_NAMES: { value: OrbitalLook; label: string }[] = [
  { value: 'shaded', label: 'One phase shaded' }, { value: 'colour', label: 'Two colors' }, { value: 'outline', label: 'Outlines only' },
];

/** An angle typed in a Pointing box: degrees clockwise from up, or 'auto' (blank or "Auto"). */
export function readAngle(text: string | undefined): number | 'auto' {
  const t = (text ?? '').trim().replace(/°$/, '').trim();
  if (!t || /^auto/i.test(t)) return 'auto';
  const v = Number(t);
  return Number.isFinite(v) ? degrees(v) : 'auto';
}

/** Degrees clockwise from up for a direction. */
export const angleOfDir = (d: Vec): number => degrees((Math.atan2(d.x, -d.y) * 180) / Math.PI);

/**
 * The middle of the widest gap between these directions out of an atom (its bonds and what
 * already sits round it): where a single lobe goes. Straight up with nothing round it.
 */
export function openDirection(dirs: Vec[]): Vec {
  const angles = dirs.filter((d) => Math.hypot(d.x, d.y) > 1e-9).map((d) => Math.atan2(d.y, d.x)).sort((a, b) => a - b);
  if (!angles.length) return { x: 0, y: -1 };
  let best = angles[0] + Math.PI, widest = -1;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i], b = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    // ties go to the gap nearest straight up
    const gap = b - a, mid = (a + b) / 2;
    const up = Math.abs(Math.atan2(Math.sin(mid + Math.PI / 2), Math.cos(mid + Math.PI / 2)));
    const bestUp = Math.abs(Math.atan2(Math.sin(best + Math.PI / 2), Math.cos(best + Math.PI / 2)));
    if (gap > widest + 1e-6 || (Math.abs(gap - widest) <= 1e-6 && up < bestUp)) { widest = gap; best = mid; }
  }
  return { x: Math.cos(best), y: Math.sin(best) };
}

/** Which ways out of an atom are taken: its bonds, and lone pairs, charges and orbital lobes sitting round it. */
export function takenDirections(doc: Doc, atomId: number): Vec[] {
  const a = doc.atoms.get(atomId);
  if (!a) return [];
  const L = doc.style.bondLength;
  const out: Vec[] = [];
  for (const n of doc.neighbors(atomId)) out.push({ x: n.x - a.x, y: n.y - a.y });
  for (const s of doc.shapes.values()) {
    const mine = s.pin?.on === 'atom' && s.pin.ref[0] === atomId;
    if (!mine && s.kind !== 'symbol') continue;
    const c = shapeCentre(s);
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    if (d < 0.05 * L || (!mine && d > 0.8 * L)) continue;
    out.push({ x: c.x - a.x, y: c.y - a.y });
  }
  return out;
}
