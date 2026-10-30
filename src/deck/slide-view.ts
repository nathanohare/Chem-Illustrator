// Drawing whole slides: the slide's background, logo, number and footer from the master, then
// its drawing. The same code draws the slide being edited (under the drawing), the slide list,
// the slide show and PDF pages, so they all look the same.

import { cssFamily, ASCENT } from '../text/layout';
import { Doc } from '../model';
import { Renderer, withMeasure } from '../render/renderer';
import { imageFor } from '../render/images';
import { VectorContext, VecPath, Item } from '../render/vector';
import { arialWidth } from '../text-metrics';
import { Master, SlideSize, LayoutId, decorFrames, showsNumber, showsFooter, showsDate, dateText, type SlideHF, slideColours, slideBackground, decorShapes, layoutFrames, type DecorShape } from './deck';
import { backgroundColour, paintBackground, type Background } from './background';
import type { Rect } from '../geom';
import { shownRect, slidePlace, type CanvasData } from './canvas';
import { canvasBackgroundPicture, drawCanvasBackground, hasLook } from './canvas-look';

/** Grey around the slide while editing, as in PowerPoint. */
export const SURROUND = '#d5d8de';

/**
 * What a slide's page needs from its deck: with the slide's own background, and whether the
 * master's shapes and logo are hidden on it. A canvas slide's page has the part of the canvas
 * shown (`view`, one of its keyframes) instead of the slide's own place.
 */
export interface SlidePage { size: SlideSize; master: Master; layout: LayoutId; index: number; own?: Background; hideGraphics?: boolean; hf?: SlideHF; view?: Rect; canvas?: CanvasData; title?: string }

// Drawing whole slides never draws on screen through the renderer's own canvases.
const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;

/**
 * The slide's background, logo, slide number and footer, in slide points. With `surround`,
 * everything outside the slide is filled with that colour (the grey around the slide).
 */
export function drawSlidePage(ctx: CanvasRenderingContext2D, p: SlidePage, surround: string | null = null): void {
  const { size, master: m } = p;
  if (p.view) { drawCanvasPage(ctx, p, !!surround); return; }
  if (surround) {
    const far = 1e5;
    ctx.fillStyle = surround;
    ctx.fillRect(-far, -far, 2 * far, far); // above
    ctx.fillRect(-far, size.h, 2 * far, far); // below
    ctx.fillRect(-far, 0, far, size.h); // left
    ctx.fillRect(size.w, 0, far, size.h); // right
  }
  paintBackground(ctx, slideBackground(m, p.layout, p.own), size.w, size.h);
  drawScreen(ctx, p);
}

/**
 * The master's shapes, logo, slide number, footer and date, in slide points: over a slide's
 * background, or fixed to the screen over a canvas slide's (its screen layer).
 */
export function drawScreen(ctx: CanvasRenderingContext2D, p: SlidePage): void {
  const { size, master: m } = p;
  const colours = slideColours(m, p.layout);
  if (!p.hideGraphics) for (const sh of decorShapes(size, m, p.layout)) drawDecor(ctx, sh);
  const d = decorFrames(size, m);
  if (m.logo && d.logo && !p.hideGraphics) {
    const box = { x1: d.logo.x1, y1: d.logo.y1, x2: d.logo.x2, y2: d.logo.y2 };
    if ('picture' in ctx) (ctx as unknown as { picture(s: object): void }).picture({ src: m.logo.src, px: m.logo.px, ...box });
    else {
      const img = imageFor(m.logo.src);
      if (img) ctx.drawImage(img, box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    }
  }
  const text = (s: string, r: { x1: number; y1: number; x2: number; y2: number }, align: 'right' | 'center' | 'left') => {
    ctx.font = `${m.footerSize}px ${cssFamily(m.bodyFont)}, Arial, sans-serif`;
    ctx.fillStyle = colours.footerColor;
    const w = ctx.measureText(s).width;
    const x = align === 'right' ? r.x2 - w : align === 'left' ? r.x1 : (r.x1 + r.x2 - w) / 2;
    ctx.fillText(s, x, (r.y1 + r.y2) / 2 + 0.35 * m.footerSize);
  };
  if (showsNumber(m, p.layout, p.hf)) text(String(p.index + 1), d.number, 'right');
  if (showsFooter(m, p.layout, p.hf)) text(m.footer, d.footer, 'center');
  if (showsDate(m, p.layout, p.hf)) text(dateText(m), d.date, 'left');
}

/**
 * A canvas slide's page: its background, with no edge (`endless`, while editing) or over the part
 * of the canvas shown, and the master's shapes, logo, number and footer and the keyframe's title
 * fixed in the keyframe's place, as the screen shows them there.
 */
function drawCanvasPage(ctx: CanvasRenderingContext2D, p: SlidePage, endless: boolean): void {
  const v = p.view!;
  drawCanvasUnder(ctx, p, v, endless);
  ctx.save();
  ctx.translate(v.x1, v.y1);
  const k = (v.x2 - v.x1) / p.size.w;
  ctx.scale(k, k);
  drawScreen(ctx, p);
  if (p.title) drawKeyTitle(ctx, p, p.title);
  ctx.restore();
}

/** The colour of a slide's background (its own, its layout's or its master's). */
export const pageBase = (p: Pick<SlidePage, 'master' | 'layout' | 'own'>): string => backgroundColour(slideBackground(p.master, p.layout, p.own));

/**
 * A canvas slide's background for the view `v` (in canvas points): everywhere when `endless`, else
 * over the view only. A PDF page gets it as a picture.
 */
export function drawCanvasUnder(ctx: CanvasRenderingContext2D, p: SlidePage, v: Rect, endless = false): void {
  const base = pageBase(p);
  const ink = slideColours(p.master, p.layout).textColor;
  const c = p.canvas;
  if ('picture' in ctx) {
    ctx.fillStyle = base;
    ctx.fillRect(v.x1, v.y1, v.x2 - v.x1, v.y2 - v.y1);
    const pic = c && hasLook(c) ? canvasBackgroundPicture(c, p.size, v, base, ink) : null;
    if (pic) (ctx as unknown as { picture(s: object): void }).picture({ src: pic.src, px: pic.px, x1: v.x1, y1: v.y1, x2: v.x2, y2: v.y2 });
    return;
  }
  ctx.save();
  if (!endless) {
    ctx.beginPath();
    ctx.rect(v.x1, v.y1, v.x2 - v.x1, v.y2 - v.y1);
    ctx.clip();
  }
  if (c) drawCanvasBackground(ctx, c, p.size, { x: (v.x1 + v.x2) / 2, y: (v.y1 + v.y2) / 2 }, base, ink);
  else {
    ctx.fillStyle = base;
    ctx.fillRect(-1e7, -1e7, 2e7, 2e7);
  }
  ctx.restore();
}

/**
 * A keyframe's title, fixed to the screen, in slide points: where a Title Only slide has its title,
 * in the master's title font and colour, made smaller to fit on one line. `alpha`: how much of it
 * shows (titles cross-fade as the show moves between keyframes).
 */
export function drawKeyTitle(ctx: CanvasRenderingContext2D, p: Pick<SlidePage, 'size' | 'master' | 'layout'>, title: string, alpha = 1): void {
  const m = p.master;
  const f = layoutFrames('title-only', p.size, m).find((x) => x.ph === 'title') ?? { x: 0.05 * p.size.w, y: 0.05 * p.size.h, w: 0.9 * p.size.w, h: 0.14 * p.size.h, justify: 'left' as const };
  const font = (size: number) => `${m.titleBold ? 'bold ' : ''}${size}px ${cssFamily(m.titleFont)}, Arial, sans-serif`;
  let size = m.titleSize;
  ctx.save();
  ctx.font = font(size);
  const w0 = ctx.measureText(title).width;
  if (w0 > f.w) {
    size = Math.max(m.titleSize * 0.5, (m.titleSize * f.w) / w0);
    ctx.font = font(size);
  }
  const w = Math.min(f.w, ctx.measureText(title).width);
  const x = f.justify === 'center' ? f.x + (f.w - w) / 2 : f.justify === 'right' ? f.x + f.w - w : f.x;
  ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = slideColours(m, p.layout).titleColor;
  // the first line's baseline one ascent below the top, as a title placeholder's
  ctx.fillText(title, x, f.y + ASCENT * size, f.w);
  ctx.restore();
}

/** One of a design template's shapes behind the slide. */
function drawDecor(ctx: CanvasRenderingContext2D, sh: DecorShape): void {
  ctx.beginPath();
  if (sh.kind === 'rect') {
    ctx.fillStyle = sh.color;
    ctx.rect(sh.x1, sh.y1, sh.x2 - sh.x1, sh.y2 - sh.y1);
    ctx.fill();
  } else if (sh.kind === 'tri') {
    ctx.fillStyle = sh.color;
    sh.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.strokeStyle = sh.color;
    ctx.lineWidth = sh.width;
    ctx.setLineDash([]);
    if (sh.kind === 'line') { ctx.moveTo(sh.x1, sh.y1); ctx.lineTo(sh.x2, sh.y2); } else ctx.rect(sh.x1, sh.y1, sh.x2 - sh.x1, sh.y2 - sh.y1);
    ctx.stroke();
  }
}

/** A whole slide (page and drawing) drawn on `ctx`, which is already scaled to slide points. */
export function drawSlide(ctx: CanvasRenderingContext2D, p: SlidePage, doc: Doc): void {
  drawSlidePage(ctx, p);
  drawDrawing(ctx, doc);
}

/** Just the slide's drawing, without its page (for animated objects, drawn on their own). */
export function drawDrawing(ctx: CanvasRenderingContext2D, doc: Doc): void {
  const r = new Renderer(noCanvas, noCanvas);
  r.showWarnings = false;
  r.drawDocument(ctx, doc);
}

/**
 * A whole slide recorded as shapes and text (for PDF pages), in slide points. Text is laid out
 * with Arial's widths, as in the pictures for PowerPoint, to match the PDF's Helvetica.
 */
export function recordSlide(p: SlidePage, doc: Doc): Item[] {
  const ctx = new VectorContext();
  const r = new Renderer(noCanvas, noCanvas);
  r.showWarnings = false;
  r.makePath = () => new VecPath() as unknown as Path2D;
  const c = ctx as unknown as CanvasRenderingContext2D;
  withMeasure((t, s, _font, style) => arialWidth(t, s, /bold/.test(style)), () => {
    drawSlidePage(c, p);
    r.drawDocument(c, doc);
  });
  return ctx.items;
}

/**
 * Paint a slide on a canvas `w` × `h` CSS pixels big, centred with `fill` around it (black
 * for a slide show). Returns where the slide went, in CSS pixels. Without `pageToo`, only the
 * drawing is painted, on a clear canvas.
 */
export function paintSlide(canvas: HTMLCanvasElement, w: number, h: number, dpr: number, p: SlidePage, doc: Doc, fill: string | null = null, pageToo = true): { x: number; y: number; k: number } {
  const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, pw, ph);
  } else ctx.clearRect(0, 0, pw, ph);
  const at = slidePlace(w, h, p);
  ctx.setTransform(at.k * dpr, 0, 0, at.k * dpr, at.x * dpr, at.y * dpr);
  // nothing spills outside the slide
  const r = shownRect(p);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
  ctx.clip();
  if (pageToo) drawSlide(ctx, p, doc);
  else drawDrawing(ctx, doc);
  ctx.restore();
  return at;
}
