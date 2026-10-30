// The 3-D model window: a structure built in 3-D (OpenChemLib conformers, relaxed with MMFF94s+),
// drawn as balls and sticks, sticks, wire or space-filling spheres. Drag to turn it, Shift+drag
// (or the right button) to move it, the wheel to zoom, double-click to start again. Its other
// conformers are a click away, lowest energy first. Place on Page turns the drawn structure to
// match the view.

import { FloatBox } from './float-box';
import { SYMBOLS } from '../chem/elements';
import type { Model3d } from '../chem/model3d-build';
import { hornFit, rotation } from '../morph/rotate';

export type Style3d = 'ball-stick' | 'sticks' | 'wire' | 'spacefill';
type M3 = [number, number, number, number, number, number, number, number, number];

/** Jmol's element colours (CPK), the usual ones in molecular graphics. */
const CPK: Record<number, string> = {
  1: '#ffffff', 5: '#ffb5b5', 6: '#909090', 7: '#3050f8', 8: '#ff0d0d', 9: '#90e050', 11: '#ab5cf2', 12: '#8aff00',
  13: '#bfa6a6', 14: '#f0c8a0', 15: '#ff8000', 16: '#ffff30', 17: '#1ff01f', 19: '#8f40d4', 20: '#3dff00',
  26: '#e06633', 27: '#f090a0', 28: '#50d050', 29: '#c88033', 30: '#7d80b0', 34: '#ffa100', 35: '#a62929',
  44: '#248f8f', 45: '#0a7d8c', 46: '#006985', 47: '#c0c0c0', 50: '#668080', 53: '#940094', 77: '#175487', 78: '#d0d0e0', 79: '#ffd123',
};
const colourOf = (z: number) => CPK[z] ?? '#b0b8c8';

/** Covalent radii (Å, Cordero et al. 2008) for ball sizes, and van der Waals radii (Bondi 1964) for space filling. */
const COV: Record<number, number> = { 1: 0.31, 5: 0.84, 6: 0.76, 7: 0.71, 8: 0.66, 9: 0.57, 14: 1.11, 15: 1.07, 16: 1.05, 17: 1.02, 35: 1.2, 53: 1.39 };
const VDW: Record<number, number> = { 1: 1.2, 5: 1.92, 6: 1.7, 7: 1.55, 8: 1.52, 9: 1.47, 14: 2.1, 15: 1.8, 16: 1.8, 17: 1.75, 35: 1.85, 53: 1.98 };

const ident = (): M3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (a: M3, b: M3): M3 => {
  const r = new Array(9).fill(0) as M3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};
/** A turn by `t` radians about the unit axis (x, y, z). */
function axisTurn(x: number, y: number, z: number, t: number): M3 {
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}

export interface PlaceView {
  /** Each atom's position as seen (Å): x right, y up, z towards the reader, centred on the model. */
  view: [number, number, number][];
}

export class Viewer3d {
  private box: FloatBox;
  private canvas: HTMLCanvasElement;
  private info: HTMLSpanElement;
  private model: Model3d | null = null;
  private conf = 0;
  private rot: M3 = ident();
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private style: Style3d = 'ball-stick';
  private showH = true;
  private labels = false;
  private spinning = false;
  private frame = 0;
  private onPlace: ((v: PlaceView) => void) | null = null;
  private prev: HTMLButtonElement;
  private next: HTMLButtonElement;

  constructor(private flash: (msg: string) => void) {
    this.box = new FloatBox('3-D Model', () => {});
    this.box.el.classList.add('viewer3d');
    this.box.el.querySelector<HTMLElement>('.fb-pin')!.hidden = true;
    const b = this.box.body;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'v3d-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '3-D model. Drag to turn it, Shift+drag to move it, the wheel to zoom, arrow keys to turn it in steps.');
    const bar = document.createElement('div');
    bar.className = 'v3d-bar';
    const style = document.createElement('select');
    style.title = 'How the model is drawn';
    style.setAttribute('aria-label', 'Model style');
    for (const [v, l] of [['ball-stick', 'Ball and stick'], ['sticks', 'Sticks'], ['wire', 'Wire'], ['spacefill', 'Space filling']] as const) style.add(new Option(l, v));
    style.addEventListener('change', () => { this.style = style.value as Style3d; this.draw(); });
    const check = (label: string, title: string, on: boolean, set: (v: boolean) => void) => {
      const l = document.createElement('label');
      l.title = title;
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = on;
      c.addEventListener('change', () => { set(c.checked); this.draw(); });
      l.append(c, label);
      return l;
    };
    const spin = document.createElement('button');
    spin.type = 'button';
    spin.textContent = 'Spin';
    spin.title = 'Turn the model slowly round and round';
    spin.setAttribute('aria-pressed', 'false');
    spin.addEventListener('click', () => { this.spinning = !this.spinning; spin.setAttribute('aria-pressed', String(this.spinning)); if (this.spinning) this.tick(); });
    bar.append(style, check('H', 'Show hydrogens', this.showH, (v) => (this.showH = v)), check('Labels', 'Show element symbols (not C or H)', this.labels, (v) => (this.labels = v)), spin);

    const confBar = document.createElement('div');
    confBar.className = 'v3d-bar';
    this.prev = document.createElement('button');
    this.prev.type = 'button';
    this.prev.textContent = '‹';
    this.prev.title = 'Previous conformer (lower energy)';
    this.prev.addEventListener('click', () => this.pick(this.conf - 1));
    this.next = document.createElement('button');
    this.next.type = 'button';
    this.next.textContent = '›';
    this.next.title = 'Next conformer (higher energy)';
    this.next.addEventListener('click', () => this.pick(this.conf + 1));
    this.info = document.createElement('span');
    this.info.className = 'v3d-info';
    confBar.append(this.prev, this.info, this.next);

    const actions = document.createElement('div');
    actions.className = 'v3d-bar';
    const place = document.createElement('button');
    place.type = 'button';
    place.textContent = 'Place on Page';
    place.title = 'Turn the drawn structure to match this view (an undoable step); wedges and crossings follow the depth';
    place.addEventListener('click', () => { if (this.onPlace) this.onPlace({ view: this.viewCoords() }); });
    const copyPic = document.createElement('button');
    copyPic.type = 'button';
    copyPic.textContent = 'Copy Picture';
    copyPic.title = 'Copy this view as a picture (PNG)';
    copyPic.addEventListener('click', () => void this.copyPicture());
    const copyMol = document.createElement('button');
    copyMol.type = 'button';
    copyMol.textContent = 'Copy MOL';
    copyMol.title = 'Copy this conformer as a 3-D molfile (with hydrogens), for Chem3D, Avogadro, PyMOL or a calculation';
    copyMol.addEventListener('click', () => void this.copyMol());
    actions.append(place, copyPic, copyMol);
    b.append(this.canvas, bar, confBar, actions);
    this.wire();
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  get open(): boolean {
    return this.box.open;
  }

  /**
   * Show a model; `onPlace` is called with the view when Place on Page is pressed. `drawn` (the
   * drawn atoms' page positions, in molfile order) turns it to start out looking like the drawing.
   */
  show(model: Model3d, title: string, onPlace: (v: PlaceView) => void, drawn?: ({ x: number; y: number } | null)[]): void {
    this.model = model;
    this.onPlace = onPlace;
    this.box.title = title;
    this.conf = 0;
    this.drawn = drawn ?? null;
    this.reset();
    this.box.show();
    this.pick(0);
    this.canvas.focus();
  }

  /** Something to show while the model is being built. */
  showBusy(title: string): void {
    this.model = null;
    this.box.title = title;
    this.info.textContent = 'Building the 3-D model…';
    this.box.show();
    this.draw();
  }

  close(): void {
    this.spinning = false;
    this.box.close();
  }

  private drawn: ({ x: number; y: number } | null)[] | null = null;

  private reset(): void {
    this.rot = this.model ? this.facing() : ident();
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }

  private pick(k: number): void {
    const m = this.model;
    if (!m) return;
    this.conf = Math.max(0, Math.min(k, m.conformers.length - 1));
    const n = m.conformers.length, e0 = m.conformers[0].energy, e = m.conformers[this.conf].energy;
    this.info.textContent = `Conformer ${this.conf + 1} of ${n}` + (e !== null && e0 !== null ? (this.conf ? ` · +${(e - e0).toFixed(1)} kcal/mol` : ` · ${e.toFixed(1)} kcal/mol`) : '');
    this.info.title = 'MMFF94s+ energies after relaxing each conformer; the first is the lowest found (not a full search)';
    this.prev.disabled = this.conf === 0;
    this.next.disabled = this.conf >= n - 1;
    this.draw();
  }

  /** The turn that makes the model look most like the drawing (or no turn, without one). */
  private facing(): M3 {
    const d = this.drawn;
    if (!d) return ident();
    this.rot = ident();
    const v = this.viewCoords();
    const P: [number, number, number][] = [], Q: [number, number, number][] = [];
    d.forEach((p, i) => { if (p && v[i]) { P.push(v[i]); Q.push([p.x, -p.y, 0]); } });
    if (P.length < 3) return ident();
    const { axis, angle } = hornFit(P, Q);
    return rotation(axis, angle) as M3;
  }

  /** The current conformer's atom positions, centred, in Å. */
  private coords(): [number, number, number][] {
    const m = this.model!;
    const xyz = m.conformers[this.conf].xyz;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < m.atoms.length; i++) pts.push([xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]]);
    const heavy = pts.filter((_, i) => m.atoms[i].z !== 1);
    const c = (heavy.length ? heavy : pts).reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / (heavy.length || pts.length));
    return pts.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
  }

  /** Positions as seen: turned by the view (x right, y up, z towards the reader). */
  private viewCoords(): [number, number, number][] {
    const r = this.rot;
    // OpenChemLib's y runs down the page, as the drawing's does
    return this.coords().map(([x, y, z]) => {
      const yy = -y, zz = -z;
      return [r[0] * x + r[1] * yy + r[2] * zz, r[3] * x + r[4] * yy + r[5] * zz, r[6] * x + r[7] * yy + r[8] * zz];
    });
  }

  private wire(): void {
    const c = this.canvas;
    let last: { x: number; y: number } | null = null;
    let moving = false;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
      moving = e.shiftKey || e.button === 2;
      this.spinning = false;
    });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (moving) { this.pan.x += dx; this.pan.y += dy; }
      else this.turn(dx, dy);
      this.draw();
    });
    const up = () => { last = null; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.2, Math.min(8, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.draw();
    }, { passive: false });
    c.addEventListener('dblclick', () => { this.reset(); this.draw(); });
    c.title = 'Drag to turn, Shift+drag to move, wheel to zoom, double-click to go back to the drawing\'s view';
    c.addEventListener('keydown', (e) => {
      const step = 18;
      if (e.key === 'ArrowLeft') this.turn(-step, 0);
      else if (e.key === 'ArrowRight') this.turn(step, 0);
      else if (e.key === 'ArrowUp') this.turn(0, -step);
      else if (e.key === 'ArrowDown') this.turn(0, step);
      else if (e.key === '+' || e.key === '=') this.zoom = Math.min(8, this.zoom * 1.2);
      else if (e.key === '-') this.zoom = Math.max(0.2, this.zoom / 1.2);
      else if (e.key === 'Home') this.reset();
      else return;
      e.preventDefault();
      this.draw();
    });
  }

  /** Turn by a drag of (dx, dy) screen pixels: about the axis at right angles to it. */
  private turn(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    if (!len) return;
    // screen y runs down; the view's y runs up
    this.rot = mul(axisTurn(dy / len, dx / len, 0, len * 0.01), this.rot);
  }

  private tick(): void {
    if (!this.spinning || !this.open) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.rot = mul(axisTurn(0, 1, 0, 0.012), this.rot);
      this.draw();
      this.tick();
    });
  }

  /** Draw the model, back to front. */
  draw(ctx2?: CanvasRenderingContext2D, size?: { w: number; h: number }): void {
    const c = this.canvas;
    const w = size?.w ?? c.clientWidth, h = size?.h ?? c.clientHeight;
    if (!w || !h) return;
    const dpr = size ? 1 : window.devicePixelRatio || 1;
    if (!size && (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr))) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = ctx2 ?? c.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(this.box.el);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css.getPropertyValue('--panel').trim() || '#fff';
    ctx.fillRect(0, 0, w, h);
    const m = this.model;
    if (!m) return;
    const pts = this.viewCoords();
    const shown = m.atoms.map((a) => this.showH || a.z !== 1);
    const radius = Math.max(2, ...pts.filter((_, i) => shown[i]).map(([x, y]) => Math.hypot(x, y)));
    const scale = (Math.min(w, h) / 2 / (radius + 1.6)) * this.zoom;
    const cam = (radius + 1.6) * 6;
    // a little perspective: nearer atoms a little larger
    const proj = (p: [number, number, number]) => {
      const f = cam / (cam - p[2]);
      return { x: w / 2 + this.pan.x + p[0] * scale * f, y: h / 2 + this.pan.y - p[1] * scale * f, f };
    };
    const P = pts.map(proj);
    const ink = css.getPropertyValue('--text').trim() || '#000';
    type Item = { z: number; draw: () => void };
    const items: Item[] = [];
    const ballR = (z: number) => {
      if (this.style === 'spacefill') return (VDW[z] ?? 2.0) * scale;
      if (this.style === 'ball-stick') return (z === 1 ? 0.22 : 0.18 + 0.38 * (COV[z] ?? 1.3)) * scale;
      if (this.style === 'sticks') return 0.14 * scale;
      return 0;
    };
    const stickW = this.style === 'wire' ? 1.5 : this.style === 'sticks' ? 0.28 * scale : 0.12 * scale;
    if (this.style !== 'spacefill') {
      for (const b of m.bonds) {
        if (!shown[b.a] || !shown[b.b]) continue;
        const p = P[b.a], q = P[b.b];
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
        const lines = this.style === 'ball-stick' && !b.aromatic ? Math.min(3, b.order) : 1;
        const gap = Math.min(stickW * 1.3, 0.16 * scale);
        for (const [from, to, atom] of [[p, mid, b.a], [mid, q, b.b]] as const) {
          items.push({
            z: (pts[b.a][2] + pts[b.b][2]) / 2 + (atom === b.a ? (pts[b.a][2] - pts[b.b][2]) / 4 : (pts[b.b][2] - pts[b.a][2]) / 4) - 0.01,
            draw: () => {
              ctx.strokeStyle = colourOf(m.atoms[atom].z);
              ctx.lineCap = 'round';
              for (let k = 0; k < lines; k++) {
                const o = (k - (lines - 1) / 2) * gap * 1.6;
                ctx.lineWidth = lines > 1 ? stickW * 0.6 : stickW;
                ctx.beginPath();
                ctx.moveTo(from.x + nx * o, from.y + ny * o);
                ctx.lineTo(to.x + nx * o, to.y + ny * o);
                ctx.stroke();
              }
            },
          });
        }
      }
    }
    if (this.style !== 'wire') {
      m.atoms.forEach((a, i) => {
        if (!shown[i]) return;
        const r = ballR(a.z) * P[i].f;
        items.push({
          z: pts[i][2],
          draw: () => {
            const { x, y } = P[i];
            const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.35, colourOf(a.z));
            g.addColorStop(1, shade(colourOf(a.z), 0.45));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            if (a.z === 1 || a.z === 6) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.stroke(); }
          },
        });
      });
    }
    items.sort((p, q) => p.z - q.z);
    for (const it of items) it.draw();
    if (this.labels || this.style === 'wire') {
      ctx.font = `600 ${Math.max(10, Math.min(16, 0.5 * scale))}px ${css.getPropertyValue('--ui-font') || 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      m.atoms.forEach((a, i) => {
        if (!shown[i] || a.z === 6 || a.z === 1) return;
        const t = (SYMBOLS[a.z] ?? '?') + (a.charge ? (Math.abs(a.charge) > 1 ? Math.abs(a.charge) : '') + (a.charge > 0 ? '+' : '−') : '');
        ctx.lineWidth = 3;
        ctx.strokeStyle = ctx.fillStyle = css.getPropertyValue('--panel').trim() || '#fff';
        ctx.strokeText(t, P[i].x, P[i].y);
        ctx.fillStyle = ink;
        ctx.fillText(t, P[i].x, P[i].y);
      });
    }
  }

  private async copyPicture(): Promise<void> {
    const w = this.canvas.clientWidth * 3, h = this.canvas.clientHeight * 3;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    // three times the window's size, for slides and print
    const z = this.zoom, p = { ...this.pan };
    this.pan = { x: p.x * 3, y: p.y * 3 };
    this.draw(ctx, { w, h });
    this.zoom = z;
    this.pan = p;
    const blob = await new Promise<Blob | null>((res) => off.toBlob(res, 'image/png'));
    try {
      if (!blob) throw new Error('no picture');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.flash('Copied the 3-D view as a picture.');
    } catch {
      this.flash('Could not copy the picture here. Take a screenshot instead.');
    }
  }

  private async copyMol(): Promise<void> {
    const m = this.model;
    if (!m) return;
    try {
      await navigator.clipboard.writeText(molfile3d(m, this.conf, this.box.el.querySelector('.fb-title')?.textContent ?? ''));
      this.flash('Copied the conformer as a 3-D molfile.');
    } catch {
      this.flash('Could not copy to the clipboard here.');
    }
  }
}

/** A colour made darker by `k` (0 to 1), for the shaded side of a ball. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** A conformer as a V2000 molfile with 3-D coordinates (Å), hydrogens included. */
export function molfile3d(m: Model3d, conf: number, name = ''): string {
  const xyz = m.conformers[conf].xyz;
  const f = (v: number) => v.toFixed(4).padStart(10);
  const i3 = (v: number) => String(v).padStart(3);
  const lines = [name.slice(0, 80), '  ChemIllustrator3D', '', `${i3(m.atoms.length)}${i3(m.bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
  m.atoms.forEach((a, i) => {
    const sym = (SYMBOLS[a.z] ?? 'C').padEnd(3);
    // OpenChemLib's y runs down: turn it back to a right-handed frame
    lines.push(`${f(xyz[3 * i])}${f(-xyz[3 * i + 1])}${f(-xyz[3 * i + 2])} ${sym} 0  0  0  0  0  0  0  0  0  0  0  0`);
  });
  for (const b of m.bonds) lines.push(`${i3(b.a + 1)}${i3(b.b + 1)}${i3(b.order)}  0`);
  const charged = m.atoms.map((a, i) => [i, a.charge] as const).filter(([, c]) => c);
  for (let k = 0; k < charged.length; k += 8) {
    const part = charged.slice(k, k + 8);
    lines.push(`M  CHG${i3(part.length)}${part.map(([i, c]) => ` ${i3(i + 1)} ${i3(c)}`).join('')}`);
  }
  lines.push('M  END', '');
  return lines.join('\n');
}
