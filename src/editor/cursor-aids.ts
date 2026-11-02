// Help drawn beside the pointer while drawing: the angle (and, if wanted, the length) of the bond,
// arrow or line being drawn, and what Shift, Alt and Ctrl do with the tool in hand right now.
// The editor works out the state; this file says what to show and draws it, in blue, as the
// drawing's previews are.

import type { Vec } from '../geom';

export interface CursorAidPrefs {
  /** The angle of a bond, arrow or line being drawn, beside the pointer. */
  angle: boolean;
  /** Its length too (off unless switched on in Settings ▸ Drawing). */
  length: boolean;
  /** What the modifier keys do, beside the pointer. */
  hints: boolean;
  /** The units lengths are written in. */
  units: 'in' | 'cm';
  /** How the readout looks: plain blue words (the default), blue words on a pale box, or white on a blue box. */
  look: 'box' | 'plain' | 'solid';
}

export const DEFAULT_CURSOR_AIDS: CursorAidPrefs = { angle: true, length: false, hints: true, units: 'in', look: 'plain' };

export function parseCursorAids(v: unknown): CursorAidPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<CursorAidPrefs>;
  return {
    angle: typeof o.angle === 'boolean' ? o.angle : DEFAULT_CURSOR_AIDS.angle,
    length: typeof o.length === 'boolean' ? o.length : DEFAULT_CURSOR_AIDS.length,
    hints: typeof o.hints === 'boolean' ? o.hints : DEFAULT_CURSOR_AIDS.hints,
    units: o.units === 'cm' ? 'cm' : 'in',
    look: o.look === 'box' || o.look === 'solid' ? o.look : 'plain',
  };
}

/** The keys held right now. */
export interface Mods { shift: boolean; alt: boolean; ctrl: boolean }

export type ModKey = 'Shift' | 'Alt' | 'Ctrl';

/** One key's hint: the key, what it does, and whether it is held (doing it) now. */
export interface ModHint { key: ModKey; text: string; on: boolean }

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A key's name as the keyboard in use labels it (Option and ⌘ on a Mac). */
export function keyName(k: ModKey, mac = IS_MAC): string {
  if (!mac) return k;
  return k === 'Alt' ? '⌥' : k === 'Ctrl' ? '⌘' : '⇧';
}

/**
 * Angle of the line from `a` to `b`, in whole degrees counter-clockwise from pointing right
 * (as a protractor reads it; the page's y runs down), from 0 to 359.
 */
export function angleText(a: Vec, b: Vec): string {
  let deg = Math.round((-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  deg = ((deg % 360) + 360) % 360;
  return `${deg}°`;
}

/** A length in points, in inches or centimetres. */
export function lengthText(pt: number, units: 'in' | 'cm'): string {
  const n = units === 'in' ? pt / 72 : (pt / 72) * 2.54;
  return units === 'in' ? `${n.toFixed(2)} in` : `${n.toFixed(2)} cm`;
}

/** The readout for a line from `a` to `b`: the angle, and the length when asked for. Empty when neither is wanted. */
export function readoutText(a: Vec, b: Vec, p: Pick<CursorAidPrefs, 'angle' | 'length' | 'units'>): string {
  const parts: string[] = [];
  if (p.angle) parts.push(angleText(a, b));
  if (p.length) parts.push(lengthText(Math.hypot(b.x - a.x, b.y - a.y), p.units));
  return parts.join('  ');
}

/** What the editor is doing, as far as the modifier keys care. */
export interface HintState {
  /** The tool picked (its kind), and for shapes which shape. */
  tool: string;
  shape?: string;
  /** The tool draws a curved arrow. */
  curved?: boolean;
  /** The ring tool draws an aromatic ring. */
  aromatic?: boolean;
  /** The drag in hand ('none' when the button is up). */
  drag: 'none' | 'draw' | 'move' | 'rotate' | 'handle' | 'marquee' | 'other';
  /** What the pointer is over (or the drag began on). */
  over?: 'atom' | 'bond' | 'arrow' | 'shape' | 'caption' | null;
  /** The handle being dragged: an arrow's or a shape's, and which. */
  handle?: { kind: 'arrow' | 'shape'; which: string; line?: boolean };
  /** Settings that make a key matter. */
  fixedAngles: boolean;
  fixedLength: boolean;
  /** Moves snap to things (smart guides) or a grid: Alt turns that off. */
  snapping: boolean;
  /** The chain tool asks how long a chain to draw. */
  asksChain: boolean;
}

/**
 * The modifier keys that change what the tool in hand does in this state, each with what it
 * does and whether it is held. Empty where none matters.
 */
export function modifierHints(s: HintState, m: Mods): ModHint[] {
  const out: ModHint[] = [];
  const add = (key: ModKey, text: string) => out.push({ key, text, on: key === 'Shift' ? m.shift : key === 'Alt' ? m.alt : m.ctrl });
  switch (s.drag) {
    case 'move':
      add('Shift', 'straight across or down');
      if (s.snapping) add('Alt', 'no snapping');
      return out;
    case 'rotate':
      add('Shift', '15° steps');
      return out;
    case 'marquee':
      add('Shift', 'add to the selection');
      return out;
    case 'handle':
      if (s.handle?.kind === 'arrow') {
        if (s.handle.which === 'tail' || s.handle.which === 'head') add('Alt', 'any angle');
        else if (s.handle.which[0] === 'b') { add('Alt', 'sharp corner'); add('Shift', '15° steps'); }
        return out;
      }
      if (s.handle?.line || s.handle?.which === 'p1' || s.handle?.which === 'p2') { add('Alt', 'any angle'); return out; }
      add('Shift', 'keep proportions');
      add('Ctrl', 'from the middle');
      return out;
    case 'draw':
    case 'none': {
      const drawing = s.drag === 'draw';
      switch (s.tool) {
        case 'bond':
          if (s.fixedAngles || s.fixedLength) add('Alt', s.fixedAngles && s.fixedLength ? 'any angle and length' : s.fixedAngles ? 'any angle' : 'any length');
          break;
        case 'arrow':
          if (!drawing && s.over === 'arrow') add('Shift', 'drag to branch from this arrow');
          add('Alt', 'any angle');
          if (s.curved) add('Ctrl', 'drag a path freehand');
          break;
        case 'shape':
          if (s.shape === 'line') add('Alt', 'any angle');
          else add('Shift', s.shape === 'oval' ? 'circle' : 'square');
          break;
        case 'ring':
          if (s.over === 'atom') add('Alt', 'on a new bond');
          add('Shift', 'move the double bonds round');
          if (s.aromatic) add('Ctrl', 'with a circle');
          break;
        case 'chain':
          if (s.asksChain) add('Alt', 'no length question');
          break;
        case 'symbol':
          if (drawing) add('Alt', '15° steps');
          break;
        case 'select':
          if (!drawing) { add('Shift', 'add to the selection'); add('Ctrl', 'drag a copy'); }
          break;
      }
      return out;
    }
    default:
      return out;
  }
}

/** The lines of hint text, held keys first marked as such: "Alt: any angle". */
export function hintLines(hints: ModHint[], mac = IS_MAC): { text: string; on: boolean }[] {
  return hints.map((h) => ({ text: `${keyName(h.key, mac)}${mac ? ' ' : ': '}${h.text}`, on: h.on }));
}

const BLUE = '#2f6fdf';
const BLUE_DARK = '#8ab4ff';

/**
 * Draw the readout (first, larger) and the hints under it, a little below and right of the
 * pointer, in screen-sized type whatever the zoom (`px` is one screen pixel in points).
 */
export function drawCursorAids(ctx: CanvasRenderingContext2D, at: Vec, px: number, readout: string, hints: { text: string; on: boolean }[], o: { dark: boolean; look: CursorAidPrefs['look'] }): void {
  if (!readout && !hints.length) return;
  const lines: { text: string; size: number; weight: number; dim: boolean }[] = [];
  if (readout) lines.push({ text: readout, size: 12, weight: 600, dim: false });
  for (const h of hints) lines.push({ text: h.text, size: 10.5, weight: h.on ? 700 : 400, dim: !h.on && !!readout });
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const font = (l: (typeof lines)[number]) => `${l.weight} ${l.size * px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  let w = 0;
  for (const l of lines) { ctx.font = font(l); w = Math.max(w, ctx.measureText(l.text).width); }
  const gap = 3 * px, padX = 5 * px, padY = 3 * px;
  const h = lines.reduce((s, l) => s + l.size * px, 0) + gap * (lines.length - 1);
  // below and to the right of the pointer, clear of the arrow cursor
  const x = at.x + 18 * px, y = at.y + 24 * px;
  const blue = o.dark ? BLUE_DARK : BLUE;
  if (o.look !== 'plain') {
    ctx.fillStyle = o.look === 'solid' ? blue : o.dark ? 'rgba(24, 28, 36, 0.88)' : 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = o.look === 'solid' ? blue : o.dark ? 'rgba(138, 180, 255, 0.45)' : 'rgba(47, 111, 223, 0.35)';
    ctx.lineWidth = px;
    const r = 3 * px;
    ctx.beginPath();
    ctx.roundRect(x - padX, y - padY, w + 2 * padX, h + 2 * padY, r);
    ctx.fill();
    ctx.stroke();
  }
  let ty = y;
  for (const l of lines) {
    ty += l.size * px;
    ctx.font = font(l);
    const ink = o.look === 'solid' ? '#ffffff' : blue;
    ctx.fillStyle = ink;
    ctx.globalAlpha = l.dim ? 0.8 : 1;
    if (o.look === 'plain') {
      // a pale edge keeps plain words readable over bonds
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = o.dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(l.text, x, ty - 2 * px);
    }
    ctx.fillText(l.text, x, ty - 2 * px);
    ty += gap;
  }
  ctx.restore();
}
