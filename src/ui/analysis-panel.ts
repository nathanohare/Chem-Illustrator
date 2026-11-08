// The Analysis panel's contents for one structure, and the journal-style text it can put in the
// drawing (HRMS and elemental analysis lines, as ACS journals write them).

import type { FragmentResult } from '../worker/chem-worker';
import type { DescriptorKey, TextRun } from '../model';
import { parseAdduct, ionMz, type Adduct } from '../chem/hrms';
import { ionCounts, isotopePattern, elementalAnalysis, type IsotopePeak, type JobackResult } from '../chem/analysis';
import type { PkaSite } from '../chem/pka';
import { chargeText, hillFormula, withoutCharge } from '../chem/formula';
import { roman, sup, type MetalCount } from '../chem/electrons';
import { nameRuns } from '../chem/namer';
import type { Compound } from '../chem/pubchem';
import { readDensity, readTemperature, readPressure, readRefractiveIndex, labCalc, calcName, type LabCalc } from '../chem/bench';
import { DEFAULT_ANALYSIS, ROW_NAMES, SECTION_ROWS, DESC_NAMES, DESC_LABELS, analysisPrefs, calcOf, defaultDescriptors, tempText, pressureText, type AnalysisPrefs } from '../chem/analysis-prefs';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A formula with subscript counts and a superscript charge, as HTML. */
export function formulaHtml(f: string): string {
  // the charge: + or − at the end, with its size after a space (C4H12N2 2+)
  const m = /^(.*?)(?:\s+(\d+))?([+−])?$/.exec(f)!;
  return esc(m[1]).replace(/([A-Za-z])(\d+)/g, '$1<sub>$2</sub>') + (m[3] ? `<sup>${m[2] ?? ''}${m[3]}</sup>` : '');
}

/** An adduct label with its charge raised: [M+H]<sup>+</sup>. */
export function adductHtml(label: string): string {
  return esc(label).replace(/\](\d*[+-])$/, (_, c) => `]<sup>${c.replace('-', '−')}</sup>`);
}

export interface IonInfo {
  adduct: Adduct;
  /** Formula of the ion, without its charge (as journals write it after "calcd for"). */
  formula: string;
  mz: number;
  pattern: IsotopePeak[] | null;
}

/** The ion of a structure for an adduct, or null when it can't be made (e.g. losing water from CH4). */
export function ionInfo(r: FragmentResult, adductText: string): IonInfo | null {
  let adduct: Adduct;
  try {
    adduct = parseAdduct(adductText);
  } catch {
    return null;
  }
  // a structure that is already charged is its own ion
  if (r.charge !== 0) adduct = { n: 1, parts: [], z: r.charge, label: '[M]' + (Math.abs(r.charge) > 1 ? Math.abs(r.charge) : '') + (r.charge > 0 ? '+' : '-') };
  const counts = r.props ? ionCounts(new Map(Object.entries(r.props.counts)), adduct) : null;
  if (!counts) return null;
  const formula = hillFormula(Object.fromEntries(counts));
  // m/z from the same masses the rest of the panel uses
  // (RDKit's exact mass of a charged structure already has its electrons added or taken away)
  const mz = r.charge !== 0 ? r.exact / Math.abs(r.charge) : ionMz(r.exact, adduct);
  return { adduct, formula, mz, pattern: isotopePattern(counts, adduct.z) };
}

/** Elemental analysis numbers for a structure, Hill order. */
export function analysisPercents(r: FragmentResult): { el: string; pct: number }[] | null {
  if (!r.props) return null;
  return elementalAnalysis(new Map(Object.entries(r.props.counts)), r.props.weights);
}

/** Elements an elemental analysis reports: C, H and N, and S or a halogen when present. */
function reported(ea: { el: string; pct: number }[]): { el: string; pct: number }[] {
  const keep = new Set(['C', 'H', 'N', 'S']);
  const out = ea.filter((x) => keep.has(x.el));
  return out.length ? out : ea;
}

/** A small bar picture of an isotope pattern. */
function patternSvg(p: IsotopePeak[]): string {
  const W = 220, H = 56, pad = 4;
  const lo = p[0].mz, hi = p[p.length - 1].mz;
  const span = Math.max(hi - lo, 4);
  const x = (mz: number) => pad + ((mz - lo) / span) * (W - 2 * pad - 30) + 10;
  const bars = p.map((q) => `<line x1="${x(q.mz).toFixed(1)}" x2="${x(q.mz).toFixed(1)}" y1="${H - 12}" y2="${(H - 12 - (q.rel / 100) * (H - 18)).toFixed(1)}" />`).join('');
  return `<svg class="iso-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Isotope pattern">
    <line class="axis" x1="${pad}" x2="${W - pad}" y1="${H - 12}" y2="${H - 12}" />${bars}
    <text x="${x(p[0].mz)}" y="${H - 1}" text-anchor="middle">${p[0].mz.toFixed(1)}</text></svg>`;
}

function deg(k: number | null): string {
  return k === null ? '' : `${Math.round(k - 273.15)} °C`.replace('-', '−');
}

/**
 * The panel's HTML for one structure. `i` numbers the structure's buttons
 * (data-insert="hrms:i" and so on), which the app wires up.
 */
/** A ligand's name with the digits of a written formula lowered (PPh3 as PPh₃). */
const ligandHtml = (name: string) => esc(name).replace(/(?<=[A-Za-z)\]])(\d+)/g, '<sub>$1</sub>');

/**
 * The electron count of each metal: oxidation state, dⁿ and electrons on the first line, then
 * each ligand's class and the electrons it gives counted neutral (covalent) and ionic.
 */
export function electronsHtml(counts: MetalCount[]): string {
  if (!counts.length) return '';
  const metal = (c: MetalCount) => {
    const plural = (n: number) => (n === 1 ? '' : ` ×${n}`);
    const kind = (r: MetalCount['ligands'][number]) => r.mm ? 'M–M' : [r.l ? 'L' + (r.l > 1 ? sub(r.l) : '') : '', r.x ? 'X' + (r.x > 1 ? sub(r.x) : '') : '', r.z ? 'Z' : ''].join('');
    const rows = c.ligands.map((r) => `<tr><td>${ligandHtml(r.name)}${plural(r.count)}</td><td>${kind(r)}</td><td>${r.neutral * r.count}</td><td>${r.ionic * r.count}</td></tr>`);
    const closed = c.electrons === 18 ? ' (a closed shell)' : '';
    return `<p class="ec-head"><b>${esc(c.symbol)}(${roman(c.oxidation)})</b>, d${sup(c.dn)}, <b>${c.electrons} electrons</b>${closed} · ${esc(c.classification)}</p>
      <table class="ec-table">
        <tr><th>Ligand</th><th>Class</th><th title="Neutral (covalent) counting: the metal atom's own electrons, one from each X, two from each L">Neutral</th><th title="Ionic counting: the metal ion's d electrons, two from each X⁻ and each L">Ionic</th></tr>
        <tr><td>${esc(c.symbol)}</td><td></td><td>${c.group}</td><td>d${sup(c.dn)}: ${c.dn}</td></tr>
        ${rows.join('')}
        ${c.charge ? `<tr><td>Charge ${c.charge > 0 ? '+' : '−'}${Math.abs(c.charge)}</td><td></td><td>${c.charge > 0 ? '−' : '+'}${Math.abs(c.charge)}</td><td>in d${sup(c.dn)}</td></tr>` : ''}
        <tr class="ec-total"><td>Total</td><td></td><td>${c.electrons}</td><td>${c.electrons}</td></tr>
      </table>${c.notes.map((n) => `<p class="muted small">${esc(n)}</p>`).join('')}`;
  };
  return `<details class="electrons" open><summary title="Green's covalent bond classification: L gives two electrons, X shares one, Z takes two">Electron count</summary>${counts.map(metal).join('')}</details>`;
}

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) => String(n).replace(/\d/g, (d) => SUBS[Number(d)]);

const PKA_TIP = 'Estimated in water by Perrin, Dempsey and Serjeant\'s rules (Hammett and Taft constants). Typical error 0.5–1 unit.';

/** Solubility in words a chemist reads at a glance: mg/mL, or µg/mL when small. */
function solubility(logS: number, mw: number): string {
  const mgPerMl = 10 ** logS * mw;
  return mgPerMl >= 1 ? `${mgPerMl >= 100 ? Math.round(mgPerMl) : mgPerMl.toPrecision(2)} mg/mL` : `${(mgPerMl * 1000).toPrecision(2)} µg/mL`;
}

/** The most acidic proton and the most basic atom. */
function pkaRows(sites: PkaSite[]): string {
  const acid = sites.find((s) => s.kind === 'acid'), base = sites.find((s) => s.kind === 'base');
  const row = (label: string, title: string, s: PkaSite | undefined) =>
    `<tr><th title="${esc(title)}">${label}</th><td>${s ? `${fmtPka(s.pka)} <span class="muted">(${esc(s.group)})</span>` : '<span class="muted">—</span>'}</td></tr>`;
  return row('pKa (est.)', `Most acidic proton. ${PKA_TIP}`, acid) + row('pKaH (est.)', `pKa of the conjugate acid of the most basic atom. ${PKA_TIP}`, base);
}

const fmtPka = (x: number) => x.toFixed(1).replace('-', '−');

/** Every site, when there are more than the two rows show. */
function pkaSitesHtml(sites: PkaSite[]): string {
  if (sites.length <= 2) return '';
  const rows = sites.map((s) => `<tr><td>${s.kind === 'acid' ? 'Acid' : 'Base'}</td><td>${esc(s.group)}</td><td>${fmtPka(s.pka)}</td></tr>`);
  return `<details class="pka-sites"><summary title="${esc(PKA_TIP + ' Each value is for that group alone; later protons of a polyprotic compound are not worked out.')}">All pKa sites</summary><table>${rows.join('')}</table></details>`;
}

/** Joback's critical constants and thermochemistry, and the volatility worked out from them. */
function thermoHtml(jb: JobackResult, vp: number | null, henry: number | null, tip: string): string {
  const v = (x: number | null | undefined, d: number, unit: string) => (x === null || x === undefined ? '<span class="muted">—</span>' : `${x.toFixed(d).replace('-', '−')} ${unit}`);
  if (jb.tb === null) return '';
  const sci = (x: number) => x.toExponential(1).replace('e', ' × 10^').replace(/\^\+?(-?\d+)$/, (_, e: string) => `<sup>${e.replace('-', '−')}</sup>`);
  const vpTip = 'Estimated at 25 °C from the boiling point (Lyman\'s Antoine-type method; solids corrected with Walden\'s rule). Rough: often within a factor of 2–3.';
  return `<details class="thermo"><summary title="${esc(tip)}">Critical point and thermochemistry (est.)</summary><table>
    <tr><th>Critical temperature</th><td>${v(jb.tc === null || jb.tc === undefined ? null : jb.tc - 273.15, 0, '°C')}</td></tr>
    <tr><th>Critical pressure</th><td>${v(jb.pc, 1, 'bar')}</td></tr>
    <tr><th>Critical volume</th><td>${v(jb.vc, 0, 'cm³/mol')}</td></tr>
    <tr><th title="Ideal gas at 298 K">ΔH<sub>f</sub>° (gas)</th><td>${v(jb.hf, 1, 'kJ/mol')}</td></tr>
    <tr><th title="Ideal gas at 298 K">ΔG<sub>f</sub>° (gas)</th><td>${v(jb.gf, 1, 'kJ/mol')}</td></tr>
    <tr><th title="Ideal gas at 298 K">C<sub>p</sub> (gas)</th><td>${v(jb.cp, 1, 'J/(mol·K)')}</td></tr>
    <tr><th title="At the boiling point">ΔH<sub>vap</sub></th><td>${v(jb.hvap, 1, 'kJ/mol')}</td></tr>
    <tr><th>ΔH<sub>fus</sub></th><td>${v(jb.hfus, 1, 'kJ/mol')}</td></tr>
    <tr><th title="${esc(vpTip)}">Vapor pressure</th><td>${vp === null ? '—' : vp >= 0.1 ? v(vp >= 1000 ? vp / 1000 : vp, vp >= 1000 ? 1 : 2, vp >= 1000 ? 'kPa' : 'Pa') : `${sci(vp)} Pa`}</td></tr>
    <tr><th title="${esc('Estimated vapor pressure over estimated solubility (ESOL), 25 °C. Rough: often within a factor of 10.')}">Henry's law constant</th><td>${henry === null ? '—' : `${sci(henry)} Pa·m³/mol`}</td></tr>
    </table></details>`;
}

/** Where the systematic name of a structure in the Analysis panel has got to. */
export type NameState =
  | { kind: 'idle' }
  | { kind: 'busy'; loading: boolean }
  | { kind: 'found'; name: string }
  | { kind: 'none'; message: string };

/** An ion's label as plain text with its charge raised in Unicode ([M+H]⁺, [M+2H]²⁺, [M−H]⁻), for the ion list. */
export function adductText(label: string): string {
  const up: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' };
  return label.replace(/\](\d*[+-])$/, (_, c: string) => ']' + [...c].map((ch) => up[ch]).join('')).replace(/(?<=\[[^\]]*)-/g, '−');
}

/** The ion list that stands in for the m/z row's label: "m/z" and a short drop-down of the common ions. */
export function ionSelectHtml(chosen: string, ions: readonly string[]): string {
  const list = ions.includes(chosen) ? ions : [chosen, ...ions];
  return `<span class="an-ion">m/z <select data-adduct title="The ion for m/z, the isotope pattern and the HRMS text" aria-label="Ion">${list.map((a) => `<option value="${esc(a)}"${a === chosen ? ' selected' : ''}>${esc(adductText(a))}</option>`).join('')}</select></span>`;
}

/**
 * The structure's systematic name, written after its formula (C5H5N – pyridine). The namer starts
 * by itself a few seconds after the first structure is analysed; until it has a name the place is
 * empty, or says it is naming.
 */
export function nameHtml(state: NameState, i: number): string {
  if (state.kind === 'idle') return '';
  if (state.kind === 'busy') return `<span class="an-iupac muted" title="${state.loading ? 'Loading the offline namer (first time this session)' : 'Working out the systematic name'}"> – naming…</span>`;
  if (state.kind === 'none') return `<span class="an-iupac muted" title="${esc(state.message)}"> – no name</span>`;
  const html = nameRuns(state.name).map((r) => (r.italic ? `<i>${esc(r.text)}</i>` : esc(r.text))).join('');
  return `<span class="an-iupac"> – <span class="iupac" title="Systematic name (OpenClatura), checked by reading it back with OPSIN">${html}</span><button type="button" class="an-icon-btn" data-insert="name:${i}" title="Name caption: put the name under the structure; it follows the structure and can be edited like any text" aria-label="Name caption">${CAPTION_ICON}</button></span>`;
}

const CAPTION_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M3 3.5h10M3 7h10"/><path d="M4.5 10.5h7M8 13.5v-6" stroke-width="1.2"/><path d="M6.3 12l1.7 1.7 1.7-1.7"/></svg>';

/** A bench value: measured (from PubChem) or estimated here. */
export interface BenchValue { v: number; measured: boolean }
/** The bench values of a structure, as far as they are known: °C, g/mL, kPa and n. */
export type Bench = Partial<Record<'density' | 'bp' | 'mp' | 'vp' | 'flash' | 'ri', BenchValue>>;

/**
 * A structure's bench values: PubChem's measured ones when it has been looked up, else the
 * estimates (Girolami density, Joback boiling and melting points, the vapor pressure from them).
 */
export function benchValues(r: FragmentResult, c?: Compound | null): Bench {
  const out: Bench = {};
  const m = (k: keyof Bench, v: number | null) => { if (v !== null && isFinite(v)) out[k] = { v, measured: true }; };
  if (c) {
    m('density', readDensity(c.density));
    m('bp', readTemperature(c.boilingPoint));
    m('mp', readTemperature(c.meltingPoint));
    m('vp', readPressure(c.vaporPressure ?? []));
    m('flash', readTemperature(c.flashPoint ?? []));
    m('ri', readRefractiveIndex(c.refractiveIndex ?? []));
  }
  const p = r.props;
  const e = (k: keyof Bench, v: number | null | undefined) => { if (!out[k] && v !== null && v !== undefined && isFinite(v)) out[k] = { v, measured: false }; };
  if (p) {
    e('density', p.density);
    e('bp', p.joback.tb === null ? null : p.joback.tb - 273.15);
    e('mp', p.joback.tm === null ? null : p.joback.tm - 273.15);
    e('vp', p.vp === null ? null : p.vp / 1000);
  }
  return out;
}

/** Liquid at room temperature (25 °C), as far as the melting and boiling points tell; null when unknown. */
export function isLiquid(b: Bench): boolean | null {
  if (b.mp && b.mp.v > 25) return false;
  if (b.bp && b.bp.v < 25) return false;
  return b.mp ? true : null;
}

/** A lab calculation's parts for a structure ("39.6 mg", "40.3 µL"). */
export function calcParts(c: LabCalc, r: FragmentResult, b: Bench): string[] {
  return labCalc(c, { mw: r.mw, density: b.density?.v ?? null, liquid: isLiquid(b) });
}

const BENCH_TIPS: Record<string, string> = {
  density: 'Estimated by Girolami\'s method (J. Chem. Educ. 1994, 71, 962), typical error 0.05 g/mL',
  bp: 'Estimated by Joback–Reid group contributions; typical error 10–25 °C',
  mp: 'Estimated by Joback–Reid group contributions; typical error 10–25 °C, often more',
  vp: 'Estimated at 25 °C from the boiling point; often within a factor of 2–3',
};

/** A bench value as the panel writes it, in the chosen units. */
function benchText(k: string, x: BenchValue, prefs: AnalysisPrefs): string {
  if (k === 'density') return `${x.v.toFixed(x.measured ? 3 : 2)} g/mL`;
  if (k === 'ri') return x.v.toFixed(4);
  if (k === 'vp') return esc(pressureText(x.v, prefs.units.pressure)).replace(/\^([−-]?\d+)/, (_, e: string) => `<sup>${e.replace('-', '−')}</sup>`);
  return tempText(x.v, prefs.units.temp);
}

/** A property as a row of its own: its value (HTML) and the note behind its name; null when the structure has none. */
function propertyCell(key: string, r: FragmentResult): { value: string; plain: string; title: string } | null {
  const p = r.props;
  if (!p) return null;
  const num = (v: number, d: number) => { const t = v.toFixed(d).replace('-', '−'); return { value: t, plain: t }; };
  switch (key) {
    case 'clogp': return { ...num(p.clogp, 2), title: 'Wildman–Crippen logP' };
    case 'molref': return { ...num(p.mr, 2), title: 'Wildman–Crippen molar refractivity' };
    case 'tpsa': return { value: `${p.tpsa.toFixed(1)} Å²`, plain: `${p.tpsa.toFixed(1)} Å²`, title: 'Topological polar surface area (Ertl)' };
    case 'hbd': return { ...num(p.hbd, 0), title: 'OH and NH hydrogens (Lipinski)' };
    case 'hba': return { ...num(p.hba, 0), title: 'N and O atoms (Lipinski)' };
    case 'rotb': return { ...num(p.rotb, 0), title: 'Rotatable bonds' };
    case 'heavy': return { ...num(p.heavy, 0), title: 'Atoms other than hydrogen' };
    case 'fsp3': return { ...num(p.fsp3, 2), title: 'Fraction of carbons that are sp3' };
    case 'logs': {
      const t = p.logS.toFixed(2).replace('-', '−');
      return { value: `${t} <span class="muted">(${solubility(p.logS, r.mw)})</span>`, plain: solubility(p.logS, r.mw), title: "Water solubility at 25 °C by Delaney's ESOL equation (J. Chem. Inf. Comput. Sci. 2004, 44, 1000), log mol/L; estimated, typical error 0.8 log units" };
    }
    case 'pka': case 'pkah': {
      const s = p.pka.find((x) => x.kind === (key === 'pka' ? 'acid' : 'base'));
      if (!s) return null;
      return { value: `${fmtPka(s.pka)} <span class="muted">(${esc(s.group)})</span>`, plain: fmtPka(s.pka), title: `${key === 'pka' ? 'Most acidic proton' : 'pKa of the conjugate acid of the most basic atom'}. ${PKA_TIP}` };
    }
  }
  return null;
}

/** A line of the ribbon's Analysis box: its label (HTML), a short label for the Simplified ribbon, and the value. */
export interface RibbonRow { label: string; short: string; value: string }
const SHORT: Record<string, string> = { exact: 'Exact', mw: 'MW', mz: 'm/z', density: 'd', bp: 'bp', mp: 'mp', vp: 'vp', flash: 'Flash', ri: 'n' };

/** What the ribbon box writes for a row the settings put there, or null when the structure has none. */
export function ribbonRow(key: string, r: FragmentResult, adductText: string, prefs: AnalysisPrefs, bench: Bench): RibbonRow | null {
  if (r.error || !key) return null;
  switch (key) {
    case 'exact': return { label: 'Exact mass', short: SHORT.exact, value: r.exact.toFixed(prefs.dp.exact) };
    case 'mw': return { label: 'Mol. wt.', short: SHORT.mw, value: r.mw.toFixed(prefs.dp.mw) };
    case 'mz': {
      const ion = ionInfo(r, adductText);
      return ion ? { label: `<i>m/z</i> ${adductHtml(ion.adduct.label)}`, short: SHORT.mz, value: ion.mz.toFixed(prefs.dp.mz) } : null;
    }
    case 'ea': {
      const ea = analysisPercents(r);
      return ea ? { label: 'Anal.', short: '%', value: reported(ea).map((x) => `${x.el} ${x.pct.toFixed(prefs.dp.ea)}`).join(', ') } : null;
    }
    case 'density': case 'bp': case 'mp': case 'vp': case 'flash': case 'ri': {
      const x = bench[key];
      if (!x) return null;
      // plain text (the box writes values as text): raised exponents as superscript digits
      const v = key === 'vp' ? pressureText(x.v, prefs.units.pressure).replace(/\^([−-]?\d+)/, (_m, e: string) => [...e].map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)] ?? '⁻').join('')) : benchText(key, x, prefs);
      return { label: ROW_NAMES[key] + (x.measured ? '' : ' <i class="cr-an-est">est.</i>'), short: SHORT[key], value: v };
    }
    case 'clogp': case 'molref': case 'tpsa': case 'hbd': case 'hba': case 'rotb': case 'heavy': case 'fsp3': case 'logs': case 'pka': case 'pkah': {
      const x = propertyCell(key, r);
      return x ? { label: esc(ROW_NAMES[key]), short: esc(ROW_NAMES[key].replace(/ \(.*\)$/, '')), value: x.plain } : null;
    }
    default: {
      const c = calcOf(prefs, key);
      if (!c) return null;
      const parts = calcParts(c, r, bench);
      return parts.length ? { label: esc(calcName(c)), short: esc(`${c.amount} ${c.unit === 'uL' ? 'µL' : c.unit}`), value: parts.join(' · ') } : null;
    }
  }
}

/** Icons for the two journal-text buttons that sit at the end of their rows (m/z over a line; % over a line). */
const HRMS_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M2 12.5h12"/><text x="8" y="9" font-size="7" font-style="italic" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none" font-family="system-ui, sans-serif">m/z</text></svg>';
const EA_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M2 13.5h12"/><circle cx="5" cy="4" r="1.6"/><circle cx="11" cy="9.5" r="1.6"/><path d="M11.5 2.5l-7 8.5"/></svg>';
export const GEAR_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="8" cy="8" r="4.4"/><circle cx="8" cy="8" r="1.6"/><path d="M12.6 8L14.6 8M11.25 11.25L12.67 12.67M8 12.6L8 14.6M4.75 11.25L3.33 12.67M3.4 8L1.4 8M4.75 4.75L3.33 3.33M8 3.4L8 1.4M11.25 4.75L12.67 3.33" stroke-width="2.2"/></svg>';
const GRIP = '<svg viewBox="0 0 10 14" width="8" height="12" aria-hidden="true" fill="currentColor"><circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/><circle cx="3" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/><circle cx="3" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/></svg>';

/** In customize mode, a row's grip and check box. */
function control(key: string, on: boolean, name: string): string {
  return `<span class="an-ctl"><span class="an-grip" data-grip title="Drag to move ${esc(name)}">${GRIP}</span><input type="checkbox" data-show="${esc(key)}"${on ? ' checked' : ''} aria-label="Show ${esc(name)}"></span>`;
}

export interface PanelExtras {
  ions?: readonly string[];
  stereo?: string;
  unknown?: string[];
  pubchem?: string;
  electrons?: string;
  rGroups?: string[];
  name?: string;
  cas?: { row: string; button: string };
  /** The settings to draw by (rows, order, decimals, units, calculations). */
  prefs?: AnalysisPrefs;
  /** Bench values as known (see benchValues). */
  bench?: Bench;
  /** Customize mode: every row with a grip and check box, hidden ones dimmed. */
  customize?: boolean;
}

export function analysisHtml(r: FragmentResult, i: number, adductText: string, extras: PanelExtras): string {
  if (r.error) return `<div class="frag"><p class="warn">${esc(r.error)}</p></div>`;
  const prefs = extras.prefs ?? DEFAULT_ANALYSIS;
  const edit = !!extras.customize;
  // with R groups only the core is known: no ion or elemental analysis for a compound not drawn
  const core = !!extras.rGroups?.length;
  const ion = core ? null : ionInfo(r, adductText);
  const ea = core ? null : analysisPercents(r);
  const bench = extras.bench ?? benchValues(r);
  const p = r.props;
  const on = new Map(prefs.rows.map((x) => [x.key as string, x.on]));
  const hrmsBtn = ion ? `<button type="button" class="an-icon-btn an-act" data-insert="hrms:${i}" title="HRMS text: put an HRMS line under the structure (ACS style); type the found value into it" aria-label="HRMS text">${HRMS_ICON}</button>` : '';
  const eaBtn = ea ? `<button type="button" class="an-icon-btn an-act" data-insert="ea:${i}" title="Anal. text: put an elemental analysis line under the structure (ACS style)" aria-label="Anal. text">${EA_ICON}</button>` : '';
  let hrmsPlaced = false, eaPlaced = false;

  /** A line of the table for this key, or '' when it has nothing to show. */
  const line = (key: string): string => {
    const row = (label: string, value: string, act = '', title = '') =>
      `<tr data-row="${esc(key)}"${on.get(key) === false ? ' class="an-off"' : ''}><th${title ? ` title="${esc(title)}"` : ''}>${edit ? control(key, on.get(key) !== false, ROW_NAMES[key] ?? key) : ''}${label}</th><td>${value}</td><td class="an-act-cell">${act}</td></tr>`;
    switch (key) {
      case 'exact': return core ? '' : row('Exact mass', r.exact.toFixed(prefs.dp.exact));
      case 'mw': return core ? '' : row('Mol. wt.', r.mw.toFixed(prefs.dp.mw));
      case 'mz':
        if (core) return '';
        hrmsPlaced = !!hrmsBtn;
        // the ion list stands in for the row's label; a charged structure is its own ion, so it has none
        if (r.charge === 0) return row(ionSelectHtml(adductText, extras.ions ?? [adductText]), ion ? ion.mz.toFixed(prefs.dp.mz) : '<span class="muted" title="This ion can\'t be made from this structure">—</span>', hrmsBtn);
        return ion ? row(`m/z ${adductHtml(ion.adduct.label)}`, ion.mz.toFixed(prefs.dp.mz), hrmsBtn) : '';
      case 'ea':
        if (!ea) return '';
        eaPlaced = true;
        return row('Elemental', reported(ea).map((x) => `${x.el}, ${x.pct.toFixed(prefs.dp.ea)}`).join('; '), eaBtn);
      case 'stereo': return extras.stereo ? row('Stereo', esc(extras.stereo)) : '';
      case 'cas': return extras.cas && !core ? extras.cas.row.replace(/<tr( class="([^"]*)")?/, (_m, _c, cls = '') => `<tr data-row="cas" class="${cls}${on.get('cas') === false ? ' an-off' : ''}"`).replace(/<th([^>]*)>/, (m) => (edit ? m + control('cas', on.get('cas') !== false, 'CAS RN') : m)) : '';
      case 'density': case 'bp': case 'mp': case 'vp': case 'flash': case 'ri': {
        if (core) return '';
        const x = bench[key];
        const name = ROW_NAMES[key];
        if (!x) return row(name, '<span class="muted">—</span>', '', key === 'flash' || key === 'ri' ? 'Measured values come from PubChem: Look up on PubChem' : '');
        const tag = x.measured ? '<span class="an-src" title="Measured, as PubChem\'s sources report it">PubChem</span>' : `<span class="an-est" title="${esc(BENCH_TIPS[key] ?? 'Estimated')}">est.</span>`;
        return row(key === 'vp' ? `${name} <span class="muted">25 °C</span>` : name, `${benchText(key, x, prefs)}${tag}`);
      }
      case 'clogp': case 'molref': case 'tpsa': case 'hbd': case 'hba': case 'rotb': case 'heavy': case 'fsp3': case 'logs': case 'pka': case 'pkah': {
        if (core) return '';
        const x = propertyCell(key, r);
        return row(esc(ROW_NAMES[key]), x ? x.value : '<span class="muted">—</span>', '', x?.title ?? '');
      }
      default: {
        const c = calcOf(prefs, key);
        if (!c || core) return '';
        const parts = calcParts(c, r, bench);
        const why = !parts.length ? (c.unit === 'uL' || c.unit === 'mL' ? 'Needs a density' : '') : '';
        return row(esc(calcName(c)), parts.length ? `<b>${parts.map(esc).join('</b> · <b>')}</b>` : `<span class="muted" title="${esc(why)}">—</span>`, '', 'Lab calculation (Settings ▸ Analysis)');
      }
    }
  };

  /** A section under the table for this key, or ''. */
  const section = (key: string): string => {
    const wrap = (html: string) => (edit ? `<div class="an-sec${on.get(key) === false ? ' an-off' : ''}" data-row="${esc(key)}">${control(key, on.get(key) !== false, ROW_NAMES[key])}<div class="an-sec-body">${html || `<span class="muted small">${ROW_NAMES[key]}</span>`}</div></div>` : html);
    switch (key) {
      case 'electrons': return extras.electrons ? wrap(extras.electrons) : '';
      case 'iso': {
        if (!ion) return '';
        if (!(ion.pattern && ion.pattern.length)) return wrap('<p class="muted small">No isotope pattern: an element in it isn\'t in the isotope table.</p>');
        // the peaks of 0.5 % or more (with any between), so a Br6 or Cl4 cluster shows its tallest peaks
        const pat = ion.pattern;
        const big = pat.map((q, k) => (q.rel >= 0.5 ? k : -1)).filter((k) => k >= 0);
        const first = big[0] ?? 0, last = Math.min(big[big.length - 1] ?? 5, first + 11);
        const top = pat.slice(first, last + 1);
        return wrap(`<details class="iso"><summary>Isotope pattern ${adductHtml(ion.adduct.label)}</summary>
      ${patternSvg(top)}
      <table class="iso-table">${top.map((q) => `<tr><td>${q.mz.toFixed(4)}</td><td>${q.rel.toFixed(1)}%</td></tr>`).join('')}</table></details>`);
      }
      case 'props': return p ? wrap(propsHtml(r, p)) : '';
      case 'pubchem': return extras.pubchem ? wrap(extras.pubchem) : '';
      // (the NMR section is put here when it is made)
      case 'nmr': return wrap('<div class="an-nmr-slot"></div>');
    }
    return '';
  };

  const buttons = `<div class="an-buttons">
      ${core ? '' : `<button type="button" data-insert="formula:${i}" title="Attach the formula and masses under the structure: they follow it and update when it changes (choose what is shown in the Style panel)">Attach descriptors</button><button type="button" class="an-icon-btn an-gear" data-analysis-settings="descriptors" title="Attached descriptor settings: what they show, in what order, and how each line is written" aria-label="Attached descriptor settings">${GEAR_ICON}</button>`}
      @@HRMS@@
      ${core ? '' : extras.cas?.button ?? ''}
    </div>`;

  // the rows in order: lines of the table run together; a section ends the table above it
  let html = '';
  let table = '';
  let buttonsPlaced = false;
  const flush = () => { if (table) html += `<table class="an-table">${table}</table>`; table = ''; };
  for (const rr of prefs.rows) {
    if (rr.key === 'name') continue;
    if (!rr.on && !edit) continue;
    if (SECTION_ROWS.includes(rr.key)) {
      // the buttons go before PubChem or NMR, whichever comes first
      if ((rr.key === 'pubchem' || rr.key === 'nmr') && !buttonsPlaced) { flush(); html += buttons; buttonsPlaced = true; }
      const sec = section(rr.key);
      if (sec) { flush(); html += sec; }
    } else table += line(rr.key);
  }
  flush();
  if (!buttonsPlaced) html += buttons;
  // the journal-text buttons whose rows are hidden go with the others
  html = html.replace('@@HRMS@@', (hrmsPlaced ? '' : hrmsBtn.replace('an-icon-btn an-act', 'an-icon-btn')) + (eaPlaced ? '' : eaBtn.replace('an-icon-btn an-act', 'an-icon-btn')));
  const nameOn = on.get('name') !== false;
  const name = core ? `·${extras.rGroups!.map(esc).join('·')} <span class="muted">(core only)</span>`
    : edit ? `<label class="an-name-ctl" title="Show the systematic name"><input type="checkbox" data-show="name"${nameOn ? ' checked' : ''}> name</label>${nameOn ? extras.name ?? '' : ''}`
    : nameOn ? extras.name ?? '' : '';
  return `<div class="frag${edit ? ' an-customize' : ''}">
    <div class="formula"><b>${formulaHtml(r.formula)}</b>${name}</div>
    ${core ? `<p class="muted small">${extras.rGroups!.map(esc).join(', ')} could be anything, so there are no masses. Chemistry ▸ R-Group Table works out each compound.</p>` : ''}
    ${html}
    ${extras.unknown?.length ? `<p class="warn">Not recognized (skipped): ${extras.unknown.map(esc).join(', ')}</p>` : ''}
    ${edit ? `<div class="an-buttons an-edit-add"><button type="button" data-analysis-calc="new" title="A row that works out an amount of what is selected: its mass, volume or mmol">Add Lab Calculation…</button></div>` : ''}
  </div>`;
}

/** The Properties section: Crippen, Lipinski, Joback, ESOL and pKa estimates. */
function propsHtml(r: FragmentResult, p: NonNullable<FragmentResult['props']>): string {
  const jb = p.joback;
  const groups = Object.entries(jb.groups).map(([g, n]) => `${n} × ${g}`).join(', ');
  const tip = `Joback–Reid group contributions (Chem. Eng. Commun. 1987, 57, 233). Rough: typical errors are 10–25 °C, more for large molecules.${groups ? ' Groups: ' + groups + '.' : ''}`;
  return `<details class="props"><summary>Properties</summary><table>
      <tr><th title="Wildman–Crippen logP">cLogP</th><td>${p.clogp.toFixed(2)}</td></tr>
      <tr><th title="Wildman–Crippen molar refractivity">Molar refractivity</th><td>${p.mr.toFixed(2)}</td></tr>
      <tr><th title="Topological polar surface area (Ertl), Å²">tPSA</th><td>${p.tpsa.toFixed(1)} Å²</td></tr>
      <tr><th title="OH and NH hydrogens (Lipinski)">H-bond donors</th><td>${p.hbd}</td></tr>
      <tr><th title="N and O atoms (Lipinski)">H-bond acceptors</th><td>${p.hba}</td></tr>
      <tr><th>Rotatable bonds</th><td>${p.rotb}</td></tr>
      <tr><th>Heavy atoms</th><td>${p.heavy}</td></tr>
      <tr><th title="Fraction of carbons that are sp3">Fsp3</th><td>${p.fsp3.toFixed(2)}</td></tr>
      <tr><th title="${esc(tip)}">Boiling point (est.)</th><td>${jb.tb === null ? '<span class="muted">—</span>' : deg(jb.tb)}</td></tr>
      <tr><th title="${esc(tip)}">Melting point (est.)</th><td>${jb.tm === null ? '<span class="muted">—</span>' : deg(jb.tm)}</td></tr>
      ${p.density === null || p.density === undefined ? '' : `<tr><th title="${esc(BENCH_TIPS.density)}">Density (est.)</th><td>${p.density.toFixed(2)} g/mL</td></tr>`}
      <tr><th title="Water solubility at 25 °C by Delaney's ESOL equation (J. Chem. Inf. Comput. Sci. 2004, 44, 1000), log mol/L. Typical error 0.8 log units.">logS (est.)</th><td>${p.logS.toFixed(2).replace('-', '−')} <span class="muted">(${solubility(p.logS, r.mw)})</span></td></tr>
      ${pkaRows(p.pka)}
      </table>${jb.missing ? `<p class="muted small">${esc(jb.missing)}</p>` : ''}${thermoHtml(jb, p.vp, p.henry, tip)}${pkaSitesHtml(p.pka)}</details>`;
}

/** Runs for a formula in formula style (digits lowered). */
const f = (text: string): TextRun => ({ text, formula: true });
/** A formula with its charge raised (formula style raises a + only, and not its size). */
const fc = (formula: string, charge: number): TextRun[] =>
  charge ? [f(withoutCharge(formula, charge)), { text: chargeText(charge).trim(), sup: true }] : [f(formula)];

/** The text a button puts in the drawing, as caption runs. Null when it can't be made. */
export function analysisRuns(kind: 'formula' | 'hrms' | 'ea', r: FragmentResult, adductText: string): TextRun[] | null {
  if (kind === 'formula') {
    return [...fc(r.formula, r.charge), { text: `\nExact Mass: ${r.exact.toFixed(4)}\nMol. Wt.: ${r.mw.toFixed(2)}` }];
  }
  if (kind === 'hrms') {
    const ion = ionInfo(r, adductText);
    if (!ion) return null;
    const label = ion.adduct.label.replace(/^\[(.*)\](\d*[+-])$/, (_, body: string, c: string) => `[${body.replace(/([+-])/g, ' $1 ').replace(/-/g, '−')}]${c}`);
    const m = /^(.*\])(\d*[+-])$/.exec(label)!;
    return [
      { text: 'HRMS (ESI) ' }, { text: 'm/z', italic: true }, { text: `: ${m[1]}` }, { text: m[2].replace('-', '−'), sup: true },
      { text: ' Calcd for ' }, f(ion.formula), { text: ` ${ion.mz.toFixed(4)}; Found ${ion.mz.toFixed(4).replace(/\d/g, '0')}.` },
    ];
  }
  const ea = analysisPercents(r);
  if (!ea) return null;
  const rep = reported(ea);
  return [
    { text: 'Anal. Calcd for ' }, f(withoutCharge(r.formula, r.charge)), { text: `: ${rep.map((x) => `${x.el}, ${x.pct.toFixed(2)}`).join('; ')}. Found: ${rep.map((x) => `${x.el}, 00.00`).join('; ')}.` },
  ];
}

/** What descriptors a structure can show, in the order of the settings, with their names (calculations too). */
export function descriptorChoices(prefs: AnalysisPrefs = analysisPrefs()): { key: DescriptorKey; label: string }[] {
  const out: { key: DescriptorKey; label: string }[] = prefs.descriptors.map((d) => ({ key: d.key, label: DESC_NAMES[d.key] ?? calcName(calcOf(prefs, d.key)!) }));
  for (const c of prefs.calcs) if (!out.some((x) => x.key === `calc:${c.id}`)) out.push({ key: `calc:${c.id}`, label: calcName(c) });
  return out;
}

/** The descriptors a new descriptor caption shows (Settings ▸ Analysis; formula, exact mass and weight unless changed). */
export function newDescriptors(prefs: AnalysisPrefs = analysisPrefs()): DescriptorKey[] {
  return defaultDescriptors(prefs);
}

/** A descriptor line's words before its value, with "m/z" in italics. */
function labelRuns(label: string): TextRun[] {
  if (!label) return [];
  const m = /^(.*?)\bm\/z\b(.*)$/.exec(label);
  return m ? [...(m[1] ? [{ text: m[1] }] : []), { text: 'm/z', italic: true }, { text: m[2] + ' ' }] : [{ text: label + ' ' }];
}

/**
 * A structure's descriptors as caption text, one per line: its formula, exact mass, molecular
 * weight, m/z of the ion, elemental analysis, an HRMS line and lab calculations, as chosen, in the
 * order and with the words and decimal places of Settings ▸ Analysis.
 */
export function descriptorRuns(r: FragmentResult, show: DescriptorKey[], adductText: string, prefs: AnalysisPrefs = analysisPrefs(), bench?: Bench): TextRun[] {
  const out: TextRun[] = [];
  const line = (runs: TextRun[]) => { if (out.length) out.push({ text: '\n' }); out.push(...runs); };
  const order = descriptorChoices(prefs).map((d) => d.key);
  const keys = [...new Set(show)].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const fmt = (k: DescriptorKey) => prefs.descriptors.find((d) => d.key === k);
  const dpOf = (k: DescriptorKey, d: number) => fmt(k)?.dp ?? d;
  const label = (k: DescriptorKey) => fmt(k)?.label ?? DESC_LABELS[k] ?? '';
  for (const k of keys) {
    if (k === 'formula') line([...labelRuns(label(k)), ...fc(r.formula, r.charge)]);
    else if (k === 'exact') line([...labelRuns(label(k)), { text: r.exact.toFixed(dpOf(k, 4)) }]);
    else if (k === 'mw') line([...labelRuns(label(k)), { text: r.mw.toFixed(dpOf(k, 2)) }]);
    else if (k === 'mz') {
      const ion = ionInfo(r, adductText);
      if (ion) line([...labelRuns(label(k)), { text: `${ion.mz.toFixed(dpOf(k, 4))} (${ion.adduct.label.replace(/\](\d*)-$/, ']$1−')})` }]);
    } else if (k === 'ea') {
      const ea = analysisPercents(r);
      if (ea) line([...labelRuns(label(k)), { text: reported(ea).map((x) => `${x.el}, ${x.pct.toFixed(dpOf(k, 2))}`).join('; ') }]);
    } else if (k === 'hrms') {
      const runs = analysisRuns('hrms', r, adductText);
      if (runs) line(runs);
    } else {
      const c = calcOf(prefs, k);
      const parts = c ? calcParts(c, r, bench ?? benchValues(r)) : [];
      if (c && parts.length) line([...labelRuns(label(k) || `${calcName(c)}:`), { text: parts.join(', ') }]);
    }
  }
  return out.length ? out : [{ text: '' }];
}

/** A repeat group's unit, as the chemistry engine weighed it. */
export interface RepeatUnit {
  text: string;
  count: number | null;
  counts: Record<string, number>;
  exact: number;
  mw: number;
}

/**
 * A structure's numbers with its repeat groups counted. A numbered group (×3) is added that many
 * times in all, so the result is an ordinary molecule. A polymer (n) can't be weighed whole: its
 * formula is written with the unit in brackets, (C2H4)n, and `polymer` describes the parts.
 */
export function withRepeats(r: FragmentResult, units: RepeatUnit[]): { r: FragmentResult; polymer?: { ends: string; units: { text: string; formula: string; exact: number; mw: number }[]; endExact: number; endMw: number } } {
  if (!units.length || r.error || !r.props) return { r };
  let counts = { ...r.props.counts };
  let exact = r.exact, mw = r.mw;
  const add = (c: Record<string, number>, k: number) => { for (const [el, n] of Object.entries(c)) counts[el] = (counts[el] ?? 0) + k * n; };
  for (const u of units.filter((x) => x.count !== null)) {
    add(u.counts, u.count! - 1);
    exact += (u.count! - 1) * u.exact;
    mw += (u.count! - 1) * u.mw;
  }
  const letters = units.filter((x) => x.count === null);
  if (!letters.length) {
    counts = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    const formula = hillFormula(counts, r.charge);
    return { r: { ...r, formula, exact, mw, props: { ...r.props, counts } } };
  }
  // a polymer: the end groups, then each unit in brackets with its letter
  for (const u of letters) { add(u.counts, -1); exact -= u.exact; mw -= u.mw; }
  counts = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
  const ends = Object.keys(counts).length ? hillFormula(counts, r.charge) : '';
  const parts = letters.map((u) => ({ text: u.text, formula: hillFormula(u.counts), exact: u.exact, mw: u.mw }));
  const formula = ends + parts.map((p) => `(${p.formula})${p.text}`).join('');
  return { r: { ...r, formula, exact, mw, props: undefined }, polymer: { ends, units: parts, endExact: exact, endMw: mw } };
}

/** A polymer's formula as HTML: (C<sub>2</sub>H<sub>4</sub>)<i>n</i>. */
export function polymerFormulaHtml(ends: string, units: { text: string; formula: string }[]): string {
  return formulaHtml(ends) + units.map((u) => `(${formulaHtml(u.formula)})<sub><i>${esc(u.text)}</i></sub>`).join('');
}

/** The panel for a structure holding a polymer's repeat unit: its formula and the masses of the parts. */
export function polymerHtml(p: NonNullable<ReturnType<typeof withRepeats>['polymer']>): string {
  const rows = p.units.map((u) => `<tr><th>Unit (${formulaHtml(u.formula)})<sub><i>${esc(u.text)}</i></sub></th><td>${u.exact.toFixed(4)}<br>${u.mw.toFixed(2)} g/mol</td></tr>`);
  if (p.ends) rows.push(`<tr><th>End groups ${formulaHtml(p.ends)}</th><td>${p.endExact.toFixed(4)}<br>${p.endMw.toFixed(2)} g/mol</td></tr>`);
  return `<div class="frag">
    <div class="formula"><b>${polymerFormulaHtml(p.ends, p.units)}</b></div>
    <table>${rows.join('')}</table>
    <p class="muted small">A polymer: exact mass and molecular weight per repeat unit (and of the end groups). Type a number in place of ${esc(p.units[0].text)} for a molecule of that length.</p>
  </div>`;
}
