// Builds src/kb/safety-data.json: hazard numbers and physical constants for the compounds listed in
// safety-compounds.txt, from PubChem's records of US government and EU sources whose terms allow
// reuse (HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC, EU Regulation 1272/2008). Sources without a reuse
// licence (Haz-Map, ILO cards, supplier notifications to ECHA, NITE) are skipped. Every value keeps
// the name of the source it came from.
//
//   node scripts/kb/build-safety.mjs            fetch what isn't cached, then build
//   KB_CACHE=/some/dir node scripts/kb/build-safety.mjs
//
// PubChem asks for no more than 5 requests a second; this makes about 2 a second.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const root = join(here, '..', '..');
const cache = process.env.KB_CACHE || join(tmpdir(), 'kb-pubchem-cache');
mkdirSync(cache, { recursive: true });

/** Sources whose values may be shipped, in order of preference. */
const OPEN = ['Hazardous Substances Data Bank (HSDB)', 'The National Institute for Occupational Safety and Health (NIOSH)', 'CAMEO Chemicals', 'Occupational Safety and Health Administration (OSHA)', 'PAC Chemical Database, U.S. Department of Energy'];
const SHORT = {
  'Hazardous Substances Data Bank (HSDB)': 'HSDB',
  'The National Institute for Occupational Safety and Health (NIOSH)': 'NIOSH',
  'CAMEO Chemicals': 'CAMEO',
  'Occupational Safety and Health Administration (OSHA)': 'OSHA',
  'PAC Chemical Database, U.S. Department of Energy': 'DOE PAC',
  'Regulation (EC) No 1272/2008 of the European Parliament and of the Council': 'EU CLP Annex VI',
};
const EU = 'Regulation (EC) No 1272/2008 of the European Parliament and of the Council';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, file) {
  const path = join(cache, file);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  for (let i = 0; i < 4; i++) {
    await sleep(450);
    const r = await fetch(url).catch(() => null);
    if (r?.ok) { const j = await r.json(); writeFileSync(path, JSON.stringify(j)); return j; }
    if (r && r.status === 404) { writeFileSync(path, 'null'); return null; }
    await sleep(2000 * (i + 1));
  }
  throw new Error(`PubChem didn't answer: ${url}`);
}

function readList() {
  return readFileSync(join(here, 'safety-compounds.txt'), 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const [name, ask, cas] = l.split('|').map((s) => s.trim()); return { name, ask: ask || name, cas: cas || null }; });
}

/** Every Information item under a heading, with its source's name. */
function items(record, heading) {
  const refs = new Map((record.Reference ?? []).map((r) => [r.ReferenceNumber, r]));
  const out = [];
  const walk = (s) => {
    for (const x of s.Section ?? []) {
      if (x.TOCHeading === heading) for (const i of x.Information ?? []) {
        const ref = refs.get(i.ReferenceNumber);
        const v = i.Value ?? {};
        const text = (v.StringWithMarkup ?? []).map((m) => m.String).join(' ').trim()
          || (v.Number ? `${v.Number.join(', ')}${v.Unit ? ' ' + v.Unit : ''}` : '');
        out.push({ source: ref?.SourceName ?? '', url: ref?.URL ?? '', name: i.Name ?? '', text, refName: ref?.Name ?? '' });
      }
      walk(x);
    }
  };
  walk(record);
  return out;
}

/** The first value from an open source, in order of preference (a test picks among several). */
/** Every value under a heading from the first open source that has one (several pKa values, say). */
function pickAll(record, heading, accept = () => true) {
  const all = items(record, heading).filter((i) => OPEN.includes(i.source) && i.text && !/please visit/i.test(i.text) && accept(i));
  for (const s of OPEN) {
    const mine = all.filter((i) => i.source === s);
    if (mine.length) return { text: [...new Set(mine.map((i) => i.text.replace(/\s+/g, ' ').trim()))].join('; ').slice(0, 240), source: SHORT[s] };
  }
  return null;
}

function pick(record, heading, prefer = () => true, accept = () => true) {
  const all = items(record, heading).filter((i) => OPEN.includes(i.source) && i.text && !/please visit/i.test(i.text) && accept(i));
  for (const s of OPEN) {
    const mine = all.filter((i) => i.source === s);
    const best = mine.find(prefer) ?? mine[0];
    if (best) return { text: best.text.replace(/\s+/g, ' ').slice(0, 160), source: SHORT[s] };
  }
  return null;
}

/** "ppm" or "mg/m3" IDLH from NIOSH's "Ca [7 ppm]", "1 mg/m3 ...", "2000 ppm [10%LEL]". */
function idlh(record) {
  const i = items(record, 'Immediately Dangerous to Life or Health (IDLH)').find((x) => SHORT[x.source] === 'NIOSH' || SHORT[x.source] === 'CAMEO');
  if (!i) return null;
  const ca = /\bCa\b|potential occupational carcinogen/i.test(i.text);
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(ppm|mg(?:\s+([A-Z][a-z]?(?:\([IVX]+\))?|CN))?\/(?:m3|cu m))/.exec(i.text);
  if (!m) return { text: /N\.D\./.test(i.text) ? 'N.D.' : ca ? 'Ca' : i.text.slice(0, 60), ca, source: SHORT[i.source] };
  return { value: Number(m[1].replace(/,/g, '')), unit: m[2] === 'ppm' ? 'ppm' : 'mg/m3', ...(m[3] ? { as: m[3] } : {}), ca, source: SHORT[i.source], url: i.url };
}

const ROUTES = { oral: 'oral', dermal: 'dermal', skin: 'dermal', percutaneous: 'dermal', inhalation: 'inhalation', ip: 'ip', intraperitoneal: 'ip', iv: 'iv', intravenous: 'iv', sc: 'sc', subcutaneous: 'sc' };

/** LD50 and LC50 lines from HSDB's non-human toxicity values: "LD50 Rat oral 440 mg/kg". */
function lethal(record) {
  const out = [];
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
function harmonised(record) {
  const h = items(record, 'GHS Classification').filter((i) => i.source === EU && i.name === 'GHS Hazard Statements');
  const codes = new Set();
  for (const i of h) for (const m of i.text.matchAll(/\b(EUH\d{3}|H\d{3}(?:[A-Za-z]{1,2})?(?:\+H\d{3})*)\b/g)) codes.add(m[1]);
  const classes = items(record, 'Hazard Classes and Categories').filter((i) => i.source === EU).map((i) => i.text)[0] ?? '';
  return codes.size || classes ? { codes: [...codes], classes: classes.replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim() } : null;
}

function alerts(record) {
  const out = new Set();
  for (const i of items(record, 'Reactivity Alerts')) if (SHORT[i.source] === 'CAMEO') for (const a of i.text.split(/[,;]\s*/)) if (a.trim()) out.add(a.trim());
  return [...out];
}

function cas(record) {
  const n = new Map();
  for (const i of items(record, 'CAS')) for (const m of i.text.matchAll(/\b\d{2,7}-\d{2}-\d\b/g)) n.set(m[0], (n.get(m[0]) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function nioshUrl(record) {
  const r = (record.Reference ?? []).find((x) => SHORT[x.SourceName] === 'NIOSH' && /npg/.test(x.URL ?? ''));
  return r?.URL ?? null;
}

async function main() {
  const list = readList();
  const out = [];
  for (const [n, c] of list.entries()) {
    let cid = null;
    if (/^CID:\d+$/.test(c.ask)) cid = Number(c.ask.slice(4));
    else {
      const j = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(c.ask)}/cids/JSON`, `cid-${c.ask.replace(/[^a-z0-9]+/gi, '_')}.json`);
      cid = j?.IdentifierList?.CID?.[0] ?? null;
    }
    if (!cid) { console.warn(`! ${c.name}: not found on PubChem`); continue; }
    const props = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,SMILES/JSON`, `prop-${cid}.json`);
    const p = props?.PropertyTable?.Properties?.[0] ?? {};
    // PubChem's computed XLogP3 (public domain): the fallback for log Kow in the skin estimate
    const xl = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/XLogP/JSON`, `xlogp-${cid}.json`);
    const xlogp = xl?.PropertyTable?.Properties?.[0]?.XLogP;
    const view = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON`, `view-${cid}.json`);
    const rec = view?.Record ?? {};
    const at25 = (i) => /25 ?°C|77 ?°F/.test(i.text);
    // a vapour pressure near room temperature, or one that names no temperature
    const roomTemp = (i) => {
      if (/room temp/i.test(i.text)) return true;
      const c = [...i.text.matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*C/g)].map((m) => Number(m[1]));
      const f = [...i.text.matchAll(/(-?\d+(?:\.\d+)?)\s*°\s*F/g)].map((m) => Number(m[1]));
      const k = [...i.text.matchAll(/(\d+(?:\.\d+)?)\s*K\b/g)].map((m) => Number(m[1]));
      if (!c.length && !f.length && !k.length) return true;
      return c.some((t) => t >= 15 && t <= 30) || f.some((t) => t >= 59 && t <= 86) || k.some((t) => t >= 288 && t <= 303);
    };
    out.push({
      name: c.name,
      cid,
      cas: c.cas ?? cas(rec),
      formula: p.MolecularFormula ?? null,
      mw: p.MolecularWeight ? Number(p.MolecularWeight) : null,
      smiles: p.SMILES ?? null,
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
      xlogp: typeof xlogp === 'number' ? xlogp : null,
      logKow: pick(rec, 'LogP', (i) => /log Kow/i.test(i.text), (i) => /-?\d/.test(i.text)),
      pka: pickAll(rec, 'Dissociation Constants', (i) => /pK|\d/.test(i.text)),
      water: pick(rec, 'Solubility', (i) => /^in water|water.*(at|°C)/i.test(i.text), (i) => /water/i.test(i.text)),
      organic: pick(rec, 'Solubility', (i) => /miscible with|soluble in/i.test(i.text), (i) => !/water/i.test(i.text) && /miscible|soluble/i.test(i.text)),
      viscosity: pick(rec, 'Viscosity', (i) => /2[05] ?°C/.test(i.text), (i) => /Pa|cP|poise/i.test(i.text)),
      refractive: pick(rec, 'Refractive Index', (i) => /20 ?°C/.test(i.text), (i) => /\d\.\d/.test(i.text)),
    });
    process.stdout.write(`\r${n + 1}/${list.length} ${c.name.padEnd(50)}`);
  }
  process.stdout.write('\n');
  const file = join(root, 'src', 'kb', 'safety-data.json');
  writeFileSync(file, JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    note: 'Built by scripts/kb/build-safety.mjs from PubChem records of HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC and EU Regulation 1272/2008 Annex VI. US government data is public domain; EU legislation may be reused with acknowledgement.',
    compounds: out,
  }, null, 0).replace(/\},\{"name"/g, '},\n{"name"') + '\n');
  console.log(`Wrote ${out.length} compounds to ${file}`);
}

await main();
