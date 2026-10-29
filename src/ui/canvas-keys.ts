// Keyframes on a canvas slide, while editing it: each drawn as a numbered outline over the canvas.
// Drag a keyframe's number tab or outline to move it (it lines up with the keyframes either side
// of it in the show; Alt: anywhere), and drag a corner to zoom it in or out about the opposite
// corner. A click on a keyframe picks it: the keyframe commands act on the one picked.

import type { Deck, Slide } from '../deck/deck';
import type { View } from '../render/renderer';
import type { Vec } from '../geom';
import { keyAt, keyRect, snapKeyframe, zoomByCorner, TAB, type CanvasData, type KeyGrab, type Keyframe } from '../deck/canvas';

export interface CanvasKeysHooks {
  /** The deck, when a canvas slide is being edited in Slides mode with the select tool (else null). */
  deck(): Deck | null;
  view(): View;
  /** The point (points) under the pointer, and whether something drawn there would take the click. */
  pointAt(e: PointerEvent): { p: Vec; taken: boolean };
  /** Draw the keyframes again. */
  repaint(): void;
  /** Called before a keyframe is picked up (text being typed is finished). */
  begin(): void;
  /** The keyframe picked changed (the slide list marks it). */
  picked(i: number): void;
}

/** The outline and tab of the keyframe picked, and of the others. */
const PICKED = '#e8590c';
const OTHER = '#5c7cfa';

export class CanvasKeys {
  /** The keyframe picked on the slide being edited. */
  pick = 0;
  /** The slide `pick` belongs to (it goes back to the first keyframe on another slide). */
  private pickSlide: Slide | null = null;
  /** A keyframe being dragged: its place so far (drawn instead of the saved one). */
  private live: { index: number; key: Keyframe } | null = null;

  constructor(private overlay: HTMLElement, private hooks: CanvasKeysHooks) {
    overlay.addEventListener('pointerdown', (e) => this.down(e), true);
    overlay.addEventListener('pointermove', (e) => this.hover(e));
  }

  /** The keyframe picked on the slide being edited (0 after going to another slide). */
  picked(deck: Deck): number {
    const s = deck.current;
    if (!s?.canvas) return 0;
    if (s !== this.pickSlide) { this.pickSlide = s; this.pick = 0; }
    return Math.max(0, Math.min(s.canvas.keys.length - 1, this.pick));
  }

  /** Pick keyframe i on the slide being edited. */
  setPicked(deck: Deck, i: number): void {
    this.pickSlide = deck.current;
    this.pick = i;
    this.hooks.picked(i);
    this.hooks.repaint();
  }

  /** The keyframes as drawn now (with the one being dragged where it is so far). */
  private keysNow(c: CanvasData): Keyframe[] {
    const l = this.live;
    return l ? c.keys.map((k, i) => (i === l.index ? l.key : k)) : c.keys;
  }

  /** Draw the keyframes over the canvas (in points; `scale`: screen pixels per point). */
  draw(ctx: CanvasRenderingContext2D, deck: Deck, scale: number): void {
    const c = deck.current?.canvas;
    if (!c) return;
    const picked = this.picked(deck);
    const keys = this.keysNow(c);
    const px = 1 / scale;
    ctx.save();
    // the others first, the one picked over them
    const order = keys.map((_, i) => i).filter((i) => i !== picked).concat(picked);
    for (const i of order) {
      const r = keyRect(keys[i], deck.size);
      const on = i === picked;
      const colour = on ? PICKED : OTHER;
      ctx.strokeStyle = colour;
      ctx.lineWidth = (on ? 2 : 1.25) * px;
      ctx.setLineDash(on ? [] : [6 * px, 4 * px]);
      ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      ctx.setLineDash([]);
      // the number tab, inside the top-left corner
      ctx.fillStyle = colour;
      ctx.fillRect(r.x1, r.y1, TAB.w * px, TAB.h * px);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${12 * px}px system-ui, sans-serif`;
      const label = String(i + 1);
      const w = ctx.measureText(label).width;
      ctx.fillText(label, r.x1 + (TAB.w * px - w) / 2, r.y1 + 13 * px);
      if (on) {
        // corner handles that zoom it
        const hs = 7 * px;
        ctx.fillStyle = '#fff';
        ctx.lineWidth = 1.5 * px;
        for (const [x, y] of [[r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]]) {
          ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
          ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
        }
      }
    }
    ctx.restore();
  }

  /** What is under the pointer: a keyframe's tab or corner always, its outline only where nothing drawn would take the click. */
  private grabAt(e: PointerEvent, deck: Deck): KeyGrab | null {
    const c = deck.current?.canvas;
    if (!c) return null;
    const { p, taken } = this.hooks.pointAt(e);
    const g = keyAt(c, deck.size, p, this.hooks.view().scale, this.picked(deck));
    return g && !(g.part === 'move' && g.edge && taken) ? g : null;
  }

  /** The keyframe whose tab, corner or outline a right-click is on (picked), else -1. */
  menuAt(e: PointerEvent | MouseEvent): number {
    const deck = this.hooks.deck();
    if (!deck) return -1;
    const g = this.grabAt(e as PointerEvent, deck);
    if (!g) return -1;
    this.setPicked(deck, g.index);
    return g.index;
  }

  private hover(e: PointerEvent): void {
    if (this.live || e.buttons) return;
    const deck = this.hooks.deck();
    if (!deck) return;
    const g = this.grabAt(e, deck);
    if (!g) return;
    this.overlay.style.cursor = g.part === 'move' ? 'move' : g.corner === 2 ? 'nwse-resize' : 'nesw-resize';
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const deck = this.hooks.deck();
    const c = deck?.current?.canvas;
    if (!deck || !c) return;
    const g = this.grabAt(e, deck);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    this.hooks.begin();
    this.setPicked(deck, g.index);
    const start = this.hooks.pointAt(e).p;
    const k0 = { ...c.keys[g.index] };
    const slide = deck.current!;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = this.hooks.pointAt(ev).p;
      const scale = this.hooks.view().scale;
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * scale < 3) return;
      moved = true;
      let k: Keyframe;
      if (g.part === 'move') {
        k = { ...k0, x: k0.x + p.x - start.x, y: k0.y + p.y - start.y };
        if (!ev.altKey) k = snapKeyframe(c, g.index, k, deck.size, 8 / scale);
      } else k = zoomByCorner(k0, deck.size, g.corner, p);
      this.live = { index: g.index, key: k };
      this.hooks.repaint();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      const l = this.live;
      this.live = null;
      if (moved && l && deck.current === slide) deck.setCanvas({ keys: c.keys.map((k, i) => (i === l.index ? l.key : k)) }, g.part === 'move' ? 'Move keyframe' : 'Zoom keyframe');
      this.hooks.repaint();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }
}
