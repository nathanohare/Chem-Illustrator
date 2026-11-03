// The predicted spectrum drawings for Analysis ▸ NMR: a small strip in the panel and a movable
// Spectrum window popped out from it, with zoom, labels, field and quality choices, Copy as Picture
// and Put on Canvas. 1H is the simulated spectrum; 13C is one line per carbon set.

import type { ProtonGroup } from '../chem/nmr/coupling';
import { multipletHalfWidth, sampleSpectrum, type NmrQuality, type PredictedSpectrum } from '../chem/nmr/spectrum';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** What one drawing shows. */
export interface SpectrumData {
  nuc: '1H' | '13C';
  /** 1H: the simulated spectrum. */
  spec?: PredictedSpectrum;
  /** 13C: one line per carbon set (shift, carbons). */
  sticks?: { shift: number; n: number; row: number }[];
  /** 1H: list row index for each proton group (same order as spec.groups), -1 when none. */
  groupRows?: number[];
  /** A measured list to draw against the prediction (Check Data). */
  measured?: MeasuredOverlay;
}

export interface DrawOpts { w: number; h: number; hi: number; lo: number; labels: boolean; hotRow: number | null }

/** A default ppm range: the predicted signals with a margin, on whole or half ppm. */
export function autoRange(d: SpectrumData): { hi: number; lo: number } {
  const xs = d.nuc === '1H' ? (d.spec?.groups ?? []).map((g) => g.shift) : (d.sticks ?? []).map((s) => s.shift);
  if (d.measured) xs.push(...d.measured.links.map((l) => l.m), ...d.measured.marks.map((m) => m.ppm));
  if (!xs.length) return d.nuc === '1H' ? { hi: 10, lo: 0 } : { hi: 220, lo: 0 };
  const m = d.nuc === '1H' ? 0.5 : 10;
  const hi = Math.ceil((Math.max(...xs) + m) / m) * m, lo = Math.max(d.nuc === '1H' ? -0.5 : -10, Math.floor((Math.min(...xs) - m) / m) * m);
  return { hi, lo };
}

function ticks(hi: number, lo: number, w: number): number[] {
  const span = hi - lo, want = Math.max(2, Math.floor(w / 60));
  const step = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => span / s <= want) ?? 50;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
}

const multText = (g: ProtonGroup) => g.mult;

/** A measured list drawn against the prediction (Check Data). */
export interface MeasuredOverlay {
  /** 1H: the list drawn as first-order lines. */
  spec?: PredictedSpectrum;
  /** 13C: one line per listed peak. */
  sticks?: { shift: number; n: number }[];
  /** Matched pairs: measured and predicted shift, how well they agree. */
  links: { m: number; p: number; sev: Severity }[];
  /** Labels over measured peaks that need a look. */
  marks: { ppm: number; text: string; sev: Severity }[];
}
export type Severity = 'ok' | 'warn' | 'bad' | 'info';

/** Per pixel column, the highest point of a sampled spectrum (narrow lines never vanish). */
function columns(spec: PredictedSpectrum, o: DrawOpts): { col: Float64Array; ymax: number; n: number; y: Float64Array } {
  const n = Math.max(64, Math.round(o.w * 3));
  const { y } = sampleSpectrum(spec, o.hi, o.lo, n);
  // the third-tallest point sets the height, so one tall singlet does not flatten the rest
  const sortedY = [...y].sort((a, b) => b - a);
  const ymax = (sortedY[Math.min(2 * Math.round(n / o.w), n - 1)] || sortedY[0] || 1) * 1.08;
  const cols = Math.round(o.w), col = new Float64Array(cols);
  for (let c = 0; c < cols; c++) {
    let m = 0;
    for (let i = Math.floor((c * n) / cols); i < Math.floor(((c + 1) * n) / cols); i++) m = Math.max(m, y[i]);
    col[c] = m;
  }
  return { col, ymax, n, y };
}

/** The spectrum as SVG (theme colors from CSS variables). Peaks carry data-row for hovering. With
 *  overlay and measured data: the measured list above, the prediction mirrored below. */
export function spectrumSvg(d: SpectrumData, o: DrawOpts & { overlay?: boolean }): string {
  const ov = o.overlay && d.measured ? d.measured : null;
  const top = o.labels ? 18 : 4, bot = 15;
  const mid = ov ? top + (o.h - top - bot) / 2 : 0;
  // predicted band: base line and height (upward normally, downward under an overlay)
  const pBase = ov ? mid + 2 : o.h - bot, pH = ov ? o.h - bot - mid - 4 : o.h - top - bot, pDir = ov ? 1 : -1;
  const xs = (v: number) => ((o.hi - v) / (o.hi - o.lo)) * o.w;
  let s = `<svg class="nmr-spec" viewBox="0 0 ${o.w} ${o.h}" width="${o.w}" height="${o.h}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="0" y="0" width="${o.w}" height="${o.h}" class="sp-bg"/>`;
  const trace = (col: Float64Array, ymax: number, base: number, h: number, dir: number, from = 0, to = col.length) => {
    let path = '';
    for (let c = from; c < to; c++) path += `${path ? 'L' : 'M'}${c + 0.5},${(base + dir * Math.min(1, col[c] / ymax) * h).toFixed(1)}`;
    return path;
  };
  if (d.nuc === '1H' && d.spec) {
    const { col, ymax } = columns(d.spec, o);
    s += `<path d="${trace(col, ymax, pBase, pH, pDir)}" class="sp-line"/>`;
    const groups = d.spec.groups;
    if (o.hotRow !== null && d.groupRows) {
      groups.forEach((g, gi) => {
        if (d.groupRows![gi] !== o.hotRow) return;
        const hw = multipletHalfWidth(g, d.spec!.sf);
        const c0 = Math.max(0, Math.floor(xs(g.shift + hw))), c1 = Math.min(col.length, Math.ceil(xs(g.shift - hw)));
        if (c1 > c0) s += `<path d="${trace(col, ymax, pBase, pH, pDir, c0, c1)}" class="sp-hot"/>`;
      });
    }
    if (o.labels && !ov) {
      const placed: number[] = [];
      [...groups].sort((a, b) => b.shift - a.shift).forEach((g) => {
        let x = xs(g.shift);
        if (x < 0 || x > o.w) return;
        for (const q of placed) if (Math.abs(q - x) < 36) x = q + 36;
        placed.push(x);
        s += `<text x="${x.toFixed(1)}" y="12" text-anchor="middle" class="sp-lab">${esc(multText(g))} ${g.n}H</text>`;
      });
    }
  } else if (d.sticks) {
    const maxN = Math.max(1, ...d.sticks.map((k) => k.n));
    for (const k of d.sticks) {
      const x = xs(k.shift);
      if (x < 0 || x > o.w) continue;
      const hot = o.hotRow === k.row;
      s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pBase}" y2="${(pBase + pDir * (0.55 + 0.45 * (k.n / maxN)) * pH).toFixed(1)}" class="${hot ? 'sp-hot' : 'sp-line'}"/>`;
      if (o.labels && !ov) s += `<text x="${x.toFixed(1)}" y="12" text-anchor="middle" class="sp-tick">${k.shift.toFixed(1)}</text>`;
    }
  }
  if (ov) {
    const mBase = mid - 2, mH = mid - 2 - top;
    if (ov.spec) {
      const { col, ymax } = columns(ov.spec, o);
      s += `<path d="${trace(col, ymax, mBase, mH, -1)}" class="sp-meas"/>`;
    } else if (ov.sticks) {
      const maxN = Math.max(1, ...ov.sticks.map((k) => k.n));
      for (const k of ov.sticks) {
        const x = xs(k.shift);
        if (x >= 0 && x <= o.w) s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${mBase}" y2="${(mBase - (0.55 + 0.45 * (k.n / maxN)) * mH).toFixed(1)}" class="sp-meas"/>`;
      }
    }
    s += `<line x1="0" x2="${o.w}" y1="${mid}" y2="${mid}" class="sp-ax"/>`;
    for (const l of ov.links) s += `<path d="M${xs(l.m).toFixed(1)},${mid - 2}L${xs(l.p).toFixed(1)},${mid + 2}" class="sp-link sp-${l.sev}"/>`;
    const placed: number[] = [];
    for (const m of [...ov.marks].sort((a, b) => b.ppm - a.ppm)) {
      let x = xs(m.ppm);
      if (x < 0 || x > o.w) continue;
      for (const q of placed) if (Math.abs(q - x) < 56) x = q + 56;
      placed.push(x);
      s += `<text x="${x.toFixed(1)}" y="12" text-anchor="middle" class="sp-mark sp-${m.sev}">${esc(m.text)}</text>`;
    }
    s += `<text x="5" y="${top + 10}" class="sp-tick">Measured</text><text x="5" y="${o.h - bot - 5}" class="sp-tick">Predicted</text>`;
  }
  s += `<line x1="0" x2="${o.w}" y1="${o.h - bot + 0.5}" y2="${o.h - bot + 0.5}" class="sp-ax"/>`;
  for (const v of ticks(o.hi, o.lo, o.w)) {
    const x = xs(v);
    if (x < 6 || x > o.w - 6) continue;
    s += `<line x1="${x}" x2="${x}" y1="${o.h - bot + 0.5}" y2="${o.h - bot + 3.5}" class="sp-ax"/><text x="${x}" y="${o.h - 3}" text-anchor="middle" class="sp-tick">${v}</text>`;
  }
  return s + '</svg>';
}

/** The list row nearest a ppm position (within a multiplet's reach), or null. */
export function rowAt(d: SpectrumData, ppm: number, tolerance: number): number | null {
  if (d.nuc === '1H' && d.spec && d.groupRows) {
    let best: number | null = null, bd = Infinity;
    d.spec.groups.forEach((g, gi) => {
      const dist = Math.abs(g.shift - ppm), reach = multipletHalfWidth(g, d.spec!.sf) + tolerance;
      if (dist <= reach && dist < bd && d.groupRows![gi] >= 0) { bd = dist; best = d.groupRows![gi]; }
    });
    return best;
  }
  let best: number | null = null, bd = tolerance;
  for (const k of d.sticks ?? []) { const dist = Math.abs(k.shift - ppm); if (dist <= bd) { bd = dist; best = k.row; } }
  return best;
}

/** An SVG drawing as PNG bytes, with the theme variables filled in. */
export async function svgToPng(svg: string, scale = 2): Promise<Uint8Array> {
  const css = getComputedStyle(document.documentElement);
  // pictures go on white paper with dark lines, whatever the theme
  const style = `<style>.sp-bg{fill:#fff}.sp-line{fill:none;stroke:#1d2527;stroke-width:1}.sp-hot{fill:none;stroke:${css.getPropertyValue('--accent').trim() || '#0e7c86'};stroke-width:1.8}.sp-lab{font-size:10px;fill:#1d2527}.sp-tick{font-size:9.5px;fill:#5f6b6e}.sp-ax{stroke:#9aa5a7}.sp-meas{fill:none;stroke:${css.getPropertyValue('--accent').trim() || '#0e7c86'};stroke-width:1}.sp-link{fill:none;stroke-width:1.4}.sp-ok{stroke:#3c9a5f;fill:#3c9a5f}.sp-warn{stroke:#d08a1e;fill:#d08a1e}.sp-bad{stroke:#c4483e;fill:#c4483e}.sp-info{stroke:#7b8a8f;fill:#7b8a8f}.sp-mark{stroke:none;font-size:10px;font-weight:600}text{font-family:system-ui,sans-serif}</style>`;
  const solid = svg.replace(/(<svg[^>]*>)/, `$1${style}`);
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(solid)!;
  const w = +m[1], h = +m[2];
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(solid);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No picture'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export interface SpectrumWindowHost {
  /** The data for the current structure at this field and quality (null when nothing is shown). */
  data(sf: number, quality: NmrQuality): SpectrumData | null;
  hover(row: number | null): void;
  copyPicture(png: Uint8Array): Promise<void>;
  putOnCanvas(png: Uint8Array): void;
  flash(text: string): void;
  closed(): void;
}

/** The popped-out Spectrum window: drag by its title, resize from the corner, wheel to zoom, double-click to fit. */
export class SpectrumWindow {
  readonly el: HTMLDivElement;
  private range: { hi: number; lo: number } | null = null;
  private hotRow: number | null = null;
  private d: SpectrumData | null = null;
  private ro: ResizeObserver;

  get sf(): number { try { return Number(localStorage.getItem('ci-nmr-mhz')) || 400; } catch { return 400; } }
  set sf(v: number) { try { localStorage.setItem('ci-nmr-mhz', String(v)); } catch { /* not remembered */ } }
  get quality(): NmrQuality { try { const q = localStorage.getItem('ci-nmr-quality'); return q === 'fast' || q === 'accurate' ? q : 'balanced'; } catch { return 'balanced'; } }
  set quality(v: NmrQuality) { try { localStorage.setItem('ci-nmr-quality', v); } catch { /* not remembered */ } }

  constructor(private host: SpectrumWindowHost) {
    const el = document.createElement('div');
    el.className = 'nmr-spec-win';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Predicted spectrum');
    el.innerHTML = `<div class="nmr-spec-hd"><span class="nmr-spec-title"></span><span class="info-icon" tabindex="0" role="img" aria-label="About the spectrum" title="Simulated from the predicted shifts and coupling constants. Coupled protons are simulated exactly, so second-order patterns (roofing, AA'XX') show as they would be measured. Couplings come from the 2D structure, so ring protons use averaged values. Scroll to zoom; double-click to show everything; hover a peak to find its atoms.">i</span>
      <span class="nmr-spec-tools"><select class="nmr-spec-mhz" title="Spectrometer frequency">${[300, 400, 500, 600, 800].map((m) => `<option value="${m}"${m === this.sf ? ' selected' : ''}>${m} MHz</option>`).join('')}</select><select class="nmr-spec-quality" title="Fast: first-order multiplets. Balanced: exact simulation of up to 8 coupled protons. Accurate: up to 12.">${(['fast', 'balanced', 'accurate'] as const).map((q) => `<option value="${q}"${q === this.quality ? ' selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select><button type="button" class="nmr-spec-copy" title="Copy the spectrum as a picture">Copy as Picture</button><button type="button" class="nmr-spec-put" title="Put the spectrum on the drawing as a picture">Put on Canvas</button><button type="button" class="nmr-spec-close" aria-label="Close" title="Close">×</button></span></div><div class="nmr-spec-plot"></div>`;
    this.el = el;
    document.body.appendChild(el);
    const plot = el.querySelector<HTMLElement>('.nmr-spec-plot')!;
    // drag by the title bar
    const hd = el.querySelector<HTMLElement>('.nmr-spec-hd')!;
    hd.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('select, button, .info-icon')) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      hd.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        el.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx))}px`;
        el.style.top = `${Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - dy))}px`;
      };
      const up = () => { hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', up); };
      hd.addEventListener('pointermove', move);
      hd.addEventListener('pointerup', up);
    });
    el.querySelector('.nmr-spec-mhz')!.addEventListener('change', (e) => { this.sf = Number((e.target as HTMLSelectElement).value); this.refresh(); });
    el.querySelector('.nmr-spec-quality')!.addEventListener('change', (e) => { this.quality = (e.target as HTMLSelectElement).value as NmrQuality; this.refresh(); });
    el.querySelector('.nmr-spec-close')!.addEventListener('click', () => this.close());
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    el.querySelector('.nmr-spec-copy')!.addEventListener('click', () => void this.picture().then((p) => this.host.copyPicture(p)).then(() => this.host.flash('Copied the spectrum as a picture.'), () => this.host.flash('Copying was refused by the system.')));
    el.querySelector('.nmr-spec-put')!.addEventListener('click', () => void this.picture().then((p) => this.host.putOnCanvas(p), () => this.host.flash('Could not make the picture.')));
    plot.addEventListener('wheel', (e) => {
      if (!this.d) return;
      e.preventDefault();
      const r = this.range ?? autoRange(this.d), w = plot.clientWidth;
      const at = r.hi - ((e.clientX - plot.getBoundingClientRect().left) / w) * (r.hi - r.lo);
      const k = e.deltaY > 0 ? 1.25 : 0.8;
      const full = autoRange(this.d), minSpan = this.d.nuc === '1H' ? 0.05 : 2;
      let hi = at + (r.hi - at) * k, lo = at - (at - r.lo) * k;
      if (hi - lo < minSpan) { hi = at + minSpan / 2; lo = at - minSpan / 2; }
      this.range = hi - lo >= full.hi - full.lo ? null : { hi: Math.min(hi, full.hi + 1), lo: Math.max(lo, full.lo - 1) };
      this.draw();
    }, { passive: false });
    plot.addEventListener('dblclick', () => { this.range = null; this.draw(); });
    plot.addEventListener('pointermove', (e) => {
      if (!this.d) return;
      const r = this.range ?? autoRange(this.d), w = plot.clientWidth;
      const ppm = r.hi - ((e.clientX - plot.getBoundingClientRect().left) / w) * (r.hi - r.lo);
      const row = rowAt(this.d, ppm, (r.hi - r.lo) / 80);
      if (row !== this.hotRow) { this.hotRow = row; this.draw(); this.host.hover(row); }
    });
    plot.addEventListener('pointerleave', () => { if (this.hotRow !== null) { this.hotRow = null; this.draw(); this.host.hover(null); } });
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(plot);
  }

  /** Shows the window near the panel (first time) and draws the current structure. */
  open(near: DOMRect | null): void {
    if (!this.el.style.left) {
      const w = Math.min(760, window.innerWidth - 40);
      this.el.style.width = `${w}px`;
      this.el.style.left = `${Math.max(10, (near ? near.left : window.innerWidth) - w - 16)}px`;
      this.el.style.top = `${Math.max(60, window.innerHeight - 380)}px`;
    }
    this.el.hidden = false;
    this.refresh();
  }

  close(): void { this.el.hidden = true; this.host.hover(null); this.host.closed(); }
  get visible(): boolean { return !this.el.hidden; }

  /** Re-reads the data (structure, nucleus, field or quality changed). */
  refresh(): void {
    if (this.el.hidden) return;
    const prev = this.d?.nuc;
    this.d = this.host.data(this.sf, this.quality);
    if (this.d?.nuc !== prev) this.range = null;
    const nucHtml = this.d?.nuc === '13C' ? '<sup>13</sup>C' : '<sup>1</sup>H';
    this.el.querySelector('.nmr-spec-title')!.innerHTML = this.d?.measured ? `Measured vs Predicted ${nucHtml} Spectrum` : `Predicted ${nucHtml} Spectrum`;
    this.el.querySelector<HTMLElement>('.nmr-spec-mhz')!.hidden = this.d?.nuc === '13C';
    this.el.querySelector<HTMLElement>('.nmr-spec-quality')!.hidden = this.d?.nuc === '13C';
    this.draw();
  }

  /** Highlights a list row's peaks (hover in the panel). */
  highlight(row: number | null): void { if (row !== this.hotRow) { this.hotRow = row; this.draw(); } }

  private draw(): void {
    const plot = this.el.querySelector<HTMLElement>('.nmr-spec-plot')!;
    if (this.el.hidden) return;
    if (!this.d) { plot.innerHTML = '<p class="muted small">Select a structure to see its predicted spectrum.</p>'; return; }
    const w = Math.max(200, plot.clientWidth), h = Math.max(120, plot.clientHeight);
    const r = this.range ?? autoRange(this.d);
    plot.innerHTML = spectrumSvg(this.d, { w, h, hi: r.hi, lo: r.lo, labels: true, hotRow: this.hotRow, overlay: true });
  }

  private picture(): Promise<Uint8Array> {
    if (!this.d) return Promise.reject(new Error('Nothing to copy'));
    const r = this.range ?? autoRange(this.d);
    return svgToPng(spectrumSvg(this.d, { w: 720, h: 260, hi: r.hi, lo: r.lo, labels: true, hotRow: null, overlay: true }));
  }

  dispose(): void { this.ro.disconnect(); this.el.remove(); }
}
