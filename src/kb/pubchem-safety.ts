// Reads a PubChem compound record (PUG View JSON) into a SafetyRecord, keeping only values from
// sources whose terms allow reuse: HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC (US government, public
// domain) and the EU harmonised classification (Regulation 1272/2008 Annex VI). Sources without a
// reuse licence (Haz-Map, ILO cards, supplier notifications to ECHA, NITE) are skipped. Used both by
// scripts/kb/build-safety.mjs, which builds the bundled tables, and by the Knowledge Base window to
// rate a compound that isn't in them, live from PubChem. Plain functions, no imports to run.

import type { Lethal, SafetyRecord, Sourced } from './safety';

/** Sources whose values may be shipped, in order of preference. */
export const OPEN_SOURCES = ['Hazardous Substances Data Bank (HSDB)', 'The National Institute for Occupational Safety and Health (NIOSH)', 'CAMEO Chemicals', 'Occupational Safety and Health Administration (OSHA)', 'PAC Chemical Database, U.S. Department of Energy'];
export const EU_SOURCE = 'Regulation (EC) No 1272/2008 of the European Parliament and of the Council';
const SHORT: Record<string, string> = {
  'Hazardous Substances Data Bank (HSDB)': 'HSDB',
  'The National Institute for Occupational Safety and Health (NIOSH)': 'NIOSH',
  'CAMEO Chemicals': 'CAMEO',
  'Occupational Safety and Health Administration (OSHA)': 'OSHA',
  'PAC Chemical Database, U.S. Department of Energy': 'DOE PAC',
  [EU_SOURCE]: 'EU CLP Annex VI',
};

interface Item { source: string; url: string; name: string; text: string }
// the parts of a PUG View record read here
interface ViewSection { TOCHeading?: string; Section?: ViewSection[]; Information?: { ReferenceNumber?: number; Name?: string; Value?: { StringWithMarkup?: { String: string }[]; Number?: number[]; Unit?: string } }[] }
export interface ViewRecord extends ViewSection { RecordTitle?: string; Reference?: { ReferenceNumber: number; SourceName?: string; URL?: string; Name?: string }[] }

/** Every Information item under a heading, with its source's name. */
function items(record: ViewRecord, heading: string): Item[] {
  const refs = new Map((record.Reference ?? []).map((r) => [r.ReferenceNumber, r]));
  const out: Item[] = [];
  const walk = (s: ViewSection) => {
    for (const x of s.Section ?? []) {
      if (x.TOCHeading === heading) for (const i of x.Information ?? []) {
        const ref = refs.get(i.ReferenceNumber ?? -1);
        const v = i.Value ?? {};
        const text = (v.StringWithMarkup ?? []).map((m) => m.String).join(' ').trim()
          || (v.Number ? `${v.Number.join(', ')}${v.Unit ? ' ' + v.Unit : ''}` : '');
        out.push({ source: ref?.SourceName ?? '', url: ref?.URL ?? '', name: i.Name ?? '', text });
      }
      walk(x);
    }
  };
  walk(record);
  return out;
}

const usable = (i: Item) => OPEN_SOURCES.includes(i.source) && !!i.text && !/please visit/i.test(i.text);

/** Every value under a heading from the first open source that has one (several pKa values, say). */
function pickAll(record: ViewRecord, heading: string, accept: (i: Item) => boolean = () => true): Sourced | null {
  const all = items(record, heading).filter((i) => usable(i) && accept(i));
  for (const s of OPEN_SOURCES) {
    const mine = all.filter((i) => i.source === s);
    if (mine.length) return { text: [...new Set(mine.map((i) => i.text.replace(/\s+/g, ' ').trim()))].join('; ').slice(0, 240), source: SHORT[s] };
  }
  return null;
}

/** The first value from an open source, in order of preference (a test picks among several). */
function pick(record: ViewRecord, heading: string, prefer: (i: Item) => boolean = () => true, accept: (i: Item) => boolean = () => true): Sourced | null {
  const all = items(record, heading).filter((i) => usable(i) && accept(i));
  for (const s of OPEN_SOURCES) {
    const mine = all.filter((i) => i.source === s);
    const best = mine.find(prefer) ?? mine[0];
    if (best) return { text: best.text.replace(/\s+/g, ' ').slice(0, 160), source: SHORT[s] };
  }
  return null;
}

/** "ppm" or "mg/m3" IDLH from NIOSH's "Ca [7 ppm]", "1 mg/m3 ...", "2000 ppm [10%LEL]". */
function idlh(record: ViewRecord): SafetyRecord['idlh'] {
  const i = items(record, 'Immediately Dangerous to Life or Health (IDLH)').find((x) => SHORT[x.source] === 'NIOSH' || SHORT[x.source] === 'CAMEO');
  if (!i) return null;
  const ca = /\bCa\b|potential occupational carcinogen/i.test(i.text);
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(ppm|mg(?:\s+([A-Z][a-z]?(?:\([IVX]+\))?|CN))?\/(?:m3|cu m))/.exec(i.text);
  if (!m) return { text: /N\.D\./.test(i.text) ? 'N.D.' : ca ? 'Ca' : i.text.slice(0, 60), ca, source: SHORT[i.source] };
  return { value: Number(m[1].replace(/,/g, '')), unit: m[2] === 'ppm' ? 'ppm' : 'mg/m3', ...(m[3] ? { as: m[3] } : {}), ca, source: SHORT[i.source], url: i.url };
}

const ROUTES: Record<string, Lethal['route']> = { oral: 'oral', dermal: 'dermal', skin: 'dermal', percutaneous: 'dermal', inhalation: 'inhalation', ip: 'ip', intraperitoneal: 'ip', iv: 'iv', intravenous: 'iv', sc: 'sc', subcutaneous: 'sc' };

/** LD50 and LC50 lines from HSDB's non-human toxicity values: "LD50 Rat oral 440 mg/kg". */
function lethal(record: ViewRecord): Lethal[] {
  const out: Lethal[] = [];
  for (const i of items(record, 'Non-Human Toxicity Values')) {
    if (SHORT[i.source] !== 'HSDB') continue;
    const m = /^(LD50|LC50|LDLo|LCLo)\s+(\w+(?:\s+\w+)?)\s+(oral|dermal|skin|percutaneous|inhalation|ip|intraperitoneal|iv|intravenous|sc|subcutaneous)\s+(.+)$/i.exec(i.text.trim());
    if (!m) continue;
    const [, kind, species, route, rest] = m;
    const dose = /([<>]?\s*\d[\d,]*(?:\.\d+)?)\s*(mg\/kg|g\/kg|ug\/kg|ug\/g|mL\/kg|ml\/kg|mg\/cu m|mg\/L|mg\/l|g\/cu m|ppm|mg\/m3)/i.exec(rest);
    if (!dose) continue;
    const time = /\/\s*(\d+(?:\.\d+)?\s*(?:hr|h|min|hours?|minutes?))/i.exec(rest);
    out.push({ kind: kind.toUpperCase().replace('LO', 'Lo'), species: species.toLowerCase(), route: ROUTES[route.toLowerCase()], value: Number(dose[1].replace(/[<>\s,]/g, '')), unit: dose[2].replace('cu m', 'm3').replace('ml', 'mL').replace('mg/l', 'mg/L'), time: time ? time[1].replace(/\s+/g, ' ') : '', source: 'HSDB' });
  }
  return out;
}

/** The harmonised (EU Annex VI) hazard statements, as codes ("H330"), and the hazard classes. */
function harmonised(record: ViewRecord): SafetyRecord['ghs'] {
  const h = items(record, 'GHS Classification').filter((i) => i.source === EU_SOURCE && i.name === 'GHS Hazard Statements');
  const codes = new Set<string>();
  for (const i of h) for (const m of i.text.matchAll(/\b(EUH\d{3}|H\d{3}(?:[A-Za-z]{1,2})?(?:\+H\d{3})*)\b/g)) codes.add(m[1]);
  const classes = items(record, 'Hazard Classes and Categories').filter((i) => i.source === EU_SOURCE).map((i) => i.text)[0] ?? '';
  return codes.size || classes ? { codes: [...codes], classes: classes.replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim() } : null;
}

function alerts(record: ViewRecord): string[] {
  const out = new Set<string>();
  for (const i of items(record, 'Reactivity Alerts')) if (SHORT[i.source] === 'CAMEO') for (const a of i.text.split(/[,;]\s*/)) if (a.trim()) out.add(a.trim());
  return [...out];
}

/** The CAS number most sources give (used for the named lists in safety.ts; never shipped for new rows). */
export function casOf(record: ViewRecord): string | null {
  const n = new Map<string, number>();
  for (const i of items(record, 'CAS')) for (const m of i.text.matchAll(/\b\d{2,7}-\d{2}-\d\b/g)) n.set(m[0], (n.get(m[0]) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function nioshUrl(record: ViewRecord): string | null {
  const r = (record.Reference ?? []).find((x) => SHORT[x.SourceName ?? ''] === 'NIOSH' && /npg/.test(x.URL ?? ''));
  return r?.URL ?? null;
}

const at25 = (i: Item) => /25 ?°C|77 ?°F/.test(i.text);
/** A vapour pressure near room temperature, or one that names no temperature. */
const roomTemp = (i: Item) => {
  if (/room temp/i.test(i.text)) return true;
  const c = [...i.text.matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*C/g)].map((m) => Number(m[1]));
  const f = [...i.text.matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*F/g)].map((m) => Number(m[1]));
  const k = [...i.text.matchAll(/(\d+(?:\.\d+)?)\s*K\b/g)].map((m) => Number(m[1]));
  if (!c.length && !f.length && !k.length) return true;
  return c.some((t) => t >= 15 && t <= 30) || f.some((t) => t >= 59 && t <= 86) || k.some((t) => t >= 288 && t <= 303);
};

export interface RecordInput {
  name: string;
  cid: number;
  cas: string | null;
  formula?: string | null;
  mw?: number | string | null;
  smiles?: string | null;
  xlogp?: number | null;
  view: ViewRecord;
}

/** A SafetyRecord from a compound's PubChem record and computed properties. */
export function safetyRecordFrom(c: RecordInput): SafetyRecord {
  const rec = c.view;
  return {
    name: c.name,
    cid: c.cid,
    cas: c.cas,
    formula: c.formula ?? null,
    mw: c.mw ? Number(c.mw) : null,
    smiles: c.smiles ?? null,
    idlh: idlh(rec),
    lethal: lethal(rec),
    vp: pick(rec, 'Vapor Pressure', at25, roomTemp),
    bp: pick(rec, 'Boiling Point', (i) => /760|°C/.test(i.text)),
    mp: pick(rec, 'Melting Point', (i) => /°C/.test(i.text)),
    density: pick(rec, 'Density', (i) => /g\/cu cm|g\/mL|g\/cm3/i.test(i.text)),
    flash: pick(rec, 'Flash Point', (i) => /°C/.test(i.text)),
    ghs: harmonised(rec),
    alerts: alerts(rec),
    skin: items(rec, 'Exposure Routes').some((i) => SHORT[i.source] === 'NIOSH' && /skin absorption/i.test(i.text)),
    incompatible: items(rec, 'Hazardous Reactivities and Incompatibilities').find((i) => SHORT[i.source] === 'NIOSH')?.text ?? null,
    niosh: nioshUrl(rec),
    // for the Solvents, Solubility and pKa tables, and the skin permeability estimate
    xlogp: typeof c.xlogp === 'number' ? c.xlogp : null,
    logKow: pick(rec, 'LogP', (i) => /log Kow/i.test(i.text), (i) => /-?\d/.test(i.text)),
    pka: pickAll(rec, 'Dissociation Constants', (i) => /pK|\d/.test(i.text)),
    water: pick(rec, 'Solubility', (i) => /^in water|water.*(at|°C)/i.test(i.text), (i) => /water/i.test(i.text)),
    organic: pick(rec, 'Solubility', (i) => /miscible with|soluble in/i.test(i.text), (i) => !/water/i.test(i.text) && /miscible|soluble/i.test(i.text)),
    viscosity: pick(rec, 'Viscosity', (i) => /2[05] ?°C/.test(i.text), (i) => /Pa|cP|poise/i.test(i.text)),
    refractive: pick(rec, 'Refractive Index', (i) => /20 ?°C/.test(i.text), (i) => /\d\.\d/.test(i.text)),
  };
}

/** True when an open source gave something to rate the compound by. */
export function hasHazardData(r: SafetyRecord): boolean {
  return !!(r.idlh || r.lethal.some((l) => l.kind === 'LD50' || l.kind === 'LC50') || r.ghs?.codes.length || r.alerts.length || r.incompatible);
}

/** A smaller record for the big table: the lowest LD50/LC50 per route only, no links, short texts. */
export function compactRecord(r: SafetyRecord): SafetyRecord {
  const best = new Map<string, Lethal>();
  for (const l of r.lethal) {
    if (l.kind !== 'LD50' && l.kind !== 'LC50') continue;
    const cur = best.get(l.route);
    if (!cur || (cur.unit.toLowerCase() === l.unit.toLowerCase() && l.value < cur.value)) best.set(l.route, l);
  }
  const idlh = r.idlh ? { ...r.idlh } : null;
  if (idlh) delete idlh.url;
  const out: SafetyRecord = { ...r, cas: null, idlh, lethal: [...best.values()], incompatible: r.incompatible ? r.incompatible.replace(/\s*\[Note:.*$/, '').slice(0, 200) : null };
  // drop what the big table never shows
  for (const k of ['pka', 'water', 'organic', 'viscosity', 'refractive'] as const) delete out[k];
  return out;
}
