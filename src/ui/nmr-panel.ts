// Analysis ▸ NMR (predicted): a table of predicted 13C and 1H shifts for each structure in the
// Analysis panel, with numbered markers on the drawing that match the table's atom numbers.
// The shifts come from the lookup in src/chem/nmr (public/nmr/nmr-hose.dat), loaded on first use.

import type { NamerGraph } from '../chem/namer-graph';
import { protonGroups } from '../chem/nmr/coupling';
import { envCodes } from '../chem/nmr/env';
import { ShiftTable, type AtomShifts, type ShiftHit } from '../chem/nmr/lookup';
import { MeasuredStore } from '../chem/nmr/measured';
import { blendNet, ShiftNet, type NetBlend, type NetShift } from '../chem/nmr/net';
import { netInBackground } from '../chem/nmr/net-client';
import { predictSpectrum, type NmrQuality, type PredictedSpectrum } from '../chem/nmr/spectrum';
import { exchangeRange, type ExchangeRange } from '../chem/nmr/exchange';
import { spectrumInBackground } from '../chem/nmr/spectrum-client';
import { graphCouplings3d, type ProtonJ } from '../chem/nmr/karplus';
import { ch2Splits, type Ch2SplitTrees } from '../chem/nmr/proton3d';
import { withPopulations } from '../chem/conformer-rank';
import type { Model3d } from '../chem/model3d-build';
import { checkData, measuredLines, parsePeakLists, type CheckNucleus, type CheckResult, type MeasuredList, type PredictedRow } from '../chem/nmr/check';
import { knownPeaks } from '../chem/nmr/known-peaks';
import { nmrAutoPredict } from './nmr-settings';
import { autoRange, rowAt, spectrumSvg, SpectrumWindow, nmrQuality, type MeasuredOverlay, type SpectrumData } from './nmr-spectrum';

export const NMR_SOLVENTS = ['CDCl3', 'DMSO-d6', 'CD3OD', 'C6D6', 'acetone-d6', 'CD2Cl2', 'CD3CN', 'D2O'] as const;

const isCheckNuc = (n: Nucleus): n is CheckNucleus => n === '1H' || n === '13C';
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
  /** Predicted 1H multiplicity (s, d, dd, m, br s ...) and coupling constants (Hz, largest first). */
  mult?: string;
  j?: number[];
  /** OH, NH, SH: not predicted (their shifts move with concentration, water and temperature);
   *  Check Data still matches them within the usual range for their kind of group. */
  exch?: ExchangeRange | null;
  /** One of the two diastereotopic protons of a CH2 (Accurate): 'hi' the downfield row, 'lo' the
   *  upfield one; which proton is which is not predicted. lo: the upfield shift, on the 'hi' row. */
  pair?: 'hi' | 'lo';
  lo?: number;
  /** F and P atoms: the 19F or 31P shift. */
  x?: ShiftHit | null;
  xNuc?: XNucleus;
}

/** Nuclei shown besides 1H and 13C, for the structures that have them. */
export type XNucleus = '19F' | '31P';
const X_EL: Record<XNucleus, string> = { '19F': 'F', '31P': 'P' };
/** Spectrometer frequency of each nucleus at a 1H frequency (MHz). */
export const NUC_MHZ = (nuc: Nucleus, mhz: number) => Math.round(mhz * { '1H': 1, '13C': 0.2515, '19F': 0.9408, '31P': 0.4048 }[nuc]);

/** Smallest predicted gap (ppm) shown as two rows. */
const MIN_GAP = 0.02;

/** The CH2 rows split in two where its protons are predicted apart (gap by atom, ppm); the 13C value stays on the first. */
export function splitRows(rows: NmrRow[], gap: Record<number, number>, g: NamerGraph): NmrRow[] {
  const out: NmrRow[] = [];
  for (const r of rows) {
    const a0 = g.atoms[r.atoms[0]];
    const ds = r.atoms.map((a) => gap[a]);
    const d = ds.every((x) => x !== undefined) ? ds.reduce((t, x) => t + x, 0) / ds.length : 0;
    if (!r.h1 || r.exch || a0.el !== 'C' || a0.h !== 2 || !(d >= MIN_GAP)) { out.push(r); continue; }
    // each proton now also couples to its partner (geminal, about 12.5 Hz for an sp3 CH2)
    const mult = !r.mult || r.mult === 'm' || r.mult.startsWith('br') ? r.mult : (r.mult === 's' ? 'd' : `d${r.mult}`);
    const j = r.mult && r.mult !== 'm' && !r.mult.startsWith('br') ? [12.5, ...(r.j ?? [])].sort((x, y) => y - x) : r.j;
    const m = mult && mult.length > 4 ? 'm' : mult;
    const hi = r.h1.value + d / 2, lo = r.h1.value - d / 2;
    out.push({ ...r, h1: { ...r.h1, value: hi }, hCount: r.hCount / 2, mult: m, j: m === 'm' ? [] : j, pair: 'hi', lo });
    out.push({ ...r, c13: null, h1: { ...r.h1, value: lo }, hCount: r.hCount / 2, mult: m, j: m === 'm' ? [] : j, pair: 'lo' });
  }
  return out;
}

/** "dd, J = 15.5, 6.8 Hz" as an SI writes it (empty without a multiplicity). */
export function multSi(r: { mult?: string; j?: number[] }): string {
  if (!r.mult) return '';
  return r.j?.length && r.mult !== 'm' ? `${r.mult}, J = ${r.j.map((x) => x.toFixed(1)).join(', ')} Hz` : r.mult;
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
    if (a.el !== 'C' && a.el !== 'F' && a.el !== 'P' && !(a.h > 0)) return;
    const k = `${a.el}|${codes[i][codes[i].length - 1]}`;
    sets.set(k, [...(sets.get(k) ?? []), i]);
  });
  const cnum = new Map<number, number>();
  g.atoms.forEach((a, i) => { if (a.el === 'C') cnum.set(i, cnum.size + 1); });
  const xnum = new Map<number, number>();
  for (const el of ['F', 'P']) { let k = 0; g.atoms.forEach((a, i) => { if (a.el === el) xnum.set(i, ++k); }); }
  const rows: NmrRow[] = [];
  for (const atoms of sets.values()) {
    const s = shifts[atoms[0]];
    const a = g.atoms[atoms[0]];
    const numbers = atoms.map((i) => cnum.get(i) ?? null);
    rows.push({
      atoms, numbers,
      label: a.el === 'C' ? numbers.join(', ') : a.el === 'F' || a.el === 'P' ? atoms.map((i) => `${a.el}${xnum.get(i)}`).join(', ') : `${a.el}H${a.h > 1 ? a.h : ''}`,
      c13: s.c13, h1: s.h1, hCount: a.h * atoms.length,
      ...(a.el === 'F' || a.el === 'P' ? { xNuc: a.el === 'F' ? '19F' as const : '31P' as const, x: null } : {}),
    });
  }
  // carbons in number order, heteroatom hydrogens last
  const first = (r: NmrRow) => r.numbers[0] ?? (r.xNuc ? 2e9 : 1e9);
  return rows.sort((p, q) => first(p) - first(q));
}

/** The row's source chip: how many measured atoms back it, or ~ for a loose match. */
function chip(h: ShiftHit | null, wide: number): string {
  if (!h) return '';
  if (h.measured) {
    const where = h.measured.source.startsWith('PMC') ? `article ${h.measured.source}` : h.measured.source;
    return `<span class="nmr-src measured" title="${esc(`Measured for this structure (${where}${h.measured.solvent ? `, ${h.measured.solvent}` : ''})`)}">M</span>`;
  }
  // loose: a wide expected error, or no measured atom shares the surroundings
  const loose = h.spread > wide || h.n === 0;
  const pmv = h.spread.toFixed(wide > 1 ? 1 : 2);
  const tip = `Expected error ±${pmv} ppm. ` + (h.n
    ? `${h.n} measured atom${h.n === 1 ? '' : 's'} share${h.n === 1 ? 's' : ''} this atom's surroundings ${h.radius} bond${h.radius === 1 ? '' : 's'} out.`
    : 'No measured atom shares its surroundings.');
  return `<span class="nmr-src${loose ? ' loose' : ''}" title="${esc(tip)}">${loose ? '~' : h.n > 99 ? '99+' : h.n}</span>`;
}

export type Nucleus = '1H' | '13C' | XNucleus;

const pm = (h: ShiftHit, wide: number) => (h.measured ? '' : `<span class="muted">±${h.spread.toFixed(wide > 1 ? 1 : 2)}</span>`);

/** The list for one nucleus, highest shift first: shift, how many atoms, which atoms, source chip. */
export function nmrListHtml(rows: NmrRow[], nuc: Nucleus): string {
  if (nuc === '19F' || nuc === '31P') return xListHtml(rows, nuc);
  const c = nuc === '13C';
  const all = rows.map((r, k) => ({ r, k, h: c ? r.c13 : r.h1 })).filter((x) => x.h && (c || x.r.hCount));
  const left = c ? [] : [...new Set(all.filter((x) => x.r.exch).map((x) => `${rows[x.k].label.replace(/\d+$/, '')}`))];
  const list = all.filter((x) => c || !x.r.exch).sort((a, b) => b.h!.value - a.h!.value);
  if (!list.length) return `<p class="muted small">No ${c ? 'carbons' : 'hydrogens'} to predict.${left.length ? ` ${left.join(', ')} shifts are not predicted.` : ''}</p>`;
  const tip = left.length ? ` <span class="info-icon" tabindex="0" role="img" aria-label="About ${left.join(', ')}" title="${esc(`${left.join(', ')} shifts are not predicted: they move with concentration, water and temperature, and the peak is often broad or not seen.`)}">i</span>` : '';
  const m = !c && list.some((x) => x.r.mult);
  const multCell = (r: NmrRow) => (m ? `<td class="nmr-mult">${esc(r.mult ?? '')}${r.j?.length && r.mult !== 'm' ? ` ${r.j.map((x) => x.toFixed(1)).join(', ')}` : ''}</td>` : '');
  const body = list.map(({ r, k, h }) => `<tr data-row="${k}"><td>${h!.value.toFixed(c ? 1 : 2)} ${pm(h!, c ? 3 : 0.3)}</td><td>${c ? (r.atoms.length > 1 ? `${r.atoms.length}C` : '') : `${r.hCount}H`}</td>${multCell(r)}<td>${esc(r.label)}</td><td>${chip(h, c ? 3 : 0.3)}</td></tr>`).join('');
  return `<table class="nmr-table${m ? ' with-mult' : ''}"><thead><tr><th>δ (ppm)${tip}</th><th></th>${m ? '<th class="nmr-mult">Mult., J (Hz)</th>' : ''}<th>Atoms</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

/** The 19F or 31P list: shift, how many atoms, which atoms, source chip. */
function xListHtml(rows: NmrRow[], nuc: XNucleus): string {
  const list = rows.map((r, k) => ({ r, k })).filter(({ r }) => r.xNuc === nuc && r.x).sort((a, b) => b.r.x!.value - a.r.x!.value);
  if (!list.length) return `<p class="muted small">No ${nuc === '19F' ? 'fluorine' : 'phosphorus'} shift could be predicted.</p>`;
  const body = list.map(({ r, k }) => `<tr data-row="${k}"><td>${r.x!.value.toFixed(1)} ${pm(r.x!, 5)}</td><td>${r.atoms.length}${X_EL[nuc]}</td><td>${esc(r.label)}</td><td>${chip(r.x!, 5)}</td></tr>`).join('');
  return `<table class="nmr-table"><thead><tr><th>δ (ppm)</th><th></th><th>Atoms</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

/** 19F and 31P shifts of a structure, highest first, by nucleus (only nuclei it has). */
function xShifts(rows: NmrRow[]): [XNucleus, { v: number; k: number }[]][] {
  return (['19F', '31P'] as const).map((n) => [n, [...rows.entries()].filter(([, r]) => r.xNuc === n && r.x).map(([k, r]) => ({ v: r.x!.value, k })).sort((a, b) => b.v - a.v)] as [XNucleus, { v: number; k: number }[]]).filter(([, l]) => l.length);
}

/** 1H signals highest first; equal shifts print once with their hydrogens added (and as m when their patterns differ). */
function mergedH(rows: NmrRow[]): { v: number; n: number; k: number[]; m: string }[] {
  const hs = [...rows.entries()].filter(([, r]) => r.h1 && r.hCount && !r.exch).map(([k, r]) => ({ v: r.h1!.value, n: r.hCount, k: [k], m: multSi(r) }));
  hs.sort((a, b) => b.v - a.v);
  const merged: typeof hs = [];
  for (const h of hs) {
    const last = merged[merged.length - 1];
    if (last && last.v.toFixed(2) === h.v.toFixed(2)) { last.n += h.n; last.k.push(...h.k); if (last.m !== h.m) last.m = last.m || h.m ? 'm' : ''; } else merged.push({ ...h, k: [...h.k] });
  }
  return merged;
}

/** The peak report: the 1H and 13C lines as a journal prints them, each peak hoverable. */
export function nmrReportHtml(rows: NmrRow[], solvent: string, mhz = 400): string {
  const sol = esc(solvent).replace(/(\d+)/g, '<sub>$1</sub>');
  const merged = mergedH(rows);
  const cs = [...rows.entries()].filter(([, r]) => r.c13).sort((a, b) => b[1].c13!.value - a[1].c13!.value);
  const h = merged.map((x) => `<span data-row="${x.k.join(',')}">${x.v.toFixed(2)} (${x.m ? `${esc(x.m).replace(/J = /, '<i>J</i> = ')}, ` : ''}${x.n}H)</span>`).join(', ');
  const c = cs.map(([k, r]) => `<span data-row="${k}">${r.c13!.value.toFixed(1)}</span>`).join(', ');
  const x = xShifts(rows).map(([n, l]) => `<p class="nmr-report"><sup>${n.slice(0, 2)}</sup>${n.slice(2)} NMR (${NUC_MHZ(n, mhz)} MHz, ${sol}) δ ${l.map((e) => `<span data-row="${e.k}">${e.v.toFixed(1)}</span>`).join(', ')}.</p>`).join('');
  return `<p class="nmr-report"><sup>1</sup>H NMR (${mhz} MHz, ${sol}) δ ${h || '—'}.</p><p class="nmr-report"><sup>13</sup>C NMR (${Math.round(mhz / 3.97)} MHz, ${sol}) δ ${c || '—'}.</p>${x}`;
}

/** The predicted spectra as an SI writes them (ACS style), highest shift first. */
export function siText(rows: NmrRow[], solvent: string, mhz = 400): string {
  const merged = mergedH(rows);
  const cs = rows.filter((r) => r.c13).map((r) => r.c13!.value).sort((a, b) => b - a);
  const c = Math.round(mhz / 3.97);
  const x = xShifts(rows).map(([n, l]) => `; ${n} NMR (${NUC_MHZ(n, mhz)} MHz, ${solvent}) δ ${l.map((e) => e.v.toFixed(1)).join(', ')}`).join('');
  return `1H NMR (${mhz} MHz, ${solvent}) δ ${merged.map((h) => `${h.v.toFixed(2)} (${h.m ? `${h.m}, ` : ''}${h.n}H)`).join(', ')}; 13C NMR (${c} MHz, ${solvent}) δ ${cs.map((v) => v.toFixed(1)).join(', ')}${x}.`;
}

interface Item { molblock: string; map: number[] }

/** Check Data for one structure: the pasted text, and the result per nucleus. */
/**
 * One nucleus's check: the measured list, how it matched, and the predicted rows it was matched
 * against (`pred`, with `rowIdx` their places in `basis`, the structure's rows at the time). The
 * rows can change after the check (CH2 protons split once the accurate gaps arrive, or the quality
 * changes), so the drawing uses `pred`, never the current rows by index (issue #546).
 */
export interface CheckEntry { list: MeasuredList; res: CheckResult; pred: PredictedRow[]; rowIdx: number[]; basis: readonly unknown[]; note?: string }

/** The measured list drawn against the prediction in the Spectrum window. */
export function measuredOverlay(r: CheckEntry, nuc: CheckNucleus, sf: number): MeasuredOverlay {
  const { list, res, pred } = r;
  const links = res.rows.filter((m) => m.peak !== null && pred[m.row]).map((m) => ({ m: list.peaks[m.peak!].value, p: pred[m.row].shift, sev: m.status === 'off' ? 'warn' as const : 'ok' as const }));
  const marks = [
    ...res.extras.map((e) => {
      const solvent = e.maybe === 'Water' || e.maybe?.startsWith('Residual');
      return { ppm: list.peaks[e.peak].value, text: solvent ? (e.maybe === 'Water' ? 'water' : e.maybe!.replace('Residual ', '')) : e.maybe ? `${e.maybe}?` : `extra${nuc === '1H' ? ` ${e.n}H` : ''}`, sev: solvent ? 'info' as const : 'bad' as const };
    }),
    ...res.rows.filter((m) => m.status === 'off' && m.peak !== null).map((m) => ({ ppm: list.peaks[m.peak!].value, text: `Δ ${Math.abs(m.delta).toFixed(nuc === '1H' ? 2 : 1)}`, sev: 'warn' as const })),
    ...res.rows.filter((m) => m.pattern && m.status !== 'off' && m.peak !== null).map((m) => ({ ppm: list.peaks[m.peak!].value, text: `${list.peaks[m.peak!].mult} vs ${pred[m.row]?.mult ?? '?'}`, sev: 'info' as const })),
  ];
  return nuc === '1H'
    ? { spec: { sf, lines: measuredLines(list, sf), groups: [] }, links, marks }
    : { sticks: list.peaks.map((p) => ({ shift: p.value, n: p.n ?? 1 })), links, marks };
}

interface CheckState {
  text: string;
  editing: boolean;
  results: Map<CheckNucleus, CheckEntry>;
}

interface Shown {
  rows: NmrRow[]; /** doc atom id per graph atom */ ids: (number | null)[]; /** doc atom id pairs joined by a ring bond */ ring: Set<string>;
  /** For the spectrum: the graph, predicted 1H per atom, environment codes, list row per atom. */
  graph: NamerGraph; h1: number[]; codes: string[]; rowOf: number[];
  /** Simulated spectra by field and quality; pending: simulations running in the background. */
  specs: Map<string, PredictedSpectrum>; pending: Set<string>;
  /** The structure, and the molfile atom of each graph atom (for 3-D couplings). */
  molblock: string; heavy: number[];
  /** Vicinal couplings from 3-D conformers (Accurate), once asked for; empty when no model could be built. */
  pj?: Promise<ProtonJ[]>;
  /** The conformers (Accurate), once asked for; null when no model could be built. */
  model?: Promise<Model3d | null>;
  /** Diastereotopic CH2 gaps (ppm) by graph atom, once asked for: the networks' when they give them, else from conformers (Accurate). */
  gap?: Promise<Record<number, number>>;
  /** CH2 gaps (ppm) by graph atom from the shift networks, on every quality; empty when the networks give none. */
  netGap: Record<number, number>;
  /** The rows with each such CH2 as two rows, and the list row of each atom for them; set when the gaps are in. */
  baseRows: NmrRow[]; baseRowOf: number[]; splitRows?: NmrRow[]; splitRowOf?: number[];
}

export interface NmrHost {
  url: string;
  /** Set where prediction isn't offered (the browser and iPad versions): the section shows this
   *  note (HTML) instead, and none of the data is fetched. */
  unavailable?: string;
  /** The measured-shift store (whole structures); optional, predictions stand without it. */
  measuredUrl?: string;
  /** The shift networks; optional, the lookup stands alone without them. */
  netUrl?: string;
  /** Trees for the gap between diastereotopic CH2 protons (Accurate); optional. */
  splitUrl?: string;
  /** The 19F and 31P shift lookup; optional. */
  fpUrl?: string;
  graph(molblock: string): Promise<{ graph: NamerGraph | null }>;
  /** Low-energy conformers of a structure (molfile) for Accurate spectra; optional. */
  conformers?(molblock: string): Promise<Model3d>;
  /** The Knowledge Base tables the user imported (JSON), for naming extra peaks in Check Data. */
  importedTables?(): Promise<string | null>;
  redraw(): void;
  copy(text: string): Promise<void>;
  flash(text: string): void;
  /** Copies a PNG picture; optional. */
  copyPicture?(png: Uint8Array): Promise<void>;
  /** Puts a PNG picture on the drawing; optional. */
  placePicture?(png: Uint8Array): void;
  /** Keeps peak reports with the structure in the Compound Library; optional. */
  saveSpectra?(molblock: string, entries: { kind: 'predicted' | 'measured'; text: string; solvent: string; quality?: string }[]): Promise<void>;
  /** The measured peak reports kept with the structure in the Compound Library, newest first; optional. */
  savedReports?(molblock: string): Promise<string[]>;
}

/** The NMR section of the Analysis panel and its markers on the drawing. */
export class NmrPanel {
  private table: Promise<ShiftTable> | null = null;
  private fp: Promise<ShiftTable | null> | null = null;
  private store: Promise<MeasuredStore | null> | null = null;
  private net: Promise<ShiftNet | null> | null = null;
  private splitTrees: Promise<Ch2SplitTrees | null> | null = null;
  private shown = new Map<number, Shown>();
  private items: (Item | null)[] = [];
  private marks = false;
  private hot: number[] = [];
  private seq = 0;
  private win: SpectrumWindow | null = null;
  /** Check Data by structure (molfile), kept while the program runs. */
  private checks = new Map<string, CheckState>();
  private winItem = 0;
  /** The latest fill of each structure (an older one still running is dropped when it ends). */
  private fillTok = new Map<number, number>();
  /** Network shifts by structure and solvent: the Analysis panel is rebuilt on every selection
   *  change, and the wide networks take up to a second or so for a large structure. */
  private netCache = new Map<string, { net: NetShift[] | null; blend: NetBlend } | null>();

  constructor(private host: NmrHost) {}

  /** The networks' shifts for a structure (cached), in the background worker or here without one. */
  private async netShifts(graph: NamerGraph, solvent: string): Promise<{ net: NetShift[] | null; blend: NetBlend } | null> {
    const url = this.host.netUrl;
    if (!url) return null;
    const key = solvent + '|' + JSON.stringify([graph.atoms.map((a) => [a.el, a.q, a.arom, a.h, a.cip ?? '']), graph.bonds.map((b) => [b.u, b.v, b.o, b.ez ?? ''])]);
    if (this.netCache.has(key)) {
      const hit = this.netCache.get(key)!;
      this.netCache.delete(key); this.netCache.set(key, hit); // most recently used last
      return hit;
    }
    const bg = netInBackground(url, graph, solvent)?.catch(() => null);
    let r: { net: NetShift[] | null; blend: NetBlend } | null;
    if (bg) r = await bg;
    else {
      const net = await this.loadNet();
      r = net ? { net: net.predict(graph, solvent), blend: net.blend } : null;
    }
    if (r?.net) {
      this.netCache.set(key, r);
      while (this.netCache.size > 64) this.netCache.delete(this.netCache.keys().next().value!);
    }
    return r;
  }

  private get open(): boolean { try { return localStorage.getItem('ci-nmr-open') === '1'; } catch { return false; } }
  private set open(v: boolean) { try { localStorage.setItem('ci-nmr-open', v ? '1' : '0'); } catch { /* not remembered */ } }
  get solvent(): string { try { return localStorage.getItem('ci-nmr-solvent') || 'CDCl3'; } catch { return 'CDCl3'; } }
  set solvent(v: string) { try { localStorage.setItem('ci-nmr-solvent', v); } catch { /* not remembered */ } }
  /** Which nucleus the list shows. */
  get nuc(): Nucleus { try { const n = localStorage.getItem('ci-nmr-nuc'); return n === '13C' || n === '19F' || n === '31P' ? n : '1H'; } catch { return '1H'; } }
  set nuc(v: Nucleus) { try { localStorage.setItem('ci-nmr-nuc', v); } catch { /* not remembered */ } }
  /** The peak report (journal lines) instead of the list. */
  get report(): boolean { try { return localStorage.getItem('ci-nmr-view') === 'report'; } catch { return false; } }
  set report(v: boolean) { try { localStorage.setItem('ci-nmr-view', v ? 'report' : 'list'); } catch { /* not remembered */ } }

  private load(): Promise<ShiftTable> {
    this.table ??= fetch(this.host.url).then((r) => {
      if (!r.ok) throw new Error(`The NMR data did not load (${r.status}).`);
      return r.arrayBuffer();
    }).then((b) => new ShiftTable(b)).catch((e) => { this.table = null; throw e; });
    return this.table;
  }

  private loadFp(): Promise<ShiftTable | null> {
    const url = this.host.fpUrl;
    if (!url) return Promise.resolve(null);
    this.fp ??= fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new ShiftTable(b) : null)).catch(() => null);
    return this.fp;
  }

  private loadStore(): Promise<MeasuredStore | null> {
    const url = this.host.measuredUrl;
    if (!url) return Promise.resolve(null);
    this.store ??= fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new MeasuredStore(b) : null)).catch(() => null);
    return this.store;
  }

  private loadNet(): Promise<ShiftNet | null> {
    const url = this.host.netUrl;
    if (!url) return Promise.resolve(null);
    this.net ??= fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new ShiftNet(b) : null)).catch(() => null);
    return this.net;
  }

  /** Adds an NMR section to each structure's block in the panel (after the panel is rebuilt). */
  attach(panel: HTMLElement, items: (Item | null)[]): void {
    this.items = items;
    this.shown.clear();
    this.hot = [];
    const seq = ++this.seq;
    const frags = [...panel.querySelectorAll<HTMLElement>(':scope > .frag')];
    if (this.host.unavailable) {
      const note = this.host.unavailable;
      items.forEach((item, i) => {
        const frag = frags[i];
        if (!item || !frag) return;
        const d = document.createElement('details');
        d.className = 'nmr nmr-off';
        d.open = nmrAutoPredict() && this.open;
        d.innerHTML = `<summary>NMR (predicted)</summary><div class="nmr-body"><p class="muted small">${note}</p></div>`;
        d.addEventListener('toggle', () => { this.open = d.open; });
        frag.insertBefore(d, [...frag.querySelectorAll(':scope > .an-buttons')].pop() ?? null);
      });
      return;
    }
    items.forEach((item, i) => {
      const frag = frags[i];
      if (!item || !frag) return;
      const d = document.createElement('details');
      d.className = 'nmr';
      d.dataset.item = String(i);
      d.open = nmrAutoPredict() && this.open;
      d.innerHTML = `<summary>NMR (predicted) <span class="info-icon" tabindex="0" role="img" title="Predicted by networks trained on measured shifts, blended with shifts of atoms with the same surroundings (NMRShiftDB2 and CC BY journal data). ± is the expected error. The chip is how many measured atoms share the atom's surroundings; ~ means a less certain prediction; M means this structure's own measured shift. Marker numbers on the drawing match the Atoms column." aria-label="About predicted NMR">i</span>
        <span class="nmr-nuc" role="group" aria-label="Nucleus"${this.report ? ' hidden' : ''}>${(['1H', '13C', '19F', '31P'] as const).map((n) => `<button type="button" data-nuc="${n}" aria-pressed="${n === this.nuc}"${n === '19F' || n === '31P' ? ' hidden' : ''}><sup>${n.slice(0, -1)}</sup>${n.slice(-1)}</button>`).join('')}</span>
        <select class="nmr-solvent" title="Solvent">${NMR_SOLVENTS.map((s) => `<option value="${s}"${s === this.solvent ? ' selected' : ''}>${s}</option>`).join('')}</select></summary>
        <div class="nmr-body"><p class="muted small">Loading…</p></div>
        <div class="an-buttons"><button type="button" class="nmr-check" aria-pressed="false" title="Compare a measured peak list (pasted as an SI writes it) with the prediction">Check Data</button><button type="button" class="nmr-copy" title="Copy the predicted 1H and 13C lines as an SI writes them">Copy as SI Text</button><button type="button" class="nmr-view" aria-pressed="${this.report}" title="Show the predicted 1H and 13C lines as a journal prints them">Peak Report</button><button type="button" class="nmr-marks" aria-pressed="${this.marks}" title="Show the predictions on the drawing">Show on Drawing</button>${this.host.saveSpectra ? '<button type="button" class="nmr-save" title="Keep the predicted peak report, and a pasted measured one, with this compound in the Compound Library">Save to Library</button>' : ''}<select class="nmr-mode" title="What Show on Drawing shows: shifts by each atom, atom numbers matching the list, or confidence dots (green: small expected error; amber: larger; red: large, or no similar measured atoms)">${(['shifts', 'numbers', 'confidence'] as const).map((m) => `<option value="${m}"${m === this.mode ? ' selected' : ''}>${{ shifts: 'Shifts', numbers: 'Atom Numbers', confidence: 'Confidence' }[m]}</option>`).join('')}</select></div>`;
      const buttons = [...frag.querySelectorAll(':scope > .an-buttons')].pop();
      frag.insertBefore(d, buttons ?? null);
      d.addEventListener('toggle', () => { this.open = d.open; if (d.open) void this.fill(i, d, seq); else if (this.marks) this.host.redraw(); });
      d.querySelector('select')!.addEventListener('click', (e) => e.stopPropagation());
      d.querySelector('select')!.addEventListener('change', (e) => {
        this.solvent = (e.target as HTMLSelectElement).value;
        for (const s of panel.querySelectorAll<HTMLSelectElement>('.nmr-solvent')) s.value = this.solvent;
        for (const el of panel.querySelectorAll<HTMLDetailsElement>('details.nmr')) if (el.open) void this.fill(Number(el.dataset.item), el, this.seq);
      });
      for (const b of d.querySelectorAll<HTMLButtonElement>('.nmr-nuc button')) b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.nuc = b.dataset.nuc as Nucleus;
        this.restyle(panel);
      });
      d.querySelector('.nmr-view')!.addEventListener('click', () => { this.report = !this.report; this.restyle(panel); });
      d.querySelector('.nmr-check')!.addEventListener('click', () => {
        const st = this.checkState(i, true)!;
        st.editing = !st.editing;
        if (!st.editing && !st.results.size) this.checks.delete(item.molblock);
        if (!d.open) d.open = true;
        this.render(i, d);
        if (st.editing) d.querySelector<HTMLTextAreaElement>('.ck-box textarea')?.focus();
      });
      d.querySelector('.nmr-copy')!.addEventListener('click', () => {
        const s = this.shown.get(i);
        if (!s) return;
        this.host.copy(siText(s.rows, this.solvent)).then(() => this.host.flash('Copied the predicted NMR lines.'), () => this.host.flash('Copying was refused by the system.'));
      });
      d.querySelector('.nmr-save')?.addEventListener('click', () => void this.save(i));
      d.querySelector('.nmr-mode')!.addEventListener('change', (e) => {
        this.mode = (e.target as HTMLSelectElement).value as DrawMode;
        for (const m of panel.querySelectorAll<HTMLSelectElement>('.nmr-mode')) m.value = this.mode;
        if (!this.marks) { this.marks = true; for (const b of panel.querySelectorAll('.nmr-marks')) b.setAttribute('aria-pressed', 'true'); }
        this.host.redraw();
      });
      d.querySelector('.nmr-marks')!.addEventListener('click', () => {
        this.marks = !this.marks;
        for (const b of panel.querySelectorAll('.nmr-marks')) b.setAttribute('aria-pressed', String(this.marks));
        this.host.redraw();
      });
      const nb = d.querySelector<HTMLElement>('.nmr-body')!;
      nb.addEventListener('pointerover', (e) => {
        if ((e.target as HTMLElement).closest('.nmr-strip')) return;
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
        const s = this.shown.get(i);
        this.hot = el && s ? el.dataset.row!.split(',').flatMap((k) => s.rows[Number(k)].atoms).map((a) => s.ids[a]).filter((x): x is number => x !== null) : [];
        this.host.redraw();
        const row = el ? Number(el.dataset.row!.split(',')[0]) : null;
        this.drawStrip(i, d, row);
        if (this.win?.visible && this.winItem === i) this.win.highlight(row);
      });
      nb.addEventListener('pointermove', (e) => {
        const strip = (e.target as HTMLElement).closest<HTMLElement>('.nmr-strip');
        if (!strip || (e.target as HTMLElement).closest('.nmr-popout')) return;
        const data = this.dataFor(i, 400, this.quality, this.specNuc(i));
        if (!data) return;
        const r = autoRange(data), b = strip.getBoundingClientRect();
        const ppm = r.hi - ((e.clientX - b.left) / b.width) * (r.hi - r.lo);
        this.hoverRow(i, rowAt(data, ppm, (r.hi - r.lo) / 60), 'strip');
      });
      nb.addEventListener('pointerleave', () => { this.hoverRow(i, null, 'list'); for (const tr of nb.querySelectorAll('.hot')) tr.classList.remove('hot'); });
      nb.addEventListener('input', (e) => {
        const ta = (e.target as HTMLElement).closest('textarea');
        if (!ta) return;
        const st = this.checkState(i, true)!;
        st.text = ta.value;
        const note = nb.querySelector('.ck-read');
        if (note) note.textContent = this.readNote(st);
      });
      nb.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('.ck-run')) { void this.runCheck(i, d); return; }
        if (t.closest('.ck-lib')) { void this.fromLibrary(i, d); return; }
        if (t.closest('.ck-cancel')) { const st = this.checkState(i, false); if (st) { st.editing = false; if (!st.results.size) this.checks.delete(item.molblock); } this.render(i, d); return; }
        if (t.closest('.ck-edit')) { const st = this.checkState(i, false); if (st) st.editing = true; this.render(i, d); return; }
        if (t.closest('.ck-clear')) { this.checks.delete(item.molblock); this.render(i, d); if (this.win?.visible && this.winItem === i) this.win.refresh(); return; }
        if (!t.closest('.nmr-popout')) return;
        this.popOut(i, document.querySelector('#analysis-section')?.getBoundingClientRect() ?? null);
      });
      if (d.open) void this.fill(i, d, seq);
    });
    if (this.marks) this.host.redraw();
  }

  private async fill(i: number, d: HTMLDetailsElement, seq: number): Promise<void> {
    const item = this.items[i];
    const body = d.querySelector<HTMLElement>('.nmr-body')!;
    if (!item) return;
    // a newer fill of the same structure (the solvent changed meanwhile) wins
    const tok = (this.fillTok.get(i) ?? 0) + 1;
    this.fillTok.set(i, tok);
    const stale = () => seq !== this.seq || this.fillTok.get(i) !== tok;
    try {
      const [table, store, { graph }] = await Promise.all([this.load(), this.loadStore(), this.host.graph(item.molblock)]);
      if (stale()) return;
      const heavy = molfileHeavyAtoms(item.molblock);
      if (!graph || graph.atoms.length !== heavy.length) { body.innerHTML = '<p class="muted small">No prediction for this structure.</p>'; return; }
      if (stale()) return;
      const solvent = this.solvent;
      const shifts = table.predictAll(graph, solvent);
      const r = await this.netShifts(graph, solvent);
      if (stale()) return;
      if (r?.net) blendNet(r.blend, graph, shifts, r.net);
      store?.apply(graph, shifts, solvent);
      const rows = nmrRows(graph, shifts);
      for (const r of rows) r.exch = exchangeRange(graph, r.atoms[0], solvent);
      if (rows.some((r) => r.xNuc)) {
        const fp = await this.loadFp();
        if (stale()) return;
        const all = envCodes(graph);
        for (const r of rows) if (r.xNuc) r.x = fp?.predict(r.xNuc, all[r.atoms[0]], solvent) ?? null;
      }
      const ids = heavy.map((k) => { const id = item.map[k]; return id !== undefined && id >= 0 ? id : null; });
      const ring = new Set<string>();
      for (const b of graph.bonds) {
        const u = ids[b.u], v = ids[b.v];
        if (b.ring && u !== null && v !== null) { ring.add(`${u},${v}`); ring.add(`${v},${u}`); }
      }
      // multiplicities from the predicted couplings (heteroatom H exchange, so broad singlets)
      const codes = envCodes(graph).map((c) => c[c.length - 1]);
      const h1 = graph.atoms.map(() => NaN);
      const rowOf = graph.atoms.map(() => -1);
      rows.forEach((r, k) => { for (const a of r.atoms) { rowOf[a] = k; if (r.h1 && r.hCount) h1[a] = r.h1.value; } });
      for (const gr of protonGroups(graph, h1, codes)) {
        const r = rows[rowOf[gr.atoms[0]]];
        if (!r) continue;
        if (graph.atoms[gr.atoms[0]].el === 'C') { r.mult = gr.mult; r.j = gr.j; } else { r.mult = 'br s'; r.j = []; }
      }
      for (const r of rows) if (r.exch) for (const a of r.atoms) h1[a] = NaN;
      const netGap: Record<number, number> = {};
      for (const sh of shifts) if (sh.h1gap !== undefined && sh.h1gap >= MIN_GAP && graph.atoms[sh.atom].h === 2 && !Number.isNaN(h1[sh.atom])) netGap[sh.atom] = sh.h1gap;
      this.shown.set(i, { rows, ids, ring, graph, h1, codes, rowOf, specs: new Map(), pending: new Set(), molblock: item.molblock, heavy, baseRows: rows, baseRowOf: rowOf, netGap });
      this.render(i, d);
      if (this.win?.visible && this.winItem === i) this.win.refresh();
      if (this.marks) this.host.redraw();
    } catch (e) {
      if (!stale()) body.innerHTML = `<p class="warn small">${esc(e instanceof Error ? e.message : String(e))}</p>`;
    }
  }

  /** Shows the list or the peak report for one structure from its predicted rows. */
  private render(i: number, d: HTMLElement): void {
    const s = this.shown.get(i);
    if (!s) return;
    this.useRows(i, s);
    const body = d.querySelector<HTMLElement>('.nmr-body')!;
    if (!s.rows.length) { body.innerHTML = '<p class="muted small">No carbons or hydrogens to predict.</p>'; return; }
    body.innerHTML = `<div class="nmr-strip" data-item="${i}"><button type="button" class="nmr-popout" title="Open the spectrum in a window (zoom, labels, field, Copy as Picture)" aria-label="Open the spectrum in a window">⤢</button></div>`
      + this.checkHtml(i)
      + (this.report ? nmrReportHtml(s.rows, this.solvent) : nmrListHtml(s.rows, this.nucOf(i)));
    // 19F and 31P buttons only for structures with F or P; the button shown pressed is the list shown
    const shownNuc = this.nucOf(i);
    for (const b of d.querySelectorAll<HTMLButtonElement>('.nmr-nuc button')) {
      const n = b.dataset.nuc as Nucleus;
      if (n === '19F' || n === '31P') b.hidden = !s.rows.some((r) => r.xNuc === n);
      b.setAttribute('aria-pressed', String(n === shownNuc));
    }
    this.drawStrip(i, d, null);
  }

  /** Check Data state for a structure (made when asked). */
  private checkState(i: number, make: boolean): CheckState | null {
    const key = this.items[i]?.molblock;
    if (key === undefined) return null;
    let st = this.checks.get(key) ?? null;
    if (!st && make) this.checks.set(key, (st = { text: '', editing: false, results: new Map() }));
    return st;
  }

  /** The paste box, or the findings for the nucleus shown (both in the peak report). */
  private checkHtml(i: number): string {
    const st = this.checkState(i, false);
    const btn = document.querySelector<HTMLElement>(`details.nmr[data-item="${i}"] .nmr-check`);
    btn?.setAttribute('aria-pressed', String(!!st && (st.editing || st.results.size > 0)));
    if (!st) return '';
    if (st.editing) {
      return `<div class="ck-box"><textarea spellcheck="false" aria-label="Measured peak list" placeholder="Paste a peak list as an SI writes it: 1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.7 Hz, 2H), …">${esc(st.text)}</textarea>`
        + `<div class="ck-row"><span class="ck-read">${esc(this.readNote(st))}</span><span class="sp">${this.host.savedReports ? '<button type="button" class="ck-lib" title="Fill in the measured peak report saved with this compound in the Compound Library">From Library</button>' : ''}<button type="button" class="ck-run primary">Check</button><button type="button" class="ck-cancel">Cancel</button></span></div></div>`;
    }
    const nucs: CheckNucleus[] = this.report ? ['1H', '13C'] : isCheckNuc(this.nuc) ? [this.nuc] : [];
    const sev = { ok: 'ck-ok', warn: 'ck-warn', bad: 'ck-bad', info: 'ck-info' } as const;
    let html = '', first = true;
    for (const n of nucs) {
      const r = st.results.get(n);
      if (!r) continue;
      for (const f of [...(r.note ? [{ severity: 'info' as const, text: r.note }] : []), ...r.res.findings]) {
        const row = 'row' in f && f.row !== undefined && r.basis === this.shown.get(i)?.rows ? ` data-row="${r.rowIdx[f.row]}"` : '';
        const tools = first ? '<span class="ck-tools"><button type="button" class="ck-edit" title="Change the peak list">Edit</button><button type="button" class="ck-clear" aria-label="Clear the check" title="Clear the check">×</button></span>' : '';
        html += `<li${row}><span class="ck-dot ${sev[f.severity]}"></span><span>${nucs.length > 1 && f === r.res.findings[0] ? `<sup>${n.slice(0, -1)}</sup>${n.slice(-1)}: ` : ''}${esc(f.text)}</span>${tools}</li>`;
        first = false;
      }
    }
    if (!html) return `<ul class="ck-list"><li><span class="ck-dot ck-info"></span><span>No ${this.nuc} list was in the pasted text.</span><span class="ck-tools"><button type="button" class="ck-edit">Edit</button><button type="button" class="ck-clear" aria-label="Clear the check" title="Clear the check">×</button></span></li></ul>`;
    return `<ul class="ck-list">${html}</ul>`;
  }

  /** Saves the predicted peak report (and the pasted measured one, if any) with the compound in the library. */
  private async save(i: number): Promise<void> {
    const item = this.items[i], s = this.shown.get(i);
    if (!item || !this.host.saveSpectra) return;
    if (!s) { this.host.flash('Open the NMR section to predict the spectrum first.'); return; }
    const q = this.quality;
    const entries: { kind: 'predicted' | 'measured'; text: string; solvent: string; quality?: string }[] = [
      { kind: 'predicted', text: siText(s.rows, this.solvent), solvent: this.solvent, quality: q[0].toUpperCase() + q.slice(1) },
    ];
    const st = this.checkState(i, false);
    if (st?.text.trim()) entries.push({ kind: 'measured', text: st.text.trim(), solvent: parsePeakLists(st.text).find((l) => l.solvent)?.solvent ?? '' });
    await this.host.saveSpectra(item.molblock, entries);
  }

  /** Fills the paste box with the newest measured report saved with this compound. */
  private async fromLibrary(i: number, d: HTMLElement): Promise<void> {
    const item = this.items[i];
    if (!item || !this.host.savedReports) return;
    const [text] = await this.host.savedReports(item.molblock);
    if (!text) { this.host.flash('No measured peak report is saved with this compound. Paste one, then use Save to Library.'); return; }
    const st = this.checkState(i, true)!;
    st.text = text;
    const ta = d.querySelector<HTMLTextAreaElement>('.ck-box textarea');
    if (ta) ta.value = text;
    const note = d.querySelector('.ck-read');
    if (note) note.textContent = this.readNote(st);
  }

  /** What the paste box has: the lists read from the text. */
  private readNote(st: CheckState): string {
    const text = parsePeakLists(st.text).map((l) => `${l.nuc} list · ${l.peaks.length} peak${l.peaks.length === 1 ? '' : 's'}${l.solvent ? ` · ${l.solvent}` : ''}`);
    const all = text;
    return all.length ? all.join(', ') : st.text.trim() ? 'No peaks read yet' : 'Paste a 1H or 13C peak or multiplet report';
  }

  /** Reads the pasted lists and compares each with the prediction. */
  private async runCheck(i: number, d: HTMLElement): Promise<void> {
    const st = this.checkState(i, true)!, s = this.shown.get(i);
    const ta = d.querySelector<HTMLTextAreaElement>('.ck-box textarea');
    if (ta) st.text = ta.value;
    if (!s) return;
    const lists = parsePeakLists(st.text);
    if (!lists.length) { this.host.flash('No peaks found: paste a list such as 1H NMR (400 MHz, CDCl3) δ 7.26 (s, 1H).'); return; }
    st.results.clear();
    for (const list of lists) {
      if (st.results.has(list.nuc)) continue;
      const rowIdx: number[] = [], rows: PredictedRow[] = [];
      s.rows.forEach((r, k) => {
        const a = s.graph.atoms[r.atoms[0]];
        const name = a.el === 'C' ? r.numbers.map((x) => `C${x}`).join(', ') : r.label;
        if (list.nuc === '1H' && r.h1 && r.hCount) { rowIdx.push(k); rows.push({ shift: r.h1.value, spread: r.h1.spread, n: r.hCount, mult: r.mult, j: r.j, exchangeable: a.el !== 'C', range: r.exch && !r.exch.gone ? [r.exch.lo, r.exch.hi] : undefined, label: name }); }
        if (list.nuc === '13C' && r.c13) { rowIdx.push(k); rows.push({ shift: r.c13.value, spread: r.c13.spread, n: r.atoms.length, label: name }); }
      });
      const solvent = list.solvent ?? this.solvent;
      const known = await knownPeaks(solvent, list.nuc, await this.host.importedTables?.().catch(() => null) ?? null);
      const res = checkData(list, rows, known);
      const note = list.solvent && list.solvent.toLowerCase() !== this.solvent.toLowerCase() ? `The list is in ${list.solvent}; the prediction is for ${this.solvent}. Pick ${list.solvent} above to compare like with like.` : undefined;
      st.results.set(list.nuc, { list, res, pred: rows, rowIdx, basis: s.rows, note });
    }
    st.editing = false;
    if (!this.report && !st.results.has(this.nuc as CheckNucleus)) { this.nuc = st.results.keys().next().value!; this.restyle(d.closest<HTMLElement>('.frag')?.parentElement ?? document.body); }
    else this.render(i, d);
    if (this.win?.visible && this.winItem === i) this.win.refresh();
  }

  /** The measured list drawn against the prediction in the Spectrum window. */
  private overlayFor(i: number, nuc: Nucleus, sf: number): MeasuredOverlay | undefined {
    if (!isCheckNuc(nuc)) return undefined;
    const r = this.checkState(i, false)?.results.get(nuc);
    return r ? measuredOverlay(r, nuc, sf) : undefined;
  }

  /** Which nucleus the spectrum shows: the list's, or 1H beside the peak report. */
  private specNuc(i: number): Nucleus { return this.report ? '1H' : this.nucOf(i); }
  /** The nucleus the list of structure i shows: 19F or 31P only for a structure that has them. */
  private nucOf(i: number): Nucleus { const n = this.nuc; return n === '1H' || n === '13C' || this.shown.get(i)?.rows.some((r) => r.xNuc === n) ? n : '1H'; }

  /** The spectrum data for one structure (simulated once per field and quality). */
  private dataFor(i: number, sf: number, quality: NmrQuality, nuc: Nucleus): SpectrumData | null {
    const s = this.shown.get(i);
    if (!s) return null;
    this.useRows(i, s);
    const rowLabels = s.rows.map((r) => r.label);
    if (nuc === '13C') return { nuc, sticks: s.rows.flatMap((r, k) => (r.c13 ? [{ shift: r.c13.value, n: r.atoms.length, row: k }] : [])), measured: this.overlayFor(i, nuc, sf), rowLabels };
    if (nuc === '19F' || nuc === '31P') return { nuc, sticks: s.rows.flatMap((r, k) => (r.xNuc === nuc && r.x ? [{ shift: r.x.value, n: r.atoms.length, row: k }] : [])), rowLabels };
    const key = `${sf}|${quality}`;
    let spec = s.specs.get(key);
    if (!spec) {
      const job = quality === 'fast' || s.pending.has(key) ? null : quality === 'accurate' && this.host.conformers
        ? Promise.all([this.couplings3d(s), this.gaps(s)]).then(([pj, gap]) => spectrumInBackground(s.graph, s.h1, s.codes, sf, quality, pj, gap) ?? predictSpectrum(s.graph, s.h1, s.codes, sf, quality, undefined, pj, gap))
        : spectrumInBackground(s.graph, s.h1, s.codes, sf, quality, undefined, s.netGap);
      if (job) {
        // first-order lines straight away; the exact spectrum replaces them when it is ready
        s.pending.add(key);
        job.then((sp) => { s.specs.set(key, sp); this.specReady(i, s); }, () => { s.specs.set(key, predictSpectrum(s.graph, s.h1, s.codes, sf, 'fast', undefined, undefined, s.netGap)); this.specReady(i, s); });
      }
      if (s.pending.has(key)) spec = s.specs.get(`${sf}|fast`) ?? predictSpectrum(s.graph, s.h1, s.codes, sf, 'fast', undefined, undefined, s.netGap);
      else { spec = predictSpectrum(s.graph, s.h1, s.codes, sf, quality, undefined, undefined, s.netGap); s.specs.set(key, spec); }
      if (quality === 'fast') s.specs.set(key, spec);
    }
    return { nuc, spec, groupRows: spec.groups.map((g) => s.rowOf[g.atoms[0]]), measured: this.overlayFor(i, nuc, sf), rowLabels };
  }

  /** Vicinal couplings from the structure's conformers (built once); none when no model can be built. */
  private couplings3d(s: Shown): Promise<ProtonJ[]> {
    s.pj ??= this.model3d(s).then((m) => (m ? graphCouplings3d(m, s.heavy, s.graph.atoms.map((a) => a.h)) : [])).catch(() => []);
    return s.pj;
  }

  /** The structure's conformers with their populations (built once); null when no model can be built. */
  private model3d(s: Shown): Promise<Model3d | null> {
    s.model ??= this.host.conformers!(s.molblock).then((m) => ({ ...m, conformers: withPopulations(m.conformers) }), () => null);
    return s.model;
  }

  private loadSplit(): Promise<Ch2SplitTrees | null> {
    const url = this.host.splitUrl;
    if (!url) return Promise.resolve(null);
    this.splitTrees ??= fetch(url).then((r) => (r.ok ? r.json() as Promise<Ch2SplitTrees> : null)).catch(() => null);
    return this.splitTrees;
  }

  /** Predicted gaps between the two protons of each diastereotopic CH2, by graph atom (once). */
  private gaps(s: Shown): Promise<Record<number, number>> {
    if (Object.keys(s.netGap).length) s.gap ??= Promise.resolve(s.netGap);
    s.gap ??= Promise.all([this.model3d(s), this.loadSplit()]).then(([m, trees]) => {
      const out: Record<number, number> = {};
      if (!m || !trees) return out;
      const byModel = ch2Splits(m, trees);
      s.heavy.forEach((ma, ga) => { const d = byModel.get(ma); if (d !== undefined && d >= MIN_GAP && s.graph.atoms[ga].h === 2) out[ga] = d; });
      return out;
    }).catch(() => ({}));
    return s.gap;
  }

  /** The rows for the quality setting: each diastereotopic CH2 as two rows once its gap is predicted (on every quality when the networks give gaps, else on Accurate). */
  private useRows(i: number, s: Shown): void {
    const gapped = Object.keys(s.netGap).length > 0 || (this.quality === 'accurate' && !!this.host.conformers && !!this.host.splitUrl);
    if (gapped && !s.gap) {
      void this.gaps(s).then((gap) => {
        if (this.shown.get(i) !== s || !Object.keys(gap).length) return;
        s.splitRows = splitRows(s.baseRows, gap, s.graph);
        s.splitRowOf = s.graph.atoms.map(() => -1);
        s.splitRows.forEach((r, k) => { for (const a of r.atoms) if (s.splitRowOf![a] < 0) s.splitRowOf![a] = k; });
        const d = document.querySelector<HTMLElement>(`details.nmr[data-item="${i}"]`);
        if (d && (this.quality === 'accurate' || Object.keys(s.netGap).length)) {
          this.render(i, d);
          // Check Data matched the old rows: match again
          if (this.checkState(i, false)?.results.size && d instanceof HTMLDetailsElement) void this.runCheck(i, d);
        }
        if (this.win?.visible && this.winItem === i) this.win.refresh();
        if (this.marks) this.host.redraw();
      });
    }
    const split = gapped && s.splitRows;
    s.rows = split ? s.splitRows! : s.baseRows;
    s.rowOf = split ? s.splitRowOf! : s.baseRowOf;
  }

  /** A background simulation finished: redraw the strip and the window if they still show it. */
  private specReady(i: number, s: Shown): void {
    if (this.shown.get(i) !== s) return;
    const d = document.querySelector<HTMLElement>(`details.nmr[data-item="${i}"]`);
    if (d) this.drawStrip(i, d, null);
    if (this.win?.visible && this.winItem === i) this.win.refresh();
  }

  /** Draws the panel's small spectrum (panel width, 400 MHz). */
  private drawStrip(i: number, d: HTMLElement, hotRow: number | null): void {
    const box = d.querySelector<HTMLElement>('.nmr-strip');
    const data = this.dataFor(i, 400, this.quality, this.specNuc(i));
    if (!box || !data) return;
    const w = Math.max(160, Math.round(box.clientWidth || d.clientWidth || 260)), r = autoRange(data);
    box.querySelector('svg')?.remove();
    box.insertAdjacentHTML('afterbegin', spectrumSvg(data, { w, h: 86, hi: r.hi, lo: r.lo, labels: false, hotRow }));
  }

  /** Quality of the 1H simulation (shared with the Spectrum window). */
  private get quality(): NmrQuality { return nmrQuality(); }

  /** Shows a quality setting changed elsewhere (Settings ▸ Preferences). */
  /** The NMR sections now in the Analysis panel (none in the browser and iPad versions). */
  private sections(): HTMLDetailsElement[] {
    return [...document.querySelectorAll<HTMLDetailsElement>('details.nmr:not(.nmr-off)')];
  }

  /** For the ribbon: what one of the NMR commands does to the first structure's section. False when there is none yet. */
  ribbon(act: 'predict' | 'window' | 'marks' | 'check' | '1H' | '13C' | { solvent: string }): boolean {
    const d = this.sections()[0];
    if (!d) return false;
    if (typeof act === 'object') {
      const sel = d.querySelector<HTMLSelectElement>('.nmr-solvent')!;
      sel.value = act.solvent;
      sel.dispatchEvent(new Event('change'));
    } else if (act === '1H' || act === '13C') d.querySelector<HTMLButtonElement>(`.nmr-nuc button[data-nuc="${act}"]`)?.click();
    else if (act === 'marks') d.querySelector<HTMLButtonElement>('.nmr-marks')?.click();
    else if (act === 'check') d.querySelector<HTMLButtonElement>('.nmr-check')?.click();
    if (!d.open) d.open = true;
    d.scrollIntoView({ block: 'nearest' });
    if (act === 'window') this.popOut(Number(d.dataset.item), d.getBoundingClientRect());
    return true;
  }

  /** Settings ▸ NMR Prediction was saved: draw the open sections and the window again. */
  settingsChanged(panel: HTMLElement | null): void {
    if (panel) {
      for (const sel of panel.querySelectorAll<HTMLSelectElement>('.nmr-solvent')) sel.value = this.solvent;
      for (const el of panel.querySelectorAll<HTMLDetailsElement>('details.nmr')) if (el.open) void this.fill(Number(el.dataset.item), el, this.seq);
    }
    this.win?.refresh();
  }

  qualityChanged(panel: HTMLElement | null): void {
    if (panel) this.restyle(panel); else this.win?.refresh();
  }

  /** Hovering a row or a peak: its atoms on the drawing, its row in the list, its peaks in both spectra. */
  private hoverRow(i: number, row: number | null, from: 'list' | 'strip' | 'window'): void {
    const s = this.shown.get(i);
    this.hot = s && row !== null ? s.rows[row].atoms.map((a) => s.ids[a]).filter((x): x is number => x !== null) : [];
    this.host.redraw();
    const d = document.querySelector<HTMLElement>(`details.nmr[data-item="${i}"]`);
    if (d) {
      if (from !== 'list') for (const tr of d.querySelectorAll<HTMLElement>('.nmr-body [data-row]')) tr.classList.toggle('hot', row !== null && tr.dataset.row!.split(',').includes(String(row)));
      if (from !== 'strip') this.drawStrip(i, d, row);
    }
    if (from !== 'window' && this.win?.visible && this.winItem === i) this.win.highlight(row);
  }

  /** The popped-out Spectrum window, made on first use. */
  private popOut(i: number, near: DOMRect | null): void {
    this.winItem = i;
    this.win ??= new SpectrumWindow({
      data: (sf, q) => this.dataFor(this.winItem, sf, q, this.specNuc(this.winItem)),
      hover: (row) => this.hoverRow(this.winItem, row, 'window'),
      copyPicture: (png) => (this.host.copyPicture ? this.host.copyPicture(png) : navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }) })])),
      putOnCanvas: (png) => { if (this.host.placePicture) this.host.placePicture(png); else this.host.flash('Pictures cannot be put on this page.'); },
      flash: (t) => this.host.flash(t),
      closed: () => {},
    });
    this.win.open(near);
  }

  /** Brings every NMR section in line with the nucleus and view settings. */
  private restyle(panel: HTMLElement): void {
    for (const d of panel.querySelectorAll<HTMLElement>('details.nmr')) {
      d.querySelector<HTMLElement>('.nmr-nuc')!.hidden = this.report;
      d.querySelector('.nmr-view')!.setAttribute('aria-pressed', String(this.report));
      this.render(Number(d.dataset.item), d);
    }
    this.win?.refresh();
  }

  /** What Show on Drawing puts on the structure. */
  get mode(): DrawMode { try { const m = localStorage.getItem('ci-nmr-draw'); return m === 'numbers' || m === 'confidence' ? m : 'shifts'; } catch { return 'shifts'; } }
  set mode(v: DrawMode) { try { localStorage.setItem('ci-nmr-draw', v); } catch { /* not remembered */ } }

  /** The predicted shifts, atom numbers or confidence dots on the drawing (overlay, drawing coordinates). */
  drawMarks(ctx: CanvasRenderingContext2D, scale: number, atom: (id: number) => { x: number; y: number } | undefined, neighbours: (id: number) => { id: number; x: number; y: number }[], accent: string): void {
    if (!this.open) return;
    if (!this.marks) {
      // hovering a row or a peak still finds its atoms on the drawing
      if (!this.hot.length) return;
      ctx.save();
      ctx.strokeStyle = accent; ctx.lineWidth = 2 / scale;
      for (const id of this.hot) { const p = atom(id); if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 8 / scale, 0, Math.PI * 2); ctx.stroke(); } }
      ctx.restore();
      return;
    }
    const mode = this.mode;
    const px = 1 / scale;
    const r = 7.5 * px;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.shown.values()) {
      // the structure's middle: of equally wide gaps, a label takes the one facing away from it
      const pts = s.ids.map((id) => (id !== null ? atom(id) : undefined)).filter((q): q is { x: number; y: number } => !!q);
      const cx = pts.reduce((t, q) => t + q.x, 0) / (pts.length || 1), cy = pts.reduce((t, q) => t + q.y, 0) / (pts.length || 1);
      for (const row of s.rows) {
        if (row.pair === 'lo') continue; // drawn with its partner: "2.62/2.53"
        row.atoms.forEach((a, k) => {
          const n = row.numbers[k];
          const id = s.ids[a];
          const p = id !== null ? atom(id) : undefined;
          if (id === null || !p) return;
          const hot = this.hot.includes(id);
          if (mode === 'confidence') {
            const h = row.c13 ?? row.h1 ?? row.x ?? null;
            if (!h) return;
            ctx.fillStyle = confidenceColour(h, row.c13 ? 3 : row.x ? 5 : 0.3);
            if (hot) { ctx.strokeStyle = accent; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(p.x, p.y, 7.5 * px, 0, Math.PI * 2); ctx.stroke(); }
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 * px;
            ctx.beginPath(); ctx.arc(p.x, p.y, 4.5 * px, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            return;
          }
          if (mode === 'numbers' && n === null) return;
          const dir = labelDirection(p, id, neighbours(id), s.ring, cx, cy);
          const ux = Math.cos(dir), uy = Math.sin(dir);
          if (mode === 'numbers') {
            const x = p.x + ux * 15 * px, y = p.y + uy * 15 * px;
            if (hot) { ctx.strokeStyle = accent; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(x, y, r + 2.5 * px, 0, Math.PI * 2); ctx.stroke(); }
            ctx.font = `600 ${9.5 * px}px system-ui, sans-serif`;
            ctx.fillStyle = accent;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(n), x, y + 0.5 * px);
            return;
          }
          // shifts: δC by the atom, δH beyond it (stacked under δC when the label points sideways)
          const labels: { text: string; colour: string; bold: boolean }[] = [];
          if (row.c13) labels.push({ text: row.c13.value.toFixed(1), colour: '#555555', bold: false });
          if (row.x) labels.push({ text: row.x.value.toFixed(1), colour: '#555555', bold: false });
          if (row.h1 && row.hCount && !row.exch) labels.push({ text: row.h1.value.toFixed(2) + (row.pair === 'hi' && row.lo !== undefined ? `/${row.lo.toFixed(2)}` : ''), colour: accent, bold: true });
          if (!labels.length) return;
          const side = Math.abs(ux) > 0.6;
          const at = labels.map((_, j) => side
            ? { x: p.x + ux * 22 * px, y: p.y + uy * 22 * px + (labels.length > 1 ? (j ? 6.5 : -6.5) : 0) * px }
            : { x: p.x + ux * (16 + 12 * j) * px, y: p.y + uy * (16 + 12 * j) * px });
          labels.forEach((l, j) => {
            ctx.font = `${l.bold ? 600 : 400} ${10.5 * px}px system-ui, sans-serif`;
            const w = ctx.measureText(l.text).width;
            // a paper-coloured backing keeps the number clear of bonds it crosses
            ctx.fillStyle = hot ? 'rgba(14,124,134,0.16)' : 'rgba(255,255,255,0.85)';
            ctx.fillRect(at[j].x - w / 2 - 1.5 * px, at[j].y - 6 * px, w + 3 * px, 12 * px);
            ctx.fillStyle = l.colour;
            ctx.fillText(l.text, at[j].x, at[j].y + 0.5 * px);
          });
        });
      }
    }
    ctx.restore();
  }
}

export type DrawMode = 'shifts' | 'numbers' | 'confidence';

/** Green for a small expected error (as the list's chip), amber for a loose one, red for a wide one or no similar measured atoms. */
export function confidenceColour(h: ShiftHit, wide: number): string {
  if (h.measured) return '#2e9d5b';
  if (h.n === 0 || h.spread > 2 * wide) return '#c8423b';
  return h.spread > wide ? '#d99a1e' : '#2e9d5b';
}

/** The direction for an atom's label: the widest gap between its bonds, never inside a ring, facing out. */
function labelDirection(p: { x: number; y: number }, id: number, nbrs: { id: number; x: number; y: number }[], ring: Set<string>, cx: number, cy: number): number {
  const nb = nbrs.map((q) => ({ a: Math.atan2(q.y - p.y, q.x - p.x), ring: ring.has(`${id},${q.id}`) })).sort((u, v) => u.a - v.a);
  const angles = nb.map((q) => q.a);
  if (!angles.length) return -Math.PI / 4;
  if (angles.length === 1) return angles[0] + Math.PI;
  const out = Math.atan2(p.y - cy, p.x - cx);
  let best = -Infinity, dir = -Math.PI / 4;
  angles.forEach((u, k) => {
    const v = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI;
    const mid = (u + v) / 2;
    // gap width first (within about 10°), never inside a ring, then facing outward
    const inRing = nb.length > 2 && nb[k].ring && nb[(k + 1) % nb.length].ring;
    const score = Math.round((v - u) / 0.17) - (inRing ? 100 : 0) + 0.5 * Math.cos(mid - out);
    if (score > best) { best = score; dir = mid; }
  });
  return dir;
}
