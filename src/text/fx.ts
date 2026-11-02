// Text effects from the Font box (kerning off, no fill, see-through, an outline, a shadow): which
// a run has, and drawing letters with them on a canvas.

import type { TextFx, TextRun } from '../model';

export const TEXT_FX_KEYS = ['noKern', 'noFill', 'transparency', 'outline', 'outlineW', 'shadow'] as const;

/** A run's text effects, or undefined when it has none. */
export function textFx(r: TextRun): TextFx | undefined {
  let fx: TextFx | undefined;
  for (const k of TEXT_FX_KEYS) if (r[k] !== undefined && r[k] !== false && r[k] !== 0) (fx ??= {} as TextFx)[k] = r[k] as never;
  return fx;
}

/** The outline's width when none is set, in points (PowerPoint's thinnest usual line). */
export const OUTLINE_W = 0.75;

/**
 * Set a canvas up to draw letters with these effects (call between save and restore); `size` is
 * the text size, which the shadow's offset and blur follow. Returns how to put one piece of text.
 */
export function withFx(ctx: CanvasRenderingContext2D, fx: TextFx, size: number): (text: string, x: number, y: number) => void {
  if (fx.transparency) ctx.globalAlpha *= Math.max(0, 1 - fx.transparency);
  if (fx.noKern && 'fontKerning' in ctx) ctx.fontKerning = 'none';
  if (fx.shadow && 'shadowColor' in ctx) {
    // shadows are in screen pixels, whatever the zoom: scale them by the canvas's own
    const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const k = m ? Math.hypot(m.a, m.b) || 1 : 1;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowOffsetX = ctx.shadowOffsetY = size * 0.06 * k;
    ctx.shadowBlur = size * 0.08 * k;
  }
  const stroke = !!fx.outline && typeof ctx.strokeText === 'function';
  if (stroke) {
    ctx.strokeStyle = fx.outline!;
    ctx.lineWidth = fx.outlineW ?? OUTLINE_W;
    ctx.lineJoin = 'round';
  }
  return (text, x, y) => {
    if (!fx.noFill) ctx.fillText(text, x, y);
    if (stroke) {
      // the fill's shadow is enough: the outline doesn't cast another
      if (fx.shadow && !fx.noFill) ctx.shadowColor = 'transparent';
      ctx.strokeText(text, x, y);
    }
  };
}
