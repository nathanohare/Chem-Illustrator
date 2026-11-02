// Analysis ▸ NMR (predicted): a table of predicted 13C and 1H shifts for each structure in the
// Analysis panel, with numbered markers on the drawing that match the table's atom numbers.
// The shifts come from the lookup in src/chem/nmr (public/nmr/nmr-hose.dat), loaded on first use.

import type { NamerGraph } from '../chem/namer-graph';
import { envCodes } from '../chem/nmr/env';
import { ShiftTable, type AtomShifts, type ShiftHit } from '../chem/nmr/lookup';

export const NMR_SOLVENTS = ['CDCl3', 'DMSO-d6', 'CD3OD', 'C6D6', 'acetone-d6', 'CD2Cl2', 'CD3CN', 'D2O'] as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** One row of the table: a set of equivalent atoms (same surroundings). */
export interface NmrRow {
  /** Graph atom indices. */
  atoms: number[];
  /** What the Atom column shows: carbon numbers ("4, 6") or the heteroatom ("OH"). */
  label: string;
  /** Marker numbers on the drawing, one per atom (null for atoms not numbered). */
  numbers: (number | null)[];
  c13: ShiftHit | null;
  h1: ShiftHit | null;
  /** Hydrogens behind the δH value (all the set's atoms). */
  hCount: number;
}

/** Elements of the heavy atoms of a molfile, in file order (V2000 or V3000). */
export function molfileHeavyAtoms(molblock: string): number[] {
  const lines = molblock.split(/\r?\n/);
  const out: number[] = [];
  const v3 = lines.findIndex((l) => l.includes('V30 BEGIN ATOM'));
  if (v3 >= 0) {
    for (let k = v3 + 1, i = 0; k < lines.length && !lines[k].includes('V30 END ATOM'); k++, i++) {
      const el = lines[k].trim().split(/\s+/)[3];
      if (el !== 'H') out.push(i);
    }
    return out;
  }
  const n = parseInt(lines[3]?.slice(0, 3) ?? '', 10) || 0;
  for (let i = 0; i < n; i++) {
    const el = (lines[4 + i] ?? '').slice(31, 34).trim();
    if (el !== 'H') out.push(i);
  }
  return out;
}

/** Rows for a structure: one per set of equivalent carbons, then OH/NH/SH hydrogens. */
export function nmrRows(g: NamerGraph, shifts: AtomShifts[]): NmrRow[] {
  const codes = envCodes(g);
  const sets = new Map<string, number[]>();
  g.atoms.forEach((a, i) => {
    if (a.el !== 'C' && !(a.h > 0)) return;
    const k = `${a.el}|${codes[i][codes[i].length - 1]}`;
    sets.set(k, [...(sets.get(k) ?? []), i]);
  });
  const cnum = new Map<number, number>();
  g.atoms.forEach((a, i) => { if (a.el === 'C') cnum.set(i, cnum.size + 1); });
  const rows: NmrRow[] = [];
  for (const atoms of sets.values()) {
    const s = shifts[atoms[0]];
    const a = g.atoms[atoms[0]];
    const numbers = atoms.map((i) => cnum.get(i) ?? null);
    rows.push({
      atoms, numbers,
      label: a.el === 'C' ? numbers.join(', ') : `${a.el}H${a.h > 1 ? a.h : ''}`,
      c13: s.c13, h1: s.h1, hCount: a.h * atoms.length,
    });
  }
  // carbons in number order, heteroatom hydrogens last
  const first = (r: NmrRow) => r.numbers[0] ?? 1e9;
  return rows.sort((p, q) => first(p) - first(q));
}

/** The row's source chip: how many measured atoms back it, or ~ for a loose match. */
function chip(h: ShiftHit | null, wide: number): string {
  if (!h) return '';
  // loose: the matched atoms disagree (wide spread) or only the atom type matched
  const loose = h.radius === 0 || h.spread > wide;
  const tip = loose
    ? `Loose match: the closest measured atoms (${h.n}) spread ±${h.spread.toFixed(wide > 1 ? 1 : 2)} ppm`
    : `${h.n} measured atom${h.n === 1 ? '' : 's'} with matching surroundings agree within ±${h.spread.toFixed(wide > 1 ? 1 : 2)} ppm`;
  return `<span class="nmr-src${loose ? ' loose' : ''}" title="${esc(tip)}">${loose ? '~' : h.n > 99 ? '99+' : h.n}</span>`;
}

export function nmrTableHtml(rows: NmrRow[]): string {
  const body = rows.map((r, k) => `<tr data-row="${k}"><td>${esc(r.label)}</td><td>${r.c13 ? r.c13.value.toFixed(1) : ''}</td><td>${r.h1 ? `${r.h1.value.toFixed(2)} <span class="muted">${r.hCount}H</span>` : ''}</td><td>${r.c13 ? chip(r.c13, 3) : chip(r.h1, 0.3)}</td></tr>`).join('');
  return `<table class="nmr-table"><thead><tr><th>Atom</th><th>δC</th><th>δH</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

/** The predicted spectra as an SI writes them (ACS style), highest shift first. */
export function siText(rows: NmrRow[], solvent: string, mhz = 400): string {
  const hs = rows.filter((r) => r.h1 && r.hCount).map((r) => ({ v: r.h1!.value, n: r.hCount }));
  // equal shifts print once with their hydrogens added
  const merged: { v: number; n: number }[] = [];
  for (const h of hs.sort((a, b) => b.v - a.v)) {
    const last = merged[merged.length - 1];
    if (last && last.v.toFixed(2) === h.v.toFixed(2)) last.n += h.n; else merged.push({ ...h });
  }
  const cs = rows.filter((r) => r.c13).map((r) => r.c13!.value).sort((a, b) => b - a);
  const c = Math.round(mhz / 3.97);
  return `1H NMR (${mhz} MHz, ${solvent}) δ ${merged.map((h) => `${h.v.toFixed(2)} (${h.n}H)`).join(', ')}; 13C NMR (${c} MHz, ${solvent}) δ ${cs.map((v) => v.toFixed(1)).join(', ')}.`;
}

interface Item { molblock: string; map: number[] }

interface Shown { rows: NmrRow[]; /** doc atom id per graph atom */ ids: (number | null)[]; /** doc atom id pairs joined by a ring bond */ ring: Set<string> }

export interface NmrHost {
  url: string;
  graph(molblock: string): Promise<{ graph: NamerGraph | null }>;
  redraw(): void;
  copy(text: string): Promise<void>;
  flash(text: string): void;
}

/** The NMR section of the Analysis panel and its markers on the drawing. */
export class NmrPanel {
  private table: Promise<ShiftTable> | null = null;
  private shown = new Map<number, Shown>();
  private items: (Item | null)[] = [];
  private marks = false;
  private hot: number[] = [];
  private seq = 0;

  constructor(private host: NmrHost) {}

  private get open(): boolean { try { return localStorage.getItem('ci-nmr-open') === '1'; } catch { return false; } }
  private set open(v: boolean) { try { localStorage.setItem('ci-nmr-open', v ? '1' : '0'); } catch { /* not remembered */ } }
  get solvent(): string { try { return localStorage.getItem('ci-nmr-solvent') || 'CDCl3'; } catch { return 'CDCl3'; } }
  set solvent(v: string) { try { localStorage.setItem('ci-nmr-solvent', v); } catch { /* not remembered */ } }

  private load(): Promise<ShiftTable> {
    this.table ??= fetch(this.host.url).then((r) => {
      if (!r.ok) throw new Error(`The NMR data did not load (${r.status}).`);
      return r.arrayBuffer();
    }).then((b) => new ShiftTable(b)).catch((e) => { this.table = null; throw e; });
    return this.table;
  }

  /** Adds an NMR section to each structure's block in the panel (after the panel is rebuilt). */
  attach(panel: HTMLElement, items: (Item | null)[]): void {
    this.items = items;
    this.shown.clear();
    this.hot = [];
    const seq = ++this.seq;
    const frags = [...panel.querySelectorAll<HTMLElement>(':scope > .frag')];
    items.forEach((item, i) => {
      const frag = frags[i];
      if (!item || !frag) return;
      const d = document.createElement('details');
      d.className = 'nmr';
      d.open = this.open;
      d.innerHTML = `<summary>NMR (predicted) <span class="info-icon" tabindex="0" role="img" title="Predicted from measured shifts of atoms with the same surroundings (NMRShiftDB2 and CC BY journal data). The number by each row is how many measured atoms agree; ~ means only a loose match. Marker numbers on the drawing match the Atom column." aria-label="About predicted NMR">i</span>
        <select class="nmr-solvent" title="Solvent">${NMR_SOLVENTS.map((s) => `<option value="${s}"${s === this.solvent ? ' selected' : ''}>${s}</option>`).join('')}</select></summary>
        <div class="nmr-body"><p class="muted small">Loading…</p></div>
        <div class="an-buttons"><button type="button" class="nmr-copy" title="Copy the predicted 1H and 13C lines as an SI writes them">Copy as SI Text</button><button type="button" class="nmr-marks" aria-pressed="${this.marks}" title="Number the carbons on the drawing to match the table">Show on Drawing</button></div>`;
      const buttons = [...frag.querySelectorAll(':scope > .an-buttons')].pop();
      frag.insertBefore(d, buttons ?? null);
      d.addEventListener('toggle', () => { this.open = d.open; if (d.open) void this.fill(i, d, seq); else if (this.marks) this.host.redraw(); });
      d.querySelector('select')!.addEventListener('click', (e) => e.stopPropagation());
      d.querySelector('select')!.addEventListener('change', (e) => {
        this.solvent = (e.target as HTMLSelectElement).value;
        for (const s of panel.querySelectorAll<HTMLSelectElement>('.nmr-solvent')) s.value = this.solvent;
        for (const [k, el] of panel.querySelectorAll<HTMLDetailsElement>('details.nmr').entries()) if (el.open) void this.fill(k, el, this.seq);
      });
      d.querySelector('.nmr-copy')!.addEventListener('click', () => {
        const s = this.shown.get(i);
        if (!s) return;
        this.host.copy(siText(s.rows, this.solvent)).then(() => this.host.flash('Copied the predicted NMR lines.'), () => this.host.flash('Copying was refused by the system.'));
      });
      d.querySelector('.nmr-marks')!.addEventListener('click', () => {
        this.marks = !this.marks;
        for (const b of panel.querySelectorAll('.nmr-marks')) b.setAttribute('aria-pressed', String(this.marks));
        this.host.redraw();
      });
      d.querySelector('.nmr-body')!.addEventListener('pointerover', (e) => {
        const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-row]');
        const s = this.shown.get(i);
        this.hot = tr && s ? s.rows[Number(tr.dataset.row)].atoms.map((a) => s.ids[a]).filter((x): x is number => x !== null) : [];
        if (this.marks) this.host.redraw();
      });
      d.querySelector('.nmr-body')!.addEventListener('pointerleave', () => { this.hot = []; if (this.marks) this.host.redraw(); });
      if (d.open) void this.fill(i, d, seq);
    });
    if (this.marks) this.host.redraw();
  }

  private async fill(i: number, d: HTMLDetailsElement, seq: number): Promise<void> {
    const item = this.items[i];
    const body = d.querySelector<HTMLElement>('.nmr-body')!;
    if (!item) return;
    try {
      const [table, { graph }] = await Promise.all([this.load(), this.host.graph(item.molblock)]);
      if (seq !== this.seq) return;
      const heavy = molfileHeavyAtoms(item.molblock);
      if (!graph || graph.atoms.length !== heavy.length) { body.innerHTML = '<p class="muted small">No prediction for this structure.</p>'; return; }
      const shifts = table.predictAll(graph, this.solvent);
      const rows = nmrRows(graph, shifts);
      const ids = heavy.map((k) => { const id = item.map[k]; return id !== undefined && id >= 0 ? id : null; });
      const ring = new Set<string>();
      for (const b of graph.bonds) {
        const u = ids[b.u], v = ids[b.v];
        if (b.ring && u !== null && v !== null) { ring.add(`${u},${v}`); ring.add(`${v},${u}`); }
      }
      this.shown.set(i, { rows, ids, ring });
      body.innerHTML = rows.length ? nmrTableHtml(rows) : '<p class="muted small">No carbons or hydrogens to predict.</p>';
      if (this.marks) this.host.redraw();
    } catch (e) {
      if (seq === this.seq) body.innerHTML = `<p class="warn small">${esc(e instanceof Error ? e.message : String(e))}</p>`;
    }
  }

  /** Numbered markers beside the carbons (drawn on the overlay, in drawing coordinates). */
  drawMarks(ctx: CanvasRenderingContext2D, scale: number, atom: (id: number) => { x: number; y: number } | undefined, neighbours: (id: number) => { id: number; x: number; y: number }[], accent: string): void {
    if (!this.marks || !this.open) return;
    const px = 1 / scale;
    const r = 7.5 * px;
    ctx.save();
    ctx.font = `600 ${9.5 * px}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.shown.values()) {
      // the structure's middle: of equally wide gaps, the marker takes the one facing away from it
      const pts = s.ids.map((id) => (id !== null ? atom(id) : undefined)).filter((q): q is { x: number; y: number } => !!q);
      const cx = pts.reduce((t, q) => t + q.x, 0) / (pts.length || 1), cy = pts.reduce((t, q) => t + q.y, 0) / (pts.length || 1);
      for (const row of s.rows) {
        row.atoms.forEach((a, k) => {
          const n = row.numbers[k];
          const id = s.ids[a];
          const p = id !== null ? atom(id) : undefined;
          if (n === null || id === null || !p) return;
          // in the widest gap between the atom's bonds
          const nb = neighbours(id).map((q) => ({ a: Math.atan2(q.y - p.y, q.x - p.x), ring: s.ring.has(`${id},${q.id}`) })).sort((u, v) => u.a - v.a);
          const angles = nb.map((q) => q.a);
          let dir = -Math.PI / 4;
          if (angles.length === 1) dir = angles[0] + Math.PI;
          else if (angles.length > 1) {
            const out = Math.atan2(p.y - cy, p.x - cx);
            let best = -Infinity;
            angles.forEach((u, k) => {
              const v = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI;
              const mid = (u + v) / 2;
              // gap width first (within about 10°), never inside a ring, then facing outward
              const inRing = nb.length > 2 && nb[k].ring && nb[(k + 1) % nb.length].ring;
              const score = Math.round((v - u) / 0.17) - (inRing ? 100 : 0) + 0.5 * Math.cos(mid - out);
              if (score > best) { best = score; dir = mid; }
            });
          }
          const x = p.x + Math.cos(dir) * 15 * px, y = p.y + Math.sin(dir) * 15 * px;
          if (this.hot.includes(id)) { ctx.strokeStyle = accent; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(x, y, r + 2.5 * px, 0, Math.PI * 2); ctx.stroke(); }
          ctx.fillStyle = accent;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(n), x, y + 0.5 * px);
        });
      }
    }
    ctx.restore();
  }
}

