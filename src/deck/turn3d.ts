// Turn in 3-D (a slide show emphasis effect): a structure turns smoothly from one key view to
// the next, each a turn of the structure as drawn on the slide. A view is a 3 × 3 rotation
// (row by row, x right, y down the page, z towards the reader); between two views the show
// turns along the shortest way round (quaternion slerp), easing in and out.

/** A key view: a rotation, row by row. */
export type View3 = number[];

export const SAME_VIEW: View3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const isSameView = (v: View3 | undefined): boolean => !v || v.every((x, i) => Math.abs(x - SAME_VIEW[i]) < 1e-9);

type Q = [number, number, number, number];

function toQuat(m: View3): Q {
  const [a, b, c, d, e, f, g, h, i] = m;
  const tr = a + e + i;
  let q: Q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [0.25 * s, (h - f) / s, (c - g) / s, (d - b) / s]; }
  else if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; q = [(h - f) / s, 0.25 * s, (b + d) / s, (c + g) / s]; }
  else if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; q = [(c - g) / s, (b + d) / s, 0.25 * s, (f + h) / s]; }
  else { const s = Math.sqrt(1 + i - a - e) * 2; q = [(d - b) / s, (c + g) / s, (f + h) / s, 0.25 * s]; }
  const n = Math.hypot(...q) || 1;
  return q.map((x) => x / n) as Q;
}

function fromQuat([w, x, y, z]: Q): View3 {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

/** The view `t` of the way from `a` to `b` (0 to 1), the shortest way round. */
export function viewBetween(a: View3, b: View3, t: number): View3 {
  const qa = toQuat(a);
  let qb = toQuat(b);
  let dot = qa.reduce((s, v, k) => s + v * qb[k], 0);
  if (dot < 0) { qb = qb.map((v) => -v) as Q; dot = -dot; }
  let q: Q;
  if (dot > 0.9995) q = qa.map((v, k) => v + (qb[k] - v) * t) as Q;
  else {
    const th = Math.acos(Math.min(1, dot)), s = Math.sin(th);
    const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
    q = qa.map((v, k) => v * ka + qb[k] * kb) as Q;
  }
  const n = Math.hypot(...q) || 1;
  return fromQuat(q.map((v) => v / n) as Q);
}

/** A × B. */
export function viewTimes(a: View3, b: View3): View3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
  return out;
}

/** A turn of `deg` degrees about an axis: x (top comes towards the reader), y (right side comes towards the reader) or z (clockwise on the page). */
export function axisView(axis: 'x' | 'y' | 'z', deg: number): View3 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** How far apart two views are, in degrees of turn. */
export function viewAngle(a: View3, b: View3): number {
  const qa = toQuat(a), qb = toQuat(b);
  const dot = Math.abs(qa.reduce((s, v, k) => s + v * qb[k], 0));
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

/** Rounded for saving. */
export const roundView = (v: View3): View3 => v.map((x) => Math.round(x * 1e5) / 1e5);
