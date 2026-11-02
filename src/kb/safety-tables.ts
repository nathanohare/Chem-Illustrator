// The Reagent Safety and Physical Constants tables, made from safety-data.json (built by
// scripts/kb/build-safety.mjs from public-domain US government records and the EU harmonised
// classification) and the rating in safety.ts.

import data from './safety-data.json';
import { badges, fmtIdlh, haveReady, incident, lethalByRoute, rate, skinKp, vapourRatio, vpMmHg, type SafetyRecord } from './safety';
import type { Cell, KbSource, KbTable } from './tables';

export const SAFETY_RECORDS = (data as unknown as { compounds: SafetyRecord[] }).compounds;

/** A number with sensible significant figures: 0.0012, 0.68, 7.3, 162, 90,000. */
export function sig(n: number): string {
  if (n === 0) return '0';
  const a = Math.abs(n);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : Math.min(6, 1 - Math.floor(Math.log10(a)));
  const r = a >= 1000 ? Math.round(n / 10 ** (Math.floor(Math.log10(a)) - 1)) * 10 ** (Math.floor(Math.log10(a)) - 1) : Number(n.toFixed(d));
  return r.toLocaleString('en-US', { maximumFractionDigits: d });
}

/** "−95 °C" style text cut to its first value, with any note dropped. */
export function short(text: string | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  const cut = t.split(/(?<=°C|°F|g\/cu cm|g\/mL|g\/cm3)[;(,]/)[0].trim();
  return cut.length > 48 ? cut.slice(0, 46).trimEnd() + '…' : cut;
}

function links(r: SafetyRecord): KbSource[] {
  const out: KbSource[] = [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${r.cid}` }];
  if (r.niosh) out.push({ label: 'NIOSH', url: r.niosh });
  out.push({ label: 'EROS', url: `https://onlinelibrary.wiley.com/action/doSearch?AllField=${encodeURIComponent(r.name)}&SeriesKey=10.1002%2F047084289X` });
  return out;
}

const byCid = new Map(SAFETY_RECORDS.map((r) => [r.cid, r]));
/** Records loaded later (the big table) get their row links too. */
export function registerRecords(records: SafetyRecord[]): void {
  for (const r of records) if (!byCid.has(r.cid)) byCid.set(r.cid, r);
}
const rowLinks = (row: Record<string, Cell>): KbSource[] => {
  const r = byCid.get(Number(row.cid));
  return r ? links(r) : [];
};

/** The Potts–Guy skin permeability estimate, "2.1×10⁻² (high)". */
function kpText(r: SafetyRecord): string | null {
  const k = skinKp(r);
  if (!k) return null;
  let e = Math.floor(Math.log10(k.kp));
  if (k.kp / 10 ** e >= 9.95) e++;
  const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return `${(k.kp / 10 ** e).toFixed(1)}×10${sup} (${k.band})`;
}

export function safetyRow(r: SafetyRecord): Record<string, Cell> {
  const rating = rate(r);
  const lethal = lethalByRoute(r);
  const other = (['ip', 'iv', 'sc'] as const).filter((k) => lethal[k]).map((k) => `${k}: ${lethal[k]}`).join('; ');
  const vp = r.vp ? vpMmHg(r.vp.text) : null;
  const ratio = vapourRatio(r);
  const ready = haveReady(r);
  const inc = incident(r);
  const sources = [r.idlh && `IDLH ${r.idlh.source}`, r.lethal.length && 'LD50/LC50 HSDB', r.vp && `VP ${r.vp.source}`, r.ghs && 'GHS EU CLP Annex VI', r.incompatible && 'Incompatible NIOSH', ready && `Have ready: ${ready.source}`, inc && `Incident: ${inc.source}`].filter(Boolean).join('; ');
  return {
    cid: r.cid,
    name: r.name,
    tier: rating.tier ?? 'Not rated',
    // the compound's own name is beside it already
    why: rating.why.map((w) => (w.toLowerCase().startsWith(r.name.toLowerCase() + ': ') ? w.slice(r.name.length + 2) : w)).map((w) => w[0].toUpperCase() + w.slice(1)).join('; '),
    idlh: r.idlh ? fmtIdlh(r) + (r.idlh.ca && r.idlh.value !== undefined ? ' (Ca)' : '') : null,
    oral: lethal.oral ?? null,
    dermal: lethal.dermal ?? null,
    inhalation: lethal.inhalation ?? null,
    other: other || null,
    vp: vp === null ? null : vp > 760 ? 'gas' : sig(vp),
    ratio: ratio === null ? null : sig(ratio),
    badges: badges(r).join(', ') || null,
    kp: kpText(r),
    ready: ready ? `${ready.what} (${ready.why})` : null,
    incompatible: r.incompatible ? r.incompatible.replace(/\s*\[Note:.*$/, '') : null,
    incident: inc ? inc.what : null,
    ghs: r.ghs?.codes.join(' ') || null,
    cas: r.cas,
    smiles: r.smiles,
    sources: sources || null,
  };
}

/** Tier 1 first, Not rated last, then by name. */
export function sortSafety(rows: Record<string, Cell>[]): Record<string, Cell>[] {
  const t = (r: Record<string, Cell>) => (typeof r.tier === 'number' ? r.tier : 5);
  return rows.sort((a, b) => t(a) - t(b) || String(a.name).localeCompare(String(b.name)));
}

/** Hazard numbers for common reagents, solvents and gases, rated by tier. */
export const REAGENT_SAFETY: KbTable = {
  id: 'reagent-safety',
  title: 'Reagent Safety',
  about: 'Bench hazard tier (1 extraordinary, 2 high, 3 standard, 4 low; Not rated when no open source has data) from measured numbers and the harmonised EU classification, with the numbers behind it. Several thousand compounds; one that isn\'t here can be rated live from PubChem. A guide only: read the SDS and follow your institution\'s rules.',
  columns: [
    { key: 'name', label: 'Compound' },
    { key: 'tier', label: 'Tier', filter: true, narrow: true, numeric: true },
    { key: 'why', label: 'Why' },
    { key: 'idlh', label: 'IDLH', numeric: true },
    { key: 'oral', label: 'LD50 oral' },
    { key: 'dermal', label: 'LD50 dermal' },
    { key: 'inhalation', label: 'LC50 inhalation' },
    { key: 'other', label: 'Other routes' },
    { key: 'vp', label: 'VP (mmHg, ~25 °C)', numeric: true },
    { key: 'ratio', label: 'Saturated vapour ÷ IDLH', numeric: true },
    { key: 'badges', label: 'Badges' },
    { key: 'kp', label: 'Skin Kp est. (cm/h)' },
    { key: 'ready', label: 'Have ready', filter: 'present' },
    { key: 'incompatible', label: 'Incompatible with' },
    { key: 'incident', label: 'Incident', filter: 'present' },
    { key: 'ghs', label: 'GHS (harmonised)' },
    { key: 'cas', label: 'CAS' },
    { key: 'sources', label: 'Sources' },
  ],
  rows: sortSafety(SAFETY_RECORDS.map(safetyRow)),
  sources: [
    { label: 'NIOSH Pocket Guide (IDLH, incompatibilities)', url: 'https://www.cdc.gov/niosh/npg/' },
    { label: 'Hazardous Substances Data Bank (LD50, LC50, vapour pressure), via PubChem', url: 'https://pubchem.ncbi.nlm.nih.gov/source/hsdb' },
    { label: 'NOAA CAMEO Chemicals (reactivity alerts)', url: 'https://cameochemicals.noaa.gov/' },
    { label: 'EU Regulation 1272/2008, Annex VI (harmonised classification)', url: 'https://eur-lex.europa.eu/eli/reg/2008/1272/oj' },
    { label: 'Tiers, badges, Have ready and incidents written for Chem Illustrator' },
    { label: 'Skin Kp estimated with the Potts–Guy equation, Pharm. Res. 1992, 9, 663 (log Kow from HSDB, else PubChem XLogP3)', url: 'https://doi.org/10.1023/A:1015810312465' },
  ],
  links: rowLinks,
};

/** A Physical Constants row. */
export function constantsRow(r: SafetyRecord): Record<string, Cell> {
  const vp = r.vp ? vpMmHg(r.vp.text) : null;
  const src = [['mp', r.mp], ['bp', r.bp], ['density', r.density], ['flash point', r.flash], ['VP', r.vp]].filter(([, v]) => v).map(([k, v]) => `${k} ${(v as { source: string }).source}`).join('; ');
  return {
    cid: r.cid, name: r.name, formula: r.formula, mw: r.mw === null ? null : Number(r.mw.toFixed(2)),
    mp: short(r.mp?.text), bp: short(r.bp?.text), density: short(r.density?.text), flash: short(r.flash?.text),
    vp: vp === null ? null : vp > 760 ? 'gas' : sig(vp), cas: r.cas, smiles: r.smiles, sources: src || null,
  };
}

/** Molar mass, melting and boiling points, density, flash point and vapour pressure. */
export const PHYSICAL_CONSTANTS: KbTable = {
  id: 'physical-constants',
  title: 'Physical Constants',
  about: 'Melting and boiling points, density, flash point and vapour pressure of common reagents and solvents, each from the source named in the last column.',
  columns: [
    { key: 'name', label: 'Compound' },
    { key: 'formula', label: 'Formula' },
    { key: 'mw', label: 'MW (g/mol)', numeric: true },
    { key: 'mp', label: 'mp', numeric: true },
    { key: 'bp', label: 'bp', numeric: true },
    { key: 'density', label: 'Density', numeric: true },
    { key: 'flash', label: 'Flash point', numeric: true },
    { key: 'vp', label: 'VP (mmHg, ~25 °C)', numeric: true },
    { key: 'cas', label: 'CAS' },
    { key: 'sources', label: 'Sources' },
  ],
  rows: SAFETY_RECORDS.map(constantsRow).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  sources: [
    { label: 'Hazardous Substances Data Bank, NIOSH, NOAA CAMEO and OSHA, via PubChem', url: 'https://pubchem.ncbi.nlm.nih.gov/' },
    { label: 'Formula and molar mass computed by PubChem' },
  ],
  links: rowLinks,
};
