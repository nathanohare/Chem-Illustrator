// Chemistry ▸ Reactions and Schemes ▸ Map Number Format…: the user's own format for every
// atom-map number box (fill color or pattern, outline, number color, shadow), with a preview.

import { ask } from './ask';
import { MAP_PATTERNS, mapBoxStyle, type MapBoxStyle } from '../style';
import { paintMapBox } from '../render/map-box';

const FONT = 'Arial, Helvetica, sans-serif';

/** A row of sample boxes drawn in the format the window shows. */
function preview(s: MapBoxStyle): HTMLCanvasElement {
  const scale = window.devicePixelRatio || 1, W = 220, H = 70;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  c.style.width = `${W}px`; c.style.height = `${H}px`;
  c.className = 'map-format-preview';
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const size = 18;
  ctx.font = `${s.bold ? 'bold ' : ''}${size}px ${FONT}`;
  ['1', '2', '12'].forEach((t, k) => {
    const w = ctx.measureText(t).width, pad = 0.3 * size, x = 24 + k * 64, y = 44;
    const look = paintMapBox(ctx, { x1: x - pad, y1: y - 0.716 * size - pad, x2: x + w + pad, y2: y + pad }, Number(t), 1, 'custom', s);
    ctx.font = `${look.bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = look.ink;
    ctx.fillText(t, x, y);
  });
  return c;
}

/** The values in the window as a format. */
function read(v: Record<string, string>): MapBoxStyle {
  return mapBoxStyle({
    fill: v.fillOn === 'true' ? v.fill : '', pattern: v.pattern, patternColor: v.patternColor,
    border: v.border, borderWidth: Number(v.borderWidth), text: v.text, bold: v.bold === 'true', shadow: v.shadow === 'true', rounded: v.rounded === 'true',
  });
}

/** Ask for a map-number box format; null if cancelled. */
export async function askMapFormat(now: MapBoxStyle): Promise<MapBoxStyle | null> {
  const got = await ask('Map Number Format', [
    { name: 'fillOn', label: 'Fill', type: 'checkbox', value: String(!!now.fill) },
    { name: 'fill', label: 'Fill color', type: 'color', value: now.fill || '#fbdcc2' },
    { name: 'pattern', label: 'Pattern over the fill', value: now.pattern, options: MAP_PATTERNS.map((p) => ({ value: p.value, label: p.label })) },
    { name: 'patternColor', label: 'Pattern color', type: 'color', value: now.patternColor },
    { name: 'border', label: 'Outline color', type: 'color', value: now.border || '#000000' },
    { name: 'borderWidth', label: 'Outline width', type: 'number', unit: 'pt', value: String(now.border ? now.borderWidth : 0), help: '0 for no outline.' },
    { name: 'text', label: 'Number color', type: 'color', value: now.text },
    { name: 'bold', label: 'Bold numbers', type: 'checkbox', value: String(now.bold) },
    { name: 'rounded', label: 'Rounded corners', type: 'checkbox', value: String(now.rounded) },
    { name: 'shadow', label: 'Shadow', type: 'checkbox', value: String(now.shadow) },
  ], { ok: 'Use for All Map Numbers', note: 'Every atom-map number box takes this format.', preview: { title: 'Preview', draw: (v) => preview(read(v)) } });
  return got ? read(got) : null;
}
