// Depth shading: in a structure drawn in 3-D (turned with the Perspective tools, placed from the
// 3-D Model window, or a conformer template), the atoms and bonds nearest the reader are drawn
// in the near colour (black), fading to the far colour (grey) the further back they lie, and
// the lines can thin with depth too. Each structure is shaded over its own depth, nearest to
// furthest. An app setting (like the ends of bond lines), not saved with drawings; pictures
// copied or exported are drawn the same way, so they keep the shading.

import type { Doc } from '../model';

export interface DepthShade {
  on: boolean;
  /** Colour of the nearest atoms and bonds, and of the furthest (#rrggbb). */
  near: string;
  far: string;
  /** How the colour changes with depth: evenly, or eased (slow at both ends, quicker in the middle). */
  curve: 'linear' | 'eased';
  /** Lines thin with depth, down to `thinTo` of their width at the back. */
  thin: boolean;
  thinTo: number;
}

/** Black in front to 60% grey at the back, evenly, lines kept their width (Nate's defaults, 2026-11-02). */
export const DEFAULT_DEPTH_SHADE: DepthShade = { on: false, near: '#000000', far: '#999999', curve: 'linear', thin: false, thinTo: 0.6 };

export const depthShadePrefs: DepthShade = { ...DEFAULT_DEPTH_SHADE };

/** The colours and widths are drawn in this many steps (each step one batch of lines). */
export const SHADE_STEPS = 16;

/** Reads a saved setting, filling in what is missing or wrong. */
export function readDepthShade(v: unknown): DepthShade {
  const r = (v && typeof v === 'object' ? v : {}) as Partial<DepthShade>;
  const hex = (c: unknown, d: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : d);
  return {
    on: r.on === true,
    near: hex(r.near, DEFAULT_DEPTH_SHADE.near),
    far: hex(r.far, DEFAULT_DEPTH_SHADE.far),
    curve: r.curve === 'eased' ? 'eased' : 'linear',
    thin: r.thin === true,
    thinTo: typeof r.thinTo === 'number' && isFinite(r.thinTo) ? Math.max(0.1, Math.min(1, r.thinTo)) : DEFAULT_DEPTH_SHADE.thinTo,
  };
}

/** A structure flatter than this (a fraction of the bond length, front to back) isn't shaded. */
const MIN_RANGE = 0.3;

const cache = new WeakMap<Doc, { version: number; back: Map<number, number> }>();

/**
 * How far back each atom of a structure with depth lies: 0 at its structure's nearest atom, 1 at
 * its furthest. Atoms of a structure that is flat, or has no depth, are left out (not shaded);
 * an atom without a depth in a structure that has one (drawn on after a turn) counts as halfway.
 */
export function depthFractions(doc: Doc): Map<number, number> {
  const had = cache.get(doc);
  if (had && had.version === doc.version) return had.back;
  const back = new Map<number, number>();
  const seen = new Set<number>();
  const L = doc.style.bondLength || 14.4;
  for (const a of doc.atoms.values()) {
    if (a.depth === undefined || seen.has(a.id)) continue;
    const frag = doc.fragmentOf(a.id);
    let lo = Infinity, hi = -Infinity;
    for (const id of frag) {
      seen.add(id);
      const d = doc.atoms.get(id)!.depth;
      if (d === undefined) continue;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (hi - lo < MIN_RANGE * L) continue;
    for (const id of frag) {
      const d = doc.atoms.get(id)!.depth;
      back.set(id, d === undefined ? 0.5 : (hi - d) / (hi - lo));
    }
  }
  cache.set(doc, { version: doc.version, back });
  return back;
}

/** The step (0 nearest … SHADE_STEPS − 1 furthest) for how far back something lies. */
export const shadeStep = (back: number): number => Math.max(0, Math.min(SHADE_STEPS - 1, Math.round(back * (SHADE_STEPS - 1))));

const rgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** The colour and line width (a fraction of the usual) for a step. */
export function shadeLook(step: number, s: DepthShade = depthShadePrefs): { color: string; width: number } {
  const t = step / (SHADE_STEPS - 1);
  const f = s.curve === 'eased' ? t * t * (3 - 2 * t) : t;
  const a = rgb(s.near), b = rgb(s.far);
  const color = '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join('');
  return { color, width: s.thin ? 1 - (1 - s.thinTo) * f : 1 };
}
