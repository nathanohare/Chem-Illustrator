// The predicted spectrum drawings for Analysis ▸ NMR: a small strip in the panel and a movable
// Spectrum window popped out from it, with zoom, labels, field and quality choices, Copy as Picture
// and Put on Canvas. 1H is the simulated spectrum; 13C is one line per carbon set.

import { DEFAULT_PEAK_LABELS, peakLabels, rangeFor, type PeakLabels } from './nmr-settings';
import { multipletHalfWidth, sampleSpectrum, type NmrQuality, type PredictedSpectrum } from '../chem/nmr/spectrum';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** What one drawing shows. */
export interface SpectrumData {
  nuc: '1H' | '13C' | '19F' | '31P';
  /** 1H: the simulated spectrum. */
  spec?: PredictedSpectrum;
  /** 13C, 19F, 31P: one line per set of equivalent atoms (shift, atoms). */
  sticks?: { shift: number; n: number; row: number }[];
  /** 1H: list row index for each proton group (same order as spec.groups), -1 when none. */
  groupRows?: number[];
  /** A measured list to draw against the prediction (Check Data). */
  measured?: MeasuredOverlay;
  /** The list's Atoms column, by row (for the peak labels). */
  rowLabels?: string[];
}

export interface DrawOpts { w: number; h: number; hi: number; lo: number; labels: boolean; hotRow: number | null; /** What the labels say (Settings ▸ NMR Prediction); the default when left out. */ peakLabels?: PeakLabels;
  /** With a measured list: measured above and predicted mirrored below it (inverted), both upright one above the other (stacked), or both on one baseline (overlay). */
  compare?: CompareMode;
  /** The measured trace's height against the predicted one (1 = each scaled to its own tallest peaks). */
  measScale?: number;
  /** A vertical line with its ppm at the pointer. */
  cursor?: number | null }

export type CompareMode = 'inverted' | 'stacked' | 'overlay';
export function compareMode(): CompareMode { try { const m = localStorage.getItem('ci-nmr-compare'); return m === 'stacked' || m === 'overlay' ? m : 'inverted'; } catch { return 'inverted'; } }
export function setCompareMode(v: CompareMode): void { try { localStorage.setItem('ci-nmr-compare', v); } catch { /* not remembered */ } }

/** A default ppm range: the predicted signals with a margin, on whole or half ppm. */
export function autoRange(d: SpectrumData): { hi: number; lo: number } {
  const xs = d.nuc === '1H' ? (d.spec?.groups ?? []).map((g) => g.shift) : (d.sticks ?? []).map((s) => s.shift);
  if (d.measured) xs.push(...d.measured.links.map((l) => l.m), ...d.measured.marks.map((m) => m.ppm));
  if (d.nuc === '1H' || d.nuc === '13C') return rangeFor(d.nuc, xs);
  if (!xs.length) return { hi: 50, lo: -250 };
  const m = 10;
  const hi = Math.ceil((Math.max(...xs) + m) / m) * m, lo = Math.max(-1000, Math.floor((Math.min(...xs) - m) / m) * m);
  return { hi, lo };
}

function ticks(hi: number, lo: number, w: number): number[] {
  const span = hi - lo, want = Math.max(2, Math.floor(w / 60));
  const step = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => span / s <= want) ?? 50;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
}


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

/** The text over each peak: one entry per line, as Settings ▸ NMR Prediction asks. */
function peakLines(d: SpectrumData, p: PeakLabels, sf: number): { ppm: number; row: number; lines: string[] }[] {
  const out: { ppm: number; row: number; lines: string[] }[] = [];
  if (d.nuc === '1H' && d.spec) {
    d.spec.groups.forEach((g, gi) => {
      const row = d.groupRows?.[gi] ?? -1, lines: string[] = [];
      if (p.label && row >= 0 && d.rowLabels?.[row]) lines.push(d.rowLabels[row]);
      if (p.shift) {
        const hw = multipletHalfWidth(g, sf);
        lines.push(g.mult === 'm' && hw > 0.005 ? `${(g.shift + hw).toFixed(2)}–${(g.shift - hw).toFixed(2)}` : g.shift.toFixed(2));
      }
      const mc = [p.mult ? g.mult : '', p.count ? `${g.n}H` : ''].filter(Boolean).join(', ');
      if (mc) lines.push(mc);
      if (p.j && g.j.length) lines.push(`J = ${g.j.map((j) => j.toFixed(1)).join(', ')} Hz`);
      out.push({ ppm: g.shift, row, lines });
    });
  } else if (d.sticks) {
    for (const k of d.sticks) {
      const lines: string[] = [];
      if (p.label && d.rowLabels?.[k.row]) lines.push(d.rowLabels[k.row]);
      if (p.shift || !p.label) lines.push(k.shift.toFixed(1));
      if (p.count && k.n > 1) lines.push(`${k.n}${d.nuc === '13C' ? 'C' : ''}`);
      out.push({ ppm: k.shift, row: k.row, lines });
    }
  }
  return out;
}

/** How tall the labels' band at the top is. */
function labelBand(items: { lines: string[] }[], p: PeakLabels, h: number): number {
  const lh = p.size * 1.2;
  if (!items.some((x) => x.lines.length)) return 4;
  if (p.place === 'top') return lh + 14;
  if (p.place === 'upright') return Math.min(h * 0.45, Math.max(...items.map((x) => x.lines.join(' · ').length)) * p.size * 0.56 + 8);
  return Math.max(...items.map((x) => x.lines.length)) * lh + 6;
}

/** The spectrum as SVG (theme colors from CSS variables). Peaks carry data-row for hovering. With
 *  overlay and measured data: the measured list above, the prediction mirrored below. */
export function spectrumSvg(d: SpectrumData, o: DrawOpts & { overlay?: boolean }): string {
  const ov = o.overlay && d.measured ? d.measured : null;
  const pl = o.labels ? o.peakLabels ?? DEFAULT_PEAK_LABELS : null;
  const items = pl ? peakLines(d, pl, d.spec?.sf ?? 400) : [];
  const top = pl ? labelBand(items, pl, o.h) : o.labels ? 18 : 4, bot = 15;
  const cmp: CompareMode = ov ? o.compare ?? 'inverted' : 'inverted';
  const split = ov && cmp !== 'overlay';
  const mid = split ? top + (o.h - top - bot) / 2 : 0;
  // predicted band: base line and height (upward; downward under the measured list when inverted)
  const pBase = split && cmp === 'inverted' ? mid + 2 : o.h - bot, pH = split ? o.h - bot - mid - 4 : o.h - top - bot, pDir = split && cmp === 'inverted' ? 1 : -1;
  const mk = Math.max(0.1, o.measScale ?? 1);
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
  } else if (d.sticks) {
    const maxN = Math.max(1, ...d.sticks.map((k) => k.n));
    for (const k of d.sticks) {
      const x = xs(k.shift);
      if (x < 0 || x > o.w) continue;
      const hot = o.hotRow === k.row;
      s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pBase}" y2="${(pBase + pDir * (0.55 + 0.45 * (k.n / maxN)) * pH).toFixed(1)}" class="${hot ? 'sp-hot' : 'sp-line'}"/>`;
    }
  }
  if (pl) s += drawPeakLabels(items, pl, o, xs, top);
  if (ov) {
    const mBase = split ? mid - 2 : o.h - bot, mH = split ? mid - 2 - top : o.h - bot - top;
    if (ov.spec) {
      const { col, ymax } = columns(ov.spec, o);
      s += `<path d="${trace(col, ymax / mk, mBase, mH, -1)}" class="sp-meas"/>`;
    } else if (ov.sticks) {
      const maxN = Math.max(1, ...ov.sticks.map((k) => k.n));
      for (const k of ov.sticks) {
        const x = xs(k.shift);
        if (x >= 0 && x <= o.w) s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${mBase}" y2="${(mBase - Math.min(1, (0.55 + 0.45 * (k.n / maxN)) * mk) * mH).toFixed(1)}" class="sp-meas"/>`;
      }
    }
    if (split) {
      s += `<line x1="0" x2="${o.w}" y1="${mid}" y2="${mid}" class="sp-ax"/>`;
      for (const l of ov.links) s += `<path d="M${xs(l.m).toFixed(1)},${mid - 2}L${xs(l.p).toFixed(1)},${mid + 2}" class="sp-link sp-${l.sev}"/>`;
    } else {
      // one baseline: a short tick under each matched pair, measured to predicted
      for (const l of ov.links) s += `<path d="M${xs(l.m).toFixed(1)},${o.h - bot + 1}L${xs(l.p).toFixed(1)},${o.h - bot + 1}" class="sp-link sp-${l.sev}" stroke-width="3"/>`;
    }
    const placed: number[] = [];
    for (const m of [...ov.marks].sort((a, b) => b.ppm - a.ppm)) {
      let x = xs(m.ppm);
      if (x < 0 || x > o.w) continue;
      for (const q of placed) if (Math.abs(q - x) < 56) x = q + 56;
      placed.push(x);
      s += `<text x="${x.toFixed(1)}" y="12" text-anchor="middle" class="sp-mark sp-${m.sev}">${esc(m.text)}</text>`;
    }
    if (split) s += `<text x="5" y="${top + 10}" class="sp-tick">Measured</text><text x="5" y="${o.h - bot - 5}" class="sp-tick">Predicted</text>`;
    else s += `<line x1="6" x2="20" y1="${top + 7}" y2="${top + 7}" class="sp-meas"/><text x="24" y="${top + 10}" class="sp-tick">Measured</text><line x1="86" x2="100" y1="${top + 7}" y2="${top + 7}" class="sp-line"/><text x="104" y="${top + 10}" class="sp-tick">Predicted</text>`;
  }
  s += `<line x1="0" x2="${o.w}" y1="${o.h - bot + 0.5}" y2="${o.h - bot + 0.5}" class="sp-ax"/>`;
  if (o.cursor != null && o.cursor <= o.hi && o.cursor >= o.lo) {
    const x = xs(o.cursor), right = x > o.w - 60;
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${o.h - bot}" class="sp-cursor"/><text x="${(x + (right ? -4 : 4)).toFixed(1)}" y="${o.h - bot - 4}" text-anchor="${right ? 'end' : 'start'}" class="sp-tick sp-cursor-at">${o.cursor.toFixed(d.nuc === '1H' ? 3 : 1)}</text>`;
  }
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

/** The NMR quality setting (Fast, Balanced, Accurate), kept on this computer: the Spectrum window's
 *  dropdown and Settings ▸ Preferences change the same value. */
export function nmrQuality(): NmrQuality { try { const q = localStorage.getItem('ci-nmr-quality'); return q === 'fast' || q === 'accurate' ? q : 'balanced'; } catch { return 'balanced'; } }
export function setNmrQuality(v: NmrQuality): void { try { localStorage.setItem('ci-nmr-quality', v); } catch { /* not remembered */ } }
export function nmrSpectrumMhz(): number { try { return Number(localStorage.getItem('ci-nmr-mhz')) || 400; } catch { return 400; } }
export function setNmrSpectrumMhz(v: number): void { try { localStorage.setItem('ci-nmr-mhz', String(v)); } catch { /* not remembered */ } }

/** The popped-out Spectrum window: drag by its title, resize from the corner, wheel to zoom, double-click to fit. */
export class SpectrumWindow {
  readonly el: HTMLDivElement;
  private range: { hi: number; lo: number } | null = null;
  private hotRow: number | null = null;
  private d: SpectrumData | null = null;
  private ro: ResizeObserver;
  /** The pointer's ppm (the cursor line), the signal last stepped to, the measured height (log2). */
  private cursor: number | null = null;
  private step = -1;
  private measK = 0;

  get sf(): number { return nmrSpectrumMhz(); }
  set sf(v: number) { setNmrSpectrumMhz(v); }
  get quality(): NmrQuality { return nmrQuality(); }
  set quality(v: NmrQuality) { setNmrQuality(v); }

  constructor(private host: SpectrumWindowHost) {
    const el = document.createElement('div');
    el.className = 'nmr-spec-win';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Predicted spectrum');
    el.innerHTML = `<div class="nmr-spec-hd"><span class="nmr-spec-title"></span><span class="info-icon" tabindex="0" role="img" aria-label="About the spectrum" title="Simulated from the predicted shifts and coupling constants. Coupled protons are simulated exactly, so second-order patterns (roofing, AA'XX') show as they would be measured. Couplings come from the 2D structure, so ring protons use averaged values. Scroll to zoom; double-click to show everything; hover a peak to find its atoms.">i</span>
      <span class="nmr-spec-tools"><span class="nmr-cmp seg" role="group" aria-label="Measured against predicted">${(['inverted', 'stacked', 'overlay'] as const).map((m) => `<button type="button" data-cmp="${m}" aria-pressed="${m === compareMode()}" title="${{ inverted: 'Inverted: measured above, predicted mirrored below', stacked: 'Stacked: measured above predicted, both upright', overlay: 'Overlay: both on one baseline' }[m]}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</span><input type="range" class="nmr-meas-k" min="-2" max="2" step="0.1" value="0" title="Height of the measured trace against the predicted one (double-click to reset)" aria-label="Measured height"><button type="button" class="nmr-prev" title="Previous signal (zooms to it; Left arrow)" aria-label="Previous signal">◀</button><button type="button" class="nmr-next" title="Next signal (zooms to it; Right arrow)" aria-label="Next signal">▶</button><button type="button" class="nmr-zout" title="Zoom out (−)" aria-label="Zoom out">−</button><button type="button" class="nmr-zin" title="Zoom in (+)" aria-label="Zoom in">+</button><button type="button" class="nmr-fit" title="Show everything (0, or double-click the spectrum)">Fit</button><select class="nmr-spec-mhz" title="Spectrometer frequency">${[300, 400, 500, 600, 800].map((m) => `<option value="${m}"${m === this.sf ? ' selected' : ''}>${m} MHz</option>`).join('')}</select><select class="nmr-spec-quality" title="Fast: first-order multiplets. Balanced: exact simulation of up to 8 coupled protons. Accurate: up to 10.">${(['fast', 'balanced', 'accurate'] as const).map((q) => `<option value="${q}"${q === this.quality ? ' selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select><button type="button" class="nmr-spec-copy" title="Copy the spectrum as a picture">Copy as Picture</button><button type="button" class="nmr-spec-put" title="Put the spectrum on the drawing as a picture">Put on Canvas</button><button type="button" class="nmr-spec-close" aria-label="Close" title="Close">×</button></span></div><div class="nmr-spec-plot"></div>`;
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
    // drag sideways to pan
    let drag: { x: number; r: { hi: number; lo: number } } | null = null;
    plot.addEventListener('pointerdown', (e) => {
      if (!this.d || e.button !== 0) return;
      drag = { x: e.clientX, r: this.range ?? autoRange(this.d) };
      plot.setPointerCapture(e.pointerId);
    });
    plot.addEventListener('pointerup', () => { drag = null; });
    plot.addEventListener('pointermove', (e) => {
      if (!this.d) return;
      const w = plot.clientWidth;
      if (drag && Math.abs(e.clientX - drag.x) > 2) {
        const full = autoRange(this.d), span = drag.r.hi - drag.r.lo;
        let hi = drag.r.hi + ((e.clientX - drag.x) / w) * span;
        hi = Math.max(full.lo + span, Math.min(full.hi, hi));
        this.range = span >= full.hi - full.lo ? null : { hi, lo: hi - span };
      }
      const r = this.range ?? autoRange(this.d);
      const ppm = r.hi - ((e.clientX - plot.getBoundingClientRect().left) / w) * (r.hi - r.lo);
      this.cursor = ppm;
      const row = rowAt(this.d, ppm, (r.hi - r.lo) / 80);
      if (row !== this.hotRow) { this.hotRow = row; this.host.hover(row); }
      this.draw();
    });
    plot.addEventListener('pointerleave', () => { this.cursor = null; if (this.hotRow !== null) { this.hotRow = null; this.host.hover(null); } this.draw(); });
    // the comparison tools
    for (const b of el.querySelectorAll<HTMLButtonElement>('.nmr-cmp button')) b.addEventListener('click', () => {
      setCompareMode(b.dataset.cmp as CompareMode);
      for (const x of el.querySelectorAll('.nmr-cmp button')) x.setAttribute('aria-pressed', String(x === b));
      this.draw();
    });
    const k = el.querySelector<HTMLInputElement>('.nmr-meas-k')!;
    k.addEventListener('input', () => { this.measK = Number(k.value); this.draw(); });
    k.addEventListener('dblclick', () => { k.value = '0'; this.measK = 0; this.draw(); });
    el.querySelector('.nmr-zin')!.addEventListener('click', () => this.zoom(0.6));
    el.querySelector('.nmr-zout')!.addEventListener('click', () => this.zoom(1 / 0.6));
    el.querySelector('.nmr-fit')!.addEventListener('click', () => { this.range = null; this.draw(); });
    el.querySelector('.nmr-prev')!.addEventListener('click', () => this.stepTo(-1));
    el.querySelector('.nmr-next')!.addEventListener('click', () => this.stepTo(1));
    el.tabIndex = -1;
    el.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('select, input')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.stepTo(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.stepTo(1); }
      else if (e.key === '+' || e.key === '=') this.zoom(0.6);
      else if (e.key === '-') this.zoom(1 / 0.6);
      else if (e.key === '0') { this.range = null; this.draw(); }
    });
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(plot);
  }

  /** Shows the window near the panel (first time) and draws the current structure. */
  open(near: DOMRect | null): void {
    if (!this.el.style.left) {
      const w = Math.min(900, window.innerWidth - 40);
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
    const qs = this.el.querySelector<HTMLSelectElement>('.nmr-spec-quality');
    if (qs) qs.value = this.quality;
    const prev = this.d?.nuc;
    this.d = this.host.data(this.sf, this.quality);
    if (this.d?.nuc !== prev) this.range = null;
    const n = this.d?.nuc ?? '1H';
    const nucHtml = `<sup>${n.slice(0, -1)}</sup>${n.slice(-1)}`;
    this.el.querySelector('.nmr-spec-title')!.innerHTML = this.d?.measured ? `Measured vs Predicted ${nucHtml} Spectrum` : `Predicted ${nucHtml} Spectrum`;
    this.el.querySelector<HTMLElement>('.nmr-spec-mhz')!.hidden = n !== '1H';
    this.el.querySelector<HTMLElement>('.nmr-spec-quality')!.hidden = n !== '1H';
    this.el.querySelector<HTMLElement>('.nmr-cmp')!.hidden = !this.d?.measured;
    this.el.querySelector<HTMLElement>('.nmr-meas-k')!.hidden = !this.d?.measured;
    for (const x of this.el.querySelectorAll('.nmr-cmp button')) x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.cmp === compareMode()));
    this.step = -1;
    this.draw();
  }

  /** Zoom about the middle of what shows (k < 1 zooms in). */
  private zoom(k: number): void {
    if (!this.d) return;
    const full = autoRange(this.d), r = this.range ?? full, c = (r.hi + r.lo) / 2;
    const minSpan = this.d.nuc === '1H' ? 0.05 : 2;
    const half = Math.max(minSpan / 2, ((r.hi - r.lo) * k) / 2);
    this.range = half * 2 >= full.hi - full.lo ? null : { hi: Math.min(full.hi, c + half), lo: Math.max(full.lo, c - half) };
    if (this.range && this.range.hi - this.range.lo < half * 2) { const hi = Math.min(full.hi, this.range.lo + half * 2); this.range = { hi, lo: hi - half * 2 }; }
    this.draw();
  }

  /** The signals, high to low ppm: predicted ones, and with a measured list its peaks too. */
  private signals(): { ppm: number; reach: number; row: number | null }[] {
    const d = this.d;
    if (!d) return [];
    const out: { ppm: number; reach: number; row: number | null }[] = [];
    if (d.nuc === '1H' && d.spec) d.spec.groups.forEach((g, gi) => out.push({ ppm: g.shift, reach: multipletHalfWidth(g, d.spec!.sf), row: d.groupRows?.[gi] ?? null }));
    else for (const k of d.sticks ?? []) out.push({ ppm: k.shift, reach: 0, row: k.row });
    // a matched measured peak goes with its prediction (the pair is shown together)
    for (const l of d.measured?.links ?? []) { const p = out.find((x) => Math.abs(x.ppm - l.p) < 1e-6); if (p) { const lo = Math.min(p.ppm - p.reach, l.m), hi = Math.max(p.ppm + p.reach, l.m); p.ppm = (hi + lo) / 2; p.reach = (hi - lo) / 2; } }
    for (const m of d.measured?.marks ?? []) if (!out.some((x) => Math.abs(x.ppm - m.ppm) <= x.reach + 0.02)) out.push({ ppm: m.ppm, reach: 0, row: null });
    return out.sort((a, b) => b.ppm - a.ppm);
  }

  /** Step to the next (1) or previous (-1) signal, zoomed to show it whole. */
  private stepTo(dir: 1 | -1): void {
    const sig = this.signals();
    if (!sig.length || !this.d) return;
    this.step = this.step < 0 ? (dir > 0 ? 0 : sig.length - 1) : (this.step + dir + sig.length) % sig.length;
    const g = sig[this.step], pad = Math.max(this.d.nuc === '1H' ? 0.15 : 5, g.reach * 1.6);
    this.range = { hi: g.ppm + pad, lo: g.ppm - pad };
    this.hotRow = g.row;
    this.host.hover(g.row);
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
    plot.innerHTML = spectrumSvg(this.d, { w, h, hi: r.hi, lo: r.lo, labels: true, hotRow: this.hotRow, overlay: true, peakLabels: peakLabels(), compare: compareMode(), measScale: 2 ** this.measK, cursor: this.cursor });
  }

  private picture(): Promise<Uint8Array> {
    if (!this.d) return Promise.reject(new Error('Nothing to copy'));
    const r = this.range ?? autoRange(this.d);
    return svgToPng(spectrumSvg(this.d, { w: 720, h: 260, hi: r.hi, lo: r.lo, labels: true, hotRow: null, overlay: true, peakLabels: peakLabels(), compare: compareMode(), measScale: 2 ** this.measK }));
  }

  dispose(): void { this.ro.disconnect(); this.el.remove(); }
}

/** The peak labels in the band at the top, kept apart from one another, with a line down to the peak when moved off it. */
function drawPeakLabels(items: { ppm: number; row: number; lines: string[] }[], p: PeakLabels, o: DrawOpts, xs: (v: number) => number, top: number): string {
  const lh = p.size * 1.2, cw = p.size * 0.56;
  const shown = items
    .map((it) => ({ ...it, x: xs(it.ppm), lines: p.hover && it.row !== o.hotRow ? it.lines.slice(0, 1) : it.lines }))
    .filter((it) => it.lines.length && it.x >= 0 && it.x <= o.w)
    .sort((a, b) => a.x - b.x);
  const font = `font-size="${p.size}"`;
  let s = '';
  if (p.place === 'upright') {
    let last = -Infinity;
    for (const it of shown) {
      const x = Math.max(it.x, last + lh);
      last = x;
      s += `<text transform="translate(${(x + p.size * 0.35).toFixed(1)},${(top - 4).toFixed(1)}) rotate(-90)" class="sp-lab" ${font}>${esc(it.lines.join(' · '))}</text>`;
      if (Math.abs(x - it.x) > 2) s += `<path d="M${x.toFixed(1)},${top - 2}L${it.x.toFixed(1)},${top + 4}" class="sp-lead"/>`;
    }
    return s;
  }
  const one = p.place === 'top';
  const text = (it: { lines: string[] }) => (one ? [it.lines.join(', ')] : it.lines);
  const width = (it: { lines: string[] }) => Math.max(...text(it).map((l) => l.length)) * cw;
  // left to right, each pushed clear of the one before; then the row pulled back inside the right edge
  const xsPlaced: number[] = [];
  let right = -Infinity;
  for (const it of shown) {
    const w = width(it);
    const x = Math.max(it.x, right + w / 2 + 6, w / 2);
    xsPlaced.push(x);
    right = x + w / 2;
  }
  for (let k = shown.length - 1, edge = o.w; k >= 0; k--) {
    const w = width(shown[k]);
    xsPlaced[k] = Math.min(xsPlaced[k], edge - w / 2);
    edge = xsPlaced[k] - w / 2 - 6;
  }
  shown.forEach((it, k) => {
    const x = xsPlaced[k], ls = text(it);
    const y0 = one ? lh : top - 6 - (ls.length - 1) * lh;
    ls.forEach((l, li) => { s += `<text x="${x.toFixed(1)}" y="${(y0 + li * lh).toFixed(1)}" text-anchor="middle" class="sp-lab" ${font}>${esc(l)}</text>`; });
    if (one || Math.abs(x - it.x) > 2) s += `<path d="M${x.toFixed(1)},${(one ? lh + 3 : top - 4).toFixed(1)}L${it.x.toFixed(1)},${(top - 1).toFixed(1)}" class="sp-lead"/>`;
  });
  return s;
}
