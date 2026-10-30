// A canvas slide's background: endless, with soft edges only, so nothing with a hard edge ever
// scrolls past while the show moves from keyframe to keyframe. Over the master's background
// colour: a gradient from the first keyframe to the last (the route), soft tinted zones round
// keyframes, and a faint pattern. With parallax the whole background moves slower than the
// drawing: it is drawn shrunk about the middle of the view, so what is behind a keyframe's middle
// is the same wherever the view comes from, and moves less as the view moves away.

import type { Rect, Vec } from '../geom';
import { keyRect, PARALLAX_MAX, type CanvasData, type Size, type Texture } from './canvas';

/** A colour (#rrggbb) see-through: `a` of it showing. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  if (!/^#[0-9a-f]{6}$/i.test(hex) || !Number.isFinite(n)) return `rgba(0,0,0,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Where the route gradient starts and ends: the middles of the first and last keyframes (across all of them when those are close). */
export function routeEnds(c: CanvasData, size: Size): [Vec, Vec] {
  const mid = (r: Rect): Vec => ({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 });
  const rs = c.keys.map((k) => keyRect(k, size));
  if (!rs.length) return [{ x: 0, y: 0 }, { x: size.w, y: 0 }];
  const a = mid(rs[0]), b = mid(rs[rs.length - 1]);
  if (Math.hypot(b.x - a.x, b.y - a.y) >= size.w) return [a, b];
  // the route comes back near where it started: left to right across everything
  const x1 = Math.min(...rs.map((r) => r.x1)), x2 = Math.max(...rs.map((r) => r.x2));
  return [{ x: Math.min(x1, a.x - size.w / 2), y: a.y }, { x: Math.max(x2, a.x + size.w / 2), y: a.y }];
}

/** How much slower the background moves (0 to PARALLAX_MAX). */
export const parallaxOf = (c: CanvasData): number => Math.max(0, Math.min(PARALLAX_MAX, c.look?.parallax ?? 0));

const tiles = new Map<string, HTMLCanvasElement>();

/** One tile of a pattern, `TILE` points tall (and as wide, or one hexagon wide), in a colour. */
const TILE = 36;
const tileWidth = (kind: Texture) => (kind === 'hex' ? TILE / Math.sqrt(3) : TILE);
function tile(kind: Texture, colour: string): HTMLCanvasElement | null {
  const key = `${kind}|${colour}`;
  const had = tiles.get(key);
  if (had) return had;
  if (typeof document === 'undefined') return null;
  const px = 4;
  const c = document.createElement('canvas');
  const w = tileWidth(kind);
  c.width = Math.round(w * px);
  c.height = TILE * px;
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(c.width / w, c.height / TILE);
  g.strokeStyle = g.fillStyle = colour;
  g.lineWidth = 0.6;
  if (kind === 'dots') {
    g.beginPath();
    g.arc(TILE / 2, TILE / 2, 1.3, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'grid') {
    g.beginPath();
    g.moveTo(0, 0.3); g.lineTo(TILE, 0.3);
    g.moveTo(0.3, 0); g.lineTo(0.3, TILE);
    g.stroke();
  } else {
    // a honeycomb of pointed-top hexagons: two rows to a tile, the second moved on half a hexagon
    const r = TILE / 3;
    const hex = (cx: number, cy: number) => {
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    };
    for (const [row, cy] of [[0, 0], [1, 1.5 * r], [0, 3 * r]]) for (const cx of row ? [-w / 2, w / 2, 1.5 * w] : [0, w]) hex(cx, cy);
  }
  if (tiles.size > 16) tiles.clear();
  tiles.set(key, c);
  return c;
}

/**
 * Draw a canvas's background on `ctx` (already in canvas points) for a view whose middle is
 * `centre`: everywhere, in the master's background colour `base`, with the route gradient, zones
 * and pattern over it. `ink` is the colour the pattern is a faint shade of.
 */
export function drawCanvasBackground(ctx: CanvasRenderingContext2D, c: CanvasData, size: Size, centre: Vec, base: string, ink: string): void {
  const far = 1e7;
  const look = c.look ?? {};
  ctx.save();
  ctx.fillStyle = base;
  ctx.fillRect(-far, -far, 2 * far, 2 * far);
  // parallax: the background shrunk about the middle of the view, so it moves slower
  const s = 1 - parallaxOf(c);
  ctx.translate(centre.x, centre.y);
  ctx.scale(s, s);
  ctx.translate(-centre.x, -centre.y);
  const F = far / s;
  if (look.route && look.route.length >= 2 && typeof ctx.createLinearGradient === 'function') {
    const [a, b] = routeEnds(c, size);
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    look.route.forEach((col, i) => g.addColorStop(i / (look.route!.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(-F, -F, 2 * F, 2 * F);
  }
  // zones: a soft tint round each keyframe that has one, fading out over about half a slide
  if (typeof ctx.createRadialGradient === 'function') {
    for (const k of c.keys) {
      if (!k.tint) continue;
      const r = keyRect(k, size);
      const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
      // as big on screen whatever the parallax
      const rad = (0.62 * Math.hypot(r.x2 - r.x1, r.y2 - r.y1)) / s;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, rgba(k.tint, 0.5));
      g.addColorStop(0.55, rgba(k.tint, 0.32));
      g.addColorStop(1, rgba(k.tint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, 2 * rad, 2 * rad);
    }
  }
  if (look.texture && typeof ctx.createPattern === 'function') {
    const t = tile(look.texture, rgba(ink, 0.16));
    const pat = t && ctx.createPattern(t, 'repeat');
    if (pat) {
      // the pattern's tiles in points, whatever the tile's pixels
      if (typeof pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(tileWidth(look.texture) / t.width, TILE / t.height));
      ctx.fillStyle = pat;
      ctx.fillRect(-F, -F, 2 * F, 2 * F);
    }
  }
  ctx.restore();
}

const pictures = new Map<string, string>();

/**
 * A view of a canvas's background as a PNG picture (about 2000 pixels across), for PDF pages and
 * PowerPoint, where it can't be drawn as it is; null where there is no canvas to draw it on.
 */
export function canvasBackgroundPicture(c: CanvasData, size: Size, view: Rect, base: string, ink: string): { src: string; px: { w: number; h: number } } | null {
  if (typeof document === 'undefined') return null;
  const w = view.x2 - view.x1, h = view.y2 - view.y1;
  const k = 2000 / Math.max(w, h, 1);
  const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
  const key = `${pw}x${ph} ${JSON.stringify([c, view, base, ink])}`;
  const had = pictures.get(key);
  if (had) return { src: had, px: { w: pw, h: ph } };
  const cv = document.createElement('canvas');
  cv.width = pw;
  cv.height = ph;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.setTransform(k, 0, 0, k, -view.x1 * k, -view.y1 * k);
  drawCanvasBackground(g, c, size, { x: (view.x1 + view.x2) / 2, y: (view.y1 + view.y2) / 2 }, base, ink);
  let src: string;
  try { src = cv.toDataURL('image/png'); } catch { return null; }
  if (!src.startsWith('data:image/png')) return null;
  if (pictures.size > 24) pictures.clear();
  pictures.set(key, src);
  return { src, px: { w: pw, h: ph } };
}

/** Whether a canvas's background is more than its plain colour. */
export const hasLook = (c: CanvasData): boolean => !!(c.look?.route || c.look?.texture || c.keys.some((k) => k.tint));

/** How much a spotlight or Dim Outside dims what is outside its focus. */
export const VEIL = 0.72;

/**
 * Dim everything outside `focus` (in the points `ctx` draws in) with a veil of the background
 * colour `base`, `alpha` of it showing, its edge soft: it builds up over a margin round the focus.
 */
export function drawVeil(ctx: CanvasRenderingContext2D, focus: Rect, base: string, alpha = 1): void {
  if (alpha <= 0) return;
  const far = 1e7, rings = 8;
  const pad = 0.06 * Math.max(focus.x2 - focus.x1, focus.y2 - focus.y1);
  ctx.save();
  ctx.fillStyle = base;
  // each ring a little of the veil, so it is all there beyond the margin
  ctx.globalAlpha *= 1 - (1 - VEIL * alpha) ** (1 / rings);
  for (let i = 0; i < rings; i++) {
    const g = (pad * i) / rings;
    ctx.beginPath();
    ctx.rect(-far, -far, 2 * far, 2 * far);
    ctx.rect(focus.x1 - g, focus.y1 - g, focus.x2 - focus.x1 + 2 * g, focus.y2 - focus.y1 + 2 * g);
    ctx.fill('evenodd');
  }
  ctx.restore();
}
