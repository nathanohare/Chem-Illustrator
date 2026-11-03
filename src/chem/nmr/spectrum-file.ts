// Measured 1D spectra for Check Data: JCAMP-DX files and Bruker processed data (a folder sent as a
// .zip), then peak picking, multiplets and integrals into a MeasuredList like a pasted SI list.
//
// The JCAMP-DX reading is ported from Open-NMR's nmrsuite.io.jcamp and nmrsuite.io.bruker.
// Copyright (c) 2026, Open-NMR contributors (Lauren Rodriguez). BSD 3-Clause License, full text in
// THIRD-PARTY-NOTICES.md. Ported from github.com/laurennicrodriguez/Open-NMR at commit 2149d6a.
// Port, peak grouping and changes: Chem Illustrator contributors, same licence for this file.

import { unzipSync } from 'fflate';
import type { CheckNucleus, MeasuredList, MeasuredPeak } from './check';

/** A processed 1D spectrum: ppm from high to low, real intensities. */
export interface MeasuredSpectrum {
  ppm: Float64Array;
  y: Float64Array;
  /** Spectrometer frequency, MHz. */
  sf: number;
  nuc: CheckNucleus | null;
  solvent?: string;
  /** Where it came from ("JCAMP-DX", "Bruker 1/pdata/1"). */
  source: string;
}

export class SpectrumFileError extends Error {}

// ---------------------------------------------------------------------------------------------
// JCAMP-DX

const SQZ_POS = '@ABCDEFGHI', SQZ_NEG = ' abcdefghi', DIF_POS = '%JKLMNOPQR', DIF_NEG = ' jklmnopqr', DUP = ' STUVWXYZs';
const SQZ = new Map<string, number>(), DIF = new Map<string, number>(), DUPV = new Map<string, number>();
[...SQZ_POS].forEach((c, i) => SQZ.set(c, i));
[...SQZ_NEG].forEach((c, i) => { if (i) SQZ.set(c, -i); });
[...DIF_POS].forEach((c, i) => DIF.set(c, i));
[...DIF_NEG].forEach((c, i) => { if (i) DIF.set(c, -i); });
[...DUP].forEach((c, i) => { if (i) DUPV.set(c, i); });
const ASDF_TOKEN = /([@A-Ia-i%J-Rj-rS-Zs])(\d*)|([+-]?(?:\d+\.?\d*|\.\d+))|\?/g;
const AFFN_NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
const AFFN_LINE = new RegExp(String.raw`^(?:[\s,;]*${AFFN_NUMBER}|[\s,;]*\?)*[\s,;]*$`);
const AFFN_TOKEN = new RegExp(AFFN_NUMBER + String.raw`|\?`, 'g');
const FIRST_X = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]\d+)?)/;
const DATA_LABELS = new Set(['XYDATA', 'XYPOINTS', 'DATATABLE', 'PEAKTABLE']);

const normLabel = (l: string) => l.replace(/[\s\-/_]/g, '').toUpperCase();

function decodeYTokens(text: string): { values: number[]; endedDif: boolean } {
  if (AFFN_LINE.test(text)) return { values: [...text.matchAll(AFFN_TOKEN)].map((m) => (m[0] === '?' ? NaN : Number(m[0]))), endedDif: false };
  const values: number[] = [];
  let lastKind: 'abs' | 'dif' | null = null, lastDif = 0;
  for (const m of text.matchAll(ASDF_TOKEN)) {
    const [all, ch, digits, plain] = m;
    if (all === '?') { values.push(NaN); lastKind = 'abs'; }
    else if (plain !== undefined) { values.push(Number(plain)); lastKind = 'abs'; }
    else if (SQZ.has(ch)) { const v = SQZ.get(ch)!; values.push((ch === ch.toLowerCase() && ch !== '@' ? -1 : 1) * Number(String(Math.abs(v)) + digits)); lastKind = 'abs'; }
    else if (DIF.has(ch)) {
      if (!values.length) throw new SpectrumFileError('The JCAMP-DX data has a difference with nothing before it.');
      const v = DIF.get(ch)!;
      lastDif = (ch === ch.toLowerCase() && ch !== '%' ? -1 : 1) * Number(String(Math.abs(v)) + digits);
      values.push(values[values.length - 1] + lastDif);
      lastKind = 'dif';
    } else if (DUPV.has(ch)) {
      const count = Number(String(DUPV.get(ch)!) + digits);
      if (!values.length) throw new SpectrumFileError('The JCAMP-DX data repeats a value that is not there.');
      for (let k = 0; k < count - 1; k++) values.push(lastKind === 'dif' ? values[values.length - 1] + lastDif : values[values.length - 1]);
    }
  }
  return { values, endedDif: lastKind === 'dif' };
}

function decodeXyData(lines: string[]): number[] {
  const out: number[] = [];
  let prevDif = false;
  for (const raw of lines) {
    const line = raw.split('$$', 1)[0].trim();
    if (!line) continue;
    const m = FIRST_X.exec(line);
    if (!m) throw new SpectrumFileError('A JCAMP-DX data line does not start with an X value.');
    const { values, endedDif } = decodeYTokens(line.slice(m[0].length));
    if (prevDif && values.length) {
      const check = values.shift()!;
      if (out.length && Math.abs(check - out[out.length - 1]) > 1e-6 * Math.max(1, Math.abs(check))) throw new SpectrumFileError('The JCAMP-DX data is damaged (a Y-check failed).');
    }
    out.push(...values);
    prevDif = endedDif;
  }
  return out;
}

function parseJcamp(text: string): { labels: Map<string, string>; data: { key: string; header: string; lines: string[] }[] } {
  const labels = new Map<string, string>();
  const data: { key: string; header: string; lines: string[] }[] = [];
  let cur: string[] | null = null, curLabel: string | null = null, depth = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('##')) {
      const eq = raw.indexOf('=');
      const label = eq < 0 ? raw.slice(2) : raw.slice(2, eq);
      const key = normLabel(label);
      let value = eq < 0 ? '' : raw.slice(eq + 1);
      value = key.startsWith('$') ? value.trim() : value.split('$$', 1)[0].trim();
      cur = null; curLabel = key;
      if (key === 'TITLE') { depth++; if (depth > 1 && data.length) break; }
      if (key === 'END') { depth--; if (data.length) break; continue; }
      if (key === 'PAGE') continue;
      if (DATA_LABELS.has(key)) { cur = []; data.push({ key, header: value, lines: cur }); continue; }
      if (!labels.has(key)) labels.set(key, value);
    } else if (cur) cur.push(raw);
    else if (curLabel && raw.trim() && !raw.startsWith('$$')) labels.set(curLabel, `${labels.get(curLabel) ?? ''}\n${raw.trim()}`.trim());
  }
  return { labels, data };
}

const num = (labels: Map<string, string>, key: string, dflt?: number): number => {
  const v = labels.get(key);
  if (v !== undefined && v !== '') return Number(v.split(/\s+/)[0].replace(/,$/, ''));
  if (dflt === undefined) throw new SpectrumFileError(`The JCAMP-DX file has no ##${key}.`);
  return dflt;
};
const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim());
const unquote = (v: string | undefined) => (v ?? '').replace(/^<|>$/g, '').trim();

function nucleusOf(s: string): CheckNucleus | null {
  const t = s.replace(/[\^\s]/g, '').toUpperCase();
  return t === '1H' ? '1H' : t === '13C' ? '13C' : null;
}

/** A 1D spectrum from JCAMP-DX text (XYDATA, XYPOINTS or NTUPLES real page). FIDs are not read. */
export function readJcamp(text: string): MeasuredSpectrum {
  const { labels, data } = parseJcamp(text);
  if (!data.length) throw new SpectrumFileError('The file has no spectrum in it.');
  const dt = `${labels.get('DATATYPE') ?? ''} ${labels.get('NTUPLES') ?? ''}`.toUpperCase();
  if (dt.includes('FID')) throw new SpectrumFileError('This is an FID; open the processed spectrum (or the Bruker folder with its pdata) instead.');
  const obs = num(labels, '.OBSERVEFREQUENCY', 0);
  let y: number[], first: number, last: number, units: string;
  if (labels.has('NTUPLES')) {
    const symbols = list(labels.get('SYMBOL')).map((s) => s.toUpperCase());
    const ix = symbols.indexOf('X');
    const at = (key: string, i: number, d: number) => { const v = Number(list(labels.get(key))[i]); return Number.isFinite(v) ? v : d; };
    let real: number[] | null = null;
    for (const sec of data) {
      if (sec.key !== 'DATATABLE') continue;
      const m = /\(\s*X\+\+\(\s*(\w)\s*\.\./i.exec(sec.header);
      const sym = m ? m[1].toUpperCase() : '';
      if (sym === 'R') { const f = at('FACTOR', symbols.indexOf('R'), 1); real = decodeXyData(sec.lines).map((v) => v * f); }
    }
    if (!real) throw new SpectrumFileError('The file has no real spectrum page.');
    const n = at('VARDIM', ix, real.length);
    y = real.slice(0, n);
    first = at('FIRST', ix, 0); last = at('LAST', ix, n - 1);
    units = (list(labels.get('UNITS'))[ix] ?? '').toUpperCase();
  } else {
    const sec = data[0];
    if (sec.key === 'XYPOINTS') {
      const nums = sec.lines.flatMap((l) => [...l.split('$$', 1)[0].matchAll(AFFN_TOKEN)].map((m) => (m[0] === '?' ? NaN : Number(m[0]))));
      const xf = num(labels, 'XFACTOR', 1), yf = num(labels, 'YFACTOR', 1);
      const xs: number[] = []; y = [];
      for (let k = 0; k + 1 < nums.length; k += 2) { xs.push(nums[k] * xf); y.push(nums[k + 1] * yf); }
      first = xs[0]; last = xs[xs.length - 1];
    } else if (sec.key === 'XYDATA') {
      const yf = num(labels, 'YFACTOR', 1);
      y = decodeXyData(sec.lines).map((v) => v * yf);
      const n = num(labels, 'NPOINTS', y.length);
      if (y.length !== n) throw new SpectrumFileError(`The file says ${n} points but holds ${y.length}.`);
      first = num(labels, 'FIRSTX'); last = num(labels, 'LASTX');
    } else throw new SpectrumFileError('This kind of JCAMP-DX data is not read yet (a peak table?).');
    units = (labels.get('XUNITS') ?? '').toUpperCase();
  }
  let p0: number, p1: number;
  if (units.includes('PPM')) { p0 = first; p1 = last; }
  else if (units.includes('HZ') || !units) {
    if (!obs) throw new SpectrumFileError('The spectrum is in Hz but the file gives no spectrometer frequency.');
    p0 = first / obs; p1 = last / obs;
  } else throw new SpectrumFileError(`The X axis is in ${units}, not ppm or Hz.`);
  let ys = Float64Array.from(y, (v) => (Number.isFinite(v) ? v : 0));
  if (p0 < p1) { ys = ys.reverse(); [p0, p1] = [p1, p0]; }
  const n = ys.length, step = n > 1 ? (p0 - p1) / (n - 1) : 0;
  const ppm = Float64Array.from({ length: n }, (_, i) => p0 - i * step);
  const solvent = unquote(labels.get('.SOLVENTNAME') ?? labels.get('$SOLVENT')) || undefined;
  return { ppm, y: ys, sf: obs || num(labels, '$SF', 0) || num(labels, '$BF1', 400), nuc: nucleusOf(labels.get('.OBSERVENUCLEUS') ?? unquote(labels.get('$NUC1'))), solvent, source: 'JCAMP-DX' };
}

// ---------------------------------------------------------------------------------------------
// Bruker processed data

function brukerParams(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/^##\$?([^=]+)=\s*(.*)$/gm)) out.set(m[1].trim().toUpperCase(), m[2].trim());
  return out;
}

/** The processed spectrum of a Bruker experiment, from its files (path -> bytes; any folder depth). */
export function readBrukerProcessed(files: Map<string, Uint8Array>): MeasuredSpectrum {
  const paths = [...files.keys()].map((p) => p.replace(/\\/g, '/'));
  const r1 = paths.filter((p) => /(^|\/)pdata\/\d+\/1r$/.test(p)).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
  if (!r1) {
    if (paths.some((p) => /(^|\/)fid$/.test(p))) throw new SpectrumFileError('The folder has only the raw FID; process it (TopSpin or MestReNova) so it has pdata/1/1r, then open it again.');
    throw new SpectrumFileError('No Bruker spectrum (pdata/1/1r) in the folder.');
  }
  const dir = r1.slice(0, -2);
  const get = (p: string) => files.get(p) ?? files.get(p.replace(/\//g, '\\'));
  const procsBytes = get(dir + 'procs');
  if (!procsBytes) throw new SpectrumFileError('The Bruker folder has no procs file.');
  const procs = brukerParams(new TextDecoder('latin1').decode(procsBytes));
  const expDir = dir.replace(/pdata\/\d+\/$/, '');
  const acqusBytes = get(expDir + 'acqus');
  const acqus = acqusBytes ? brukerParams(new TextDecoder('latin1').decode(acqusBytes)) : new Map<string, string>();
  const si = Number(procs.get('SI')), offset = Number(procs.get('OFFSET')), swp = Number(procs.get('SW_P')), sf = Number(procs.get('SF'));
  if (!(si > 0) || !Number.isFinite(offset) || !(swp > 0) || !(sf > 0)) throw new SpectrumFileError('The Bruker procs file is missing SI, OFFSET, SW_p or SF.');
  const bytes = get(r1)!;
  const little = Number(procs.get('BYTORDP') ?? 0) === 0;
  const dtyp = Number(procs.get('DTYPP') ?? 0), nc = Number(procs.get('NC_PROC') ?? 0);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dtyp === 2 ? 8 : 4, n = Math.min(si, Math.floor(bytes.byteLength / width));
  const y = new Float64Array(n), scale = 2 ** nc;
  for (let i = 0; i < n; i++) y[i] = (dtyp === 2 ? dv.getFloat64(i * 8, little) : dv.getInt32(i * 4, little)) * scale;
  const step = swp / sf / si;
  const ppm = Float64Array.from({ length: n }, (_, i) => offset - i * step);
  const nuc = nucleusOf(unquote(procs.get('AXNUC') ?? acqus.get('NUC1')));
  const solvent = unquote(acqus.get('SOLVENT')) || undefined;
  return { ppm, y, sf, nuc, solvent, source: `Bruker ${dir.replace(/\/$/, '')}` };
}

/** A spectrum from a file the user picked: .jdx/.dx/.jcamp, or a .zip of a Bruker folder (or of a JCAMP-DX file). */
export function readSpectrumFile(name: string, bytes: Uint8Array): MeasuredSpectrum {
  if (/\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(bytes); } catch { throw new SpectrumFileError('The .zip could not be opened.'); }
    const map = new Map(Object.entries(files));
    const jdx = [...map.keys()].find((k) => /\.(jdx|dx|jcamp)$/i.test(k));
    if (jdx && ![...map.keys()].some((k) => /pdata\/\d+\/1r$/.test(k))) return readJcamp(new TextDecoder('latin1').decode(map.get(jdx)!));
    return readBrukerProcessed(map);
  }
  return readJcamp(new TextDecoder('latin1').decode(bytes));
}

// ---------------------------------------------------------------------------------------------
// Peaks, multiplets and integrals

export interface PickedLine { ppm: number; height: number }
export interface Multiplet { lo: number; hi: number; center: number; lines: PickedLine[]; area: number; mult: string; j: number[] }

/** Noise: the median absolute deviation of point-to-point differences (signal-free in most of a spectrum). */
function noiseOf(y: Float64Array): number {
  const d: number[] = [];
  const stride = Math.max(1, Math.floor(y.length / 20000));
  for (let i = stride; i < y.length; i += stride) d.push(Math.abs(y[i] - y[i - stride]));
  d.sort((a, b) => a - b);
  return (d[Math.floor(d.length / 2)] || 1e-12) / 0.6745 / Math.SQRT2;
}

/** A flat baseline: the median of the spectrum's lowest half (good enough for integrals of a processed spectrum). */
function baselineOf(y: Float64Array): number {
  const s = Float64Array.from(y).sort();
  return s[Math.floor(s.length * 0.25)];
}

/** Local maxima well above the noise, positions refined by a parabola through three points. */
export function pickLines(sp: MeasuredSpectrum, snr = 8): PickedLine[] {
  const { y, ppm } = sp;
  const base = baselineOf(y), noise = noiseOf(y), thr = base + snr * noise;
  const max = y.reduce((m, v) => (v > m ? v : m), -Infinity);
  const floor = Math.max(thr, base + (max - base) * 0.004);
  const out: PickedLine[] = [];
  for (let i = 2; i < y.length - 2; i++) {
    const v = y[i];
    if (v < floor || v < y[i - 1] || v <= y[i + 1] || v < y[i - 2] || v < y[i + 2]) continue;
    const a = y[i - 1], c = y[i + 1], den = a - 2 * v + c;
    const off = den ? (0.5 * (a - c)) / den : 0;
    const step = ppm[i] - ppm[i + 1];
    out.push({ ppm: ppm[i] - off * step, height: v - base });
  }
  return out;
}

const SPLIT_NAMES = ['s', 'd', 't', 'q', 'p', 'sext', 'sept'];

/** Pascal's row n, normalized. */
const pascal = (n: number) => { const r = [1]; for (let k = 0; k < n; k++) r.push((r[k] * (n - k)) / (k + 1)); const m = Math.max(...r); return r.map((x) => x / m); };

/** First-order name and couplings of a multiplet from its lines (Hz); m when no simple pattern fits. */
export function nameMultiplet(hz: number[], h: number[]): { mult: string; j: number[] } {
  const n = hz.length;
  if (n === 1) return { mult: 's', j: [] };
  const order = hz.map((_, i) => i).sort((a, b) => hz[a] - hz[b]);
  const f = order.map((i) => hz[i]), w = order.map((i) => h[i]);
  const gaps = f.slice(1).map((x, i) => x - f[i]);
  const even = Math.max(...gaps) - Math.min(...gaps) < Math.max(0.6, 0.12 * Math.min(...gaps));
  const symmetric = w.every((x, i) => Math.abs(x - w[n - 1 - i]) < 0.35 * Math.max(x, w[n - 1 - i]));
  if (!symmetric) return { mult: 'm', j: [] };
  if (even && n <= 7) {
    const want = pascal(n - 1), mx = Math.max(...w);
    if (w.every((x, i) => Math.abs(x / mx - want[i]) < 0.3)) return { mult: SPLIT_NAMES[n - 1], j: [+(gaps.reduce((t, g) => t + g, 0) / gaps.length).toFixed(1)] };
  }
  // two couplings: dd (4 lines), dt / td (6 lines), dq / qd (8 lines)
  const tries: [string, number, number][] = [['dd', 1, 1], ['dt', 1, 2], ['td', 2, 1], ['dq', 1, 3], ['qd', 3, 1], ['tt', 2, 2], ['ddd', 0, 0]];
  for (const [name, a, b] of tries) {
    if (name === 'ddd') {
      if (n !== 8) continue;
      const j1 = f[1] - f[0], j2 = f[2] - f[0], j3 = f[4] - f[0];
      const pred = [0, j1, j2, j1 + j2, j3, j3 + j1, j3 + j2, j1 + j2 + j3].map((x) => f[0] + x).sort((p, q) => p - q);
      if (pred.every((x, i) => Math.abs(x - f[i]) < 0.6)) return { mult: 'ddd', j: [j3, j2, j1].map((x) => +x.toFixed(1)).sort((p, q) => q - p) };
      continue;
    }
    if (n !== (a + 1) * (b + 1)) continue;
    // the larger coupling first: lines split by Ja into a+1 groups of b+1 lines split by Jb
    const jb = f[1] - f[0], ja = f[b + 1] - f[0];
    if (ja <= jb * b - 0.6 && name !== 'tt') continue;
    const pred: number[] = [];
    for (let x = 0; x <= a; x++) for (let y = 0; y <= b; y++) pred.push(f[0] + x * ja + y * jb);
    pred.sort((p, q) => p - q);
    if (pred.every((x, i) => Math.abs(x - f[i]) < 0.6)) return { mult: name, j: [ja, jb].map((x) => +x.toFixed(1)) };
  }
  return { mult: 'm', j: [] };
}

/** Lines grouped into multiplets (a gap wider than maxGap Hz starts a new one) with their areas. */
export function multiplets(sp: MeasuredSpectrum, lines: PickedLine[], maxGap = 22): Multiplet[] {
  const sorted = [...lines].sort((a, b) => b.ppm - a.ppm);
  const groups: PickedLine[][] = [];
  for (const l of sorted) {
    const g = groups[groups.length - 1];
    if (g && (g[g.length - 1].ppm - l.ppm) * sp.sf <= maxGap) g.push(l); else groups.push([l]);
  }
  const base = baselineOf(sp.y);
  const step = sp.ppm.length > 1 ? sp.ppm[0] - sp.ppm[1] : 1;
  const idx = (p: number) => Math.max(0, Math.min(sp.ppm.length - 1, Math.round((sp.ppm[0] - p) / step)));
  return groups.map((g) => {
    const hi = g[0].ppm, lo = g[g.length - 1].ppm;
    // integrate from 3 line widths (~1.5 Hz each) beyond the outer lines
    const pad = 6 / sp.sf;
    let area = 0;
    for (let i = idx(hi + pad); i <= idx(lo - pad); i++) area += Math.max(0, sp.y[i] - base);
    const tall = Math.max(...g.map((l) => l.height));
    const kept = g.filter((l) => l.height > 0.08 * tall); // drop 13C satellites and noise beside the multiplet
    const center = kept.reduce((t, l) => t + l.ppm * l.height, 0) / kept.reduce((t, l) => t + l.height, 0);
    const named = nameMultiplet(kept.map((l) => l.ppm * sp.sf), kept.map((l) => l.height));
    return { lo, hi, center, lines: kept, area, mult: named.mult, j: named.j };
  });
}

/** A measured spectrum as a peak list: 1H multiplets with relative integrals (scaled so the
 *  spectrum's peaks, apart from those at the skip shifts (solvent, water), total hTotal), 13C one
 *  peak per line. */
export function spectrumToList(sp: MeasuredSpectrum, nuc: CheckNucleus, hTotal: number, skip: number[] = []): MeasuredList {
  const lines = pickLines(sp, nuc === '13C' ? 6 : 8);
  if (nuc === '13C') {
    const peaks: MeasuredPeak[] = lines.sort((a, b) => b.ppm - a.ppm).map((l) => ({ value: +l.ppm.toFixed(2), lo: l.ppm, hi: l.ppm, text: l.ppm.toFixed(1) }));
    return { nuc, sf: sp.sf, solvent: sp.solvent, peaks };
  }
  // 13C satellites: 0.2-1.5% of a multiplet, 55-110 Hz to either side (1J(C,H)/2)
  const all = multiplets(sp, lines);
  const ms = all.filter((m) => !all.some((p) => p !== m && m.area < 0.015 * p.area && Math.abs(p.center - m.center) * sp.sf >= 50 && Math.abs(p.center - m.center) * sp.sf <= 115));
  // integrals relative to the peaks that are not the solvent's (skip: residual and water shifts)
  const own = ms.filter((m) => !skip.some((v) => Math.abs(m.center - v) < 0.04));
  const total = (own.length ? own : ms).reduce((t, m) => t + m.area, 0) || 1;
  const peaks: MeasuredPeak[] = ms.map((m) => {
    const n = +((m.area / total) * hTotal).toFixed(2);
    const range = m.mult === 'm' && (m.hi - m.lo) * sp.sf > 8;
    return { value: range ? (m.hi + m.lo) / 2 : m.center, lo: range ? m.lo : m.center, hi: range ? m.hi : m.center, mult: m.mult, j: m.j.length ? m.j : undefined, n, text: `${m.center.toFixed(2)} (${m.mult}, ${n}H)` };
  });
  return { nuc, sf: sp.sf, solvent: sp.solvent, peaks };
}

/** Shifts the axis so the solvent's residual peak sits where it should (the tallest line within
 *  0.1 ppm for 1H, 1 ppm for 13C). Returns the correction applied, ppm (0 when no peak was found). */
export function referenceToSolvent(sp: MeasuredSpectrum, nuc: CheckNucleus, residual: number[]): number {
  if (!residual.length) return 0;
  const reach = nuc === '1H' ? 0.1 : 1;
  const lines = pickLines(sp, 8);
  let best: { d: number; h: number } | null = null;
  for (const r of residual) for (const l of lines) if (Math.abs(l.ppm - r) <= reach && (!best || l.height > best.h)) best = { d: r - l.ppm, h: l.height };
  if (!best || Math.abs(best.d) < 1e-4) return 0;
  for (let i = 0; i < sp.ppm.length; i++) sp.ppm[i] += best.d;
  return best.d;
}

/** The spectrum's nucleus: as the file says, else from its ppm range. */
export function nucleusOfSpectrum(sp: MeasuredSpectrum): CheckNucleus {
  return sp.nuc ?? (sp.ppm[0] - sp.ppm[sp.ppm.length - 1] > 40 ? '13C' : '1H');
}
