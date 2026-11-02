// The box round an atom-map number (Chemistry ▸ Map Atoms), drawn on the canvas and in the
// Map Number Format window's preview. Three looks (style.ts, mapLookPrefs): ChemDraw's grey
// outline, a light tint of the number's own colour, or the user's own format for every box.

import type { Rect } from '../geom';
import { tint } from '../colours';
import type { MapBoxStyle, MapLook } from '../style';
import { MAP_GREY, mapColour } from './atom-marks';

/**
 * Paint the box `b` for map number `n` (fill, pattern, outline and shadow) and say how its number
 * is written. `lw` is the drawing's line width, which the grey and tinted outlines follow.
 */
export function paintMapBox(ctx: CanvasRenderingContext2D, b: Rect, n: number, lw: number, look: MapLook, own: MapBoxStyle): { ink: string; bold: boolean } {
  const w = b.x2 - b.x1, h = b.y2 - b.y1;
  const s: MapBoxStyle = look === 'grey'
    ? { fill: '#ffffff', pattern: 'none', patternColor: '', border: MAP_GREY, borderWidth: 0.6 * lw, text: MAP_GREY, bold: false, shadow: false, rounded: true }
    : look === 'tint'
      ? { fill: tint(mapColour(n), 0.45), pattern: 'none', patternColor: '', border: '#000000', borderWidth: 0.5 * lw, text: '#000000', bold: false, shadow: false, rounded: true }
      : own;
  const r = s.rounded ? Math.min(w, h) * 0.3 : 0;
  const path = (dx = 0, dy = 0) => { ctx.beginPath(); ctx.roundRect(b.x1 + dx, b.y1 + dy, w, h, r); };
  ctx.save();
  if (s.shadow) {
    const d = Math.max(0.6, 0.12 * h);
    path(d, d);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fill();
  }
  path();
  if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
  if (s.pattern !== 'none') {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = ctx.fillStyle = s.patternColor;
    const gap = Math.max(1, 0.22 * h), thin = Math.max(0.2, 0.06 * h);
    ctx.lineWidth = thin;
    if (s.pattern === 'dots') {
      for (let y = b.y1 + gap / 2; y < b.y2; y += gap) for (let x = b.x1 + gap / 2; x < b.x2; x += gap) { ctx.beginPath(); ctx.arc(x, y, thin, 0, 2 * Math.PI); ctx.fill(); }
    } else {
      ctx.beginPath();
      for (let k = -h; k < w + h; k += gap) {
        ctx.moveTo(b.x1 + k, b.y2); ctx.lineTo(b.x1 + k + h, b.y1);
        if (s.pattern === 'cross') { ctx.moveTo(b.x1 + k, b.y1); ctx.lineTo(b.x1 + k + h, b.y2); }
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (s.border && s.borderWidth > 0) {
    path();
    ctx.lineWidth = s.borderWidth;
    ctx.strokeStyle = s.border;
    ctx.stroke();
  }
  ctx.restore();
  return { ink: s.text, bold: s.bold };
}
