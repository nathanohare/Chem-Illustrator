// A settings preview with a magnifier: while a distance setting (an arrow's gap, the space round a
// + or a reaction arrow's text) is hovered or being typed in, a round inset in the preview's
// emptiest corner shows that spot enlarged, with the distance drawn as on a technical drawing:
// dashed extension lines at each end and a double-headed dimension arrow with the value. A small
// circle marks the spot on the preview, joined to the inset by a dotted leader.

import type { Doc } from '../model';
import { recordPicture, pictureCanvas } from '../render/picture';

type Vec = { x: number; y: number };

/** A distance to show: between two points of the drawing (its points), named by `label` ("3.0 pt"). */
export interface Span {
  from: Vec;
  to: Vec;
  label: string;
  /** Which side of the span the dimension line goes (a direction in the drawing); away from the drawing's middle when not given. */
  side?: Vec;
  /**
   * The things measured from and to, when they are off the dimension line (a label above an
   * arrow's line): the extension lines start at them.
   */
  anchors?: [Vec, Vec];
}

const TEAL = '#0e7c93';
const dpr = () => (typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1);

export interface LoupeOptions {
  /** Where room is added for the inset when no corner is free: under the drawing, or beside it (for a preview in a wide box, so its height stays put). */
  band?: 'below' | 'right';
  /** Part of the drawing to show (in its points), a close-up; all of it when not given. */
  view?: { x1: number; y1: number; x2: number; y2: number };
}

/** The drawing (or `opts.view` of it) fitted into `w` × `h` CSS pixels on white, as drawingCanvas draws it, with the magnifier on `span` when given. */
export function canvasWithLoupe(doc: Doc, w: number, h: number, pad: number, maxScale: number, span: Span | null, opts: LoupeOptions = {}): HTMLCanvasElement {
  const k = dpr();
  const band = opts.band ?? 'below';
  const pic = recordPicture(doc, 2);
  const frame = opts.view ?? pic?.box ?? { x1: 0, y1: 0, x2: 1, y2: 1 };
  const pw = frame.x2 - frame.x1, ph = frame.y2 - frame.y1;
  const fit = Math.min((w - 2 * pad) / pw, (h - 2 * pad) / ph, maxScale);
  const R = 44;
  /** The drawing on white, with `ew` × `eh` CSS pixels more to the right and below (room for the inset). */
  const paint = (ew: number, eh: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((w + ew) * k);
    canvas.height = Math.round((h + eh) * k);
    canvas.style.width = `${w + ew}px`;
    canvas.style.height = `${h + eh}px`;
    const ctx = canvas.getContext('2d');
    if (ctx && pic) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w + ew, h + eh);
      const { canvas: src, dpi } = pictureCanvas(doc, pic, fit * k * 72);
      const kd = dpi / 72;
      ctx.drawImage(src, (frame.x1 - pic.box.x1) * kd, (frame.y1 - pic.box.y1) * kd, pw * kd, ph * kd, (w - pw * fit) / 2, (h - ph * fit) / 2, pw * fit, ph * fit);
    }
    return { canvas, ctx };
  };
  let { canvas, ctx } = paint(0, 0);
  if (!ctx || !pic || !span) return canvas;
  const at = (p: Vec): Vec => ({ x: (w - pw * fit) / 2 + (p.x - frame.x1) * fit, y: (h - ph * fit) / 2 + (p.y - frame.y1) * fit });
  const pts = [span.from, span.to, ...(span.anchors ?? [])];
  const bx1 = Math.min(...pts.map((p) => p.x)), bx2 = Math.max(...pts.map((p) => p.x));
  const by1 = Math.min(...pts.map((p) => p.y)), by2 = Math.max(...pts.map((p) => p.y));
  const mid = { x: (bx1 + bx2) / 2, y: (by1 + by2) / 2 };
  const m = at(mid);
  // the inset in a corner with nothing drawn there, or else in a band added under or beside the drawing
  const fits = R * 2 + 6 <= h;
  let spot = fits ? emptyCorner(ctx, k, w, h, R, m) : null;
  if (!spot && band === 'right' && fits) {
    ({ canvas, ctx } = paint(2 * R + 8, 0));
    if (!ctx) return canvas;
    spot = { x: w + R + 4, y: Math.max(R + 3, Math.min(h - R - 3, m.y)) };
  } else if (!spot) {
    ({ canvas, ctx } = paint(0, 2 * R + 8));
    if (!ctx) return canvas;
    spot = { x: Math.max(R + 3, Math.min(w - R - 3, m.x)), y: h + R + 4 };
  }
  ctx.save();
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
  ctx.stroke();
  const d = Math.hypot(spot.x - m.x, spot.y - m.y) || 1;
  const u = { x: (spot.x - m.x) / d, y: (spot.y - m.y) / d };
  if (d > R + 8) {
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(m.x + u.x * 6, m.y + u.y * 6);
    ctx.lineTo(spot.x - u.x * R, spot.y - u.y * R);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // the spot enlarged, everything measured in view
  ctx.beginPath();
  ctx.arc(spot.x, spot.y, R, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.clip();
  const side = span.side ?? (() => {
    const c = { x: (pic.box.x1 + pic.box.x2) / 2, y: (pic.box.y1 + pic.box.y2) / 2 };
    return { x: mid.x - c.x, y: mid.y - c.y };
  })();
  // some of the drawing round the things measured, and the view moved off them toward the
  // dimension line so it and its value fit in the circle too
  const half = Math.max(Math.hypot(bx2 - bx1, by2 - by1) * 1.3, doc.style.bondLength * 0.9);
  const s = R / half;
  const off = Math.min(12, R * 0.28);
  const sl = Math.hypot(side.x, side.y) || 1;
  const centre = { x: mid.x + (side.x / sl) * (off * 0.8) / s, y: mid.y + (side.y / sl) * (off * 0.8) / s };
  const { canvas: big, dpi } = pictureCanvas(doc, pic, s * k * 72);
  const kb = dpi / 72;
  const view = { x1: centre.x - half, y1: centre.y - half };
  ctx.drawImage(big, (view.x1 - pic.box.x1) * kb, (view.y1 - pic.box.y1) * kb, 2 * half * kb, 2 * half * kb, spot.x - R, spot.y - R, 2 * R, 2 * R);
  const inLoupe = (p: Vec): Vec => ({ x: spot!.x - R + (p.x - view.x1) * s, y: spot!.y - R + (p.y - view.y1) * s });
  dimension(ctx, inLoupe(span.from), inLoupe(span.to), side, off, span.label, 10, span.anchors && [inLoupe(span.anchors[0]), inLoupe(span.anchors[1])]);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(spot.x, spot.y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return canvas;
}

/** Of the four corners, the centre of a round inset there with nothing drawn under it and off the spot itself, or null when there is none. */
function emptyCorner(ctx: CanvasRenderingContext2D, k: number, w: number, h: number, R: number, spot: Vec): Vec | null {
  const m = 3;
  const corners = [{ x: m + R, y: m + R }, { x: w - m - R, y: m + R }, { x: m + R, y: h - m - R }, { x: w - m - R, y: h - m - R }];
  let img: ImageData;
  try { img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height); } catch { return null; }
  // nearest the spot first, so the leader is short
  corners.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y));
  for (const c of corners) {
    if (Math.hypot(c.x - spot.x, c.y - spot.y) < R + 8) continue;
    let ink = false;
    for (let y = -R; y <= R && !ink; y += 2) for (let x = -R; x <= R; x += 2) {
      if (x * x + y * y > R * R) continue;
      const px = Math.round((c.x + x) * k), py = Math.round((c.y + y) * k);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const i = (py * img.width + px) * 4;
      if (img.data[i] + img.data[i + 1] + img.data[i + 2] < 700) { ink = true; break; }
    }
    if (!ink) return c;
  }
  return null;
}

function head(ctx: CanvasRenderingContext2D, tip: Vec, dir: Vec, len = 5, wid = 2): void {
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - dir.x * len - dir.y * wid, tip.y - dir.y * len + dir.x * wid);
  ctx.lineTo(tip.x - dir.x * len + dir.y * wid, tip.y - dir.y * len - dir.x * wid);
  ctx.closePath();
  ctx.fill();
}

/**
 * A dimension between P and Q (canvas points), `off` to the `side` given: dashed extension lines
 * from each end, the dimension line with its arrowheads, and the value in a break in its middle
 * (or, when the two ends are too close for that, the arrowheads outside pointing in and the
 * value past them).
 */
export function dimension(ctx: CanvasRenderingContext2D, P: Vec, Q: Vec, side: Vec, off: number, text: string, font = 10, /** Where the extension lines start, when not at P and Q. */ anchors?: [Vec, Vec]): void {
  const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L };
  let n = { x: -u.y, y: u.x };
  if (n.x * side.x + n.y * side.y < 0) n = { x: -n.x, y: -n.y };
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = TEAL;
  ctx.lineWidth = 1;
  // the dimension line `off` beyond the ends, or beyond the anchor further out on that side
  const reach = Math.max(0, ...(anchors ?? []).map((a, i) => { const e = i ? Q : P; return (a.x - e.x) * n.x + (a.y - e.y) * n.y; }));
  const o = off + reach;
  const A = { x: P.x + n.x * o, y: P.y + n.y * o }, B = { x: Q.x + n.x * o, y: Q.y + n.y * o };
  ctx.setLineDash([3, 2]);
  for (const [E, F] of [[anchors?.[0] ?? P, A], [anchors?.[1] ?? Q, B]] as const) {
    // from the thing measured, along the extension, a little past the dimension line
    const t = (F.x - E.x) * n.x + (F.y - E.y) * n.y;
    const S = { x: F.x - n.x * t, y: F.y - n.y * t };
    ctx.beginPath();
    ctx.moveTo(S.x + n.x * 1.5, S.y + n.y * 1.5);
    ctx.lineTo(F.x + n.x * 3, F.y + n.y * 3);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = `600 ${font}px Arial, sans-serif`;
  const tw = ctx.measureText(text).width;
  const ang = Math.atan2(u.y, u.x);
  const upright = Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang;
  const label = (T: Vec, turn = true) => {
    ctx.save();
    ctx.translate(T.x, T.y);
    if (turn) ctx.rotate(upright);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillRect(-tw / 2 - 2, -font / 2 - 1, tw + 4, font + 2);
    ctx.fillStyle = TEAL;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  if (L > tw + 18) {
    const gap = tw / 2 + 3;
    const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(M.x - u.x * gap, M.y - u.y * gap);
    ctx.moveTo(M.x + u.x * gap, M.y + u.y * gap); ctx.lineTo(B.x, B.y);
    ctx.stroke();
    head(ctx, A, { x: -u.x, y: -u.y });
    head(ctx, B, u);
    label(M);
  } else {
    const ext = 8;
    ctx.beginPath();
    ctx.moveTo(A.x - u.x * ext, A.y - u.y * ext);
    ctx.lineTo(B.x + u.x * ext, B.y + u.y * ext);
    ctx.stroke();
    head(ctx, A, u);
    head(ctx, B, { x: -u.x, y: -u.y });
    // the value upright, just beyond the dimension line (away from the thing measured)
    const across = Math.abs(n.x) * (tw / 2 + 2) + Math.abs(n.y) * (font / 2 + 1) + 3;
    label({ x: (A.x + B.x) / 2 + n.x * across, y: (A.y + B.y) / 2 + n.y * across }, false);
  }
  ctx.restore();
}
