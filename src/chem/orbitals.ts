// Atomic and hybrid orbitals drawn on atoms (Chemistry ▸ Orbitals): s, p, d (cloverleaf and dz²)
// and sp/sp²/sp³ hybrids, as balloon-shaped lobes (design/geo.ts ORBITAL_LOBE) and ovals. The two
// phases are told apart by shading, by colour, or not at all, as the user picks. Each orbital is
// one group of ordinary shapes, so it can be recoloured, resized or taken apart; on an atom, its
// lobes are stuck to the atom (chem/pins.ts) and go where it goes.

import type { Shape } from '../model';
import type { Vec } from '../geom';
import { ORBITAL_LOBE } from '../design/geo';

export type OrbitalKind = 's' | 'p' | 'd' | 'dz2' | 'sp' | 'sp2' | 'sp3';
export type OrbitalLook = 'shaded' | 'colour' | 'outline';

export const ORBITAL_KINDS: { value: OrbitalKind; label: string }[] = [
  { value: 'p', label: 'p (two lobes)' },
  { value: 's', label: 's (sphere)' },
  { value: 'sp3', label: 'sp³ hybrid (big and small lobe)' },
  { value: 'sp2', label: 'sp² hybrid' },
  { value: 'sp', label: 'sp hybrid' },
  { value: 'd', label: 'd (cloverleaf: dxy, dx²−y², dxz, dyz)' },
  { value: 'dz2', label: 'dz² (two lobes and a ring)' },
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

/** The shapes of an orbital centred on `at` (in drawing order: the back lobe first). */
export function orbitalShapes(spec: OrbitalSpec, at: Vec): Omit<Shape, 'id'>[] {
  const a = spec.angle, L = spec.size;
  switch (spec.kind) {
    case 's': {
      const r = L * 0.42;
      return [{ kind: 'oval', x1: at.x - r, y1: at.y - r, x2: at.x + r, y2: at.y + r, ...phase(spec, 0) }];
    }
    case 'p':
      return [lobe(at, a + 180, L, phase(spec, 1)), lobe(at, a, L, phase(spec, 0))];
    case 'sp': case 'sp2': case 'sp3': {
      // the small back lobe shrinks with more s character: sp³ ¼, sp² ⅓, sp ½ of the front's length (drawn, not to scale)
      const back = spec.kind === 'sp3' ? 0.3 : spec.kind === 'sp2' ? 0.36 : 0.42;
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
 * An orbital's lobe (drawn here, or ChemDraw's orbital): it points a way from its atom, so it turns
 * when the drawing is turned, in a drawing as on a slide.
 */
export const isOrbitalPart = (s: Pick<Shape, 'kind' | 'geo' | 'orbital'>): boolean => (s.kind === 'geo' && s.geo === ORBITAL_LOBE) || (s.kind === 'oval' && !!s.orbital);

/** The middle of a shape's box (where a lobe is stuck to its atom from). */
export const shapeCentre = (s: Pick<Shape, 'x1' | 'y1' | 'x2' | 'y2'>): Vec => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
