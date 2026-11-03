// Check Data: reads a measured peak list (as an SI writes it) and compares it with the predicted
// shifts and multiplicities of the structure: which measured peak belongs to which set of atoms,
// which are far from their prediction, which predicted signals are missing, and which measured
// peaks belong to nothing (with the solvent or impurity they may be).

export type CheckNucleus = '1H' | '13C';

/** One measured peak: a shift or a range (lo..hi), with what the list says about it. */
export interface MeasuredPeak {
  /** Shift, ppm (the middle of a range). */
  value: number;
  lo: number;
  hi: number;
  /** Multiplicity as written (s, d, dd, m, br s, app t ...), lower case. */
  mult?: string;
  /** Coupling constants, Hz, largest first. */
  j?: number[];
  /** Integral (1H, number of H) or carbon count (13C, "(2C)"). */
  n?: number;
  /** The text the peak was read from. */
  text: string;
}

export interface MeasuredList {
  nuc: CheckNucleus;
  sf?: number;
  solvent?: string;
  peaks: MeasuredPeak[];
}

/** A predicted set of equivalent atoms (a row of the NMR list). */
export interface PredictedRow {
  shift: number;
  /** Expected error, ppm. */
  spread: number;
  /** H on the set (1H) or atoms in the set (13C). */
  n: number;
  mult?: string;
  j?: number[];
  /** Hydrogens on O, N or S: they exchange, so their shift moves and they may not be seen. */
  exchangeable?: boolean;
  /** How the atoms are named in sentences ("H5", "C3, C4", "OH"). */
  label: string;
}

/** A peak a solvent or impurity gives in this solvent. */
export interface KnownPeak { name: string; shift: number }

export type CheckStatus = 'ok' | 'off' | 'missing' | 'extra';

export interface RowMatch {
  row: number;
  /** Index into the measured list's peaks, or null when no peak was matched. */
  peak: number | null;
  /** Measured minus predicted, ppm (0 inside a measured range). */
  delta: number;
  status: CheckStatus;
  /** Multiplicity or coupling differences, as a sentence fragment. */
  pattern?: string;
}

export interface ExtraPeak { peak: number; /** H or C left over. */ n: number; maybe?: string }

export interface Finding { severity: 'ok' | 'warn' | 'bad' | 'info'; text: string; row?: number; peak?: number }

export interface CheckResult {
  nuc: CheckNucleus;
  rows: RowMatch[];
  extras: ExtraPeak[];
  findings: Finding[];
  /** Predicted signals found / predicted signals expected to show. */
  found: number;
  expected: number;
  /** Measured total (H or C, peaks of the structure only) and the structure's own. */
  measuredTotal: number | null;
  structureTotal: number;
}

// ---------------------------------------------------------------------------------------------
// Reading peak lists

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const DASH = String.raw`\s*[-–—−]\s*`;

/** Splits pasted text into 1H and 13C lists (an SI paragraph often holds both). */
export function parsePeakLists(text: string): MeasuredList[] {
  const t = text.replace(/ /g, ' ').replace(/[¹]H/g, '1H').replace(/[¹][³]C/g, '13C');
  const marks: { at: number; nuc: CheckNucleus }[] = [];
  const re = /\b(1H|13C)(?:\s*\{1H\})?\s*NMR|δ\s*([HC])\b/g;
  for (let m: RegExpExecArray | null; (m = re.exec(t));) marks.push({ at: m.index, nuc: m[1] ? (m[1] as CheckNucleus) : m[2] === 'H' ? '1H' : '13C' });
  // merge marks that follow each other closely ("1H NMR ... δH" is one list)
  const blocks: { nuc: CheckNucleus; text: string }[] = [];
  if (!marks.length) blocks.push({ nuc: guessNucleus(t), text: t });
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].at : t.length;
    const last = blocks[blocks.length - 1];
    if (last && last.nuc === m.nuc && !/\d+\.\d+/.test(last.text.replace(/\([^)]*MHz[^)]*\)/g, ''))) last.text += t.slice(m.at, end);
    else blocks.push({ nuc: m.nuc, text: t.slice(m.at, end) });
  });
  return blocks.map((b) => parseBlock(b.text, b.nuc)).filter((l) => l.peaks.length);
}

function guessNucleus(t: string): CheckNucleus {
  const v = [...t.matchAll(/\d+\.\d+/g)].map((m) => Number(m[0]));
  return v.some((x) => x > 20) ? '13C' : '1H';
}

function parseBlock(text: string, nuc: CheckNucleus): MeasuredList {
  const out: MeasuredList = { nuc, peaks: [] };
  // header: (400 MHz, CDCl3)
  const head = /\(([^)]*?)(\d{2,4})\s*MHz([^)]*)\)/i.exec(text);
  if (head) {
    out.sf = Number(head[2]);
    const sol = /(CDCl3|CD2Cl2|DMSO-d6|\(CD3\)2SO|CD3OD|methanol-d4|acetone-d6|\(CD3\)2CO|C6D6|benzene-d6|CD3CN|acetonitrile-d3|D2O|THF-d8|toluene-d8|pyridine-d5)/i.exec(head[1] + head[3]);
    if (sol) out.solvent = normalizeSolvent(sol[1]);
  }
  let body = head ? text.slice(head.index + head[0].length) : text;
  const delta = body.search(/δ/);
  if (delta >= 0) body = body.slice(delta + 1);
  body = body.replace(/^\s*[HC](?![a-z])/, '').replace(/^[\s:=(ppm)]+/, '');
  if (nuc === '1H') {
    const re = new RegExp(`(${NUM})(?:${DASH}(${NUM}))?\\s*\\(([^)]*)\\)`, 'g');
    for (let m: RegExpExecArray | null; (m = re.exec(body));) {
      const a = Number(m[1]), b = m[2] !== undefined ? Number(m[2]) : a;
      if (a > 20 || b > 20) continue;
      const p: MeasuredPeak = { value: (a + b) / 2, lo: Math.min(a, b), hi: Math.max(a, b), text: m[0], ...readParen(m[3], nuc) };
      out.peaks.push(p);
    }
  } else {
    const re = new RegExp(`(${NUM})(?:${DASH}(${NUM}))?(?:\\s*\\(([^)]*)\\))?`, 'g');
    for (let m: RegExpExecArray | null; (m = re.exec(body));) {
      if (!m[1].includes('.') && !m[3]) continue; // bare integers are not shifts (years, counts)
      const a = Number(m[1]), b = m[2] !== undefined ? Number(m[2]) : a;
      if (a < -50 || a > 260) continue;
      const p: MeasuredPeak = { value: (a + b) / 2, lo: Math.min(a, b), hi: Math.max(a, b), text: m[0], ...(m[3] ? readParen(m[3], nuc) : {}) };
      out.peaks.push(p);
    }
  }
  return out;
}

function normalizeSolvent(s: string): string {
  const k = s.toLowerCase();
  if (k === '(cd3)2so') return 'DMSO-d6';
  if (k === 'methanol-d4') return 'CD3OD';
  if (k === '(cd3)2co') return 'acetone-d6';
  if (k === 'benzene-d6') return 'C6D6';
  if (k === 'acetonitrile-d3') return 'CD3CN';
  const known = ['CDCl3', 'CD2Cl2', 'DMSO-d6', 'CD3OD', 'acetone-d6', 'C6D6', 'CD3CN', 'D2O', 'THF-d8', 'toluene-d8', 'pyridine-d5'];
  return known.find((x) => x.toLowerCase() === k) ?? s;
}

const MULT_WORD = /^(?:(br\.?|broad|app\.?|apparent|ap)\s*)?(s|d|t|q|p|quint|quin|pent|sext|sex|sept|hept|m|[dtq]{2,5})(?![a-z])/i;

/** Reads "(dd, J = 15.9, 7.1 Hz, 2H)" or "(2C)". */
function readParen(s: string, nuc: CheckNucleus): Partial<MeasuredPeak> {
  const out: Partial<MeasuredPeak> = {};
  const parts = s.split(/[,;]/).map((x) => x.trim());
  const first = parts[0] ?? '';
  const mm = MULT_WORD.exec(first);
  if (mm) {
    const br = mm[1] && /^br|broad/i.test(mm[1]) ? 'br ' : mm[1] ? 'app ' : '';
    let w = mm[2].toLowerCase();
    if (w === 'quint' || w === 'quin' || w === 'pent') w = 'p';
    if (w === 'sex') w = 'sext';
    if (w === 'hept') w = 'sept';
    out.mult = br + w;
  } else if (/^br\b/i.test(first)) out.mult = 'br';
  const js = [...s.matchAll(/J\s*(?:\([^)]*\))?\s*=\s*([\d.,\s]+?)\s*Hz/gi)].flatMap((m) => m[1].split(/[,\s]+/).filter(Boolean).map(Number));
  // "J = 15.9 Hz, 7.1 Hz" puts later values outside the first match
  for (const m of s.matchAll(/(?:^|,)\s*(\d+(?:\.\d+)?)\s*Hz/g)) { const v = Number(m[1]); if (!js.includes(v)) js.push(v); }
  if (js.length) out.j = js.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => b - a);
  const n = nuc === '1H' ? /(\d+(?:\.\d+)?)\s*H\b/.exec(s) : /(\d+)\s*C\b/.exec(s);
  if (n) out.n = Number(n[1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Matching

/** How far a measured peak is from a shift, ppm (0 inside a range). */
const dist = (p: MeasuredPeak, v: number) => (v < p.lo ? p.lo - v : v > p.hi ? v - p.hi : 0);

/** Multiplet letters, ignoring br/app; null when nothing can be compared (m, br, missing). */
function pattern(m?: string): string | null {
  if (!m) return null;
  const w = m.replace(/^(br|app)\s*/, '');
  return !w || w === 'm' || w === 'br' ? null : w;
}

/** Tolerances: below these a difference is never called off. */
const TOL: Record<CheckNucleus, { shift: number; unmatched: number }> = { '1H': { shift: 0.1, unmatched: 4 }, '13C': { shift: 2, unmatched: 4 } };

/** Compares a measured list with the predicted rows. known: solvent and impurity peaks to name extra peaks. */
export function checkData(list: MeasuredList, rows: PredictedRow[], known: KnownPeak[] = []): CheckResult {
  const nuc = list.nuc, tol = TOL[nuc];
  const peaks = list.peaks;
  const hasN = nuc === '1H' ? peaks.some((p) => p.n !== undefined) : false;
  // capacity of each peak, in units (H for 1H; atom sets for 13C, one per listed peak unless "(2C)")
  const cap = peaks.map((p) => (nuc === '1H' ? (hasN ? Math.round(p.n ?? 0) : 1e6) : Math.max(1, p.n ?? 1)));
  const units = rows.map((r) => (nuc === '1H' ? Math.max(1, Math.round(r.n)) : 1));
  const sig = (r: PredictedRow) => Math.max(r.spread, tol.shift / 2);
  const cost = (r: PredictedRow, p: MeasuredPeak) => {
    let c = dist(p, r.shift) / sig(r);
    const a = pattern(r.mult), b = pattern(p.mult);
    if (nuc === '1H' && a && b && a !== b) c += 0.5;
    if (r.exchangeable) c *= 0.3; // OH/NH move with concentration and water
    return c;
  };
  const flow = minCostAssign(units, cap, rows.map((r) => peaks.map((p) => cost(r, p))), (k) => (rows[k].exchangeable ? 1.5 : tol.unmatched), nuc === '1H' ? (hasN ? 2.5 : 0) : 1.5);
  const out: RowMatch[] = rows.map((r, k) => {
    // the peak holding most of the row's units
    let best: number | null = null, most = 0;
    flow[k].forEach((u, pi) => { if (u > most) { most = u; best = pi; } });
    if (best === null) return { row: k, peak: null, delta: 0, status: 'missing' as CheckStatus };
    const p = peaks[best];
    const d = r.shift < p.lo ? p.lo - r.shift : r.shift > p.hi ? p.hi - r.shift : 0;
    const off = !r.exchangeable && Math.abs(d) > Math.max(2 * r.spread, tol.shift);
    const m: RowMatch = { row: k, peak: best, delta: d, status: off ? 'off' : 'ok' };
    if (nuc === '1H' && !r.exchangeable) {
      const a = pattern(r.mult), b = pattern(p.mult);
      if (a && b && a !== b) m.pattern = `predicted ${r.mult}${r.j?.length ? `, J = ${r.j.map((x) => x.toFixed(1)).join(', ')} Hz` : ''}`;
      else if (a && b && r.j?.length && p.j?.length === r.j.length) {
        const worst = Math.max(...r.j.map((x, i) => Math.abs(x - p.j![i])));
        if (worst > 1.5) m.pattern = `J = ${p.j.map((x) => x.toFixed(1)).join(', ')} Hz, predicted ${r.j.map((x) => x.toFixed(1)).join(', ')} Hz`;
      }
    }
    return m;
  });
  // measured peaks with units left over
  const used = peaks.map((_, pi) => rows.reduce((t, _r, k) => t + flow[k][pi], 0));
  const extras: ExtraPeak[] = [];
  peaks.forEach((p, pi) => {
    const left = nuc === '1H' ? (hasN ? (p.n ?? 0) - used[pi] : used[pi] ? 0 : 1) : used[pi] ? 0 : p.n ?? 1;
    if (left < (nuc === '1H' ? 0.3 : 1) && !(nuc === '1H' && hasN && used[pi] === 0 && (p.n ?? 0) > 0)) return;
    if (used[pi] > 0 && nuc === '1H' && left < 0.6) return;
    const near = known.map((q) => ({ q, d: Math.abs(q.shift - p.value) })).filter((x) => x.d <= (nuc === '1H' ? 0.03 : 0.3)).sort((a, b) => a.d - b.d)[0];
    extras.push({ peak: pi, n: Math.round(left * 100) / 100, maybe: near?.q.name });
  });
  // totals
  const structureTotal = rows.reduce((t, r) => t + r.n, 0);
  const extraUnits = extras.reduce((t, e) => t + e.n, 0);
  const listTotal = nuc === '1H' ? (hasN ? peaks.reduce((t, p) => t + (p.n ?? 0), 0) - extraUnits : null) : peaks.reduce((t, p) => t + (p.n ?? 1), 0) - extraUnits;
  const visible = rows.map((_, k) => k).filter((k) => !rows[k].exchangeable);
  const found = visible.filter((k) => out[k].peak !== null).length;
  return { nuc, rows: out, extras, findings: findings(list, rows, out, extras, found, visible.length, listTotal, structureTotal), found, expected: visible.length, measuredTotal: listTotal, structureTotal };
}

const f2 = (v: number, nuc: CheckNucleus) => v.toFixed(nuc === '1H' ? 2 : 1);

function peakName(p: MeasuredPeak, nuc: CheckNucleus): string {
  const where = p.hi > p.lo ? `${f2(p.hi, nuc)}–${f2(p.lo, nuc)}` : f2(p.value, nuc);
  const bits = [p.mult, p.n !== undefined ? `${p.n}${nuc === '1H' ? 'H' : 'C'}` : ''].filter(Boolean);
  return bits.length ? `${where} (${bits.join(', ')})` : where;
}

function findings(list: MeasuredList, rows: PredictedRow[], m: RowMatch[], extras: ExtraPeak[], found: number, expected: number, listTotal: number | null, structureTotal: number): Finding[] {
  const nuc = list.nuc, unit = nuc === '1H' ? 'H' : 'C';
  const out: Finding[] = [];
  const sig = nuc === '1H' ? 'signals' : 'carbons';
  const tot = listTotal !== null ? ` · ${nuc === '1H' ? 'integrals' : 'listed'} ${+listTotal.toFixed(1)}${unit}, structure ${structureTotal}${unit}` : '';
  out.push({ severity: found === expected && !extras.length && m.every((x) => x.status !== 'off') ? 'ok' : found >= expected - 1 ? 'ok' : 'warn', text: `${found} of ${expected} predicted ${sig} found${tot}` });
  for (const e of extras) {
    const p = list.peaks[e.peak];
    out.push({ severity: 'bad', peak: e.peak, text: `${peakName(p, nuc)} has no match in the structure.${e.maybe ? ` ${e.maybe}?` : ''}` });
  }
  m.forEach((x, k) => {
    const r = rows[k];
    if (x.status === 'off') out.push({ severity: 'warn', row: k, peak: x.peak!, text: `${peakName(list.peaks[x.peak!], nuc)} is ${f2(Math.abs(x.delta), nuc)} ppm from ${r.label}'s prediction (${f2(r.shift, nuc)} ±${f2(r.spread, nuc)}). Check the assignment or the structure.` });
    else if (x.status === 'missing' && !r.exchangeable) out.push({ severity: 'warn', row: k, text: `No peak for ${r.label} (predicted ${f2(r.shift, nuc)}${nuc === '1H' ? `, ${r.n}H` : ''}).` });
    else if (x.status === 'missing' && r.exchangeable) out.push({ severity: 'info', row: k, text: `${r.label} not listed: it exchanges, so it is often broad or not seen.` });
  });
  m.forEach((x, k) => { if (x.pattern) out.push({ severity: 'info', row: k, peak: x.peak ?? undefined, text: `${peakName(list.peaks[x.peak!], nuc)}: ${x.pattern}.` }); });
  if (listTotal !== null && Math.abs(listTotal - structureTotal) >= 1 && nuc === '1H') {
    const exch = rows.filter((r, k) => r.exchangeable && m[k].peak === null).reduce((t, r) => t + r.n, 0);
    if (Math.abs(listTotal + exch - structureTotal) >= 1) out.push({ severity: 'warn', text: `The integrals add up to ${+listTotal.toFixed(1)}H; the structure has ${structureTotal}H.` });
  }
  if (nuc === '13C' && listTotal !== null && listTotal < expected) out.push({ severity: 'info', text: `${expected} different carbons are expected; the list has ${listTotal}.` });
  return out;
}

/**
 * Min-cost assignment of row units to peak capacity (successive shortest paths; the problem is
 * small). Each row's units can also go unmatched at unmatchedCost(row) per unit, and a peak can
 * take units beyond its capacity at overflow per unit (integrals are rarely exact).
 * Returns flow[row][peak] in units.
 */
function minCostAssign(units: number[], cap: number[], cost: number[][], unmatchedCost: (row: number) => number, overflow: number): number[][] {
  const R = units.length, P = cap.length;
  const flow = units.map(() => new Array(P).fill(0));
  const load = new Array(P).fill(0);
  // nodes: 0 source, 1..R rows, R+1..R+P peaks, R+P+1 sink
  const S = 0, T = R + P + 1, N = T + 1;
  const left = [...units];
  for (let guard = 0; guard < 10000; guard++) {
    if (left.every((u) => u === 0)) break;
    // Bellman-Ford over the residual graph
    const dist = new Array(N).fill(Infinity), prev: [number, number][] = new Array(N);
    dist[S] = 0;
    for (let it = 0; it < N; it++) {
      let changed = false;
      const relax = (a: number, b: number, c: number, tag: number) => { if (dist[a] + c < dist[b] - 1e-12) { dist[b] = dist[a] + c; prev[b] = [a, tag]; changed = true; } };
      for (let r = 0; r < R; r++) if (left[r] > 0) relax(S, 1 + r, 0, 0);
      for (let r = 0; r < R; r++) {
        relax(1 + r, T, unmatchedCost(r), -1); // unmatched
        for (let p = 0; p < P; p++) {
          relax(1 + r, 1 + R + p, cost[r][p], 1); // row -> peak
          if (flow[r][p] > 0) relax(1 + R + p, 1 + r, -cost[r][p], 2); // undo
        }
      }
      for (let p = 0; p < P; p++) relax(1 + R + p, T, load[p] < cap[p] ? 0 : overflow, 3);
      if (!changed) break;
    }
    if (dist[T] === Infinity) break;
    // walk back the path and push one unit
    let v = T, row = -1;
    const steps: [number, number, number][] = [];
    while (v !== S) { const [u, tag] = prev[v]; steps.push([u, v, tag]); v = u; }
    for (const [u, w, tag] of steps.reverse()) {
      if (tag === 0) row = w - 1;
      else if (tag === 1) flow[u - 1][w - 1 - R]++;
      else if (tag === 2) flow[w - 1][u - 1 - R]--;
      else if (tag === 3) load[u - 1 - R]++;
    }
    // a path that ends unmatched: rows -> sink directly (flow not recorded)
    if (row >= 0) left[row]--;
    else break;
  }
  return flow;
}

// ---------------------------------------------------------------------------------------------
// Drawing a measured list

const SPLIT: Record<string, number> = { s: 0, d: 1, t: 2, q: 3, p: 4, sext: 5, sept: 6 };

/** Line positions for a measured 1H list as written (first order: each letter of the multiplicity
 *  splits by its J), Hz from 0 ppm at sf MHz; ranges and m become an even spread of lines. */
export function measuredLines(list: MeasuredList, sf: number, width = 0.9): { hz: Float64Array; intensity: Float64Array; width: Float64Array; sf: number } {
  const HZ: number[] = [], I: number[] = [], W: number[] = [];
  for (const p of list.peaks) {
    const n = p.n ?? 1;
    const w = (p.mult ?? '').replace(/^(br|app)\s*/, '');
    const broad = /^br/.test(p.mult ?? '');
    if (p.hi > p.lo || w === 'm' || !w && p.mult) {
      // a range: lines across it (a lump the width of the range, at least 8 Hz)
      const lo = p.hi > p.lo ? p.lo : p.value - 4 / sf, hi = p.hi > p.lo ? p.hi : p.value + 4 / sf;
      const k = 9;
      for (let i = 0; i < k; i++) { HZ.push((lo + ((hi - lo) * i) / (k - 1)) * sf); I.push(n / k); W.push(Math.max(width, ((hi - lo) * sf) / k)); }
      continue;
    }
    const letters = w === 'sext' || w === 'sept' ? [w] : w.split('');
    let lines: [number, number][] = [[p.value * sf, n]];
    letters.forEach((l, i) => {
      const k = SPLIT[l] ?? 0, j = p.j?.[i] ?? p.j?.[p.j.length - 1] ?? 7;
      if (!k) return;
      const bin = [1];
      for (let a = 0; a < k; a++) bin.push((bin[a] * (k - a)) / (a + 1));
      const next: [number, number][] = [];
      for (const [f, v] of lines) bin.forEach((c, m) => next.push([f + (m - k / 2) * j, (v * c) / 2 ** k]));
      lines = next;
    });
    for (const [f, v] of lines) { HZ.push(f); I.push(v); W.push(broad ? Math.max(width, 12) : width); }
  }
  const o = HZ.map((_, i) => i).sort((a, b) => HZ[a] - HZ[b]);
  return { hz: Float64Array.from(o, (i) => HZ[i]), intensity: Float64Array.from(o, (i) => I[i]), width: Float64Array.from(o, (i) => W[i]), sf };
}
