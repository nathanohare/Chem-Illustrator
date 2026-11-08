// Design mode's shape library: basic shapes, block arrows, flowchart symbols, callouts and lab
// equipment, each drawn from its box (x, y, w, h) as lines and Bézier curves, so the same
// outline goes to the screen, SVG, PDF and EMF pictures, and PowerPoint. Shapes PowerPoint has
// as a preset are saved as that preset (so PowerPoint can still edit them as its own); the
// others (lab equipment, our callouts) are saved as PowerPoint custom shapes with these outlines.
// The lab equipment is drawn here, from simple outlines (no outside artwork).

import type { Rect, Vec } from '../geom';
import type { Shape } from '../model';
import { iconDef, isIconId } from './icons';

export type GeoStep =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export type GeoGroup = 'Basic shapes' | 'Block arrows' | 'Flowchart' | 'Callouts' | 'Action buttons' | 'Lab equipment' | 'Icons' | 'Ink' | 'Orbitals';

export const GEO_GROUPS: GeoGroup[] = ['Basic shapes', 'Block arrows', 'Flowchart', 'Callouts', 'Action buttons', 'Lab equipment'];

export interface GeoOutline {
  /** The shape's outline, filled and stroked. */
  body: GeoStep[];
  /** Details drawn as lines only, on top (a cylinder's rim, a flask's graduation marks). */
  lines?: GeoStep[];
}

export interface GeoDef {
  id: string;
  name: string;
  group: GeoGroup;
  /** PowerPoint's preset with the same look, when there is one. */
  prst?: string;
  /** Size a shape is when clicked onto the page (points). */
  size: [number, number];
  /** Drawn as an outline with no fill unless one is chosen (glassware). */
  outline?: boolean;
  /** An icon (design/icons.ts): filled in one colour with no outline unless one is chosen. */
  icon?: boolean;
  /** Words to find it by in the library's search box. */
  keywords?: string;
  draw(w: number, h: number): GeoOutline;
  /** Where text inside goes, as fractions of the box (left, top, right, bottom). */
  text?: [number, number, number, number];
}

// ---------------------------------------------------------------- building outlines

/** Bézier constant for a quarter circle. */
const K = 0.5522847498;

/** Points joined by lines, closed. */
function poly(pts: [number, number][], closed = true): GeoStep[] {
  const out: GeoStep[] = pts.map(([x, y], i) => [i ? 'L' : 'M', x, y] as GeoStep);
  if (closed) out.push(['Z']);
  return out;
}

/** An arc of an ellipse from angle a0 to a1 (radians, clockwise on the screen as y points down), as Bézier curves; starts with a line to its first point unless `move`. */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, move = false): GeoStep[] {
  const out: GeoStep[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
  const da = (a1 - a0) / n;
  const k = (4 / 3) * Math.tan(da / 4);
  let x0 = cx + rx * Math.cos(a0), y0 = cy + ry * Math.sin(a0);
  out.push([move ? 'M' : 'L', x0, y0]);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * da, t1 = t0 + da;
    const x3 = cx + rx * Math.cos(t1), y3 = cy + ry * Math.sin(t1);
    out.push(['C', x0 - k * rx * Math.sin(t0), y0 + k * ry * Math.cos(t0), x3 + k * rx * Math.sin(t1), y3 - k * ry * Math.cos(t1), x3, y3]);
    x0 = x3; y0 = y3;
  }
  return out;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): GeoStep[] {
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry],
    ['C', cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy],
    ['C', cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry],
    ['C', cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy],
    ['Z'],
  ];
}

function roundRect(x: number, y: number, w: number, h: number, r: number): GeoStep[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    ['M', x + r, y], ['L', x + w - r, y], ...arc(x + w - r, y + r, r, r, -Math.PI / 2, 0).slice(1),
    ['L', x + w, y + h - r], ...arc(x + w - r, y + h - r, r, r, 0, Math.PI / 2).slice(1),
    ['L', x + r, y + h], ...arc(x + r, y + h - r, r, r, Math.PI / 2, Math.PI).slice(1),
    ['L', x, y + r], ...arc(x + r, y + r, r, r, Math.PI, 1.5 * Math.PI).slice(1),
    ['Z'],
  ];
}

/** Points of a regular star or polygon fitted to the box. */
function star(w: number, h: number, n: number, inner: number | null): [number, number][] {
  const pts: [number, number][] = [];
  const m = inner === null ? n : 2 * n;
  for (let i = 0; i < m; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / m;
    const r = inner !== null && i % 2 ? inner : 1;
    pts.push([w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)]);
  }
  // fill the box from top to bottom (a five-pointed star's lowest points are above the bottom of a circle)
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return pts.map(([x, y]) => [x, ((y - lo) / Math.max(1e-6, hi - lo)) * h]);
}

/** Scale an outline drawn in a 0…1 square to w × h. */
// ---------------------------------------------------------------- glassware pieces (unit box)

/** The open top of a neck at x, from its flared lip at `top` down to where the lip ends: `out` is -1 for the left wall, 1 for the right; the lip reaches fx out and fy down. Starts the path. */
function lipDown(x: number, out: -1 | 1, top = 0, fx = 0.035, fy = fx): GeoStep[] {
  return [['M', x + out * fx, top], ['L', x, top + fy]];
}

/** The same lip, climbing the wall at x to the top (ends the wall). */
function lipUp(x: number, out: -1 | 1, top = 0, fx = 0.035, fy = fx): GeoStep[] {
  return [['L', x, top + fy], ['L', x + out * fx, top]];
}

/** A liquid's level across an elliptical bulb, at height y. */
function chord(cx: number, cy: number, rx: number, ry: number, y: number): GeoStep[] {
  const d = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  return [['M', cx - d, y], ['L', cx + d, y]];
}

/** A stopcock on a vertical stem: a barrel (half-width rw, half-height rh) round it and a key to the right. */
function stopcock(cx: number, cy: number, rw: number, rh: number, reach: number): GeoStep[] {
  return [
    ...poly([[cx - rw, cy - rh], [cx + rw, cy - rh], [cx + rw, cy + rh], [cx - rw, cy + rh]]),
    ['M', cx + rw, cy], ['L', cx + rw + reach, cy], ['M', cx + rw + reach, cy - 1.6 * rh], ['L', cx + rw + reach, cy + 1.6 * rh],
  ];
}

/** Where a cubic Bézier (four points) crosses height y, as x (by sampling: close enough for a liquid level). */
function cubicXAtY(p: [number, number][], y: number): number {
  let best = p[0][0], err = Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    const py = k.reduce((a, c, j) => a + c * p[j][1], 0);
    if (Math.abs(py - y) < err) { err = Math.abs(py - y); best = k.reduce((a, c, j) => a + c * p[j][0], 0); }
  }
  return best;
}

function scaled(steps: GeoStep[], w: number, h: number): GeoStep[] {
  return steps.map((s) => {
    if (s[0] === 'Z') return s;
    if (s[0] === 'C') return ['C', s[1] * w, s[2] * h, s[3] * w, s[4] * h, s[5] * w, s[6] * h];
    return [s[0], s[1] * w, s[2] * h];
  });
}

// ---------------------------------------------------------------- the library

const ss = (w: number, h: number) => Math.min(w, h);

export const GEOS: GeoDef[] = [
  // ---- basic shapes
  { id: 'rect', name: 'Rectangle', group: 'Basic shapes', prst: 'rect', size: [108, 72], keywords: 'box square', draw: (w, h) => ({ body: poly([[0, 0], [w, 0], [w, h], [0, h]]) }) },
  { id: 'roundRect', name: 'Rounded rectangle', group: 'Basic shapes', prst: 'roundRect', size: [108, 72], keywords: 'box rounded', draw: (w, h) => ({ body: roundRect(0, 0, w, h, 0.16667 * ss(w, h)) }) },
  { id: 'ellipse', name: 'Oval', group: 'Basic shapes', prst: 'ellipse', size: [90, 72], keywords: 'circle ellipse round', draw: (w, h) => ({ body: ellipse(w / 2, h / 2, w / 2, h / 2) }), text: [0.15, 0.15, 0.85, 0.85] },
  { id: 'triangle', name: 'Triangle', group: 'Basic shapes', prst: 'triangle', size: [86, 72], draw: (w, h) => ({ body: poly([[w / 2, 0], [w, h], [0, h]]) }), text: [0.25, 0.5, 0.75, 0.95] },
  { id: 'rtTriangle', name: 'Right triangle', group: 'Basic shapes', prst: 'rtTriangle', size: [72, 72], draw: (w, h) => ({ body: poly([[0, 0], [w, h], [0, h]]) }), text: [0.06, 0.55, 0.55, 0.95] },
  { id: 'diamond', name: 'Diamond', group: 'Basic shapes', prst: 'diamond', size: [90, 72], keywords: 'rhombus', draw: (w, h) => ({ body: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }), text: [0.25, 0.25, 0.75, 0.75] },
  { id: 'parallelogram', name: 'Parallelogram', group: 'Basic shapes', prst: 'parallelogram', size: [108, 64], draw: (w, h) => { const o = 0.25 * ss(w, h); return { body: poly([[o, 0], [w, 0], [w - o, h], [0, h]]) }; }, text: [0.2, 0.08, 0.8, 0.92] },
  { id: 'trapezoid', name: 'Trapezoid', group: 'Basic shapes', prst: 'trapezoid', size: [108, 64], draw: (w, h) => { const o = 0.25 * ss(w, h); return { body: poly([[o, 0], [w - o, 0], [w, h], [0, h]]) }; }, text: [0.2, 0.08, 0.8, 0.92] },
  { id: 'pentagon', name: 'Pentagon', group: 'Basic shapes', prst: 'pentagon', size: [76, 72], draw: (w, h) => ({ body: poly(star(w, h, 5, null)) }), text: [0.2, 0.25, 0.8, 0.85] },
  { id: 'hexagon', name: 'Hexagon', group: 'Basic shapes', prst: 'hexagon', size: [86, 72], draw: (w, h) => { const o = 0.25 * ss(w, h); return { body: poly([[o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h], [0, h / 2]]) }; }, text: [0.18, 0.1, 0.82, 0.9] },
  { id: 'octagon', name: 'Octagon', group: 'Basic shapes', prst: 'octagon', size: [72, 72], keywords: 'stop', draw: (w, h) => { const o = 0.29289 * ss(w, h); return { body: poly([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]) }; }, text: [0.15, 0.15, 0.85, 0.85] },
  { id: 'star5', name: 'Star', group: 'Basic shapes', prst: 'star5', size: [76, 72], draw: (w, h) => ({ body: poly(star(w, h, 5, 0.382)) }), text: [0.3, 0.38, 0.7, 0.75] },
  { id: 'plus', name: 'Cross', group: 'Basic shapes', prst: 'plus', size: [72, 72], keywords: 'plus', draw: (w, h) => { const o = 0.25 * ss(w, h); return { body: poly([[o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o], [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o]]) }; }, text: [0.25, 0.25, 0.75, 0.75] },
  {
    id: 'can', name: 'Cylinder', group: 'Basic shapes', prst: 'can', size: [72, 90], keywords: 'database drum',
    draw: (w, h) => {
      const ry = 0.125 * ss(w, h);
      return {
        body: [['M', 0, ry], ['L', 0, h - ry], ...arc(w / 2, h - ry, w / 2, ry, Math.PI, 0).slice(1), ['L', w, ry], ...arc(w / 2, ry, w / 2, ry, 0, -Math.PI).slice(1), ['Z']],
        lines: arc(w / 2, ry, w / 2, ry, Math.PI, 0, true),
      };
    },
    text: [0.05, 0.3, 0.95, 0.9],
  },
  {
    id: 'cloud', name: 'Cloud', group: 'Basic shapes', prst: 'cloud', size: [108, 72], keywords: 'thought idea',
    draw: (w, h) => {
      // round bumps of a few sizes on an oval, meeting in dips: each bump is near a half circle
      // standing on the chord between two points of the oval (worked in a unit square, then stretched)
      const steps = [1, 0.8, 1.15, 0.9, 1.2, 0.85, 1.05, 0.95, 1.1, 0.9];
      const total = steps.reduce((x, y) => x + y, 0);
      const pts: Vec[] = [];
      let a = -Math.PI / 2;
      for (const st of steps) {
        pts.push({ x: 0.5 + 0.36 * Math.cos(a), y: 0.5 + 0.34 * Math.sin(a) });
        a += (st / total) * 2 * Math.PI;
      }
      const out: GeoStep[] = [['M', pts[0].x * w, pts[0].y * h]];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        // outward, going clockwise on the screen
        const nx = q.y - p.y, ny = p.x - q.x;
        const k = 0.75;
        out.push(['C', (p.x + nx * k) * w, (p.y + ny * k) * h, (q.x + nx * k) * w, (q.y + ny * k) * h, q.x * w, q.y * h]);
      }
      out.push(['Z']);
      // keep it inside its box
      return { body: fitSteps(out, w, h) };
    },
    text: [0.2, 0.2, 0.8, 0.8],
  },
  {
    id: 'heart', name: 'Heart', group: 'Basic shapes', prst: 'heart', size: [76, 72],
    draw: (w, h) => ({ body: scaled([['M', 0.5, 0.25], ['C', 0.5, 0.05, 0.15, -0.05, 0.03, 0.2], ['C', -0.08, 0.45, 0.25, 0.7, 0.5, 1], ['C', 0.75, 0.7, 1.08, 0.45, 0.97, 0.2], ['C', 0.85, -0.05, 0.5, 0.05, 0.5, 0.25], ['Z']], w, h) }),
    text: [0.2, 0.2, 0.8, 0.7],
  },
  // ---- block arrows
  { id: 'rightArrow', name: 'Right arrow', group: 'Block arrows', prst: 'rightArrow', size: [108, 54], draw: (w, h) => { const a = Math.min(w, 0.5 * ss(w, h) * 2) / 2; return { body: poly([[0, h / 4], [w - a, h / 4], [w - a, 0], [w, h / 2], [w - a, h], [w - a, 3 * h / 4], [0, 3 * h / 4]]) }; }, text: [0.05, 0.25, 0.75, 0.75] },
  { id: 'leftArrow', name: 'Left arrow', group: 'Block arrows', prst: 'leftArrow', size: [108, 54], draw: (w, h) => { const a = Math.min(w, 0.5 * ss(w, h) * 2) / 2; return { body: poly([[w, h / 4], [a, h / 4], [a, 0], [0, h / 2], [a, h], [a, 3 * h / 4], [w, 3 * h / 4]]) }; }, text: [0.25, 0.25, 0.95, 0.75] },
  { id: 'upArrow', name: 'Up arrow', group: 'Block arrows', prst: 'upArrow', size: [54, 108], draw: (w, h) => { const a = Math.min(h, ss(w, h)) / 2; return { body: poly([[w / 4, h], [w / 4, a], [0, a], [w / 2, 0], [w, a], [3 * w / 4, a], [3 * w / 4, h]]) }; }, text: [0.25, 0.25, 0.75, 0.95] },
  { id: 'downArrow', name: 'Down arrow', group: 'Block arrows', prst: 'downArrow', size: [54, 108], draw: (w, h) => { const a = Math.min(h, ss(w, h)) / 2; return { body: poly([[w / 4, 0], [3 * w / 4, 0], [3 * w / 4, h - a], [w, h - a], [w / 2, h], [0, h - a], [w / 4, h - a]]) }; }, text: [0.25, 0.05, 0.75, 0.75] },
  { id: 'leftRightArrow', name: 'Left-right arrow', group: 'Block arrows', prst: 'leftRightArrow', size: [126, 54], keywords: 'double', draw: (w, h) => { const a = ss(w, h) / 2; return { body: poly([[0, h / 2], [a, 0], [a, h / 4], [w - a, h / 4], [w - a, 0], [w, h / 2], [w - a, h], [w - a, 3 * h / 4], [a, 3 * h / 4], [a, h]]) }; }, text: [0.2, 0.25, 0.8, 0.75] },
  { id: 'chevron', name: 'Chevron', group: 'Block arrows', prst: 'chevron', size: [90, 54], keywords: 'step process', draw: (w, h) => { const o = 0.5 * ss(w, h); return { body: poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]) }; }, text: [0.3, 0.1, 0.75, 0.9] },
  { id: 'homePlate', name: 'Pentagon arrow', group: 'Block arrows', prst: 'homePlate', size: [108, 54], keywords: 'step tag', draw: (w, h) => { const o = 0.5 * ss(w, h); return { body: poly([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]]) }; }, text: [0.05, 0.1, 0.75, 0.9] },
  // ---- flowchart
  { id: 'fcProcess', name: 'Process', group: 'Flowchart', prst: 'flowChartProcess', size: [108, 64], keywords: 'step', draw: (w, h) => ({ body: poly([[0, 0], [w, 0], [w, h], [0, h]]) }) },
  { id: 'fcAltProcess', name: 'Alternate process', group: 'Flowchart', prst: 'flowChartAlternateProcess', size: [108, 64], draw: (w, h) => ({ body: roundRect(0, 0, w, h, ss(w, h) / 6) }) },
  { id: 'fcDecision', name: 'Decision', group: 'Flowchart', prst: 'flowChartDecision', size: [108, 72], keywords: 'if question', draw: (w, h) => ({ body: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }), text: [0.25, 0.25, 0.75, 0.75] },
  { id: 'fcTerminator', name: 'Start or end', group: 'Flowchart', prst: 'flowChartTerminator', size: [108, 44], keywords: 'terminator begin finish', draw: (w, h) => ({ body: roundRect(0, 0, w, h, h / 2) }), text: [0.15, 0.1, 0.85, 0.9] },
  { id: 'fcData', name: 'Data (input or output)', group: 'Flowchart', prst: 'flowChartInputOutput', size: [108, 64], keywords: 'input output', draw: (w, h) => ({ body: poly([[w / 5, 0], [w, 0], [4 * w / 5, h], [0, h]]) }), text: [0.2, 0.08, 0.8, 0.92] },
  { id: 'fcPredefined', name: 'Predefined process', group: 'Flowchart', prst: 'flowChartPredefinedProcess', size: [108, 64], keywords: 'subroutine procedure', draw: (w, h) => ({ body: poly([[0, 0], [w, 0], [w, h], [0, h]]), lines: [['M', w / 8, 0], ['L', w / 8, h], ['M', 7 * w / 8, 0], ['L', 7 * w / 8, h]] }), text: [0.14, 0.05, 0.86, 0.95] },
  { id: 'fcDocument', name: 'Document', group: 'Flowchart', prst: 'flowChartDocument', size: [108, 72], keywords: 'report paper', draw: (w, h) => ({ body: scaled([['M', 0, 0], ['L', 1, 0], ['L', 1, 0.802], ['C', 0.5, 0.802, 0.5, 1.1075, 0, 0.9339], ['Z']], w, h) }), text: [0.05, 0.05, 0.95, 0.78] },
  { id: 'fcManualInput', name: 'Manual input', group: 'Flowchart', prst: 'flowChartManualInput', size: [108, 64], draw: (w, h) => ({ body: poly([[0, 0.2 * h], [w, 0], [w, h], [0, h]]) }), text: [0.05, 0.25, 0.95, 0.95] },
  { id: 'fcManualOperation', name: 'Manual operation', group: 'Flowchart', prst: 'flowChartManualOperation', size: [108, 64], draw: (w, h) => ({ body: poly([[0, 0], [w, 0], [0.8 * w, h], [0.2 * w, h]]) }), text: [0.2, 0.05, 0.8, 0.95] },
  { id: 'fcPreparation', name: 'Preparation', group: 'Flowchart', prst: 'flowChartPreparation', size: [108, 64], draw: (w, h) => ({ body: poly([[w / 5, 0], [4 * w / 5, 0], [w, h / 2], [4 * w / 5, h], [w / 5, h], [0, h / 2]]) }), text: [0.2, 0.05, 0.8, 0.95] },
  { id: 'fcDatabase', name: 'Stored data (database)', group: 'Flowchart', prst: 'flowChartMagneticDisk', size: [72, 86], keywords: 'database disk', draw: (w, h) => { const ry = h / 6; return { body: [['M', 0, ry], ['L', 0, h - ry], ...arc(w / 2, h - ry, w / 2, ry, Math.PI, 0).slice(1), ['L', w, ry], ...arc(w / 2, ry, w / 2, ry, 0, -Math.PI).slice(1), ['Z']], lines: arc(w / 2, ry, w / 2, ry, Math.PI, 0, true) }; }, text: [0.05, 0.38, 0.95, 0.9] },
  { id: 'fcDelay', name: 'Delay', group: 'Flowchart', prst: 'flowChartDelay', size: [90, 64], keywords: 'wait', draw: (w, h) => ({ body: [['M', 0, 0], ['L', w / 2, 0], ...arc(w / 2, h / 2, w / 2, h / 2, -Math.PI / 2, Math.PI / 2).slice(1), ['L', 0, h], ['Z']] }), text: [0.05, 0.15, 0.85, 0.85] },
  { id: 'fcConnector', name: 'Connector', group: 'Flowchart', prst: 'flowChartConnector', size: [36, 36], keywords: 'circle junction', draw: (w, h) => ({ body: ellipse(w / 2, h / 2, w / 2, h / 2) }), text: [0.15, 0.15, 0.85, 0.85] },
  { id: 'fcMerge', name: 'Merge', group: 'Flowchart', prst: 'flowChartMerge', size: [72, 60], keywords: 'triangle', draw: (w, h) => ({ body: poly([[0, 0], [w, 0], [w / 2, h]]) }), text: [0.25, 0.05, 0.75, 0.5] },
  // ---- callouts
  {
    id: 'calloutRect', name: 'Speech box', group: 'Callouts', size: [120, 72], keywords: 'callout note bubble speech',
    draw: (w, h) => {
      // a rounded box with a tail from its bottom edge (the box's steps: top, corner, right, corner, then the bottom edge)
      const b = 0.78 * h, box = roundRect(0, 0, w, b, 0.1 * ss(w, b));
      return { body: [...box.slice(0, 5), ['L', 0.38 * w, b], ['L', 0.2 * w, h], ['L', 0.24 * w, b], ...box.slice(5)] };
    },
    text: [0.05, 0.06, 0.95, 0.72],
  },
  {
    id: 'calloutOval', name: 'Speech bubble', group: 'Callouts', size: [120, 76], keywords: 'callout bubble speech',
    draw: (w, h) => {
      const b = 0.8 * h, rx = w / 2, ry = b / 2;
      // the oval, with a tail from its lower left
      const a0 = 0.62 * Math.PI, a1 = 0.72 * Math.PI;
      return { body: [...arc(rx, ry, rx, ry, a1, a0 + 2 * Math.PI, true), ['L', 0.18 * w, h], ['Z']] };
    },
    text: [0.15, 0.12, 0.85, 0.68],
  },
  {
    id: 'calloutThought', name: 'Thought bubble', group: 'Callouts', size: [120, 80], keywords: 'callout think idea',
    draw: (w, h) => {
      const main = GEO_BY_ID.get('cloud')!.draw(w, 0.78 * h).body;
      return { body: [...main, ...ellipse(0.2 * w, 0.86 * h, 0.05 * w, 0.045 * h), ...ellipse(0.1 * w, 0.96 * h, 0.03 * w, 0.03 * h)] };
    },
    text: [0.2, 0.15, 0.8, 0.65],
  },
  // ---- action buttons: a click in the slide show goes where the button says (Shape.link)
  ...actionButtons(),
  // ---- lab equipment (outlines; text goes beside them more often than in them). Each has a
  // flared lip where glass is open, a liquid level where it holds something, and stopcocks drawn
  // as a barrel and key, so a row of them reads as one set at any line width.
  {
    id: 'labRbf', name: 'Round-bottom flask', group: 'Lab equipment', outline: true, size: [54, 72], keywords: 'rbf flask reaction',
    draw: (w, h) => {
      // a neck with a lip, and a round bulb from where the neck meets it on the left, round the bottom, to the right
      // the bulb is as wide as the box and round at the usual size (54 × 72)
      const rx = 0.47, ry = 0.35, cy = 1 - ry - 0.008, nx = 0.1;
      const t = Math.asin(nx / rx);
      const y0 = cy - ry * Math.cos(t);
      return {
        body: scaled([...lipDown(0.5 - nx, -1), ['L', 0.5 - nx, y0], ...arc(0.5, cy, rx, ry, -Math.PI / 2 - t, -Math.PI / 2 + t - 2 * Math.PI).slice(1), ...lipUp(0.5 + nx, 1)], w, h),
        lines: scaled(chord(0.5, cy, rx, ry, cy + 0.3 * ry), w, h),
      };
    },
    text: [0.2, 0.5, 0.8, 0.9],
  },
  {
    id: 'labRbf3', name: 'Three-neck flask', group: 'Lab equipment', outline: true, size: [72, 72], keywords: 'three neck 3-neck round bottom flask reaction',
    draw: (w, h) => {
      const cx = 0.5, cy = 0.6, rx = 0.4, ry = 0.38;
      const at = (x: number) => -Math.acos((x - cx) / rx);
      const yAt = (x: number) => cy + ry * Math.sin(at(x));
      const side = 0.14;
      return {
        body: scaled([
          ...lipDown(0.18, -1, side), ...arc(cx, cy, rx, ry, at(0.18), at(0.82) - 2 * Math.PI), ...lipUp(0.82, 1, side),
          ...lipDown(0.72, -1, side), ['L', 0.72, yAt(0.72)], ...arc(cx, cy, rx, ry, at(0.72), at(0.56)).slice(1), ...lipUp(0.56, 1),
          ...lipDown(0.44, -1), ['L', 0.44, yAt(0.44)], ...arc(cx, cy, rx, ry, at(0.44), at(0.28)).slice(1), ...lipUp(0.28, 1, side),
        ], w, h),
        lines: scaled(chord(cx, cy, rx, ry, cy + 0.35 * ry), w, h),
      };
    },
    text: [0.2, 0.55, 0.8, 0.9],
  },
  {
    id: 'labErlenmeyer', name: 'Erlenmeyer flask', group: 'Lab equipment', outline: true, size: [54, 72], keywords: 'conical flask',
    draw: (w, h) => {
      const level = 0.72, x = 0.39 - ((level - 0.33) / 0.59) * 0.35;
      return {
        body: scaled([...lipDown(0.39, -1), ['L', 0.39, 0.33], ['L', 0.04, 0.92], ['C', 0.0, 0.99, 0.03, 1, 0.1, 1], ['L', 0.9, 1], ['C', 0.97, 1, 1.0, 0.99, 0.96, 0.92], ['L', 0.61, 0.33], ...lipUp(0.61, 1)], w, h),
        lines: scaled([['M', x, level], ['L', 1 - x, level]], w, h),
      };
    },
    text: [0.2, 0.6, 0.8, 0.95],
  },
  {
    id: 'labFilterFlask', name: 'Filter flask', group: 'Lab equipment', outline: true, size: [64, 72], keywords: 'buchner side arm vacuum filtration suction flask',
    draw: (w, h) => {
      const level = 0.8, x = 0.33 - ((level - 0.3) / 0.6) * 0.28;
      return {
        body: scaled([
          ...lipDown(0.33, -1), ['L', 0.33, 0.3], ['L', 0.05, 0.9], ['C', 0.02, 0.98, 0.04, 1, 0.1, 1], ['L', 0.74, 1], ['C', 0.8, 1, 0.82, 0.98, 0.79, 0.9],
          ['L', 0.51, 0.3], ['L', 0.51, 0.22], ['L', 0.98, 0.22], ['M', 0.98, 0.15], ['L', 0.51, 0.15], ...lipUp(0.51, 1),
        ], w, h),
        lines: scaled([['M', x, level], ['L', 0.84 - x, level], ['M', 0.9, 0.13], ['L', 0.9, 0.24]], w, h),
      };
    },
    text: [0.15, 0.6, 0.7, 0.95],
  },
  {
    id: 'labBeaker', name: 'Beaker', group: 'Lab equipment', outline: true, size: [54, 64], keywords: 'glass',
    draw: (w, h) => ({
      body: scaled([['M', 0.02, 0], ['L', 0.1, 0.06], ['L', 0.1, 0.95], ['C', 0.1, 0.99, 0.12, 1, 0.16, 1], ['L', 0.84, 1], ['C', 0.88, 1, 0.9, 0.99, 0.9, 0.95], ['L', 0.9, 0.04], ['L', 0.94, 0]], w, h),
      lines: scaled([['M', 0.1, 0.45], ['L', 0.9, 0.45], ['M', 0.72, 0.25], ['L', 0.9, 0.25], ['M', 0.78, 0.6], ['L', 0.9, 0.6], ['M', 0.72, 0.75], ['L', 0.9, 0.75]], w, h),
    }),
    text: [0.15, 0.4, 0.7, 0.95],
  },
  {
    id: 'labVial', name: 'Vial', group: 'Lab equipment', outline: true, size: [30, 64], keywords: 'sample bottle',
    draw: (w, h) => ({
      body: scaled([['M', 0.14, 0.2], ['L', 0.14, 0.95], ['C', 0.14, 0.99, 0.18, 1, 0.24, 1], ['L', 0.76, 1], ['C', 0.82, 1, 0.86, 0.99, 0.86, 0.95], ['L', 0.86, 0.2], ['Z']], w, h),
      lines: scaled([
        ['M', 0.1, 0.2], ['L', 0.1, 0.03], ['C', 0.1, 0.01, 0.12, 0, 0.15, 0], ['L', 0.85, 0], ['C', 0.88, 0, 0.9, 0.01, 0.9, 0.03], ['L', 0.9, 0.2], ['Z'],
        ['M', 0.32, 0.04], ['L', 0.32, 0.16], ['M', 0.5, 0.04], ['L', 0.5, 0.16], ['M', 0.68, 0.04], ['L', 0.68, 0.16],
        ['M', 0.14, 0.62], ['L', 0.86, 0.62],
      ], w, h),
    }),
    text: [0.15, 0.4, 0.85, 0.9],
  },
  {
    id: 'labTestTube', name: 'Test tube', group: 'Lab equipment', outline: true, size: [22, 72], keywords: 'tube',
    draw: (w, h) => ({
      body: [['M', 0, 0], ['L', 0.1 * w, 0.03 * h], ['L', 0.1 * w, h - 0.4 * w], ...arc(w / 2, h - 0.4 * w, 0.4 * w, 0.4 * w, Math.PI, 0).slice(1), ['L', 0.9 * w, 0.03 * h], ['L', w, 0]],
      lines: [['M', 0.1 * w, 0.62 * h], ['L', 0.9 * w, 0.62 * h]],
    }),
    text: [0.1, 0.4, 0.9, 0.9],
  },
  {
    id: 'labSepFunnel', name: 'Separatory funnel', group: 'Lab equipment', outline: true, size: [44, 90], keywords: 'extraction workup',
    draw: (w, h) => {
      // a pear-shaped bulb (the same curve on each side), a stopper, a stopcock and the boundary between the layers
      const left: [number, number][] = [[0.05, 0.37], [0.08, 0.49], [0.3, 0.63], [0.47, 0.72]];
      const xb = cubicXAtY(left, 0.47);
      return {
        body: scaled([
          ...lipDown(0.42, -1, 0.06), ['L', 0.42, 0.1], ['C', 0.14, 0.13, 0.02, 0.25, 0.05, 0.37], ['C', 0.08, 0.49, 0.3, 0.63, 0.47, 0.72], ['L', 0.47, 1],
          ['L', 0.53, 0.97], ['L', 0.53, 0.72], ['C', 0.7, 0.63, 0.92, 0.49, 0.95, 0.37], ['C', 0.98, 0.25, 0.86, 0.13, 0.58, 0.1], ...lipUp(0.58, 1, 0.06),
        ], w, h),
        lines: scaled([
          ['M', 0.44, 0.07], ['L', 0.44, 0.03], ['C', 0.44, 0.0, 0.56, 0.0, 0.56, 0.03], ['L', 0.56, 0.07],
          ['M', xb, 0.47], ['L', 1 - xb, 0.47],
          ...stopcock(0.5, 0.82, 0.11, 0.022, 0.14),
        ], w, h),
      };
    },
    text: [0.2, 0.2, 0.8, 0.45],
  },
  {
    id: 'labCondenser', name: 'Condenser', group: 'Lab equipment', outline: true, size: [36, 108], keywords: 'reflux water jacket liebig',
    draw: (w, h) => ({
      body: scaled([['M', 0.3, 0.15], ['C', 0.3, 0.13, 0.32, 0.12, 0.36, 0.12], ['L', 0.64, 0.12], ['C', 0.68, 0.12, 0.7, 0.13, 0.7, 0.15], ['L', 0.7, 0.85], ['C', 0.7, 0.87, 0.68, 0.88, 0.64, 0.88], ['L', 0.36, 0.88], ['C', 0.32, 0.88, 0.3, 0.87, 0.3, 0.85], ['Z']], w, h),
      lines: scaled([
        ['M', 0.38, 0], ['L', 0.42, 0.015], ['L', 0.42, 1], ['M', 0.62, 0], ['L', 0.58, 0.015], ['L', 0.58, 1],
        ['M', 0.7, 0.18], ['L', 0.98, 0.18], ['M', 0.7, 0.24], ['L', 0.98, 0.24], ['M', 0.3, 0.76], ['L', 0.02, 0.76], ['M', 0.3, 0.82], ['L', 0.02, 0.82],
      ], w, h),
    }),
    text: [0.3, 0.3, 0.7, 0.7],
  },
  {
    id: 'labColumn', name: 'Chromatography column', group: 'Lab equipment', outline: true, size: [30, 108], keywords: 'flash silica purification',
    draw: (w, h) => ({
      body: scaled([...lipDown(0.22, -1, 0, 0.08, 0.02), ['L', 0.22, 0.8], ['L', 0.44, 0.86], ['L', 0.44, 1], ['L', 0.56, 1], ['L', 0.56, 0.86], ['L', 0.78, 0.8], ...lipUp(0.78, 1, 0, 0.08, 0.02)], w, h),
      lines: scaled([
        // the solvent above, a layer of sand, the silica and sand under it
        ['M', 0.22, 0.1], ['L', 0.78, 0.1], ['M', 0.22, 0.3], ['L', 0.78, 0.3], ['M', 0.22, 0.34], ['L', 0.78, 0.34], ['M', 0.22, 0.74], ['L', 0.78, 0.74],
        ...stopcock(0.5, 0.92, 0.14, 0.017, 0.2),
      ], w, h),
    }),
    text: [0.2, 0.36, 0.8, 0.72],
  },
  {
    id: 'labTlc', name: 'TLC plate', group: 'Lab equipment', size: [44, 72], keywords: 'thin layer chromatography rf',
    draw: (w, h) => ({
      body: poly([[0, 0], [w, 0], [w, h], [0, h]]),
      lines: [['M', 0.08 * w, 0.85 * h], ['L', 0.92 * w, 0.85 * h], ['M', 0.08 * w, 0.1 * h], ['L', 0.92 * w, 0.1 * h], ...ellipse(0.3 * w, 0.35 * h, 0.07 * w, 0.04 * h), ...ellipse(0.7 * w, 0.55 * h, 0.07 * w, 0.04 * h)],
    }),
    text: [0.1, 0.12, 0.9, 0.83],
  },
  {
    id: 'labSyringe', name: 'Syringe', group: 'Lab equipment', outline: true, size: [108, 24], keywords: 'needle addition',
    draw: (w, h) => ({
      body: scaled([['M', 0.15, 0.25], ['L', 0.72, 0.25], ['L', 0.72, 0.75], ['L', 0.15, 0.75], ['Z']], w, h),
      lines: scaled([['M', 0.72, 0.4], ['L', 0.8, 0.4], ['L', 0.8, 0.6], ['L', 0.72, 0.6], ['M', 0.8, 0.5], ['L', 1, 0.5], ['M', 0.03, 0.5], ['L', 0.15, 0.5], ['M', 0.03, 0.1], ['L', 0.03, 0.9], ['M', 0.15, 0.1], ['L', 0.15, 0.9], ['M', 0.3, 0.25], ['L', 0.3, 0.45], ['M', 0.4, 0.25], ['L', 0.4, 0.45], ['M', 0.5, 0.25], ['L', 0.5, 0.45], ['M', 0.6, 0.25], ['L', 0.6, 0.45]], w, h),
    }),
    text: [0.17, 0.27, 0.7, 0.73],
  },
  {
    id: 'labStirPlate', name: 'Stirrer hot plate', group: 'Lab equipment', size: [90, 40], keywords: 'heat stir hotplate',
    draw: (w, h) => ({
      body: scaled([['M', 0.0, 0.3], ['L', 1, 0.3], ['L', 1, 1], ['L', 0, 1], ['Z']], w, h),
      lines: [...scaled([['M', 0.05, 0.3], ['L', 0.05, 0.12], ['L', 0.95, 0.12], ['L', 0.95, 0.3]], w, h), ...ellipse(0.25 * w, 0.65 * h, 0.07 * w, 0.14 * h), ...ellipse(0.75 * w, 0.65 * h, 0.07 * w, 0.14 * h)],
    }),
    text: [0.38, 0.4, 0.62, 0.9],
  },
  {
    id: 'labBath', name: 'Bath (dish)', group: 'Lab equipment', outline: true, size: [90, 40], keywords: 'ice oil water bath crystallizing dish',
    draw: (w, h) => ({ body: scaled([['M', 0, 0], ['L', 0, 0.9], ['C', 0, 0.97, 0.02, 1, 0.06, 1], ['L', 0.94, 1], ['C', 0.98, 1, 1, 0.97, 1, 0.9], ['L', 1, 0]], w, h), lines: scaled([['M', 0, 0.3], ['L', 1, 0.3]], w, h) }),
    text: [0.05, 0.35, 0.95, 0.95],
  },
  {
    id: 'labFunnel', name: 'Funnel', group: 'Lab equipment', outline: true, size: [54, 64], keywords: 'filter filtration',
    draw: (w, h) => ({
      body: scaled([['M', 0.02, 0], ['L', 0.44, 0.55], ['L', 0.44, 0.97], ['L', 0.56, 1], ['L', 0.56, 0.55], ['L', 0.98, 0]], w, h),
      // the folded filter paper
      lines: scaled([['M', 0.02, 0], ['L', 0.98, 0], ['M', 0.12, 0.06], ['L', 0.5, 0.5], ['L', 0.88, 0.06]], w, h),
    }),
    text: [0.2, 0.05, 0.8, 0.4],
  },
  {
    id: 'labBuchner', name: 'Büchner funnel', group: 'Lab equipment', outline: true, size: [54, 64], keywords: 'buchner buechner vacuum filtration suction filter',
    draw: (w, h) => ({
      body: scaled([['M', 0.02, 0], ['L', 0.02, 0.3], ['C', 0.02, 0.34, 0.06, 0.36, 0.12, 0.38], ['L', 0.42, 0.5], ['L', 0.44, 0.6], ['L', 0.44, 1], ['L', 0.56, 0.96], ['L', 0.56, 0.6], ['L', 0.58, 0.5], ['L', 0.88, 0.38], ['C', 0.94, 0.36, 0.98, 0.34, 0.98, 0.3], ['L', 0.98, 0]], w, h),
      // the perforated plate, with its holes
      lines: scaled([['M', 0.02, 0.24], ['L', 0.98, 0.24], ...[0.2, 0.35, 0.5, 0.65, 0.8].flatMap((x): GeoStep[] => [['M', x, 0.24], ['L', x, 0.3]])], w, h),
    }),
    text: [0.1, 0.02, 0.9, 0.22],
  },
];

/** Scale an outline so it just fits a w × h box. */
function fitSteps(steps: GeoStep[], w: number, h: number): GeoStep[] {
  const b = stepsBox(steps);
  const sx = w / Math.max(1e-6, b.x2 - b.x1), sy = h / Math.max(1e-6, b.y2 - b.y1);
  return steps.map((s) => {
    if (s[0] === 'Z') return s;
    if (s[0] === 'C') return ['C', (s[1] - b.x1) * sx, (s[2] - b.y1) * sy, (s[3] - b.x1) * sx, (s[4] - b.y1) * sy, (s[5] - b.x1) * sx, (s[6] - b.y1) * sy];
    return [s[0], (s[1] - b.x1) * sx, (s[2] - b.y1) * sy];
  });
}

// ---------------------------------------------------------------- pyramid layers (diagrams)

const SLICE = 'slice:';

/** A pyramid's layer: a trapezium cut in from each side by `a` of its width (at its narrow end: the top when a > 0, the bottom when a < 0). */
export function sliceId(a: number): string {
  return SLICE + (Math.round(a * 10000) / 10000);
}

export const isSliceId = (id: string | undefined): id is string => !!id && id.startsWith(SLICE);

/** The library shape for a layer of a pyramid. */
export function sliceDef(id: string): GeoDef {
  const v = Number(id.slice(SLICE.length));
  const a = Math.max(0, Math.min(0.5, Math.abs(isFinite(v) ? v : 0)));
  const up = !(v < 0);
  // the text where the layer is widest enough: lower down in a narrow top layer
  // (a pointed layer, the top of a pyramid, has its words in its lower half, a little past its sloping sides)
  const t = a > 0.45 ? 0.5 : a > 0.3 ? 0.4 : 0.08;
  const side = a > 0.45 ? 0.2 : a * (1 - t) + 0.03;
  return {
    id, name: 'Pyramid layer', group: 'Basic shapes', size: [120, 40],
    draw: (w, h) => ({
      body: up
        ? [['M', a * w, 0], ['L', (1 - a) * w, 0], ['L', w, h], ['L', 0, h], ['Z']]
        : [['M', 0, 0], ['L', w, 0], ['L', (1 - a) * w, h], ['L', a * w, h], ['Z']],
    }),
    text: up ? [side, t, 1 - side, 0.94] : [side, 0.06, 1 - side, 1 - t],
  };
}

// ---------------------------------------------------------------- ring segments and hexagon cells (diagrams)

// A ring segment's id carries its shape: "sector:<from>:<to>:<hole>", angles in degrees measured
// clockwise on screen from three o'clock, and the hole's radius as a part of the outer radius
// (0 makes a pie slice). Saved files keep the id, so the format stays as it is.
const SECTOR_PREFIX = 'sector:';
const DEG = Math.PI / 180;

/** The id of a ring segment from angle `from` to `to` (degrees), its hole `hole` of the outer radius. */
export function sectorId(from: number, to: number, hole: number): string {
  const hundredths = (v: number) => Math.round(v * 100) / 100;
  const holeAt = Math.round(Math.max(0, Math.min(0.95, hole)) * 1000) / 1000;
  return SECTOR_PREFIX + [hundredths(from), hundredths(to), holeAt].join(':');
}

export function isSectorId(id: string | undefined): id is string {
  return id?.startsWith(SECTOR_PREFIX) ?? false;
}

/** A segment's angles in radians and its hole, read back from its id (with safe values for a damaged one). */
function readSector(id: string): { a0: number; a1: number; k: number } {
  const [from, to, hole] = id.slice(SECTOR_PREFIX.length).split(':').map(Number);
  const start = Number.isFinite(from) ? from : 0;
  const end = Number.isFinite(to) && to > start ? Math.min(to, start + 359.9) : start + 90;
  return { a0: start * DEG, a1: end * DEG, k: Number.isFinite(hole) ? Math.min(0.95, Math.max(0, hole)) : 0.5 };
}

/** The box round a ring segment (angles in radians) centered on (0, 0) with an outer radius of 1. */
export function sectorBox(from: number, to: number, hole: number): Rect {
  const xs: number[] = [], ys: number[] = [];
  const add = (r: number, a: number) => { xs.push(r * Math.cos(a)); ys.push(r * Math.sin(a)); };
  for (const a of [from, to]) { add(1, a); add(hole, a); }
  // the outer edge bulges furthest wherever it crosses a quarter turn (right, down, left, up)
  const quarter = Math.PI / 2;
  for (let a = Math.ceil(from / quarter - 1e-9) * quarter; a <= to + 1e-9; a += quarter) add(1, a);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** The library shape for a ring segment, drawn to fill its own box. */
export function sectorDef(shapeId: string): GeoDef {
  const { a0, a1, k } = readSector(shapeId);
  const box = sectorBox(a0, a1, k);
  const wide = Math.max(1e-6, box.x2 - box.x1), tall = Math.max(1e-6, box.y2 - box.y1);
  // the words go in a rectangle at the middle of the segment, as long as the segment runs along
  // the ring and as deep as the ring is thick, turned the way the segment lies; it shrinks until
  // its corners are all inside (a segment lying slantwise holds less)
  const mid = (a0 + a1) / 2, rMid = (1 + k) / 2;
  const along = Math.min(rMid * (a1 - a0), 2 * rMid), deep = 1 - k || 1;
  const sin = Math.abs(Math.sin(mid)), cos = Math.abs(Math.cos(mid));
  const cx = rMid * Math.cos(mid), cy = rMid * Math.sin(mid);
  let half = { x: (0.45 * (sin * along + cos * deep)) / (sin + cos), y: (0.45 * (cos * along + sin * deep)) / (sin + cos) };
  /** Is a point inside the segment, with a little margin from its curved edges? */
  const inside = (x: number, y: number): boolean => {
    const dist = Math.hypot(x, y);
    if (dist > 0.98 || dist < k + 0.02) return false;
    const turn = 2 * Math.PI;
    return (((Math.atan2(y, x) - a0) % turn) + turn) % turn <= a1 - a0;
  };
  const cornersIn = () => [-1, 1].every((sx) => [-1, 1].every((sy) => inside(cx + sx * half.x, cy + sy * half.y)));
  for (let tries = 0; tries < 20 && !cornersIn(); tries++) half = { x: 0.9 * half.x, y: 0.9 * half.y };
  const u = (x: number) => Math.min(1, Math.max(0, (x - box.x1) / wide));
  const v = (y: number) => Math.min(1, Math.max(0, (y - box.y1) / tall));
  const hx = Math.max(0.03, half.x), hy = Math.max(0.03, half.y);
  const draw = (w: number, h: number) => {
    const sx = w / wide, sy = h / tall, ox = -box.x1 * sx, oy = -box.y1 * sy;
    const inner: GeoStep[] = k > 0 ? arc(ox, oy, k * sx, k * sy, a1, a0) : [['L', ox, oy]];
    return { body: [...arc(ox, oy, sx, sy, a0, a1, true), ...inner, ['Z'] as GeoStep] };
  };
  return { id: shapeId, name: 'Ring segment', group: 'Basic shapes', size: [100, 100], draw, text: [u(cx - hx), v(cy - hy), u(cx + hx), v(cy + hy)] };
}

/** A honeycomb's cell: a hexagon with flat top and bottom, regular when its box is 2 wide by √3 tall. */
export const HEX_CELL = 'cell:hex';

const honeycombCellDef: GeoDef = {
  id: HEX_CELL,
  name: 'Honeycomb cell',
  group: 'Basic shapes',
  size: [80, 69],
  // the corners from the left one, clockwise; the words keep clear of the slanted sides
  draw: (w, h) => ({ body: poly([0, 0.25, 0.75, 1, 0.75, 0.25].map((fx, i) => [fx * w, [0.5, 0, 0, 0.5, 1, 1][i] * h])) }),
  text: [1 / 6, 0.08, 5 / 6, 0.92],
};

/**
 * One lobe of an orbital (Chemistry ▸ Orbitals): a balloon whose point is at the bottom middle of
 * its box, where the nucleus is. Turned with `rot` to point any way; not in the shapes library.
 */
export const ORBITAL_LOBE = 'orbLobe';
GEOS.push({
  id: ORBITAL_LOBE, name: 'Orbital lobe', group: 'Orbitals', size: [22, 36], keywords: 'orbital lobe p',
  draw: (w, h) => ({
    body: scaled([['M', 0.5, 1], ['C', 0.36, 0.86, 0, 0.64, 0, 0.38], ['C', 0, 0.16, 0.22, 0, 0.5, 0], ['C', 0.78, 0, 1, 0.16, 1, 0.38], ['C', 1, 0.64, 0.64, 0.86, 0.5, 1], ['Z']], w, h),
  }),
});

export const GEO_BY_ID = new Map(GEOS.map((g) => [g.id, g]));

// ---------------------------------------------------------------- action buttons

/** Where each action button goes in the slide show when it is put on a slide (a link, see links.ts). */
export const ACTION_LINKS: Record<string, string> = {
  actBack: '#prev', actNext: '#next', actFirst: '#first', actLast: '#last', actHome: '#first', actReturn: '#return',
  actGrid: '#grid', actLook: '#look',
};

function actionButtons(): GeoDef[] {
  const box = (w: number, h: number) => poly([[0, 0], [w, 0], [w, h], [0, h]]);
  // the glyph in the middle, in a square of side g at (cx - g/2, cy - g/2)
  const glyph = (w: number, h: number, pts: [number, number][][]): GeoStep[] => {
    const g = 0.56 * Math.min(w, h), x0 = (w - g) / 2, y0 = (h - g) / 2;
    return pts.flatMap((p) => poly(p.map(([x, y]) => [x0 + x * g, y0 + y * g] as [number, number]), true));
  };
  const def = (id: string, name: string, prst: string | undefined, keywords: string, shape: [number, number][][]): GeoDef => ({
    id, name, group: 'Action buttons', prst, size: [54, 54], keywords: `action button slide show ${keywords}`,
    draw: (w, h) => ({ body: box(w, h), ...(shape.length ? { lines: glyph(w, h, shape) } : {}) }),
  });
  return [
    def('actBack', 'Back or previous', 'actionButtonBackPrevious', 'previous back left', [[[0.85, 0], [0.85, 1], [0.1, 0.5]]]),
    def('actNext', 'Forward or next', 'actionButtonForwardNext', 'next forward right', [[[0.15, 0], [0.9, 0.5], [0.15, 1]]]),
    def('actFirst', 'Beginning', 'actionButtonBeginning', 'first start', [[[0.95, 0], [0.95, 1], [0.3, 0.5]], [[0.08, 0], [0.2, 0], [0.2, 1], [0.08, 1]]]),
    def('actLast', 'End', 'actionButtonEnd', 'last end', [[[0.05, 0], [0.7, 0.5], [0.05, 1]], [[0.8, 0], [0.92, 0], [0.92, 1], [0.8, 1]]]),
    def('actHome', 'Home', 'actionButtonHome', 'home first house', [[[0.5, 0.02], [1, 0.5], [0.84, 0.5], [0.84, 1], [0.16, 1], [0.16, 0.5], [0, 0.5]]]),
    def('actReturn', 'Return', 'actionButtonReturn', 'return back last viewed', [[[0.15, 0.25], [0.45, 0], [0.45, 0.15], [0.75, 0.15], [0.95, 0.35], [0.95, 0.8], [0.75, 1], [0.35, 1], [0.35, 0.82], [0.72, 0.82], [0.78, 0.76], [0.78, 0.4], [0.72, 0.33], [0.45, 0.33], [0.45, 0.5]]]),
    def('actInfo', 'Information', 'actionButtonInformation', 'information info about', [[[0.42, 0.02], [0.58, 0.02], [0.58, 0.2], [0.42, 0.2]], [[0.42, 0.32], [0.58, 0.32], [0.58, 0.98], [0.42, 0.98]]]),
    def('actDoc', 'Document', 'actionButtonDocument', 'document file open', [[[0.18, 0], [0.62, 0], [0.82, 0.2], [0.82, 1], [0.18, 1]], [[0.62, 0], [0.62, 0.2], [0.82, 0.2]]]),
    def('actBlank', 'Blank action button', 'actionButtonBlank', 'blank custom', []),
    // the show's own (no PowerPoint button looks like these: they go to PowerPoint drawn as they are)
    def('actJump', 'Go to slide', undefined, 'jump go to slide number', [
      [[0, 0.12], [1, 0.12], [1, 0.22], [0, 0.22]], [[0, 0.78], [1, 0.78], [1, 0.88], [0, 0.88]], [[0, 0.12], [0.1, 0.12], [0.1, 0.88], [0, 0.88]], [[0.9, 0.12], [1, 0.12], [1, 0.88], [0.9, 0.88]],
      [[0.3, 0.32], [0.72, 0.5], [0.3, 0.68]]]),
    def('actGrid', 'Slide picker', undefined, 'grid thumbnails every slide picker overview', [
      [[0, 0], [0.44, 0], [0.44, 0.44], [0, 0.44]], [[0.56, 0], [1, 0], [1, 0.44], [0.56, 0.44]], [[0, 0.56], [0.44, 0.56], [0.44, 1], [0, 1]], [[0.56, 0.56], [1, 0.56], [1, 1], [0.56, 1]]]),
    def('actLook', 'Look around freely', undefined, 'look around free navigate pan zoom canvas', [
      [[0.44, 0.2], [0.56, 0.2], [0.56, 0.44], [0.8, 0.44], [0.8, 0.56], [0.56, 0.56], [0.56, 0.8], [0.44, 0.8], [0.44, 0.56], [0.2, 0.56], [0.2, 0.44], [0.44, 0.44]],
      [[0.5, 0], [0.66, 0.2], [0.34, 0.2]], [[0.5, 1], [0.34, 0.8], [0.66, 0.8]], [[0, 0.5], [0.2, 0.34], [0.2, 0.66]], [[1, 0.5], [0.8, 0.66], [0.8, 0.34]]]),
    def('actZoom', 'Zoom to a region', undefined, 'zoom region keyframe focus view canvas', [
      [[0, 0], [0.34, 0], [0.34, 0.1], [0.1, 0.1], [0.1, 0.34], [0, 0.34]], [[0.66, 0], [1, 0], [1, 0.34], [0.9, 0.34], [0.9, 0.1], [0.66, 0.1]],
      [[0, 0.66], [0.1, 0.66], [0.1, 0.9], [0.34, 0.9], [0.34, 1], [0, 1]], [[0.9, 0.66], [1, 0.66], [1, 1], [0.66, 1], [0.66, 0.9], [0.9, 0.9]],
      [[0.44, 0.3], [0.56, 0.3], [0.56, 0.44], [0.7, 0.44], [0.7, 0.56], [0.56, 0.56], [0.56, 0.7], [0.44, 0.7], [0.44, 0.56], [0.3, 0.56], [0.3, 0.44], [0.44, 0.44]]]),
  ];
}

// ---------------------------------------------------------------- ink

/**
 * Ink drawn with the pen or highlighter in the slide show and kept: a design shape whose id holds
 * its line, `ink:<width in points>:<x,y,x,y…>` with the points as ten-thousandths of the box, so it
 * moves and stretches with its box like any shape, and goes to PowerPoint as a freeform.
 */
export const isInkId = (id: string | undefined): id is string => !!id && id.startsWith('ink:');

/** The id for a line of ink: its points (in points on the slide) as fractions of its box. */
export function inkId(width: number, pts: Vec[], box: Rect): string {
  const w = Math.max(1e-6, box.x2 - box.x1), h = Math.max(1e-6, box.y2 - box.y1);
  const q = (v: number) => Math.max(0, Math.min(10000, Math.round(v * 10000)));
  return `ink:${+width.toFixed(2)}:${pts.map((p) => `${q((p.x - box.x1) / w)},${q((p.y - box.y1) / h)}`).join(',')}`;
}

/** A line `width` wide along points, as an outline to fill: round at its ends and turns. */
export function inkOutline(pts: Vec[], width: number): GeoStep[] {
  const r = width / 2;
  if (!pts.length) return [];
  const disc = (c: Vec): GeoStep[] => ellipse(c.x, c.y, r, r);
  if (pts.length === 1) return disc(pts[0]);
  const left: Vec[] = [], right: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    left.push({ x: pts[i].x + nx * r, y: pts[i].y + ny * r });
    right.push({ x: pts[i].x - nx * r, y: pts[i].y - ny * r });
  }
  // (wound the same way as the discs, so where they overlap stays filled: a canvas fills by winding)
  const band = poly([...right, ...left.reverse()].map((p) => [p.x, p.y] as [number, number]));
  // round ends (and round over its own turns: a disc at each sharp corner)
  const sharp: GeoStep[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const u = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y }, v = { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y };
    const cos = (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) || 1);
    if (cos < 0.5) sharp.push(...disc(pts[i]));
  }
  return [...band, ...disc(pts[0]), ...disc(pts[pts.length - 1]), ...sharp];
}

const inkDefs = new Map<string, GeoDef>();

/** The library shape for a line of ink. */
export function inkDef(id: string): GeoDef {
  let d = inkDefs.get(id);
  if (d) return d;
  const [, wTxt = '2', ptsTxt = ''] = id.split(':');
  const width = Math.max(0.1, Number(wTxt) || 2);
  const n = ptsTxt.split(',').map(Number);
  const rel: Vec[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) if (Number.isFinite(n[i]) && Number.isFinite(n[i + 1])) rel.push({ x: n[i] / 10000, y: n[i + 1] / 10000 });
  d = { id, name: 'Ink', group: 'Ink', size: [72, 72], draw: (w, h) => ({ body: inkOutline(rel.map((p) => ({ x: p.x * w, y: p.y * h })), width) }) };
  if (inkDefs.size > 500) inkDefs.clear();
  inkDefs.set(id, d);
  return d;
}

// ---------------------------------------------------------------- closed curves

/**
 * A closed curve from ChemDraw (a perspective ring's ellipse, a hand-drawn outline): a design
 * shape whose id holds its Bézier path, `path:<x,y,x,y…>` as ten-thousandths of its box: the start
 * point, then two handles and a point for each segment, the last ending back at the start.
 */
export const isPathId = (id: string | undefined): id is string => !!id && id.startsWith('path:');

/** The id for a closed Bézier path (points in points on the page) within its box. */
export function pathId(pts: Vec[], box: Rect): string {
  const w = Math.max(1e-6, box.x2 - box.x1), h = Math.max(1e-6, box.y2 - box.y1);
  const q = (v: number) => Math.round(v * 10000);
  return `path:${pts.map((p) => `${q((p.x - box.x1) / w)},${q((p.y - box.y1) / h)}`).join(',')}`;
}

const pathDefs = new Map<string, GeoDef>();

/** The library shape for a closed curve. */
export function pathDef(id: string): GeoDef {
  let d = pathDefs.get(id);
  if (d) return d;
  const n = id.slice(5).split(',').map(Number);
  const rel: Vec[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) if (Number.isFinite(n[i]) && Number.isFinite(n[i + 1])) rel.push({ x: n[i] / 10000, y: n[i + 1] / 10000 });
  d = {
    id, name: 'Freeform', group: 'Ink', size: [72, 72], outline: true,
    draw: (w, h) => {
      const at = (p: Vec) => [p.x * w, p.y * h] as const;
      const body: GeoStep[] = rel.length ? [['M', ...at(rel[0])]] : [];
      for (let i = 1; i + 2 < rel.length; i += 3) body.push(['C', ...at(rel[i]), ...at(rel[i + 1]), ...at(rel[i + 2])]);
      if (body.length) body.push(['Z']);
      return { body };
    },
  };
  if (pathDefs.size > 500) pathDefs.clear();
  pathDefs.set(id, d);
  return d;
}

/**
 * An open curve drawn with the Freeform pen: like a closed curve (`path:`) but its last segment
 * stays where it ends, `pen:<x,y,x,y…>`: the start point, then two handles and a point for each segment.
 */
export const isPenId = (id: string | undefined): id is string => !!id && id.startsWith('pen:');

/** A freeform's Bézier points (3n + 1) on the page and whether it is closed, as the id of its shape within `box`. */
export function freeformId(pts: Vec[], box: Rect, closed: boolean): string {
  return closed ? pathId(pts, box) : `pen:${pathId(pts, box).slice(5)}`;
}

/** A freeform's Bézier points on the page (start, then two handles and a point for each segment) and whether it is closed; null for other shapes. */
export function freeformPoints(s: { geo?: string; x1: number; y1: number; x2: number; y2: number }): { pts: Vec[]; closed: boolean } | null {
  const closed = isPathId(s.geo);
  if (!closed && !isPenId(s.geo)) return null;
  const n = s.geo!.slice(closed ? 5 : 4).split(',').map(Number);
  const x1 = Math.min(s.x1, s.x2), y1 = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
  const pts: Vec[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) if (Number.isFinite(n[i]) && Number.isFinite(n[i + 1])) pts.push({ x: x1 + (n[i] / 10000) * w, y: y1 + (n[i + 1] / 10000) * h });
  return pts.length >= 4 ? { pts, closed } : null;
}

/** The library shape for an open freeform curve. */
function penDef(id: string): GeoDef {
  let d = pathDefs.get(id);
  if (d) return d;
  const closed = pathDef(`path:${id.slice(4)}`);
  d = {
    id, name: 'Freeform', group: 'Ink', size: [72, 72], outline: true,
    draw: (w, h) => ({ body: closed.draw(w, h).body.filter((st) => st[0] !== 'Z') }),
  };
  if (pathDefs.size > 500) pathDefs.clear();
  pathDefs.set(id, d);
  return d;
}

/** The shape with this id (an icon for "icon:…"), or the rectangle for one not known (from a newer version). */
export const geoDef = (id: string | undefined): GeoDef => (isIconId(id) ? iconDef(id) : isSliceId(id) ? sliceDef(id) : isSectorId(id) ? sectorDef(id) : id === HEX_CELL ? honeycombCellDef : isInkId(id) ? inkDef(id) : isPathId(id) ? pathDef(id) : isPenId(id) ? penDef(id) : GEO_BY_ID.get(id ?? '')) ?? GEO_BY_ID.get('rect')!;

/** The box of an outline's points (control points included: a little generous on curves). */
export function stepsBox(steps: GeoStep[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const at = (x: number, y: number) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  for (const s of steps) {
    if (s[0] === 'M' || s[0] === 'L') at(s[1], s[2]);
    else if (s[0] === 'C') { at(s[1], s[2]); at(s[3], s[4]); at(s[5], s[6]); }
  }
  return x1 === Infinity ? { x1: 0, y1: 0, x2: 0, y2: 0 } : { x1, y1, x2, y2 };
}

/** The outline as polygons (curves cut into short lines), for hit testing. */
export function flatten(steps: GeoStep[], parts = 12): Vec[][] {
  const out: Vec[][] = [];
  let cur: Vec[] = [];
  let px = 0, py = 0;
  for (const s of steps) {
    if (s[0] === 'M') { if (cur.length) out.push(cur); cur = [{ x: s[1], y: s[2] }]; px = s[1]; py = s[2]; }
    else if (s[0] === 'L') { cur.push({ x: s[1], y: s[2] }); px = s[1]; py = s[2]; }
    else if (s[0] === 'C') {
      for (let i = 1; i <= parts; i++) {
        const t = i / parts, u = 1 - t;
        cur.push({
          x: u * u * u * px + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5],
          y: u * u * u * py + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6],
        });
      }
      px = s[5]; py = s[6];
    } else if (cur.length) { cur.push({ ...cur[0] }); out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Is p inside the outline (even-odd)? */
export function insideOutline(polys: Vec[][], p: Vec): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

/**
 * An outline's separate parts (each from a move to the next), outermost first, with how many
 * other parts each lies inside: an even count is filled, an odd one is a hole (even-odd). For
 * formats that fill each part on its own (ChemDraw curves), holes are painted over in white.
 * Each part comes back closed.
 */
export function outlineParts(steps: GeoStep[]): { steps: GeoStep[]; depth: number }[] {
  const parts: GeoStep[][] = [];
  for (const s of steps) {
    if (s[0] === 'M' || !parts.length) parts.push([]);
    parts[parts.length - 1].push(s);
  }
  // filled parts are closed
  for (const p of parts) if (p[p.length - 1][0] !== 'Z') p.push(['Z']);
  const polys = parts.map((p) => flatten(p, 6)[0] ?? []);
  const depth = polys.map((poly, i) => {
    if (!poly.length) return 0;
    // (the parts don't cross, so any point of this one will do)
    return polys.filter((o, j) => j !== i && o.length > 2 && insideOutline([o], poly[0])).length;
  });
  return parts.map((p, i) => ({ steps: p, depth: depth[i] })).sort((a, b) => a.depth - b.depth);
}

/** How far p is from the outline's lines. */
export function distToOutline(polys: Vec[][], p: Vec): number {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
  }
  return best;
}

/** Steps moved by (dx, dy). */
export function moveSteps(steps: GeoStep[], dx: number, dy: number): GeoStep[] {
  return steps.map((s) => {
    if (s[0] === 'Z') return s;
    if (s[0] === 'C') return ['C', s[1] + dx, s[2] + dy, s[3] + dx, s[4] + dy, s[5] + dx, s[6] + dy];
    return [s[0], s[1] + dx, s[2] + dy];
  });
}

/** Steps turned `deg` degrees clockwise (on the page, y down) about `c`, as a turned shape is drawn. */
export function turnSteps(steps: GeoStep[], c: Vec, deg: number): GeoStep[] {
  if (!deg) return steps;
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const t = (x: number, y: number): [number, number] => [c.x + (x - c.x) * cos - (y - c.y) * sin, c.y + (x - c.x) * sin + (y - c.y) * cos];
  return steps.map((s): GeoStep => {
    if (s[0] === 'Z') return s;
    if (s[0] === 'C') return ['C', ...t(s[1], s[2]), ...t(s[3], s[4]), ...t(s[5], s[6])];
    return [s[0], ...t(s[1], s[2])];
  });
}

/** Trace steps on a canvas (or the vector recorder, which records the same calls). */
export function traceSteps(ctx: { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void; closePath(): void }, steps: GeoStep[]): void {
  for (const s of steps) {
    if (s[0] === 'M') ctx.moveTo(s[1], s[2]);
    else if (s[0] === 'L') ctx.lineTo(s[1], s[2]);
    else if (s[0] === 'C') ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]);
    else ctx.closePath();
  }
}

/** Where a shape's text goes (its box inside the shape), from the shape's corners. */
export function textArea(def: GeoDef, x1: number, y1: number, x2: number, y2: number): Rect {
  const [l, t, r, b] = def.text ?? [0.06, 0.06, 0.94, 0.94];
  const w = x2 - x1, h = y2 - y1;
  return { x1: x1 + l * w, y1: y1 + t * h, x2: x1 + r * w, y2: y1 + b * h };
}

/** The points connectors join to: the middles of the box's sides (top, right, bottom, left). */
export function ports(x1: number, y1: number, x2: number, y2: number): Vec[] {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return [{ x: mx, y: y1 }, { x: x2, y: my }, { x: mx, y: y2 }, { x: x1, y: my }];
}

/** The usual line widths of new design shapes, in points. */
export const CLIP_ART_LINE = 1.75, SHAPE_LINE = 1;

/** How a new shape from the library looks (null for a shape that isn't in it). */
export function geoShapeStyle(id: string, look: Partial<Shape> = {}): Partial<Shape> | null {
  const def = isIconId(id) ? iconDef(id) : GEO_BY_ID.get(id);
  if (!def) return null;
  // icons in the outline colour of new shapes (or black), with no outline
  if (def.icon) return { kind: 'geo', geo: id, filled: true, color: look.color ?? '#000000', lineWidth: 0 };
  // lines in proportion to the shape: clip art (glassware…) at 1.75 pt, as it is drawn about 60 pt
  // across; other shapes at PowerPoint's 1 pt. Change it in the Style panel.
  const base: Partial<Shape> = def.outline ? { color: '#000000', lineWidth: CLIP_ART_LINE } : { filled: true, fillColor: '#dae3f3', color: '#2f5597', lineWidth: SHAPE_LINE, ...look };
  return { ...base, kind: 'geo', geo: id, ...(ACTION_LINKS[id] ? { link: ACTION_LINKS[id] } : {}) };
}

