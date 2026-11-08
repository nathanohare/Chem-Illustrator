// What the Analysis panel shows and how (Settings ▸ Analysis, and the panel's own gear for quick
// changes; both change these same settings): its rows in order, which are shown, decimal places
// and units; the lab calculations; what the ribbon's Analysis box shows; and what Attach
// Descriptors writes under a structure.

import { newCalc, type LabCalc, type CalcUnit } from './bench';

/** A row of the panel. Rows of the table and the sections under it (isotope pattern, properties…) share one order. */
export type RowKey =
  | 'name' | 'exact' | 'mw' | 'mz' | 'ea' | 'stereo' | 'cas'
  | 'density' | 'bp' | 'mp' | 'vp' | 'flash' | 'ri'
  | 'clogp' | 'molref' | 'tpsa' | 'hbd' | 'hba' | 'rotb' | 'heavy' | 'fsp3' | 'logs' | 'pka' | 'pkah'
  | 'iso' | 'electrons' | 'props' | 'pubchem' | 'nmr'
  | `calc:${string}`;

/** The rows that are sections of their own rather than lines of the table. */
export const SECTION_ROWS: RowKey[] = ['iso', 'electrons', 'props', 'pubchem', 'nmr'];

export const ROW_NAMES: Record<string, string> = {
  name: 'Systematic name', exact: 'Exact mass', mw: 'Mol. wt.', mz: 'm/z', ea: 'Elemental analysis', stereo: 'Stereo', cas: 'CAS RN',
  density: 'Density', bp: 'Boiling point', mp: 'Melting point', vp: 'Vapor pressure', flash: 'Flash point', ri: 'Refractive index',
  clogp: 'cLogP', molref: 'Molar refractivity', tpsa: 'tPSA', hbd: 'H-bond donors', hba: 'H-bond acceptors', rotb: 'Rotatable bonds', heavy: 'Heavy atoms', fsp3: 'Fsp3', logs: 'Water solubility (logS)', pka: 'pKa (most acidic)', pkah: 'pKaH (most basic)',
  iso: 'Isotope pattern', electrons: 'Electron count', props: 'Properties', pubchem: 'PubChem', nmr: 'NMR (predicted)',
};

/** What the descriptors under a structure can show. */
export type DescKey = 'formula' | 'name' | 'exact' | 'mw' | 'mz' | 'ea' | 'hrms' | `calc:${string}`;
export const DESC_NAMES: Record<string, string> = { formula: 'Formula', name: 'Name', exact: 'Exact mass', mw: 'Molecular weight', mz: 'm/z of the ion', ea: 'Elemental analysis (%)', hrms: 'HRMS line' };
/** Each descriptor line's own words before its value, as journals write them (blank: the line has none). */
export const DESC_LABELS: Record<string, string> = { formula: '', name: '', exact: 'Exact Mass:', mw: 'Mol. Wt.:', mz: 'm/z:', ea: 'Elemental Analysis:', hrms: '' };

export type TempUnit = '°C' | '°F' | 'K';
export type PressureUnit = 'kPa' | 'mmHg' | 'Pa' | 'bar';

export interface AnalysisPrefs {
  rows: { key: RowKey; on: boolean }[];
  /** Decimal places. */
  dp: { exact: number; mw: number; mz: number; ea: number };
  units: { temp: TempUnit; pressure: PressureUnit };
  calcs: LabCalc[];
  /** The ribbon's Analysis box: three lines under the formula (full-size ribbon), and one value (Simplified ribbon). '' leaves a line empty. */
  ribbon: { lines: [RowKey | '', RowKey | '', RowKey | '']; simple: RowKey | '' };
  /** What Attach Descriptors writes, in order: shown or not, the words before each, and decimal places. */
  descriptors: { key: DescKey; on: boolean; label: string; dp: number | null }[];
  /** The systematic name loads by itself (a few seconds after the first structure). */
  autoName: boolean;
  /** Look structures up on PubChem by themselves (sends their SMILES) for measured bench values. */
  autoPubchem: boolean;
}

export const DEFAULT_ROWS: AnalysisPrefs['rows'] = [
  { key: 'name', on: true }, { key: 'exact', on: true }, { key: 'mw', on: true }, { key: 'mz', on: true }, { key: 'ea', on: true },
  { key: 'stereo', on: true }, { key: 'cas', on: true },
  { key: 'density', on: true }, { key: 'bp', on: true }, { key: 'mp', on: true }, { key: 'vp', on: false }, { key: 'flash', on: false }, { key: 'ri', on: false },
  { key: 'clogp', on: false }, { key: 'molref', on: false }, { key: 'tpsa', on: false }, { key: 'hbd', on: false }, { key: 'hba', on: false }, { key: 'rotb', on: false },
  { key: 'heavy', on: false }, { key: 'fsp3', on: false }, { key: 'logs', on: false }, { key: 'pka', on: false }, { key: 'pkah', on: false },
  { key: 'calc:1', on: true },
  { key: 'electrons', on: true }, { key: 'iso', on: true }, { key: 'props', on: true }, { key: 'pubchem', on: true }, { key: 'nmr', on: true },
];

export const DEFAULT_ANALYSIS: AnalysisPrefs = {
  rows: DEFAULT_ROWS,
  dp: { exact: 4, mw: 2, mz: 4, ea: 2 },
  units: { temp: '°C', pressure: 'kPa' },
  calcs: [newCalc('1')],
  ribbon: { lines: ['mw', 'exact', 'mz'], simple: 'mw' },
  descriptors: [
    { key: 'formula', on: true, label: '', dp: null }, { key: 'name', on: false, label: '', dp: null }, { key: 'exact', on: true, label: DESC_LABELS.exact, dp: 4 }, { key: 'mw', on: true, label: DESC_LABELS.mw, dp: 2 },
    { key: 'mz', on: false, label: DESC_LABELS.mz, dp: 4 }, { key: 'ea', on: false, label: DESC_LABELS.ea, dp: 2 }, { key: 'hrms', on: false, label: '', dp: null },
  ],
  autoName: true,
  autoPubchem: false,
};

const copy = (p: AnalysisPrefs): AnalysisPrefs => structuredClone(p);

const isRow = (k: unknown, calcs: LabCalc[]): k is RowKey =>
  typeof k === 'string' && (k in ROW_NAMES || (k.startsWith('calc:') && calcs.some((c) => `calc:${c.id}` === k)));
const isDesc = (k: unknown, calcs: LabCalc[]): k is DescKey =>
  typeof k === 'string' && (k in DESC_NAMES || (k.startsWith('calc:') && calcs.some((c) => `calc:${c.id}` === k)));
const dp = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 8 ? v : d);
const UNITS: CalcUnit[] = ['mmol', 'mol', 'equiv', 'mg', 'g', 'uL', 'mL'];

function parseCalc(v: unknown): LabCalc | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const c = newCalc(o.id);
  if (typeof o.name === 'string') c.name = o.name.slice(0, 40);
  if (typeof o.amount === 'number' && o.amount > 0 && isFinite(o.amount)) c.amount = o.amount;
  if (UNITS.includes(o.unit as CalcUnit)) c.unit = o.unit as CalcUnit;
  if (typeof o.scale === 'number' && o.scale > 0 && isFinite(o.scale)) c.scale = o.scale;
  for (const k of ['mass', 'volume', 'mmol'] as const) if (typeof o[k] === 'boolean') c[k] = o[k] as boolean;
  c.solution = typeof o.solution === 'number' && o.solution > 0 && isFinite(o.solution) ? o.solution : null;
  if (typeof o.sig === 'number' && Number.isInteger(o.sig) && o.sig >= 1 && o.sig <= 6) c.sig = o.sig;
  return c;
}

/**
 * The settings as saved, checked; anything missing or unreadable takes its default. Rows added to
 * the program since are put in where the default list has them, so a saved order keeps working.
 */
export function parseAnalysisPrefs(v: unknown): AnalysisPrefs {
  const out = copy(DEFAULT_ANALYSIS);
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.calcs)) {
    const seen = new Set<string>();
    out.calcs = o.calcs.map(parseCalc).filter((c): c is LabCalc => !!c && !seen.has(c.id) && !!seen.add(c.id)).slice(0, 20);
  }
  if (Array.isArray(o.rows)) {
    const rows: AnalysisPrefs['rows'] = [];
    for (const r of o.rows) {
      const x = r as { key?: unknown; on?: unknown };
      if (isRow(x?.key, out.calcs) && !rows.some((y) => y.key === x.key)) rows.push({ key: x.key, on: x.on !== false });
    }
    // rows the saved list lacks: after the default row before them
    DEFAULT_ROWS.forEach((d, i) => {
      if (rows.some((y) => y.key === d.key) || (d.key.startsWith('calc:') && !out.calcs.some((c) => `calc:${c.id}` === d.key))) return;
      const before = DEFAULT_ROWS.slice(0, i).reverse().find((p) => rows.some((y) => y.key === p.key));
      const at = before ? rows.findIndex((y) => y.key === before.key) + 1 : 0;
      rows.splice(at, 0, { ...d });
    });
    // each calculation has a row
    for (const c of out.calcs) if (!rows.some((y) => y.key === `calc:${c.id}`)) rows.splice(rows.findIndex((y) => SECTION_ROWS.includes(y.key)), 0, { key: `calc:${c.id}`, on: true });
    out.rows = rows;
  } else out.rows = out.rows.filter((r) => !r.key.startsWith('calc:') || out.calcs.some((c) => `calc:${c.id}` === r.key));
  if (o.dp && typeof o.dp === 'object') {
    const d = o.dp as Record<string, unknown>;
    out.dp = { exact: dp(d.exact, 4), mw: dp(d.mw, 2), mz: dp(d.mz, 4), ea: dp(d.ea, 2) };
  }
  if (o.units && typeof o.units === 'object') {
    const u = o.units as Record<string, unknown>;
    if (u.temp === '°C' || u.temp === '°F' || u.temp === 'K') out.units.temp = u.temp;
    if (u.pressure === 'kPa' || u.pressure === 'mmHg' || u.pressure === 'Pa' || u.pressure === 'bar') out.units.pressure = u.pressure;
  }
  if (o.ribbon && typeof o.ribbon === 'object') {
    const r = o.ribbon as Record<string, unknown>;
    const line = (x: unknown): RowKey | '' => (x === '' ? '' : isRow(x, out.calcs) && !SECTION_ROWS.includes(x) && x !== 'name' ? x : '');
    if (Array.isArray(r.lines)) out.ribbon.lines = [line(r.lines[0]), line(r.lines[1]), line(r.lines[2])];
    if ('simple' in r) out.ribbon.simple = line(r.simple);
  }
  if (Array.isArray(o.descriptors)) {
    const list: AnalysisPrefs['descriptors'] = [];
    for (const r of o.descriptors) {
      const x = r as Record<string, unknown>;
      if (!isDesc(x?.key, out.calcs) || list.some((y) => y.key === x.key)) continue;
      list.push({ key: x.key, on: x.on === true, label: typeof x.label === 'string' ? x.label.slice(0, 40) : DESC_LABELS[x.key] ?? '', dp: x.dp === null ? null : dp(x.dp, 2) });
    }
    // lines added to the program since: after the default line before them
    DEFAULT_ANALYSIS.descriptors.forEach((d, i) => {
      if (list.some((y) => y.key === d.key)) return;
      const before = DEFAULT_ANALYSIS.descriptors.slice(0, i).reverse().find((x) => list.some((y) => y.key === x.key));
      list.splice(before ? list.findIndex((y) => y.key === before.key) + 1 : 0, 0, { ...d });
    });
    out.descriptors = list;
  }
  if (typeof o.autoName === 'boolean') out.autoName = o.autoName;
  if (typeof o.autoPubchem === 'boolean') out.autoPubchem = o.autoPubchem;
  return out;
}

// ---------------------------------------------------------------- the settings in use

let current: AnalysisPrefs = copy(DEFAULT_ANALYSIS);
const listeners = new Set<() => void>();

export function analysisPrefs(): AnalysisPrefs {
  return current;
}

/** Use these settings (from Settings ▸ Analysis, the panel's gear, or a settings file); whatever shows them is told. */
export function setAnalysisPrefs(p: AnalysisPrefs): void {
  current = parseAnalysisPrefs(JSON.parse(JSON.stringify(p)));
  for (const f of listeners) f();
}

export function onAnalysisPrefs(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The calculation a row or descriptor key names. */
export function calcOf(p: AnalysisPrefs, key: string): LabCalc | undefined {
  return key.startsWith('calc:') ? p.calcs.find((c) => `calc:${c.id}` === key) : undefined;
}

/** A free id for a new calculation. */
export function nextCalcId(p: AnalysisPrefs): string {
  let n = 1;
  while (p.calcs.some((c) => c.id === String(n))) n++;
  return String(n);
}

/** The descriptors a new descriptor caption shows, in order. */
export function defaultDescriptors(p: AnalysisPrefs = current): DescKey[] {
  return p.descriptors.filter((d) => d.on).map((d) => d.key);
}

// ---------------------------------------------------------------- units

export function tempText(c: number, u: TempUnit): string {
  const v = u === '°C' ? c : u === '°F' ? (c * 9) / 5 + 32 : c + 273.15;
  return `${Math.round(v)}${u === 'K' ? ' K' : ` ${u}`}`.replace('-', '−');
}

export function pressureText(kPa: number, u: PressureUnit): string {
  const v = u === 'kPa' ? kPa : u === 'mmHg' ? kPa / 0.133322 : u === 'Pa' ? kPa * 1000 : kPa / 100;
  const s = v >= 100 ? String(Math.round(v)) : v >= 0.1 ? v.toPrecision(2) : v.toExponential(1).replace('e', ' × 10^');
  return `${s.replace(/\^([+−-]?\d+)$/, (_, e: string) => '^' + e.replace('+', ''))} ${u === 'mmHg' ? 'mmHg' : u}`;
}
